const crypto = require("crypto");
const { Router } = require("express");
const config = require("../../config/env");
const logger = require("../../utils/logger");
const { sendSuccess, sendError } = require("../../utils/response");
const limits = require("../../middleware/rateLimit.middleware");
const tasks = require("./internal.tasks");

const router = Router();

/**
 * Endpoints for an external scheduler to drive background work.
 *
 * Why these exist: the in-process cron only runs while a container is alive. On
 * a platform that scales to zero there may be no container at 09:00, and when
 * traffic is high there may be six — so a weekly digest would be sent zero
 * times or six times, never once. Moving the trigger outside the app makes the
 * schedule exact and the app itself stateless, which is what the platform wants
 * anyway. Any scheduler can call these: a cloud scheduler, a CI cron, or curl.
 *
 * Authentication is a shared bearer secret compared in constant time. These
 * routes must never be reachable without it, so an unset token disables them
 * entirely rather than leaving them open.
 */
const timingSafeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  // timingSafeEqual throws on length mismatch, and the lengths themselves are
  // not secret, so compare them first and keep the comparison constant-time
  // for equal-length candidates.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const requireTaskToken = (req, res, next) => {
  if (!config.taskRunnerToken) {
    // Fail closed: no configured secret means the feature is off, not open.
    return sendError(res, 404, "The requested resource was not found.");
  }

  const header = req.get("authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : req.get("x-task-token");

  if (!presented || !timingSafeEqual(presented, config.taskRunnerToken)) {
    logger.warn("Rejected internal task call", { path: req.path, requestId: req.id });
    return sendError(res, 401, "Unauthorized");
  }

  next();
};

router.use(limits.internal);
router.use(requireTaskToken);

const run = (name, fn) => async (req, res, next) => {
  try {
    const started = Date.now();
    const result = await fn();
    logger.info("Scheduled task completed", { task: name, durationMs: Date.now() - started, ...result });
    return sendSuccess(res, 200, `Task "${name}" completed`, result);
  } catch (err) {
    next(err);
  }
};

// Flips scheduled drafts whose publishAt has passed. Idempotent, so running it
// twice concurrently is harmless — call it as often as the schedule needs.
router.post("/tasks/publish-scheduled", run("publish-scheduled", tasks.publishScheduledDrafts));

// Sends the newsletter digest. NOT idempotent: it mails every subscriber, so it
// must be driven by exactly one scheduled trigger, never by an in-process timer
// running on every instance.
router.post("/tasks/newsletter-digest", run("newsletter-digest", tasks.sendNewsletterDigest));

// Housekeeping: expire throttle counters and trim the audit log.
router.post("/tasks/maintenance", run("maintenance", tasks.runMaintenance));

module.exports = router;
