const { createLogger, format, transports } = require("winston");
const platform = require("../config/platform");

const isProduction = process.env.NODE_ENV === "production";

/**
 * Values that must never reach a log sink, matched by key name.
 *
 * Logs are shipped off-box, retained for months, and readable by anyone with
 * project-viewer access — so a password or session token in a log line is a
 * credential leak with a long tail, even though it "only" went to a log.
 */
const SENSITIVE_KEYS =
  /^(password|newPassword|currentPassword|pass|token|totp|otp|secret|jwt|authorization|cookie|apikey|api_key|twoFactorSecret|twoFactorPending|unsubscribeToken|clientSecret)$/i;

/**
 * `code` is overloaded: it is the field name for a TOTP code in a request body,
 * and also the field name for an error code on almost every driver error.
 * Blanket-redacting it would hide the diagnostics that make an incident
 * readable, so only values shaped like a one-time code are hidden.
 */
const OTP_SHAPED = /^\d{4,8}$/;
const isSensitiveCode = (key, value) =>
  /^(code|pin)$/i.test(key) && typeof value === "string" && OTP_SHAPED.test(value);

const REDACTED = "[redacted]";

/** Query-string parameters that carry capabilities and must be scrubbed from URLs. */
const SENSITIVE_QUERY_KEYS = /^(token|code|secret|key|password|signature|sig)$/i;

/** Strips capability tokens out of a URL while keeping it recognisable. */
const redactUrl = (value) => {
  if (typeof value !== "string" || !value.includes("?")) return value;
  const [path, query] = value.split("?");
  const scrubbed = query
    .split("&")
    .map((pair) => {
      const [key] = pair.split("=");
      return SENSITIVE_QUERY_KEYS.test(decodeURIComponent(key || "")) ? `${key}=${REDACTED}` : pair;
    })
    .join("&");
  return `${path}?${scrubbed}`;
};

/** Recursively replaces sensitive values. Depth-capped so a cyclic or huge
 *  object can't turn a log call into a CPU stall. */
const redact = (value, depth = 0) => {
  if (depth > 4 || value === null || typeof value !== "object") {
    return typeof value === "string" ? redactUrl(value) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(key) || isSensitiveCode(key, val)) out[key] = REDACTED;
    else if (key === "email" && isProduction && typeof val === "string") out[key] = maskEmail(val);
    else out[key] = redact(val, depth + 1);
  }
  return out;
};

/** Keeps an email identifiable for support without printing it in full. */
const maskEmail = (email) => {
  const [local, domain] = String(email).split("@");
  if (!domain) return REDACTED;
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
};

const redactFormat = format((info) => {
  const { level, message, timestamp, ...meta } = info;
  const redactedMeta = redact(meta);
  return Object.assign(info, redactedMeta, {
    message: typeof message === "string" ? redactUrl(message) : message,
  });
});

/**
 * Production logs go out as one JSON object per line on stdout. Every managed
 * log collector (Cloud Logging, CloudWatch, Datadog, Loki) parses that shape
 * natively; a colourised human format would arrive as escape-code soup and lose
 * all structure. `severity` is the field Cloud Logging reads for log level —
 * harmless anywhere else.
 */
const productionFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  redactFormat(),
  format((info) => {
    info.severity = String(info.level).toUpperCase();
    info.service = "scriptory-api";
    info.instance = platform.instanceId;
    return info;
  })(),
  format.json()
);

const developmentFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.errors({ stack: true }),
  redactFormat(),
  format.colorize(),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
    return `[${timestamp}] ${level}: ${message} ${metaStr}`;
  })
);

const logger = createLogger({
  // "info" in production, not "warn": request and audit lines are how an
  // incident gets reconstructed, and dropping them saves nothing meaningful.
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  format: isProduction ? productionFormat : developmentFormat,
  transports: [new transports.Console()],
  // Let the process's own handlers decide what to do; winston exiting first
  // would skip graceful shutdown.
  exitOnError: false,
});

module.exports = logger;
module.exports.redact = redact;
module.exports.redactUrl = redactUrl;
module.exports.maskEmail = maskEmail;
