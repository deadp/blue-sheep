/** Wool type from measured fleece traits (docs/DESIGN-v3.md §3.3). Pure. */

export type WoolType = "lopi" | "carpet" | "fine" | "medium" | "lustre" | "strong" | "crossbred";

export const WOOL_TYPES: WoolType[] = ["lopi", "carpet", "fine", "medium", "lustre", "strong", "crossbred"];

export const WOOL_TYPE_LABEL: Record<WoolType, string> = {
  lopi: "Lopi", carpet: "Carpet", fine: "Fine", medium: "Medium", lustre: "Lustre longwool",
  strong: "Strong", crossbred: "Crossbred",
};

export interface FleeceMeasures {
  /** µm (for a double coat, the blended measurement). */
  fineness: number;
  /** mm */
  staple: number;
  /** 0–10 */
  lustre: number;
  doubleCoat: boolean;
  hairy: boolean;
}

/** First matching rule wins, in the §3.3 order. */
export function woolType(m: FleeceMeasures): WoolType {
  if (m.doubleCoat && m.staple >= 110) return "lopi";
  if (m.hairy || m.fineness >= 37) return "carpet";
  if (m.fineness <= 21.5) return "fine";
  if (m.fineness <= 27) return "medium";
  if (m.fineness > 31 && m.lustre >= 6 && m.staple >= 130) return "lustre";
  if (m.fineness > 27 && m.fineness <= 33 && m.staple >= 100) return "strong";
  return "crossbred";
}

/** Fleece measures from observed `sheep3` phenotypes. */
export function fleeceFromPhenotype(ph: Record<string, string | number | undefined>): FleeceMeasures {
  return {
    fineness: Number(ph["fineness"] ?? 0),
    staple: Number(ph["staple"] ?? 0),
    lustre: Number(ph["lustre"] ?? 0),
    doubleCoat: ph["coat"] === "double",
    hairy: ph["hair"] === "hairy",
  };
}

/**
 * A double coat's two layers from the blended measurement (measured = 0.6 × outer + 0.4 × inner,
 * with the outer coat 10 µm coarser than the inner).
 */
export function coatLayers(fineness: number): { outer: number; inner: number } {
  return { outer: fineness + 4, inner: fineness - 6 };
}
