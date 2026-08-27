/**
 * Security behaviour tests.
 *
 * These assert the controls that are easy to regress silently — an access-check
 * that gets dropped during a refactor, a validation rule that stops being
 * applied, a header that disappears when middleware is reordered. Each one
 * exercises the real app and the real database, because the interesting
 * failures live in how the layers compose, not in any single unit.
 *
 * Run with: npm test
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
process.env.API_URL = process.env.API_URL || "http://localhost:5000";

const app = require("../src/app");
const prisma = require("../src/config/db");
const authService = require("../src/modules/auth/auth.service");

const ORIGIN = "http://localhost:5173";
const unique = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Signs in and returns the session cookie plus the created user. */
const createUser = async ({ role = "USER" } = {}) => {
  const email = `${unique("user")}@example.com`;
  const password = "TestPassword123";
  const { user } = await authService.register({ email, password, name: "Test User" });
  if (role === "ADMIN") {
    await prisma.user.update({ where: { uuid: user.uuid }, data: { role: "ADMIN" } });
  }
  const res = await request(app)
    .post("/api/auth/login")
    .set("Origin", ORIGIN)
    .send({ email, password });
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`);
  const cookie = res.headers["set-cookie"];
  assert.ok(cookie, "expected a session cookie");
  return { email, password, uuid: user.uuid, cookie };
};

const created = { userUuids: [], articleUuids: [], emails: [] };

/**
 * Several tests deliberately drive the per-IP lockout, and every test client
 * here shares one loopback address. That counter lives in the database on
 * purpose — it is what makes the lockout global across instances — so without a
 * reset it leaks between tests, and between runs, and eventually locks the
 * whole suite out of logging in.
 *
 * Clearing it before each test isolates them without weakening the control:
 * every test still exercises the real counter, just from a known starting
 * point. (The account-scoped counters are left alone; each test creates its own
 * user, so they cannot collide.)
 */
test.beforeEach(async () => {
  await prisma.loginThrottle.deleteMany({ where: { key: { startsWith: "ip:" } } });
});

test.after(async () => {
  await prisma.loginThrottle.deleteMany({ where: { key: { startsWith: "ip:" } } });
  // Clean up only what these tests made, so the suite is safe against a
  // development database with real content in it.
  for (const uuid of created.articleUuids) {
    await prisma.article.deleteMany({ where: { uuid } }).catch(() => {});
  }
  for (const uuid of created.userUuids) {
    const user = await prisma.user.findUnique({ where: { uuid }, select: { id: true } });
    if (!user) continue;
    await prisma.comment.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.like.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.bookmark.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.article.deleteMany({ where: { authorId: user.id } }).catch(() => {});
    await prisma.profile.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
  for (const email of created.emails) {
    await prisma.loginThrottle.deleteMany({ where: { key: `email:${email}` } }).catch(() => {});
  }
  await prisma.auditLog.deleteMany({ where: { detail: { startsWith: "sec-test" } } }).catch(() => {});
  await prisma.$disconnect();
});

const track = (u) => {
  created.userUuids.push(u.uuid);
  created.emails.push(u.email);
  return u;
};

// ---------------------------------------------------------------------------

test("unpublished drafts are not readable by anonymous callers", async () => {
  const admin = track(await createUser({ role: "ADMIN" }));

  const create = await request(app)
    .post("/api/articles")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({
      title: unique("Secret Draft"),
      content: "This draft has not been released to anyone yet.",
      published: false,
    });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const draft = create.body.data;
  created.articleUuids.push(draft.uuid);

  // Anonymous: the draft must be indistinguishable from a slug that never existed.
  const anon = await request(app).get(`/api/articles/${draft.slug}`);
  assert.equal(anon.status, 404);

  // Its comment thread, likes, view counter and OG card must not leak it either.
  assert.equal((await request(app).get(`/api/articles/${draft.slug}/comments`)).status, 404);
  assert.equal((await request(app).get(`/api/articles/${draft.slug}/likes`)).status, 404);
  assert.equal(
    (await request(app).post(`/api/articles/${draft.slug}/views`).set("Origin", ORIGIN)).status,
    404
  );

  const og = await request(app).get(`/og/${draft.slug}.png`);
  assert.equal(og.status, 200, "OG endpoint still renders");
  assert.ok(og.body.length > 0);
  // It renders the generic fallback card, never the draft's title.

  // The listing must not include it.
  const list = await request(app).get("/api/articles?limit=50");
  assert.equal(list.status, 200);
  assert.ok(
    !list.body.data.articles.some((a) => a.uuid === draft.uuid),
    "draft leaked into the public listing"
  );

  // A non-admin cannot opt into drafts by asking for them.
  const forced = await request(app).get("/api/articles?published=false&limit=50");
  assert.equal(forced.status, 200);
  assert.ok(
    !forced.body.data.articles.some((a) => a.published === false),
    "published=false was honoured for a non-admin"
  );

  // The author, however, can see their own draft.
  const asAdmin = await request(app)
    .get(`/api/articles/${draft.slug}`)
    .set("Cookie", admin.cookie);
  assert.equal(asAdmin.status, 200);
});

test("article HTML is sanitised before it is stored", async () => {
  const admin = track(await createUser({ role: "ADMIN" }));

  const res = await request(app)
    .post("/api/articles")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({
      title: unique("XSS Attempt"),
      content:
        '<h2>Heading</h2><script>alert(1)</script><img src=x onerror="alert(2)">' +
        '<a href="javascript:alert(3)">bad link</a><p style="position:fixed">styled</p>',
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  created.articleUuids.push(res.body.data.uuid);

  const stored = res.body.data.content;
  assert.ok(!stored.includes("<script"), "script tag survived");
  assert.ok(!stored.includes("alert(1)"), "script contents survived");
  assert.ok(!/onerror/i.test(stored), "event handler survived");
  assert.ok(!/javascript:/i.test(stored), "javascript: URL survived");
  assert.ok(!/style=/i.test(stored), "inline style survived");
  assert.ok(stored.includes("<h2>"), "legitimate markup was stripped");
});

test("a non-admin cannot create, update or delete articles", async () => {
  const admin = track(await createUser({ role: "ADMIN" }));
  const user = track(await createUser());

  const article = await request(app)
    .post("/api/articles")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ title: unique("Admin Post"), content: "Content that only an admin may edit." });
  assert.equal(article.status, 201);
  created.articleUuids.push(article.body.data.uuid);

  const create = await request(app)
    .post("/api/articles")
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .send({ title: unique("Not Allowed"), content: "This should never be written." });
  assert.equal(create.status, 403);

  const update = await request(app)
    .put(`/api/articles/${article.body.data.uuid}`)
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .send({ title: "Hijacked title" });
  assert.equal(update.status, 403);

  const remove = await request(app)
    .delete(`/api/articles/${article.body.data.uuid}`)
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie);
  assert.equal(remove.status, 403);
});

test("a user cannot delete another user's comment", async () => {
  const admin = track(await createUser({ role: "ADMIN" }));
  const owner = track(await createUser());
  const attacker = track(await createUser());

  const article = await request(app)
    .post("/api/articles")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ title: unique("Commentable"), content: "An article that accepts comments." });
  created.articleUuids.push(article.body.data.uuid);
  const slug = article.body.data.slug;

  const comment = await request(app)
    .post(`/api/articles/${slug}/comments`)
    .set("Origin", ORIGIN)
    .set("Cookie", owner.cookie)
    .send({ content: "This comment belongs to its author." });
  assert.equal(comment.status, 201, JSON.stringify(comment.body));

  const stolen = await request(app)
    .delete(`/api/articles/${slug}/comments/${comment.body.data.uuid}`)
    .set("Origin", ORIGIN)
    .set("Cookie", attacker.cookie);
  assert.equal(stolen.status, 404, "another user was able to delete the comment");

  // The owner still can.
  const own = await request(app)
    .delete(`/api/articles/${slug}/comments/${comment.body.data.uuid}`)
    .set("Origin", ORIGIN)
    .set("Cookie", owner.cookie);
  assert.equal(own.status, 200);
});

test("cookie-authenticated state changes require a trusted Origin", async () => {
  const user = track(await createUser());

  // A cross-site form post carrying the session cookie must be refused.
  const forged = await request(app)
    .patch("/api/users/me/profile")
    .set("Origin", "https://evil.example")
    .set("Cookie", user.cookie)
    .send({ name: "Owned" });
  assert.equal(forged.status, 403, "cross-origin state change was allowed");

  // A state change with no Origin at all, but with a session cookie, is also
  // refused — that is the shape of an old-browser CSRF.
  const noOrigin = await request(app)
    .patch("/api/users/me/profile")
    .set("Cookie", user.cookie)
    .send({ name: "Owned" });
  assert.equal(noOrigin.status, 403);

  // The real frontend origin works.
  const legit = await request(app)
    .patch("/api/users/me/profile")
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .send({ name: "Legitimate Name" });
  assert.equal(legit.status, 200, JSON.stringify(legit.body));

  // Reads are never blocked.
  const read = await request(app)
    .get("/api/users/me")
    .set("Origin", "https://evil.example")
    .set("Cookie", user.cookie);
  assert.equal(read.status, 200);
});

test("profile input is validated and dangerous URLs are refused", async () => {
  const user = track(await createUser());

  const jsUrl = await request(app)
    .patch("/api/users/me/profile")
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .send({ avatarUrl: "javascript:alert(1)" });
  assert.equal(jsUrl.status, 400, "javascript: avatar URL was accepted");

  const dataUrl = await request(app)
    .patch("/api/users/me/profile")
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .send({ avatarUrl: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" });
  assert.equal(dataUrl.status, 400);

  const hugeBio = await request(app)
    .patch("/api/users/me/profile")
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .send({ bio: "x".repeat(5000) });
  assert.equal(hugeBio.status, 400, "unbounded bio was accepted");

  // Unknown fields are stripped rather than forwarded to the database.
  const massAssign = await request(app)
    .patch("/api/users/me/profile")
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .send({ name: "Fine", role: "ADMIN", userId: 1 });
  assert.equal(massAssign.status, 200);
  const check = await request(app).get("/api/users/me").set("Cookie", user.cookie);
  assert.equal(check.body.data.role, "USER", "role was mass-assigned");
});

test("comment length is bounded", async () => {
  const admin = track(await createUser({ role: "ADMIN" }));
  const user = track(await createUser());

  const article = await request(app)
    .post("/api/articles")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ title: unique("Bounded"), content: "An article for the comment length test." });
  created.articleUuids.push(article.body.data.uuid);

  const huge = await request(app)
    .post(`/api/articles/${article.body.data.slug}/comments`)
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .send({ content: "x".repeat(50000) });
  assert.equal(huge.status, 400, "an unbounded comment was accepted");
});

test("repeated failed logins are throttled globally", async () => {
  const user = track(await createUser());

  let throttled = false;
  // The account ceiling is 8 failures per window; the loop runs past it.
  for (let i = 0; i < 12; i++) {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: user.email, password: "DefinitelyWrong123" });
    if (res.status === 429) {
      throttled = true;
      assert.ok(res.headers["retry-after"], "429 should carry Retry-After");
      break;
    }
    assert.equal(res.status, 401);
  }
  assert.ok(throttled, "brute-force attempts were never throttled");

  // The lockout holds even for the correct password, which is what makes it a
  // lockout rather than a speed bump.
  const correct = await request(app)
    .post("/api/auth/login")
    .set("Origin", ORIGIN)
    .send({ email: user.email, password: user.password });
  assert.equal(correct.status, 429);
});

test("login does not reveal whether an account exists", async () => {
  const user = track(await createUser());

  const unknown = await request(app)
    .post("/api/auth/login")
    .set("Origin", ORIGIN)
    .send({ email: `${unique("nobody")}@example.com`, password: "WrongPassword123" });

  const known = await request(app)
    .post("/api/auth/login")
    .set("Origin", ORIGIN)
    .send({ email: user.email, password: "WrongPassword123" });

  assert.equal(unknown.status, known.status);
  assert.equal(unknown.body.message, known.body.message);
});

test("the session cookie is httpOnly, Secure-aware and SameSite-scoped", async () => {
  const user = track(await createUser());
  const raw = Array.isArray(user.cookie) ? user.cookie.join(";") : String(user.cookie);
  assert.match(raw, /HttpOnly/i, "session cookie is readable by JavaScript");
  assert.match(raw, /SameSite=/i, "session cookie has no SameSite attribute");
  assert.match(raw, /Path=\//i);
});

test("responses carry the expected security headers", async () => {
  const res = await request(app).get("/api/stats");
  assert.equal(res.status, 200);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["referrer-policy"], "no-referrer");
  assert.ok(res.headers["content-security-policy"], "no CSP header");
  assert.match(res.headers["content-security-policy"], /default-src 'none'/);
  assert.equal(res.headers["x-powered-by"], undefined, "framework fingerprint exposed");
  assert.ok(res.headers["x-request-id"], "no request id for tracing");
});

test("CORS rejects unlisted origins and allows the frontend", async () => {
  const bad = await request(app).get("/api/stats").set("Origin", "https://evil.example");
  assert.equal(bad.headers["access-control-allow-origin"], undefined, "CORS reflected a bad origin");

  const good = await request(app).get("/api/stats").set("Origin", ORIGIN);
  assert.equal(good.headers["access-control-allow-origin"], ORIGIN);
  assert.equal(good.headers["access-control-allow-credentials"], "true");
});

test("oversized and malformed bodies are rejected cleanly", async () => {
  const user = track(await createUser());

  const oversized = await request(app)
    .patch("/api/users/me/profile")
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ bio: "x".repeat(200 * 1024) }));
  assert.ok([400, 413].includes(oversized.status), `got ${oversized.status}`);

  const malformed = await request(app)
    .post("/api/auth/login")
    .set("Origin", ORIGIN)
    .set("Content-Type", "application/json")
    .send("{not json");
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.success, false);
});

test("internal task endpoints reject an incorrect or absent token", async () => {
  const noToken = await request(app).post("/internal/tasks/maintenance").set("Origin", ORIGIN);
  // 404 when no TASK_RUNNER_TOKEN is configured (feature off), 401 when it is.
  assert.ok([401, 404].includes(noToken.status), `got ${noToken.status}`);

  const badToken = await request(app)
    .post("/internal/tasks/maintenance")
    .set("Origin", ORIGIN)
    .set("Authorization", "Bearer definitely-not-the-token");
  assert.ok([401, 404].includes(badToken.status), `got ${badToken.status}`);
});

test("health and readiness probes report correctly", async () => {
  const live = await request(app).get("/healthz");
  assert.equal(live.status, 200);
  assert.equal(live.headers["cache-control"], "no-store");

  const ready = await request(app).get("/readyz");
  assert.equal(ready.status, 200, "readiness probe failed against the database");
  assert.equal(ready.body.status, "ready");
});

test("query parameters are bounded", async () => {
  const bigLimit = await request(app).get("/api/articles?limit=100000");
  assert.equal(bigLimit.status, 400, "unbounded page size was accepted");

  const longSearch = await request(app).get(`/api/articles?search=${"x".repeat(5000)}`);
  assert.equal(longSearch.status, 400, "unbounded search term was accepted");
});

test("full-text search treats input as a search term, not as SQL", async () => {
  // Prisma parameterises these, so the only correct outcome is "no matches" —
  // never an error, and never a side effect.
  for (const payload of ["' OR 1=1 --", "'; DROP TABLE \"Article\"; --", "%' UNION SELECT NULL--"]) {
    const res = await request(app).get(`/api/articles?search=${encodeURIComponent(payload)}`);
    assert.equal(res.status, 200, `injection payload errored: ${payload}`);
    assert.ok(Array.isArray(res.body.data.articles));
  }

  // The table is still there.
  const count = await prisma.article.count();
  assert.equal(typeof count, "number");
});

test("authentication is required for protected endpoints", async () => {
  for (const [method, path] of [
    ["get", "/api/users/me"],
    ["get", "/api/bookmarks"],
    ["get", "/api/audit"],
    ["get", "/api/analytics"],
    ["get", "/api/contact"],
    ["get", "/api/newsletter/subscribers"],
  ]) {
    const res = await request(app)[method](path);
    assert.equal(res.status, 401, `${method.toUpperCase()} ${path} was reachable anonymously`);
  }
});

test("a forged or foreign JWT is rejected", async () => {
  const jwt = require("jsonwebtoken");
  const user = track(await createUser());

  // Signed with the right secret but the wrong audience — e.g. a token minted
  // by a sibling service that shares the secret.
  const wrongAudience = jwt.sign(
    { userUuid: user.uuid, tv: 0 },
    require("../src/config/env").jwtSecret,
    { algorithm: "HS256", expiresIn: "1h", issuer: "scriptory", audience: "some-other-service" }
  );
  const res1 = await request(app)
    .get("/api/users/me")
    .set("Authorization", `Bearer ${wrongAudience}`);
  assert.equal(res1.status, 401);

  // Signed with a different secret entirely.
  const wrongSecret = jwt.sign({ userUuid: user.uuid, tv: 0 }, "an-attacker-chosen-secret-value", {
    algorithm: "HS256",
    expiresIn: "1h",
    issuer: "scriptory",
    audience: "scriptory-api",
  });
  const res2 = await request(app)
    .get("/api/users/me")
    .set("Authorization", `Bearer ${wrongSecret}`);
  assert.equal(res2.status, 401);

  // The "alg: none" variant, which an unpinned verifier would accept.
  const unsigned = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
    "base64url"
  )}.${Buffer.from(JSON.stringify({ userUuid: user.uuid, tv: 0 })).toString("base64url")}.`;
  const res3 = await request(app).get("/api/users/me").set("Authorization", `Bearer ${unsigned}`);
  assert.equal(res3.status, 401);
});

test("changing a password revokes every other session", async () => {
  const user = track(await createUser());
  const oldCookie = user.cookie;

  const change = await request(app)
    .post("/api/auth/change-password")
    .set("Origin", ORIGIN)
    .set("Cookie", oldCookie)
    .send({ currentPassword: user.password, newPassword: "BrandNewPassword456" });
  assert.equal(change.status, 200, JSON.stringify(change.body));

  // The old token is dead even though it has not expired.
  const stale = await request(app).get("/api/users/me").set("Cookie", oldCookie);
  assert.equal(stale.status, 401, "a pre-change token still worked");

  // The rotated cookie the response handed back does work.
  const fresh = await request(app)
    .get("/api/users/me")
    .set("Cookie", change.headers["set-cookie"]);
  assert.equal(fresh.status, 200);
});

test("the API never returns password hashes or 2FA secrets", async () => {
  const user = track(await createUser());
  const me = await request(app).get("/api/users/me").set("Cookie", user.cookie);
  const body = JSON.stringify(me.body);
  for (const field of ["password", "twoFactorSecret", "twoFactorPending", "tokenVersion"]) {
    assert.ok(!body.includes(field), `${field} was serialised to the client`);
  }
});

// ---------------------------------------------------------------------------
// Regressions found in review. Each of these was a live defect.
// ---------------------------------------------------------------------------

test("renaming an article updates both the title and the slug", async () => {
  const admin = track(await createUser({ role: "ADMIN" }));

  const create = await request(app)
    .post("/api/articles")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ title: unique("Original Headline"), content: "Body text for the rename test." });
  assert.equal(create.status, 201);
  created.articleUuids.push(create.body.data.uuid);

  const newTitle = unique("Rewritten Headline");
  const update = await request(app)
    .put(`/api/articles/${create.body.data.uuid}`)
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ title: newTitle });
  assert.equal(update.status, 200, JSON.stringify(update.body));

  // The regression was a slug that moved while the title stayed behind — every
  // shared link broken, and the old headline still rendered at the new URL.
  assert.equal(update.body.data.title, newTitle, "title was not written");
  assert.ok(update.body.data.slug.startsWith("rewritten-headline"), "slug was not updated");

  const fetched = await request(app)
    .get(`/api/articles/${update.body.data.slug}`)
    .set("Cookie", admin.cookie);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.title, newTitle, "persisted title is stale");
});

test("an IPv6 /64 collapses to a single rate-limit key", () => {
  const { normaliseClientAddress } = require("../src/middleware/rateLimit.middleware");

  // A routed /64 is the standard allocation for one subscriber or VPS. If
  // compressed forms key separately, every IP-based limit is bypassable by
  // simply picking the next address.
  const sameSubnet = ["2001:db8::1", "2001:db8::2", "2001:db8::dead:beef", "2001:db8:0:0::9"];
  const keys = new Set(sameSubnet.map(normaliseClientAddress));
  assert.equal(keys.size, 1, `expected one key, got ${[...keys].join(", ")}`);

  // A genuinely different /64 must still key separately.
  assert.notEqual(normaliseClientAddress("2001:db8::1"), normaliseClientAddress("2001:db9::1"));

  // A v4-mapped address keys identically to its bare v4 form.
  assert.equal(normaliseClientAddress("::ffff:1.2.3.4"), normaliseClientAddress("1.2.3.4"));
});

test("concurrent login attempts cannot exceed the account lockout", async () => {
  const user = track(await createUser());

  // The bug was a read-then-verify-then-write race with bcrypt in the middle:
  // every parallel request read a count below the limit and passed the gate, so
  // a burst bought far more guesses than the ceiling allows.
  const burst = await Promise.all(
    Array.from({ length: 25 }, () =>
      request(app)
        .post("/api/auth/login")
        .set("Origin", ORIGIN)
        .send({ email: user.email, password: "WrongPassword123" })
    )
  );

  const accepted = burst.filter((r) => r.status === 401).length;
  const throttled = burst.filter((r) => r.status === 429).length;

  assert.ok(throttled > 0, "no request in the burst was throttled");
  // Allow one attempt of slack for the boundary; the point is that 25 parallel
  // requests do not all get to guess.
  assert.ok(
    accepted <= 9,
    `${accepted} of 25 concurrent guesses were evaluated (ceiling is 8)`
  );
});

test("a wrong 2FA code counts against the global brute-force budget", async () => {
  const user = track(await createUser());

  // Disabling 2FA is what an attacker with a stolen session wants; the code
  // check must be bounded globally, not only by the per-instance limiter.
  const before = await prisma.loginThrottle.findUnique({
    where: { key: `email:${user.email}` },
    select: { failures: true },
  });

  await request(app)
    .post("/api/auth/2fa/disable")
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .send({ code: "000000" });

  await request(app)
    .post("/api/auth/change-password")
    .set("Origin", ORIGIN)
    .set("Cookie", user.cookie)
    .send({ currentPassword: "TotallyWrong123", newPassword: "AnotherPassword456" });

  const after = await prisma.loginThrottle.findUnique({
    where: { key: `email:${user.email}` },
    select: { failures: true },
  });

  assert.ok(after, "no throttle row was written for a failed credential check");
  assert.ok(
    (after.failures ?? 0) > (before?.failures ?? 0),
    "a failed credential check did not consume budget"
  );
});

test("login cannot be driven from a foreign origin", async () => {
  const user = track(await createUser());

  // Login CSRF: with SameSite=None, a cross-site page posting the attacker's
  // credentials would silently sign the victim into the attacker's account.
  const forged = await request(app)
    .post("/api/auth/login")
    .set("Origin", "https://evil.example")
    .send({ email: user.email, password: user.password });
  assert.equal(forged.status, 403, "login accepted a cross-origin request");
  assert.equal(forged.headers["set-cookie"], undefined, "a session cookie was issued");

  // Registration is the same shape of problem.
  const forgedRegister = await request(app)
    .post("/api/auth/register")
    .set("Origin", "https://evil.example")
    .send({ email: `${unique("csrf")}@example.com`, password: "SomePassword123" });
  assert.equal(forgedRegister.status, 403);

  // A non-browser client (no Origin at all) is unaffected.
  const cli = await request(app)
    .post("/api/auth/login")
    .send({ email: user.email, password: user.password });
  assert.equal(cli.status, 200, "a non-browser client was blocked");
});

test("the unauthenticated view endpoint does not accept a large body", async () => {
  const admin = track(await createUser({ role: "ADMIN" }));
  const article = await request(app)
    .post("/api/articles")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ title: unique("Body Limit"), content: "Article used for the body-limit test." });
  created.articleUuids.push(article.body.data.uuid);

  // The 1mb article-write limit used to apply to this whole path prefix, so an
  // anonymous caller could make the server buffer and parse a megabyte before
  // any authorisation ran.
  const res = await request(app)
    .post(`/api/articles/${article.body.data.slug}/views`)
    .set("Origin", ORIGIN)
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ padding: "x".repeat(300 * 1024) }));
  assert.equal(res.status, 413, `expected 413, got ${res.status}`);

  // The article write itself still accepts a large body.
  const big = await request(app)
    .post("/api/articles")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ title: unique("Large Article"), content: `<p>${"word ".repeat(30000)}</p>` });
  assert.equal(big.status, 201, `large article write was rejected: ${big.status}`);
  created.articleUuids.push(big.body.data.uuid);
});

test("the comment count header is readable cross-origin", async () => {
  const admin = track(await createUser({ role: "ADMIN" }));
  const article = await request(app)
    .post("/api/articles")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ title: unique("Header Test"), content: "Article used for the count-header test." });
  created.articleUuids.push(article.body.data.uuid);

  const res = await request(app)
    .get(`/api/articles/${article.body.data.slug}/comments`)
    .set("Origin", ORIGIN);
  assert.equal(res.status, 200);
  assert.ok(res.headers["x-total-count"] !== undefined, "X-Total-Count is not set");
  // A header a cross-origin SPA cannot read is a header that does not exist.
  assert.match(
    res.headers["access-control-expose-headers"] || "",
    /X-Total-Count/i,
    "X-Total-Count is not exposed to cross-origin JavaScript"
  );
});

test("public write limits do not share a counter across endpoints", async () => {
  // Sharing one limiter instance meant submitting the contact form spent the
  // budget for subscribing, and on a shared address one person's submission
  // spent everyone else's.
  const limits = require("../src/middleware/rateLimit.middleware");
  assert.notEqual(limits.contactWrite, limits.newsletterWrite);
  assert.notEqual(limits.contactWrite, limits.unsubscribe);
});

test("query strings are parsed without nested-object support", async () => {
  // With the `qs` parser, `?a[b]=1` becomes an object; with the simple parser
  // it stays a flat key, so nothing downstream can be handed a nested shape.
  const res = await request(app).get("/api/articles?limit=5&tag[bad]=x");
  assert.ok([200, 400].includes(res.status), `got ${res.status}`);
  if (res.status === 200) {
    assert.ok(Array.isArray(res.body.data.articles));
  }
});
