import { describe, expect, it } from "vitest";
import { createRng, sheep, sampleFounder, mate, discretePhenotype } from "@blue-sheep/genetics";
import type { Individual } from "./constraints.js";
import { informationGain, lambOutcomes, posteriorDiscrete } from "./posterior.js";

const { map } = sheep.sheep;
const ind = (id: string, dam: string | null, sire: string | null, ph: Record<string, string>, tested = {}): Individual =>
  ({ id, dam, sire, phenotype: ph, tested });
const opts = { samples: 1500, burnIn: 100, seed: 7 };

describe("posterior (horns, p freq 0.5)", () => {
  it("lone polled founder: P(carrier) = 2/3", () => {
    const post = posteriorDiscrete(map, sheep.horns, [ind("a", null, null, { horns: "polled" })], opts);
    expect(post.marginals["a"]!["P"]!["p/P"]).toBeCloseTo(2 / 3, 1);
  });

  it("polled × horned with 3 polled lambs: P(carrier) = 0.2", () => {
    // prior odds carrier:homozygous = 2:1; likelihood (1/2)^3 : 1 -> 2/8 : 1 -> 0.2
    const post = posteriorDiscrete(map, sheep.horns, [
      ind("d", null, null, { horns: "polled" }), ind("s", null, null, { horns: "horned" }),
      ind("k1", "d", "s", { horns: "polled" }), ind("k2", "d", "s", { horns: "polled" }), ind("k3", "d", "s", { horns: "polled" }),
    ], opts);
    expect(post.marginals["d"]!["P"]!["p/P"]).toBeCloseTo(0.2, 1);
  });

  it("horned lamb from polled parents makes both carriers with certainty", () => {
    const post = posteriorDiscrete(map, sheep.horns, [
      ind("d", null, null, { horns: "polled" }), ind("s", null, null, { horns: "polled" }), ind("k", "d", "s", { horns: "horned" }),
    ], opts);
    expect(post.marginals["d"]!["P"]!["p/P"]).toBeCloseTo(1, 6);
    expect(post.marginals["s"]!["P"]!["p/P"]).toBeCloseTo(1, 6);
  });

  it("lamb forecast: known carriers × carrier gives 1/4 horned", () => {
    const post = posteriorDiscrete(map, sheep.horns, [
      ind("d", null, null, { horns: "polled" }), ind("s", null, null, { horns: "polled" }), ind("k", "d", "s", { horns: "horned" }),
    ], opts);
    const out = lambOutcomes(post, "d", "s");
    expect(out["horned"]).toBeCloseTo(0.25, 5);
  });

  it("information gain is higher for a test cross than for a cross with a known sire", () => {
    const inds = [ind("d", null, null, { horns: "polled" }), ind("h", null, null, { horns: "horned" }), ind("pp", null, null, { horns: "polled" }, { P: "P/P" })];
    const post = posteriorDiscrete(map, sheep.horns, inds, opts);
    expect(informationGain(post, "d", "h")).toBeGreaterThan(informationGain(post, "d", "pp"));
    expect(informationGain(post, "pp", "h")).toBeCloseTo(0, 5);
  });
});

describe("posterior (colour, 3 loci with epistasis)", () => {
  it("forecast for a random flock sums to 1 and matches simulation", () => {
    const rng = createRng(3);
    const d = sampleFounder(map, rng), s = sampleFounder(map, rng);
    const inds = [
      ind("d", null, null, { colour: discretePhenotype(d, map, sheep.colour) }),
      ind("s", null, null, { colour: discretePhenotype(s, map, sheep.colour) }),
    ];
    const post = posteriorDiscrete(map, sheep.colour, inds, opts);
    const out = lambOutcomes(post, "d", "s");
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
    // Forecast is knowledge-limited, but the true genotypes' lamb distribution must be inside its support.
    const sim: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) { const c = discretePhenotype(mate(d, s, map, rng), map, sheep.colour); sim[c] = (sim[c] ?? 0) + 1 / 2000; }
    for (const [c, p] of Object.entries(sim)) if (p > 0.02) expect(out[c] ?? 0).toBeGreaterThan(0);
  });
});
