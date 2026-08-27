const crypto = require("crypto");
const prisma = require("../../config/db");
const config = require("../../config/env");
const { resolveVisibleArticle } = require("../article/article.service");

/**
 * Identifies a viewer for de-duplication.
 *
 * The anonymous branch previously read `x-forwarded-for` straight off the
 * request. That header is attacker-supplied — anyone could send a fresh value
 * per request and inflate a view count without limit. `req.ip` is derived by
 * Express from the trusted-proxy configuration, so it reflects the hop the
 * platform actually observed and cannot be spoofed past it.
 *
 * The result is a keyed hash, not a plain one: an unkeyed SHA-256 of an IP is
 * trivially reversible by enumerating the address space, which would turn the
 * view table into a log of who read what.
 */
const buildFingerprint = (req) => {
  if (req.user?.uuid) return `user:${req.user.uuid}`;

  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const ua = req.headers["user-agent"] || "unknown";

  return crypto
    .createHmac("sha256", config.jwtSecret)
    .update(`${ip}::${ua}`)
    .digest("hex")
    .slice(0, 64);
};

const incrementView = async (slugOrUuid, req) => {
  // Counting a view on an unpublished draft both leaks its existence and
  // pollutes the analytics for a post that was never released.
  const article = await resolveVisibleArticle(slugOrUuid, req.user);
  const articleId = article.id;
  const fingerprint = buildFingerprint(req);

  /**
   * One transaction, so the de-duplication record and the counter cannot
   * diverge. Previously these were three separate round trips: a crash or a
   * concurrent request between the insert and the increment left a viewer
   * recorded as counted while the count never moved, permanently suppressing
   * that view.
   */
  return prisma.$transaction(async (tx) => {
    const view = await tx.view.upsert({
      where: { articleId },
      update: {},
      create: { articleId, count: 0 },
      select: { id: true, count: true },
    });

    try {
      await tx.viewRecord.create({
        data: {
          articleId,
          viewId: view.id,
          userId: req.user?.id ?? null,
          fingerprint,
        },
      });
    } catch (err) {
      // The unique index on (articleId, fingerprint) is what enforces
      // one-view-per-viewer; a conflict means this viewer already counted.
      if (err.code === "P2002") {
        return { count: view.count, alreadyViewed: true };
      }
      throw err;
    }

    const updated = await tx.view.update({
      where: { articleId },
      data: { count: { increment: 1 } },
      select: { count: true },
    });

    return { count: updated.count, alreadyViewed: false };
  });
};

module.exports = { incrementView };
