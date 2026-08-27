const { Router } = require("express");
const prisma = require("../../config/db");
const platform = require("../../config/platform");
const logger = require("../../utils/logger");

const router = Router();

/**
 * Two distinct probes, because they answer different questions and a platform
 * reacts differently to each.
 *
 * Liveness ("is the process wedged?") must not touch the database. If it did, a
 * database blip would make every container look dead, the orchestrator would
 * restart all of them at once, and a recoverable dependency failure would
 * become a full outage plus a thundering herd of cold starts.
 *
 * Readiness ("should this container receive traffic?") does check the database,
 * because a container that cannot query is not useful and should be taken out
 * of rotation until it can.
 */

// Liveness — process-local only. Cheap enough to be polled frequently.
router.get("/healthz", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ success: true, status: "ok", instance: platform.instanceId });
});

// Readiness — verifies the database round trip.
router.get("/readyz", async (req, res) => {
  res.set("Cache-Control", "no-store");

  // Bounded, so a hung connection cannot hold the probe open until the
  // platform's own timeout and stall the rollout.
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("readiness probe timed out")), 3000)
  );

  try {
    await Promise.race([prisma.ping(), timeout]);
    res.json({ success: true, status: "ready" });
  } catch (err) {
    logger.warn("Readiness probe failed", { message: err.message });
    // 503, not 500: this is "not ready yet", which is a retryable state.
    res.status(503).json({ success: false, status: "not-ready" });
  }
});

/**
 * Pre-existing health path, kept so anything already pointed at it (uptime
 * monitors, the platform's default probe) does not break. Behaves as liveness.
 */
router.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ success: true, message: "Scriptory API is running" });
});

module.exports = router;
