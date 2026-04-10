const prisma = require("../../config/db");
const { generateSlug } = require("../../utils/slugify");
const { calculateReadingTime } = require("../../utils/readingTime");

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
  const skip = (page - 1) * limit;

  const where = {
    published,
    ...(search && { title: { contains: search, mode: "insensitive" } }),
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

const createArticle = async (authorUuid, { title, subtitle, content, excerpt, coverImage, published = true, tags = [] }) => {
  const author = await prisma.user.findUnique({ where: { uuid: authorUuid }, select: { id: true } });
  if (!author) {
    const err = new Error("Author not found");
    err.statusCode = 404;
    throw err;
  }

  const slug = await ensureUniqueSlug(generateSlug(title));
  const readingTime = calculateReadingTime(content);
  const tagIds = tags.length ? await upsertTags(tags) : [];

  const article = await prisma.article.create({
    data: {
      title,
      subtitle,
      slug,
      content,
      excerpt,
      coverImage,
      published,
      readingTime,
      authorId: author.id,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
      views: { create: { count: 0 } },
    },
    select: ARTICLE_DETAIL_SELECT,
  });

  return formatArticle(article);
};

const updateArticleByUuid = async (uuid, { title, subtitle, content, excerpt, coverImage, published, tags }) => {
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

  if (tags !== undefined) {
    const tagIds = tags.length ? await upsertTags(tags) : [];
    await prisma.tagOnArticle.deleteMany({ where: { articleId: existing.id } });
    updateData.tags = { create: tagIds.map((tagId) => ({ tagId })) };
  }

  const article = await prisma.article.update({
    where: { uuid },
    data: updateData,
    select: ARTICLE_DETAIL_SELECT,
  });

  return formatArticle(article);
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
  const { views, tags, ...rest } = article;
  return {
    ...rest,
    tags: tags?.map((t) => t.tag.name) || [],
    viewCount: views?.count ?? 0,
  };
};

module.exports = { listArticles, getArticleBySlug, createArticle, updateArticleByUuid, deleteArticleByUuid };
