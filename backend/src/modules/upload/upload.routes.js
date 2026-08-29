const { Router } = require("express");
const storageService = require("../storage/storage.service");
const { uploadImage, uploadMedia } = require("./upload.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");
const limits = require("../../middleware/rateLimit.middleware");

const router = Router();

/**
 * Middleware order is load-bearing: authenticate, authorise, then rate limit,
 * and only then let multer start consuming the body. Any other order streams an
 * unauthenticated multi-megabyte upload into paid storage before rejection.
 */
router.post(
  "/cover",
  authMiddleware,
  adminMiddleware,
  limits.upload,
  storageService.uploadMiddleware("cover"),
  uploadImage("cover")
);
router.post(
  "/inline",
  authMiddleware,
  adminMiddleware,
  limits.upload,
  storageService.uploadMiddleware("inline"),
  uploadImage("inline")
);
router.post(
  "/video",
  authMiddleware,
  adminMiddleware,
  limits.upload,
  storageService.uploadMiddleware("video"),
  uploadMedia("video")
);

// Open to every signed-in user, so the per-account limit is what bounds storage cost.
router.post(
  "/avatar",
  authMiddleware,
  limits.upload,
  storageService.uploadMiddleware("avatar"),
  uploadImage("avatar")
);

module.exports = router;
