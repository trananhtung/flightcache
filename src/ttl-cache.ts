/** Options for {@link TTLCache}. */
export interface TTLCacheOptions {
  /** Maximum number of entries; least-recently-used are evicted past this. Unbounded if unset. */
  max?: number;
  /** Default time-to-live in ms for entries. Entries never expire if unset/`Infinity`. */
  ttl?: number;
  /** Clock source in ms; injectable for deterministic tests. Defaults to `Date.now`. */
  clock?: () => number;
}

interface Entry<V> {
  value: V;
  expireAt: number;
}

/**
 * A small TTL + LRU cache.
 *
 * Entries expire after their TTL (checked lazily on access) and the least-recently
 * used entry is evicted once `max` is exceeded. Backed by a `Map`, so iteration
 * order is LRU (oldest → newest).
 *
 * @typeParam K - Key type.
 * @typeParam V - Value type.
 */
export class TTLCache<K, V> {
  private readonly map = new Map<K, Entry<V>>();
  private readonly max: number | undefined;
  private readonly defaultTtl: number | undefined;
  private readonly clock: () => number;

  constructor(options: TTLCacheOptions = {}) {
    this.max = options.max;
    this.defaultTtl = options.ttl;
    this.clock = options.clock ?? Date.now;
  }

  /** Number of live (non-expired) entries currently stored. */
  get size(): number {
    this.purge();
    return this.map.size;
  }

  /** Get a value, refreshing its LRU recency. Returns `undefined` if missing or expired. */
  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    if (this.isExpired(entry)) {
      this.map.delete(key);
      return undefined;
    }
    // Bump recency: re-insert at the newest position.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  /** Get a value WITHOUT changing its LRU recency. */
  peek(key: K): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    if (this.isExpired(entry)) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Whether a live entry exists for `key` (does not change recency). */
  has(key: K): boolean {
    return this.peek(key) !== undefined;
  }

  /** Store `value` under `key`, optionally overriding the default TTL (ms). */
  set(key: K, value: V, ttl?: number): this {
    const t = ttl ?? this.defaultTtl;
    const expireAt = t == null || t === Infinity ? Infinity : this.clock() + t;
    if (this.map.has(key)) this.map.delete(key); // ensure it moves to newest
    this.map.set(key, { value, expireAt });
    if (this.max !== undefined && this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    return this;
  }

  /** Delete an entry. Returns whether it existed. */
  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this.map.clear();
  }

  /** Live keys, oldest → newest. */
  keys(): K[] {
    this.purge();
    return [...this.map.keys()];
  }

  private isExpired(entry: Entry<V>): boolean {
    return entry.expireAt !== Infinity && this.clock() >= entry.expireAt;
  }

  private purge(): void {
    for (const [key, entry] of this.map) {
      if (this.isExpired(entry)) this.map.delete(key);
    }
  }
}
