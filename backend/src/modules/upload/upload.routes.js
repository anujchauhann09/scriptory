const { Router } = require("express");
const { uploadCover, uploadInline, uploadAvatar } = require("../../config/cloudinary");
const { uploadImage } = require("./upload.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");
const limits = require("../../middleware/rateLimit.middleware");

const router = Router();

/**
 * Middleware order is load-bearing: authenticate, authorise, then rate limit,
 * and only then let multer start consuming the body. Any other order streams an
 * unauthenticated multi-megabyte upload into paid third-party storage before
 * the request is rejected.
 */
router.post(
  "/cover",
  authMiddleware,
  adminMiddleware,
  limits.upload,
  uploadCover.single("image"),
  uploadImage
);
router.post(
  "/inline",
  authMiddleware,
  adminMiddleware,
  limits.upload,
  uploadInline.single("image"),
  uploadImage
);

// Open to every signed-in user, so the per-account limit is what bounds the
// storage bill here.
router.post("/avatar", authMiddleware, limits.upload, uploadAvatar.single("image"), uploadImage);

module.exports = router;
