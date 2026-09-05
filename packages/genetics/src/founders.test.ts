import { describe, expect, it } from "vitest";
import { sampleFounder } from "./founders.js";
import { buildMap, genotypeAt } from "./genome.js";
import { createRng } from "./rng.js";

describe("founders", () => {
  it("allele frequency matches spec", () => {
    const map = buildMap([{ lengthCM: 50, loci: [{ id: "X", cM: 1, alleles: ["x", "X", "X2"], freq: [0.2, 0.5, 0.3] }] }]);
    const rng = createRng(8);
    const counts = [0, 0, 0];
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const [a, b] = genotypeAt(sampleFounder(map, rng), map, "X");
      counts[a]!++;
      counts[b]!++;
    }
    expect(Math.abs(counts[0]! / (2 * n) - 0.2)).toBeLessThan(0.01);
    expect(Math.abs(counts[2]! / (2 * n) - 0.3)).toBeLessThan(0.01);
  });
});
