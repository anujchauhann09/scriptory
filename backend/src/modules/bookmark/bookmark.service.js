const prisma = require("../../config/db");
const { ARTICLE_LIST_SELECT, formatArticle } = require("../article/article.service");

const resolveIds = async (userUuid, slug) => {
  const [user, article] = await Promise.all([
    prisma.user.findUnique({ where: { uuid: userUuid }, select: { id: true } }),
    prisma.article.findFirst({ where: { slug }, select: { id: true } }),
  ]);
  return { userId: user?.id ?? null, articleId: article?.id ?? null };
};

const getStatus = async (userUuid, slug) => {
  const { userId, articleId } = await resolveIds(userUuid, slug);
  if (!userId || !articleId) return { bookmarked: false };
  const bm = await prisma.bookmark.findUnique({
    where: { userId_articleId: { userId, articleId } },
    select: { id: true },
  });
  return { bookmarked: Boolean(bm) };
};

const toggle = async (userUuid, slug) => {
  const { userId, articleId } = await resolveIds(userUuid, slug);
  if (!articleId) {
    const err = new Error("Article not found");
    err.statusCode = 404;
    throw err;
  }
  const existing = await prisma.bookmark.findUnique({
    where: { userId_articleId: { userId, articleId } },
    select: { id: true },
  });
  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    return { bookmarked: false };
  }
  await prisma.bookmark.create({ data: { userId, articleId } });
  return { bookmarked: true };
};

const list = async (userUuid) => {
  const user = await prisma.user.findUnique({ where: { uuid: userUuid }, select: { id: true } });
  if (!user) return [];
  const rows = await prisma.bookmark.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { article: { select: ARTICLE_LIST_SELECT } },
  });
  return rows.map((r) => formatArticle(r.article));
};

module.exports = { getStatus, toggle, list };
