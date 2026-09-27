import { describe, expect, it } from "vitest";
import { sampleFounder } from "./founders.js";
import { genotypeAt, getLocus, type Genome } from "./genome.js";
import { gamete, mate, mateDetailed } from "./meiosis.js";
import { createRng } from "./rng.js";
import {
  CHANNELS, depth, DISCRETE_TRAITS, FANTASY_LOCI, lustre, paua, PIGMENT_LOCI, pigmentDoses, pohutukawa, red, sheep3, SPORTS, steel, white,
} from "./sheep3.js";
import { observePhenotypes } from "./species.js";
import { discretePhenotype, expectedVariance, isMasked } from "./traits.js";

const { map } = sheep3;

/** A genome with every locus at allele 0, then the given loci set to [maternal, paternal]. */
function genomeWith(set: Record<string, [number, number]>): Genome {
  const g: Genome = { chromosomes: map.chromosomes.map((c) => [new Uint8Array(c.loci.length), new Uint8Array(c.loci.length)]) };
  for (const [id, [a, b]] of Object.entries(set)) {
    const l = getLocus(map, id);
    g.chromosomes[l.chromosome]![0][l.index] = a;
    g.chromosomes[l.chromosome]![1][l.index] = b;
  }
  return g;
}

/** Pearson χ² statistic. */
function chi2(observed: number[], expectedP: number[]): number {
  const n = observed.reduce((a, b) => a + b, 0);
  return observed.reduce((s, o, i) => { const e = n * expectedP[i]!; return s + (o - e) ** 2 / e; }, 0);
}

describe("sheep3 species", () => {
  it("has the 15 discrete traits within the inference limits (≤ 27 joints each, ≤ 18 traits)", () => {
    expect(DISCRETE_TRAITS.map((t) => t.id)).toEqual([
      "white", "red", "yellow", "blue", "dilute", "pattern", "horns", "coat", "hair",
      "steel", "cloud", "glow", "paua", "pohutukawa", "southerly",
    ]);
    expect(DISCRETE_TRAITS.length).toBeLessThanOrEqual(18);
    for (const t of DISCRETE_TRAITS) {
      const joints = t.loci.reduce((n, id) => { const k = getLocus(map, id).alleles.length; return n * (k * (k + 1)) / 2; }, 1);
      expect(joints, t.id).toBeLessThanOrEqual(27);
    }
    expect(map.chromosomes).toHaveLength(6);
  });

  it("keeps the loci of one trait unlinked, and pigment channels apart from W", () => {
    for (const c of CHANNELS) {
      const [a, b] = PIGMENT_LOCI[c].map((id) => getLocus(map, id));
      expect(a!.chromosome).not.toBe(b!.chromosome);
    }
    const pig = CHANNELS.flatMap((c) => PIGMENT_LOCI[c].map((id) => getLocus(map, id)));
    expect(new Set(pig.map((l) => l.chromosome)).size).toBe(6);
    const W = getLocus(map, "W");
    for (const l of pig) if (l.chromosome === W.chromosome) expect(Math.abs(l.cM - W.cM)).toBeGreaterThanOrEqual(40);
  });

  it("founder frequencies: about 20 % coloured and no pōhutukawa", () => {
    const rng = createRng(4);
    let coloured = 0, po = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const g = sampleFounder(map, rng);
      if (discretePhenotype(g, map, white) === "coloured") coloured++;
      if (discretePhenotype(g, map, pohutukawa) !== "plain") po++;
    }
    expect(coloured / n).toBeCloseTo(0.2025, 1);
    expect(po).toBe(0);
  });

  it("colour strength has h² ≈ 0.65", () => {
    expect(expectedVariance(map, depth).h2).toBeGreaterThan(0.6);
    expect(expectedVariance(map, depth).h2).toBeLessThan(0.7);
  });

  it("pigment doses count + alleles over both loci", () => {
    const g = genomeWith({ R1: [1, 1], R2: [0, 1], Y2: [1, 0], U1: [0, 0] });
    expect(pigmentDoses(g)).toEqual({ red: 3, yellow: 1, blue: 0 });
    expect(discretePhenotype(g, map, red)).toBe("3");
  });
});

describe("dose inheritance (χ², df = 4, 99.9 % critical value 18.47)", () => {
  const N = 8000;
  const doseCounts = (dam: Genome, sire: Genome, seed: number) => {
    const rng = createRng(seed);
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) counts[Number(discretePhenotype(mate(dam, sire, map, rng), map, red))]!++;
    return counts;
  };

  it("double heterozygote × double heterozygote gives 1:4:6:4:1", () => {
    const het = genomeWith({ R1: [0, 1], R2: [0, 1] });
    expect(chi2(doseCounts(het, het, 1), [1, 4, 6, 4, 1].map((x) => x / 16))).toBeLessThan(18.47);
  });

  it("2 + 0 (one locus homozygous) passes exactly one dose; 1 + 1 passes 0–2", () => {
    const homo = genomeWith({ R1: [1, 1] });
    const none = genomeWith({});
    const c = doseCounts(homo, none, 2);
    expect(c).toEqual([0, N, 0, 0, 0]);
    const het = genomeWith({ R1: [0, 1], R2: [0, 1] });
    const d = doseCounts(het, none, 3);
    expect(chi2(d.slice(0, 3), [0.25, 0.5, 0.25])).toBeLessThan(13.8); // df 2
  });
});

describe("masking", () => {
  it("white hides pigment, dilution and spotting from the observed phenotypes", () => {
    const rng = createRng(1);
    const g = genomeWith({ W: [0, 1], R1: [1, 1], Dl: [0, 0], S: [0, 0] });
    const ph = observePhenotypes(g, sheep3, rng);
    expect(ph["white"]).toBe("white");
    for (const k of ["red", "yellow", "blue", "dilute", "pattern"]) expect(ph[k], k).toBeUndefined();
    expect(ph["horns"]).toBeDefined();
    const c = observePhenotypes(genomeWith({ R1: [1, 1] }), sheep3, rng);
    expect(c).toMatchObject({ white: "coloured", red: "2", yellow: "0", blue: "0", dilute: "pale", pattern: "spotted" });
  });

  it("pāua shows only with lustre ≥ 5", () => {
    expect(isMasked(paua, { lustre: 4.9 })).toBe(true);
    expect(isMasked(paua, { lustre: 5 })).toBe(false);
    expect(isMasked(paua, {})).toBe(false);
    expect(isMasked(red, { white: "white" })).toBe(true);
    expect(isMasked(red, { white: "coloured" })).toBe(false);
    const rng = createRng(2);
    const lowLustre = genomeWith({ PA: [1, 1] }); // all LU alleles "-": lustre ≈ 4 − 3.6
    expect(observePhenotypes(lowLustre, sheep3, rng)["paua"]).toBeUndefined();
    const shiny = genomeWith({ PA: [1, 1], LU1: [1, 1], LU2: [1, 1], LU3: [1, 1] });
    const ph = observePhenotypes(shiny, sheep3, rng);
    expect(ph["lustre"] as number).toBeGreaterThan(5);
    expect(ph["paua"]).toBe("paua");
    expect(lustre.max).toBe(10);
  });

  it("fantasy wools: recessive except pōhutukawa", () => {
    expect(discretePhenotype(genomeWith({ ST: [0, 1] }), map, steel)).toBe("plain");
    expect(discretePhenotype(genomeWith({ ST: [1, 1] }), map, steel)).toBe("steel");
    expect(discretePhenotype(genomeWith({ PO: [0, 1] }), map, pohutukawa)).toBe("pohutukawa");
  });
});

describe("mutation (sports)", () => {
  it("mate() without options consumes the rng exactly as two gametes (old saves replay)", () => {
    const rng0 = createRng(9);
    const d = sampleFounder(map, rng0), s = sampleFounder(map, rng0);
    const a = createRng(77), b = createRng(77);
    const kid = mate(d, s, map, a);
    const gd = gamete(d, map, b), gs = gamete(s, map, b);
    expect(kid.chromosomes.map(([x, y]) => [Array.from(x), Array.from(y)])).toEqual(gd.map((h, i) => [Array.from(h), Array.from(gs[i]!)]));
    expect(a.state()).toBe(b.state());
  });

  it("hits fantasy loci only, at about μ = 0.001 per locus per lamb, deterministically", () => {
    const plain = genomeWith({});
    const run = (seed: number) => {
      const rng = createRng(seed);
      const hits: Record<string, number> = {};
      let changedOther = false;
      const n = 60000;
      for (let i = 0; i < n; i++) {
        const { genome, sports } = mateDetailed(plain, plain, map, rng, SPORTS);
        for (const sp of sports) {
          hits[sp.locus] = (hits[sp.locus] ?? 0) + 1;
          const [x, y] = genotypeAt(genome, map, sp.locus);
          expect(x + y).toBe(1); // one mutant gamete
        }
        if (!sports.length) {
          for (const c of genome.chromosomes) if (c[0].some((v) => v !== 0) || c[1].some((v) => v !== 0)) changedOther = true;
        }
      }
      return { hits, changedOther, n };
    };
    const r = run(5);
    expect(r.changedOther).toBe(false);
    expect(Object.keys(r.hits).every((l) => (FANTASY_LOCI as readonly string[]).includes(l))).toBe(true);
    const total = Object.values(r.hits).reduce((a, b) => a + b, 0);
    const expected = r.n * FANTASY_LOCI.length * 0.001; // 360
    expect(Math.abs(total - expected)).toBeLessThan(4 * Math.sqrt(expected));
    expect(run(5).hits).toEqual(r.hits);
  });
});
