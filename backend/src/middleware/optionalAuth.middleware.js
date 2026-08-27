const jwt = require("jsonwebtoken");
const prisma = require("../config/db");
const config = require("../config/env");
const { VERIFY_OPTIONS } = require("./auth.middleware");

/**
 * Attaches `req.user` when a valid session is present and does nothing
 * otherwise, so a handler can vary its response for signed-in callers without
 * requiring authentication.
 *
 * Anything this populates is an input to an authorisation decision, so it holds
 * to exactly the same verification rules as the strict middleware — same pinned
 * algorithm, same issuer/audience, same token-version revocation check. A
 * "soft" middleware that verified less would just be the strict one with a
 * bypass.
 */
const optionalAuth = async (req, _res, next) => {
  try {
    const token =
      (req.cookies && req.cookies[config.cookie.name]) ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7).trim()
        : null);
    if (!token) return next();

    const decoded = jwt.verify(token, config.jwtSecret, VERIFY_OPTIONS);

    const user = await prisma.user.findUnique({
      where: { uuid: decoded.userUuid },
      select: { id: true, uuid: true, email: true, role: true, tokenVersion: true },
    });

    // Honour session revocation here too.
    if (user && decoded.tv === user.tokenVersion) req.user = user;
  } catch {
    // invalid/expired token — continue as anonymous
  }
  next();
};

module.exports = optionalAuth;
