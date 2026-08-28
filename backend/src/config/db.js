const { PrismaClient } = require("@prisma/client");
const logger = require("../utils/logger");
const database = require("./database");

const prisma = new PrismaClient({
  datasources: { db: { url: database.buildConnectionUrl() } },
  log: [
    { emit: "event", level: "query" },
    { emit: "event", level: "error" },
    { emit: "event", level: "warn" },
  ],
});

const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS) || 500;

/**
 * Slow-query visibility in production too, but only the shape of the query.
 * Prisma's `e.query` is the parameterised SQL and `e.params` holds the bound
 * values — those values are user data (emails, tokens, article bodies) and must
 * never be logged.
 */
prisma.$on("query", (e) => {
  if (e.duration >= SLOW_QUERY_MS) {
    logger.warn("Slow query", { durationMs: e.duration, query: e.query.slice(0, 500) });
  }
});

prisma.$on("error", (e) => logger.error("Prisma error", { message: e.message, target: e.target }));
prisma.$on("warn", (e) => logger.warn("Prisma warning", { message: e.message }));

/**
 * Connects with bounded exponential backoff.
 *
 * A managed database is not always reachable the instant a container starts:
 * Cloud SQL may be waking from idle, a sidecar proxy may still be establishing
 * its tunnel, or a failover may be in progress. Crashing on the first refused
 * connection turns a two-second blip into a cold-start outage, so transient
 * failures are retried and only a persistent one is fatal.
 */
const connectWithRetry = async ({ attempts = 5, baseDelayMs = 250 } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await prisma.$connect();
      return;
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 4000);
      logger.warn("Database connection failed, retrying", {
        attempt,
        attempts,
        delayMs: delay,
        code: err.code,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
};

/** Cheap liveness probe for the readiness endpoint. */
const ping = async () => {
  await prisma.$queryRaw`SELECT 1`;
};

module.exports = prisma;
module.exports.connectWithRetry = connectWithRetry;
module.exports.ping = ping;
module.exports.poolInfo = {
  poolMax: database.poolMax,
  poolTimeout: database.poolTimeout,
  connectionBudget: database.connectionBudget,
  describeBudget: database.describeBudget,
  usesSocket: database.usesSocket,
};
