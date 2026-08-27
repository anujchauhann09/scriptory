const prisma = require("../../config/db");
const { resolveVisibleArticle } = require("../article/article.service");

const COMMENT_SELECT = {
  uuid: true,
  content: true,
  createdAt: true,
  user: {
    select: {
      uuid: true,
      profile: { select: { name: true, avatarUrl: true } },
    },
  },
};

/**
 * Every entry point resolves the article through the article service's
 * visibility rule rather than looking it up directly. A comment thread on an
 * unpublished draft is unreleased content in its own right, and previously the
 * comment endpoints resolved the slug with no `published` predicate at all —
 * so a draft's existence, and its discussion, leaked to anyone with the slug.
 */
const getComments = async (articleIdentifier, viewer, { page = 1, limit = 50 } = {}) => {
  const { id: articleId } = await resolveVisibleArticle(articleIdentifier, viewer);

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: { articleId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: COMMENT_SELECT,
    }),
    prisma.comment.count({ where: { articleId } }),
  ]);

  return { comments, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

const createComment = async (userUuid, articleIdentifier, content, viewer) => {
  const [user, article] = await Promise.all([
    prisma.user.findUnique({ where: { uuid: userUuid }, select: { id: true } }),
    resolveVisibleArticle(articleIdentifier, viewer),
  ]);

  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  return prisma.comment.create({
    data: { userId: user.id, articleId: article.id, content },
    select: COMMENT_SELECT,
  });
};

const deleteComment = async (commentUuid, requestingUserUuid, isAdmin) => {
  const comment = await prisma.comment.findUnique({
    where: { uuid: commentUuid },
    select: { id: true, user: { select: { uuid: true } } },
  });
  if (!comment) {
    const err = new Error("Comment not found");
    err.statusCode = 404;
    throw err;
  }
  // Ownership check: without it, any signed-in user could delete any comment by
  // uuid — a textbook insecure direct object reference.
  if (!isAdmin && comment.user.uuid !== requestingUserUuid) {
    // 404 rather than 403: confirming that a uuid exists but belongs to someone
    // else is an enumeration oracle for no benefit.
    const err = new Error("Comment not found");
    err.statusCode = 404;
    throw err;
  }
  await prisma.comment.delete({ where: { uuid: commentUuid } });
};

module.exports = { getComments, createComment, deleteComment };
