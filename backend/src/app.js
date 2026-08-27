const express = require("express");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const config = require("./config/env");
const platform = require("./config/platform");
const logger = require("./utils/logger");

const { securityHeaders, corsMiddleware } = require("./middleware/security.middleware");
const requestContext = require("./middleware/requestContext.middleware");
const csrfProtection = require("./middleware/csrf.middleware");
const errorMiddleware = require("./middleware/error.middleware");
const limits = require("./middleware/rateLimit.middleware");

const healthRoutes = require("./modules/health/health.routes");
const internalRoutes = require("./modules/internal/internal.routes");
const authRoutes = require("./modules/auth/auth.routes");
const userRoutes = require("./modules/user/user.routes");
const articleRoutes = require("./modules/article/article.routes");
const tagRoutes = require("./modules/tag/tag.routes");
const categoryRoutes = require("./modules/category/category.routes");
const viewRoutes = require("./modules/view/view.routes");
const commentRoutes = require("./modules/comment/comment.routes");
const uploadRoutes = require("./modules/upload/upload.routes");
const likeRoutes = require("./modules/like/like.routes");
const { articleBookmarkRoutes, bookmarkListRoutes } = require("./modules/bookmark/bookmark.routes");
const contactRoutes = require("./modules/contact/contact.routes");
const newsletterRoutes = require("./modules/newsletter/newsletter.routes");
const auditRoutes = require("./modules/audit/audit.routes");
const analyticsRoutes = require("./modules/analytics/analytics.routes");
const statsRoutes = require("./modules/stats/stats.routes");
const feedRoutes = require("./modules/feed/feed.routes");
const ogRoutes = require("./modules/og/og.routes");

const app = express();

/**
 * ---------------------------------------------------------------------------
 * Middleware order below is load-bearing. Each layer is placed where it is for
 * a reason, and moving one changes the security properties of the whole stack.
 * ---------------------------------------------------------------------------
 */

/**
 * 1. Proxy trust — first, because everything downstream depends on it.
 *
 * `req.ip` is the key for every rate limiter, the view-deduplication
 * fingerprint, and the audit trail. Behind a proxy it is derived from
 * X-Forwarded-For, and the hop count decides how much of that header is
 * believed. Trusting too many hops lets a client prepend a forged address and
 * evade every limit; trusting too few collapses all traffic onto the proxy's
 * own address. The value comes from the platform adapter, never hard-coded.
 */
app.set("trust proxy", platform.trustProxyHops);

// Removes the framework fingerprint; helmet does this too, belt and braces.
app.disable("x-powered-by");

// Prevents "/Articles" and "/articles" being treated as different routes.
app.set("strict routing", false);

/**
 * Query strings are parsed with Node's own parser rather than `qs`.
 *
 * Express defaults to `qs`, which builds arbitrarily nested objects and arrays
 * from a flat query string — `?a[b][c]=1`, `?a[__proto__][x]=1`. Nothing in
 * this API takes a nested query parameter, so that expressiveness buys nothing
 * and only widens what an attacker can hand to a validator or an ORM.
 */
app.set("query parser", "simple");

// 2. Request identity and a server-side deadline, so even a request rejected by
//    a later layer is traceable and cannot hang.
app.use(requestContext);

// 3. Security response headers, before any handler can produce a response.
app.use(securityHeaders);

// 4. CORS, before the rate limiter: a rejected preflight with no CORS headers
//    surfaces in the browser as an opaque network error rather than a 429.
app.use(corsMiddleware);

// 5. Cookies, because the CSRF check needs to know whether a session is present.
app.use(cookieParser());

/**
 * 6. Request logging.
 *
 * Skips health probes, which a platform polls constantly and which would
 * otherwise dominate both the log volume and its cost. URLs pass through the
 * logger's redaction so an unsubscribe token in a query string never lands in a
 * log sink.
 */
if (config.nodeEnv !== "test") {
  app.use(
    morgan(
      (tokens, req, res) =>
        JSON.stringify({
          method: tokens.method(req, res),
          url: logger.redactUrl(tokens.url(req, res)),
          status: Number(tokens.status(req, res)),
          durationMs: Number(tokens["response-time"](req, res)),
          requestId: req.id,
        }),
      {
        skip: (req) => req.path === "/healthz" || req.path === "/readyz" || req.path === "/health",
        stream: {
          write: (msg) => {
            const entry = JSON.parse(msg);
            // 5xx as error so alerting can key on severity rather than parsing
            // the status field.
            logger[entry.status >= 500 ? "error" : "info"]("request", entry);
          },
        },
      }
    )
  );
}

/**
 * 7. Health probes — mounted before the rate limiter.
 *
 * A platform polls these on a fixed schedule from a small set of addresses. Rate
 * limiting them would eventually mark healthy containers as failing and take the
 * service down by way of its own protection.
 */
app.use(healthRoutes);

/**
 * 8. Rate limiting, before body parsing.
 *
 * Rejecting here costs a map lookup. Parsing first would mean allocating and
 * JSON-decoding a megabyte-scale body for a request that is about to be thrown
 * away — which is exactly the amplification an attacker wants.
 */
app.use("/api", limits.global);

/**
 * 9. CSRF, before body parsing for the same reason, and before every route so
 *    no handler can be reached by a cross-site form post.
 */
app.use(csrfProtection);

/**
 * 10. Body parsing: a tight default, with a larger limit on exactly two routes.
 *
 * A single global limit has to be as large as the largest legitimate body,
 * which then applies to every endpoint — so a login request would be allowed to
 * carry megabytes. Only the two article writes need more, and they are named
 * explicitly by method and path.
 *
 * `app.use("/api/articles", ...)` would be wrong here: Express prefix-matching
 * means it would also cover POST /api/articles/:slug/views, which requires no
 * authentication at all, plus the likes, bookmark and comment sub-routes. An
 * anonymous caller could then make the server buffer and JSON-parse a megabyte
 * before any authorisation ran.
 *
 * These must also be registered before the default parser rather than inside
 * the article router, because app-level middleware runs first — a parser
 * mounted on the route would never see a body the default parser had already
 * rejected. body-parser marks a request as parsed, so the default below is a
 * no-op once one of these has run.
 */
const ARTICLE_BODY_LIMIT = process.env.ARTICLE_BODY_LIMIT || "1mb";
const DEFAULT_BODY_LIMIT = process.env.DEFAULT_BODY_LIMIT || "64kb";

const articleBodyParser = express.json({ limit: ARTICLE_BODY_LIMIT });
app.post("/api/articles", articleBodyParser);
app.put("/api/articles/:uuid", articleBodyParser);

app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
// `extended: false` uses the built-in query parser rather than `qs`, which
// removes the deeply-nested-object and prototype-pollution surface. The only
// form on the site is the unsubscribe confirmation, which posts one field.
app.use(express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 20 }));

/**
 * 11. Endpoints for an external scheduler. Authenticated by a shared secret
 *     inside the router, and mounted outside /api so a platform can restrict
 *     them at the network layer independently of the public API.
 */
app.use("/internal", internalRoutes);

// --- application routes ---------------------------------------------------

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/articles", articleRoutes);
app.use("/api/articles", viewRoutes);
app.use("/api/articles", likeRoutes);
app.use("/api/articles", articleBookmarkRoutes);
app.use("/api/bookmarks", bookmarkListRoutes);
app.use("/api/articles/:articleId/comments", commentRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/stats", statsRoutes);

// Public feeds + OG images served at the root: /rss.xml, /sitemap.xml, /robots.txt, /og/:slug.png
app.use(feedRoutes);
app.use("/og", ogRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "The requested resource was not found." });
});

app.use(errorMiddleware);

module.exports = app;
