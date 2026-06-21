# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-21

### Added

- `TTLCache<K, V>` — TTL + LRU cache with `get`/`peek`/`has`/`set`/`delete`/`clear`/
  `keys`/`size`, per-entry TTL override, and an injectable clock.
- `memoize` — async memoization with TTL, LRU (`max`), single-flight dedup,
  stale-while-revalidate, custom `key`, and `.cache`/`.invalidate`/`.clear`.
  Rejections propagate and are not cached.
- ESM + CJS builds, types, and CI across Node 18 / 20 / 22.
