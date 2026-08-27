const { Router } = require("express");
const userController = require("./user.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const limits = require("../../middleware/rateLimit.middleware");
const { validate } = require("../../middleware/validate.middleware");
const { updateProfileSchema } = require("./user.validation");

const router = Router();
router.use(authMiddleware);

// Always scoped to req.user.uuid from the verified token — never to an id taken
// from the path or body, which is what would make this an IDOR.
router.get("/me", userController.getMe);
router.patch(
  "/me/profile",
  limits.write,
  validate(updateProfileSchema),
  userController.updateProfile
);

module.exports = router;
