const crypto = require("crypto");
const path = require("path");
const multer = require("multer");
const { Storage } = require("@google-cloud/storage");
const config = require("../../config/env");

const MEDIA_MIMES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/gif": [".gif"],
  "video/mp4": [".mp4"],
};

const PROFILES = {
  cover: {
    maxBytes: 5 * 1024 * 1024,
    allowedMimes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    namespace: () => "images/covers",
    fieldName: "image",
  },
  inline: {
    maxBytes: 5 * 1024 * 1024,
    allowedMimes: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"],
    namespace: (file) => (file.mimetype === "image/gif" ? "gifs/inline" : "images/inline"),
    fieldName: "image",
  },
  avatar: {
    maxBytes: 2 * 1024 * 1024,
    allowedMimes: ["image/jpeg", "image/png", "image/webp"],
    namespace: () => "images/avatars",
    fieldName: "image",
  },
  video: {
    maxBytes: 50 * 1024 * 1024,
    allowedMimes: ["video/mp4"],
    namespace: () => "videos/articles",
    fieldName: "video",
  },
};

const safeOriginalName = (name = "") =>
  path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "upload";

const extensionFor = (file) => {
  const allowed = MEDIA_MIMES[file.mimetype] || [];
  const ext = path.extname(file.originalname || "").toLowerCase();
  return allowed.includes(ext) ? ext : allowed[0];
};

const assertKnownObjectName = (objectName) => {
  if (typeof objectName !== "string" || objectName.length < 10 || objectName.length > 300) {
    const err = new Error("Invalid media object");
    err.statusCode = 400;
    throw err;
  }
  if (!/^(images|gifs|videos)\/[a-z0-9/_-]+\.[a-z0-9]+$/i.test(objectName) || objectName.includes("..")) {
    const err = new Error("Invalid media object");
    err.statusCode = 400;
    throw err;
  }
};

const encodeObjectName = (objectName) => Buffer.from(objectName, "utf8").toString("base64url");
const decodeObjectToken = (token) => {
  if (!/^[A-Za-z0-9_-]+$/.test(token || "")) {
    const err = new Error("Invalid media token");
    err.statusCode = 400;
    throw err;
  }
  const objectName = Buffer.from(token, "base64url").toString("utf8");
  assertKnownObjectName(objectName);
  return objectName;
};

class GCSStorage {
  constructor({ bucketName = config.media.bucket, apiUrl = config.apiUrl, storage } = {}) {
    this.bucketName = bucketName;
    this.apiUrl = apiUrl;
    this.storage = storage || new Storage();
  }

  bucket() {
    if (!this.bucketName) {
      const err = new Error("GCS_MEDIA_BUCKET is not configured");
      err.statusCode = 500;
      throw err;
    }
    return this.storage.bucket(this.bucketName);
  }

  mediaUrl(objectName) {
    const base = this.apiUrl || "";
    return `${base}/api/media/${encodeObjectName(objectName)}`;
  }

  objectNameFor(kind, file) {
    const profile = PROFILES[kind];
    const namespace = profile.namespace(file);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
    return `${namespace}/${today}/${crypto.randomUUID()}${extensionFor(file)}`;
  }

  async upload({ kind, file }) {
    const objectName = this.objectNameFor(kind, file);
    const object = this.bucket().file(objectName);
    try {
      await object.save(file.buffer, {
        resumable: false,
        metadata: {
          contentType: file.mimetype,
          cacheControl: "public, max-age=31536000, immutable",
          metadata: { originalName: safeOriginalName(file.originalname) },
        },
      });
    } catch (err) {
      try { await object.delete({ ignoreNotFound: true }); } catch {}
      throw err;
    }

    return {
      provider: "gcs",
      bucket: this.bucketName,
      publicId: objectName,
      url: this.mediaUrl(objectName),
    };
  }

  async delete(publicId) {
    assertKnownObjectName(publicId);
    try {
      await this.bucket().file(publicId).delete({ ignoreNotFound: true });
      return { deleted: true };
    } catch (err) {
      if (err.code === 404) return { deleted: false };
      throw err;
    }
  }

  async readByToken(token) {
    const objectName = decodeObjectToken(token);
    const file = this.bucket().file(objectName);
    const [exists] = await file.exists();
    if (!exists) {
      const err = new Error("Media not found");
      err.statusCode = 404;
      throw err;
    }
    const [metadata] = await file.getMetadata();
    return {
      objectName,
      contentType: metadata.contentType || "application/octet-stream",
      cacheControl: metadata.cacheControl || "public, max-age=31536000, immutable",
      stream: file.createReadStream(),
    };
  }
}

let provider = new GCSStorage();

const setStorageProviderForTest = (nextProvider) => {
  provider = nextProvider;
};

const getStorageProvider = () => provider;

const uploadMedia = (kind, file) => getStorageProvider().upload({ kind, file });
const uploadImage = uploadMedia;
const deleteObject = (publicId) => getStorageProvider().delete(publicId);
const readByToken = (token) => getStorageProvider().readByToken(token);

const imageFilter = (kind) => (req, file, cb) => {
  const profile = PROFILES[kind];
  const ext = path.extname(file.originalname || "").toLowerCase();
  const allowedExts = MEDIA_MIMES[file.mimetype] || [];
  if (!profile || !profile.allowedMimes.includes(file.mimetype) || !allowedExts.includes(ext)) {
    const err = new Error(
      kind === "avatar"
        ? "Only JPEG, PNG or WebP images are accepted"
        : kind === "cover"
          ? "Only JPEG, PNG, WebP or AVIF images are accepted"
          : kind === "video"
          ? "Only MP4 videos are accepted"
          : "Only JPEG, PNG, WebP, AVIF or GIF images are accepted"
    );
    err.statusCode = 400;
    return cb(err);
  }
  cb(null, true);
};

const uploadMiddleware = (kind) => {
  const profile = PROFILES[kind];
  return multer({
    storage: multer.memoryStorage(),
    fileFilter: imageFilter(kind),
    limits: { fileSize: profile.maxBytes, files: 1, fields: 5 },
  }).single(profile.fieldName);
};

module.exports = {
  GCSStorage,
  PROFILES,
  decodeObjectToken,
  deleteObject,
  getStorageProvider,
  setStorageProviderForTest,
  uploadImage,
  uploadMedia,
  uploadMiddleware,
  readByToken,
};
