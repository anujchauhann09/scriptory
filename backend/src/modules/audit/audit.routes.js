const { Router } = require("express");
const { listAudit } = require("../../utils/audit");
const { sendSuccess } = require("../../utils/response");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");

const router = Router();

// ADMIN ONLY — recent security/admin activity.
router.get("/", authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const logs = await listAudit();
    return sendSuccess(res, 200, "Audit log fetched", logs);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
