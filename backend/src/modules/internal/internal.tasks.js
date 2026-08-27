const prisma = require("../../config/db");
const logger = require("../../utils/logger");
const loginThrottle = require("../../utils/loginThrottle");
const { pruneAudit } = require("../../utils/audit");
const newsletterService = require("../newsletter/newsletter.service");
const { invalidatePublicCaches } = require("../article/article.service");

/**
 * The background jobs, defined independently of how they are triggered.
 *
 * Both the in-process scheduler and the external task endpoints call these, so
 * switching between the two changes only the trigger and never the behaviour.
 */

/**
 * Publish drafts whose scheduled time has passed.
 *
 * A single conditional updateMany, which makes it naturally idempotent: two
 * instances running it at the same moment produce the same end state, and the
 * second simply reports zero rows.
 */
const publishScheduledDrafts = async () => {
  const result = await prisma.article.updateMany({
    where: { published: false, publishAt: { not: null, lte: new Date() } },
    data: { published: true },
  });
  if (result.count > 0) {
    logger.info("Auto-published scheduled articles", { count: result.count });
    invalidatePublicCaches();
  }
  return { published: result.count };
};

/** Sends the weekly digest to every active subscriber. */
const sendNewsletterDigest = async () => newsletterService.sendDigest();

/** Expires short-lived counters and trims data past its retention window. */
const runMaintenance = async () => {
  const [throttleRows, auditRows] = await Promise.all([
    loginThrottle.prune().catch((err) => {
      logger.error("Throttle prune failed", { message: err.message });
      return 0;
    }),
    pruneAudit().catch((err) => {
      logger.error("Audit prune failed", { message: err.message });
      return 0;
    }),
  ]);
  return { throttleRowsRemoved: throttleRows, auditRowsRemoved: auditRows };
};

module.exports = { publishScheduledDrafts, sendNewsletterDigest, runMaintenance };
