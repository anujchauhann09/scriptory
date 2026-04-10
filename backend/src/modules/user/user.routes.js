const { Router } = require("express");
const userController = require("./user.controller");
const authMiddleware = require("../../middleware/auth.middleware");

const router = Router();
router.use(authMiddleware);

router.get("/me", userController.getMe);
router.patch("/me/profile", userController.updateProfile);

module.exports = router;
