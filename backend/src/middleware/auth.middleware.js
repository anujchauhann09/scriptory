const jwt = require("jsonwebtoken");
const prisma = require("../config/db");
const { sendError } = require("../utils/response");
const config = require("../config/env");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendError(res, 401, "Authentication required");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    const user = await prisma.user.findUnique({
      where: { uuid: decoded.userUuid },
      select: { id: true, uuid: true, email: true, role: true },
    });

    if (!user) {
      return sendError(res, 401, "User no longer exists");
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
