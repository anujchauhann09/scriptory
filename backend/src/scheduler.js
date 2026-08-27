const cron = require("node-cron");
const config = require("./config/env");
const platform = require("./config/platform");
const logger = require("./utils/logger");
const tasks = require("./modules/internal/internal.tasks");

/**
 * In-process background work.
 *
 * This is only correct for a deployment that runs exactly one long-lived
 * instance. Under an autoscaler it is wrong in both directions:
 *
 *   - scale to zero means no container exists at the scheduled moment, so the
 *     job silently never runs;
 *   - scale out means every container runs it, so the job runs N times.
 *
 * For an idempotent job like publishing due drafts, running N times is
 * harmless. For the newsletter digest it means N copies of the same email to
 * every subscriber, which is why the digest is never started here on a
 * serverless platform — SCHEDULER_MODE defaults to "external" there, and an
 * external scheduler calls the task endpoints exactly once instead.
 */
const started = [];

const safely = (name, fn) => async () => {
  try {
    const result = await fn();
    if (result && Object.values(result).some((v) => typeof v === "number" && v > 0)) {
      logger.info("Scheduled task ran", { task: name, ...result });
    }
  } catch (err) {
    // A throw inside a cron tick is unhandled and would take the process down.
    logger.error("Scheduled task failed", { task: name, message: err.message });
  }
};

const schedule = (name, expression, fn) => {
  if (!cron.validate(expression)) {
    logger.warn("Invalid cron expression, task disabled", { task: name, expression });
    return;
  }
  const job = cron.schedule(expression, safely(name, fn));
  started.push({ name, expression, job });
  logger.info("Scheduled task registered", { task: name, expression });
};

const startScheduler = () => {
  if (config.schedulerMode === "off") {
    logger.info("Scheduler disabled (SCHEDULER_MODE=off)");
    return { mode: "off", tasks: [] };
  }

  if (config.schedulerMode === "external") {
    logger.info("Scheduler delegated to an external trigger", {
      platform: platform.name,
      endpoints: [
        "POST /internal/tasks/publish-scheduled",
        "POST /internal/tasks/newsletter-digest",
        "POST /internal/tasks/maintenance",
      ],
    });
    return { mode: "external", tasks: [] };
  }

  // Idempotent, so duplicate execution across instances is safe.
  schedule(
    "publish-scheduled",
    process.env.PUBLISH_SCHEDULE_CRON || "* * * * *",
    tasks.publishScheduledDrafts
  );

  schedule("maintenance", process.env.MAINTENANCE_CRON || "17 3 * * *", tasks.runMaintenance);

  // Opt-in, and only ever from a single-instance deployment: this one sends
  // real email and duplicate runs are visible to every subscriber.
  if (process.env.NEWSLETTER_DIGEST_ENABLED === "true") {
    if (platform.maxInstances > 1) {
      logger.warn(
        "Newsletter digest cron refused: MAX_INSTANCES > 1 would send duplicate emails. Drive it from an external scheduler via POST /internal/tasks/newsletter-digest instead.",
        { maxInstances: platform.maxInstances }
      );
    } else {
      schedule(
        "newsletter-digest",
        process.env.NEWSLETTER_DIGEST_CRON || "0 9 * * 1",
        tasks.sendNewsletterDigest
      );
    }
  }

  return { mode: "cron", tasks: started.map((t) => ({ name: t.name, expression: t.expression })) };
};

/** Stops every timer so a shutdown is not held open by a pending tick. */
const stopScheduler = () => {
  for (const { job } of started) {
    try {
      job.stop();
    } catch {
      /* already stopped */
    }
  }
  started.length = 0;
};

module.exports = { startScheduler, stopScheduler };
