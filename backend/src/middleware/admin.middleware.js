const { sendError } = require("../utils/response");


const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return sendError(res, 403, "Admin access required");
  }
  next();
};

module.exports = adminMiddleware;
