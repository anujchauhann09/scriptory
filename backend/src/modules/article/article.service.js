const { Prisma } = require("@prisma/client");
const prisma = require("../../config/db");
const { generateSlug } = require("../../utils/slugify");
const { calculateReadingTime } = require("../../utils/readingTime");
const { generateEmbedding, cosineSimilarity } = require("../../utils/embedding");
const { sanitizeArticleHtml, stripAllHtml } = require("../../utils/sanitizeHtml");
const { normaliseArticleContentSource, sourceToPlainText } = require("./contentContract");
const { resolveCategoryId } = require("../category/category.service");
const memo = require("../../utils/memoCache");
const logger = require("../../utils/logger");

const notFound = () => {
  const err = new Error("Article not found");
  err.statusCode = 404;
  return err;
};

// Fire-and-forget: compute + store a content embedding for related-posts.
const generateEmbeddingFor = (uuid, { title, excerpt, content, contentSource }) => {
  const sourceText = sourceToPlainText(contentSource);
  const bodyText = sourceText || stripAllHtml(content || "");
  const text = [title, excerpt, bodyText].filter(Boolean).join(". ").slice(0, 8000);
  generateEmbedding(text)
    .then((vec) => {
      if (!vec) return;
      // Related-post candidates are cached; a new vector invalidates them.
      memo.del("related:");
      return prisma.article.update({ where: { uuid }, data: { embedding: vec } });
    })
    .catch((err) => logger.warn("Embedding update failed", { message: err.message }));
};

const ARTICLE_LIST_SELECT = {
  uuid: true,
  title: true,
  subtitle: true,
  slug: true,
  excerpt: true,
  coverImage: true,
  published: true,
  readingTime: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      uuid: true,
      profile: { select: { name: true, avatarUrl: true } },
    },
  },
  tags: {
    select: { tag: { select: { name: true } } },
  },
  // Nullable relation: an uncategorised article selects `category: null`, which
  // formatArticle normalises so every response carries the key either way.
  category: { select: { slug: true, name: true } },
  views: { select: { count: true } },
};

const ARTICLE_DETAIL_SELECT = {
  ...ARTICLE_LIST_SELECT,
  content: true,
  contentSource: true,
  contentFormat: true,
  contentVersion: true,
  publishAt: true,
  seriesOrder: true,
  series: {
    select: {
      title: true,
      slug: true,
      articles: {
        where: { published: true },
        orderBy: [{ seriesOrder: "asc" }, { createdAt: "asc" }],
        select: { title: true, slug: true, seriesOrder: true },
      },
    },
  },
  comments: {
    orderBy: { createdAt: "desc" },
    // Detail responses embed only the most recent comments; the full thread is
    // paginated through the comments endpoint. Without a cap, one popular post
    // makes every article request unboundedly large.
    take: 50,
    select: {
      uuid: true,
      content: true,
      createdAt: true,
      user: {
        select: {
          uuid: true,
          profile: { select: { name: true, avatarUrl: true } },
        },
      },
    },
  },
};

/**
 * Visibility filter for a caller.
 *
 * Every read path that resolves an article by slug or uuid runs through this.
 * Drafts and future-dated posts are unreleased content: they were previously
 * readable by anyone who knew or guessed the slug, and the same slug is also
 * what the comments, likes, view-count and OG-image endpoints key on — so one
 * missing predicate exposed unpublished work across half the API.
 */
const visibilityFilter = (viewer) =>
  viewer && viewer.role === "ADMIN" ? {} : { published: true };

const canSeeUnpublished = (viewer) => Boolean(viewer && viewer.role === "ADMIN");

// Find-or-create a series by title; returns its id (or null to detach).
const upsertSeries = async (client, title) => {
  const name = (title || "").trim();
  if (!name) return null;
  const slug = generateSlug(name);
  const series = await client.series.upsert({
    where: { slug },
    update: {},
    create: { title: name, slug },
    select: { id: true },
  });
  return series.id;
};

const normaliseTag = (name) => name.toLowerCase().trim();

/**
 * Category predicate for a listing query.
 *
 * `uncategorized` is a separate flag rather than a reserved slug value like
 * `?category=none`, so it can never collide with a real category someone adds
 * later. It exists because "which articles still need filing?" is the core
 * question when categorising a back catalogue.
 *
 * An unknown slug yields `categoryId: -1` — a predicate that matches nothing —
 * rather than being ignored. Silently returning every article for a mistyped
 * filter looks like the filter is broken.
 */
const categoryWhere = ({ category, uncategorized }) => {
  if (uncategorized) return { categoryId: null };
  const slug = (category || "").trim().toLowerCase();
  if (!slug) return {};
  return { category: { slug } };
};

const upsertTags = async (client, tags) => {
  const unique = [...new Set(tags.map(normaliseTag).filter(Boolean))];
  const ids = [];
  // Sequential rather than Promise.all: concurrent upserts of the same tag name
  // deadlock against each other on the unique index, and a handful of tags is
  // not worth the contention.
  for (const name of unique) {
    const tag = await client.tag.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });
    ids.push(tag.id);
  }
  return ids;
};

const listArticles = async ({ page, limit, tag, search, published, category, uncategorized }, viewer) => {
  const adminView = canSeeUnpublished(viewer);
  // A non-admin never sees anything but published posts, whatever they asked
  // for; an admin may filter, and defaults to everything.
  const publishedFilter = adminView ? published : true;

  if (search && search.trim()) {
    return searchArticles({
      page,
      limit,
      tag,
      search: search.trim(),
      published: publishedFilter,
      category,
      uncategorized,
    });
  }

  const skip = (page - 1) * limit;
  const where = {
    ...(publishedFilter === undefined ? {} : { published: publishedFilter }),
    ...(tag && { tags: { some: { tag: { name: normaliseTag(tag) } } } }),
    ...categoryWhere({ category, uncategorized }),
  };

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: ARTICLE_LIST_SELECT,
    }),
    prisma.article.count({ where }),
  ]);

  return {
    articles: articles.map(formatArticle),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * Postgres full-text search over title + excerpt + content, relevance-ranked
 * with `ts_rank`.
 *
 * Every interpolation below goes through Prisma.sql, which emits a bound
 * parameter rather than string concatenation — the search term and tag are
 * never part of the statement text, so no input can alter the query's shape.
 * `websearch_to_tsquery` additionally parses the term as a search expression
 * rather than as SQL, so malformed input yields no matches instead of an error.
 */
const searchArticles = async ({ page, limit, tag, search, published, category, uncategorized }) => {
  const skip = (page - 1) * limit;

  const tsv = Prisma.sql`to_tsvector('english', coalesce(a.title,'') || ' ' || coalesce(a.excerpt,'') || ' ' || coalesce(a.content,''))`;
  const query = Prisma.sql`websearch_to_tsquery('english', ${search})`;
  const tagFilter = tag
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "TagOnArticle" toa JOIN "Tag" t ON t.id = toa."tagId" WHERE toa."articleId" = a.id AND t.name = ${normaliseTag(tag)})`
    : Prisma.empty;

  // Search must respect the same category filter as plain listing, or filtering
  // to a category and then typing in the search box would silently widen the
  // results back to the whole site. Both interpolations are bound parameters.
  let categoryFilter = Prisma.empty;
  if (uncategorized) {
    categoryFilter = Prisma.sql`AND a."categoryId" IS NULL`;
  } else if (category && category.trim()) {
    categoryFilter = Prisma.sql`AND EXISTS (SELECT 1 FROM "Category" c WHERE c.id = a."categoryId" AND c.slug = ${category.trim().toLowerCase()})`;
  }
  const publishedFilter =
    published === undefined ? Prisma.empty : Prisma.sql`a.published = ${published} AND`;
  const where = Prisma.sql`${publishedFilter} ${tsv} @@ ${query} ${tagFilter} ${categoryFilter}`;

  const [ranked, countRows] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`
      SELECT a.id, ts_rank(${tsv}, ${query}) AS rank
      FROM "Article" a
      WHERE ${where}
      ORDER BY rank DESC, a."createdAt" DESC
      LIMIT ${limit} OFFSET ${skip}
    `),
    prisma.$queryRaw(Prisma.sql`SELECT count(*)::int AS total FROM "Article" a WHERE ${where}`),
  ]);

  const total = countRows[0]?.total ?? 0;
  const ids = ranked.map((r) => r.id);
  if (ids.length === 0) {
    return { articles: [], pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  const rows = await prisma.article.findMany({
    where: { id: { in: ids } },
    select: { id: true, ...ARTICLE_LIST_SELECT },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

  return {
    articles: ordered.map(formatArticle),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

const getArticleBySlug = async (slug, viewer) => {
  const article = await prisma.article.findFirst({
    where: { slug, ...visibilityFilter(viewer) },
    select: ARTICLE_DETAIL_SELECT,
  });

  // Same 404 whether the article is missing or merely unpublished — a
  // distinguishable response would confirm that a guessed draft slug exists.
  if (!article) throw notFound();

  return formatArticle(article);
};

/**
 * Resolves an article by slug or uuid for the endpoints that act on one
 * (comments, likes, bookmarks, views). Centralised so the visibility rule
 * cannot drift between them.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const resolveVisibleArticle = async (identifier, viewer, select = { id: true }) => {
  const key = UUID_PATTERN.test(identifier) ? { uuid: identifier } : { slug: identifier };
  const article = await prisma.article.findFirst({
    where: { ...key, ...visibilityFilter(viewer) },
    select,
  });
  if (!article) throw notFound();
  return article;
};

const createArticle = async (authorUuid, input) => {
  const {
    title, subtitle, content, excerpt, coverImage,
    published = true, tags = [], series, seriesOrder, publishAt, category,
  } = input;
  const safeContentSource = normaliseArticleContentSource(input.contentSource);

  const author = await prisma.user.findUnique({ where: { uuid: authorUuid }, select: { id: true } });
  if (!author) {
    const err = new Error("Author not found");
    err.statusCode = 404;
    throw err;
  }

  // Sanitise before anything is persisted: stored HTML is rendered straight
  // into the reader's page, so the database is the boundary that has to hold.
  const safeContent = sanitizeArticleHtml(content);
  const readingTime = calculateReadingTime(safeContent);

  // Scheduled for the future → stays a draft until the cron flips it.
  const scheduled = publishAt && new Date(publishAt) > new Date();

  const article = await withUniqueSlug(generateSlug(title), (slug) =>
    prisma.$transaction(async (tx) => {
      const tagIds = tags.length ? await upsertTags(tx, tags) : [];
      const seriesId = series ? await upsertSeries(tx, series) : null;
      // Omitted or empty -> null, i.e. published with no category. This is the
      // default path and must never block a publish.
      const categoryId = await resolveCategoryId(category);

      return tx.article.create({
        data: {
          title,
          subtitle,
          slug,
          content: safeContent,
          contentSource: safeContentSource || undefined,
          contentFormat: safeContentSource ? "hybrid" : "legacy-html",
          contentVersion: safeContentSource ? 1 : 0,
          excerpt,
          coverImage,
          published: scheduled ? false : published,
          publishAt: publishAt ? new Date(publishAt) : null,
          readingTime,
          authorId: author.id,
          seriesId,
          seriesOrder: seriesId ? seriesOrder ?? null : null,
          categoryId,
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
          views: { create: { count: 0 } },
        },
        select: ARTICLE_DETAIL_SELECT,
      });
    })
  );

  invalidatePublicCaches();
  generateEmbeddingFor(article.uuid, { title, excerpt, content: safeContent, contentSource: safeContentSource });
  return formatArticle(article);
};

const updateArticleByUuid = async (uuid, input) => {
  const {
    title, subtitle, content, excerpt, coverImage,
    published, tags, series, seriesOrder, publishAt, category,
  } = input;
  const hasContentSource = Object.prototype.hasOwnProperty.call(input, "contentSource");
  const safeContentSource = hasContentSource ? normaliseArticleContentSource(input.contentSource) : undefined;

  const existing = await prisma.article.findUnique({ where: { uuid }, select: { id: true } });
  if (!existing) throw notFound();

  const updateData = {};
  // The slug is re-derived from the title by withUniqueSlug below, but the
  // title itself still has to be written here — deriving one and forgetting
  // the other renames the URL while leaving the headline stale.
  if (title !== undefined) updateData.title = title;
  if (subtitle !== undefined) updateData.subtitle = subtitle;
  if (content !== undefined) {
    // Editing loads stored HTML back into the editor and posts it straight
    // through, so the client-side sanitiser never sees it on this path.
    updateData.content = sanitizeArticleHtml(content);
    updateData.readingTime = calculateReadingTime(updateData.content);
  }
  if (hasContentSource) {
    updateData.contentSource = safeContentSource;
    updateData.contentFormat = safeContentSource ? "hybrid" : "legacy-html";
    updateData.contentVersion = safeContentSource ? 1 : 0;
  }
  if (excerpt !== undefined) updateData.excerpt = excerpt;
  if (coverImage !== undefined) updateData.coverImage = coverImage || null;
  if (published !== undefined) updateData.published = published;

  if (publishAt !== undefined) {
    updateData.publishAt = publishAt ? new Date(publishAt) : null;
    // Scheduling for the future overrides publish state until the cron fires.
    if (publishAt && new Date(publishAt) > new Date()) updateData.published = false;
  }

  const runUpdate = (slug) =>
    // One transaction: previously the tag rows were deleted before the update,
    // so a failure between the two left the article with no tags at all.
    prisma.$transaction(async (tx) => {
      const data = { ...updateData };
      if (slug) data.slug = slug;

      if (tags !== undefined) {
        const tagIds = tags.length ? await upsertTags(tx, tags) : [];
        await tx.tagOnArticle.deleteMany({ where: { articleId: existing.id } });
        data.tags = { create: tagIds.map((tagId) => ({ tagId })) };
      }

      if (series !== undefined) {
        const seriesId = series ? await upsertSeries(tx, series) : null;
        data.seriesId = seriesId;
        data.seriesOrder = seriesId ? seriesOrder ?? null : null;
      } else if (seriesOrder !== undefined) {
        data.seriesOrder = seriesOrder ?? null;
      }

      /**
       * Filing, re-filing and unfiling all happen here, and only when the field
       * is actually present in the request.
       *
       * The `!== undefined` guard is what makes re-categorising a back catalogue
       * safe: a request that omits `category` leaves the existing one alone,
       * and a request that sends only `category` changes nothing else about the
       * article — no content, no tags, no re-publish. Sending null or "" clears
       * it back to uncategorised.
       */
      if (category !== undefined) {
        data.categoryId = await resolveCategoryId(category);
      }

      return tx.article.update({ where: { uuid }, data, select: ARTICLE_DETAIL_SELECT });
    });

  const article =
    title !== undefined
      ? await withUniqueSlug(generateSlug(title), runUpdate, existing.id, { title })
      : await runUpdate(null);

  invalidatePublicCaches();

  // Refresh the embedding when the text content changed.
  if (title !== undefined || excerpt !== undefined || content !== undefined || hasContentSource) {
    generateEmbeddingFor(uuid, {
      title: article.title,
      excerpt: article.excerpt,
      content: article.content,
      contentSource: article.contentSource,
    });
  }

  return formatArticle(article);
};

/**
 * Related articles by content-embedding similarity, falling back to shared tags.
 *
 * The similarity pass has to score the target against every candidate vector in
 * memory, which means pulling a few hundred multi-kilobyte JSON columns out of
 * the database. Doing that on every article view is the single most expensive
 * read on the site, and the candidate set barely changes between requests — so
 * it is memoised briefly. The cache holds published articles only and is keyed
 * by content, never by viewer.
 */
const RELATED_CACHE_TTL_MS = Number(process.env.RELATED_CACHE_TTL_MS) || 5 * 60 * 1000;
const RELATED_CANDIDATE_LIMIT = 200;

const loadRelatedCandidates = () =>
  memo.remember("related:candidates", RELATED_CACHE_TTL_MS, () =>
    prisma.article.findMany({
      where: { published: true, NOT: { embedding: { equals: Prisma.DbNull } } },
      select: { id: true, slug: true, embedding: true, ...ARTICLE_LIST_SELECT },
      orderBy: { createdAt: "desc" },
      take: RELATED_CANDIDATE_LIMIT,
    })
  );

const getRelated = async (slug, viewer, limit = 3) => {
  const article = await prisma.article.findFirst({
    where: { slug, ...visibilityFilter(viewer) },
    select: { embedding: true, tags: { select: { tag: { select: { name: true } } }, take: 1 } },
  });
  if (!article) throw notFound();

  const target = Array.isArray(article.embedding) ? article.embedding : null;
  if (target && target.length) {
    const candidates = await loadRelatedCandidates();
    const scored = candidates
      .filter((c) => c.slug !== slug)
      .map((c) => ({ c, score: cosineSimilarity(target, c.embedding) }))
      .filter((x) => x.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    if (scored.length) return scored.map((x) => formatArticle(x.c));
  }

  const tag = article.tags[0]?.tag?.name;
  if (!tag) return [];
  const byTag = await prisma.article.findMany({
    where: { published: true, slug: { not: slug }, tags: { some: { tag: { name: tag } } } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: ARTICLE_LIST_SELECT,
  });
  return byTag.map(formatArticle);
};

const deleteArticleByUuid = async (uuid) => {
  const existing = await prisma.article.findUnique({ where: { uuid }, select: { id: true } });
  if (!existing) throw notFound();
  await prisma.article.delete({ where: { uuid } });
  invalidatePublicCaches();
};

/**
 * Runs a write with a slug that is unique at commit time.
 *
 * Checking "does this slug exist?" and then inserting is a time-of-check race:
 * two concurrent creates both see the slug as free and one fails on the unique
 * index. Rather than widening the check, the write is simply retried against
 * the next candidate when the database reports the collision — the constraint,
 * not the application, is the authority. The loop is bounded so a persistent
 * P2002 on some other unique column cannot spin forever.
 */
const MAX_SLUG_ATTEMPTS = 10;

const withUniqueSlug = async (baseSlug, write, excludeId = null, context = {}) => {
  const base = baseSlug || "article";

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt}`;

    // Cheap pre-check keeps the common case to a single write and avoids
    // burning through suffixes on an article that already owns this slug.
    const clash = await prisma.article.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (clash && clash.id !== excludeId) continue;

    try {
      return await write(candidate);
    } catch (err) {
      const isSlugConflict = err.code === "P2002" && err.meta?.target?.includes?.("slug");
      if (!isSlugConflict) throw err;
      logger.warn("Slug collision, retrying with next candidate", { candidate, ...context });
    }
  }

  // Fall back to a suffix that cannot realistically collide.
  return write(`${base}-${Date.now().toString(36)}`);
};

/** Public, cacheable projections that a content change makes stale. */
const invalidatePublicCaches = () => {
  memo.del("related:");
  memo.del("feed:");
  // Covers the memoised tag, category, site-stats and analytics projections,
  // whose per-category article counts move whenever an article does.
  memo.del("stats:");
  memo.del("og:");
};

const formatArticle = (article) => {
  const { views, tags, id, series, seriesOrder, embedding, category, ...rest } = article;
  const formatted = {
    ...rest,
    tags: tags?.map((t) => t.tag.name) || [],
    // Always emitted as an object or an explicit null, never omitted, so a
    // client can branch on presence without special-casing older articles that
    // were written before categories existed.
    category: category ?? null,
    viewCount: views?.count ?? 0,
  };
  // Only the detail select includes `series`; shape it for the client.
  if (series !== undefined) {
    formatted.series = series
      ? {
          title: series.title,
          slug: series.slug,
          order: seriesOrder ?? null,
          articles: series.articles.map((a) => ({
            title: a.title,
            slug: a.slug,
            order: a.seriesOrder ?? null,
          })),
        }
      : null;
  }
  return formatted;
};

module.exports = {
  listArticles,
  getArticleBySlug,
  getRelated,
  createArticle,
  updateArticleByUuid,
  deleteArticleByUuid,
  resolveVisibleArticle,
  invalidatePublicCaches,
  // Reused by the bookmark module to shape saved-article cards.
  ARTICLE_LIST_SELECT,
  formatArticle,
};
