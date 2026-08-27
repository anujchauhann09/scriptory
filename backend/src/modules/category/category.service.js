const prisma = require("../../config/db");
const memo = require("../../utils/memoCache");
const { generateSlug } = require("../../utils/slugify");

/**
 * The curated learning taxonomy.
 *
 * Categories are a closed vocabulary: nothing in the *article* write path may
 * create one. Writing an article can only reference a category that already
 * exists, which is what stops a typo in the editor becoming a permanent
 * top-level category — the failure mode that free-form tags and series accept
 * by design and that a top-level taxonomy cannot.
 *
 * Managing the taxonomy itself is a separate, deliberate, admin-only action
 * (create/update/delete/reorder below). The gate moved from "edit a migration"
 * to "be an admin and mean it"; the guarantee that articles cannot mint
 * categories is unchanged.
 *
 * The public list is identical for every visitor, so it is memoised like the
 * tag list and invalidated on every mutation.
 */
const CATEGORY_CACHE_TTL_MS = Number(process.env.CATEGORY_CACHE_TTL_MS) || 5 * 60 * 1000;

const PUBLIC_SELECT = { slug: true, name: true, description: true, sortOrder: true };

/**
 * Every category, in learning order, with its published article count.
 *
 * Categories with no articles yet are still returned. The taxonomy is the
 * site's advertised structure, so an empty shelf is meaningful information
 * ("nothing here yet"), not something to hide — and hiding it would make the
 * learning path appear to have gaps.
 */
const listCategories = async () =>
  memo.remember("stats:categories", CATEGORY_CACHE_TTL_MS, async () => {
    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        ...PUBLIC_SELECT,
        _count: { select: { articles: { where: { published: true } } } },
      },
    });

    return categories.map(({ _count, ...category }) => ({
      ...category,
      articleCount: _count.articles,
    }));
  });

/**
 * Resolves a category slug to its id for a write.
 *
 * Returns null for an empty value, which is how an article is left uncategorised
 * or has its category cleared. An unrecognised slug is an error rather than a
 * silent no-op: quietly dropping it would let an article be saved as
 * uncategorised while the author believed they had filed it.
 */
const resolveCategoryId = async (slug) => {
  const value = (slug || "").trim().toLowerCase();
  if (!value) return null;

  const category = await prisma.category.findUnique({
    where: { slug: value },
    select: { id: true },
  });

  if (!category) {
    const err = new Error(`Unknown category "${value}"`);
    err.statusCode = 400;
    throw err;
  }
  return category.id;
};

/** Confirms a slug exists, for read-side filtering. */
const findBySlug = async (slug) =>
  prisma.category.findUnique({
    where: { slug: (slug || "").trim().toLowerCase() },
    select: PUBLIC_SELECT,
  });


// --- administration -------------------------------------------------------

/** Drops the memoised public list. Every mutation must call this. */
const invalidate = () => memo.del("stats:categories");

const conflict = (message) => {
  const err = new Error(message);
  err.statusCode = 409;
  return err;
};

const notFound = () => {
  const err = new Error("Category not found");
  err.statusCode = 404;
  return err;
};

/**
 * Admin view of the taxonomy.
 *
 * Reports published and draft counts separately, because the number that
 * matters when deciding whether a category is pulling its weight is not the
 * same as the number shown to readers — and the number that matters when
 * deleting one is the total, since drafts get unfiled too.
 */
const listCategoriesForAdmin = async () => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      slug: true,
      name: true,
      description: true,
      sortOrder: true,
      createdAt: true,
      _count: { select: { articles: true } },
    },
  });

  const published = await prisma.article.groupBy({
    by: ["categoryId"],
    where: { published: true, categoryId: { not: null } },
    _count: { _all: true },
  });

  const byId = new Map(published.map((row) => [row.categoryId, row._count._all]));
  const ids = await prisma.category.findMany({ select: { id: true, slug: true } });
  const idBySlug = new Map(ids.map((c) => [c.slug, c.id]));

  return categories.map(({ _count, ...category }) => ({
    ...category,
    articleCount: _count.articles,
    publishedCount: byId.get(idBySlug.get(category.slug)) ?? 0,
  }));
};

/**
 * Derives a unique slug from a name.
 *
 * Bounded rather than looping forever, and the uniqueness is still ultimately
 * enforced by the unique index — this only avoids the common collision so the
 * admin does not have to hand-pick a slug for "Cloud" vs "Cloud ".
 */
const deriveUniqueSlug = async (name, excludeSlug = null) => {
  const base = generateSlug(name) || "category";
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await prisma.category.findUnique({
      where: { slug: candidate },
      select: { slug: true },
    });
    if (!existing || existing.slug === excludeSlug) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
};

const createCategory = async ({ name, slug, description }) => {
  const finalSlug = slug ? slug.trim().toLowerCase() : await deriveUniqueSlug(name);

  const [bySlug, byName] = await Promise.all([
    prisma.category.findUnique({ where: { slug: finalSlug }, select: { slug: true } }),
    prisma.category.findUnique({ where: { name: name.trim() }, select: { slug: true } }),
  ]);
  if (bySlug) throw conflict(`A category with the slug "${finalSlug}" already exists`);
  if (byName) throw conflict(`A category named "${name.trim()}" already exists`);

  // New categories go to the end of the learning path rather than the front,
  // so adding one never silently reorders the existing sequence.
  const last = await prisma.category.aggregate({ _max: { sortOrder: true } });

  const created = await prisma.category.create({
    data: {
      name: name.trim(),
      slug: finalSlug,
      description: description?.trim() || null,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
    },
    select: { slug: true, name: true, description: true, sortOrder: true },
  });

  invalidate();
  return { ...created, articleCount: 0, publishedCount: 0 };
};

const updateCategory = async (currentSlug, patch) => {
  const existing = await prisma.category.findUnique({
    where: { slug: currentSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!existing) throw notFound();

  const data = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.slug !== undefined) data.slug = patch.slug.trim().toLowerCase();

  // Checked up front so the caller gets a clear conflict rather than a raw
  // unique-constraint violation.
  if (data.slug && data.slug !== existing.slug) {
    const clash = await prisma.category.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (clash) throw conflict(`A category with the slug "${data.slug}" already exists`);
  }
  if (data.name && data.name !== existing.name) {
    const clash = await prisma.category.findUnique({
      where: { name: data.name },
      select: { id: true },
    });
    if (clash) throw conflict(`A category named "${data.name}" already exists`);
  }

  const updated = await prisma.category.update({
    where: { id: existing.id },
    data,
    select: { slug: true, name: true, description: true, sortOrder: true },
  });

  invalidate();
  return {
    ...updated,
    // Articles reference the category by id, so a rename never detaches any of
    // them. Only external links carrying the old ?category= value are affected,
    // which is why the caller surfaces this.
    slugChanged: Boolean(data.slug && data.slug !== existing.slug),
    previousSlug: existing.slug,
  };
};

/**
 * Deletes a category and reports how many articles it unfiled.
 *
 * The foreign key is ON DELETE SET NULL, so this can never remove an article —
 * they become uncategorised, stay published, and can be re-filed later. That is
 * the whole reason category is a nullable FK rather than a required one.
 */
const deleteCategory = async (slug) => {
  const existing = await prisma.category.findUnique({
    where: { slug },
    select: { id: true, name: true, _count: { select: { articles: true } } },
  });
  if (!existing) throw notFound();

  await prisma.category.delete({ where: { id: existing.id } });

  invalidate();
  return { slug, name: existing.name, unfiled: existing._count.articles };
};

/**
 * Rewrites the whole learning path in one transaction.
 *
 * The caller sends the complete desired order. Applying it as a single
 * transaction means readers never see a half-reordered path, and requiring the
 * full set means the result is exactly what was asked for rather than depending
 * on what the previous order happened to be.
 */
const reorderCategories = async (order) => {
  const slugs = order.map((s) => s.trim().toLowerCase());
  const existing = await prisma.category.findMany({ select: { id: true, slug: true } });

  const known = new Set(existing.map((c) => c.slug));
  const missing = slugs.filter((s) => !known.has(s));
  if (missing.length) {
    const err = new Error(`Unknown categor${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
  if (slugs.length !== existing.length) {
    const err = new Error(
      `The order must list every category (expected ${existing.length}, got ${slugs.length})`
    );
    err.statusCode = 400;
    throw err;
  }

  const idBySlug = new Map(existing.map((c) => [c.slug, c.id]));
  await prisma.$transaction(
    slugs.map((slug, index) =>
      prisma.category.update({ where: { id: idBySlug.get(slug) }, data: { sortOrder: index + 1 } })
    )
  );

  invalidate();
  return listCategoriesForAdmin();
};

module.exports = {
  listCategories,
  listCategoriesForAdmin,
  resolveCategoryId,
  findBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  PUBLIC_SELECT,
};
