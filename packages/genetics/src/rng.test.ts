import { describe, expect, it } from "vitest";
import { createRng } from "./rng.js";

describe("rng", () => {
  it("is deterministic for a seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("normal() has mean ~0 and sd ~1", () => {
    const r = createRng(1);
    const n = 20000;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const x = r.normal();
      sum += x;
      sq += x * x;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sq / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });

  it("poisson(2) has mean ~2", () => {
    const r = createRng(7);
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += r.poisson(2);
    expect(Math.abs(sum / 20000 - 2)).toBeLessThan(0.05);
  });
});
