const { sendError } = require("../utils/response");
const logger = require("../utils/logger");

/**
 * Role gate for administrative endpoints.
 *
 * Ordering matters: this must always be mounted after `authMiddleware`, which
 * is what populates `req.user` from a verified token. The explicit `!req.user`
 * check makes a mis-ordered route fail closed rather than reading `role` off
 * undefined and throwing a 500 that could be mistaken for a transient error.
 */
const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return sendError(res, 401, "Authentication required");
  }
  if (req.user.role !== "ADMIN") {
    // Worth recording: a signed-in non-admin probing an admin route is a
    // meaningful signal, unlike an anonymous 401.
    logger.warn("Denied non-admin access to admin route", {
      path: req.path,
      method: req.method,
      actor: req.user.uuid,
      requestId: req.id,
    });
    return sendError(res, 403, "Admin access required");
  }
  next();
};

module.exports = adminMiddleware;
