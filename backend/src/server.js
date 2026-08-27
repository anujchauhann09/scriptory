const config = require("./config/env");
const platform = require("./config/platform");
const app = require("./app");
const prisma = require("./config/db");
const logger = require("./utils/logger");
const { startScheduler, stopScheduler } = require("./scheduler");

/**
 * The port is dictated by the platform, not by the app. Every container runtime
 * injects PORT and expects the process to listen on it; hard-coding a value is
 * the most common reason a container starts fine and still fails its health
 * check.
 */
const PORT = config.port;

let server;
let shuttingDown = false;

const start = async () => {
  try {
    await prisma.connectWithRetry();
    logger.info("Database connected", {
      poolMax: prisma.poolInfo.poolMax,
      connectionBudget: prisma.poolInfo.connectionBudget,
      transport: prisma.poolInfo.usesSocket ? "unix-socket" : "tcp",
    });

    // 0.0.0.0, not localhost: a container's health check and load balancer
    // arrive on the container's own network interface, and a process bound to
    // the loopback address is unreachable from either.
    server = app.listen(PORT, "0.0.0.0", () => {
      logger.info("Scriptory API listening", {
        port: PORT,
        env: config.nodeEnv,
        platform: platform.name,
        instance: platform.instanceId,
        trustProxyHops: platform.trustProxyHops,
      });
      const scheduler = startScheduler();
      logger.info("Scheduler started", scheduler);
    });

    /**
     * Timeouts, ordered deliberately.
     *
     * `keepAliveTimeout` must exceed the fronting proxy's idle timeout.
     * Otherwise the server closes a pooled connection at the exact moment the
     * proxy reuses it, and the proxy reports a 502 for a request the app never
     * saw. Most managed load balancers idle at 60 seconds, so this sits above
     * that; `headersTimeout` must in turn exceed `keepAliveTimeout`.
     */
    server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS) || 65000;
    server.headersTimeout = server.keepAliveTimeout + 5000;
    // Bounds a slowloris-style client that opens a connection and dribbles
    // bytes to hold a socket open indefinitely.
    server.requestTimeout = config.requestTimeoutMs;
    server.maxHeadersCount = 100;
  } catch (err) {
    logger.error("Failed to start server", { message: err.message, code: err.code });
    process.exit(1);
  }
};

/**
 * Graceful shutdown.
 *
 * A container runtime sends SIGTERM and then waits a fixed grace period before
 * SIGKILL. The previous implementation called process.exit() immediately, which
 * severed every in-flight request — during a routine deploy that is a burst of
 * failed requests for real users, and a half-finished database write for
 * whoever was mid-transaction.
 *
 * The sequence here is: stop accepting new connections, let in-flight requests
 * finish, stop background timers, close the database pool, exit. A hard
 * deadline guarantees the process still exits if something refuses to drain.
 */
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Shutdown signal received", { signal });

  // Nothing new should be scheduled while draining.
  stopScheduler();

  const forceExit = setTimeout(() => {
    logger.warn("Graceful shutdown timed out, forcing exit", {
      timeoutMs: config.shutdownTimeoutMs,
    });
    process.exit(1);
  }, config.shutdownTimeoutMs);
  // Do not let this timer alone keep the event loop alive.
  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info("HTTP server closed, in-flight requests drained");
    }
    // Released last, so a request finishing during the drain still has its
    // connection.
    await prisma.$disconnect();
    logger.info("Database pool closed");
    clearTimeout(forceExit);
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown", { message: err.message });
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

/**
 * A rejection with no handler leaves the process in an unknown state. Logging
 * and draining is safer than either crashing outright (which drops in-flight
 * requests) or carrying on as though nothing happened.
 */
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception, shutting down", { message: err.message, stack: err.stack });
  shutdown("uncaughtException");
});

start();

module.exports = { app, shutdown };
