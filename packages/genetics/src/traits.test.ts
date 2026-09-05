import { describe, expect, it } from "vitest";
import { sampleFounder } from "./founders.js";
import { buildMap, type Genome } from "./genome.js";
import { mate } from "./meiosis.js";
import { createRng } from "./rng.js";
import {
  discretePhenotype, expectedVariance, geneticValue, quantitativePhenotype,
  type DiscreteTrait, type QuantitativeTrait,
} from "./traits.js";

const map = buildMap([
  { lengthCM: 100, loci: [
    { id: "H", cM: 1, alleles: ["h", "H"], freq: [0.5, 0.5] },
    ...Array.from({ length: 10 }, (_, i) => ({ id: `Q${i}`, cM: 5 + i * 9, alleles: ["-", "+"], freq: [0.5, 0.5] })),
  ]},
]);

const horns: DiscreteTrait = {
  kind: "discrete", id: "horns", label: "Horns", loci: ["H"],
  resolve: (g) => (g["H"]?.includes("H") ? "polled" : "horned"),
};

const weight: QuantitativeTrait = {
  kind: "quantitative", id: "w", label: "Weight", unit: "kg", mean: 4,
  qtls: Array.from({ length: 10 }, (_, i) => ({ locus: `Q${i}`, a: 0.2, d: 0 })),
  envSd: 0.4, inbreedingDepression: 1,
};

describe("discrete traits", () => {
  it("Hh × Hh gives ~3:1 polled:horned", () => {
    const rng = createRng(11);
    const het: Genome = { chromosomes: [[Uint8Array.from([0, ...Array(10).fill(0)]), Uint8Array.from([1, ...Array(10).fill(0)])]] };
    let polled = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) if (discretePhenotype(mate(het, het, map, rng), map, horns) === "polled") polled++;
    expect(Math.abs(polled / n - 0.75)).toBeLessThan(0.015);
  });
});

describe("quantitative traits", () => {
  it("genetic value sums additive effects", () => {
    const allPlus: Genome = { chromosomes: [[Uint8Array.from(Array(11).fill(1)), Uint8Array.from(Array(11).fill(1))]] };
    const allMinus: Genome = { chromosomes: [[Uint8Array.from(Array(11).fill(0)), Uint8Array.from(Array(11).fill(0))]] };
    expect(geneticValue(allPlus, map, weight)).toBeCloseTo(6);
    expect(geneticValue(allMinus, map, weight)).toBeCloseTo(2);
  });

  it("inbreeding depression lowers phenotype", () => {
    const g = sampleFounder(map, createRng(2));
    const a = quantitativePhenotype(g, map, weight, createRng(5), 0);
    const b = quantitativePhenotype(g, map, weight, createRng(5), 0.5);
    expect(a - b).toBeCloseTo(0.5);
  });

  it("expected h2 is recovered by midparent–offspring regression", () => {
    const { h2 } = expectedVariance(map, weight);
    // Va = 10 * 2*0.25*0.04 = 0.2, Ve = 0.16 -> h2 = 0.556
    expect(h2).toBeCloseTo(0.2 / 0.36, 3);
    const rng = createRng(99);
    const n = 6000;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      const d = sampleFounder(map, rng);
      const s = sampleFounder(map, rng);
      const mid = (quantitativePhenotype(d, map, weight, rng) + quantitativePhenotype(s, map, weight, rng)) / 2;
      const kid = quantitativePhenotype(mate(d, s, map, rng), map, weight, rng);
      xs.push(mid);
      ys.push(kid);
    }
    const mx = xs.reduce((a, b) => a + b) / n;
    const my = ys.reduce((a, b) => a + b) / n;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += ((xs[i] ?? 0) - mx) * ((ys[i] ?? 0) - my);
      sxx += ((xs[i] ?? 0) - mx) ** 2;
    }
    const slope = sxy / sxx;
    expect(Math.abs(slope - h2)).toBeLessThan(0.06);
  });
});
