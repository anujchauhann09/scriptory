const jwt = require("jsonwebtoken");
const prisma = require("../config/db");
const config = require("../config/env");

const optionalAuth = async (req, _res, next) => {
  try {
    const token =
      (req.cookies && req.cookies[config.cookie.name]) ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : null);
    if (!token) return next();

    const decoded = jwt.verify(token, config.jwtSecret);

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
