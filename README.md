# flightcache

> Tiny async cache: **TTL + LRU**, **single-flight** dedup, and **stale-while-revalidate**. **Zero dependencies**.

[![CI](https://github.com/trananhtung/flightcache/actions/workflows/ci.yml/badge.svg)](https://github.com/trananhtung/flightcache/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/flightcache.svg)](https://www.npmjs.com/package/flightcache)
[![bundle size](https://img.shields.io/bundlephobia/minzip/flightcache)](https://bundlephobia.com/package/flightcache)
[![types](https://img.shields.io/npm/types/flightcache.svg)](https://www.npmjs.com/package/flightcache)
[![license](https://img.shields.io/npm/l/flightcache.svg)](./LICENSE)

Caching an expensive async call sounds simple — until ten requests for the same
cold key arrive at once and all ten hit your database (a **cache stampede**), or a
value expires mid-traffic and every caller suddenly blocks on a slow refresh.
`flightcache` solves both: it **coalesces concurrent calls into one** (single
flight) and can **serve a slightly stale value instantly while refreshing in the
background** (stale-while-revalidate).

```ts
import { memoize } from "flightcache";

const getUser = memoize((id: string) => db.users.find(id), {
  ttl: 30_000,                 // fresh for 30s
  staleWhileRevalidate: 60_000, // then serve stale up to 60s more while refreshing
  max: 1000,                    // LRU cap
});

// 50 concurrent calls for the same id → the DB is hit exactly once.
await Promise.all(ids.map(getUser));
```

## Why flightcache?

- **No stampede.** Concurrent calls for the same key share a single in-flight
  promise instead of all recomputing.
- **No latency cliff.** With `staleWhileRevalidate`, expiry returns the cached
  value immediately and refreshes in the background — readers never wait on a slow
  recompute.
- **TTL + LRU built in.** Per-entry TTL and least-recently-used eviction.
- **Failures aren't cached.** A rejected computation propagates and is retried next
  call, not memoized.
- **Zero dependencies**, ESM + CJS + types, and an injectable clock for tests.

## Install

```bash
npm install flightcache
# or: pnpm add flightcache  /  yarn add flightcache  /  bun add flightcache
```

## API

### `memoize(fn, options?) → memoized`

Wrap an async (or sync) function. The returned function caches by key and exposes
`.cache`, `.invalidate(...args)`, and `.clear()`.

| Option                 | Type                    | Default               | Description                                          |
| ---------------------- | ----------------------- | --------------------- | ---------------------------------------------------- |
| `ttl`                  | `number` (ms)           | `60000`               | How long a value stays fresh.                        |
| `staleWhileRevalidate` | `number` (ms)           | `0`                   | Extra window to serve stale while refreshing.        |
| `max`                  | `number`                | unbounded             | LRU cap on cached keys.                              |
| `key`                  | `(...args) => string`   | `JSON.stringify(args)`| Derive the cache key from arguments.                 |
| `singleFlight`         | `boolean`               | `true`                | Coalesce concurrent same-key calls.                  |
| `clock`                | `() => number`          | `Date.now`            | Injectable clock for deterministic tests.            |

```ts
const m = memoize(fetchThing, { ttl: 5_000 });
await m("a");
m.invalidate("a"); // drop one key
m.clear();         // drop everything
m.cache.size;      // inspect the underlying cache
```

### `TTLCache<K, V>`

The storage layer on its own — a TTL + LRU map.

```ts
import { TTLCache } from "flightcache";

const cache = new TTLCache<string, Buffer>({ max: 500, ttl: 10_000 });
cache.set("k", buf);
cache.get("k");    // bumps recency; undefined if expired
cache.peek("k");   // no recency change
cache.has("k");
cache.delete("k");
cache.keys();      // live keys, oldest → newest
```

## Notes

- This is an **in-memory, single-process** cache (per Node instance / browser tab).
  For cross-process sharing, put a Redis/Memcached layer behind the same `memoize`
  function body.
- Keys default to `JSON.stringify(args)`; pass `key` for stable hashing of complex
  arguments or to ignore volatile fields.

## License

[MIT](./LICENSE) © Tung Tran
