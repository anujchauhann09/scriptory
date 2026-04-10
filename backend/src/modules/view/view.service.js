const crypto = require("crypto");
const prisma = require("../../config/db");

const buildFingerprint = (req) => {
  if (req.user?.uuid) return `user:${req.user.uuid}`;

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const ua = req.headers["user-agent"] || "unknown";

  return crypto
    .createHash("sha256")
    .update(`${ip}::${ua}`)
    .digest("hex")
    .slice(0, 64);
};

const incrementView = async (slugOrUuid, req) => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(slugOrUuid);
  const article = await prisma.article.findFirst({
    where: isUuid ? { uuid: slugOrUuid } : { slug: slugOrUuid },
    select: { id: true },
  });

  if (!article) {
    const err = new Error("Article not found");
    err.statusCode = 404;
    throw err;
  }

  const articleId = article.id;
  const fingerprint = buildFingerprint(req);

  const view = await prisma.view.upsert({
    where: { articleId },
    update: {},
    create: { articleId, count: 0 },
    select: { id: true, count: true },
  });

  try {
    await prisma.viewRecord.create({
      data: {
        articleId,
        viewId: view.id,
        userId: req.user?.id ?? null,
        fingerprint,
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      return { count: view.count, alreadyViewed: true };
    }
    throw err;
  }

  const updated = await prisma.view.update({
    where: { articleId },
    data: { count: { increment: 1 } },
    select: { count: true },
  });

  return { count: updated.count, alreadyViewed: false };
};

module.exports = { incrementView };
