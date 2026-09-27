// Style lab round 3: one gameplay-scale farm shared by all four camera options (DESIGN-v3 §15 item 21).
// The farm is a strip along the valley (u = east, v = north, world z = -v): homestead, home paddock,
// woolshed with the bird stations, creek flats, the rushy corner and the native bush edge, with the
// creek behind and the high run on the slope beyond it. Sheep are the natural sheep with the
// friendlier face at play scale (about 1.8 units long); buildings are scaled up to match.
// Mist is only over locked land and far away; farmed paddocks stay clear so colours stay true.
import * as THREE from "three";
import type { ColourInput } from "@blue-sheep/genetics";
import { GeoBatch, mat, type V3 } from "../../world3d/builder.js";
import { hashString, mulberry32, type Rng } from "../../world3d/rng.js";
import { mesh, Mats } from "../render.js";
import type { LabSheep } from "../sheep.js";
import {
  batch, blob, bushClump, cabbageTree, fenceLine, flax, hex, homestead, kowhaiTree, lerp, place, pohutukawa, ponga,
  smoothstep as ss, type Kit,
} from "../valley.js";
import { MISTY } from "../r2/stage.js";
import { buildSheep2 } from "../r2/sheep2.js";
import { buildBird, type Bird3 } from "./birds3d.js";
import { buildFarmer } from "./farmer.js";

export type Stage = "early" | "mid";
export type UV = [number, number];
export type AreaId = "home" | "woolshed" | "flats" | "rushy" | "bush" | "high";

export interface Area {
  id: AreaId;
  name: string;
  /** Paddock rectangle [u0, u1, v0, v1] (for fenced areas). */
  rect?: [number, number, number, number];
  /** Where cameras look for this area. */
  focus: UV;
  how?: "mend" | "drain" | "lease";
  price?: number;
  /** Open from which stage (undefined = never in this lab). */
  opens?: Stage;
  wet?: boolean;
  tussock?: boolean;
}

export const AREAS: Record<AreaId, Area> = {
  home: { id: "home", name: "Home paddock", rect: [-30, -6, -9, 9], focus: [-18, 0], opens: "early" },
  woolshed: { id: "woolshed", name: "Woolshed", focus: [6, -3], opens: "early" },
  flats: { id: "flats", name: "Creek flats", rect: [20, 46, -9, 9], focus: [33, 0], how: "mend", price: 80, opens: "mid" },
  rushy: { id: "rushy", name: "Rushy corner", rect: [50, 70, -9, 8], focus: [60, 0], how: "drain", price: 60, wet: true },
  bush: { id: "bush", name: "Bush edge", focus: [86, 2], opens: "early" },
  high: { id: "high", name: "High run", rect: [-24, 12, 25, 38], focus: [-6, 31], how: "lease", price: 300, tussock: true },
};
export const AREA_ORDER: AreaId[] = ["home", "woolshed", "flats", "rushy", "bush", "high"];

/** Where the creek flats gate goes when the land is opened (v on the west fence, clear of the woolshed yards). */
export const FLATS_GATE = -4.8;

export const isOpen = (a: Area, st: Stage) => a.opens === "early" || (a.opens === "mid" && st === "mid");

const col = (red: number, yellow: number, blue: number, dilute = false, white = false, depth = 1): ColourInput => ({ white, red, yellow, blue, dilute, depth });

/** The home flock (v3 colours): the selected ewe is Pikelet. */
export const HOME_FLOCK: (LabSheep & { at: UV; rot: number })[] = [
  { name: "Pikelet", colour: col(4, 0, 0, true), at: [-17, -1.5], rot: -0.5 },
  { name: "Bluey", colour: col(0, 0, 4, false, false, 1.05), horns: true, at: [-12.5, 2.8], rot: 2.6 },
  { name: "Pickle", colour: col(1, 3, 2), at: [-23, 3.5], rot: 0.4 },
  { name: "Lavender", colour: col(3, 0, 3, true), at: [-20.5, -5], rot: -1.4 },
  { name: "Scone", colour: col(0, 0, 0, false, true), at: [-9.5, -4.2], rot: 3.4 },
  { name: "Tiny", colour: col(2, 0, 2, true), lamb: true, at: [-15.2, -3.3], rot: -0.2 },
];
export const FLATS_FLOCK: (LabSheep & { at: UV; rot: number })[] = [
  { name: "Slate", colour: col(0, 1, 3), at: [27, 2], rot: 0.8 },
  { name: "Butter", colour: col(0, 3, 0, true), at: [33, -3.5], rot: -2.2 },
  { name: "Rosie", colour: col(3, 1, 0), at: [38, 3.5], rot: 2 },
  { name: "Moss", colour: col(0, 2, 1, true), at: [41.5, -2], rot: -0.6 },
  { name: "Snowy", colour: col(0, 0, 0, false, true), at: [30, 5.5], rot: 1.2 },
  { name: "Pip", colour: col(0, 1, 3, true), lamb: true, at: [29.5, -1.2], rot: 0.3 },
];

// ---------------------------------------------------------------- terrain

export const creekV = (u: number) => 15.5 + 2.4 * Math.sin(u * 0.055 + 0.6) + 0.9 * Math.sin(u * 0.16 + 1.3);
const ripple = (u: number, v: number) => 0.28 * Math.sin(u * 0.19) * Math.cos(v * 0.15) + 0.22 * Math.sin(u * 0.07 + v * 0.11);

function softRect(u: number, v: number, r: [number, number, number, number], m = 2) {
  const [u0, u1, v0, v1] = r;
  return ss(-m, m * 0.5, Math.min(u - u0, u1 - u, v - v0, v1 - v));
}

export function height(u: number, v: number): number {
  const d = v - creekV(u);
  let h = 0.35 + ripple(u, v);
  // the far bank climbs to the high run and the tops; the front rises gently to the road bank
  if (d > 0) h += 8.5 * ss(4, 34, d) + 1.2 * Math.sin(u * 0.13 + 0.5) * ss(10, 30, d) + 16 * ss(34, 80, d);
  h += 1.6 * ss(-14, -34, v);
  // creek bed
  h = lerp(h, 0.25, Math.exp(-(d * d) / 22));
  h -= 1.0 * Math.exp(-(d * d) / 3.2);
  // paddocks and yards nearly flat
  for (const a of [AREAS.home, AREAS.flats, AREAS.rushy]) h = lerp(h, 0.35 + ripple(u, v) * 0.5, softRect(u, v, a.rect!, 3) * 0.7);
  h = lerp(h, 0.4, 1 - ss(8, 14, Math.hypot(u - 6, v + 1)));
  h = lerp(h, 0.55, 1 - ss(6, 11, Math.hypot(u + 44, v + 1)));
  // gentle terracing on the high run
  const hr = softRect(u, v, AREAS.high.rect!, 1.5);
  if (hr > 0) { const f = h / 1.2; h = lerp(h, (Math.floor(f) + ss(0.75, 1, f - Math.floor(f))) * 1.2, hr * 0.8); }
  return h;
}

const WATER = 0.05;
export const ROAD: UV[] = [[-90, -15], [-50, -14], [-20, -14.5], [10, -13.5], [40, -14.5], [80, -13.5], [130, -14]];
function segDist(px: number, py: number, a: UV, b: UV) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}
export function lineDist(u: number, v: number, pts: UV[]) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(u, v, pts[i]!, pts[i + 1]!));
  return d;
}
const TRACKS: UV[][] = [
  [[-44, -13.8], [-44, -5]],
  [[6, -13.8], [6, -7]],
  [[-4, -9], [-4, -11], [16, -11], [18, -9]],
];

/** Native bush score (the edge only ever grows: mid lowers the threshold). */
export function bushScore(u: number, v: number): number {
  const d = v - creekV(u);
  const farBank = ss(10, 40, u) * ss(2, 6, d) * (1 - ss(40, 60, d));
  const edge = ss(72, 80, u) * ss(-12, -6, v);
  const gully = (1 - ss(3, 9, Math.abs(u - 60))) * ss(2, 6, d) * 0.9;
  const lobes = 0.1 * Math.sin(u * 0.41 + v * 0.3) * Math.sin(v * 0.5 - u * 0.2);
  return Math.max(farBank * 1.2, edge * 1.3, gully) + lobes;
}
const BUSH_AT: Record<Stage, number> = { early: 0.62, mid: 0.48 };

// ---------------------------------------------------------------- world

export interface Farm {
  root: THREE.Group;
  ground(u: number, v: number): number;
  at(u: number, v: number, dy?: number): THREE.Vector3;
  sheep: Map<string, THREE.Group>;
  birds: Map<string, THREE.Group>;
  farmer: THREE.Group;
  /** Place (and show) the farmer. */
  setFarmer(u: number, v: number, rot: number, visible?: boolean): void;
  /** The felt selection ring (hidden unless placed). */
  select(name: string | null): void;
  /** Station anchors (bird perches) in world units. */
  stations: { id: Bird3; job: string; at: UV }[];
  gate: UV;
}

function groundColour(st: Stage, u: number, v: number, h: number, slope: number, jitter: number, forceOpen?: AreaId): THREE.Color {
  const P = MISTY.palette;
  const blot = Math.sin(u * 0.31 + Math.cos(v * 0.23) * 2) * Math.cos(v * 0.27 - u * 0.05);
  const fine = Math.sin(u * 1.7 + v * 0.9) * Math.sin(v * 1.3 - u * 0.6);
  const c = hex(P.grass).lerp(hex(P.hill), 0.3 + 0.25 * blot);
  // tussock up the slopes
  c.lerp(hex(P.tussock), ss(3.5, 7, h) * 0.85);
  for (const a of [AREAS.home, AREAS.flats, AREAS.rushy, AREAS.high]) {
    const w = softRect(u, v, a.rect!, 0.8);
    if (w <= 0) continue;
    if (isOpen(a, st) || a.id === forceOpen) {
      const lush = hex(P.grass2).lerp(hex(P.grass), 0.15 + 0.2 * blot);
      lush.multiplyScalar(1 + 0.03 * Math.sin((u + v * 0.3) * 0.9)); // mown bands
      lush.lerp(hex("#b8d98f"), Math.max(0, fine) * 0.25); // clover
      c.lerp(lush, w);
    } else {
      const rank = hex("#bdb58c").lerp(hex("#9aa27a"), 0.5 + 0.4 * blot);
      if (a.wet) rank.lerp(hex("#8f9c74"), 0.6);
      if (a.tussock) rank.lerp(hex(P.tussock), 0.5);
      rank.lerp(hex("#8c8f68"), Math.max(0, fine) * 0.35);
      c.lerp(rank, w * 0.85);
    }
  }
  // yards and the homestead lawn
  c.lerp(hex("#d8ccae"), 0.55 * (1 - ss(3, 6, Math.hypot((u - 13) * 0.8, v + 0.5))));
  c.lerp(hex(P.grass2), 0.5 * (1 - ss(5, 9, Math.hypot(u + 44, v + 1))));
  const b = bushScore(u, v);
  if (b > BUSH_AT[st] - 0.05) c.lerp(hex(P.bush), 0.55 * ss(BUSH_AT[st] - 0.05, BUSH_AT[st] + 0.1, b));
  if (slope > 0.8) c.lerp(hex(P.rock), ss(0.8, 1.6, slope) * 0.5);
  if (h > 20 + 1.5 * Math.sin(u * 0.2)) c.lerp(hex(P.snow), ss(20, 22, h));
  const d = v - creekV(u);
  if (Math.abs(d) < 3.2) c.lerp(hex(P.soil), 0.55 * (1 - ss(2, 3.2, Math.abs(d))));
  if (lineDist(u, v, ROAD) < 1.6) c.lerp(hex(P.road), 1 - ss(1.1, 1.6, lineDist(u, v, ROAD)));
  for (const t of TRACKS) { const td = lineDist(u, v, t); if (td < 1) c.lerp(hex(P.road), 0.8 * (1 - ss(0.6, 1, td))); }
  c.multiplyScalar(0.985 + jitter * 0.03);
  return c;
}

function terrain(st: Stage, mats: Mats, rng: Rng, reveal?: RevealTerrain): THREE.Object3D[] {
  const U0 = -110, U1 = 150, V0 = -45, V1 = 95, S = 0.8;
  const nu = Math.round((U1 - U0) / S), nv = Math.round((V1 - V0) / S);
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3), colr = new Float32Array((nu + 1) * (nv + 1) * 3);
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = U0 + i * S, v = V0 + j * S;
    // coarser far away: fine near the farm, but the same grid keeps it simple
    const h = height(u, v);
    const slope = Math.hypot(height(u + 0.5, v) - h, height(u, v + 0.5) - h) * 2;
    const jit = rng();
    const c = groundColour(st, u, v, h, slope, jit);
    const k = (j * (nu + 1) + i) * 3;
    if (reveal && softRect(u, v, AREAS.flats.rect!, 0.8) > 0) {
      const o = groundColour(st, u, v, h, slope, jit, "flats");
      reveal.idx.push(k);
      reveal.from.push(c.r, c.g, c.b);
      reveal.to.push(o.r, o.g, o.b);
      reveal.at.push(u, v);
    }
    pos[k] = u; pos[k + 1] = h; pos[k + 2] = -v;
    colr[k] = c.r; colr[k + 1] = c.g; colr[k + 2] = c.b;
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const colAttr = new THREE.BufferAttribute(colr, 3);
  g.setAttribute("color", colAttr);
  if (reveal) reveal.attr = colAttr;
  g.setIndex(idx);
  g.computeVertexNormals();
  const t = new THREE.Mesh(g, mats.surface("terrain"));
  t.receiveShadow = true;
  // creek ribbon
  const wpos: number[] = [], wcol: number[] = [];
  const shallow = hex("#a6d2df"), deep = hex("#6fa9c4");
  for (let u = U0; u < U1; u += 1) {
    const q: [number, number][] = [];
    for (const uu of [u, u + 1]) q.push([uu, creekV(uu)]);
    const w = 2.1;
    const pts: V3[] = [[q[0]![0], WATER + 0.2, -(q[0]![1] - w)], [q[1]![0], WATER + 0.2, -(q[1]![1] - w)], [q[0]![0], WATER + 0.2, -(q[0]![1] + w)], [q[1]![0], WATER + 0.2, -(q[1]![1] + w)]];
    const cs = [shallow, shallow, shallow, shallow];
    const mid: V3[] = [[q[0]![0], WATER + 0.2, -q[0]![1]], [q[1]![0], WATER + 0.2, -q[1]![1]]];
    for (const [a, b, c, ca, cb, cc] of [[pts[0]!, pts[1]!, mid[0]!, cs[0]!, cs[1]!, deep], [pts[1]!, mid[1]!, mid[0]!, cs[1]!, deep, deep], [mid[0]!, mid[1]!, pts[2]!, deep, deep, cs[2]!], [mid[1]!, pts[3]!, pts[2]!, deep, cs[3]!, cs[2]!]] as const) {
      wpos.push(...a, ...b, ...c);
      wcol.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(wpos, 3));
  wg.setAttribute("color", new THREE.Float32BufferAttribute(wcol, 3));
  wg.computeVertexNormals();
  const w = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0 }));
  w.receiveShadow = true;
  return [t, w];
}

/** Far ranges for the perspective cameras: layered hills, bush ridges and snowy tops. */
function backdrop(root: THREE.Group, mats: Mats) {
  const P = MISTY.palette;
  const layers: [number, number, number, string, string][] = [
    // v distance, base height, amplitude, colour, top colour
    [150, 20, 22, "#a3c29c", "#bcd1b0"],
    [230, 34, 44, "#aebfbc", "#ffffff"],
  ];
  for (const [dist, base, amp, c0, c1] of layers) {
    const pos: number[] = [], cl: number[] = [];
    const N = 180;
    const top = (u: number) => base + amp * (0.5 + 0.3 * Math.sin(u * 0.021 + dist) + 0.25 * Math.abs(Math.sin(u * 0.047 + 1.3)) + 0.12 * Math.sin(u * 0.13));
    const ca = hex(c0), cb = hex(c1);
    for (let i = 0; i < N; i++) {
      const u0 = -260 + (i / N) * 560, u1 = -260 + ((i + 1) / N) * 560;
      const t0 = top(u0), t1 = top(u1);
      const snow0 = ss(base + amp * 0.62, base + amp * 0.8, t0), snow1 = ss(base + amp * 0.62, base + amp * 0.8, t1);
      const k0 = ca.clone().lerp(cb, snow0), k1 = ca.clone().lerp(cb, snow1);
      const z = -dist;
      pos.push(u0, -2, z, u1, -2, z, u0, t0, z, u1, -2, z, u1, t1, z, u0, t0, z);
      for (const k of [ca, ca, k0, ca, k1, k0]) cl.push(k.r, k.g, k.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cl, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
    m.userData.backdrop = true;
    root.add(m);
  }
  void P; void mats;
}

// ---------------------------------------------------------------- props

function brokenFence(k: Kit, b: GeoBatch, a: UV, c: UV) {
  const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const n = Math.max(1, Math.round(len / 2.6));
  const grey = "#b7a893";
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = lerp(a[0], c[0], t), v = lerp(a[1], c[1], t);
    if (k.rng() < 0.16) { prev = null; continue; }
    const y = k.ground(u, v);
    b.box(grey, [0.16, 0.95, 0.16], [u, y + 0.42, -v], [(k.rng() - 0.5) * 0.5, 0, (k.rng() - 0.5) * 0.5]);
    const p = new THREE.Vector3(u, y, -v);
    if (prev && k.rng() < 0.5) {
      const mid = prev.clone().add(p).multiplyScalar(0.5);
      const d = p.clone().sub(prev);
      b.box(grey, [d.length(), 0.07, 0.06], [mid.x, mid.y + 0.4 + k.rng() * 0.3, mid.z], [0, -Math.atan2(d.z, d.x), (k.rng() - 0.5) * 0.35]);
    }
    prev = p;
  }
}

function fenceRect(k: Kit, b: GeoBatch, r: [number, number, number, number], broken: boolean, gateAt?: number) {
  const [u0, u1, v0, v1] = r;
  const line = (a: UV, c: UV) => (broken ? brokenFence(k, b, a, c) : fenceLine(k, b, a, c, 2.3));
  line([u0, v1], [u1, v1]);
  if (gateAt !== undefined) { line([u1, v1], [u1, gateAt + 1.8]); line([u1, gateAt - 1.8], [u1, v0]); }
  else line([u1, v1], [u1, v0]);
  line([u1, v0], [u0, v0]);
  line([u0, v0], [u0, v1]);
}

/** A farm gate (five-bar, galvanised) at (u, v), across u. */
function gate(k: Kit, u: number, v: number, open = 0, rot = 0) {
  const b = batch(k);
  b.box("#9d8163", [0.28, 1.4, 0.28], [-1.9, 0.7, 0]);
  b.box("#9d8163", [0.28, 1.4, 0.28], [1.9, 0.7, 0]);
  const g = new GeoBatch(0);
  for (let i = 0; i < 5; i++) g.box("#c9cdd0", [3.5, 0.06, 0.06], [1.75, 0.3 + i * 0.22, 0]);
  g.box("#c9cdd0", [0.07, 1.0, 0.07], [0.05, 0.75, 0]);
  g.box("#c9cdd0", [0.07, 1.0, 0.07], [3.45, 0.75, 0]);
  g.box("#c9cdd0", [3.7, 0.05, 0.05], [1.75, 0.75, 0], [0, 0, 0.27]);
  const gm = mesh(k.mats, g.build()!, "world", { outline: 0 });
  gm.position.set(-1.8, 0, 0);
  gm.rotation.y = open;
  const grp = new THREE.Group();
  const bm = mesh(k.mats, b.build()!, "world", { outline: 0 });
  grp.add(bm, gm);
  grp.position.set(u, k.ground(u, v), -v);
  grp.rotation.y = rot;
  grp.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  k.add(grp);
}

function signTexture(text: string, sub: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 128;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#fbf4e6"; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = "#d77a6c"; g.lineWidth = 10; g.strokeRect(8, 8, 240, 112);
  g.fillStyle = "#c2574a"; g.font = "800 42px Nunito, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 128, 54);
  g.fillStyle = "#7a6660"; g.font = "600 22px Nunito, sans-serif";
  g.fillText(sub, 128, 94);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function sign(k: Kit, u: number, v: number, w1: string, w2: string, rot = 0) {
  const b = batch(k);
  const P = MISTY.palette;
  b.box(P.trunk, [0.16, 2.0, 0.16], [-0.9, 1.0, 0]);
  b.box(P.trunk, [0.16, 2.0, 0.16], [0.9, 1.0, 0]);
  const m = place(k, b, u, v, rot, { outline: 0 });
  if (m) m.castShadow = true;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: signTexture(w1, w2), roughness: 0.9, side: THREE.DoubleSide }));
  board.position.set(u, k.ground(u, v) + 1.7, -v + 0.1);
  board.rotation.y = rot;
  board.castShadow = true;
  k.add(board);
}

function scrub(k: Kit, b: GeoBatch, u: number, v: number, s: number) {
  const y = k.ground(u, v);
  const gorse = k.rng() < 0.55;
  const base = gorse ? "#6f7f4c" : "#9b7f55";
  for (let i = 0; i < 3; i++) {
    const r = (0.5 + k.rng() * 0.35) * s;
    b.ico(base, r, 1, [u + (k.rng() - 0.5) * 1.2 * s, y + r * 0.7, -v + (k.rng() - 0.5) * 1.2 * s], [1, 0.8, 1]);
  }
  if (gorse) for (let i = 0; i < 6; i++) b.ico("#e6c65a", 0.12 * s, 0, [u + (k.rng() - 0.5) * 1.4 * s, y + 0.7 * s + k.rng() * 0.3, -v + (k.rng() - 0.5) * 1.4 * s]);
}

function rushes(k: Kit, b: GeoBatch, u: number, v: number) {
  const y = k.ground(u, v);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add(new THREE.ConeGeometry(0.06, 1.2, 3), i % 2 ? "#7d8a4f" : "#96905a", mat([u + Math.cos(a) * 0.2, y + 0.55, -v + Math.sin(a) * 0.2], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]));
  }
}

function pool(k: Kit, u: number, v: number, r: number) {
  const g = new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2);
  g.scale(1.4, 1, 1);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: "#a9c9cf", roughness: 0.25 }));
  m.position.set(u, k.ground(u, v) + 0.05, -v);
  m.receiveShadow = true;
  k.add(m);
}

function trough(k: Kit, b: GeoBatch, u: number, v: number) {
  const y = k.ground(u, v);
  b.box("#b9c3c9", [1.8, 0.55, 0.75], [u, y + 0.28, -v]);
  b.box("#9cc9d9", [1.6, 0.05, 0.55], [u, y + 0.56, -v]);
}

/** Round hay bales and a hay feeder: a lived-in paddock. */
function bale(k: Kit, b: GeoBatch, u: number, v: number) {
  const y = k.ground(u, v);
  b.cyl("#e2c77e", 0.62, 0.62, 1.0, 14, [u, y + 0.62, -v], [Math.PI / 2, 0, 0.3]);
  b.cyl("#d3b56a", 0.5, 0.5, 1.02, 14, [u, y + 0.62, -v], [Math.PI / 2, 0, 0.3]);
}

/** Woolshed, big enough for play scale, with a verandah of three bird stations along the front. */
function woolshed(k: Kit, u: number, v: number): { id: Bird3; job: string; at: UV }[] {
  const P = MISTY.palette, b = batch(k);
  const S = 1.75;
  const W = 7.4 * S, D = 3.8 * S;
  for (let i = -4; i <= 4; i++) for (const z of [-D / 2 + 0.2, D / 2 - 0.2]) b.box(P.trunk, [0.3, 0.8, 0.3], [i * (W / 9), 0.4, z]);
  b.box(P.shedWall, [W, 4.2, D], [0, 0.8 + 2.1, 0]);
  b.gable(P.roofRed, W + 0.8, D + 1.2, 2.6, [0, 5.0, 0]);
  // lean-to on the west end
  b.box(P.shedWall, [4.2, 3.0, 4.2], [-W / 2 - 2.1, 0.8 + 1.5, -0.6]);
  b.box(P.roofRed, [4.8, 0.14, 4.8], [-W / 2 - 2.1, 4.35, -0.6], [0, 0, 0.18]);
  // doors, battens, windows
  b.box(P.wall, [2.4, 2.8, 0.06], [W * 0.3, 2.2, D / 2 + 0.02]);
  b.box(P.fence, [0.1, 2.8, 0.08], [W * 0.3, 2.2, D / 2 + 0.05]);
  for (const x of [-W * 0.35, -W * 0.12]) b.box(P.wall, [1.1, 0.8, 0.06], [x, 3.6, D / 2 + 0.02]);
  for (let i = -6; i <= 6; i++) b.box("#c9786b", [0.08, 4.2, 0.05], [i * (W / 13), 2.9, D / 2 + 0.01]);
  // the verandah with three station bays facing the camera
  // a shallow awning against the wall; the benches and perches stand out in front on the deck
  b.box(P.roofRed, [W * 0.72, 0.14, 1.6], [-W * 0.13, 4.3, D / 2 + 0.75], [0.3, 0, 0]);
  b.box(P.fence, [W * 0.74, 0.16, 4.4], [-W * 0.13, 0.55, D / 2 + 2.1]);
  const bays: { id: Bird3; job: string; bench: string; x: number }[] = [
    { id: "kaka", job: "Carding", bench: "#e7d3a8", x: -W * 0.37 },
    { id: "tui", job: "Spinning", bench: "#d9c6e0", x: -W * 0.13 },
    { id: "piwakawaka", job: "Knitting", bench: "#bcd8c0", x: W * 0.11 },
  ];
  for (const bay of bays) {
    // bench with a little pile of wool (carded, yarn, knitting) and a perch post
    b.box("#c2a88c", [2.0, 0.12, 1.1], [bay.x, 1.55, D / 2 + 2.6]);
    for (const dx of [-0.85, 0.85]) b.box("#a08670", [0.12, 1.0, 1.0], [bay.x + dx, 1.05, D / 2 + 2.6]);
    b.box(bay.bench, [1.9, 0.06, 1.0], [bay.x, 1.63, D / 2 + 2.6]);
    if (bay.id === "kaka") for (let i = 0; i < 4; i++) b.ico("#efe6d4", 0.26, 1, [bay.x - 0.5 + i * 0.3, 1.82, D / 2 + 2.5 + (i % 2) * 0.2], [1.3, 0.7, 1]);
    if (bay.id === "tui") { b.cyl("#8a6d55", 0.35, 0.35, 0.08, 16, [bay.x - 0.35, 1.7, D / 2 + 2.6]); b.ico("#e39a95", 0.2, 1, [bay.x + 0.4, 1.82, D / 2 + 2.6]); b.ico("#c0a9cf", 0.18, 1, [bay.x + 0.1, 1.8, D / 2 + 2.75]); }
    if (bay.id === "piwakawaka") { b.box("#c0a9cf", [0.7, 0.06, 0.5], [bay.x - 0.2, 1.7, D / 2 + 2.6]); b.cyl("#d9cbb4", 0.02, 0.02, 0.9, 5, [bay.x - 0.1, 1.85, D / 2 + 2.6], [0, 0, 1.2]); }
    b.cyl(P.trunk, 0.05, 0.05, 1.0, 5, [bay.x + 0.7, 2.1, D / 2 + 3.5]);
    b.box(P.trunk, [0.7, 0.07, 0.07], [bay.x + 0.7, 2.6, D / 2 + 3.5]);
  }
  // wool bales stacked by the door
  for (let i = 0; i < 3; i++) b.box("#efe6d4", [1.0, 1.1, 0.9], [W * 0.43 + (i % 2) * 0.2, 1.35 + Math.floor(i / 2) * 1.1, D / 2 + 1.0 + (i === 1 ? 1.0 : 0)]);
  // ramp
  b.box(P.fence, [1.4, 0.14, 3.2], [W * 0.3, 0.45, D / 2 + 1.9], [-0.3, 0, 0]);
  const m = place(k, b, u, v, 0, { outline: 0 });
  if (m) m.castShadow = true;
  // yards on the east end
  const y = batch(k);
  const Y: [number, number, number, number] = [u + W / 2 + 1, u + W / 2 + 9, v - 3, v + 3];
  fenceRect(k, y, Y, false);
  fenceLine(k, y, [Y[0] + 4, Y[2]], [Y[0] + 4, Y[3]], 1.2);
  const ym = y.build();
  if (ym) { const me = mesh(k.mats, ym, "world", { outline: 0 }); me.castShadow = true; k.add(me); }
  return bays.map((bay) => ({ id: bay.id, job: bay.job, at: [u + bay.x + 0.7, v - (D / 2 + 3.5)] as UV }));
}

/** Tussock: a fountain of thin golden blades (the round-2 blob read as stones at play zoom). */
function tuss(k: Kit, b: GeoBatch, u: number, v: number, s = 1) {
  const y = k.ground(u, v);
  const cols = ["#d9c07e", "#c9a25a", "#e3cf9a"];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + k.rng();
    const tilt = 0.35 + k.rng() * 0.35;
    b.add(new THREE.ConeGeometry(0.07 * s, 1.0 * s, 3), cols[i % 3]!, mat([u + Math.cos(a) * 0.15 * s, y + 0.42 * s, -v + Math.sin(a) * 0.15 * s], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt]));
  }
}

// ---------------------------------------------------------------- grass detail (instanced)

function grassTufts(k: Kit, st: Stage, root: THREE.Group, N = 16000, NF = 1400, rv?: Reveal) {
  // the prototype drops the hidden blade caps (half the triangles)
  const blade = new THREE.ConeGeometry(0.05, 0.42, 3, 1, !!rv);
  const tuft = new GeoBatch(0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    tuft.add(blade.clone(), "#ffffff", mat([Math.cos(a) * 0.08, 0.18, Math.sin(a) * 0.08], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]));
  }
  const geo = tuft.build()!;
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), N);
  const c = new THREE.Color();
  const P = MISTY.palette;
  const m4 = new THREE.Matrix4();
  let n = 0;
  const rng = mulberry32(99);
  for (let t = 0; t < N * 3 && n < N; t++) {
    const u = -60 + rng() * 150, v = -18 + rng() * 34;
    const d = v - creekV(u);
    if (d > -2.4 || lineDist(u, v, ROAD) < 1.6) continue;
    let inPad = false, locked = false;
    for (const a of [AREAS.home, AREAS.flats, AREAS.rushy]) if (softRect(u, v, a.rect!, 0.2) > 0.5) { inPad = true; locked = !isOpen(a, st); }
    if (rv && softRect(u, v, AREAS.flats.rect!, 0.2) > 0.5) continue;
    if (!inPad && rng() < 0.5) continue;
    if (inPad && !locked && rng() < 0.45) continue;
    const s = locked ? 1.5 + rng() * 0.9 : 0.55 + rng() * 0.4;
    m4.compose(new THREE.Vector3(u, k.ground(u, v) - 0.02, -v), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6, 0)), new THREE.Vector3(s, s * (0.8 + rng() * 0.5), s));
    im.setMatrixAt(n, m4);
    c.set(locked ? "#a9a57a" : P.grass2).lerp(hex(locked ? "#8f9a6a" : "#7fb86a"), rng()).multiplyScalar(0.92 + rng() * 0.12);
    im.setColorAt(n, c);
    n++;
  }
  im.count = n;
  im.receiveShadow = true;
  root.add(im);
  if (rv) {
    // the creek flats get their own tufts: tall rank grass now, short lawn after the reveal
    const r2 = mulberry32(1234);
    const [u0, u1, v0, v1] = AREAS.flats.rect!;
    const nf = Math.round(N * 0.07);
    const tall = new THREE.InstancedMesh(geo, im.material, nf), short = new THREE.InstancedMesh(geo, im.material, nf);
    for (let i = 0; i < nf; i++) {
      const u = u0 + 0.4 + r2() * (u1 - u0 - 0.8), v = v0 + 0.4 + r2() * (v1 - v0 - 0.8);
      const s = 1.5 + r2() * 0.9, s2 = 0.55 + r2() * 0.4;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r2() * 6, 0));
      const at = new THREE.Vector3(u, k.ground(u, v) - 0.02, -v);
      m4.compose(at, q, new THREE.Vector3(s, s * (0.8 + r2() * 0.5), s));
      tall.setMatrixAt(i, m4);
      tall.setColorAt(i, c.set("#a9a57a").lerp(hex("#8f9a6a"), r2()).multiplyScalar(0.92 + r2() * 0.12));
      m4.compose(at, q, new THREE.Vector3(s2, s2 * (0.8 + r2() * 0.5), s2));
      short.setMatrixAt(i, m4);
      short.setColorAt(i, c.set(P.grass2).lerp(hex("#7fb86a"), r2()).multiplyScalar(0.92 + r2() * 0.12));
    }
    tall.receiveShadow = short.receiveShadow = true;
    short.visible = false;
    root.add(tall, short);
    rv.tallGrass = tall; rv.shortGrass = short;
  }
  // daisies and buttercups in the open paddocks
  const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.065, 0), new THREE.MeshBasicMaterial(), NF);
  let f = 0;
  for (let t = 0; t < 6000 && f < NF; t++) {
    const u = -60 + rng() * 150, v = -12 + rng() * 24;
    let ok = false;
    for (const a of [AREAS.home, AREAS.flats]) if (softRect(u, v, a.rect!, 0.2) > 0.5 && isOpen(a, st)) ok = true;
    if (!ok && !(Math.hypot(u + 44, v + 1) < 8)) continue;
    m4.makeTranslation(u, k.ground(u, v) + 0.18, -v);
    fl.setMatrixAt(f, m4);
    fl.setColorAt(f, c.set(rng() < 0.65 ? "#fbf8ef" : "#f1d36e"));
    f++;
  }
  fl.count = f;
  root.add(fl);
}

// ---------------------------------------------------------------- mist

let mistTex: THREE.Texture | null = null;
function mistTexture(): THREE.Texture {
  if (mistTex) return mistTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d")!;
  const r = mulberry32(7);
  for (let i = 0; i < 18; i++) {
    const rad = 34 + r() * 40;
    const x = 128 + (r() - 0.5) * (200 - rad * 2), y = 128 + (r() - 0.5) * (110 - rad);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, "rgba(255,255,255,0.34)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }
  mistTex = new THREE.CanvasTexture(cv);
  mistTex.colorSpace = THREE.SRGBColorSpace;
  return mistTex;
}
function mist(root: THREE.Group, x: number, y: number, z: number, w: number, h: number, opacity: number): THREE.Sprite {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture(), color: "#f4f7f6", transparent: true, opacity, depthWrite: false, fog: false }));
  m.position.set(x, y, z);
  m.scale.set(w, h, 1);
  m.renderOrder = 5;
  root.add(m);
  return m;
}

// ---------------------------------------------------------------- selection ring

function ringTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d")!;
  g.lineCap = "round";
  g.strokeStyle = "rgba(251,246,236,1)"; g.lineWidth = 30;
  g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "rgba(200,110,95,1)"; g.lineWidth = 6; g.setLineDash([14, 10]);
  g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- build

export interface FarmOpts {
  farmer?: boolean;
  backdrop?: boolean;
  /** Movement prototype: leave the sheep out (the prototype builds its own), cap grass, swing the home gate open,
   *  and split the creek flats into animatable pieces so opening the land can be played as a reveal. */
  noSheep?: boolean;
  grass?: number;
  flowers?: number;
  gateOpen?: number;
  reveal?: boolean;
  /** false = no mist at all (user, 2026-09-27: "no mist, or at least not always"). */
  mist?: boolean;
}

/** Colour data for blending the creek flats' ground from rank to lush. */
export interface RevealTerrain { attr?: THREE.BufferAttribute; idx: number[]; from: number[]; to: number[]; at: number[] }
/** The creek flats in pieces: what goes (mist, scrub, rank grass, broken fence, sign) and what comes. */
export interface Reveal {
  terrain: RevealTerrain;
  mist: THREE.Sprite[];
  scrub: THREE.Object3D[];
  broken: THREE.Object3D[];
  mended: THREE.Object3D[];
  sign: THREE.Object3D[];
  open: THREE.Object3D[];
  tallGrass?: THREE.InstancedMesh;
  shortGrass?: THREE.InstancedMesh;
}

export function buildFarm(st: Stage, opts: FarmOpts = {}): { farm: Farm; mats: Mats; reveal?: Reveal } {
  const mats = new Mats(MISTY);
  const rng = mulberry32(0x5eed ^ (st === "mid" ? 7 : 3));
  const root = new THREE.Group();
  const ground = (u: number, v: number) => Math.max(height(u, v), WATER - 0.3);
  const k: Kit = { dir: MISTY, mats, rng, ground, add: (o) => root.add(o) };
  const big: Kit = { ...k, add: (o) => { o.scale.multiplyScalar(1.7); o.traverse((c) => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true; }); root.add(o); } };
  const rv: Reveal | undefined = opts.reveal ? { terrain: { idx: [], from: [], to: [], at: [] }, mist: [], scrub: [], broken: [], mended: [], sign: [], open: [] } : undefined;
  /** Build into a batch of its own and keep the mesh (for pieces the reveal animates). */
  const piece = (list: THREE.Object3D[], fill: (b: GeoBatch) => void, cast = true) => {
    const b = batch(k);
    fill(b);
    const g = b.build();
    if (!g) return;
    const m = mesh(mats, g, "world", { outline: 0 });
    m.castShadow = cast;
    root.add(m);
    list.push(m);
  };
  for (const o of terrain(st, mats, rng, rv?.terrain)) root.add(o);
  if (opts.backdrop) backdrop(root, mats);

  // buildings
  homestead(big, -44, 1, -0.1);
  const stations = woolshed(k, 6, 1.5);
  // fences
  const fb = batch(k);
  const gateAt = AREAS.home.rect![1];
  for (const id of ["home", "flats", "rushy", "high"] as AreaId[]) {
    const a = AREAS[id];
    if (rv && id === "flats") { piece(rv.broken, (b) => fenceRect(k, b, a.rect!, true)); continue; }
    fenceRect(k, fb, a.rect!, !isOpen(a, st), id === "home" ? -4 : undefined);
  }
  if (rv) {
    // the mended creek-flats fence, post by post, with a gate gap on the woolshed (west) side
    const [u0, u1, v0, v1] = AREAS.flats.rect!;
    const runs: [UV, UV][] = [[[u0, FLATS_GATE + 1.8], [u0, v1]], [[u0, v1], [u1, v1]], [[u1, v1], [u1, v0]], [[u1, v0], [u0, v0]], [[u0, v0], [u0, FLATS_GATE - 1.8]]];
    for (const [a, c] of runs) {
      const n = Math.max(1, Math.round(Math.hypot(c[0] - a[0], c[1] - a[1]) / 2.3));
      for (let i = 0; i < n; i++) {
        const p0: UV = [lerp(a[0], c[0], i / n), lerp(a[1], c[1], i / n)], p1: UV = [lerp(a[0], c[0], (i + 1) / n), lerp(a[1], c[1], (i + 1) / n)];
        piece(rv.mended, (b) => fenceLine(k, b, p0, p1, 3));
      }
    }
    for (const m of rv.mended) m.visible = false;
    gate({ ...k, add: (o) => { root.add(o); rv.open.push(o); } }, u0, FLATS_GATE, 1.35, Math.PI / 2);
  }
  // homestead garden fence
  fenceLine(k, fb, [-52, -7], [-36, -7], 2.0);
  const fg = fb.build();
  if (fg) { const fm = mesh(mats, fg, "world", { outline: 0 }); fm.castShadow = true; root.add(fm); }
  // gates: home paddock to the road; creek flats gate faces the woolshed
  gate(k, -6, -4, opts.gateOpen ?? 0, Math.PI / 2);
  const gateUV: UV = [AREAS.flats.rect![0], 0];
  void gateAt;

  // locked land detail + sign + mist; open land troughs
  const pb = batch(k);
  for (const id of ["home", "flats", "rushy", "high"] as AreaId[]) {
    const a = AREAS[id];
    const [u0, u1, v0, v1] = a.rect!;
    const pick = (m: number): UV => [lerp(u0 + m, u1 - m, rng()), lerp(v0 + m, v1 - m, rng())];
    if (rv && id === "flats") {
      // the same locked dressing as below, but each clump its own mesh so the reveal can clear them one by one
      const area = (u1 - u0) * (v1 - v0);
      const n = Math.round(area / 9);
      for (let i = 0; i < n; i++) { const p = pick(0.8); piece(rv.scrub, (b) => scrub(k, b, p[0], p[1], 0.8 + rng() * 0.5)); }
      const signKit: Kit = { ...k, add: (o) => { root.add(o); rv.sign.push(o); } };
      sign(signKit, u0 + 3, v0 - 0.8, "OLD FENCES", "needs mending");
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, y = ground(cu, cv);
      if (opts.mist !== false) {
        rv.mist.push(mist(root, cu, y + 2.2, -cv, (u1 - u0) * 1.2, 6, 0.8));
        rv.mist.push(mist(root, cu + (u1 - u0) * 0.2, y + 1.2, -(cv - (v1 - v0) * 0.25), (u1 - u0) * 0.9, 4, 0.6));
        rv.mist.push(mist(root, cu - (u1 - u0) * 0.25, y + 1.4, -(cv + (v1 - v0) * 0.25), (u1 - u0) * 0.8, 4, 0.55));
      }
      piece(rv.open, (b) => { trough(k, b, u0 + 2.5, v1 - 2.2); bale(k, b, u1 - 3, v1 - 2.5); bale(k, b, u1 - 5, v0 + 3); });
      for (const m of rv.open) m.visible = false;
      continue;
    }
    if (!isOpen(a, st)) {
      const area = (u1 - u0) * (v1 - v0);
      const n = Math.round(area / (a.wet ? 12 : a.tussock ? 14 : 9));
      for (let i = 0; i < n; i++) {
        const p = pick(0.8);
        if (a.wet && rng() < 0.6) rushes(k, pb, p[0], p[1]);
        else if (a.tussock && rng() < 0.7) tuss(k, pb, p[0], p[1], 1.3);
        else scrub(k, pb, p[0], p[1], 0.8 + rng() * 0.5);
      }
      if (a.wet) for (let i = 0; i < 5; i++) { const p = pick(1.5); pool(k, p[0], p[1], 0.9 + rng() * 0.8); }
      const words: Record<string, [string, string]> = { mend: ["OLD FENCES", "needs mending"], drain: ["BOGGY", "drain blocked"], lease: ["FOR LEASE", "see Sheryl"] };
      const [w1, w2] = words[a.how!]!;
      sign(k, u0 + 3, v0 - 0.8, w1, w2);
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, y = ground(cu, cv);
      // mist hangs over locked land only
      if (opts.mist !== false) mist(root, cu, y + 2.2, -cv, (u1 - u0) * 1.2, 6, 0.8);
      if (opts.mist !== false) mist(root, cu + (u1 - u0) * 0.2, y + 1.2, -(cv - (v1 - v0) * 0.25), (u1 - u0) * 0.9, 4, 0.6);
      if (opts.mist !== false) mist(root, cu - (u1 - u0) * 0.25, y + 1.4, -(cv + (v1 - v0) * 0.25), (u1 - u0) * 0.8, 4, 0.55);
    } else {
      trough(k, pb, u0 + 2.5, v1 - 2.2);
      bale(k, pb, u1 - 3, v1 - 2.5);
    }
  }
  const pg = pb.build();
  if (pg) { const pm = mesh(mats, pg, "world", { outline: 0 }); pm.castShadow = true; root.add(pm); }

  // trees: shelter and natives around the homestead, the road and the creek
  const trees: [string, number, number, number][] = [
    ["kowhai", -36, 6, 1.5], ["cabbage", -50, 7, 1.4], ["kowhai", -54, -2, 1.3], ["pohutukawa", -33, -13, 1.2],
    ["cabbage", -4, 7, 1.3], ["kowhai", 16, 8, 1.3], ["cabbage", 47, -11, 1.3], ["flax", -8, -11, 1.3], ["flax", 18, -11, 1.3],
    ["kowhai", -26, 12.5, 1.3], ["flax", -12, 12, 1.2], ["flax", 8, 12, 1.2], ["cabbage", 10, 11.5, 1.3], ["flax", 30, 12, 1.2],
    ["pohutukawa", -64, 4, 1.3], ["cabbage", 72, -11, 1.3], ["flax", 48, 11, 1.2],
  ];
  for (const [kind, u, v, s] of trees) {
    if (kind === "kowhai") kowhaiTree(k, u, v, s);
    else if (kind === "cabbage") cabbageTree(k, u, v, s);
    else if (kind === "pohutukawa") pohutukawa(k, u, v, s);
    else flax(k, u, v, s);
  }
  // macrocarpa shelter belt behind the homestead
  const gb = batch(k);
  for (let u = -70; u < -34; u += 2.6) {
    const y = ground(u, 10);
    gb.cyl(MISTY.palette.trunk, 0.25, 0.35, 2, 6, [u, y + 1, -10 - (u % 2)]);
    for (let i = 0; i < 3; i++) gb.ico(i % 2 ? "#4e7a5a" : "#5c8a64", (1.7 - i * 0.3), 2, [u + (rng() - 0.5) * 0.5, y + 2.6 + i * 1.3, -10.5 + (rng() - 0.5)], [1, 0.8, 1]);
  }
  // native bush
  const step = 2.6;
  for (let u = -60; u < 150; u += step) for (let v = -12; v < 70; v += step) {
    const pu = u + (rng() - 0.5) * step * 0.8, pv = v + (rng() - 0.5) * step * 0.8;
    const s = bushScore(pu, pv);
    if (s <= BUSH_AT[st]) continue;
    const d = pv - creekV(pu);
    if (Math.abs(d) < 2.6 || lineDist(pu, pv, ROAD) < 3) continue;
    let skip = false;
    for (const a of [AREAS.flats, AREAS.rushy, AREAS.high]) if (softRect(pu, pv, a.rect!, 0.5) > 0.01) skip = true;
    if (skip) continue;
    const young = st === "mid" && s <= BUSH_AT.early;
    if (young) {
      if (rng() < 0.5) { if (rng() < 0.5) kowhaiTree(k, pu, pv, 0.7); else flax(k, pu, pv, 1); gb.cyl("#f3eee4", 0.22, 0.22, 0.8, 8, [pu + 0.9, ground(pu, pv) + 0.4, -pv - 0.4]); }
      continue;
    }
    const r = rng();
    if (r < 0.46) bushClump(k, pu, pv, 1.3 + rng() * 0.6);
    else if (r < 0.74) ponga(k, pu, pv, 1.2 + rng() * 0.4);
    else if (r < 0.88) kowhaiTree(k, pu, pv, 1.3);
    else cabbageTree(k, pu, pv, 1.3);
  }
  // tussock on the open slopes
  for (let i = 0; i < 700; i++) {
    const u = -70 + rng() * 200, v = 18 + rng() * 45;
    const h = height(u, v);
    if (h < 3 || h > 19 || bushScore(u, v) > BUSH_AT[st]) continue;
    if (softRect(u, v, AREAS.high.rect!, 0.5) > 0.01) continue;
    tuss(k, gb, u, v, 1.1 + rng() * 0.6);
  }
  const gg = gb.build();
  if (gg) { const gm = mesh(mats, gg, "world", { outline: 0 }); gm.castShadow = true; root.add(gm); }
  // bridge stumps (no bridge yet): the way to the high run
  const bb = batch(k);
  for (const z of [-3.3, 3.3]) bb.box(MISTY.palette.soil, [2.4, 0.5, 0.7], [0, 0.3, z]);
  bb.box("#b7a893", [0.2, 1.4, 0.2], [-0.8, 0.4, -2.4], [0.3, 0, 0.2]);
  place(k, bb, -4, creekV(-4), 0, { y: 0.1, outline: 0 });

  grassTufts(k, st, root, opts.grass, opts.flowers, rv);

  // far mist: along the tops and down the valley ends (distance and edges only)
  if (opts.mist !== false) for (let u = -120; u <= 170; u += 22) mist(root, u, 24 + 3 * Math.sin(u * 0.1), -(70 + 6 * Math.sin(u * 0.07)), 48, 12, 0.85);
  if (opts.mist !== false) for (let u = -100; u <= 150; u += 18) mist(root, u, 12, -(46 + 4 * Math.sin(u * 0.13)), 34, 8, 0.55);
  // clouds
  for (const [u, v, y, s] of [[-40, 60, 30, 1.6], [20, 80, 36, 1.3], [80, 55, 28, 1.1], [130, 75, 34, 1.4]] as const) {
    const b = batch(k);
    for (let i = 0; i < 5; i++) blob(k, b, "#ffffff", (1.4 - Math.abs(i - 2) * 0.25) * s * 2, [(i - 2) * 2.2 * s, 0, rng() - 0.5], [1, 0.7, 0.9]);
    place(k, b, u, v, 0.3, { y, outline: 0 });
  }

  // sheep
  const sheep = new Map<string, THREE.Group>();
  const flock = st === "mid" ? [...HOME_FLOCK, ...FLATS_FLOCK] : HOME_FLOCK;
  for (const s of opts.noSheep ? [] : flock) {
    const g = buildSheep2(mats, s, 1.25, { friendly: true });
    g.position.set(s.at[0], ground(s.at[0], s.at[1]), -s.at[1]);
    g.rotation.y = s.rot;
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    root.add(g);
    sheep.set(s.name, g);
  }

  // birds: at the stations, and visitors in the bush edge
  const birds = new Map<string, THREE.Group>();
  for (const s of stations) {
    const g = buildBird(mats, s.id, 1);
    g.position.set(s.at[0], ground(6, 1.5) + 2.64, -s.at[1]);
    g.rotation.y = s.id === "kaka" ? 0.5 : s.id === "tui" ? -0.4 : 0.2;
    root.add(g);
    birds.set(s.id, g);
  }
  for (const [id, u, v, y, r] of [["tui", 81, -4, 3.3, -0.6], ["piwakawaka", 78, -7.5, 1.6, 0.8], ["kaka", 90, -2, 4.2, 0.3]] as const) {
    const g = buildBird(mats, id, 1);
    g.position.set(u, ground(u, v) + y, -v);
    g.rotation.y = r;
    root.add(g);
    birds.set(`bush-${id}`, g);
  }

  // farmer
  const farmer = buildFarmer(mats);
  farmer.visible = !!opts.farmer;
  root.add(farmer);

  // selection ring
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false }));
  ring.visible = false;
  ring.renderOrder = 2;
  root.add(ring);

  root.updateMatrixWorld(true);
  const farm: Farm = {
    root, ground, sheep, birds, farmer, stations, gate: gateUV,
    at: (u, v, dy = 0) => new THREE.Vector3(u, ground(u, v) + dy, -v),
    setFarmer(u, v, rot, visible = true) {
      farmer.position.set(u, ground(u, v), -v);
      farmer.rotation.y = rot;
      farmer.visible = visible;
      farmer.updateMatrixWorld(true);
    },
    select(name) {
      const g = name ? sheep.get(name) : undefined;
      ring.visible = !!g;
      if (g) { ring.position.set(g.position.x + Math.cos(-g.rotation.y) * 0.1, g.position.y + 0.22, g.position.z + Math.sin(-g.rotation.y) * 0.1); ring.updateMatrixWorld(); }
    },
  };
  void hashString;
  return { farm, mats, ...(rv ? { reveal: rv } : {}) };
}
