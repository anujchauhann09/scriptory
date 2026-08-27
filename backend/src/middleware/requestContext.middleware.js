const crypto = require("crypto");
const config = require("../config/env");

/**
 * Per-request identity and deadline.
 *
 * The id ties a client-visible 500 to the exact log lines that produced it.
 * Platform load balancers already generate a trace header on the way in, so an
 * existing one is reused rather than replaced — that keeps the app's logs
 * joinable with the platform's own request logs instead of forming a parallel
 * universe of ids.
 */
const TRACE_HEADERS = [
  "x-request-id",
  "x-cloud-trace-context", // GCP load balancer / Cloud Run
  "traceparent", // W3C, used by most other vendors
  "x-amzn-trace-id",
];

const readIncomingId = (req) => {
  for (const header of TRACE_HEADERS) {
    const value = req.get(header);
    // Trace headers are attacker-controllable, and they end up in logs. Bound
    // the length and strip anything that could forge a log line.
    if (value) return value.replace(/[^\w.=@:/-]/g, "").slice(0, 128);
  }
  return null;
};

const requestContext = (req, res, next) => {
  req.id = readIncomingId(req) || crypto.randomUUID();
  res.set("X-Request-Id", req.id);

  /**
   * Server-side deadline.
   *
   * Without one, a request stalled on a slow upstream holds a connection, a
   * database pool slot, and (on a per-request-billed platform) meter time until
   * the platform's own much longer timeout fires. Failing here first keeps the
   * error legible and releases the resources.
   */
  req.setTimeout(config.requestTimeoutMs, () => {
    if (res.headersSent) {
      // Already streaming a response; the only way to stop is to drop the
      // socket, and the client will see a truncated body either way.
      return req.destroy();
    }
    // Respond and let the response close the connection normally. Destroying
    // the socket here instead would race the write and deliver nothing at all,
    // turning a clean 503 into an opaque connection reset.
    res.status(503).json({
      success: false,
      message: "The request took too long to process. Please try again.",
    });
  });

  next();
};

module.exports = requestContext;
