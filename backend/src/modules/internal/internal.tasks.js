const prisma = require("../../config/db");
const logger = require("../../utils/logger");
const loginThrottle = require("../../utils/loginThrottle");
const { pruneAudit } = require("../../utils/audit");
const newsletterService = require("../newsletter/newsletter.service");
const { invalidatePublicCaches } = require("../article/article.service");
const { withLease, isoWeekKey, dayKey } = require("../../utils/taskLease");

/**
 * The background jobs, defined independently of how they are triggered.
 *
 * Both the in-process scheduler and the external task endpoints call these, so
 * switching between the two changes only the trigger and never the behaviour.
 */

/**
 * Publish drafts whose scheduled time has passed.
 *
 * Deliberately NOT leased. The whole effect is one conditional updateMany, so
 * it is idempotent by construction: two runs at the same moment converge on the
 * same state and the loser simply reports zero rows. This is also the most
 * frequent task, so taking a lease on it would add a database write every
 * minute to protect against something that cannot go wrong.
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

/**
 * Sends the weekly digest to every active subscriber.
 *
 * The one task where at-least-once delivery from the scheduler is not
 * acceptable: a retry means a second copy in every subscriber's inbox. The
 * lease gives mutual exclusion (the cron cannot overlap an admin pressing "Send
 * digest") and the ISO-week key gives replay protection (a retry inside the
 * same week is skipped because that week's digest already went out).
 *
 * `runKey` is a parameter rather than a constant so an admin sending manually
 * can pass none: they still cannot collide with a run in flight, but they are
 * explicitly asking to send now, and that intent should not be swallowed by a
 * key that says "this week is done".
 */
const sendNewsletterDigest = async ({ runKey = isoWeekKey() } = {}) =>
  withLease("newsletter-digest", { runKey, ttlMs: 10 * 60 * 1000 }, () =>
    newsletterService.sendDigest()
  );

/**
 * Expires short-lived counters and trims data past its retention window.
 *
 * Each statement is an idempotent delete, so correctness does not depend on the
 * lease — but these are bulk deletes over two tables, and letting a retry pile a
 * second sweep on top of one still running is pointless load on a shared-core
 * database. The day key also keeps a retry from re-sweeping within the same day.
 */
const runMaintenance = async ({ runKey = dayKey() } = {}) =>
  withLease("maintenance", { runKey, ttlMs: 5 * 60 * 1000 }, () => maintenanceWork());

const maintenanceWork = async () => {
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
