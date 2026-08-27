const jwt = require("jsonwebtoken");
const prisma = require("../config/db");
const { sendError } = require("../utils/response");
const config = require("../config/env");

// prefer the httpOnly cookie (not readable by JS → safe from XSS token theft).
// Fall back to a Bearer header for API clients / tooling
const extractToken = (req) => {
  if (req.cookies && req.cookies[config.cookie.name]) {
    return { token: req.cookies[config.cookie.name], source: "cookie" };
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return { token: authHeader.slice(7).trim(), source: "bearer" };
  }
  return { token: null, source: null };
};

/**
 * Verification options.
 *
 * `algorithms` is the important one: without it, `jwt.verify` accepts whatever
 * algorithm the token's own header declares, which is how the classic
 * confused-deputy attacks work (swap HS256 for "none", or for RS256 so the
 * public key gets used as an HMAC secret). Pinning it to the algorithm we
 * actually sign with removes that choice from the attacker.
 *
 * `issuer`/`audience` bind the token to this service, so a token minted by
 * anything else that shares the secret is rejected here.
 */
const VERIFY_OPTIONS = {
  algorithms: ["HS256"],
  issuer: config.jwtIssuer,
  audience: config.jwtAudience,
};

/** Drops a cookie the server has just decided is unusable, so the browser stops
 *  resending it on every subsequent request. */
const clearStaleCookie = (res) => {
  res.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: "/",
  });
};

const authMiddleware = async (req, res, next) => {
  try {
    const { token, source } = extractToken(req);
    if (!token) {
      return sendError(res, 401, "Authentication required");
    }

    const decoded = jwt.verify(token, config.jwtSecret, VERIFY_OPTIONS);

    const user = await prisma.user.findUnique({
      where: { uuid: decoded.userUuid },
      select: {
        id: true,
        uuid: true,
        email: true,
        role: true,
        tokenVersion: true,
        twoFactorEnabled: true,
      },
    });

    if (!user) {
      if (source === "cookie") clearStaleCookie(res);
      return sendError(res, 401, "User no longer exists");
    }

    // reject tokens minted before the current version (revoked sessions)
    if (typeof decoded.tv !== "number" || decoded.tv !== user.tokenVersion) {
      if (source === "cookie") clearStaleCookie(res);
      return sendError(res, 401, "Session expired, please sign in again");
    }

    req.user = user;
    req.authSource = source;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      clearStaleCookie(res);
      return sendError(res, 401, "Token expired");
    }
    if (err.name === "JsonWebTokenError" || err.name === "NotBeforeError") {
      clearStaleCookie(res);
      return sendError(res, 401, "Invalid token");
    }
    next(err);
  }
};

module.exports = authMiddleware;
module.exports.VERIFY_OPTIONS = VERIFY_OPTIONS;
module.exports.clearStaleCookie = clearStaleCookie;
