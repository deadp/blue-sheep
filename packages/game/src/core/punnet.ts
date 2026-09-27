/**
 * The Punnet square for a single gene with two versions (one dominant, one hidden): each parent has two
 * copies, passes one of them at random, so the four pairings in the square are equally likely. Pure data for
 * ui/punnet.ts and the tutorial. Built from what the player knows (farm records, `state.known`), never from
 * genomes. Allele letters are internal: the UI shows them only with the `numbers` unlock.
 */
import type { GameState } from "./types.js";

/** A single-gene trait the square can explain. */
export interface PunnetGene {
  id: "horns" | "colour";
  locus: string;
  /** Allele names: the one that shows whenever present, and the hidden one. */
  dominant: string;
  recessive: string;
  /** How a copy is called in words ("no-horns copy", "horns copy"). */
  dominantCopy: string;
  recessiveCopy: string;
  /** What a lamb with at least one dominant copy looks like, and one with two hidden copies. */
  dominantLook: string;
  recessiveLook: string;
}

export const PUNNET_GENES: Record<PunnetGene["id"], PunnetGene> = {
  horns: {
    id: "horns", locus: "P", dominant: "P", recessive: "p",
    dominantCopy: "no-horns copy", recessiveCopy: "horns copy", dominantLook: "polled", recessiveLook: "horned",
  },
  colour: {
    id: "colour", locus: "A", dominant: "Aw", recessive: "a",
    dominantCopy: "white copy", recessiveCopy: "colour copy", dominantLook: "white", recessiveLook: "coloured",
  },
};

export interface PunnetCell {
  /** Row (the dam's copy index) and column (the sire's copy index). */
  r: number;
  c: number;
  /** The dam's and the sire's allele in this cell. */
  fromDam: string;
  fromSire: string;
  look: string;
}

export interface PunnetSquare {
  gene: PunnetGene;
  dam: [string, string];
  sire: [string, string];
  /** Row-major: (0,0), (0,1), (1,0), (1,1). */
  cells: PunnetCell[];
  /** Cells per look, e.g. { polled: 3, horned: 1 }. */
  counts: Record<string, number>;
  /** Share of lambs with the hidden look (0..1). */
  recessiveShare: number;
}

/** The look of a lamb with these two copies. */
export function punnetLook(gene: PunnetGene, a: string, b: string): string {
  return a === gene.dominant || b === gene.dominant ? gene.dominantLook : gene.recessiveLook;
}

/** Build the 2×2 square from each parent's two copies. */
export function punnetSquare(gene: PunnetGene, dam: [string, string], sire: [string, string]): PunnetSquare {
  const cells: PunnetCell[] = [];
  const counts: Record<string, number> = { [gene.dominantLook]: 0, [gene.recessiveLook]: 0 };
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const look = punnetLook(gene, dam[r]!, sire[c]!);
    counts[look] = (counts[look] ?? 0) + 1;
    cells.push({ r, c, fromDam: dam[r]!, fromSire: sire[c]!, look });
  }
  return { gene, dam, sire, cells, counts, recessiveShare: (counts[gene.recessiveLook] ?? 0) / 4 };
}

/**
 * A parent's two copies as the farm knows them (dominant first), or null when its genotype at the gene's
 * locus isn't proven. Reads `state.known` (facts the player has proven), never the genome.
 */
export function knownCopies(state: GameState, sheepId: string, gene: PunnetGene): [string, string] | null {
  const g = state.known[sheepId]?.[gene.locus];
  if (!g) return null;
  const [a, b] = g.split("/") as [string, string];
  return b === gene.dominant && a !== gene.dominant ? [b, a] : [a, b];
}

/** The square for a known pair, or null if either parent's copies aren't proven. */
export function knownPunnet(state: GameState, gene: PunnetGene, damId: string, sireId: string): PunnetSquare | null {
  const d = knownCopies(state, damId, gene), s = knownCopies(state, sireId, gene);
  return d && s ? punnetSquare(gene, d, s) : null;
}
