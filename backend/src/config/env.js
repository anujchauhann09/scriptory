require("dotenv").config();

const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  apiUrl: process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`,
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,

  // SMTP / email (all optional — email sending is skipped gracefully if unset)
  smtp: {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
  },
  // where contact-form submissions are emailed (defaults to the admin address)
  contactRecipient: process.env.CONTACT_RECIPIENT || process.env.ADMIN_EMAIL,

  // auth cookie settings. secure=true in production (HTTPS required)
  // sameSite defaults to "lax" (works when frontend + API share a site, incl.
  // localhost). Use "none" (with HTTPS) if they're on different sites
  cookie: {
    name: "token",
    secure: (process.env.NODE_ENV || "development") === "production",
    sameSite: process.env.COOKIE_SAMESITE || "lax",
    domain: process.env.COOKIE_DOMAIN || undefined,
    // JWT expiry drives cookie maxAge; keep them in sync (default 7 days)
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
  twoFactorIssuer: process.env.TWO_FACTOR_ISSUER || "Scriptory",
};

const required = ["JWT_SECRET", "DATABASE_URL"];
required.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

module.exports = config;
