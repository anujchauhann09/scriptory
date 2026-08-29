const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { GCSStorage, decodeObjectToken } = require("../src/modules/storage/storage.service");

const image = (overrides = {}) => ({
  originalname: "My Unsafe ../demo file.gif",
  mimetype: "image/gif",
  buffer: Buffer.from("gif-data"),
  ...overrides,
});

const fakeStorage = ({ failSave = false } = {}) => {
  const calls = { save: [], delete: [], fileNames: [] };
  const files = new Map();
  const storage = {
    bucket(name) {
      return {
        name,
        file(objectName) {
          calls.fileNames.push(objectName);
          if (!files.has(objectName)) {
            files.set(objectName, {
              async save(buffer, options) {
                calls.save.push({ objectName, buffer, options });
                if (failSave) throw new Error("gcs write failed");
              },
              async delete(options) {
                calls.delete.push({ objectName, options });
              },
              async exists() { return [true]; },
              async getMetadata() { return [{ contentType: "image/gif", cacheControl: "public, max-age=60" }]; },
              createReadStream() { return Readable.from(["media-body"]); },
            });
          }
          return files.get(objectName);
        },
      };
    },
  };
  return { storage, calls };
};

test("GCS upload creates collision-resistant names and API media URLs", async () => {
  const { storage, calls } = fakeStorage();
  const gcs = new GCSStorage({ bucketName: "scriptory-media-506807", apiUrl: "https://api.example.com", storage });

  const uploaded = await gcs.upload({ kind: "inline", file: image() });

  assert.equal(uploaded.provider, "gcs");
  assert.equal(uploaded.bucket, "scriptory-media-506807");
  assert.match(uploaded.publicId, /^gifs\/inline\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]+\.gif$/);
  assert.equal(decodeObjectToken(uploaded.url.split("/").pop()), uploaded.publicId);
  assert.equal(calls.save[0].options.metadata.contentType, "image/gif");
  assert.equal(calls.save[0].options.metadata.cacheControl, "public, max-age=31536000, immutable");
  assert.equal(calls.save[0].options.metadata.metadata.originalName, "demo-file.gif");
});

test("GCS read and delete use only validated object names", async () => {
  const { storage, calls } = fakeStorage();
  const gcs = new GCSStorage({ bucketName: "bucket", apiUrl: "https://api.example.com", storage });
  const uploaded = await gcs.upload({ kind: "cover", file: image({ originalname: "cover.png", mimetype: "image/png" }) });
  const token = uploaded.url.split("/").pop();

  const media = await gcs.readByToken(token);
  assert.equal(media.contentType, "image/gif");
  assert.equal(await new Promise((resolve) => {
    let body = "";
    media.stream.on("data", (chunk) => { body += chunk; });
    media.stream.on("end", () => resolve(body));
  }), "media-body");

  await gcs.delete(uploaded.publicId);
  assert.equal(calls.delete.at(-1).objectName, uploaded.publicId);
  assert.throws(() => decodeObjectToken(Buffer.from("../secret").toString("base64url")), /Invalid media object/);
});

test("GCS video uploads use the videos namespace and MP4 metadata", async () => {
  const { storage, calls } = fakeStorage();
  const gcs = new GCSStorage({ bucketName: "bucket", apiUrl: "https://api.example.com", storage });

  const uploaded = await gcs.upload({
    kind: "video",
    file: image({ originalname: "demo clip.mp4", mimetype: "video/mp4", buffer: Buffer.from("mp4-data") }),
  });

  assert.match(uploaded.publicId, /^videos\/articles\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]+\.mp4$/);
  assert.equal(calls.save[0].options.metadata.contentType, "video/mp4");
  assert.equal(calls.save[0].options.metadata.metadata.originalName, "demo-clip.mp4");
});

test("GCS upload cleans up a partial object when save fails", async () => {
  const { storage, calls } = fakeStorage({ failSave: true });
  const gcs = new GCSStorage({ bucketName: "bucket", apiUrl: "https://api.example.com", storage });

  await assert.rejects(() => gcs.upload({ kind: "inline", file: image() }), /gcs write failed/);
  assert.equal(calls.delete.length, 1);
  assert.equal(calls.delete[0].options.ignoreNotFound, true);
});
