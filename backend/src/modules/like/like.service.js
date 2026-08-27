const prisma = require("../../config/db");
const { resolveVisibleArticle } = require("../article/article.service");

const resolveIds = async (userUuid, articleSlug, viewer) => {
  const [user, article] = await Promise.all([
    userUuid ? prisma.user.findUnique({ where: { uuid: userUuid }, select: { id: true } }) : null,
    // Visibility-checked: likes on an unpublished draft would confirm it exists.
    resolveVisibleArticle(articleSlug, viewer),
  ]);
  return { userId: user?.id ?? null, articleId: article.id };
};

const toggleLike = async (userUuid, articleSlug, viewer) => {
  const { userId, articleId } = await resolveIds(userUuid, articleSlug, viewer);

  if (!userId) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  /**
   * The read-then-write was racy: two concurrent toggles both saw "not liked"
   * and one failed on the unique index. Driving the decision off the delete's
   * own result makes the outcome depend on what the database actually did.
   */
  const removed = await prisma.like.deleteMany({ where: { userId, articleId } });
  if (removed.count === 0) {
    try {
      await prisma.like.create({ data: { userId, articleId } });
    } catch (err) {
      // Lost the race to a concurrent like from the same user; the end state is
      // the one the caller asked for either way.
      if (err.code !== "P2002") throw err;
    }
  }

  const likeCount = await prisma.like.count({ where: { articleId } });
  return { liked: removed.count === 0, likeCount };
};

const getLikeStatus = async (userUuid, articleSlug, viewer) => {
  const { userId, articleId } = await resolveIds(userUuid, articleSlug, viewer);

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
