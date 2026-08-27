const { Router } = require("express");
const likeController = require("./like.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const optionalAuth = require("../../middleware/optionalAuth.middleware");
const limits = require("../../middleware/rateLimit.middleware");

const router = Router();

router.get("/:slug/likes", optionalAuth, likeController.getLikeStatus);
router.post("/:slug/likes", authMiddleware, limits.write, likeController.toggleLike);

module.exports = router;
