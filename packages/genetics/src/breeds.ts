/**
 * Founder breeds (docs/DESIGN-v3.md §3.2). A breed is a set of founder allele frequencies over the
 * `sheep3` map, not a fixed offset, so crossbreds land in between and selection can move a line.
 *
 * Fleece QTL frequencies are solved from each breed's target means (`calibrateBreed`): for each
 * trait one QTL group gets a common "+" frequency, found by bisection on the expected genetic value.
 */
import type { FreqOverride } from "./founders.js";
import { sampleFounder } from "./founders.js";
import type { Genome } from "./genome.js";
import { getLocus } from "./genome.js";
import type { Rng } from "./rng.js";
import {
  crimp, FANTASY_LOCI, FARM_PIGMENT_FREQ, FARM_W_FREQ, fineness, fleeceWeight, lustre, PIGMENT_LOCI,
  QTL_GROUPS, sheep3, size, staple, type FantasyLocus,
} from "./sheep3.js";
import type { QuantitativeTrait } from "./traits.js";
import type { WoolType } from "./wooltype.js";

export type BreedId = "farm" | "merino" | "corriedale" | "perendale" | "romney" | "drysdale" | "icelandic";

export interface BreedTargets {
  /** µm */
  fineness: number;
  /** mm */
  staple: number;
  /** crimps per cm */
  crimp: number;
  /** 0–10 */
  lustre: number;
  /** kg */
  fleeceWeight: number;
  /** body kg */
  size: number;
}

export interface BreedSpec {
  id: BreedId;
  name: string;
  /** Target founder means (the calibration hits these on expectation). */
  targets: BreedTargets;
  /** Frequency of the coloured allele `w` (so about w² of founders show colour). */
  colouredFreq: number;
  /** Multiplier on the Farm pigment "+" frequencies (red 0.20, yellow 0.25, blue 0.10). */
  pigmentScale: number;
  /** Frequency of the horned allele `p`. */
  hornedFreq: number;
  /** Frequency of the dominant major genes: double coat and hairy fibre. */
  doubleCoat: number;
  hairy: number;
  /** Rare-allele frequency at the fantasy loci (missing = 0; PO is sport-only everywhere). */
  fantasy: Partial<Record<FantasyLocus, number>>;
  /** The wool type most of its founders classify as (§3.3). */
  woolType: WoolType;
  /** One line for the card or the market. */
  blurb: string;
}

export const BREEDS: Record<BreedId, BreedSpec> = {
  farm: {
    id: "farm", name: "Farm", blurb: "Plain farm sheep, a bit of everything.",
    // Staple 90, not §3.2's 100: at 100 mm half the Farm flock classified as Strong.
    targets: { fineness: 30, staple: 90, crimp: 4, lustre: 4, fleeceWeight: 4.0, size: 60 },
    colouredFreq: FARM_W_FREQ, pigmentScale: 1, hornedFreq: 0.5, doubleCoat: 0, hairy: 0,
    fantasy: { GW: 0.02, SO: 0.02 }, woolType: "crossbred",
  },
  merino: {
    id: "merino", name: "Merino", blurb: "Fine, dense, soft next to the skin.",
    targets: { fineness: 19, staple: 75, crimp: 7, lustre: 2, fleeceWeight: 5.0, size: 50 },
    colouredFreq: 0.1, pigmentScale: 0.5, hornedFreq: 0.5, doubleCoat: 0, hairy: 0,
    fantasy: { CL: 0.02 }, woolType: "fine",
  },
  corriedale: {
    id: "corriedale", name: "Corriedale", blurb: "Dual-purpose, a fine × longwool cross.",
    targets: { fineness: 26, staple: 100, crimp: 4.5, lustre: 4, fleeceWeight: 5.0, size: 60 },
    colouredFreq: 0.2, pigmentScale: 1, hornedFreq: 0.2, doubleCoat: 0, hairy: 0,
    fantasy: { CL: 0.02 }, woolType: "medium",
  },
  perendale: {
    id: "perendale", name: "Perendale", blurb: "Hardy hill sheep, strong wool.",
    targets: { fineness: 30, staple: 120, crimp: 3.5, lustre: 4, fleeceWeight: 4.0, size: 55 },
    colouredFreq: 0.2, pigmentScale: 1, hornedFreq: 0.2, doubleCoat: 0, hairy: 0,
    fantasy: { ST: 0.03, SO: 0.02 }, woolType: "strong",
  },
  romney: {
    id: "romney", name: "Romney", blurb: "Lustrous longwool.",
    targets: { fineness: 34, staple: 150, crimp: 2.5, lustre: 7, fleeceWeight: 5.5, size: 65 },
    colouredFreq: 0.25, pigmentScale: 1, hornedFreq: 0.2, doubleCoat: 0, hairy: 0,
    fantasy: { ST: 0.03, PA: 0.015 }, woolType: "lustre",
  },
  drysdale: {
    id: "drysdale", name: "Drysdale", blurb: "Hairy carpet wool, horns on everyone.",
    targets: { fineness: 40, staple: 190, crimp: 1, lustre: 3, fleeceWeight: 6.0, size: 60 },
    colouredFreq: 0.1, pigmentScale: 0.5, hornedFreq: 1, doubleCoat: 0, hairy: 1,
    fantasy: { ST: 0.03 }, woolType: "carpet",
  },
  icelandic: {
    id: "icelandic", name: "Icelandic", blurb: "Double-coated, horned, in many colours.",
    targets: { fineness: 27, staple: 140, crimp: 2.5, lustre: 6, fleeceWeight: 2.5, size: 50 },
    colouredFreq: 0.6, pigmentScale: 1.6, hornedFreq: 0.85, doubleCoat: 1, hairy: 0,
    fantasy: { GW: 0.02 }, woolType: "lopi",
  },
};

export const BREED_IDS = Object.keys(BREEDS) as BreedId[];

const { map } = sheep3;
const bi = (f1: number): number[] => [1 - f1, f1];

/** Expected genetic value of a trait at HWE under these frequencies (clamps ignored). */
export function expectedTraitMean(trait: QuantitativeTrait, freqs: FreqOverride): number {
  let v = trait.mean;
  for (const qtl of trait.qtls) {
    const p = (freqs[qtl.locus] ?? getLocus(map, qtl.locus).freq)[1] ?? 0;
    v += p * p * qtl.a + 2 * p * (1 - p) * qtl.d - (1 - p) * (1 - p) * qtl.a;
  }
  return v;
}

/** Set every locus in `group` to a common "+" frequency that makes `trait` hit `target`. */
function solveGroup(trait: QuantitativeTrait, group: readonly string[], target: number, freqs: FreqOverride): void {
  const at = (p: number) => { for (const l of group) freqs[l] = bi(p); return expectedTraitMean(trait, freqs); };
  let lo = 0.01, hi = 0.99;
  const rising = at(hi) > at(lo);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if ((at(mid) < target) === rising) lo = mid; else hi = mid;
  }
  at((lo + hi) / 2);
}

const cache = new Map<BreedId, FreqOverride>();

/** Founder frequencies for a breed: colour, major genes, fantasy genes and calibrated fleece QTLs. */
export function breedFreqs(id: BreedId): FreqOverride {
  const hit = cache.get(id);
  if (hit) return hit;
  const b = BREEDS[id];
  const f: FreqOverride = {};
  f["W"] = [b.colouredFreq, 1 - b.colouredFreq];
  for (const [c, loci] of Object.entries(PIGMENT_LOCI) as [keyof typeof FARM_PIGMENT_FREQ, readonly string[]][]) {
    for (const l of loci) f[l] = bi(Math.min(0.95, FARM_PIGMENT_FREQ[c] * b.pigmentScale));
  }
  f["P"] = [b.hornedFreq, 1 - b.hornedFreq];
  f["DC"] = bi(b.doubleCoat);
  f["N"] = bi(b.hairy);
  for (const l of FANTASY_LOCI) f[l] = bi(b.fantasy[l] ?? 0);
  const t = b.targets;
  // Size first (growth QTLs also touch fineness and fleece), then the fleece traits. Twice, so the
  // cross-effects (FW2 on size, fine alleles on crimp) settle.
  for (let pass = 0; pass < 3; pass++) {
    solveGroup(size, QTL_GROUPS.growth, t.size, f);
    solveGroup(fineness, QTL_GROUPS.fine, t.fineness, f);
    solveGroup(crimp, QTL_GROUPS.crimp, t.crimp, f);
    solveGroup(staple, QTL_GROUPS.staple, t.staple, f);
    solveGroup(lustre, QTL_GROUPS.lustre, t.lustre, f);
    solveGroup(fleeceWeight, QTL_GROUPS.fleece, t.fleeceWeight, f);
  }
  cache.set(id, f);
  return f;
}

/** An unrelated founder of the given breed. */
export function sampleBreedFounder(id: BreedId, rng: Rng): Genome {
  return sampleFounder(map, rng, breedFreqs(id));
}
