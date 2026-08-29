const { sendSuccess, sendError } = require("../../utils/response");
const storageService = require("../storage/storage.service");

const uploadMedia = (kind) => async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 400, "No file provided");
    }

    const uploaded = await storageService.uploadMedia(kind, req.file);
    return sendSuccess(res, 200, kind === "video" ? "Video uploaded" : "Image uploaded", {
      url: uploaded.url,
      publicId: uploaded.publicId,
    });
  } catch (err) {
    next(err);
  }
};

const uploadImage = uploadMedia;

module.exports = { uploadImage, uploadMedia };
