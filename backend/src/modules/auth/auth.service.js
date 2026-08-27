const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { authenticator } = require("otplib");
const qrcode = require("qrcode");
const prisma = require("../../config/db");
const config = require("../../config/env");

/**
 * Work factor for password hashing. 12 is roughly 250ms on a shared vCPU —
 * expensive enough to make offline cracking of a leaked hash impractical, cheap
 * enough that the login endpoint is not itself a denial-of-service amplifier.
 */
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

// constant-time guard: compared against when an email doesn't exist so login
// timing doesn't reveal whether an account is registered (user enumeration)
const DUMMY_HASH = bcrypt.hashSync("scriptory-constant-time-guard", BCRYPT_ROUNDS);

const PUBLIC_USER_SELECT = {
  uuid: true,
  email: true,
  role: true,
  twoFactorEnabled: true,
  profile: { select: { name: true, avatarUrl: true } },
};

const signToken = (userUuid, tokenVersion) =>
  jwt.sign({ userUuid, tv: tokenVersion }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtExpiresIn,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    // A unique id per token; lets an individual session be identified in audit
    // records without the token itself ever being written down.
    jwtid: crypto.randomUUID(),
  });

const invalidCredentials = () => {
  const err = new Error("Invalid email or password");
  err.statusCode = 401;
  return err;
};

/**
 * TOTP verification.
 *
 * otplib's default window accepts the current step only. A one-step backward
 * tolerance covers ordinary clock skew between the server and the user's phone
 * without meaningfully widening the guess space, and is the standard setting.
 */
authenticator.options = { window: [1, 0] };

const register = async ({ email, password, name }) => {
  const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      // Normalising at the boundary keeps "A@b.com" and "a@b.com" from becoming
      // two accounts that the unique index cannot tell apart.
      email: email.trim().toLowerCase(),
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
  const normalisedEmail = email.trim().toLowerCase();
  const raw = await prisma.user.findUnique({ where: { email: normalisedEmail } });

  // always run bcrypt (dummy hash when the user is missing) → constant time
  const isMatch = await bcrypt.compare(password, raw ? raw.password : DUMMY_HASH);
  if (!raw || !isMatch) {
    throw invalidCredentials();
  }

  // second factor
  if (raw.twoFactorEnabled) {
    if (!totp) {
      return { twoFactorRequired: true, actor: { uuid: raw.uuid, email: raw.email } };
    }
    const valid =
      raw.twoFactorSecret &&
      authenticator.verify({ token: String(totp), secret: raw.twoFactorSecret });
    if (!valid) {
      const err = new Error("Invalid two-factor code");
      err.statusCode = 401;
      // Flagged so the caller counts this against the brute-force budget: a
      // correct password with a wrong code is still an attempt on the account.
      err.credentialFailure = true;
      throw err;
    }
  }

  const token = signToken(raw.uuid, raw.tokenVersion);
  const user = await prisma.user.findUnique({
    where: { uuid: raw.uuid },
    select: PUBLIC_USER_SELECT,
  });
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
    err.credentialFailure = true;
    throw err;
  }

  // Reusing the current password would leave every previously-issued token
  // valid against a credential the user is trying to move away from.
  if (await bcrypt.compare(newPassword, user.password)) {
    const err = new Error("New password must be different from the current one");
    err.statusCode = 400;
    throw err;
  }

  const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, tokenVersion: { increment: 1 } },
    select: { uuid: true, tokenVersion: true },
  });

  // re-issue a token for the current session so the user stays signed in here,
  // while every other outstanding token is invalidated
  return { token: signToken(updated.uuid, updated.tokenVersion) };
};

/** Revokes every outstanding token for the account (sign out everywhere). */
const revokeAllSessions = async (userUuid) => {
  const updated = await prisma.user.update({
    where: { uuid: userUuid },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  return { tokenVersion: updated.tokenVersion };
};

const setupTwoFactor = async (userUuid) => {
  const user = await prisma.user.findUnique({
    where: { uuid: userUuid },
    select: { id: true, email: true, twoFactorEnabled: true },
  });
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }
  // Re-running setup on an active account would mint a pending secret that
  // `enable` could then swap in, letting anyone holding the session silently
  // replace the second factor.
  if (user.twoFactorEnabled) {
    const err = new Error("Two-factor is already enabled. Disable it first to re-enrol.");
    err.statusCode = 400;
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
    err.credentialFailure = true;
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
    err.credentialFailure = true;
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
  revokeAllSessions,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  signToken,
};
