const { sendSuccess, sendError } = require("../../utils/response");


const uploadImage = (req, res) => {
  if (!req.file) {
    return sendError(res, 400, "No file provided");
  }

  return sendSuccess(res, 200, "Image uploaded", {
    url: req.file.path,          // Cloudinary secure URL
    publicId: req.file.filename, // Cloudinary public_id (for deletion later)
  });
};

module.exports = { uploadImage };
