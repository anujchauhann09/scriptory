const jwt = require("jsonwebtoken");
const prisma = require("../config/db");
const config = require("../config/env");

const optionalAuth = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return next();

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    const user = await prisma.user.findUnique({
      where: { uuid: decoded.userUuid },
      select: { id: true, uuid: true, email: true, role: true },
    });

    if (user) req.user = user;
  } catch {
    // invalid/expired token — continue as anonymous
  }
  next();
};

module.exports = optionalAuth;
