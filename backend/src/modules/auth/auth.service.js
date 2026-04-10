const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../../config/db");
const config = require("../../config/env");

const register = async ({ email, password, name }) => {
  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      profile: { create: { name: name || null } },
    },
    select: {
      uuid: true,
      email: true,
      role: true,
      profile: { select: { name: true, avatarUrl: true } },
    },
  });

  const { uuid } = await prisma.user.findUnique({ where: { email }, select: { uuid: true } });
  const token = signToken(uuid);
  return { user, token };
};

const login = async ({ email, password }) => {
  const raw = await prisma.user.findUnique({ where: { email } });

  if (!raw) {
    const err = new Error("Invalid email or password");
    err.statusCode = 401;
    throw err;
  }

  const isMatch = await bcrypt.compare(password, raw.password);
  if (!isMatch) {
    const err = new Error("Invalid email or password");
    err.statusCode = 401;
    throw err;
  }

  const token = signToken(raw.uuid);

  const user = await prisma.user.findUnique({
    where: { uuid: raw.uuid },
    select: {
      uuid: true,
      email: true,
      role: true,
      profile: { select: { name: true, avatarUrl: true } },
    },
  });

  return { user, token };
};

const signToken = (userUuid) => {
  return jwt.sign({ userUuid }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
};

module.exports = { register, login };
