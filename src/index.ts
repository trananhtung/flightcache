/**
 * flightcache — a tiny async cache: TTL + LRU, single-flight dedup, and
 * stale-while-revalidate. Zero dependencies.
 *
 * @packageDocumentation
 */

export { TTLCache, type TTLCacheOptions } from "./ttl-cache.js";
export { memoize, type MemoizeOptions, type Memoized } from "./memoize.js";
