const { sendSuccess, sendError } = require("../../utils/response");
const storageService = require("../storage/storage.service");

const uploadImage = (kind) => async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 400, "No file provided");
    }

    const uploaded = await storageService.uploadImage(kind, req.file);
    return sendSuccess(res, 200, "Image uploaded", {
      url: uploaded.url,
      publicId: uploaded.publicId,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadImage };
