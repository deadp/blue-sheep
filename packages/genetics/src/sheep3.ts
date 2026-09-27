/**
 * Sheep v3 species (docs/DESIGN-v3.md §2–4). Six chromosomes of 150 cM.
 *
 * Colour is paint-like pigment genetics:
 *   W        white mask: W (dominant) hides every pigment.
 *   R1 R2    red pigment: each "+" adds one red dose (0–4).
 *   Y1 Y2    yellow pigment (0–4).
 *   U1 U2    blue pigment (0–4, rarest).
 *   Dl       dilution: d/d gives pastels.
 *   S        spotting: s/s gives white patches on coloured wool.
 *   P        polled: P (dominant) polled, p/p horned.
 * Fleece: DC double coat (dominant), N hairy fibre (dominant, Drysdale "Nd").
 * Fantasy wools, one locus each (rare allele at index 1): ST steel, CL cloud, GW glow-worm,
 * PA pāua (recessive, shows only with lustre ≥ 5), PO pōhutukawa (dominant, sport-only),
 * SO southerly.
 *
 * Every discrete locus that inference treats together sits on a different chromosome, or at the
 * far ends of one (≥ 70 cM apart), so the engine's no-linkage assumption stays close to honest:
 * each pigment locus has its own chromosome, and W is 140 cM from R1.
 *
 * The map's founder frequencies are the Farm (starter) breed's colour and fantasy frequencies;
 * other breeds override them through `breeds.ts`. Inference uses the map's frequencies as the
 * default founder prior.
 */
import type { ChromosomeSpec, Genome, GenomeMap, LocusSpec } from "./genome.js";
import { genotypeAt } from "./genome.js";
import { defineSpecies } from "./species.js";
import type { DiscreteTrait, Qtl, QuantitativeTrait } from "./traits.js";

/** Biallelic Mendelian locus: `alleles[1]` has founder frequency `freq1`. */
function locus(id: string, cM: number, alleles: [string, string], freq1: number): LocusSpec {
  return { id, cM, alleles, freq: [1 - freq1, freq1] };
}

/** Biallelic QTL with "-" at index 0 and "+" at index 1. */
function qtlLocus(id: string, cM: number, plusFreq = 0.5): LocusSpec {
  return { id, cM, alleles: ["-", "+"], freq: [1 - plusFreq, plusFreq] };
}

// --- Founder frequencies of the Farm breed (the map default) --------------
/** Frequency of the coloured (non-masking) allele `w`. 0.45² ≈ 20 % of founders show colour. */
export const FARM_W_FREQ = 0.45;
export const FARM_PIGMENT_FREQ = { red: 0.2, yellow: 0.25, blue: 0.1 } as const;
export const MUTATION_RATE = 0.001;

// --- Loci -------------------------------------------------------------------
const chr0: ChromosomeSpec = {
  lengthCM: 150,
  loci: [
    locus("R1", 5, ["-", "+"], FARM_PIGMENT_FREQ.red), qtlLocus("FN1", 25, 0.4), qtlLocus("FW1", 45),
    qtlLocus("FW3", 60), locus("Dl", 75, ["d", "D"], 0.75), qtlLocus("BD3", 90), qtlLocus("CR1", 105),
    qtlLocus("LU1", 120), locus("W", 145, ["w", "W"], 1 - FARM_W_FREQ),
  ],
};
const chr1: ChromosomeSpec = {
  lengthCM: 150,
  loci: [
    locus("Y1", 5, ["-", "+"], FARM_PIGMENT_FREQ.yellow), qtlLocus("FN2", 25, 0.4), qtlLocus("GR1", 45),
    qtlLocus("CR4", 60), locus("S", 75, ["s", "S"], 0.65), qtlLocus("FW5", 90), qtlLocus("SL1", 105),
    qtlLocus("CD1", 120), locus("ST", 145, ["ST", "st"], 0),
  ],
};
const chr2: ChromosomeSpec = {
  lengthCM: 150,
  loci: [
    locus("U1", 5, ["-", "+"], FARM_PIGMENT_FREQ.blue), qtlLocus("FN3", 25, 0.4), qtlLocus("CR2", 45, 0.6),
    qtlLocus("LU3", 60), locus("P", 75, ["p", "P"], 0.5), qtlLocus("BD4", 90), qtlLocus("BD1", 105),
    qtlLocus("SL2", 120), locus("CL", 145, ["CL", "cl"], 0),
  ],
};
const chr3: ChromosomeSpec = {
  lengthCM: 150,
  loci: [
    locus("R2", 5, ["-", "+"], FARM_PIGMENT_FREQ.red), qtlLocus("FN4", 25, 0.4), qtlLocus("GR2", 45),
    qtlLocus("SL4", 60), locus("DC", 75, ["dc", "DC"], 0), qtlLocus("LU2", 105), qtlLocus("CD2", 120),
    locus("GW", 145, ["GW", "gw"], 0.02),
  ],
};
const chr4: ChromosomeSpec = {
  lengthCM: 150,
  loci: [
    locus("Y2", 5, ["-", "+"], FARM_PIGMENT_FREQ.yellow), qtlLocus("FN5", 25, 0.4), qtlLocus("FW2", 45, 0.4),
    qtlLocus("CD4", 60), locus("N", 75, ["n", "N"], 0), qtlLocus("CR3", 105), qtlLocus("SL3", 120),
    locus("PA", 145, ["PA", "pa"], 0),
  ],
};
const chr5: ChromosomeSpec = {
  lengthCM: 150,
  loci: [
    locus("U2", 5, ["-", "+"], FARM_PIGMENT_FREQ.blue), qtlLocus("FN6", 25, 0.4), qtlLocus("GR3", 45),
    qtlLocus("FW4", 60), locus("SO", 75, ["SO", "so"], 0.02), qtlLocus("BD2", 105), qtlLocus("CD3", 120),
    locus("PO", 145, ["po", "PO"], 0),
  ],
};

export const PIGMENT_LOCI = { red: ["R1", "R2"], yellow: ["Y1", "Y2"], blue: ["U1", "U2"] } as const;
export type Channel = keyof typeof PIGMENT_LOCI;
export const CHANNELS: Channel[] = ["red", "yellow", "blue"];
export const FANTASY_LOCI = ["ST", "CL", "GW", "PA", "PO", "SO"] as const;
export type FantasyLocus = (typeof FANTASY_LOCI)[number];
/** Quantitative loci, by trait family (breeds calibrate these). */
export const QTL_GROUPS = {
  fine: ["FN1", "FN2", "FN3", "FN4", "FN5", "FN6"],
  staple: ["SL1", "SL2", "SL3", "SL4"],
  crimp: ["CR1", "CR2", "CR3", "CR4"],
  lustre: ["LU1", "LU2", "LU3"],
  fleece: ["FW1", "FW2", "FW3", "FW4", "FW5"],
  growth: ["GR1", "GR2", "GR3"],
  depth: ["CD1", "CD2", "CD3", "CD4"],
} as const;

// --- Discrete traits -------------------------------------------------------
const WHITE_MASK = { trait: "white", value: "white" } as const;
const has = (g: Record<string, [string, string]>, id: string, allele: string) => g[id]?.includes(allele) ?? false;
const homo = (g: Record<string, [string, string]>, id: string, allele: string) => g[id]?.every((x) => x === allele) ?? false;

export const white: DiscreteTrait = {
  kind: "discrete", id: "white", label: "White", loci: ["W"],
  resolve: (g) => (has(g, "W", "W") ? "white" : "coloured"),
};

function doseTrait(id: Channel, label: string): DiscreteTrait {
  const loci = [...PIGMENT_LOCI[id]];
  return {
    kind: "discrete", id, label, loci, maskedBy: WHITE_MASK,
    resolve: (g) => String(loci.reduce((n, l) => n + (g[l]?.filter((a) => a === "+").length ?? 0), 0)),
  };
}
/** Red dose "0"…"4"; unseen (masked) on white sheep. */
export const red = doseTrait("red", "Red pigment");
export const yellow = doseTrait("yellow", "Yellow pigment");
export const blue = doseTrait("blue", "Blue pigment");

export const dilute: DiscreteTrait = {
  kind: "discrete", id: "dilute", label: "Dilution", loci: ["Dl"], maskedBy: WHITE_MASK,
  resolve: (g) => (homo(g, "Dl", "d") ? "pale" : "full"),
};
export const pattern: DiscreteTrait = {
  kind: "discrete", id: "pattern", label: "Pattern", loci: ["S"], maskedBy: WHITE_MASK,
  resolve: (g) => (homo(g, "S", "s") ? "spotted" : "solid"),
};
export const horns: DiscreteTrait = {
  kind: "discrete", id: "horns", label: "Horns", loci: ["P"],
  resolve: (g) => (has(g, "P", "P") ? "polled" : "horned"),
};
export const coat: DiscreteTrait = {
  kind: "discrete", id: "coat", label: "Coat", loci: ["DC"],
  resolve: (g) => (has(g, "DC", "DC") ? "double" : "single"),
};
export const hair: DiscreteTrait = {
  kind: "discrete", id: "hair", label: "Hairy fibre", loci: ["N"],
  resolve: (g) => (has(g, "N", "N") ? "hairy" : "plain"),
};

function recessiveWool(id: string, label: string, l: string, name: string, extra: Partial<DiscreteTrait> = {}): DiscreteTrait {
  const rare = l.toLowerCase();
  return { kind: "discrete", id, label, loci: [l], resolve: (g) => (homo(g, l, rare) ? name : "plain"), ...extra };
}
export const steel = recessiveWool("steel", "Steel wool", "ST", "steel");
export const cloud = recessiveWool("cloud", "Cloud wool", "CL", "cloud");
export const glow = recessiveWool("glow", "Glow-worm wool", "GW", "glow");
/** Pāua shimmer needs a lustrous fleece: with lustre below 5 it can't be seen. */
export const paua = recessiveWool("paua", "Pāua wool", "PA", "paua", { maskedBy: { trait: "lustre", below: 5 } });
export const pohutukawa: DiscreteTrait = {
  kind: "discrete", id: "pohutukawa", label: "Pōhutukawa wool", loci: ["PO"],
  resolve: (g) => (has(g, "PO", "PO") ? "pohutukawa" : "plain"),
};
export const southerly = recessiveWool("southerly", "Southerly wool", "SO", "southerly");

/** Fantasy trait id for each fantasy locus. */
export const FANTASY_TRAIT: Record<FantasyLocus, string> = {
  ST: "steel", CL: "cloud", GW: "glow", PA: "paua", PO: "pohutukawa", SO: "southerly",
};

// --- Quantitative traits ----------------------------------------------------
const q = (locus: string, a: number, d = 0): Qtl => ({ locus, a, d });
/**
 * A dominant major gene adding `e` when present. Written as a QTL with a = d = e/2; the trait's
 * `mean` then includes +e/2 so that non-carriers sit at the base value.
 */
const dominant = (locus: string, e: number): Qtl => ({ locus, a: e / 2, d: e / 2 });

/** Fibre diameter in µm (lower is finer). Hairy (N) adds 8 µm. */
export const fineness: QuantitativeTrait = {
  kind: "quantitative", id: "fineness", label: "Fibre diameter", unit: "µm", mean: 28 + 4,
  qtls: [...QTL_GROUPS.fine.map((l) => q(l, -1.5)), q("GR1", 0.8), q("GR3", 0.6), dominant("N", 8)],
  envSd: 1.5, inbreedingDepression: 0, min: 12, max: 50,
};

/** Staple length in mm. Hairy adds 40 mm, double coat 20 mm. */
export const staple: QuantitativeTrait = {
  kind: "quantitative", id: "staple", label: "Staple length", unit: "mm", mean: 110 + 20 + 10,
  qtls: [...QTL_GROUPS.staple.map((l) => q(l, 12)), dominant("N", 40), dominant("DC", 20)],
  envSd: 10, inbreedingDepression: 10, min: 40,
};

/** Crimps per cm. Finer wool crimps more (each fine FN allele +0.3); hairy fibre crimps less. */
export const crimp: QuantitativeTrait = {
  kind: "quantitative", id: "crimp", label: "Crimp", unit: "/cm", mean: 4.5 - 0.75,
  qtls: [q("CR1", 0.8), q("CR2", 0.7, 0.2), q("CR3", 0.6), q("CR4", 0.5), q("BD1", -0.3),
    ...QTL_GROUPS.fine.map((l) => q(l, 0.3)), dominant("N", -1.5)],
  envSd: 0.7, inbreedingDepression: 0.5, min: 0.5, max: 12,
};

/** Lustre 0–10 (sheen). */
export const lustre: QuantitativeTrait = {
  kind: "quantitative", id: "lustre", label: "Lustre", unit: "", mean: 4,
  qtls: QTL_GROUPS.lustre.map((l) => q(l, 1.2)),
  envSd: 0.6, inbreedingDepression: 0, min: 0, max: 10,
};

/** Greasy fleece kg. Hairy fibre adds 1 kg (long, heavy carpet fleece). */
export const fleeceWeight: QuantitativeTrait = {
  kind: "quantitative", id: "fleeceWeight", label: "Fleece weight", unit: "kg", mean: 4.0 + 0.5,
  qtls: [q("FW1", 0.35, 0.1), q("FW2", 0.3), q("FW3", 0.25, 0.05), q("FW4", 0.2), q("FW5", 0.3), q("GR1", 0.15), q("GR2", 0.1),
    dominant("N", 1)],
  envSd: 0.5, inbreedingDepression: 1.2, min: 0.5,
};

export const size: QuantitativeTrait = {
  kind: "quantitative", id: "size", label: "Body weight", unit: "kg", mean: 60,
  qtls: [q("GR1", 4), q("GR2", 3.5, 1), q("GR3", 3), q("FW2", 1), q("BD2", 1)],
  envSd: 5, inbreedingDepression: 8, min: 25,
};

export const boldness: QuantitativeTrait = {
  kind: "quantitative", id: "boldness", label: "Boldness", unit: "", mean: 5,
  qtls: [q("BD1", 0.9), q("BD2", 0.8, 0.3), q("BD3", 0.7), q("BD4", 0.6), q("CR2", -0.2)],
  envSd: 1.0, inbreedingDepression: 0.5, min: 0, max: 10,
};

/** Colour strength ×0.6–1.4 (the quantitative route to vivid colour). h² ≈ 0.67 at p = 0.5. */
export const depth: QuantitativeTrait = {
  kind: "quantitative", id: "depth", label: "Colour strength", unit: "×", mean: 1,
  qtls: QTL_GROUPS.depth.map((l) => q(l, 0.08)),
  envSd: 0.08, inbreedingDepression: 0, min: 0.6, max: 1.4,
};

export const DISCRETE_TRAITS: DiscreteTrait[] = [
  white, red, yellow, blue, dilute, pattern, horns, coat, hair, steel, cloud, glow, paua, pohutukawa, southerly,
];
export const QUANTITATIVE_TRAITS: QuantitativeTrait[] = [fineness, staple, crimp, lustre, fleeceWeight, size, boldness, depth];

export const sheep3 = defineSpecies("sheep3", [chr0, chr1, chr2, chr3, chr4, chr5], [...DISCRETE_TRAITS, ...QUANTITATIVE_TRAITS]);

/** Mutation settings for `mate()` in v3: sports at the fantasy loci only. */
export const SPORTS = { mutation: { loci: [...FANTASY_LOCI], rate: MUTATION_RATE } };

export interface Pigment { red: number; yellow: number; blue: number }

/** Pigment doses 0–4 per channel, read from the genome (white or not). */
export function pigmentDoses(genome: Genome, map: GenomeMap = sheep3.map): Pigment {
  const dose = (c: Channel) => PIGMENT_LOCI[c].reduce((n, id) => { const [a, b] = genotypeAt(genome, map, id); return n + a + b; }, 0);
  return { red: dose("red"), yellow: dose("yellow"), blue: dose("blue") };
}
