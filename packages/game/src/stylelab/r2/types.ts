// Style lab round 2: data shapes for the map-expansion concepts (DESIGN-v3 §9, §15 item 20).

export type Stage = 0 | 1 | 2; // start, mid-game, late-game
export const STAGE_NAMES = ["start", "mid", "late"] as const;
export type StageName = (typeof STAGE_NAMES)[number];
export type UV = [number, number];

/** How a block of land joins the farm. */
export type How = "home" | "mend" | "drain" | "lease" | "buy" | "bridge";

export interface Zone {
  id: string;
  name: string;
  poly: UV[];
  /** The stage at which it is farmed (0 = from the start). */
  stage: Stage;
  how: How;
  price?: number;
  /** Rushy wet ground with pools until it is opened. */
  wet?: boolean;
  /** Tussock country: stays golden when farmed. */
  tussock?: boolean;
  /** Contour fence lines (v) across a terraced zone once farmed. */
  contours?: number[];
  /** Sheep in it once farmed. */
  flock?: number;
}

export interface Concept {
  id: "a" | "b" | "c" | "d";
  name: string;
  line: string;
  height(u: number, v: number): number;
  /** Height of the water plane; terrain below it is creek, estuary or sea. */
  water: number;
  /** Salt water (sandy shores, a turquoise shallow). */
  sea?: boolean;
  /** Tussock amount 0..1 at a point (before zones). */
  tussock(u: number, v: number, h: number): number;
  snowLine: number;
  zones: Zone[];
  /** Native bush score 0..1: bush where score > the stage threshold (the edge only ever grows). */
  bush(u: number, v: number): number;
  /** Protected wetland / salt marsh score 0..1 (flax and rushes, never drained). */
  marsh?(u: number, v: number): number;
  roads: { pts: UV[]; stage: Stage; track?: boolean }[];
  hedges?: { pts: UV[]; stage: Stage }[];
  homestead: { u: number; v: number; rot?: number };
  woolshed: { u: number; v: number };
  showground: { u: number; v: number };
  bridge?: { u: number; v: number; rot: number; stage: Stage; len?: number };
  hut?: { u: number; v: number; stage: Stage };
  jetty?: { u: number; v: number; rot: number };
  /** Where the conservation note sits. */
  bushTag: { u: number; v: number };
  /** Extra decorative trees. */
  trees?: { kind: "cabbage" | "pohutukawa" | "kowhai" | "flax" | "macrocarpa"; u: number; v: number; s?: number }[];
  view: { u: number; v: number; halfW: number };
}

/** Bush thresholds per stage: the bush grows as the score threshold drops. */
export const BUSH_AT: Record<Stage, number> = { 0: 0.62, 1: 0.46, 2: 0.3 };
