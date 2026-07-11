const { Router } = require("express");
const analyticsService = require("./analytics.service");
const { sendSuccess } = require("../../utils/response");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");

const router = Router();

// ADMIN ONLY — dashboard overview stats.
router.get("/", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const data = await analyticsService.getOverview();
    return sendSuccess(res, 200, "Analytics fetched", data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
