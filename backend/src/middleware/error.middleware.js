const logger = require("../utils/logger");
const { sendError } = require("../utils/response");

/**
 * Prisma error codes that map to a meaningful, safe client response.
 *
 * Everything not listed here becomes a generic 500. That is deliberate: raw
 * driver errors carry table names, column names, constraint names and
 * occasionally parameter values, and handing those to a caller is a free
 * schema-disclosure primitive for anyone probing the API.
 */
const PRISMA_ERRORS = {
  P2002: (err) => ({
    status: 409,
    message: `A record with this ${err.meta?.target?.[0] || "value"} already exists`,
  }),
  P2025: () => ({ status: 404, message: "Record not found" }),
  P2003: () => ({ status: 409, message: "Related record is missing or still in use" }),
  P2000: () => ({ status: 400, message: "A submitted value is too long" }),
  // Connection-pool exhaustion and connection failures: retryable, and the
  // status code is what tells a load balancer or client that.
  P2024: () => ({ status: 503, message: "Service is busy, please retry in a moment" }),
  P1001: () => ({ status: 503, message: "Service temporarily unavailable" }),
  P1002: () => ({ status: 503, message: "Service temporarily unavailable" }),
  P1008: () => ({ status: 504, message: "The request took too long, please try again" }),
  P1017: () => ({ status: 503, message: "Service temporarily unavailable" }),
};

const errorMiddleware = (err, req, res, _next) => {
  const requestId = req.id;

  // Body-parser failures arrive here: malformed JSON, or a payload over the
  // route's size limit. Both are client mistakes, not server faults.
  if (err.type === "entity.too.large") {
    logger.warn("Rejected oversized request body", { path: req.path, requestId });
    return sendError(res, 413, "Request body is too large");
  }
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return sendError(res, 400, "Request body is not valid JSON");
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return sendError(res, 413, "Uploaded file is too large");
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
    return sendError(res, 400, "Unexpected file upload");
  }

  const prismaMapping = PRISMA_ERRORS[err.code];
  if (prismaMapping) {
    const { status, message } = prismaMapping(err);
    // Infrastructure-class failures deserve error level; conflicts do not.
    const level = status >= 500 ? "error" : "warn";
    logger[level]("Database error", { code: err.code, status, path: req.path, requestId });
    return sendError(res, status, message);
  }

  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return sendError(res, 401, "Invalid token");
  }

  const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;

  // Only unexpected failures carry a stack; a deliberate 4xx thrown by a
  // service is control flow and logging its stack is noise that buries the
  // real incidents.
  if (statusCode >= 500) {
    logger.error(err.message || "Unhandled error", {
      stack: err.stack,
      path: req.path,
      method: req.method,
      requestId,
    });
  } else {
    logger.warn(err.message || "Request rejected", {
      status: statusCode,
      path: req.path,
      method: req.method,
      requestId,
    });
  }

  /**
   * A 500 means something the code did not anticipate — the message may quote a
   * query, a file path, or an upstream response. Client-facing 4xx messages are
   * written by this codebase and are safe to pass through.
   */
  const message =
    statusCode >= 500 ? "Internal server error" : err.message || "Request could not be processed";

  // The request id lets a user quote something an operator can grep for,
  // without exposing anything about what actually failed.
  return sendError(res, statusCode, message, statusCode >= 500 && requestId ? { requestId } : null);
};

module.exports = errorMiddleware;
