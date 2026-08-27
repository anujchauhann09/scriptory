const helmet = require("helmet");
const cors = require("cors");
const config = require("../config/env");
const logger = require("../utils/logger");

/**
 * Response security headers.
 *
 * This service returns JSON almost everywhere, but not quite: the newsletter
 * unsubscribe flow serves real HTML pages, and the OG endpoint serves images.
 * So the headers are set as if a browser will render the response, because
 * sometimes one will.
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      // Deny-by-default, then open only what the served pages actually use.
      defaultSrc: ["'none'"],
      // No API response should ever execute script. This is what neutralises a
      // reflected-XSS attempt against an HTML-rendering endpoint.
      scriptSrc: ["'none'"],
      // The unsubscribe page styles itself with inline attributes and has no
      // stylesheet to link; with scriptSrc at 'none' this cannot be escalated.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      // Blocks this API being framed for a clickjacking overlay.
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      objectSrc: ["'none'"],
      ...(config.isProduction ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  // Tells browsers to refuse plaintext HTTP for a year. Only meaningful over
  // HTTPS, which is why it is production-only.
  hsts: config.isProduction
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  // URLs here can contain article slugs and unsubscribe tokens; never leak them
  // to third-party sites via the Referer header.
  referrerPolicy: { policy: "no-referrer" },
  // Default-deny for cross-origin resource loads; the OG image route opts out
  // explicitly, since social crawlers must be able to fetch it.
  crossOriginResourcePolicy: { policy: "same-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  // Not applicable to an API and it breaks legitimate cross-origin sub-resources.
  crossOriginEmbedderPolicy: false,
  // Removes the X-Powered-By fingerprint.
  hidePoweredBy: true,
});

/**
 * CORS.
 *
 * `credentials: true` is required because auth rides in a cookie — and that is
 * exactly why the origin must come from a fixed allowlist rather than being
 * reflected from the request. Reflecting the Origin header with credentials
 * enabled hands any site on the internet an authenticated session against this
 * API; browsers refuse the wildcard for this reason, and reflection is just the
 * wildcard with extra steps.
 */
const corsOptions = {
  origin(origin, callback) {
    // No Origin: same-origin navigation, curl, health checks, server-to-server.
    // Nothing is echoed back in this case, so there is no grant to abuse.
    if (!origin) return callback(null, true);

    if (config.allowedOrigins.includes(origin.replace(/\/+$/, ""))) {
      return callback(null, true);
    }

    logger.warn("Blocked CORS origin", { origin });
    // Refuse without throwing: an error here would surface as a 500 and hide a
    // configuration mistake behind a server fault.
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  // A response header is invisible to cross-origin JavaScript unless it is
  // listed here — a header the SPA cannot read is a header that does not exist.
  exposedHeaders: [
    "X-Request-Id",
    "X-Total-Count",
    "RateLimit",
    "RateLimit-Policy",
    "Retry-After",
  ],
  // Cache preflights for 10 minutes. Every cross-origin write otherwise costs
  // two round trips, and the preflight also burns rate-limit budget.
  maxAge: 600,
  optionsSuccessStatus: 204,
};

module.exports = {
  securityHeaders,
  corsMiddleware: cors(corsOptions),
};
