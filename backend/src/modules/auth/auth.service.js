const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { authenticator } = require("otplib");
const qrcode = require("qrcode");
const prisma = require("../../config/db");
const config = require("../../config/env");

// constant-time guard: compared against when an email doesn't exist so login
// timing doesn't reveal whether an account is registered (user enumeration)
const DUMMY_HASH = bcrypt.hashSync("scriptory-constant-time-guard", 12);

const PUBLIC_USER_SELECT = {
  uuid: true,
  email: true,
  role: true,
  twoFactorEnabled: true,
  profile: { select: { name: true, avatarUrl: true } },
};

const signToken = (userUuid, tokenVersion) =>
  jwt.sign({ userUuid, tv: tokenVersion }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

const invalidCredentials = () => {
  const err = new Error("Invalid email or password");
  err.statusCode = 401;
  return err;
};

const register = async ({ email, password, name }) => {
  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      profile: { create: { name: name || null } },
    },
    select: { ...PUBLIC_USER_SELECT, uuid: true, tokenVersion: true },
  });

  const token = signToken(user.uuid, user.tokenVersion);
  const { tokenVersion, ...publicUser } = user;
  return { user: publicUser, token };
};

const login = async ({ email, password, totp }) => {
  const raw = await prisma.user.findUnique({ where: { email } });

  // always run bcrypt (dummy hash when the user is missing) → constant time
  const isMatch = await bcrypt.compare(password, raw ? raw.password : DUMMY_HASH);
  if (!raw || !isMatch) {
    throw invalidCredentials();
  }

  // second factor
  if (raw.twoFactorEnabled) {
    if (!totp) {
      return { twoFactorRequired: true };
    }
    const valid = authenticator.verify({ token: String(totp), secret: raw.twoFactorSecret });
    if (!valid) {
      const err = new Error("Invalid two-factor code");
      err.statusCode = 401;
      throw err;
    }
  }

  const token = signToken(raw.uuid, raw.tokenVersion);
  const user = await prisma.user.findUnique({ where: { uuid: raw.uuid }, select: PUBLIC_USER_SELECT });
  return { user, token, actor: { uuid: raw.uuid, email: raw.email } };
};

const changePassword = async (userUuid, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({
    where: { uuid: userUuid },
    select: { id: true, password: true },
  });
  if (!user) throw invalidCredentials();

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    const err = new Error("Current password is incorrect");
    err.statusCode = 400;
    throw err;
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, tokenVersion: { increment: 1 } },
    select: { uuid: true, tokenVersion: true },
  });

  // re-issue a token for the current session so the user stays signed in here,
  // while every other outstanding token is invalidated
  return { token: signToken(updated.uuid, updated.tokenVersion) };
};

const setupTwoFactor = async (userUuid) => {
  const user = await prisma.user.findUnique({
    where: { uuid: userUuid },
    select: { id: true, email: true },
  });
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  const secret = authenticator.generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorPending: secret } });

  const otpauthUrl = authenticator.keyuri(user.email, config.twoFactorIssuer, secret);
  const qrDataUrl = await qrcode.toDataURL(otpauthUrl);
  return { secret, otpauthUrl, qrDataUrl };
};

const enableTwoFactor = async (userUuid, code) => {
  const user = await prisma.user.findUnique({
    where: { uuid: userUuid },
    select: { id: true, uuid: true, twoFactorPending: true, twoFactorEnabled: true },
  });
  if (!user || !user.twoFactorPending) {
    const err = new Error("Start two-factor setup first");
    err.statusCode = 400;
    throw err;
  }
  const valid = authenticator.verify({ token: String(code), secret: user.twoFactorPending });
  if (!valid) {
    const err = new Error("Invalid code — check your authenticator app and try again");
    err.statusCode = 400;
    throw err;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorSecret: user.twoFactorPending,
      twoFactorPending: null,
      twoFactorEnabled: true,
      tokenVersion: { increment: 1 },
    },
    select: { uuid: true, tokenVersion: true },
  });
  return { token: signToken(updated.uuid, updated.tokenVersion) };
};

const disableTwoFactor = async (userUuid, code) => {
  const user = await prisma.user.findUnique({
    where: { uuid: userUuid },
    select: { id: true, twoFactorEnabled: true, twoFactorSecret: true },
  });
  if (!user || !user.twoFactorEnabled) {
    const err = new Error("Two-factor is not enabled");
    err.statusCode = 400;
    throw err;
  }
  const valid = authenticator.verify({ token: String(code), secret: user.twoFactorSecret });
  if (!valid) {
    const err = new Error("Invalid code");
    err.statusCode = 400;
    throw err;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorPending: null,
      tokenVersion: { increment: 1 },
    },
    select: { uuid: true, tokenVersion: true },
  });
  return { token: signToken(updated.uuid, updated.tokenVersion) };
};

module.exports = {
  register,
  login,
  changePassword,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  signToken,
};
