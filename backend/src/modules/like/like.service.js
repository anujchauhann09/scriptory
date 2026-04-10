const prisma = require("../../config/db");

const resolveIds = async (userUuid, articleSlug) => {
  const [user, article] = await Promise.all([
    userUuid ? prisma.user.findUnique({ where: { uuid: userUuid }, select: { id: true } }) : null,
    prisma.article.findUnique({ where: { slug: articleSlug }, select: { id: true } }),
  ]);
  return { userId: user?.id ?? null, articleId: article?.id ?? null };
};

const toggleLike = async (userUuid, articleSlug) => {
  const { userId, articleId } = await resolveIds(userUuid, articleSlug);

  if (!userId) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }
  if (!articleId) {
    const err = new Error("Article not found");
    err.statusCode = 404;
    throw err;
  }

  const existing = await prisma.like.findUnique({
    where: { userId_articleId: { userId, articleId } },
  });

  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } });
  } else {
    await prisma.like.create({ data: { userId, articleId } });
  }

  const likeCount = await prisma.like.count({ where: { articleId } });
  return { liked: !existing, likeCount };
};

const getLikeStatus = async (userUuid, articleSlug) => {
  const { userId, articleId } = await resolveIds(userUuid, articleSlug);

  if (!articleId) {
    const err = new Error("Article not found");
    err.statusCode = 404;
    throw err;
  }

  const [likeCount, userLike] = await Promise.all([
    prisma.like.count({ where: { articleId } }),
    userId
      ? prisma.like.findUnique({
          where: { userId_articleId: { userId, articleId } },
          select: { id: true },
        })
      : null,
  ]);

  return { liked: !!userLike, likeCount };
};

module.exports = { toggleLike, getLikeStatus };
