import { describe, expect, it } from "vitest";
import { buildMap, genotypeAt, type Genome } from "./genome.js";
import { gamete, mate } from "./meiosis.js";
import { createRng } from "./rng.js";

const map = buildMap([
  { lengthCM: 100, loci: [
    { id: "A", cM: 10, alleles: ["a", "A"], freq: [0.5, 0.5] },
    { id: "B", cM: 10, alleles: ["b", "B"], freq: [0.5, 0.5] },
    { id: "C", cM: 60, alleles: ["c", "C"], freq: [0.5, 0.5] },
  ]},
  { lengthCM: 100, loci: [{ id: "D", cM: 50, alleles: ["d", "D"], freq: [0.5, 0.5] }] },
]);

/** Double heterozygote in coupling: haplotype 0 all "0", haplotype 1 all "1". */
const coupling: Genome = {
  chromosomes: [
    [Uint8Array.from([0, 0, 0]), Uint8Array.from([1, 1, 1])],
    [Uint8Array.from([0]), Uint8Array.from([1])],
  ],
};

function recombFraction(i: number, j: number, chrI: number, chrJ: number, n = 20000): number {
  const rng = createRng(3);
  let rec = 0;
  for (let k = 0; k < n; k++) {
    const g = gamete(coupling, map, rng);
    if (g[chrI]?.[i] !== g[chrJ]?.[j]) rec++;
  }
  return rec / n;
}

const haldane = (cm: number) => 0.5 * (1 - Math.exp(-2 * (cm / 100)));

describe("meiosis", () => {
  it("fully linked loci never recombine", () => {
    expect(recombFraction(0, 1, 0, 0)).toBe(0);
  });
  it("loci 50 cM apart recombine at Haldane's rate (~0.316)", () => {
    expect(Math.abs(recombFraction(0, 2, 0, 0) - haldane(50))).toBeLessThan(0.015);
  });
  it("loci on different chromosomes assort independently (~0.5)", () => {
    expect(Math.abs(recombFraction(0, 0, 0, 1) - 0.5)).toBeLessThan(0.015);
  });
  it("mate() puts dam gamete first", () => {
    const dam: Genome = { chromosomes: [[Uint8Array.from([0,0,0]), Uint8Array.from([0,0,0])], [Uint8Array.from([0]), Uint8Array.from([0])]] };
    const sire: Genome = { chromosomes: [[Uint8Array.from([1,1,1]), Uint8Array.from([1,1,1])], [Uint8Array.from([1]), Uint8Array.from([1])]] };
    const kid = mate(dam, sire, map, createRng(1));
    expect(genotypeAt(kid, map, "A")).toEqual([0, 1]);
    expect(genotypeAt(kid, map, "D")).toEqual([0, 1]);
  });
});
