const { Router } = require("express");
const Joi = require("joi");
const { listAudit } = require("../../utils/audit");
const { sendSuccess } = require("../../utils/response");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");
const { validate, validated } = require("../../middleware/validate.middleware");

const router = Router();

const querySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(500).default(200),
  action: Joi.string().trim().max(60).optional(),
});

// ADMIN ONLY — recent security/admin activity.
router.get(
  "/",
  authMiddleware,
  adminMiddleware,
  validate(querySchema, "query"),
  async (req, res, next) => {
    try {
      const { limit, action } = validated(req, "query");
      const logs = await listAudit({ limit, action });
      // Audit records carry actor emails and client IPs; they must never sit in
      // a shared cache or a browser's back-forward cache.
      res.set("Cache-Control", "no-store");
      return sendSuccess(res, 200, "Audit log fetched", logs);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
