const { Router } = require("express");
const Joi = require("joi");
const newsletterController = require("./newsletter.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");
const limits = require("../../middleware/rateLimit.middleware");
const { validate } = require("../../middleware/validate.middleware");
const { subscribeSchema } = require("./newsletter.validation");

const router = Router();

const uuidParam = Joi.object({
  uuid: Joi.string().guid({ version: ["uuidv4"] }).required(),
}).unknown(true);

// PUBLIC
router.post("/subscribe", limits.newsletterWrite, validate(subscribeSchema), newsletterController.subscribe);
// GET is read-only by design, so email scanners prefetching the link cannot
// unsubscribe anyone; only the POST changes state.
router.get("/unsubscribe", limits.unsubscribe, newsletterController.unsubscribeConfirm);
router.post("/unsubscribe", limits.unsubscribe, newsletterController.unsubscribe);

// ADMIN ONLY
router.get("/subscribers", authMiddleware, adminMiddleware, newsletterController.list);
router.delete(
  "/subscribers/:uuid",
  authMiddleware,
  adminMiddleware,
  limits.write,
  validate(uuidParam, "params"),
  newsletterController.remove
);
// Fans out one email per subscriber, so it is limited far more tightly than an
// ordinary admin write — a double submission means a duplicate broadcast.
router.post("/digest", authMiddleware, adminMiddleware, limits.broadcast, newsletterController.digest);

module.exports = router;
