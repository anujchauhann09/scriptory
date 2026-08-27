const { Router } = require("express");
const authController = require("./auth.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const limits = require("../../middleware/rateLimit.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  codeSchema,
} = require("./auth.validation");

const router = Router();

// PUBLIC
router.post("/register", limits.register, validate(registerSchema), authController.register);
router.post("/login", limits.auth, validate(loginSchema), authController.login);
// Logout only clears a cookie; rate limiting it would strand a user who cannot
// sign out, which is strictly worse than the non-existent abuse case.
router.post("/logout", authController.logout);

// AUTHENTICATED
router.post("/logout-all", authMiddleware, authController.logoutAll);
router.post(
  "/change-password",
  authMiddleware,
  limits.auth,
  validate(changePasswordSchema),
  authController.changePassword
);
router.post("/2fa/setup", authMiddleware, limits.twoFactor, authController.setupTwoFactor);
router.post(
  "/2fa/enable",
  authMiddleware,
  limits.twoFactor,
  validate(codeSchema),
  authController.enableTwoFactor
);
router.post(
  "/2fa/disable",
  authMiddleware,
  limits.twoFactor,
  validate(codeSchema),
  authController.disableTwoFactor
);

module.exports = router;
