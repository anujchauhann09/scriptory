const jwt = require("jsonwebtoken");
const prisma = require("../config/db");
const { sendError } = require("../utils/response");
const config = require("../config/env");

// prefer the httpOnly cookie (not readable by JS → safe from XSS token theft).
// Fall back to a Bearer header for API clients / tooling
const extractToken = (req) => {
  if (req.cookies && req.cookies[config.cookie.name]) {
    return req.cookies[config.cookie.name];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return null;
};

const authMiddleware = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return sendError(res, 401, "Authentication required");
    }

    const decoded = jwt.verify(token, config.jwtSecret);

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
      return sendError(res, 401, "User no longer exists");
    }

    // reject tokens minted before the current version (revoked sessions)
    if (typeof decoded.tv !== "number" || decoded.tv !== user.tokenVersion) {
      return sendError(res, 401, "Session expired, please sign in again");
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return sendError(res, 401, "Token expired");
    }
    if (err.name === "JsonWebTokenError") {
      return sendError(res, 401, "Invalid token");
    }
    next(err);
  }
};

module.exports = authMiddleware;
