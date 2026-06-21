import { describe, expect, it, vi } from "vitest";
import { memoize } from "../src/memoize.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("memoize", () => {
  it("caches results within the TTL", async () => {
    const fn = vi.fn(async (x: number) => x * 2);
    const m = memoize(fn, { ttl: 10_000 });
    expect(await m(2)).toBe(4);
    expect(await m(2)).toBe(4);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("computes separately for different keys", async () => {
    const fn = vi.fn(async (x: number) => x * 2);
    const m = memoize(fn, { ttl: 10_000 });
    expect(await m(2)).toBe(4);
    expect(await m(3)).toBe(6);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("recomputes after the TTL expires", async () => {
    const ref = { t: 0 };
    const fn = vi.fn(async (x: number) => x);
    const m = memoize(fn, { ttl: 100, clock: () => ref.t });
    await m(1);
    ref.t = 100;
    await m(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("single-flights concurrent calls for the same key", async () => {
    let resolve!: (v: number) => void;
    const fn = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const m = memoize(fn, { ttl: 10_000 });
    const p1 = m();
    const p2 = m();
    resolve(7);
    expect(await p1).toBe(7);
    expect(await p2).toBe(7);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("serves stale and refreshes in the background (SWR)", async () => {
    const ref = { t: 0 };
    let n = 0;
    const fn = vi.fn(async () => ++n);
    const m = memoize(fn, { ttl: 100, staleWhileRevalidate: 1000, clock: () => ref.t });

    expect(await m()).toBe(1); // compute #1
    ref.t = 150; // stale, within SWR window
    expect(await m()).toBe(1); // serves stale immediately
    await tick(); // background refresh completes (compute #2)
    expect(fn).toHaveBeenCalledTimes(2);
    ref.t = 160;
    expect(await m()).toBe(2); // now fresh value
  });

  it("invalidate forces a recompute", async () => {
    const fn = vi.fn(async (x: number) => x);
    const m = memoize(fn, { ttl: 10_000 });
    await m(1);
    m.invalidate(1);
    await m(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("clear empties the cache", async () => {
    const fn = vi.fn(async (x: number) => x);
    const m = memoize(fn, { ttl: 10_000 });
    await m(1);
    m.clear();
    await m(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("supports a custom key function", async () => {
    const fn = vi.fn(async (o: { id: number }) => o.id);
    const m = memoize(fn, { ttl: 10_000, key: (o) => String(o.id) });
    await m({ id: 1 });
    await m({ id: 1 }); // different object, same key
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("propagates rejections and does not cache them", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n === 1) throw new Error("boom");
      return "ok";
    });
    const m = memoize(fn, { ttl: 10_000 });
    await expect(m()).rejects.toThrow("boom");
    expect(await m()).toBe("ok"); // retried, not a cached failure
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
