/**
 * Platform abstraction.
 *
 * The rest of the codebase must never read a vendor-specific environment
 * variable (K_SERVICE, DYNO, WEBSITE_INSTANCE_ID, …). It reads the normalised
 * values exported here instead, so swapping the hosting provider is a change to
 * this one file — everything downstream keeps working.
 *
 * Detection is best-effort and always overridable with PLATFORM.
 */

// Each adapter answers: am I running here, and what is this instance called?
const ADAPTERS = [
  {
    name: "gcp-cloud-run",
    detect: () => Boolean(process.env.K_SERVICE),
    instanceId: () => process.env.K_REVISION || process.env.K_SERVICE,
    region: () => process.env.GOOGLE_CLOUD_REGION || process.env.FUNCTION_REGION,
    // Cloud Run terminates TLS at its own front end and appends exactly one hop.
    // Adding a global external load balancer in front makes it two.
    proxyHops: 1,
    serverless: true,
  },
  {
    name: "aws-lambda",
    detect: () => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME),
    instanceId: () => process.env.AWS_LAMBDA_LOG_STREAM_NAME,
    region: () => process.env.AWS_REGION,
    proxyHops: 1,
    serverless: true,
  },
  {
    name: "azure-app-service",
    detect: () => Boolean(process.env.WEBSITE_INSTANCE_ID),
    instanceId: () => process.env.WEBSITE_INSTANCE_ID,
    region: () => process.env.REGION_NAME,
    proxyHops: 1,
    serverless: true,
  },
  {
    name: "heroku",
    detect: () => Boolean(process.env.DYNO),
    instanceId: () => process.env.DYNO,
    region: () => undefined,
    proxyHops: 1,
    serverless: false,
  },
  {
    name: "kubernetes",
    detect: () => Boolean(process.env.KUBERNETES_SERVICE_HOST),
    instanceId: () => process.env.HOSTNAME,
    region: () => undefined,
    // An ingress controller is normally the only proxy in the path.
    proxyHops: 1,
    serverless: false,
  },
];

const LOCAL = {
  name: "local",
  instanceId: () => `local-${process.pid}`,
  region: () => undefined,
  proxyHops: 0,
  serverless: false,
};

const detect = () => {
  const forced = process.env.PLATFORM;
  if (forced) {
    const match = ADAPTERS.find((a) => a.name === forced);
    if (match) return match;
    if (forced === "local") return LOCAL;
  }
  return ADAPTERS.find((a) => a.detect()) || LOCAL;
};

const adapter = detect();

const intFromEnv = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * How many reverse proxies sit in front of this process.
 *
 * This drives Express's `trust proxy`, which in turn decides what `req.ip`
 * returns — and `req.ip` is the key for every rate limiter. Getting it wrong is
 * a security bug in both directions: too high lets a client forge
 * X-Forwarded-For and evade limits, too low collapses every client onto the
 * proxy's IP and rate-limits the whole world as one.
 */
const trustProxyHops = intFromEnv("TRUST_PROXY_HOPS", adapter.proxyHops);

/**
 * Upper bound on how many instances of this service may run concurrently.
 *
 * In-process rate limits are per instance, so the effective global limit is
 * roughly `limit x instances`. Limits are sized against this number; keep it in
 * sync with the platform's max-instances setting.
 */
const maxInstances = Math.max(1, intFromEnv("MAX_INSTANCES", adapter.serverless ? 4 : 1));

module.exports = {
  name: adapter.name,
  instanceId: adapter.instanceId() || `${adapter.name}-${process.pid}`,
  region: adapter.region(),
  isServerless: adapter.serverless,
  trustProxyHops,
  maxInstances,
  // Serverless runtimes may freeze/replace instances at will, so anything held
  // in memory is a cache, never a source of truth.
  isStateless: adapter.serverless,
};
