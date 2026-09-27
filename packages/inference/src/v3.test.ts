import { describe, expect, it } from "vitest";
import { breedFreqs, createRng, mate, observePhenotypes, sampleBreedFounder, sheep3 as S3, type Genome } from "@blue-sheep/genetics";
import { discreteSupport, inferDiscrete, type Individual } from "./constraints.js";
import { jointPrior, jointTransmission, lambOutcomes, posteriorDiscrete } from "./posterior.js";

const { map } = S3.sheep3;
const ind = (id: string, dam: string | null, sire: string | null, ph: Record<string, string | number>, extra: Partial<Individual> = {}): Individual =>
  ({ id, dam, sire, phenotype: ph, tested: {}, ...extra });

/** Exact posterior marginals by brute-force enumeration over every joint genotype of every sheep. */
function exactMarginals(trait: typeof S3.red, inds: Individual[]): Record<string, Record<string, Record<string, number>>> {
  const support = discreteSupport(map, trait, inds);
  const { all, loci } = support;
  const pos = new Map(inds.map((x, i) => [x.id, i]));
  const cands = inds.map((x) => support.cand.get(x.id)!.map((j) => all.indexOf(j)));
  const priors = inds.map((x) => all.map((j) => jointPrior(j, support, x.priorFreq)));
  const acc = inds.map(() => new Map<number, number>());
  let Z = 0;
  const assign: number[] = Array(inds.length).fill(0);
  const rec = (k: number, w: number): void => {
    if (w === 0) return;
    if (k === inds.length) {
      Z += w;
      assign.forEach((a, i) => acc[i]!.set(a, (acc[i]!.get(a) ?? 0) + w));
      return;
    }
    const x = inds[k]!;
    for (const c of cands[k]!) {
      assign[k] = c;
      const d = x.dam ? pos.get(x.dam) : undefined, s = x.sire ? pos.get(x.sire) : undefined;
      const f = d !== undefined && s !== undefined ? jointTransmission(all[c]!, all[assign[d]!]!, all[assign[s]!]!) : priors[k]![c]!;
      rec(k + 1, w * f);
    }
  };
  rec(0, 1);
  const out: Record<string, Record<string, Record<string, number>>> = {};
  inds.forEach((x, i) => {
    const per: Record<string, Record<string, number>> = {};
    loci.forEach((l, li) => {
      const m: Record<string, number> = {};
      for (const [j, w] of acc[i]!) { const g = support.gstr(l, all[j]![li]!); m[g] = (m[g] ?? 0) + w / Z; }
      per[l.id] = m;
    });
    out[x.id] = per;
  });
  return out;
}

// Parents before children (the enumeration needs that order).
const family = (whiteRed?: string): Individual[] => [
  ind("A", null, null, { white: "white", ...(whiteRed ? { red: whiteRed } : {}) }),
  ind("B", null, null, { white: "coloured", red: "2" }),
  ind("C", null, null, { white: "white", ...(whiteRed ? { red: whiteRed } : {}) }),
  ind("D", "A", "B", { white: "coloured", red: "3" }),
  ind("E", "A", "B", { white: "white" }),
  ind("F", "D", "C", { white: "coloured", red: "1" }),
];

describe("masked pigment traits", () => {
  it("a white sheep's pigment is unobserved: the posterior equals exact enumeration on a 6-sheep pedigree", () => {
    const inds = family();
    const exact = exactMarginals(S3.red, inds);
    const post = posteriorDiscrete(map, S3.red, inds, { samples: 8000, burnIn: 200, seed: 3 });
    for (const x of inds) for (const l of ["R1", "R2"]) {
      for (const [g, p] of Object.entries(exact[x.id]![l]!)) {
        expect(Math.abs((post.marginals[x.id]![l]![g] ?? 0) - p), `${x.id} ${l} ${g}`).toBeLessThan(0.03);
      }
    }
    // D (3 doses) is R1 +/+ R2 -/+ or its mirror image, 50:50; the locus-swap move must find both.
    expect(exact["D"]!["R1"]!["+/+"]).toBeCloseTo(0.5, 9);
    expect(post.marginals["D"]!["R1"]!["+/+"]!).toBeGreaterThan(0.45);
    // A (white) must carry at least one + (D has 3 doses, B can give at most 2): hidden colour.
    const aCand = discreteSupport(map, S3.red, inds).cand.get("A")!;
    expect(aCand.every((j) => j[0]![0] + j[0]![1] + j[1]![0] + j[1]![1] >= 1)).toBe(true);
  });

  it("a red phenotype recorded on a white sheep is ignored (masking is honoured)", () => {
    const clean = posteriorDiscrete(map, S3.red, family(), { samples: 400, burnIn: 60, seed: 5 });
    const noisy = posteriorDiscrete(map, S3.red, family("0"), { samples: 400, burnIn: 60, seed: 5 });
    expect(noisy.marginals).toEqual(clean.marginals);
    // Without masking, "0" on A would be impossible (D needs a + from A).
    const { maskedBy: _drop, ...unmasked } = S3.red;
    expect(() => posteriorDiscrete(map, unmasked, family("0"), { samples: 10, burnIn: 1 })).toThrow();
  });

  it("pāua is masked by low lustre", () => {
    const r = inferDiscrete(map, S3.paua, [
      ind("a", null, null, { lustre: 3, paua: "paua" }),
      ind("b", null, null, { lustre: 7, paua: "paua" }),
    ]);
    expect(r["a"]!["PA"]!.length).toBe(3);
    expect(r["b"]!["PA"]).toEqual(["pa/pa"]);
  });

  it("lamb forecast for a coloured × white pair sums to 1 per channel", () => {
    const post = posteriorDiscrete(map, S3.red, family(), { samples: 400, burnIn: 60, seed: 5 });
    const out = lambOutcomes(post, "F", "E");
    expect(Object.values(out).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(Object.keys(out).every((k) => ["0", "1", "2", "3", "4"].includes(k))).toBe(true);
  });
});

describe("breed-aware founder priors", () => {
  it("a Romney founder's steel-carrier prior uses Romney frequencies, others the map's (Farm: none)", () => {
    const romney = breedFreqs("romney");
    const inds = [
      ind("r", null, null, { steel: "plain" }, { priorFreq: romney }),
      ind("f", null, null, { steel: "plain" }),
    ];
    const post = posteriorDiscrete(map, S3.steel, inds, { samples: 20000, burnIn: 100, seed: 2 });
    const q = romney["ST"]![1]!;
    expect(post.marginals["r"]!["ST"]!["ST/st"] ?? 0).toBeCloseTo((2 * q * (1 - q)) / (1 - q * q), 2);
    expect(post.marginals["f"]!["ST"]!["ST/st"] ?? 0).toBeLessThan(0.002);
  });

  it("a genotype the prior calls impossible still has a finite weight (a sport)", () => {
    const post = posteriorDiscrete(map, S3.pohutukawa, [ind("x", null, null, { pohutukawa: "pohutukawa" })], { samples: 200, burnIn: 20 });
    expect(post.marginals["x"]!["PO"]!["po/PO"]).toBeCloseTo(1, 6);
  });
});

/** A 200-sheep farm pedigree: a few founders, overlapping generations, 30 % of records missing. */
function farmPedigree(seed: number, n: number): Individual[] {
  const rng = createRng(seed);
  const genomes: Genome[] = [];
  const inds: Individual[] = [];
  const add = (g: Genome, dam: string | null, sire: string | null) => {
    const ph = observePhenotypes(g, S3.sheep3, rng);
    if (rng.chance(0.3)) for (const k of Object.keys(ph)) if (typeof ph[k] === "string") delete ph[k];
    genomes.push(g);
    inds.push({ id: `i${inds.length}`, dam, sire, phenotype: ph, tested: {} });
  };
  for (let i = 0; i < 10; i++) add(sampleBreedFounder("farm", rng), null, null);
  while (inds.length < n) {
    const lo = Math.max(0, inds.length - 30);
    const d = lo + rng.int(inds.length - lo), s = lo + rng.int(inds.length - lo);
    if (d === s) continue;
    add(mate(genomes[d]!, genomes[s]!, map, rng, S3.SPORTS), inds[d]!.id, inds[s]!.id);
  }
  return inds;
}

describe("performance", () => {
  it("all 15 v3 traits on 200 sheep in < 600 ms (game settings: 300 samples, 50 burn-in)", () => {
    const inds = farmPedigree(5, 200);
    const run = () => {
      const t = performance.now();
      for (const trait of S3.DISCRETE_TRAITS) posteriorDiscrete(map, trait, inds, { samples: 300, burnIn: 50, seed: 1 });
      return performance.now() - t;
    };
    run(); // warm up the JIT
    const best = Math.min(run(), run());
    expect(best).toBeLessThan(600);
  });
});
