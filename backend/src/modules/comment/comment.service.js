const prisma = require("../../config/db");

const resolveArticleId = async (identifier) => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(identifier);
  const where = isUuid ? { uuid: identifier } : { slug: identifier };
  const article = await prisma.article.findFirst({ where, select: { id: true } });

  return article?.id ?? null;
};

const getComments = async (articleIdentifier) => {
  const articleId = await resolveArticleId(articleIdentifier);
  if (!articleId) {
    const err = new Error("Article not found");
    err.statusCode = 404;
    throw err;
  }
  
  return prisma.comment.findMany({
    where: { articleId },
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
  });
};

const createComment = async (userUuid, articleIdentifier, content) => {
  const [user, articleId] = await Promise.all([
    prisma.user.findUnique({ where: { uuid: userUuid }, select: { id: true } }),
    resolveArticleId(articleIdentifier),
  ]);

  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }
  if (!articleId) {
    const err = new Error("Article not found");
    err.statusCode = 404;
    throw err;
  }

  return prisma.comment.create({
    data: { userId: user.id, articleId, content },
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
  if (!isAdmin && comment.user.uuid !== requestingUserUuid) {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }
  await prisma.comment.delete({ where: { uuid: commentUuid } });
};

module.exports = { getComments, createComment, deleteComment };
