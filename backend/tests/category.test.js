/**
 * Category behaviour tests.
 *
 * The invariant these exist to protect is that the category is OPTIONAL. It is
 * easy to add a taxonomy and then, a few refactors later, quietly make it
 * required — a validation tweak, a non-null default, a UI that will not submit
 * without one. These pin the optional path down at every layer.
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
const memo = require("../src/utils/memoCache");

const ORIGIN = "http://localhost:5173";
const unique = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const created = { userUuids: [], articleUuids: [] };
let admin;

const signInAdmin = async () => {
  const email = `${unique("cat-admin")}@example.com`;
  const password = "TestPassword123";
  const { user } = await authService.register({ email, password, name: "Category Admin" });
  await prisma.user.update({ where: { uuid: user.uuid }, data: { role: "ADMIN" } });
  created.userUuids.push(user.uuid);
  const res = await request(app).post("/api/auth/login").set("Origin", ORIGIN).send({ email, password });
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`);
  return { cookie: res.headers["set-cookie"] };
};

const createArticle = async (body) => {
  const res = await request(app)
    .post("/api/articles")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send(body);
  if (res.status === 201) created.articleUuids.push(res.body.data.uuid);
  return res;
};

test.before(async () => {
  await prisma.loginThrottle.deleteMany({ where: { key: { startsWith: "ip:" } } });
  admin = await signInAdmin();
});

test.beforeEach(() => {
  // Category counts are memoised; a stale entry would make count assertions
  // depend on test ordering.
  memo.del("stats:");
});

test.after(async () => {
  for (const uuid of created.articleUuids) {
    const article = await prisma.article.findUnique({ where: { uuid }, select: { id: true } });
    if (!article) continue;
    await prisma.viewRecord.deleteMany({ where: { articleId: article.id } }).catch(() => {});
    await prisma.view.deleteMany({ where: { articleId: article.id } }).catch(() => {});
    await prisma.article.delete({ where: { uuid } }).catch(() => {});
  }
  for (const uuid of created.userUuids) {
    const user = await prisma.user.findUnique({ where: { uuid }, select: { id: true } });
    if (!user) continue;
    await prisma.article.deleteMany({ where: { authorId: user.id } }).catch(() => {});
    await prisma.profile.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
  await prisma.category.deleteMany({ where: { slug: { startsWith: "test-temp-" } } }).catch(() => {});
  await prisma.loginThrottle.deleteMany({ where: { key: { startsWith: "ip:" } } }).catch(() => {});
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

test("the taxonomy is public and ordered as a learning path", async () => {
  const res = await request(app).get("/api/categories");
  assert.equal(res.status, 200);

  const slugs = res.body.data.map((c) => c.slug);

  /**
   * The six defaults must exist and keep their relative order — but this
   * deliberately does NOT assert the full list.
   *
   * Admins can add, rename and remove categories, so pinning the exact set
   * would mean this test fails the moment the feature is used as intended. It
   * checks the invariant (the seeded path is intact and in sequence), not a
   * snapshot of one database's contents.
   */
  const defaults = [
    "backend-engineering",
    "system-design",
    "dsa-cs",
    "cloud",
    "devops",
    "ai-ml-engineering",
  ];
  const positions = defaults.map((slug) => {
    const index = slugs.indexOf(slug);
    assert.notEqual(index, -1, `the seeded category "${slug}" is missing`);
    return index;
  });
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
    "the seeded categories are no longer in the intended learning order"
  );

  // sortOrder must be ascending across the whole list, since it is what every
  // surface sorts by.
  const orders = res.body.data.map((c) => c.sortOrder);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));

  for (const category of res.body.data) {
    assert.equal(typeof category.name, "string");
    assert.equal(typeof category.articleCount, "number");
  }
});

test("an article publishes with no category at all", async () => {
  const res = await createArticle({
    title: unique("No Category Post"),
    content: "Published deliberately without choosing any category.",
  });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  // Explicitly null, not absent — a client must be able to branch on it without
  // special-casing articles written before categories existed.
  assert.equal(res.body.data.category, null);
  assert.ok("category" in res.body.data, "the category key is missing entirely");
});

test("an article can be published with one category", async () => {
  const res = await createArticle({
    title: unique("Filed Post"),
    content: "Published straight into a category.",
    category: "system-design",
  });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(res.body.data.category, { slug: "system-design", name: "System Design" });
});

test("an unrecognised category is rejected rather than silently dropped", async () => {
  // Saving as uncategorised while the author believed they had filed it is the
  // worst outcome here, so a bad slug must fail loudly.
  const typo = await createArticle({
    title: unique("Typo Category"),
    content: "This article must not be created at all.",
    category: "backened-enginering",
  });
  assert.equal(typo.status, 400, JSON.stringify(typo.body));
  assert.match(typo.body.message, /unknown category/i);

  // The shape is validated before the lookup, so a non-slug fails too.
  const shape = await createArticle({
    title: unique("Bad Shape Category"),
    content: "A display name is not a slug.",
    category: "System Design",
  });
  assert.equal(shape.status, 400);

  // Neither attempt left anything behind.
  const listed = await request(app).get("/api/articles?limit=50").set("Cookie", admin.cookie);
  assert.ok(!listed.body.data.articles.some((a) => a.title.startsWith("Typo Category")));
});

test("writing an article can never create a category", async () => {
  // This is the property that makes the vocabulary "closed". Managing the
  // taxonomy is a separate admin action; the article write path may only
  // reference what already exists, so a typo in the editor cannot mint a
  // permanent top-level category.
  const before = await prisma.category.count();

  const res = await createArticle({
    title: unique("Invents A Category"),
    content: "Referencing a category that does not exist must not create it.",
    category: "totally-invented-category",
  });

  assert.equal(res.status, 400);
  assert.equal(await prisma.category.count(), before, "an article write created a category");
});

test("only an admin may manage the taxonomy", async () => {
  const routes = [
    ["get", "/api/categories/manage"],
    ["post", "/api/categories"],
    ["put", "/api/categories/order"],
    ["patch", "/api/categories/cloud"],
    ["delete", "/api/categories/cloud"],
  ];

  // Anonymous.
  for (const [method, path] of routes) {
    const res = await request(app)[method](path).set("Origin", ORIGIN).send({});
    assert.equal(res.status, 401, `${method.toUpperCase()} ${path} was reachable anonymously`);
  }

  // Signed in, but not an admin.
  const email = `${unique("cat-user")}@example.com`;
  const password = "TestPassword123";
  const { user } = await authService.register({ email, password, name: "Reader" });
  created.userUuids.push(user.uuid);
  const login = await request(app).post("/api/auth/login").set("Origin", ORIGIN).send({ email, password });
  const cookie = login.headers["set-cookie"];

  for (const [method, path] of routes) {
    const res = await request(app)[method](path).set("Origin", ORIGIN).set("Cookie", cookie).send({});
    assert.equal(res.status, 403, `${method.toUpperCase()} ${path} was reachable by a non-admin`);
  }

  // Reading the taxonomy stays public.
  assert.equal((await request(app).get("/api/categories")).status, 200);
});

test("an admin can create, rename and delete a category", async () => {
  const created1 = await request(app)
    .post("/api/categories")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ name: "Test Temp Databases", description: "Indexes and query plans." });

  assert.equal(created1.status, 201, JSON.stringify(created1.body));
  assert.equal(created1.body.data.slug, "test-temp-databases", "slug was not derived from the name");

  // New categories land at the end, so adding one never silently reorders the
  // existing path.
  const all = await request(app).get("/api/categories");
  assert.equal(all.body.data[all.body.data.length - 1].slug, "test-temp-databases");

  // The public list reflects it immediately — the memoised copy is invalidated.
  assert.ok(all.body.data.some((c) => c.slug === "test-temp-databases"));

  // Renaming leaves the slug alone, so existing links keep working.
  const renamed = await request(app)
    .patch("/api/categories/test-temp-databases")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ name: "Test Temp Databases & Storage" });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.data.name, "Test Temp Databases & Storage");
  assert.equal(renamed.body.data.slug, "test-temp-databases");
  assert.equal(renamed.body.data.slugChanged, false);

  // Changing the slug is allowed but flagged, because it breaks existing links.
  const reslugged = await request(app)
    .patch("/api/categories/test-temp-databases")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ slug: "test-temp-storage" });
  assert.equal(reslugged.body.data.slugChanged, true);
  assert.equal(reslugged.body.data.previousSlug, "test-temp-databases");

  const removed = await request(app)
    .delete("/api/categories/test-temp-storage")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.data.unfiled, 0);
});

test("duplicate names and slugs are refused", async () => {
  const first = await request(app)
    .post("/api/categories")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ name: "Test Temp Unique", slug: "test-temp-unique" });
  assert.equal(first.status, 201);

  const sameName = await request(app)
    .post("/api/categories")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ name: "Test Temp Unique" });
  assert.equal(sameName.status, 409, "a duplicate name was accepted");

  const sameSlug = await request(app)
    .post("/api/categories")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ name: "Test Temp Something Else", slug: "test-temp-unique" });
  assert.equal(sameSlug.status, 409, "a duplicate slug was accepted");

  // A malformed slug never reaches the database.
  const badSlug = await request(app)
    .post("/api/categories")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ name: "Test Temp Bad", slug: "Not A Slug" });
  assert.equal(badSlug.status, 400);

  await request(app)
    .delete("/api/categories/test-temp-unique")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie);
});

test("reordering rewrites the whole path atomically", async () => {
  const before = (await request(app).get("/api/categories")).body.data.map((c) => c.slug);

  const reversed = [...before].reverse();
  const res = await request(app)
    .put("/api/categories/order")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ order: reversed });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.data.map((c) => c.slug), reversed);
  // sortOrder is renumbered densely from 1, so there are never ties or gaps.
  assert.deepEqual(
    res.body.data.map((c) => c.sortOrder),
    reversed.map((_, i) => i + 1)
  );

  // The public list agrees.
  const publicOrder = (await request(app).get("/api/categories")).body.data.map((c) => c.slug);
  assert.deepEqual(publicOrder, reversed);

  // A partial or unknown order is refused rather than half-applied.
  const partial = await request(app)
    .put("/api/categories/order")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ order: reversed.slice(0, 2) });
  assert.equal(partial.status, 400);

  const unknown = await request(app)
    .put("/api/categories/order")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ order: [...reversed.slice(1), "not-a-category"] });
  assert.equal(unknown.status, 400);

  // Neither attempt changed anything.
  const stillReversed = (await request(app).get("/api/categories")).body.data.map((c) => c.slug);
  assert.deepEqual(stillReversed, reversed, "a rejected reorder was partially applied");

  // Restore.
  await request(app)
    .put("/api/categories/order")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ order: before });
});

test("deleting a self-made category unfiles its articles and reports how many", async () => {
  const category = await request(app)
    .post("/api/categories")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ name: "Test Temp Doomed" });
  assert.equal(category.status, 201);

  const article = await createArticle({
    title: unique("Filed Under Doomed"),
    content: "Filed under a category that is about to be deleted.",
    category: category.body.data.slug,
  });
  assert.equal(article.body.data.category.slug, category.body.data.slug);

  const removed = await request(app)
    .delete(`/api/categories/${category.body.data.slug}`)
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie);

  assert.equal(removed.status, 200);
  assert.equal(removed.body.data.unfiled, 1, "the article impact was not reported");

  // The article is intact, still published, just uncategorised.
  const survivor = await request(app)
    .get(`/api/articles/${article.body.data.slug}`)
    .set("Cookie", admin.cookie);
  assert.equal(survivor.status, 200, "the article was deleted with its category");
  assert.equal(survivor.body.data.category, null);
  assert.equal(survivor.body.data.published, true);
});

test("the admin listing separates published from draft counts", async () => {
  const category = await request(app)
    .post("/api/categories")
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ name: "Test Temp Counts" });
  const slug = category.body.data.slug;

  await createArticle({
    title: unique("Counted Published"),
    content: "A published article for the count check.",
    category: slug,
  });
  await createArticle({
    title: unique("Counted Draft"),
    content: "A draft article for the count check.",
    category: slug,
    published: false,
  });

  const manage = await request(app)
    .get("/api/categories/manage")
    .set("Cookie", admin.cookie);
  assert.equal(manage.status, 200);
  assert.equal(manage.headers["cache-control"], "no-store");

  const row = manage.body.data.find((c) => c.slug === slug);
  assert.equal(row.articleCount, 2, "total should include the draft");
  assert.equal(row.publishedCount, 1, "published count should exclude the draft");

  // Readers only ever see the published number.
  const publicRow = (await request(app).get("/api/categories")).body.data.find((c) => c.slug === slug);
  assert.equal(publicRow.articleCount, 1);

  await request(app)
    .delete(`/api/categories/${slug}`)
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie);
});

test("filing an existing article changes nothing else about it", async () => {
  const title = unique("Back Catalogue Post");
  const content = "<p>Original body that must survive being filed.</p>";
  const create = await createArticle({ title, content, tags: ["postgres"] });
  assert.equal(create.status, 201);
  assert.equal(create.body.data.category, null);

  const { uuid, slug } = create.body.data;

  // A category-only update: this is the intended way to organise a back
  // catalogue after the fact.
  const filed = await request(app)
    .put(`/api/articles/${uuid}`)
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ category: "backend-engineering" });

  assert.equal(filed.status, 200, JSON.stringify(filed.body));
  assert.equal(filed.body.data.category.slug, "backend-engineering");
  assert.equal(filed.body.data.title, title, "title changed");
  assert.equal(filed.body.data.content, content, "content changed");
  assert.equal(filed.body.data.slug, slug, "slug changed — every existing link would break");
  assert.deepEqual(filed.body.data.tags, ["postgres"], "tags changed");
  assert.equal(filed.body.data.published, true, "publish state changed");

  // Re-filing to a different category.
  const refiled = await request(app)
    .put(`/api/articles/${uuid}`)
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ category: "cloud" });
  assert.equal(refiled.body.data.category.slug, "cloud");

  // And unfiling again.
  const cleared = await request(app)
    .put(`/api/articles/${uuid}`)
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ category: null });
  assert.equal(cleared.body.data.category, null, "sending null did not clear the category");

  // An update that omits the field leaves the category untouched.
  await request(app)
    .put(`/api/articles/${uuid}`)
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ category: "devops" });
  const untouched = await request(app)
    .put(`/api/articles/${uuid}`)
    .set("Origin", ORIGIN)
    .set("Cookie", admin.cookie)
    .send({ subtitle: "An unrelated edit" });
  assert.equal(
    untouched.body.data.category?.slug,
    "devops",
    "an unrelated edit cleared the category"
  );
});

test("listings filter by category and by having none", async () => {
  const filedTitle = unique("Filter Filed");
  const looseTitle = unique("Filter Loose");
  await createArticle({ title: filedTitle, content: "Filed under DSA for the filter test.", category: "dsa-cs" });
  await createArticle({ title: looseTitle, content: "Left uncategorised for the filter test." });

  const filed = await request(app).get("/api/articles?category=dsa-cs&limit=50");
  assert.equal(filed.status, 200);
  assert.ok(filed.body.data.articles.some((a) => a.title === filedTitle));
  assert.ok(
    filed.body.data.articles.every((a) => a.category?.slug === "dsa-cs"),
    "the category filter let through an article from another category"
  );

  const loose = await request(app).get("/api/articles?uncategorized=true&limit=50");
  assert.equal(loose.status, 200);
  assert.ok(loose.body.data.articles.some((a) => a.title === looseTitle));
  assert.ok(
    loose.body.data.articles.every((a) => a.category === null),
    "the uncategorized filter let through a filed article"
  );

  // An unknown slug matches nothing rather than quietly returning everything,
  // which would look like the filter was broken.
  const unknown = await request(app).get("/api/articles?category=not-a-real-category");
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.data.pagination.total, 0);

  // Unfiltered still returns both.
  const all = await request(app).get("/api/articles?limit=50");
  assert.ok(all.body.data.articles.some((a) => a.title === filedTitle));
  assert.ok(all.body.data.articles.some((a) => a.title === looseTitle));
});

test("the category filter is not widened by a search term", async () => {
  const term = unique("quasar").replace(/[^a-z]/gi, "");
  await createArticle({
    title: `${term} in cloud`,
    content: `An article about ${term} filed under cloud.`,
    category: "cloud",
  });

  const inCategory = await request(app).get(`/api/articles?search=${term}&category=cloud`);
  assert.equal(inCategory.status, 200);
  assert.equal(inCategory.body.data.pagination.total, 1);

  // The same search in a different category must find nothing — a search that
  // ignored the category filter would return the article anyway.
  const wrongCategory = await request(app).get(`/api/articles?search=${term}&category=devops`);
  assert.equal(wrongCategory.body.data.pagination.total, 0, "search widened past the category filter");

  const searchUncategorized = await request(app).get(`/api/articles?search=${term}&uncategorized=true`);
  assert.equal(searchUncategorized.body.data.pagination.total, 0);
});

test("every article payload carries the category key", async () => {
  // Mixed listings are the normal state while a back catalogue is being filed,
  // so the shape must be uniform across both kinds.
  const res = await request(app).get("/api/articles?limit=50");
  assert.equal(res.status, 200);
  assert.ok(res.body.data.articles.length > 0, "no articles to assert against");

  for (const article of res.body.data.articles) {
    assert.ok("category" in article, `"${article.title}" is missing the category key`);
    if (article.category !== null) {
      assert.equal(typeof article.category.slug, "string");
      assert.equal(typeof article.category.name, "string");
    }
  }
});

test("retiring a category unfiles its articles instead of deleting them", async () => {
  const temp = await prisma.category.create({
    data: { slug: "test-temp-retire", name: "Test Temp Retire", sortOrder: 99 },
  });

  const create = await createArticle({
    title: unique("Survives Retirement"),
    content: "This article must outlive the category it is filed under.",
  });
  const { uuid } = create.body.data;
  await prisma.article.update({ where: { uuid }, data: { categoryId: temp.id } });

  const before = await prisma.article.count();
  await prisma.category.delete({ where: { id: temp.id } });
  const after = await prisma.article.count();

  assert.equal(after, before, "deleting a category deleted articles");

  const survivor = await prisma.article.findUnique({
    where: { uuid },
    select: { categoryId: true, published: true },
  });
  assert.ok(survivor, "the article was deleted with its category");
  assert.equal(survivor.categoryId, null, "the article was not unfiled");
  assert.equal(survivor.published, true, "the article was unpublished");
});

test("category counts only include published articles", async () => {
  const before = await request(app).get("/api/categories");
  const baseline = before.body.data.find((c) => c.slug === "ai-ml-engineering").articleCount;

  await createArticle({
    title: unique("Draft In Category"),
    content: "A draft filed under a category should not inflate its public count.",
    category: "ai-ml-engineering",
    published: false,
  });

  memo.del("stats:");
  const after = await request(app).get("/api/categories");
  const updated = after.body.data.find((c) => c.slug === "ai-ml-engineering").articleCount;

  assert.equal(updated, baseline, "an unpublished article was counted publicly");
});
