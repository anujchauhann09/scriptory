require("dotenv").config();

const platform = require("./platform");
const { readSecret } = require("./secrets");

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

const intFromEnv = (key, fallback) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) ? n : fallback;
};

const stripTrailingSlash = (u) => (u || "").replace(/\/+$/, "");

/**
 * Browser origins allowed to call this API with credentials.
 *
 * A single FRONTEND_URL covers the common case; CORS_ALLOWED_ORIGINS adds any
 * extras (preview deployments, an apex + www pair, a custom domain in front of
 * the same app). Anything not listed is refused — the allowlist is never
 * reflected back from the request.
 */
const parseOrigins = () => {
  const raw = [process.env.FRONTEND_URL, ...(process.env.CORS_ALLOWED_ORIGINS || "").split(",")]
    .map((s) => stripTrailingSlash((s || "").trim()))
    .filter(Boolean);

  const valid = [];
  for (const candidate of raw) {
    try {
      const url = new URL(candidate);
      // Only the origin matters for CORS; drop any path someone pasted in.
      valid.push(stripTrailingSlash(url.origin));
    } catch {
      throw new Error(`Invalid origin in FRONTEND_URL/CORS_ALLOWED_ORIGINS: "${candidate}"`);
    }
  }
  return [...new Set(valid)];
};

const frontendUrl = stripTrailingSlash(process.env.FRONTEND_URL || "http://localhost:5173");
/**
 * Bootstrap escape hatch for the very first deployment.
 *
 * A managed platform mints the service URL only once the service exists, so the
 * first revision faces a genuine chicken-and-egg: it cannot know its own public
 * address, but `API_URL` is required before it will boot.
 *
 * Every other way out is worse. A placeholder value sends real emails pointing
 * at a domain you do not own. Guessing the generated hostname bakes in a format
 * the provider does not guarantee. Deriving it from the request's `Host` header
 * is host-header injection: an attacker sets `Host: evil.example`, and the
 * unsubscribe link generated afterwards carries a live token to their server.
 *
 * So instead: an explicit flag, honoured only when `API_URL` is genuinely
 * absent, which does not relax the rule so much as narrow it — the features
 * that need an absolute API URL refuse to run rather than emitting a wrong one.
 * It is deliberately uncomfortable to leave on: it logs at error level on every
 * single startup, and the newsletter stays switched off until it is removed.
 */
const apiUrlPending = process.env.API_URL_PENDING === "true" && !process.env.API_URL;

/**
 * Null while bootstrapping — never a guess, never a placeholder.
 *
 * Consumers check for null and decline; nothing interpolates it blindly.
 */
const apiUrl = apiUrlPending
  ? null
  : stripTrailingSlash(process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`);

const jwtSecret = readSecret("JWT_SECRET", { required: true });

/**
 * SameSite=None is required whenever the SPA and the API are on different
 * registrable domains — which is the normal shape of a Cloud Run + static-host
 * deployment. It also removes the browser's implicit CSRF protection, so the
 * Origin check in csrf.middleware carries that weight instead.
 */
const cookieSameSite = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();

const config = {
  port: intFromEnv("PORT", 5000),
  nodeEnv,
  isProduction,

  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  // Binding tokens to an issuer and audience stops a token minted by another
  // service that happens to share the secret from being accepted here.
  jwtIssuer: process.env.JWT_ISSUER || "scriptory",
  jwtAudience: process.env.JWT_AUDIENCE || "scriptory-api",

  frontendUrl,
  apiUrl,
  /** True only during first-deploy bootstrap; features needing apiUrl are off. */
  apiUrlPending,
  allowedOrigins: parseOrigins(),

  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: readSecret("ADMIN_PASSWORD"),

  // SMTP / email (all optional — email sending is skipped gracefully if unset)
  smtp: {
    host: process.env.SMTP_HOST,
    port: intFromEnv("SMTP_PORT", 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: readSecret("SMTP_PASS"),
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
  },
  // where contact-form submissions are emailed (defaults to the admin address)
  contactRecipient: process.env.CONTACT_RECIPIENT || process.env.ADMIN_EMAIL,

  // auth cookie settings. secure=true in production (HTTPS required)
  // sameSite defaults to "lax" (works when frontend + API share a site, incl.
  // localhost). Use "none" (with HTTPS) if they're on different sites
  cookie: {
    name: "token",
    secure: isProduction || cookieSameSite === "none",
    sameSite: cookieSameSite,
    domain: process.env.COOKIE_DOMAIN || undefined,
    // JWT expiry drives cookie maxAge; keep them in sync (default 7 days)
    maxAgeMs: intFromEnv("COOKIE_MAX_AGE_MS", 7 * 24 * 60 * 60 * 1000),
  },
  twoFactorIssuer: process.env.TWO_FACTOR_ISSUER || "Scriptory",

  // Shared secret an external scheduler presents to run maintenance tasks.
  // Unset means the internal task endpoints stay closed.
  taskRunnerToken: readSecret("TASK_RUNNER_TOKEN"),

  // How background work runs. "cron" keeps the in-process node-cron timers
  // (right for a single always-on instance); "external" exposes the task
  // endpoints for a platform scheduler instead (right for autoscaled,
  // scale-to-zero deployments); "off" disables both.
  schedulerMode: process.env.SCHEDULER_MODE || (platform.isServerless ? "external" : "cron"),

  // Seconds a request may take before the server gives up on it. Keep this
  // below the platform's own request timeout so the app, not the proxy,
  // produces the error.
  requestTimeoutMs: intFromEnv("REQUEST_TIMEOUT_MS", 30000),
  // Grace period for in-flight requests after SIGTERM.
  shutdownTimeoutMs: intFromEnv("SHUTDOWN_TIMEOUT_MS", 10000),
};

// --- boot-time validation -------------------------------------------------
// Fail loudly at startup rather than silently running insecurely in production.

const problems = [];
const warnings = [];

if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_FILE) {
  problems.push("DATABASE_URL is required");
}

/**
 * A short secret makes every JWT forgeable by brute force, so 32 characters is
 * the floor for HS256. Below 16 is indefensible anywhere and fails outright;
 * between 16 and 32 is refused in production but only warned about locally, so
 * an existing development .env keeps working while a real deployment cannot.
 */
const JWT_SECRET_MIN = 32;
const JWT_SECRET_ABSOLUTE_MIN = 16;
const weakSecretMessage = `JWT_SECRET must be at least ${JWT_SECRET_MIN} characters (got ${jwtSecret.length}); generate one with \`openssl rand -base64 48\``;

if (jwtSecret.length < JWT_SECRET_ABSOLUTE_MIN || (isProduction && jwtSecret.length < JWT_SECRET_MIN)) {
  problems.push(weakSecretMessage);
} else if (jwtSecret.length < JWT_SECRET_MIN) {
  warnings.push(weakSecretMessage);
}

if (!["lax", "strict", "none"].includes(cookieSameSite)) {
  problems.push(`COOKIE_SAMESITE must be one of lax|strict|none (got "${cookieSameSite}")`);
}

/**
 * A managed platform running non-production config is a security problem, not a
 * preference: NODE_ENV drives secure cookies, HSTS, the strict JWT length
 * floor, and rate limits that are 50x looser in development. The container
 * image sets NODE_ENV=production, so reaching here means it was explicitly
 * overridden — worth saying loudly, but not worth refusing to boot, since a
 * deliberate staging deployment is a legitimate reason to do it.
 */
if (platform.isServerless && !isProduction) {
  warnings.push(
    `Running on ${platform.name} with NODE_ENV="${nodeEnv}". Secure cookies, HSTS, the JWT length floor and production rate limits are all disabled. Set NODE_ENV=production.`
  );
}

if (isProduction) {
  if (!process.env.FRONTEND_URL) {
    problems.push("FRONTEND_URL is required in production (it drives CORS, CSRF and canonical links)");
  }
  if (config.allowedOrigins.some((o) => o.startsWith("http://"))) {
    problems.push("Allowed origins must use https:// in production");
  }
  if (!process.env.API_URL && !apiUrlPending) {
    problems.push(
      "API_URL is required in production (it builds unsubscribe links in emails). " +
        "On a first deployment, where the platform has not minted the URL yet, set " +
        "API_URL_PENDING=true to boot once without it, then set API_URL to the " +
        "generated address and remove the flag."
    );
  }

  if (apiUrlPending) {
    warnings.push(
      "API_URL_PENDING=true — running without a public API URL. Newsletter emails " +
        "are disabled because their unsubscribe links cannot be built. Set API_URL " +
        "to the deployed URL and remove this flag."
    );
  }
  if (cookieSameSite === "none" && !config.cookie.secure) {
    problems.push("COOKIE_SAMESITE=none requires a secure cookie (HTTPS)");
  }
  if (config.schedulerMode === "external" && !config.taskRunnerToken) {
    problems.push(
      "SCHEDULER_MODE=external requires TASK_RUNNER_TOKEN so the scheduler can authenticate"
    );
  }
}

if (problems.length) {
  const detail = problems.map((p) => `  - ${p}`).join("\n");
  /**
   * Printed before the throw, and printed plainly.
   *
   * A module-load throw surfaces on Cloud Run as "container failed to start and
   * listen on PORT", which says nothing about the cause. The stack trace is in
   * the logs but buried, and the structured logger cannot be used here — it
   * imports this module, so a require cycle at boot would replace one confusing
   * failure with a worse one.
   */
  // eslint-disable-next-line no-console
  console.error(`\n[config] Refusing to start — invalid configuration:\n${detail}\n`);
  throw new Error(`Invalid configuration:\n${detail}`);
}

// Warnings are printed with console.warn rather than the winston logger: the
// logger imports this module transitively, and a require cycle at boot is a
// worse failure than an unformatted line.
for (const warning of warnings) {
  // eslint-disable-next-line no-console
  console.warn(`[config] ${warning}`);
}

// Development convenience: a dev server on a different port is still same-site,
// but CORS needs it named explicitly.
if (!config.allowedOrigins.length) {
  config.allowedOrigins.push("http://localhost:5173");
}

module.exports = config;
