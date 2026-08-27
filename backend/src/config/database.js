/**
 * Database connection configuration.
 *
 * Two concerns live here, both provider-agnostic:
 *
 *   1. Transport — a managed Postgres is reached either over TCP (host:port,
 *      optionally through a sidecar proxy) or over a Unix domain socket that
 *      the platform mounts into the container. Cloud SQL on Cloud Run mounts
 *      /cloudsql/<connection-name>; RDS/Neon/Supabase/self-hosted use TCP. The
 *      caller sets DB_SOCKET_PATH for the socket case and nothing otherwise.
 *
 *   2. Pooling — the single most important production knob. Prisma opens its
 *      own pool per process and defaults to `num_cpus * 2 + 1`, which is a bad
 *      fit for autoscaled containers: total connections are
 *      `pool_size x instance_count`, and a managed Postgres has a hard,
 *      tier-dependent max_connections. Exceeding it does not degrade — it hard
 *      fails every instance at once. So the pool is sized explicitly and
 *      budgeted against MAX_INSTANCES.
 */
const platform = require("./platform");
const { readSecret } = require("./secrets");

const intFromEnv = (key, fallback) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Connections this process may hold open.
 *
 * Node is single-threaded: it cannot usefully execute more queries in parallel
 * than a small multiple of its CPU count, so a big pool buys nothing but
 * connection-slot consumption. A small pool with a short queue timeout is
 * strictly better under autoscaling — requests queue in-process (cheap) rather
 * than the platform opening more sockets to the database (expensive, capped).
 */
const poolMax = intFromEnv("DB_POOL_MAX", platform.isServerless ? 5 : 10);

/** Seconds a query waits for a free connection before failing fast. */
const poolTimeout = intFromEnv("DB_POOL_TIMEOUT", 10);

/** Seconds to wait for a new connection to be established. */
const connectTimeout = intFromEnv("DB_CONNECT_TIMEOUT", 10);

/** Milliseconds a single query may run before the driver aborts it. */
const statementTimeoutMs = intFromEnv("DB_STATEMENT_TIMEOUT_MS", 15000);

/**
 * Rewrites DATABASE_URL with the pooling parameters and, when the platform
 * mounts a Unix socket, points the connection at it.
 *
 * Explicit values already present in DATABASE_URL always win, so an operator
 * can override any of this without touching code.
 */
const buildConnectionUrl = () => {
  const raw = readSecret("DATABASE_URL", { required: true });

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL");
  }

  const params = url.searchParams;
  const setIfAbsent = (key, value) => {
    if (!params.has(key)) params.set(key, String(value));
  };

  // Unix socket transport: Postgres URLs express this as ?host=<dir>, with the
  // hostname component left as a placeholder.
  const socketPath = process.env.DB_SOCKET_PATH;
  if (socketPath && !params.has("host")) {
    params.set("host", socketPath);
    url.hostname = "localhost";
    url.port = "";
  }

  setIfAbsent("connection_limit", poolMax);
  setIfAbsent("pool_timeout", poolTimeout);
  setIfAbsent("connect_timeout", connectTimeout);
  // Belt-and-braces against a runaway query pinning a pooled connection.
  setIfAbsent("statement_cache_size", 0);

  // Require TLS for TCP connections in production unless the operator has
  // already said otherwise. Socket connections are local to the container and
  // do not need it.
  if (!params.has("sslmode") && !socketPath && process.env.NODE_ENV === "production") {
    params.set("sslmode", "require");
  }

  return url.toString();
};

/**
 * Total connection slots this deployment can consume at full scale-out.
 * Compare against the database tier's max_connections and leave headroom for
 * migrations, admin sessions, and the platform's own health checks.
 */
const connectionBudget = poolMax * platform.maxInstances;

module.exports = {
  buildConnectionUrl,
  poolMax,
  poolTimeout,
  connectTimeout,
  statementTimeoutMs,
  connectionBudget,
  usesSocket: Boolean(process.env.DB_SOCKET_PATH),
};
