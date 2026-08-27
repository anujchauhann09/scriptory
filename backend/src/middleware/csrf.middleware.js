const config = require("../config/env");
const logger = require("../utils/logger");
const { sendError } = require("../utils/response");

/**
 * CSRF defence for cookie-authenticated state changes.
 *
 * Why this is needed at all: sessions live in a cookie, and the browser attaches
 * cookies to cross-site requests automatically. SameSite=Lax normally blocks
 * that for POST/PUT/PATCH/DELETE — but the moment the SPA and the API are on
 * different registrable domains (the default shape of a container-hosted API
 * plus a separately-hosted frontend) the cookie must be SameSite=None to work
 * at all, and that protection disappears entirely.
 *
 * Why an Origin check rather than a synchroniser token: the Fetch spec requires
 * browsers to send `Origin` on every request whose method is not GET or HEAD,
 * same-origin included. That makes the header a reliable, forgery-proof signal
 * — script running on evil.example cannot set it to something else. Compared to
 * a double-submit token this needs no new endpoint, no token plumbing in the
 * client, no extra round trip, and no change to the existing API contract.
 *
 * Scope: only requests that actually carry the session cookie are checked. A
 * request with no cookie has no ambient authority to abuse, so curl, server-to-
 * server callers, and Bearer-token clients are unaffected — and Bearer auth is
 * not reachable by CSRF in the first place, since an attacker's page cannot add
 * an Authorization header to a cross-site request.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const normalise = (value) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

/** Origins permitted to drive state changes: the SPA, plus the API's own pages
 *  (the newsletter unsubscribe confirmation is a real form served from here). */
const buildAllowlist = () => {
  const origins = new Set(config.allowedOrigins.map((o) => normalise(o)).filter(Boolean));
  const self = normalise(config.apiUrl);
  if (self) origins.add(self);
  return origins;
};

const allowlist = buildAllowlist();

const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  // `Origin` is mandatory when it is present; `Referer` is only a fallback for
  // the rare client that strips Origin, and only its origin component is used.
  const origin = normalise(req.get("origin")) || normalise(req.get("referer"));

  /**
   * A present-but-foreign Origin is always refused, cookie or not.
   *
   * Browsers are required to send Origin on every non-GET request and script
   * cannot forge it, so this alone stops a cross-site page driving ANY state
   * change — including the one that has no session cookie yet to protect:
   * login. Without it, evil.example can POST the attacker's own credentials to
   * /api/auth/login from the victim's browser; with SameSite=None the resulting
   * session cookie sticks, and the victim then reads and comments on the site
   * signed in as the attacker.
   */
  if (origin && !allowlist.has(origin)) {
    logger.warn("Blocked cross-origin state change", {
      method: req.method,
      path: req.path,
      origin,
      requestId: req.id,
    });
    return sendError(res, 403, "Request origin is not allowed");
  }

  /**
   * A missing Origin is only refused when the request carries a session cookie.
   *
   * No cookie means no ambient authority to abuse, and it is the shape of every
   * non-browser caller — curl, a server-to-server integration, a Bearer-token
   * client. Since a browser always sends Origin on these methods, refusing the
   * cookie case loses nothing and closes the old-client gap.
   */
  if (!origin && req.cookies && req.cookies[config.cookie.name]) {
    logger.warn("Blocked cookie-authenticated request with no Origin", {
      method: req.method,
      path: req.path,
      requestId: req.id,
    });
    return sendError(res, 403, "Request origin could not be verified");
  }

  return next();
};

module.exports = csrfProtection;
module.exports.allowedOrigins = [...allowlist];
