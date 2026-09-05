import { describe, expect, it } from "vitest";
import { createRng, sheep, sampleFounder, mate, quantitativePhenotype, expectedVariance } from "@blue-sheep/genetics";
import { estimateH2, forecastQuantitative, type Record_ } from "./forecast.js";

const { map } = sheep.sheep;

describe("h2 estimation from farm records", () => {
  it("falls back to the prior with few records", () => {
    const e = estimateH2([{ id: "a", dam: null, sire: null, value: 4 }]);
    expect(e.h2).toBeCloseTo(0.3);
    expect(e.pairs).toBe(0);
  });

  it("recovers h2 from many parent–offspring records and tightens se", () => {
    const rng = createRng(5);
    const trait = sheep.fineness;
    const records: Record_[] = [];
    for (let i = 0; i < 1500; i++) {
      const d = sampleFounder(map, rng), s = sampleFounder(map, rng);
      records.push({ id: `d${i}`, dam: null, sire: null, value: quantitativePhenotype(d, map, trait, rng) });
      records.push({ id: `s${i}`, dam: null, sire: null, value: quantitativePhenotype(s, map, trait, rng) });
      records.push({ id: `k${i}`, dam: `d${i}`, sire: `s${i}`, value: quantitativePhenotype(mate(d, s, map, rng), map, trait, rng) });
    }
    const e = estimateH2(records);
    const truth = expectedVariance(map, trait).h2;
    expect(Math.abs(e.h2 - truth)).toBeLessThan(0.08);
    expect(e.se).toBeLessThan(0.1);
  });

  it("forecast mean regresses toward the flock mean by h2", () => {
    const f = forecastQuantitative(sheep.fineness, 20, 20, [], 26, 2.5);
    expect(f.mean).toBeCloseTo(26 + 0.3 * (20 - 26));
    expect(f.sd).toBeGreaterThan(2);
  });
});
