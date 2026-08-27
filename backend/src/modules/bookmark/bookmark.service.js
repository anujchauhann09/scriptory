const prisma = require("../../config/db");
const { ARTICLE_LIST_SELECT, formatArticle, resolveVisibleArticle } = require("../article/article.service");

const resolveIds = async (userUuid, slug, viewer) => {
  const [user, article] = await Promise.all([
    prisma.user.findUnique({ where: { uuid: userUuid }, select: { id: true } }),
    resolveVisibleArticle(slug, viewer),
  ]);
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }
  return { userId: user.id, articleId: article.id };
};

const getStatus = async (userUuid, slug, viewer) => {
  const { userId, articleId } = await resolveIds(userUuid, slug, viewer);
  const bm = await prisma.bookmark.findUnique({
    where: { userId_articleId: { userId, articleId } },
    select: { id: true },
  });
  return { bookmarked: Boolean(bm) };
};

const toggle = async (userUuid, slug, viewer) => {
  const { userId, articleId } = await resolveIds(userUuid, slug, viewer);

  // Same race-free pattern as likes: let the delete's result decide.
  const removed = await prisma.bookmark.deleteMany({ where: { userId, articleId } });
  if (removed.count === 0) {
    try {
      await prisma.bookmark.create({ data: { userId, articleId } });
    } catch (err) {
      if (err.code !== "P2002") throw err;
    }
  }
  return { bookmarked: removed.count === 0 };
};

const list = async (userUuid, { limit = 100 } = {}) => {
  const user = await prisma.user.findUnique({ where: { uuid: userUuid }, select: { id: true } });
  if (!user) return [];
  const rows = await prisma.bookmark.findMany({
    // Scoped to the caller's own id from their verified token.
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { article: { select: ARTICLE_LIST_SELECT } },
  });
  // A post can be unpublished after being saved; don't serve it back.
  return rows.filter((r) => r.article?.published).map((r) => formatArticle(r.article));
};

module.exports = { getStatus, toggle, list };
