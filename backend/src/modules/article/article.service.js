const { Prisma } = require("@prisma/client");
const prisma = require("../../config/db");
const { generateSlug } = require("../../utils/slugify");
const { calculateReadingTime } = require("../../utils/readingTime");
const { generateEmbedding, cosineSimilarity, stripHtml } = require("../../utils/embedding");

// Fire-and-forget: compute + store a content embedding for related-posts.
const generateEmbeddingFor = (uuid, { title, excerpt, content }) => {
  const text = [title, excerpt, stripHtml(content || "")].filter(Boolean).join(". ").slice(0, 8000);
  generateEmbedding(text)
    .then((vec) => { if (vec) return prisma.article.update({ where: { uuid }, data: { embedding: vec } }); })
    .catch(() => {});
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
  views: { select: { count: true } },
};

const ARTICLE_DETAIL_SELECT = {
  ...ARTICLE_LIST_SELECT,
  content: true,
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

// Find-or-create a series by title; returns its id (or null to detach).
const upsertSeries = async (title) => {
  const name = (title || "").trim();
  if (!name) return null;
  const slug = generateSlug(name);
  const series = await prisma.series.upsert({
    where: { slug },
    update: {},
    create: { title: name, slug },
    select: { id: true },
  });
  return series.id;
};

const upsertTags = async (tags) => {
  const results = await Promise.all(
    tags.map((name) =>
      prisma.tag.upsert({
        where: { name: name.toLowerCase().trim() },
        update: {},
        create: { name: name.toLowerCase().trim() },
        select: { id: true },
      })
    )
  );
  return results.map((t) => t.id);
};

const listArticles = async ({ page, limit, tag, search, published = true }) => {
  // Full-text search path (relevance-ranked across title + excerpt + content).
  if (search && search.trim()) {
    return searchArticles({ page, limit, tag, search: search.trim(), published });
  }

  const skip = (page - 1) * limit;
  const where = {
    published,
    ...(tag && { tags: { some: { tag: { name: tag.toLowerCase() } } } }),
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
 */
const searchArticles = async ({ page, limit, tag, search, published }) => {
  const skip = (page - 1) * limit;

  const tsv = Prisma.sql`to_tsvector('english', coalesce(a.title,'') || ' ' || coalesce(a.excerpt,'') || ' ' || coalesce(a.content,''))`;
  const query = Prisma.sql`websearch_to_tsquery('english', ${search})`;
  const tagFilter = tag
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "TagOnArticle" toa JOIN "Tag" t ON t.id = toa."tagId" WHERE toa."articleId" = a.id AND t.name = ${tag.toLowerCase()})`
    : Prisma.empty;
  const where = Prisma.sql`a.published = ${published} AND ${tsv} @@ ${query} ${tagFilter}`;

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

const getArticleBySlug = async (slug) => {
  const article = await prisma.article.findUnique({
    where: { slug },
    select: ARTICLE_DETAIL_SELECT,
  });

  if (!article) {
    const err = new Error("Article not found");
    err.statusCode = 404;
    throw err;
  }

  return formatArticle(article);
};

const createArticle = async (authorUuid, { title, subtitle, content, excerpt, coverImage, published = true, tags = [], series, seriesOrder, publishAt }) => {
  const author = await prisma.user.findUnique({ where: { uuid: authorUuid }, select: { id: true } });
  if (!author) {
    const err = new Error("Author not found");
    err.statusCode = 404;
    throw err;
  }

  const slug = await ensureUniqueSlug(generateSlug(title));
  const readingTime = calculateReadingTime(content);
  const tagIds = tags.length ? await upsertTags(tags) : [];
  const seriesId = series ? await upsertSeries(series) : null;

  // Scheduled for the future → stays a draft until the cron flips it.
  const scheduled = publishAt && new Date(publishAt) > new Date();

  const article = await prisma.article.create({
    data: {
      title,
      subtitle,
      slug,
      content,
      excerpt,
      coverImage,
      published: scheduled ? false : published,
      publishAt: publishAt ? new Date(publishAt) : null,
      readingTime,
      authorId: author.id,
      seriesId,
      seriesOrder: seriesId ? seriesOrder ?? null : null,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
      views: { create: { count: 0 } },
    },
    select: ARTICLE_DETAIL_SELECT,
  });

  generateEmbeddingFor(article.uuid, { title, excerpt, content });
  return formatArticle(article);
};

const updateArticleByUuid = async (uuid, { title, subtitle, content, excerpt, coverImage, published, tags, series, seriesOrder, publishAt }) => {
  const existing = await prisma.article.findUnique({ where: { uuid }, select: { id: true } });
  if (!existing) {
    const err = new Error("Article not found");
    err.statusCode = 404;
    throw err;
  }

  const updateData = {};
  if (title !== undefined) {
    updateData.title = title;
    updateData.slug = await ensureUniqueSlug(generateSlug(title), existing.id);
  }
  if (subtitle !== undefined) updateData.subtitle = subtitle;
  if (content !== undefined) {
    updateData.content = content;
    updateData.readingTime = calculateReadingTime(content);
  }
  if (excerpt !== undefined) updateData.excerpt = excerpt;
  if (coverImage !== undefined) updateData.coverImage = coverImage ?? null;
  if (published !== undefined) updateData.published = published;

  if (publishAt !== undefined) {
    updateData.publishAt = publishAt ? new Date(publishAt) : null;
    // Scheduling for the future overrides publish state until the cron fires.
    if (publishAt && new Date(publishAt) > new Date()) updateData.published = false;
  }

  if (tags !== undefined) {
    const tagIds = tags.length ? await upsertTags(tags) : [];
    await prisma.tagOnArticle.deleteMany({ where: { articleId: existing.id } });
    updateData.tags = { create: tagIds.map((tagId) => ({ tagId })) };
  }

  if (series !== undefined) {
    const seriesId = series ? await upsertSeries(series) : null;
    updateData.seriesId = seriesId;
    updateData.seriesOrder = seriesId ? seriesOrder ?? null : null;
  } else if (seriesOrder !== undefined) {
    updateData.seriesOrder = seriesOrder ?? null;
  }

  const article = await prisma.article.update({
    where: { uuid },
    data: updateData,
    select: ARTICLE_DETAIL_SELECT,
  });

  // Refresh the embedding when the text content changed.
  if (title !== undefined || excerpt !== undefined || content !== undefined) {
    generateEmbeddingFor(uuid, {
      title: article.title,
      excerpt: article.excerpt,
      content: article.content,
    });
  }

  return formatArticle(article);
};

// Related articles by content-embedding similarity, falling back to shared tags.
const getRelated = async (slug, limit = 3) => {
  const article = await prisma.article.findFirst({
    where: { slug },
    select: { embedding: true, tags: { select: { tag: { select: { name: true } } }, take: 1 } },
  });
  if (!article) return [];

  const target = Array.isArray(article.embedding) ? article.embedding : null;
  if (target && target.length) {
    const candidates = await prisma.article.findMany({
      where: { published: true, slug: { not: slug }, NOT: { embedding: { equals: Prisma.DbNull } } },
      select: { id: true, embedding: true, ...ARTICLE_LIST_SELECT },
      take: 200,
    });
    const scored = candidates
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
  if (!existing) {
    const err = new Error("Article not found");
    err.statusCode = 404;
    throw err;
  }
  await prisma.article.delete({ where: { uuid } });
};

const ensureUniqueSlug = async (slug, excludeId = null) => {
  let candidate = slug;
  let counter = 1;
  while (true) {
    const existing = await prisma.article.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${slug}-${counter++}`;
  }
};

const formatArticle = (article) => {
  const { views, tags, id, series, seriesOrder, embedding, ...rest } = article;
  const formatted = {
    ...rest,
    tags: tags?.map((t) => t.tag.name) || [],
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
  // Reused by the bookmark module to shape saved-article cards.
  ARTICLE_LIST_SELECT,
  formatArticle,
};
