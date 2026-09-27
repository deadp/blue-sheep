// Style lab round 2: four ways the Kōwhai Creek farm could grow its pasture over the game.
// Each concept is a height field plus zones that open at start / mid / late. The native bush
// only ever grows (its threshold drops each stage); land comes from leasing, buying, mending
// old fences, clearing a blocked drain or building a bridge.
import { lerp, smoothstep as ss } from "../valley.js";
import type { Concept, UV } from "./types.js";

function distSeg(px: number, py: number, a: UV, b: UV): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}
export function lineDist(u: number, v: number, pts: UV[]): number {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distSeg(u, v, pts[i]!, pts[i + 1]!));
  return d;
}
const rect = (u0: number, u1: number, v0: number, v1: number): UV[] => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const pad = (h: number, u: number, v: number, p: { u: number; v: number }, r: number, y: number) =>
  lerp(h, y, 1 - ss(r * 0.7, r * 1.4, Math.hypot(u - p.u, v - p.v)));
const ripple = (u: number, v: number) => 0.35 * Math.sin(u * 0.21) * Math.cos(v * 0.17) + 0.3 * Math.sin(u * 0.07 + v * 0.13);
/** Snowy tops along the back of the map. */
const tops = (u: number, v: number, from = 25) => ss(from, from + 13, v) * (4.8 + 2.2 * Math.sin(u * 0.19 + 0.4) + 2.2 * Math.abs(Math.sin(u * 0.43)));
function terrace(h: number, w: number, step = 0.9): number {
  if (w <= 0) return h;
  const f = h / step;
  return lerp(h, (Math.floor(f) + ss(0.78, 1, f - Math.floor(f))) * step, w);
}
function inside(u: number, v: number, r: UV[], m = 0): number {
  // soft rectangle weight for axis-aligned 4-point zones
  const u0 = Math.min(...r.map((p) => p[0])), u1 = Math.max(...r.map((p) => p[0]));
  const v0 = Math.min(...r.map((p) => p[1])), v1 = Math.max(...r.map((p) => p[1]));
  return ss(-2 + m, 1 + m, Math.min(u - u0, u1 - u, v - v0, v1 - v));
}

// ---------------------------------------------------------------- (a) River valley

const creekA = (u: number) => 3 + 2.6 * Math.sin(u * 0.075 + 0.4) + 0.8 * Math.sin(u * 0.21 + 1.3);
const A_TERR = rect(-31, -9, 15, 24);
const A: Concept = {
  id: "a",
  name: "River valley",
  line: "Along the creek flats, over a bridge, then up the terraces",
  water: 0.12,
  snowLine: 9.8,
  height(u, v) {
    const d = v - creekA(u);
    let h = 0.7 + ripple(u, v);
    if (d > 0) h += 5.6 * ss(7, 28, d) + 0.9 * Math.sin(u * 0.16 + 0.5) * ss(12, 24, d);
    else h += 2.8 * ss(9, 26, -d) + 1.1 * Math.sin(u * 0.19 + 1) * ss(12, 24, -d);
    h += tops(u, v, 26);
    h = lerp(h, 0.55, Math.exp(-(d * d) / 30));
    h -= 1.15 * Math.exp(-(d * d) / 2.6);
    h = pad(h, u, v, A.homestead, 5, 1.0);
    h = pad(h, u, v, A.woolshed, 6, 0.95);
    h = pad(h, u, v, A.showground, 7, 1.1);
    return terrace(h, inside(u, v, A_TERR));
  },
  tussock: (u, v, h) => ss(3.6, 6, h) * 0.9,
  zones: [
    { id: "home", name: "Home paddock", poly: rect(-33, -17, -8, -2), stage: 0, how: "home", flock: 6 },
    { id: "flats", name: "Creek flats", poly: rect(-13, 3, -8, 0.5), stage: 1, how: "mend", price: 80, flock: 5 },
    { id: "wet", name: "Rushy corner", poly: rect(7, 19, -10, 0), stage: 1, how: "drain", price: 60, wet: true, flock: 3 },
    { id: "far", name: "Far bank", poly: rect(-22, -2, 7, 13), stage: 2, how: "bridge", price: 150, flock: 5 },
    { id: "hill", name: "Terraces", poly: A_TERR, stage: 2, how: "lease", price: 300, flock: 6, contours: [18, 21] },
  ],
  bush(u, v) {
    // the far bank downstream, climbing into the gully; plus a riparian strip
    const d = v - creekA(u);
    const main = ss(-2, 30, u) * ss(1.5, 5, d) * (1 - ss(28, 34, v));
    const strip = ss(4, 22, u) * (1 - ss(2.2, 5, Math.abs(d))) * 0.75;
    return Math.max(main * 1.35, strip);
  },
  roads: [
    { pts: [[-24, -13], [-14, -11.5], [-4, -11.5], [8, -12], [20, -14], [30, -16], [44, -14]], stage: 0 },
    { pts: [[-7, -11.5], [-6, -2], [-6, creekA(-6) - 2.5]], stage: 1, track: true },
    { pts: [[-6, creekA(-6) + 3], [-8, 12], [-14, 15]], stage: 2, track: true },
  ],
  homestead: { u: -25, v: -16 },
  woolshed: { u: -11, v: -16.5 },
  showground: { u: 31, v: -19 },
  bridge: { u: -6, v: creekA(-6) + 0.2, rot: 0, stage: 2 },
  bushTag: { u: 24, v: 18 },
  trees: [
    { kind: "cabbage", u: -36, v: -12 }, { kind: "cabbage", u: 3, v: -14 }, { kind: "kowhai", u: -30, v: -17 },
    { kind: "kowhai", u: -17, v: -19 }, { kind: "pohutukawa", u: -38, v: creekA(-38) - 3.2, s: 1 },
    { kind: "flax", u: -20, v: creekA(-20) - 2.3 }, { kind: "flax", u: -30, v: creekA(-30) + 2.4 },
  ],
  view: { u: 1, v: 6, halfW: 50 },
};

// ---------------------------------------------------------------- (b) Rolling downs

const STREAM_B: UV[] = [[-40, 26], [-33, 22], [-30, 15], [-22, 11], [-19, 5], [-13, 1], [-11, -4], [-14, -11], [-12, -18], [-20, -24], [-26, -30]];
const B: Concept = {
  id: "b",
  name: "Rolling downs",
  line: "Buy the neighbours' blocks, ring by ring, from the valley floor out",
  water: 0.12,
  snowLine: 10.2,
  height(u, v) {
    let h = 1.9 + 1.9 * Math.sin(u * 0.1 + 0.3) * Math.cos(v * 0.12 - 0.2) + 1.0 * Math.sin(u * 0.05 - v * 0.09 + 1) + 0.5 * Math.sin(u * 0.23 + v * 0.19);
    const r = Math.hypot(u / 50, (v - 5) / 36);
    h += 2.6 * ss(0.45, 0.95, r);
    h += tops(u, v, 27);
    const sd = lineDist(u, v, STREAM_B);
    h = lerp(h, 0.5, Math.exp(-(sd * sd) / 14));
    h -= 1.0 * Math.exp(-(sd * sd) / 1.6);
    // a pond where the stream pauses
    const pd = Math.hypot(u + 11.5, v + 4);
    h -= 1.2 * (1 - ss(1.5, 3.4, pd));
    h = pad(h, u, v, B.homestead, 5, 1.5);
    h = pad(h, u, v, B.woolshed, 6, 1.4);
    h = pad(h, u, v, B.showground, 7, 1.3);
    return h;
  },
  tussock: (u, v, h) => ss(4.2, 6.5, h) * 0.9,
  zones: [
    { id: "home", name: "Home block", poly: [[-3, 3], [15, 4], [16, 13], [-2, 14]], stage: 0, how: "home", flock: 6 },
    { id: "east", name: "Barry's back block", poly: [[18, 2], [33, 0], [34, 13], [18, 14]], stage: 1, how: "buy", price: 150, flock: 5 },
    { id: "west", name: "Stream paddock", poly: [[-8, 3], [-5, 3], [-5, 14], [-15, 15], [-17, 6]], stage: 1, how: "mend", price: 80, flock: 4 },
    { id: "front", name: "Front downs", poly: [[-4, -7], [17, -8], [19, -18], [-1, -19]], stage: 2, how: "lease", price: 200, flock: 5 },
    { id: "top", name: "Top downs", poly: [[-13, 17], [16, 16], [15, 25], [-11, 26]], stage: 2, how: "buy", price: 260, flock: 6 },
  ],
  bush(u, v) {
    const sd = lineDist(u, v, STREAM_B);
    const gully = (1 - ss(3, 13, sd)) * (1 - ss(2, 12, v)) * ss(-32, -8, -u);
    const corner = ss(28, 40, u) * ss(10, 20, v) * (1 - ss(26, 32, v));
    return Math.max(gully * 1.2, corner * 1.1);
  },
  marsh: (u, v) => 1 - ss(2.5, 5.5, Math.hypot(u + 11.5, v + 4)),
  roads: [
    { pts: [[5, 1], [8, -2], [20, -3], [27, -10], [31, -15], [44, -20]], stage: 0 },
    { pts: [[16, 1], [17, 8]], stage: 1, track: true },
    { pts: [[16, 15], [2, 16]], stage: 2, track: true },
  ],
  hedges: [
    { pts: [[-3, 15.5], [17, 15]], stage: 0 },
    { pts: [[17, 1.5], [17, 15]], stage: 0 },
    { pts: [[-18, 16], [-3, 15.5]], stage: 1 },
    { pts: [[-3, -5], [18, -6]], stage: 1 },
    { pts: [[18, 15], [34, 14.5]], stage: 2 },
  ],
  homestead: { u: 4, v: -1.5, rot: 0.1 },
  woolshed: { u: 22, v: -4 },
  showground: { u: 33, v: -19 },
  bushTag: { u: -28, v: -6 },
  trees: [
    { kind: "macrocarpa", u: -1, v: -3 }, { kind: "cabbage", u: 12, v: -3 }, { kind: "kowhai", u: -4, v: 0 },
    { kind: "cabbage", u: -20, v: 22 }, { kind: "kowhai", u: 28, v: -4 },
  ],
  view: { u: 1, v: 6, halfW: 50 },
};

// ---------------------------------------------------------------- (c) High-country station

const riverC = (u: number) => -15 + 1.6 * Math.sin(u * 0.08 + 1) + 0.6 * Math.sin(u * 0.23);
const C_HIGH = rect(-22, 6, 15, 25);
const C: Concept = {
  id: "c",
  name: "High-country station",
  line: "Lower flats first, then tussock slopes, then the high run and the musterers' hut",
  water: 0.12,
  snowLine: 11.8,
  height(u, v) {
    const d = v - riverC(u);
    let h = 0.7 + ripple(u, v) * 0.7;
    // the long climb from the flats to the tops, with spurs and gullies
    const climb = ss(-6, 34, v);
    h += 13 * Math.pow(climb, 1.35) + 1.6 * Math.sin(u * 0.2 + 0.8) * ss(0, 20, v) + 0.9 * Math.sin(u * 0.47) * ss(8, 30, v);
    // a side gully of beech forest on the right
    h -= 2.4 * Math.exp(-((u - 24) ** 2) / 30) * ss(-2, 10, v);
    h += tops(u, v, 30) * 0.6;
    // a benched shelf for the high run
    h = lerp(h, 7.1 + 0.25 * Math.sin(u * 0.3), inside(u, v, C_HIGH, 0.5) * 0.75);
    // the braided river along the bottom
    h += 1.4 * ss(4, 12, -d);
    h = lerp(h, 0.5, Math.exp(-(d * d) / 24));
    h -= 1.0 * Math.exp(-(d * d) / 4.5);
    h = pad(h, u, v, C.homestead, 5, 1.1);
    h = pad(h, u, v, C.woolshed, 6, 1.0);
    h = pad(h, u, v, C.showground, 7, 1.1);
    if (C.hut) h = pad(h, u, v, C.hut, 2.5, 7.6);
    return h;
  },
  tussock: (u, v, h) => ss(2.4, 4.6, h),
  zones: [
    { id: "home", name: "Home flat", poly: rect(-34, -18, -10, -3), stage: 0, how: "home", flock: 6 },
    { id: "flat2", name: "Woolshed flat", poly: rect(-2, 14, -10, -3), stage: 1, how: "mend", price: 90, flock: 5 },
    { id: "slope", name: "Lower tussock", poly: rect(-28, -6, 1, 10), stage: 1, how: "lease", price: 180, tussock: true, flock: 4 },
    { id: "across", name: "Across the river", poly: rect(4, 22, -26, -20), stage: 2, how: "bridge", price: 140, flock: 4 },
    { id: "high", name: "High run", poly: C_HIGH, stage: 2, how: "lease", price: 400, tussock: true, flock: 6, contours: [20] },
  ],
  bush(u, v) {
    const g = Math.exp(-((u - 25) ** 2) / 90) * ss(-6, 2, v) * (1 - ss(22, 30, v));
    return g * 1.25;
  },
  roads: [
    { pts: [[-46, -7], [-26, -12], [-12, -12.5], [4, -12], [18, -11], [28, -9], [44, -10]], stage: 0 },
    { pts: [[-12, -12.5], [-16, 0], [-8, 4], [-18, 10]], stage: 1, track: true },
    { pts: [[-18, 10], [-6, 13], [-14, 18], [-6, 22], [-4, 24.5]], stage: 2, track: true },
    { pts: [[12, -12], [12, -18], [13, -22]], stage: 2, track: true },
  ],
  homestead: { u: -26, v: -16 },
  woolshed: { u: -8, v: -17 },
  showground: { u: 33, v: -5 },
  bridge: { u: 12, v: riverC(12) + 0.1, rot: 0, stage: 2 },
  hut: { u: -2, v: 23, stage: 2 },
  bushTag: { u: 26, v: 12 },
  trees: [
    { kind: "cabbage", u: -36, v: -14 }, { kind: "kowhai", u: -30, v: -20 }, { kind: "cabbage", u: 2, v: -16 },
    { kind: "macrocarpa", u: -22, v: -21 },
  ],
  view: { u: 1, v: 6, halfW: 50 },
};

// ---------------------------------------------------------------- (d) Coastal valley

const creekD = (u: number) => 3 + 1.8 * Math.sin(u * 0.08 + 0.2);
const coastD = (v: number) => 27 + 3 * Math.sin(v * 0.18 + 0.5) + (v < -10 ? (-10 - v) * 1.05 : 0) + (v > 14 ? (v - 14) * 0.6 : 0);
const D: Concept = {
  id: "d",
  name: "Coastal valley",
  line: "The valley opens to an estuary: dune paddocks, the headland, a jetty for the trader",
  water: 0.12,
  sea: true,
  snowLine: 10.5,
  height(u, v) {
    const d = v - creekD(u);
    let h = 0.8 + ripple(u, v);
    if (d > 0) h += 5.4 * ss(7, 28, d) * ss(38, 12, u) + 1.4 * ss(7, 22, d);
    else h += 2.4 * ss(8, 24, -d);
    h += tops(u, v, 27) * ss(34, 8, u);
    // creek widening into an estuary as it nears the sea
    const w = 1 + Math.max(0, u - 8) * 0.28;
    const dd = d / w;
    h = lerp(h, 0.5, Math.exp(-(dd * dd) / 26));
    h -= (1.1 + Math.max(0, u - 12) * 0.03) * Math.exp(-(dd * dd) / 2.2);
    // the headland south of the mouth
    h += 2.6 * ss(-10, -20, v) * ss(14, 26, u) * (1 - ss(-24, -30, v));
    // sea and beach
    const s = u - coastD(v);
    h = lerp(h, 0.45, ss(-7, -1, s));
    h = lerp(h, -1.8, ss(-1, 6, s));
    h = pad(h, u, v, D.homestead, 5, 1.1);
    h = pad(h, u, v, D.woolshed, 6, 1.0);
    return h;
  },
  tussock: (u, v, h) => ss(3.8, 6.2, h) * 0.85,
  zones: [
    { id: "home", name: "Home paddock", poly: rect(-33, -16, -8, -1.5), stage: 0, how: "home", flock: 6 },
    { id: "flats", name: "Creek flats", poly: rect(-13, 3, -8, -0.5), stage: 1, how: "mend", price: 80, flock: 5 },
    { id: "dune", name: "Dune-back paddock", poly: rect(6, 17, -17, -9), stage: 1, how: "lease", price: 120, flock: 4 },
    { id: "far", name: "Far bank", poly: rect(-22, -3, 8, 15), stage: 2, how: "bridge", price: 150, flock: 5 },
    { id: "head", name: "Headland", poly: [[19, -15], [30, -16], [32, -23], [20, -24]], stage: 2, how: "lease", price: 240, flock: 5 },
  ],
  bush(u, v) {
    const back = ss(0, 12, u) * ss(10, 16, v - creekD(u)) * (1 - ss(28, 33, v)) * (1 - ss(-2, 3, u - coastD(v) + 6));
    return back * 1.3;
  },
  marsh(u, v) {
    const d = v - creekD(u);
    return ss(12, 16, u) * (1 - ss(3, 6.5, Math.abs(d - 1))) * (1 - ss(-4, 0, u - coastD(v)));
  },
  roads: [
    { pts: [[-46, -10], [-34, -11], [-22, -11], [-10, -11], [2, -11.5], [14, -7], [20, -4.2], [26, -3.6]], stage: 0 },
    { pts: [[-8, -11], [-7, -1], [-7, creekD(-7) - 2.4]], stage: 1, track: true },
    { pts: [[-7, creekD(-7) + 2.6], [-10, 12]], stage: 2, track: true },
    { pts: [[14, -7], [18, -14], [24, -20]], stage: 2, track: true },
  ],
  homestead: { u: -24, v: -21 },
  woolshed: { u: -8, v: -20 },
  showground: { u: -35, v: -15 },
  bridge: { u: -7, v: creekD(-7) + 0.1, rot: 0, stage: 2 },
  jetty: { u: 29, v: -3.5, rot: 0 },
  bushTag: { u: 12, v: 22 },
  trees: [
    { kind: "pohutukawa", u: 24, v: 8, s: 1.2 }, { kind: "pohutukawa", u: 27, v: -11, s: 1.1 }, { kind: "pohutukawa", u: 33, v: -22, s: 1 },
    { kind: "cabbage", u: -34, v: -8 }, { kind: "cabbage", u: 2, v: -16 }, { kind: "kowhai", u: -30, v: -24 },
    { kind: "flax", u: 16, v: 0 }, { kind: "flax", u: 19, v: 7 },
  ],
  view: { u: 1, v: 6, halfW: 50 },
};

export const CONCEPTS = { a: A, b: B, c: C, d: D } as const;
export type ConceptId = keyof typeof CONCEPTS;
export const CONCEPT_IDS: ConceptId[] = ["a", "b", "c", "d"];
