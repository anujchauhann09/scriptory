const { Router } = require("express");
const { uploadCover, uploadInline, uploadAvatar } = require("../../config/cloudinary");
const { uploadImage } = require("./upload.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");

const router = Router();

router.post("/cover", authMiddleware, adminMiddleware, uploadCover.single("image"), uploadImage);
router.post("/inline", authMiddleware, adminMiddleware, uploadInline.single("image"), uploadImage);

router.post("/avatar", authMiddleware, uploadAvatar.single("image"), uploadImage);

module.exports = router;
