import { describe, expect, it } from "vitest";
import { TTLCache } from "../src/ttl-cache.js";

function clockOf(ref: { t: number }) {
  return () => ref.t;
}

describe("TTLCache", () => {
  it("stores and retrieves values", () => {
    const c = new TTLCache<string, number>();
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    expect(c.has("a")).toBe(true);
    expect(c.get("missing")).toBeUndefined();
  });

  it("expires entries after their TTL", () => {
    const ref = { t: 0 };
    const c = new TTLCache<string, number>({ ttl: 100, clock: clockOf(ref) });
    c.set("a", 1);
    ref.t = 99;
    expect(c.get("a")).toBe(1);
    ref.t = 100;
    expect(c.get("a")).toBeUndefined();
    expect(c.has("a")).toBe(false);
  });

  it("supports a per-entry TTL override", () => {
    const ref = { t: 0 };
    const c = new TTLCache<string, number>({ ttl: 100, clock: clockOf(ref) });
    c.set("short", 1, 10);
    ref.t = 20;
    expect(c.get("short")).toBeUndefined();
  });

  it("evicts the least-recently-used entry past max", () => {
    const c = new TTLCache<string, number>({ max: 2 });
    c.set("a", 1);
    c.set("b", 2);
    c.get("a"); // 'a' is now most-recent, 'b' is LRU
    c.set("c", 3); // should evict 'b'
    expect(c.has("a")).toBe(true);
    expect(c.has("b")).toBe(false);
    expect(c.has("c")).toBe(true);
  });

  it("peek does not change recency", () => {
    const c = new TTLCache<string, number>({ max: 2 });
    c.set("a", 1);
    c.set("b", 2);
    c.peek("a"); // does NOT bump 'a'
    c.set("c", 3); // evicts the actual LRU, which is still 'a'
    expect(c.has("a")).toBe(false);
    expect(c.has("b")).toBe(true);
  });

  it("delete and clear work", () => {
    const c = new TTLCache<string, number>();
    c.set("a", 1).set("b", 2);
    expect(c.delete("a")).toBe(true);
    expect(c.delete("a")).toBe(false);
    c.clear();
    expect(c.size).toBe(0);
  });

  it("size and keys exclude expired entries", () => {
    const ref = { t: 0 };
    const c = new TTLCache<string, number>({ ttl: 100, clock: clockOf(ref) });
    c.set("a", 1);
    c.set("b", 2, 1000);
    ref.t = 150;
    expect(c.size).toBe(1);
    expect(c.keys()).toEqual(["b"]);
  });
});
