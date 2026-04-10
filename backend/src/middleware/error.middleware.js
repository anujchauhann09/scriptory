const logger = require("../utils/logger");
const { sendError } = require("../utils/response");


const errorMiddleware = (err, req, res, next) => {
  logger.error(err.message, {
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Prisma known errors
  if (err.code === "P2002") {
    const field = err.meta?.target?.[0] || "field";
    return sendError(res, 409, `A record with this ${field} already exists`);
  }
  if (err.code === "P2025") {
    return sendError(res, 404, "Record not found");
  }

  // JWT errors 
  if (err.name === "JsonWebTokenError") {
    return sendError(res, 401, "Invalid token");
  }

  const statusCode = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === "production" && statusCode === 500
      ? "Internal server error"
      : err.message || "Internal server error";

  return sendError(res, statusCode, message);
};

module.exports = errorMiddleware;
