/**
 * tiny in-memory, per-session cache for read-only data
 */
const store = new Map<string, unknown>();

export function getCache<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setCache<T>(key: string, value: T): void {
  store.set(key, value);
}

/** Clear the whole cache, or just keys starting with `prefix` */
export function clearCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
