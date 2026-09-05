/**
 * Sheep species definition. Four chromosomes of 100 cM.
 * Colour loci (simplified from real sheep coat genetics):
 *   A  Agouti:    Aw (white, dominant) masks everything below; a = self/solid.
 *   B  Brown:     B (black) dominant over b (brown / "moorit").
 *   D  Dilution:  D normal; d/d dilutes black -> BLUE-grey, brown -> fawn.
 *   S  Spotting:  S solid; s/s adds white spots.
 *   P  Polled:    P polled (dominant); p/p horned.
 */
import type { ChromosomeSpec, LocusSpec } from "./genome.js";
import { defineSpecies } from "./species.js";
import type { DiscreteTrait, Qtl, QuantitativeTrait } from "./traits.js";

function mendel(id: string, cM: number, alleles: [string, string], recessiveFreq: number): LocusSpec {
  return { id, cM, alleles, freq: [recessiveFreq, 1 - recessiveFreq] };
}

/** Biallelic QTL with "-" at index 0 and "+" at index 1. */
function qtlLocus(id: string, cM: number, plusFreq: number): LocusSpec {
  return { id, cM, alleles: ["-", "+"], freq: [1 - plusFreq, plusFreq] };
}

// --- Loci ---------------------------------------------------------------
// Chromosome 0: colour + horns + a few QTLs so colour is linked to something.
const chr0: ChromosomeSpec = {
  lengthCM: 100,
  loci: [
    mendel("A", 12, ["a", "Aw"], 0.45),
    mendel("B", 30, ["b", "B"], 0.30),
    mendel("D", 34, ["d", "D"], 0.25), // linked to B (4 cM)
    qtlLocus("FW1", 50, 0.5),
    mendel("S", 68, ["s", "S"], 0.35),
    mendel("P", 85, ["p", "P"], 0.5),
    qtlLocus("FN1", 95, 0.5),
  ],
};
const chr1: ChromosomeSpec = {
  lengthCM: 100,
  loci: [
    qtlLocus("FW2", 8, 0.4), qtlLocus("FN2", 20, 0.5), qtlLocus("CR1", 33, 0.5),
    qtlLocus("GR1", 45, 0.5), // growth: +size, +microns (pleiotropy)
    qtlLocus("MK1", 60, 0.4), qtlLocus("BD1", 75, 0.5), qtlLocus("FW3", 90, 0.5),
  ],
};
const chr2: ChromosomeSpec = {
  lengthCM: 100,
  loci: [
    qtlLocus("FN3", 5, 0.5), qtlLocus("CR2", 18, 0.6), qtlLocus("MK2", 30, 0.5),
    qtlLocus("GR2", 42, 0.5), qtlLocus("BD2", 55, 0.4), qtlLocus("FW4", 70, 0.5),
    qtlLocus("FN4", 82, 0.5), qtlLocus("MK3", 95, 0.5),
  ],
};
const chr3: ChromosomeSpec = {
  lengthCM: 100,
  loci: [
    qtlLocus("CR3", 10, 0.5), qtlLocus("BD3", 22, 0.5), qtlLocus("GR3", 38, 0.5),
    qtlLocus("MK4", 50, 0.5), qtlLocus("FN5", 62, 0.5), qtlLocus("FW5", 75, 0.5),
    qtlLocus("CR4", 88, 0.5), qtlLocus("BD4", 97, 0.5),
  ],
};

// --- Traits -------------------------------------------------------------
export type WoolColour = "white" | "black" | "brown" | "blue" | "fawn";

export const colour: DiscreteTrait = {
  kind: "discrete",
  id: "colour",
  label: "Colour",
  loci: ["A", "B", "D"],
  resolve: (g) => {
    if (g["A"]?.includes("Aw")) return "white";
    const black = g["B"]?.includes("B");
    const dilute = g["D"]?.every((x) => x === "d");
    if (black) return dilute ? "blue" : "black";
    return dilute ? "fawn" : "brown";
  },
};

export const pattern: DiscreteTrait = {
  kind: "discrete",
  id: "pattern",
  label: "Pattern",
  loci: ["S"],
  resolve: (g) => (g["S"]?.every((x) => x === "s") ? "spotted" : "solid"),
};

export const horns: DiscreteTrait = {
  kind: "discrete",
  id: "horns",
  label: "Horns",
  loci: ["P"],
  resolve: (g) => (g["P"]?.includes("P") ? "polled" : "horned"),
};

const q = (locus: string, a: number, d = 0): Qtl => ({ locus, a, d });

export const fleeceWeight: QuantitativeTrait = {
  kind: "quantitative", id: "fleeceWeight", label: "Fleece weight", unit: "kg", mean: 4.0,
  qtls: [q("FW1", 0.35, 0.1), q("FW2", 0.3), q("FW3", 0.25, 0.05), q("FW4", 0.2), q("FW5", 0.3), q("GR1", 0.15), q("GR2", 0.1)],
  envSd: 0.6, inbreedingDepression: 1.2, min: 0.5,
};

/** Fibre diameter in microns. Lower is finer (better). */
export const fineness: QuantitativeTrait = {
  kind: "quantitative", id: "fineness", label: "Fibre diameter", unit: "µm", mean: 26,
  qtls: [q("FN1", -1.2), q("FN2", -1.0, -0.3), q("FN3", -0.8), q("FN4", -1.0), q("FN5", -0.9), q("GR1", 0.8), q("GR3", 0.6)],
  envSd: 1.8, inbreedingDepression: 0, min: 12, max: 45,
};

export const crimp: QuantitativeTrait = {
  kind: "quantitative", id: "crimp", label: "Crimp", unit: "/cm", mean: 5,
  qtls: [q("CR1", 0.8), q("CR2", 0.7, 0.2), q("CR3", 0.6), q("CR4", 0.5), q("BD1", -0.3)],
  envSd: 0.9, inbreedingDepression: 0.5, min: 1,
};

export const milk: QuantitativeTrait = {
  kind: "quantitative", id: "milk", label: "Milk", unit: "L/day", mean: 1.2,
  qtls: [q("MK1", 0.25, 0.1), q("MK2", 0.2), q("MK3", 0.2), q("MK4", 0.15, 0.05), q("GR2", 0.05)],
  envSd: 0.35, inbreedingDepression: 0.6, min: 0.1,
};

export const size: QuantitativeTrait = {
  kind: "quantitative", id: "size", label: "Body weight", unit: "kg", mean: 60,
  qtls: [q("GR1", 4), q("GR2", 3.5, 1), q("GR3", 3), q("FW2", 1), q("BD2", 1)],
  envSd: 5, inbreedingDepression: 8, min: 25,
};

/** Boldness 0–10: guardians want high; show judges want calm (low-ish). */
export const boldness: QuantitativeTrait = {
  kind: "quantitative", id: "boldness", label: "Boldness", unit: "", mean: 5,
  qtls: [q("BD1", 0.9), q("BD2", 0.8, 0.3), q("BD3", 0.7), q("BD4", 0.6), q("CR2", -0.2)],
  envSd: 1.0, inbreedingDepression: 0.5, min: 0, max: 10,
};

export const sheep = defineSpecies("sheep", [chr0, chr1, chr2, chr3], [
  colour, pattern, horns, fleeceWeight, fineness, crimp, milk, size, boldness,
]);
