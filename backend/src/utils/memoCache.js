const platform = require("../config/platform");

/**
 * Tiny in-process TTL cache for hot, read-only, non-personalised data.
 *
 * Deliberately not Redis. The data cached here (site stats, RSS, sitemaps,
 * related-post candidates, rendered OG images) is public, cheap to recompute,
 * and identical for every visitor — so a per-instance cache with a short TTL
 * removes almost all the database and CPU load a shared cache would, at zero
 * additional infrastructure cost.
 *
 * Consequences of being per-instance, which are fine for this data:
 *   - each container warms its own copy, so the miss rate scales with instances;
 *   - entries vanish when an instance is recycled;
 *   - a write is visible to other instances only after their TTL expires, so
 *     TTLs are kept short enough that staleness stays unremarkable.
 *
 * Never cache anything user-specific here: entries are keyed by content, not by
 * caller, and serving one reader's data to another is the classic way a cache
 * turns into an access-control bug.
 */
const store = new Map();

/** Hard cap so a pathological key space cannot grow into the container's memory
 *  limit — an OOM kill is a worse outcome than a cache miss. */
const MAX_ENTRIES = Number(process.env.MEMO_CACHE_MAX_ENTRIES) || 200;

const now = () => Date.now();

const get = (key) => {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= now()) {
    store.delete(key);
    return undefined;
  }
  // Refresh insertion order so eviction approximates least-recently-used.
  store.delete(key);
  store.set(key, hit);
  return hit.value;
};

const set = (key, value, ttlMs) => {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: now() + ttlMs });
  return value;
};

const del = (prefix) => {
  if (!prefix) return store.clear();
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
};

/**
 * Memoises an async producer, collapsing concurrent misses onto one call.
 *
 * The in-flight dedupe matters more than the caching on a cold start: without
 * it, the first burst of traffic after a scale-out event runs the same
 * expensive query once per concurrent request instead of once in total.
 */
const inFlight = new Map();

const remember = async (key, ttlMs, producer) => {
  const cached = get(key);
  if (cached !== undefined) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await producer();
      set(key, value, ttlMs);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
};

const stats = () => ({
  entries: store.size,
  maxEntries: MAX_ENTRIES,
  scope: platform.isStateless ? "per instance (ephemeral)" : "per process",
});

module.exports = { get, set, del, remember, stats };
