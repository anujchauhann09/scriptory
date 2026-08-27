const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const { readSecret } = require("./secrets");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: readSecret("CLOUDINARY_API_SECRET"),
  secure: true,
});

/**
 * Reject anything that is not an image before a byte is streamed to storage.
 *
 * multer's `limits` bound the size but say nothing about the type, and the
 * storage engine only learns the format after the upload completes — so
 * without this, an arbitrary file is transferred and paid for before being
 * rejected. Checking the declared MIME type and the extension together closes
 * the trivial cases; the storage engine's own `allowed_formats` remains the
 * authority, since it inspects actual file contents.
 */
const IMAGE_MIME = /^image\/(jpeg|png|webp|avif|gif)$/;
const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif)$/i;

const imageOnly = (req, file, cb) => {
  if (!IMAGE_MIME.test(file.mimetype) || !IMAGE_EXT.test(file.originalname || "")) {
    const err = new Error("Only JPEG, PNG, WebP, AVIF or GIF images are accepted");
    err.statusCode = 400;
    return cb(err);
  }
  cb(null, true);
};

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

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "scriptory/avatars",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 200, height: 200, crop: "fill", gravity: "face", quality: "auto" }],
  },
});

// `files: 1` stops a multi-part body smuggling extra attachments past the
// single-file handler.
const uploadCover = multer({
  storage: coverStorage,
  fileFilter: imageOnly,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
});

const uploadInline = multer({
  storage: inlineStorage,
  fileFilter: imageOnly,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: imageOnly,
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 },
});

const isConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && readSecret("CLOUDINARY_API_SECRET")
);

module.exports = { cloudinary, uploadCover, uploadInline, uploadAvatar, isConfigured };
