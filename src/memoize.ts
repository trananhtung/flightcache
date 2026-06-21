import { TTLCache } from "./ttl-cache.js";

/** Options for {@link memoize}. */
export interface MemoizeOptions<A extends unknown[]> {
  /** Fresh window in ms — how long a value is served without recomputation. Default `60000`. */
  ttl?: number;
  /**
   * Extra ms during which a stale value is served immediately while it is
   * refreshed in the background (stale-while-revalidate). Default `0` (disabled).
   */
  staleWhileRevalidate?: number;
  /** Maximum cached keys (LRU eviction). Unbounded if unset. */
  max?: number;
  /** Derive a cache key from the arguments. Default `JSON.stringify(args)`. */
  key?: (...args: A) => string;
  /** Coalesce concurrent calls for the same key into one execution. Default `true`. */
  singleFlight?: boolean;
  /** Clock source in ms; injectable for deterministic tests. Defaults to `Date.now`. */
  clock?: () => number;
}

interface CacheEntry<V> {
  value: V;
  freshUntil: number;
}

/** A memoized async function with cache controls attached. */
export interface Memoized<A extends unknown[], V> {
  (...args: A): Promise<V>;
  /** The underlying TTL+LRU cache (values wrapped with freshness metadata). */
  readonly cache: TTLCache<string, CacheEntry<V>>;
  /** Drop the cached entry for the given arguments. */
  invalidate(...args: A): void;
  /** Clear all cached entries and in-flight calls. */
  clear(): void;
}

/**
 * Memoize an async function with TTL, LRU, single-flight, and
 * stale-while-revalidate.
 *
 * - **single-flight**: concurrent calls with the same key share one execution,
 *   preventing a cache stampede on cold/expired keys.
 * - **stale-while-revalidate**: once `ttl` passes, a value within the extra SWR
 *   window is returned instantly while a fresh value is fetched in the background.
 *
 * @example
 * ```ts
 * const getUser = memoize((id: string) => db.users.find(id), {
 *   ttl: 30_000,
 *   staleWhileRevalidate: 60_000,
 *   max: 1000,
 * });
 * await getUser("42"); // computes; concurrent callers dedupe
 * ```
 */
export function memoize<A extends unknown[], V>(
  fn: (...args: A) => Promise<V> | V,
  options: MemoizeOptions<A> = {},
): Memoized<A, V> {
  const ttl = options.ttl ?? 60_000;
  const swr = options.staleWhileRevalidate ?? 0;
  const keyOf = options.key ?? ((...args: A) => JSON.stringify(args));
  const singleFlight = options.singleFlight ?? true;
  const clock = options.clock ?? Date.now;
  const cache = new TTLCache<string, CacheEntry<V>>({ max: options.max, ttl: ttl + swr, clock });
  const inflight = new Map<string, Promise<V>>();

  function compute(key: string, args: A): Promise<V> {
    if (singleFlight) {
      const existing = inflight.get(key);
      if (existing) return existing;
    }
    // Call fn synchronously (so a single-flight window opens immediately), but
    // turn a synchronous throw into a rejection.
    let base: Promise<V>;
    try {
      base = Promise.resolve(fn(...args));
    } catch (err) {
      base = Promise.reject(err);
    }
    const p = base
      .then((value) => {
        cache.set(key, { value, freshUntil: clock() + ttl });
        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });
    if (singleFlight) inflight.set(key, p);
    return p;
  }

  const memoized = ((...args: A): Promise<V> => {
    const key = keyOf(...args);
    const entry = cache.peek(key);
    if (entry !== undefined) {
      if (clock() < entry.freshUntil) return Promise.resolve(entry.value); // fresh hit
      // Stale (still within the SWR window): serve now, refresh in the background.
      if (!inflight.has(key)) void compute(key, args).catch(() => {});
      return Promise.resolve(entry.value);
    }
    return compute(key, args); // miss or fully expired
  }) as Memoized<A, V>;

  Object.defineProperty(memoized, "cache", { value: cache, enumerable: true });
  memoized.invalidate = (...args: A) => {
    cache.delete(keyOf(...args));
  };
  memoized.clear = () => {
    cache.clear();
    inflight.clear();
  };
  return memoized;
}
