// The Kōwhai Creek river valley at play scale (DESIGN-v3 §9, §15 items 21–24): the layout as data.
// Farm coordinates (u, v): u runs east along the valley (screen right), v runs north up the valley side
// (up the screen); world x = u, world z = -v, y up. The farm floor (home paddock, yards, road, the flats,
// the far bank) is flat at y = 0 so sheep, dogs and the farmer all stand on 0; only the banks, the creek
// bed and the slopes beyond rise and fall.
import type { AreaId, Hotspot } from "./types.js";
export type { AreaId };

export type UV = [number, number];
export const AREA_IDS: readonly AreaId[] = ["home", "flats", "rushy", "farbank", "terraces"];
/** [u0, u1, v0, v1] */
export type URect = [number, number, number, number];

export interface Area {
  id: AreaId;
  name: string;
  rect: URect;
  /** How the land reads while it is locked (and how it opens). */
  how: "mend" | "drain" | "lease" | "bridge";
  /** The gate: which side, and where along it. */
  gate: { side: "w" | "e" | "s" | "n"; at: number };
  /** Where the felt price tag hangs (u, v) and where the farmer stands to read it. */
  tag: UV;
  stand: UV;
  wet?: boolean;
  tussock?: boolean;
}

export const AREAS: Record<AreaId, Area> = {
  home: { id: "home", name: "Home paddock", rect: [-30, -6, -9, 9], how: "mend", gate: { side: "e", at: -5 }, tag: [-18, 0], stand: [-14, -4] },
  flats: { id: "flats", name: "Creek flats", rect: [24, 50, -9, 9], how: "mend", gate: { side: "w", at: -5 }, tag: [27.5, -7.2], stand: [22.2, -7.5] },
  rushy: { id: "rushy", name: "Rushy corner", rect: [55, 74, -9, 8], how: "drain", gate: { side: "w", at: -5 }, tag: [58, -7.2], stand: [52.8, -7.5], wet: true },
  farbank: { id: "farbank", name: "Far bank", rect: [-26, 10, 23, 33], how: "bridge", gate: { side: "s", at: -2 }, tag: [-2, 17.5], stand: [-2, 11.2] },
  terraces: { id: "terraces", name: "The terraces", rect: [-22, 14, 38, 49], how: "lease", gate: { side: "s", at: -2 }, tag: [-2, 36.5], stand: [-2, 11.2], tussock: true },
};

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The creek's centre line (v) along the valley. */
export const creekV = (u: number): number => 15.8 + 1.8 * Math.sin(u * 0.055 + 0.6) + 0.7 * Math.sin(u * 0.16 + 1.3);
/** The bridge to the far bank. */
export const BRIDGE: UV = [-2, creekV(-2)];
export const ROAD_V = -17;
export const roadV = (u: number): number => ROAD_V + 0.5 * Math.sin(u * 0.045 + 1);

/** Buildings and places (centre u, v). */
export const SPOTS = {
  homestead: [-55, 1] as UV,
  barn: [-36.5, 1.5] as UV,
  woolshed: [6, 1.5] as UV,
  market: [-13, -12.5] as UV,
  marketPen: [-19, -12.5] as UV,
  mailbox: [-4.5, -14.3] as UV,
  vet: [17, -12.2] as UV,
  ute: [21.5, -13] as UV,
  showground: [36, -24.5] as UV,
};

/** Where the farmer stands to use a place (walk-up prompts and click-to-walk). */
export const HOTSPOT_STAND: Record<Hotspot, UV> = {
  house: [-55, -7.2],
  shed: [4, -8],
  market: [-13, -15.2],
  vet: [15.5, -15],
  fairground: [36, -20.2],
  mailbox: [-3.2, -15.2],
};

export const softRect = (u: number, v: number, r: URect, m = 2): number => smoothstep(-m, m * 0.5, Math.min(u - r[0], r[1] - u, v - r[2], r[3] - v));

/** Places kept dead flat under the rolling farm floor (buildings, pens, yards, the barn, the showground, the bridge). */
export const FLAT_RECTS: URect[] = [
  [-62.5, -47.5, -8.2, 7], // homestead and garden
  [-43, -30, -3.2, 6.4], // barn
  [-5.6, 14.2, -7.4, 6.2], // woolshed, verandah, ramp (from the paddock fence east)
  [13, 22.5, -2.5, 5.5], // yards
  [-23, -9.8, -15.6, -9.6], // market pen and stall
  [14.4, 24, -15.4, -10.2], // vet's hut and ute
  [27, 45, -33, -18.5], // showground
  [-4.2, 0.2, 7.5, 14], // bridge approach
  [-7, -2, -16.8, -11.8], // mailbox
];

/**
 * Gentle swells in the farm floor (DESIGN-v3 §15 item 27): long low rises (under ~0.6) so paddocks roll a little
 * without tipping sheep; flat under buildings and pens. Every entity stands on `height()` (see `groundY`).
 */
export function swell(u: number, v: number): number {
  let a = 0.3 * Math.sin(u * 0.2 + 0.7) * Math.sin(v * 0.27 - 0.4) + 0.2 * Math.sin(u * 0.085 - v * 0.13 + 1.9) + 0.1 * Math.sin(u * 0.36 + v * 0.29);
  // a rounder rise in the verge between the home paddock and the creek, and hummocks along the road's far side
  a += 0.45 * Math.exp(-(((u + 18) / 9) ** 2) - (((v - 11.5) / 2.2) ** 2)) + 0.35 * Math.exp(-(((u - 20) / 8) ** 2) - (((v - 11.8) / 2) ** 2));
  a += 0.5 * smoothstep(-19, -22, v) * (0.6 + 0.4 * Math.sin(u * 0.19));
  let m = 1;
  for (const r of FLAT_RECTS) m *= 1 - softRect(u, v, r, 3.2);
  return a * m;
}

/** Height of the land: the farm floor rolls gently (swell), the banks and slopes beyond rise and fall. */
export function height(u: number, v: number): number {
  const d = v - creekV(u);
  let h = 0;
  // the far side climbs to the terraces and the tops; the near side rises past the showground
  if (d > 0) h += 7.5 * smoothstep(9, 38, d) + 1.2 * Math.sin(u * 0.13 + 0.5) * smoothstep(14, 32, d) + 18 * smoothstep(38, 85, d);
  h += 4.5 * smoothstep(-31, -52, v) + 1.2 * Math.sin(u * 0.11) * smoothstep(-34, -50, v);
  h += 7 * smoothstep(-70, -100, u) + 5 * smoothstep(96, 130, u);
  // the far bank paddock is a river terrace (it rolls like the home side)
  h = lerp(h, 0, softRect(u, v, AREAS.farbank.rect, 3));
  // gentle terracing on the terraces
  const tr = softRect(u, v, AREAS.terraces.rect, 1.5);
  if (tr > 0) { const f = h / 1.1; h = lerp(h, (Math.floor(f) + smoothstep(0.75, 1, f - Math.floor(f))) * 1.1, tr * 0.8); }
  const sw = Math.max(1 - smoothstep(0, 3, d), softRect(u, v, AREAS.farbank.rect, 3));
  if (sw > 0) h += swell(u, v) * sw;
  // creek bed
  h = lerp(h, -0.25, Math.exp(-(d * d) / 18));
  h -= 0.95 * Math.exp(-(d * d) / 3.2);
  return h;
}
/** Where anything standing on the farm floor stands (sheep, the farmer, dogs, props). */
export const groundY = height;

/** Native bush (the edge only ever grows; never cleared). */
export function bushScore(u: number, v: number): number {
  const d = v - creekV(u);
  const farBank = smoothstep(14, 44, u) * smoothstep(2, 6, d) * (1 - smoothstep(40, 60, d));
  const edge = smoothstep(77, 84, u) * smoothstep(-22, -14, v);
  const gully = (1 - smoothstep(3, 9, Math.abs(u - 64))) * smoothstep(2, 6, d) * 0.9;
  const lobes = 0.1 * Math.sin(u * 0.41 + v * 0.3) * Math.sin(v * 0.5 - u * 0.2);
  return Math.max(farBank * 1.2, edge * 1.3, gully) + lobes;
}
export const BUSH_AT = 0.6;

function segDist(px: number, py: number, a: UV, b: UV): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}
export function lineDist(u: number, v: number, pts: UV[]): number {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(u, v, pts[i]!, pts[i + 1]!));
  return d;
}
/** Farm tracks (dirt): gate → road, woolshed → road, the flats gate, the bridge, the homestead drive, the showground,
 *  homestead → barn → road, and the worn path from the paddock gate to the woolshed verandah. */
export const TRACKS: UV[][] = [
  [[-6, -5], [-4.5, -9], [-4, -16.5]],
  [[4, -6.5], [4, -16.5]],
  [[13, -6], [21, -6], [22.5, -5]],
  [[-2, -1.5], [-2, 12.5]],
  [[-55, -6], [-55, -16.5]],
  [[36, -18], [36, -21]],
  [[-36.5, -3], [-36.5, -8], [-30, -12], [-28.5, -16.5]],
  [[-50, -8.2], [-44, -7.6], [-36.5, -6.5]],
  [[-5.6, -5.6], [-2.6, -7.3], [1.5, -7.2]],
];
/** Which tracks get worn dirt ribbons with wheel ruts (the rest are foot paths). */
export const RUTTED = new Set([1, 4, 6]);
/** Sheep tracks inside the home paddock: a faint worn line from the gate to the trough and the shade tree. */
export const SHEEP_TRACKS: UV[][] = [
  [[-6.8, -5], [-11, -3.4], [-16, -0.2], [-21.5, 3.2], [-25.8, 5.6]],
  [[-16, -0.2], [-15.4, 3.6]],
];

/** Trees and props that stand in the walkable strip (u, v, radius), shared by the builder and the walk grid. */
export type TreeKind = "kowhai" | "cabbage" | "pohutukawa" | "flax" | "toetoe" | "ponga";
export const TREES: [kind: TreeKind, u: number, v: number, s: number][] = [
  ["kowhai", -46, 7, 1.4], ["cabbage", -62, 8, 1.4], ["pohutukawa", -44, -12.5, 1.2], ["kowhai", -66, -3, 1.3],
  ["cabbage", -8.5, 11, 1.3], ["kowhai", 16, 9.5, 1.3], ["cabbage", 52, -12, 1.3], ["flax", -8, -12, 1.2], ["flax", 20, -9.5, 1.2],
  ["kowhai", -26, 12.5, 1.3], ["flax", -14, 12, 1.2], ["flax", 8, 12.2, 1.2], ["cabbage", 12, 11.5, 1.3], ["flax", 30, 12.5, 1.2],
  ["pohutukawa", -70, 6, 1.3], ["cabbage", 76, -12, 1.3], ["flax", 48, 12, 1.2], ["pohutukawa", 26, -21, 1.2], ["kowhai", 46, -21.5, 1.2],
  ["cabbage", -30, -21, 1.3], ["flax", 10, -20.5, 1.1], ["kowhai", -48, -21, 1.3],
  // the dressing pass: toetoe and flax along the creek verge, ponga where the bush comes down to the water,
  // a pōhutukawa on the rise past the barn, cabbage trees and flax by the road and the yards
  ["toetoe", -20, 11.4, 1.1], ["toetoe", 3.4, 11.9, 1], ["toetoe", 22.5, 12.2, 1.1], ["toetoe", -33, 11.8, 1],
  ["toetoe", -10.8, -15.4, 0.9], ["toetoe", 26.5, -15.2, 1], ["toetoe", -40, -15, 0.9],
  ["ponga", 19.5, 13.2, 0.95], ["ponga", 27, 12.9, 1.05], ["ponga", 34, 13.4, 0.9], ["ponga", -29.5, 13.4, 0.9],
  ["pohutukawa", -36.5, 9.4, 1.15], ["cabbage", -1.5, -10.6, 1.2], ["flax", 22.9, 7.4, 1.1], ["flax", -46.5, -8.8, 1],
  ["kowhai", 29.5, -11.4, 1.2], ["flax", 12, -10.8, 1],
];
export const treeRadius = (kind: string, s: number): number => (kind === "flax" || kind === "toetoe" ? 0.7 : kind === "cabbage" ? 0.55 : kind === "ponga" ? 0.6 : 1.0) * s;

/** Things inside the paddocks the flock walks round (u, v, radius): the shade tree, the trough, rocks, the bale. */
export const OBSTACLES: [u: number, v: number, r: number][] = [
  [-15.4, 5.6, 1.25], // the shade tree (a big old kōwhai)
  [-27.5, 6.8, 1.15], // the trough
  [-9, 6.5, 0.8], // the bale
  [-26.6, -6.9, 1.1], // rocks in the corner
  [-23.6, 6.1, 0.55], // cabbage trees
  [-19.2, -2.4, 0.45], // a lone rock
];
/** The home paddock's shade tree and cabbage trees (built with the trees; the grid blocks them via OBSTACLES). */
export const PADDOCK_TREES: [kind: TreeKind, u: number, v: number, s: number][] = [
  ["kowhai", -15.4, 5.6, 1.85], ["cabbage", -23.9, 6.3, 1.25], ["cabbage", -23.1, 5.6, 1.0],
];

/** Dry-stone walls along the road (u, v polylines), and hedgerows (low clipped shelter). */
export const STONE_WALLS: UV[][] = [
  [[-66, -15.3], [-57, -15.4]], [[-52.5, -15.4], [-45, -15.3], [-31, -15.5]],
  [[-26.4, -15.5], [-23.4, -15.4]],
];
export const HEDGES: UV[][] = [
  [[-26, -19.4], [-12, -19.6], [2, -19.4]], [[6.5, -19.4], [22, -19.3]],
  [[-62, -8.6], [-57, -8.6]], [[-53, -8.6], [-48.4, -8.6]],
];

/** Dressing props that stand in the way (u, v, rotation) — each has a solid for the walk grid. */
export const PROPS = {
  clothesline: [-45.2, -2.4] as UV,
  tractor: [-33.4, -5.6, 2.9] as [number, number, number],
  quad: [15.6, -8.3, 2.7] as [number, number, number],
  woolpacks: [[10.3, -5.3], [11.5, -5.0], [10.9, -6.3]] as UV[],
  chickens: [-48.5, -10.6] as UV,
  woodpile: [-45.6, 2.6] as UV,
  tank: [-3.9, -3.3] as UV,
  barrow: [8.4, -9.4, 0.6] as [number, number, number],
};

/** Solid rectangles the farmer walks round ([u0, u1, v0, v1]). */
export const SOLIDS: URect[] = [
  [-61.5, -48.5, -5, 6], // homestead
  [-42.3, -30.7, 1.5, 5.6], // barn back wall and roof posts
  [-42.3, -41.6, -2.6, 5.6], // barn west wall
  [-7.2, 13.4, -1.8, 5.4], // woolshed and lean-to
  [-2, 8.6, -6.6, -1.8], // verandah and benches
  [8, 13.2, -4.4, -1.8], // ramp and bales
  [13.5, 21.7, -1.7, 4.7], // yards
  [-15.2, -10.8, -13.2, -11.8], // market stall
  [15.2, 18.8, -13.7, -10.8], // vet hut
  [20.2, 22.8, -14.6, -11.4], // the vet's ute
  [-4.7, -4.3, -14.5, -14.1], // mailbox post
  [-45.45, -44.95, -2.65, -2.15], // the rotary clothesline's pole
  [-35, -31.8, -6.7, -4.5], // the tractor
  [14.6, 16.6, -8.9, -7.7], // the quad bike
  [9.7, 12.2, -6.9, -4.5], // woolpacks
  [-46.8, -44.4, 2, 3.3], // woodpile
  [-5.1, -2.7, -4.5, -2.1], // the tank stand
  [7.6, 9.2, -10, -8.8], // the wheelbarrow
];

/** Wooden fences as line segments (u, v) that stay put: the barn front, the market pen, the garden. */
export const FENCES: [UV, UV][] = [
  [[-62, -7.5], [-56.5, -7.5]], [[-53.5, -7.5], [-48, -7.5]],
  [[-42.2, -2.3], [-34.2, -2.3]], [[-32.8, -2.3], [-31, -2.3]],
  [[-22.2, -10.2], [-15.8, -10.2]], [[-22.2, -14.8], [-15.8, -14.8]], [[-22.2, -10.2], [-22.2, -14.8]], [[-15.8, -10.2], [-15.8, -11.6]], [[-15.8, -13.2], [-15.8, -14.8]],
];

/** Gate gaps are 3.6 wide. The fence runs of an area's rectangle, leaving the gate open. */
export function areaFence(a: Area): [UV, UV][] {
  const [u0, u1, v0, v1] = a.rect;
  const g = a.gate, gw = 1.8;
  const out: [UV, UV][] = [];
  const side = (s: "w" | "e" | "s" | "n", p: UV, q: UV) => {
    if (s !== g.side) { out.push([p, q]); return; }
    if (s === "w" || s === "e") { out.push([p, [p[0], g.at - gw]], [[p[0], g.at + gw], q]); }
    else { out.push([p, [g.at - gw, p[1]]], [[g.at + gw, p[1]], q]); }
  };
  side("s", [u0, v0], [u1, v0]);
  side("e", [u1, v0], [u1, v1]);
  side("n", [u0, v1], [u1, v1]);
  side("w", [u0, v0], [u0, v1]);
  return out;
}

/** Sheep zones as world rectangles (x = u, z = -v). */
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export const toRect = (r: URect, inset = 0): Rect => ({ x0: r[0] + inset, x1: r[1] - inset, z0: -r[3] + inset, z1: -r[2] - inset });

export const HOTSPOT_LABEL: Record<Hotspot, string> = {
  house: "Homestead · sleep",
  shed: "Woolshed · notice board",
  market: "Trader · market",
  vet: "Vet's hut",
  fairground: "Showground",
  mailbox: "Mailbox",
};
