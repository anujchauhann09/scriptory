/**
 * In-process rate limiting.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS AND IS NOT
 * ---------------------------------------------------------------------------
 * Every limiter here uses express-rate-limit's in-memory store. That store
 * lives inside one Node process, which has two consequences that must be
 * designed around rather than glossed over:
 *
 *   1. Limits are PER INSTANCE, not global. Under an autoscaler running N
 *      containers, a client spread across them gets up to `limit x N` requests
 *      per window. There is no distributed counter and no coordination.
 *
 *   2. Counters reset when an instance is replaced — a scale-in event, a new
 *      revision, or an idle scale-to-zero all wipe the window.
 *
 * The design accounts for that instead of pretending otherwise:
 *
 *   - Limits are budgeted against MAX_INSTANCES (see config/platform). The
 *     documented ceiling for each limiter below is the per-instance number; the
 *     realistic worst case is that number times the instance cap, which is why
 *     the instance cap belongs in the deployment config and not left unbounded.
 *
 *   - Volumetric abuse is what these limiters are actually good at, and they
 *     are good at it: an attacker hammering one endpoint hits whichever
 *     instance the load balancer picks, and a flood large enough to spread
 *     across every instance is a flood the autoscaler is already surfacing.
 *
 *   - The one thing that must NOT be per-instance is credential brute force,
 *     because there the attacker only needs to succeed once and N instances
 *     multiply their budget directly. That case is handled separately by a
 *     database-backed counter (utils/loginThrottle) that is genuinely global,
 *     using the Postgres instance the app already depends on rather than
 *     introducing Redis or a managed rate-limit service.
 *
 * Rejections are cheap on purpose: no database call, no logging per request
 * (which would let an attacker drive log spend), and a JSON body matching the
 * shape every other error uses so the frontend needs no special case.
 */
const rateLimit = require("express-rate-limit");
const platform = require("../config/platform");

const isProduction = process.env.NODE_ENV === "production";

/**
 * Development gets very high ceilings so hot-reloading and manual testing never
 * trip a limiter; the shape of the config stays identical either way.
 */
const scale = (productionLimit) => (isProduction ? productionLimit : productionLimit * 50);

/**
 * IPv6-safe client key.
 *
 * A single IPv6 address is a terrible rate-limit key: a /64 is the standard
 * allocation handed to one subscriber or one VPS, so limiting per exact address
 * lets a client rotate through 18 quintillion distinct keys for free. Collapsing
 * to the /64 makes an IPv6 limit mean "per subscriber", the way an IPv4 limit
 * already does.
 *
 * The `::` shorthand has to be expanded first. Simply splitting on ":" and
 * counting groups does not work — "2001:db8::1" and "2001:db8::2" are the same
 * /64 but split into four parts each, so a naive length check leaves them as
 * separate keys and the bypass is wide open again. Compressed form is exactly
 * what proxies and Node's own `remoteAddress` produce, so it is the common
 * case, not the edge case.
 */
const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

const normaliseClientAddress = (raw) => {
  // Drop any zone index ("fe80::1%eth0") before parsing.
  const addr = String(raw).split("%")[0].toLowerCase();

  // A v4-mapped address is a v4 client; key it as one so the same caller does
  // not get two different buckets depending on how the hop wrote it.
  const mapped = IPV4_MAPPED.exec(addr);
  if (mapped) return mapped[1];

  if (!addr.includes(":")) return addr; // plain IPv4

  const [head, tail] = addr.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];

  let groups;
  if (addr.includes("::")) {
    const zeros = Array(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill("0");
    groups = [...headGroups, ...zeros, ...tailGroups];
  } else {
    groups = headGroups;
  }

  // Anything that does not parse cleanly is keyed verbatim rather than being
  // silently collapsed into a bucket shared with unrelated clients.
  if (groups.length < 4) return addr;

  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
};

const clientKey = (req) =>
  normaliseClientAddress(req.ip || req.socket?.remoteAddress || "unknown");

/** Signed-in users are limited per account; anonymous callers per client IP. */
const userOrClientKey = (req) => (req.user ? `u:${req.user.uuid}` : `ip:${clientKey(req)}`);

const tooMany = (message) => ({ success: false, message });

const make = ({ windowMs, max, message, keyGenerator = clientKey, skip, skipSuccessfulRequests }) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator,
    skip,
    skipSuccessfulRequests,
    // A preflight carries no credentials and no side effects; counting it would
    // halve the effective budget of every cross-origin write.
    skipFailedRequests: false,
    message: tooMany(message),
    handler: (req, res, _next, options) => {
      res.status(options.statusCode).json(options.message);
    },
  });

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// ---------------------------------------------------------------------------
// Limiters, ordered from broadest to most specific.
// ---------------------------------------------------------------------------

/**
 * Baseline for the whole API surface.
 *
 * Sized from real page behaviour, not from a round number: opening an article
 * fires article + related + comments + likes + bookmark + view ≈ 6 requests,
 * and a reader who browses hard might do that five or six times a minute. 300
 * per minute leaves generous headroom for that while still cutting off scripted
 * traffic, and it is deliberately not the 50/min this previously used — that
 * number throttled ordinary readers and shared-NAT offices.
 */
const global = make({
  windowMs: MINUTE,
  max: scale(300),
  message: "Too many requests. Please slow down and try again shortly.",
  // GET /health and friends are mounted outside /api and never reach this.
  skip: (req) => req.method === "OPTIONS",
});

/**
 * Credential endpoints: login, register, password change.
 *
 * Intentionally strict — legitimate users authenticate a handful of times an
 * hour at most. `skipSuccessfulRequests` means a user who simply logs in
 * repeatedly is never punished; only failures consume budget, so this counts
 * guesses rather than sessions.
 *
 * This is the IP-side, per-instance half of brute-force defence. The global
 * half is the DB-backed per-account lockout in utils/loginThrottle.
 */
const auth = make({
  windowMs: 15 * MINUTE,
  max: scale(10),
  message: "Too many authentication attempts. Please wait a few minutes and try again.",
  skipSuccessfulRequests: true,
});

/**
 * Account creation. Separate from `auth` because registrations succeed, so
 * skipSuccessfulRequests would make that limiter useless here.
 */
const register = make({
  windowMs: HOUR,
  max: scale(5),
  message: "Too many accounts created from this network. Please try again later.",
});

/**
 * Two-factor code submission. Six digits is a 1-in-a-million guess, and the
 * verifier accepts a +/- 1 step window, so an unthrottled endpoint is brute
 * forceable in hours. Keyed per account, since the caller is authenticated.
 */
const twoFactor = make({
  windowMs: 15 * MINUTE,
  max: scale(10),
  message: "Too many verification attempts. Please wait before trying again.",
  keyGenerator: userOrClientKey,
  skipSuccessfulRequests: true,
});

/**
 * Unauthenticated writes that cost money downstream.
 *
 * Each caller gets its OWN limiter instance, and therefore its own counter.
 * Sharing one instance across endpoints would mean a visitor who submitted the
 * contact form could not then subscribe — and on a shared office address, one
 * person's form submission would spend everyone else's budget on an unrelated
 * endpoint. Same policy, separate buckets.
 */
const publicWriteOptions = {
  windowMs: 10 * MINUTE,
  max: scale(5),
  message: "Too many submissions. Please try again in a few minutes.",
};

const contactWrite = make(publicWriteOptions);
const newsletterWrite = make(publicWriteOptions);

/**
 * The unsubscribe pages. Deliberately far more generous than a subscribe: this
 * is someone acting on a link from their own inbox, the token is the
 * capability, and rate-limiting a person out of unsubscribing is both a bad
 * experience and a compliance problem.
 */
const unsubscribe = make({
  windowMs: 10 * MINUTE,
  max: scale(30),
  message: "Too many requests. Please try again in a few minutes.",
});

/**
 * Authenticated content writes — comments, likes, bookmarks, profile edits.
 * Keyed per account so one abusive user cannot spend a shared office IP's
 * budget, and high enough that ordinary interaction never notices it.
 */
const write = make({
  windowMs: MINUTE,
  max: scale(30),
  message: "You are doing that too quickly. Please wait a moment.",
  keyGenerator: userOrClientKey,
});

/**
 * Full-text search. Every call runs a Postgres FTS scan and a COUNT over the
 * article table — an order of magnitude more expensive than a keyed lookup, and
 * the easiest endpoint on the site to turn into a database-CPU bill. The
 * frontend already debounces; this bounds what a script can do.
 */
const search = make({
  windowMs: MINUTE,
  max: scale(30),
  message: "Too many searches. Please wait a moment before searching again.",
  keyGenerator: userOrClientKey,
});

/**
 * On-the-fly image rendering. Each miss rasterises an SVG through sharp, which
 * is the most CPU-hungry thing this service does and the one most able to
 * saturate a small container. Responses are cached in-process and at the CDN,
 * so this only bounds cache misses.
 */
const imageRender = make({
  windowMs: MINUTE,
  max: scale(20),
  message: "Too many image requests. Please try again shortly.",
});

/**
 * File uploads. Bounded per account because each one consumes bandwidth and
 * paid third-party storage, and avatar upload is open to every signed-in user.
 */
const upload = make({
  windowMs: 10 * MINUTE,
  max: scale(20),
  message: "Too many uploads. Please try again later.",
  keyGenerator: userOrClientKey,
});

/**
 * Admin fan-out actions — sending a newsletter digest mails every subscriber.
 * Low limit because a double-click should never mean two broadcasts.
 */
const broadcast = make({
  windowMs: HOUR,
  max: scale(3),
  message: "Digest sending is limited. Please wait before sending again.",
  keyGenerator: userOrClientKey,
});

/**
 * Internal task endpoints.
 *
 * Reached by a scheduler a handful of times an hour, never by a user. The limit
 * exists so the shared bearer token cannot be guessed at unlimited speed: the
 * comparison is constant-time, but nothing else bounds how many candidates an
 * attacker may try per second.
 */
const internal = make({
  windowMs: MINUTE,
  max: scale(20),
  message: "Too many requests.",
});

/** Public feeds and sitemaps: cached, but still worth bounding for crawlers. */
const feed = make({
  windowMs: MINUTE,
  max: scale(60),
  message: "Too many feed requests. Please try again shortly.",
});

/**
 * The realistic global ceiling for a limiter, given the instance cap. Surfaced
 * on the diagnostics endpoint so the per-instance/global distinction stays
 * visible in production rather than living only in this comment.
 */
const describe = () => ({
  scope: "in-process (per instance)",
  instances: platform.maxInstances,
  note: `Effective global ceiling is approximately the per-instance limit x ${platform.maxInstances}. Per-account brute-force protection is enforced globally in the database.`,
});

module.exports = {
  global,
  internal,
  auth,
  register,
  twoFactor,
  contactWrite,
  newsletterWrite,
  unsubscribe,
  write,
  search,
  imageRender,
  upload,
  broadcast,
  feed,
  clientKey,
  normaliseClientAddress,
  userOrClientKey,
  describe,
};
