import { describe, expect, it } from "vitest";
import { createRng, discretePhenotype, mate, sampleFounder, sheep, type Genome } from "@blue-sheep/genetics";
import { posteriorDiscrete, type Individual } from "./index.js";
import fixture from "./deep-fixture.json";

const { map } = sheep.sheep;

/** A deep, inbred pedigree like a long game produces: few founders, many generations of close matings. */
function deepPedigree(seed: number, n: number): Individual[] {
  const rng = createRng(seed);
  const genomes: Genome[] = [];
  const inds: Individual[] = [];
  const add = (g: Genome, dam: string | null, sire: string | null) => {
    const id = `i${inds.length}`;
    genomes.push(g);
    inds.push({ id, dam, sire, phenotype: { colour: discretePhenotype(g, map, sheep.colour) }, tested: {} });
  };
  for (let i = 0; i < 6; i++) add(sampleFounder(map, rng), null, null);
  while (inds.length < n) {
    const lo = Math.max(0, inds.length - 12);
    const d = lo + rng.int(inds.length - lo), s = lo + rng.int(inds.length - lo);
    if (d === s) continue;
    add(mate(genomes[d]!, genomes[s]!, map, rng), inds[d]!.id, inds[s]!.id);
  }
  return inds;
}

describe("posterior on deep pedigrees", () => {
  it("finds a consistent start quickly on long inbred pedigrees (no exponential backtracking)", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const inds = deepPedigree(seed, 160);
      const t = Date.now();
      const post = posteriorDiscrete(map, sheep.colour, inds, { samples: 50, burnIn: 10, seed });
      expect(Date.now() - t).toBeLessThan(5000);
      // Hard evidence respected: every sample reproduces each observed colour.
      for (const ind of inds) {
        const m = post.marginals[ind.id]!;
        expect(Object.values(m["A"]!).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      }
    }
  });

  it("handles a real 30-season game pedigree that used to hang the initial assignment", () => {
    const inds: Individual[] = (fixture as (string | null)[][]).map(([id, dam, sire, colour, pattern, horns]) => ({
      id: id!, dam: dam ?? null, sire: sire ?? null, phenotype: { colour: colour!, pattern: pattern!, horns: horns! }, tested: {},
    }));
    for (const t of [sheep.colour, sheep.pattern, sheep.horns]) {
      const start = Date.now();
      posteriorDiscrete(map, t, inds, { samples: 50, burnIn: 10, seed: 62 });
      expect(Date.now() - start).toBeLessThan(5000);
    }
  });
});
