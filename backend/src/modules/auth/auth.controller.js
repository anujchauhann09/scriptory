const authService = require("./auth.service");
const {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  codeSchema,
} = require("./auth.validation");
const { sendSuccess, sendError } = require("../../utils/response");
const { logAudit } = require("../../utils/audit");
const config = require("../../config/env");

const setAuthCookie = (res, token) => {
  res.cookie(config.cookie.name, token, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    maxAge: config.cookie.maxAgeMs,
    path: "/",
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: "/",
  });
};

const register = async (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return sendError(res, 400, "Validation failed", error.details.map((d) => d.message));
    }

    const { user, token } = await authService.register(value);
    setAuthCookie(res, token);
    logAudit("auth.register", { actorUuid: user.uuid, actorEmail: user.email, ip: req.ip });
    return sendSuccess(res, 201, "Account created successfully", { user });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return sendError(res, 400, "Validation failed", error.details.map((d) => d.message));
    }

    const result = await authService.login(value);

    if (result.twoFactorRequired) {
      return res.status(401).json({
        success: false,
        message: "Two-factor authentication code required",
        twoFactorRequired: true,
      });
    }

    setAuthCookie(res, result.token);
    logAudit("auth.login.success", {
      actorUuid: result.actor.uuid,
      actorEmail: result.actor.email,
      ip: req.ip,
    });
    return sendSuccess(res, 200, "Login successful", { user: result.user });
  } catch (err) {
    if (err.statusCode === 401) {
      logAudit("auth.login.failure", { actorEmail: req.body?.email, ip: req.ip, detail: err.message });
    }
    next(err);
  }
};

const logout = async (req, res) => {
  clearAuthCookie(res);
  return sendSuccess(res, 200, "Logged out");
};

const changePassword = async (req, res, next) => {
  try {
    const { error, value } = changePasswordSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return sendError(res, 400, "Validation failed", error.details.map((d) => d.message));
    }

    const { token } = await authService.changePassword(
      req.user.uuid,
      value.currentPassword,
      value.newPassword
    );
    setAuthCookie(res, token); // keep this session alive with a fresh token
    logAudit("auth.password.change", { actorUuid: req.user.uuid, actorEmail: req.user.email, ip: req.ip });
    return sendSuccess(res, 200, "Password updated. Other sessions have been signed out.");
  } catch (err) {
    next(err);
  }
};

const setupTwoFactor = async (req, res, next) => {
  try {
    const data = await authService.setupTwoFactor(req.user.uuid);
    return sendSuccess(res, 200, "Scan the QR code with your authenticator app", data);
  } catch (err) {
    next(err);
  }
};

const enableTwoFactor = async (req, res, next) => {
  try {
    const { error, value } = codeSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return sendError(res, 400, "Validation failed", error.details.map((d) => d.message));
    }
    const { token } = await authService.enableTwoFactor(req.user.uuid, value.code);
    setAuthCookie(res, token);
    logAudit("auth.2fa.enable", { actorUuid: req.user.uuid, actorEmail: req.user.email, ip: req.ip });
    return sendSuccess(res, 200, "Two-factor authentication enabled");
  } catch (err) {
    next(err);
  }
};

const disableTwoFactor = async (req, res, next) => {
  try {
    const { error, value } = codeSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return sendError(res, 400, "Validation failed", error.details.map((d) => d.message));
    }
    const { token } = await authService.disableTwoFactor(req.user.uuid, value.code);
    setAuthCookie(res, token);
    logAudit("auth.2fa.disable", { actorUuid: req.user.uuid, actorEmail: req.user.email, ip: req.ip });
    return sendSuccess(res, 200, "Two-factor authentication disabled");
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  logout,
  changePassword,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
};
