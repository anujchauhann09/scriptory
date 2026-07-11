const cron = require("node-cron");
const prisma = require("./config/db");
const logger = require("./utils/logger");
const newsletterService = require("./modules/newsletter/newsletter.service");

// Auto-publish scheduled drafts whose publishAt has passed. Runs every minute.
const publishScheduledDrafts = async () => {
  try {
    const result = await prisma.article.updateMany({
      where: { published: false, publishAt: { not: null, lte: new Date() } },
      data: { published: true },
    });
    if (result.count > 0) logger.info(`Scheduler: auto-published ${result.count} article(s)`);
  } catch (err) {
    logger.error(`Draft scheduler failed: ${err.message}`);
  }
};

const startScheduler = () => {
  cron.schedule("* * * * *", publishScheduledDrafts);
  logger.info("Scheduler: draft auto-publish enabled (every minute)");

  // Weekly newsletter digest — opt-in (sends real emails).
  if (process.env.NEWSLETTER_DIGEST_ENABLED === "true") {
    const expr = process.env.NEWSLETTER_DIGEST_CRON || "0 9 * * 1"; // Mondays 09:00
    if (cron.validate(expr)) {
      cron.schedule(expr, async () => {
        try {
          const r = await newsletterService.sendDigest();
          logger.info(`Scheduler: ${r.message}`);
        } catch (err) {
          logger.error(`Digest cron failed: ${err.message}`);
        }
      });
      logger.info(`Scheduler: newsletter digest enabled (${expr})`);
    } else {
      logger.warn(`Invalid NEWSLETTER_DIGEST_CRON: "${expr}" — digest disabled`);
    }
  }
};

module.exports = { startScheduler };
