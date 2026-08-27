const { Router } = require("express");
const Joi = require("joi");
const contactController = require("./contact.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");
const limits = require("../../middleware/rateLimit.middleware");
const { validate } = require("../../middleware/validate.middleware");
const { contactSchema } = require("./contact.validation");

const router = Router();

const uuidParam = Joi.object({
  uuid: Joi.string().guid({ version: ["uuidv4"] }).required(),
}).unknown(true);

const handledSchema = Joi.object({ handled: Joi.boolean().required() });

// PUBLIC — unauthenticated and sends two emails per submission, so it carries
// the strictest write limit on the site.
router.post("/", limits.contactWrite, validate(contactSchema), contactController.submit);

// ADMIN ONLY
router.get("/", authMiddleware, adminMiddleware, contactController.list);
router.patch(
  "/:uuid",
  authMiddleware,
  adminMiddleware,
  limits.write,
  validate(uuidParam, "params"),
  validate(handledSchema),
  contactController.update
);
router.delete(
  "/:uuid",
  authMiddleware,
  adminMiddleware,
  limits.write,
  validate(uuidParam, "params"),
  contactController.remove
);

module.exports = router;
