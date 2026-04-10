const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage for cover images (article covers)
const coverStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "scriptory/covers",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "avif"],
    transformation: [{ width: 1200, height: 630, crop: "fill", quality: "auto" }],
  },
});

// Storage for inline article images (body images)
const inlineStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "scriptory/inline",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "avif", "gif"],
    transformation: [{ width: 1200, quality: "auto" }],
  },
});

const uploadCover = multer({
  storage: coverStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const uploadInline = multer({
  storage: inlineStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "scriptory/avatars",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 200, height: 200, crop: "fill", gravity: "face", quality: "auto" }],
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
});

module.exports = { cloudinary, uploadCover, uploadInline, uploadAvatar };
