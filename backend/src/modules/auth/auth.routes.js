const { Router } = require("express");
const authController = require("./auth.controller");
const authMiddleware = require("../../middleware/auth.middleware");

const router = Router();

// PUBLIC
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", authController.logout);

// AUTHENTICATED
router.post("/change-password", authMiddleware, authController.changePassword);
router.post("/2fa/setup", authMiddleware, authController.setupTwoFactor);
router.post("/2fa/enable", authMiddleware, authController.enableTwoFactor);
router.post("/2fa/disable", authMiddleware, authController.disableTwoFactor);

module.exports = router;
