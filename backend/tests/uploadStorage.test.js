const assert = require("node:assert/strict");
const test = require("node:test");
const { Readable } = require("node:stream");
const request = require("supertest");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
process.env.API_URL = process.env.API_URL || "http://localhost:5000";
process.env.GCS_MEDIA_BUCKET = process.env.GCS_MEDIA_BUCKET || "test-bucket";

const app = require("../src/app");
const prisma = require("../src/config/db");
const authService = require("../src/modules/auth/auth.service");
const storageService = require("../src/modules/storage/storage.service");

const ORIGIN = "http://localhost:5173";
const unique = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const created = { userUuids: [], emails: [] };

const createUser = async ({ role = "USER" } = {}) => {
  const email = `${unique("upload-user")}@example.com`;
  const password = "TestPassword123";
  const { user } = await authService.register({ email, password, name: "Upload User" });
  if (role === "ADMIN") await prisma.user.update({ where: { uuid: user.uuid }, data: { role: "ADMIN" } });
  const res = await request(app).post("/api/auth/login").set("Origin", ORIGIN).send({ email, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  created.userUuids.push(user.uuid);
  created.emails.push(email);
  return { cookie: res.headers["set-cookie"] };
};

const provider = ({ failUpload = false } = {}) => ({
  uploads: [],
  async upload({ kind, file }) {
    this.uploads.push({ kind, file });
    if (failUpload) throw new Error("provider unavailable");
    return { url: `https://api.example.com/api/media/${kind}-token`, publicId: `${kind}/object.png` };
  },
  async delete(publicId) { return { deleted: publicId === "ok" }; },
  async readByToken(token) {
    if (token === "missing") {
      const err = new Error("Media not found");
      err.statusCode = 404;
      throw err;
    }
    return {
      contentType: "image/png",
      cacheControl: "public, max-age=60",
      stream: Readable.from(["png-body"]),
    };
  },
});

test.beforeEach(async () => {
  await prisma.loginThrottle.deleteMany({ where: { key: { startsWith: "ip:" } } });
});

test.after(async () => {
  storageService.setStorageProviderForTest(new storageService.GCSStorage({ bucketName: "test-bucket", apiUrl: "http://localhost:5000" }));
  await prisma.loginThrottle.deleteMany({ where: { key: { startsWith: "ip:" } } });
  for (const uuid of created.userUuids) {
    const user = await prisma.user.findUnique({ where: { uuid }, select: { id: true } });
    if (!user) continue;
    await prisma.profile.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
  for (const email of created.emails) {
    await prisma.loginThrottle.deleteMany({ where: { key: `email:${email}` } }).catch(() => {});
  }
  await prisma.$disconnect();
});

test("admin article uploads preserve response shape through the storage abstraction", async () => {
  const admin = await createUser({ role: "ADMIN" });
  const mock = provider();
  storageService.setStorageProviderForTest(mock);

  const res = await request(app)
    .post("/api/upload/inline")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .attach("image", Buffer.from("GIF89a"), { filename: "demo.gif", contentType: "image/gif" });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(Object.keys(res.body.data).sort(), ["publicId", "url"]);
  assert.equal(res.body.data.url, "https://api.example.com/api/media/inline-token");
  assert.equal(mock.uploads[0].kind, "inline");
  assert.equal(mock.uploads[0].file.mimetype, "image/gif");
});

test("upload routes preserve auth boundaries", async () => {
  const user = await createUser({ role: "USER" });
  storageService.setStorageProviderForTest(provider());

  const anonymous = await request(app)
    .post("/api/upload/avatar")
    .set("Origin", ORIGIN)
    .attach("image", Buffer.from("png"), { filename: "avatar.png", contentType: "image/png" });
  assert.equal(anonymous.status, 401);

  const nonAdmin = await request(app)
    .post("/api/upload/cover")
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .attach("image", Buffer.from("png"), { filename: "cover.png", contentType: "image/png" });
  assert.equal(nonAdmin.status, 403);
});

test("invalid MIME types and extensions are rejected before provider upload", async () => {
  const admin = await createUser({ role: "ADMIN" });
  const mock = provider();
  storageService.setStorageProviderForTest(mock);

  const badMime = await request(app)
    .post("/api/upload/inline")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .attach("image", Buffer.from("<svg/>"), { filename: "x.svg", contentType: "image/svg+xml" });
  assert.equal(badMime.status, 400);

  const coverGif = await request(app)
    .post("/api/upload/cover")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .attach("image", Buffer.from("GIF89a"), { filename: "cover.gif", contentType: "image/gif" });
  assert.equal(coverGif.status, 400);
  assert.equal(mock.uploads.length, 0);
});

test("upload size limits are enforced", async () => {
  const user = await createUser({ role: "USER" });
  storageService.setStorageProviderForTest(provider());
  const tooLarge = Buffer.alloc(2 * 1024 * 1024 + 1, 1);

  const res = await request(app)
    .post("/api/upload/avatar")
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .attach("image", tooLarge, { filename: "avatar.png", contentType: "image/png" });

  assert.equal(res.status, 413);
});

test("provider upload errors surface as safe server errors", async () => {
  const admin = await createUser({ role: "ADMIN" });
  storageService.setStorageProviderForTest(provider({ failUpload: true }));

  const res = await request(app)
    .post("/api/upload/inline")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .attach("image", Buffer.from("png"), { filename: "inline.png", contentType: "image/png" });

  assert.equal(res.status, 500);
  assert.equal(res.body.message, "Internal server error");
});

test("media route streams private bucket objects with browser-safe headers", async () => {
  storageService.setStorageProviderForTest(provider());

  const res = await request(app).get("/api/media/validToken");

  assert.equal(res.status, 200);
  assert.equal(Buffer.from(res.body).toString(), "png-body");
  assert.match(res.headers["content-type"], /^image\/png/);
  assert.equal(res.headers["cross-origin-resource-policy"], "cross-origin");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
});
