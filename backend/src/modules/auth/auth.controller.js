const authService = require("./auth.service");
const { sendSuccess, sendError } = require("../../utils/response");
const { logAudit } = require("../../utils/audit");
const loginThrottle = require("../../utils/loginThrottle");
const { clientKey } = require("../../middleware/rateLimit.middleware");
const config = require("../../config/env");

const cookieOptions = () => ({
  // Not readable by JavaScript, so an XSS bug cannot exfiltrate the session.
  httpOnly: true,
  // Never transmitted over plaintext HTTP.
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  domain: config.cookie.domain,
  path: "/",
});

const setAuthCookie = (res, token) => {
  res.cookie(config.cookie.name, token, { ...cookieOptions(), maxAge: config.cookie.maxAgeMs });
};

const clearAuthCookie = (res) => {
  // Clearing must use the same attributes the cookie was set with, or the
  // browser treats it as a different cookie and the session survives logout.
  res.clearCookie(config.cookie.name, cookieOptions());
};

const register = async (req, res, next) => {
  try {
    const { user, token } = await authService.register(req.body);
    setAuthCookie(res, token);
    logAudit("auth.register", { actorUuid: user.uuid, actorEmail: user.email, ip: req.ip });
    return sendSuccess(res, 201, "Account created successfully", { user });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  const email = req.body?.email;
  const ip = clientKey(req);

  try {
    /**
     * Global brute-force gate, applied before any password work.
     *
     * The in-process limiter in front of this route is per container, so under
     * autoscaling it alone would let an attacker's guess budget scale with the
     * instance count. This counter lives in Postgres, so the ceiling holds no
     * matter which instance the request lands on.
     *
     * `reserve` increments and decides in one statement, so a burst of parallel
     * attempts cannot all pass a stale read. It also short-circuits bcrypt,
     * which means a locked-out attacker cannot use the login endpoint as a CPU
     * amplifier.
     */
    const gate = await loginThrottle.reserve({ email, ip });
    if (!gate.allowed) {
      res.set("Retry-After", String(gate.retryAfter));
      logAudit("auth.login.throttled", { actorEmail: email, ip: req.ip, detail: gate.scope });
      return sendError(
        res,
        429,
        "Too many failed sign-in attempts. Please wait before trying again."
      );
    }

    const result = await authService.login(req.body);

    if (result.twoFactorRequired) {
      // The password was correct, so this is not a guess — give the reserved
      // slot back rather than charging the user for being prompted for their
      // second factor.
      await loginThrottle.releaseSuccess({ email, ip });
      return res.status(401).json({
        success: false,
        message: "Two-factor authentication code required",
        twoFactorRequired: true,
      });
    }

    await loginThrottle.releaseSuccess({ email, ip });
    setAuthCookie(res, result.token);
    logAudit("auth.login.success", {
      actorUuid: result.actor.uuid,
      actorEmail: result.actor.email,
      ip: req.ip,
    });
    return sendSuccess(res, 200, "Login successful", { user: result.user });
  } catch (err) {
    if (err.statusCode === 401) {
      // The attempt was already counted by `reserve`; only record it in the
      // audit trail. The detail is this codebase's own message ("Invalid email
      // or password"), never the submitted credential.
      logAudit("auth.login.failure", { actorEmail: email, ip: req.ip, detail: err.message });
    }
    next(err);
  }
};

const logout = async (req, res) => {
  clearAuthCookie(res);
  return sendSuccess(res, 200, "Logged out");
};

/** Invalidates every session for the account, including this one. */
const logoutAll = async (req, res, next) => {
  try {
    await authService.revokeAllSessions(req.user.uuid);
    clearAuthCookie(res);
    logAudit("auth.sessions.revoke", {
      actorUuid: req.user.uuid,
      actorEmail: req.user.email,
      ip: req.ip,
    });
    return sendSuccess(res, 200, "All sessions signed out");
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { token } = await authService.changePassword(
      req.user.uuid,
      req.body.currentPassword,
      req.body.newPassword
    );
    setAuthCookie(res, token); // keep this session alive with a fresh token
    logAudit("auth.password.change", {
      actorUuid: req.user.uuid,
      actorEmail: req.user.email,
      ip: req.ip,
    });
    return sendSuccess(res, 200, "Password updated. Other sessions have been signed out.");
  } catch (err) {
    await chargeCredentialFailure(req, err, "auth.password.change.failure");
    next(err);
  }
};

const setupTwoFactor = async (req, res, next) => {
  try {
    const data = await authService.setupTwoFactor(req.user.uuid);
    logAudit("auth.2fa.setup", {
      actorUuid: req.user.uuid,
      actorEmail: req.user.email,
      ip: req.ip,
    });
    return sendSuccess(res, 200, "Scan the QR code with your authenticator app", data);
  } catch (err) {
    next(err);
  }
};

/**
 * Charges a wrong second-factor code against the global brute-force budget.
 *
 * Without this, the only thing bounding TOTP guessing on these endpoints is the
 * in-process limiter — which is per instance, so it multiplies by the instance
 * count and a six-digit code becomes reachable over weeks. Disabling 2FA is
 * exactly the action an attacker holding a stolen session wants, so it has to
 * be bounded globally like any other credential check.
 */
const chargeCredentialFailure = async (req, err, action) => {
  if (!err.credentialFailure) return;
  await loginThrottle.registerFailure({ email: req.user.email, ip: clientKey(req) });
  logAudit(action, { actorUuid: req.user.uuid, actorEmail: req.user.email, ip: req.ip });
};

const enableTwoFactor = async (req, res, next) => {
  try {
    const { token } = await authService.enableTwoFactor(req.user.uuid, req.body.code);
    setAuthCookie(res, token);
    logAudit("auth.2fa.enable", {
      actorUuid: req.user.uuid,
      actorEmail: req.user.email,
      ip: req.ip,
    });
    return sendSuccess(res, 200, "Two-factor authentication enabled");
  } catch (err) {
    await chargeCredentialFailure(req, err, "auth.2fa.enable.failure");
    next(err);
  }
};

const disableTwoFactor = async (req, res, next) => {
  try {
    const { token } = await authService.disableTwoFactor(req.user.uuid, req.body.code);
    setAuthCookie(res, token);
    logAudit("auth.2fa.disable", {
      actorUuid: req.user.uuid,
      actorEmail: req.user.email,
      ip: req.ip,
    });
    return sendSuccess(res, 200, "Two-factor authentication disabled");
  } catch (err) {
    await chargeCredentialFailure(req, err, "auth.2fa.disable.failure");
    next(err);
  }
};

module.exports = {
  register,
  login,
  logout,
  logoutAll,
  changePassword,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
};
