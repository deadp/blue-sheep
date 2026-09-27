// Style lab round 2: builds one map concept at one stage in the Misty Pastoral look.
// Mist lives only at the rim, over the far tops and over locked land, never over farmed
// paddocks, so fleece colours stay true (DESIGN-v3 §15 item 20 watch-out).
import * as THREE from "three";
import type { ColourInput } from "@blue-sheep/genetics";
import { GeoBatch, mat, type V3 } from "../../world3d/builder.js";
import { mulberry32, type Rng } from "../../world3d/rng.js";
import { mesh, type Mats } from "../render.js";
import type { LabSheep } from "../sheep.js";
import type { Direction } from "../styles.js";
import {
  batch, blob, bridge, bushClump, cabbageTree, CENTRE, fenceLine, flax, hex, homestead, kowhaiTree, lerp, place,
  pohutukawa, ponga, rhoOf, showground, smoothstep as ss, tussock, woolshed, type Kit,
} from "../valley.js";
import { lineDist } from "./concepts.js";
import { buildSheep2 } from "./sheep2.js";
import { BUSH_AT, type Concept, type Stage, type UV, type Zone } from "./types.js";

const RAD = { u: 50, v: 36 };
function edge(theta: number): number {
  return 1 + 0.05 * Math.sin(theta * 3 + 0.7) + 0.035 * Math.sin(theta * 7 + 2.1) + 0.02 * Math.sin(theta * 13);
}

export function inPoly(u: number, v: number, poly: UV[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function centroid(poly: UV[]): UV {
  let u = 0, v = 0;
  for (const p of poly) { u += p[0]; v += p[1]; }
  return [u / poly.length, v / poly.length];
}
/** Distance from a point to a polygon's boundary (positive inside). */
function polyInset(u: number, v: number, poly: UV[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, lineDist(u, v, [poly[i]!, poly[(i + 1) % poly.length]!]));
  return inPoly(u, v, poly) ? d : -d;
}

const col = (red: number, yellow: number, blue: number, dilute = false, white = false): ColourInput => ({ white, red, yellow, blue, dilute, depth: 1 });
/** The v3 flock palette: pastel pink, true blue, olive, lilac, white, plus founders. */
export const FLOCK_COLOURS: ColourInput[] = [
  col(4, 0, 0, true), col(0, 0, 0, false, true), col(0, 0, 4), col(1, 3, 2), col(3, 0, 3, true), col(0, 0, 0, false, true),
  col(0, 0, 0), col(2, 0, 2, true), col(0, 0, 0, false, true), col(0, 2, 1, true), col(4, 0, 0, true), col(0, 1, 3),
];

export interface MapWorld {
  root: THREE.Group;
  ground(u: number, v: number): number;
  toWorld(u: number, v: number, y?: number): THREE.Vector3;
}

// ---------------------------------------------------------------- ground

/** Bush score with an organic, lobed edge. */
export function bushScore(c: Concept, u: number, v: number): number {
  const s = c.bush(u, v);
  if (s <= 0.02) return s;
  return s + 0.11 * Math.sin(u * 0.43 + v * 0.31) * Math.sin(v * 0.52 - u * 0.17) + 0.05 * Math.sin(u * 1.1 + v * 0.9);
}

function zoneAt(c: Concept, u: number, v: number): Zone | null {
  for (const z of c.zones) if (inPoly(u, v, z.poly)) return z;
  return null;
}

function groundColour(dir: Direction, c: Concept, stage: Stage, u: number, v: number, h: number, slope: number, rng: Rng): THREE.Color {
  const P = dir.palette;
  const blot = Math.sin(u * 0.31 + Math.cos(v * 0.23) * 2) * Math.cos(v * 0.27 - u * 0.05);
  const fine = Math.sin(u * 1.7 + v * 0.9) * Math.sin(v * 1.3 - u * 0.6);
  const out = hex(P.grass).lerp(hex(P.hill), 0.35 + 0.25 * blot);
  out.lerp(hex(P.tussock), c.tussock(u, v, h));
  const z = zoneAt(c, u, v);
  if (z) {
    const inset = polyInset(u, v, z.poly);
    const w = ss(-0.6, 0.6, inset);
    if (z.stage <= stage) {
      const lush = hex(P.grass2).lerp(hex(P.grass), 0.15 + 0.2 * blot);
      if (z.tussock) lush.lerp(hex(P.tussock), 0.45);
      // mown stripes: a little farmed texture
      lush.multiplyScalar(1 + 0.025 * Math.sin((u + v) * 1.1));
      out.lerp(lush, w);
    } else {
      // rank, overgrown and a bit faded: dry olive with darker scrub mottling
      const rank = hex("#bdb58c").lerp(hex("#9aa27a"), 0.5 + 0.4 * blot);
      if (z.wet) rank.lerp(hex("#8f9c74"), 0.6);
      rank.lerp(hex("#8c8f68"), Math.max(0, fine) * 0.35);
      out.lerp(rank, w * 0.85);
    }
  }
  const b = bushScore(c, u, v);
  if (b > BUSH_AT[stage] - 0.04) out.lerp(hex(P.bush), 0.5 * ss(BUSH_AT[stage] - 0.04, BUSH_AT[stage] + 0.1, b));
  if (c.marsh) out.lerp(hex("#a7b07c"), 0.7 * ss(0.2, 0.6, c.marsh(u, v)));
  if (slope > 0.75) out.lerp(hex(P.rock), ss(0.75, 1.5, slope) * 0.6);
  if (h > c.snowLine + 0.8 * Math.sin(u * 0.3)) out.copy(hex(P.snow)).lerp(hex(P.rock), slope > 1.3 ? 0.3 : 0);
  if (c.sea && h < c.water + 0.75) out.lerp(hex("#eee0bb"), ss(c.water + 0.75, c.water + 0.3, h));
  else if (h < c.water + 0.35) out.lerp(hex(P.soil), 0.6);
  for (const r of c.roads) {
    if (r.stage > stage) continue;
    const d = lineDist(u, v, r.pts);
    const wdt = r.track ? 0.6 : 1.1;
    if (d < wdt && h > c.water + 0.1) out.lerp(hex(P.road), r.track ? 0.75 : 1);
  }
  const sg = Math.hypot(u - c.showground.u, v - c.showground.v);
  if (sg < 6.5) out.lerp(hex(P.grass2), 0.5);
  out.multiplyScalar(0.99 + rng() * 0.02);
  return out;
}

function terrain(dir: Direction, mats: Mats, c: Concept, stage: Stage, rng: Rng, reach = 1): THREE.Object3D[] {
  const P = dir.palette;
  const NR = 70, NT = 260;
  const pos: number[] = [], colr: number[] = [], wpos: number[] = [], wcol: number[] = [], idx: number[] = [];
  const bg = hex(P.bg);
  const heights: number[] = [];
  const shallow = hex(c.sea ? "#a8dcdc" : P.water), deep = hex(c.sea ? "#5f9fc4" : "#7db4cc");
  for (let i = 0; i <= NR; i++) {
    for (let j = 0; j < NT; j++) {
      const rho = i / NR;
      const th = (j / NT) * Math.PI * 2;
      const e = edge(th) * rho * reach;
      const u = CENTRE.u + Math.cos(th) * e * RAD.u, v = CENTRE.v + Math.sin(th) * e * RAD.v;
      let h = c.height(u, v);
      const slope = Math.hypot(c.height(u + 0.5, v) - h, c.height(u, v + 0.5) - h) * 2;
      const cc = groundColour(dir, c, stage, u, v, h, slope, rng);
      const fade = ss(0.88, 1.0, rho);
      cc.lerp(bg, fade * 0.85);
      h = lerp(h, Math.min(h, 1.2), ss(0.9, 1.0, rho) * 0.4);
      heights.push(h);
      pos.push(u, h, -v);
      colr.push(cc.r, cc.g, cc.b);
      const wc = shallow.clone().lerp(deep, ss(0, 1.6, c.water - h)).lerp(bg, fade * 0.85);
      wpos.push(u, c.water, -v);
      wcol.push(wc.r, wc.g, wc.b);
    }
  }
  const widx: number[] = [];
  for (let i = 0; i < NR; i++) {
    for (let j = 0; j < NT; j++) {
      const a = i * NT + j, b = i * NT + ((j + 1) % NT), q = (i + 1) * NT + j, d = (i + 1) * NT + ((j + 1) % NT);
      idx.push(a, q, b, b, q, d);
      for (const tri of [[a, q, b], [b, q, d]] as const) {
        if (Math.min(heights[tri[0]]!, heights[tri[1]]!, heights[tri[2]]!) < c.water + 0.05) widx.push(...tri);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const t = new THREE.Mesh(geo, mats.surface("terrain"));
  t.receiveShadow = true;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(wpos, 3));
  wg.setAttribute("color", new THREE.Float32BufferAttribute(wcol, 3));
  wg.setIndex(widx);
  wg.computeVertexNormals();
  const w = new THREE.Mesh(wg, mats.surface("water"));
  w.receiveShadow = true;
  return [t, w];
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
    if (k.rng() < 0.18) { prev = null; continue; }
    const y = k.ground(u, v);
    const lean: V3 = [(k.rng() - 0.5) * 0.5, 0, (k.rng() - 0.5) * 0.5];
    b.box(grey, [0.16, 0.9, 0.16], [u, y + 0.42, -v], lean);
    const p = new THREE.Vector3(u, y, -v);
    if (prev && k.rng() < 0.45) {
      const mid = prev.clone().add(p).multiplyScalar(0.5);
      const d = p.clone().sub(prev);
      const L = d.length();
      b.box(grey, [L, 0.07, 0.06], [mid.x, mid.y + 0.4 + k.rng() * 0.3, mid.z], [0, -Math.atan2(d.z, d.x), (k.rng() - 0.5) * 0.3]);
    }
    prev = p;
  }
}

function fencePoly(k: Kit, b: GeoBatch, poly: UV[], broken: boolean) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, c = poly[(i + 1) % poly.length]!;
    if (broken) brokenFence(k, b, a, c);
    else fenceLine(k, b, a, c, 2.4);
  }
}

function signTexture(text: string, sub: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 128;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#fbf4e6"; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = "#d77a6c"; g.lineWidth = 10; g.strokeRect(8, 8, 240, 112);
  g.fillStyle = "#c2574a"; g.font = "800 44px Nunito, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 128, 56);
  g.fillStyle = "#7a6660"; g.font = "600 22px Nunito, sans-serif";
  g.fillText(sub, 128, 96);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const SIGN_WORD: Record<string, [string, string]> = {
  lease: ["FOR LEASE", "enquire at the store"], buy: ["FOR SALE", "see Sheryl"], mend: ["OLD FENCES", "needs mending"],
  drain: ["BOGGY", "drain blocked"], bridge: ["NO BRIDGE", "yet"], home: ["", ""],
};

function sign(k: Kit, u: number, v: number, how: string) {
  const y = k.ground(u, v);
  const b = batch(k);
  b.box(k.dir.palette.trunk, [0.18, 2.2, 0.18], [-0.9, 1.1, 0]);
  b.box(k.dir.palette.trunk, [0.18, 2.2, 0.18], [0.9, 1.1, 0]);
  place(k, b, u, v, 0);
  const [w1, w2] = SIGN_WORD[how] ?? ["", ""];
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: signTexture(w1, w2), roughness: 0.9, side: THREE.DoubleSide }));
  board.position.set(u, y + 1.85, -v + 0.12);
  board.castShadow = true;
  k.add(board);
}

function scrub(k: Kit, b: GeoBatch, u: number, v: number, s: number) {
  const y = k.ground(u, v);
  const gorse = k.rng() < 0.55;
  const base = gorse ? "#6f7f4c" : "#9b7f55"; // gorse or bracken
  for (let i = 0; i < 3; i++) {
    const r = (0.55 + k.rng() * 0.35) * s;
    b.ico(base, r, 1, [u + (k.rng() - 0.5) * 1.2 * s, y + r * 0.7, -v + (k.rng() - 0.5) * 1.2 * s], [1, 0.8, 1]);
  }
  if (gorse) for (let i = 0; i < 5; i++) b.ico("#e6c65a", 0.13 * s, 0, [u + (k.rng() - 0.5) * 1.4 * s, y + 0.7 * s + k.rng() * 0.3, -v + (k.rng() - 0.5) * 1.4 * s]);
}

function rushes(k: Kit, b: GeoBatch, u: number, v: number) {
  const y = k.ground(u, v);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.add(new THREE.ConeGeometry(0.06, 1.1, 3), i % 2 ? "#7d8a4f" : "#96905a", mat([u + Math.cos(a) * 0.2, y + 0.5, -v + Math.sin(a) * 0.2], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]));
  }
  b.cyl("#7b5a3f", 0.05, 0.05, 0.3, 5, [u, y + 1.1, -v]);
}

function pool(k: Kit, u: number, v: number, r: number) {
  const g = new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2);
  g.scale(1.4, 1, 1);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: "#a9c9cf", roughness: 0.3 }));
  m.position.set(u, k.ground(u, v) + 0.06, -v);
  m.receiveShadow = true;
  k.add(m);
}

function macrocarpa(k: Kit, b: GeoBatch, u: number, v: number, s = 1) {
  const y = k.ground(u, v);
  b.cyl(k.dir.palette.trunk, 0.2 * s, 0.28 * s, 1.6 * s, 6, [u, y + 0.8 * s, -v]);
  for (let i = 0; i < 3; i++) b.ico(i % 2 ? "#4e7a5a" : "#5c8a64", (1.3 - i * 0.25) * s, 2, [u + (k.rng() - 0.5) * 0.4, y + (2 + i * 1.0) * s, -v + (k.rng() - 0.5) * 0.4], [1, 0.8, 1]);
}

function hedge(k: Kit, b: GeoBatch, pts: UV[]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, c = pts[i + 1]!;
    const n = Math.max(1, Math.round(Math.hypot(c[0] - a[0], c[1] - a[1]) / 2.2));
    for (let j = 0; j <= n; j++) {
      if (k.rng() < 0.3) continue;
      const t = j / n;
      macrocarpa(k, b, lerp(a[0], c[0], t) + (k.rng() - 0.5) * 0.3, lerp(a[1], c[1], t), 0.5 + k.rng() * 0.2);
    }
  }
}

function hut(k: Kit, u: number, v: number) {
  const P = k.dir.palette, b = batch(k);
  b.box("#e9dcc6", [3, 1.8, 2.2], [0, 0.9, 0]);
  b.gable(P.roofIron, 3.4, 2.6, 1.1, [0, 1.8, 0]);
  b.box("#a7998a", [0.6, 2.2, 0.6], [1.2, 2.0, -0.4]);
  b.box(P.roofRed, [0.6, 1.1, 0.05], [-0.5, 0.6, 1.12]);
  b.box(P.trim, [0.5, 0.5, 0.05], [0.6, 1.1, 1.12]);
  b.box(P.fence, [3.6, 0.12, 1], [0, 0.1, 1.6]);
  place(k, b, u, v, 0.2);
}

function jetty(k: Kit, u: number, v: number, rot: number) {
  const P = k.dir.palette, b = batch(k);
  const len = 9;
  b.box(P.fence, [len, 0.18, 1.5], [len / 2, 0.75, 0]);
  for (let x = 0.5; x <= len; x += 2) for (const z of [-0.7, 0.7]) b.cyl(P.trunk, 0.12, 0.12, 2.6, 6, [x, -0.4, z]);
  // the trader's little boat
  b.box("#f4ede0", [3.6, 0.8, 1.6], [len - 1, 0.35, 2.0]);
  b.box("#d98b7c", [3.7, 0.2, 1.7], [len - 1, 0.05, 2.0]);
  b.box("#9bb6c9", [1.4, 0.9, 1.1], [len - 1.4, 1.1, 2.0]);
  b.cyl(P.trunk, 0.06, 0.06, 2.6, 5, [len - 0.2, 1.8, 2.0]);
  b.box(P.kowhai, [0.8, 0.45, 0.03], [len + 0.2, 2.8, 2.0]);
  place(k, b, u, v, rot, { y: 0 });
}

/** Chunky birds at the woolshed stations: kākā (carding), tūī (spinning), pīwakawaka (knitting). */
function stations(k: Kit, u: number, v: number) {
  const P = k.dir.palette, b = batch(k);
  // a verandah of three station bays along the woolshed front
  b.box(P.roofRed, [7.4, 0.14, 2.4], [0, 2.4, 3.2], [0.14, 0, 0]);
  for (const x of [-3.6, -1.2, 1.2, 3.6]) b.cyl(P.trunk, 0.08, 0.08, 2.3, 5, [x, 1.15, 4.2]);
  const bays: [string, string, string][] = [["#e7d3a8", "#7b6a3e", "#e2803a"], ["#d9c6e0", "#2f4450", "#ffffff"], ["#bcd8c0", "#8b735e", "#f2e5cf"]];
  bays.forEach(([mat0, body, accent], i) => {
    const x = -2.4 + i * 2.4;
    b.box(mat0, [1.6, 0.9, 1.2], [x, 0.45, 3.4]); // bench
    b.cyl(P.trunk, 0.05, 0.05, 1.3, 5, [x + 0.6, 1.5, 3.9]); // perch
    const by = 2.35;
    b.ico(body, 0.34, 2, [x + 0.6, by, 3.9], [1, 1.1, 0.95]);
    b.ico(body, 0.22, 2, [x + 0.75, by + 0.38, 4.05]);
    b.ico(accent, i === 1 ? 0.09 : 0.16, 1, [x + 0.8, by + (i === 1 ? 0.18 : -0.05), 4.18]);
    if (i === 2) b.add(new THREE.CircleGeometry(0.45, 10, 0, Math.PI).rotateX(-Math.PI / 2.4), accent, mat([x + 0.3, by + 0.1, 3.8], [0, 0, 0.6]));
    b.ico("#1d1614", 0.05, 0, [x + 0.86, by + 0.45, 4.22]);
  });
  place(k, b, u, v, 0.05);
}

/** Planting guards around young trees: the bush edge growing. */
function guard(k: Kit, b: GeoBatch, u: number, v: number) {
  const y = k.ground(u, v);
  b.cyl("#f3eee4", 0.22, 0.22, 0.8, 8, [u, y + 0.4, -v]);
}

// ---------------------------------------------------------------- mist

let mistTex: THREE.Texture | null = null;
function mistTexture(): THREE.Texture {
  if (mistTex) return mistTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d")!;
  const r = mulberry32(7);
  for (let i = 0; i < 16; i++) {
    const rad = 34 + r() * 40;
    const x = 128 + (r() - 0.5) * (200 - rad * 2), y = 128 + (r() - 0.5) * (110 - rad);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, "rgba(255,255,255,0.32)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }
  mistTex = new THREE.CanvasTexture(cv);
  mistTex.colorSpace = THREE.SRGBColorSpace;
  return mistTex;
}

function mist(k: Kit, u: number, v: number, y: number, w: number, h: number, opacity: number) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture(), color: "#f4f7f6", transparent: true, opacity, depthWrite: false }));
  m.position.set(u, y, -v);
  m.scale.set(w, h, 1);
  m.renderOrder = 5;
  k.add(m);
}

// ---------------------------------------------------------------- build

export interface MapOpts {
  sheepScale?: number;
  /** Close-up framing (fewer rim mists). */
  close?: boolean;
}

export function buildMap(dir: Direction, mats: Mats, c: Concept, stage: Stage, opts: MapOpts = {}): MapWorld {
  const rng = mulberry32(0xbeef ^ c.id.charCodeAt(0));
  const root = new THREE.Group();
  root.rotation.y = Math.PI / 4;
  const ground = (u: number, v: number) => Math.max(c.height(u, v), c.water - 0.3);
  const k: Kit = { dir, mats, rng, ground, add: (o) => root.add(o) };
  for (const o of terrain(dir, mats, c, stage, rng, opts.close ? 1.35 : 1)) root.add(o);

  const nearRoad = (u: number, v: number, m = 2.2) => c.roads.some((r) => r.stage <= stage && lineDist(u, v, r.pts) < m);
  const inZone = (u: number, v: number) => c.zones.some((z) => polyInset(u, v, z.poly) > -1.4);
  const nearSpot = (u: number, v: number) =>
    [c.homestead, c.woolshed, c.showground, ...(c.hut ? [c.hut] : [])].some((p) => Math.hypot(u - p.u, v - p.v) < 7.5);

  // buildings
  homestead(k, c.homestead.u, c.homestead.v, c.homestead.rot ?? -0.15);
  woolshed(k, c.woolshed.u, c.woolshed.v, true);
  if (stage === 2) stations(k, c.woolshed.u, c.woolshed.v);
  if (stage >= 1) showground(k, c.showground.u, c.showground.v, stage === 2);
  else {
    // just the gate and a signpost at the start
    const b = batch(k);
    b.box(k.dir.palette.trunk, [0.16, 2.2, 0.16], [0, 1.1, 0]);
    b.box(k.dir.palette.wall, [1.8, 0.5, 0.08], [0.7, 1.9, 0], [0, 0, 0.05]);
    place(k, b, c.showground.u - 4, c.showground.v + 3, 0.3);
  }
  if (c.bridge) {
    if (stage >= c.bridge.stage) bridge(k, c.bridge.u, c.bridge.v, c.bridge.rot, 0);
    else {
      const b = batch(k);
      for (const z of [-3, 3]) b.box(k.dir.palette.soil, [2.4, 0.5, 0.6], [0, 0.3, z]);
      b.box("#b7a893", [0.2, 1.4, 0.2], [-0.8, 0.4, -1.4], [0.3, 0, 0.2]);
      b.box("#b7a893", [0.2, 1.4, 0.2], [0.9, 0.3, 1.1], [-0.2, 0, -0.3]);
      place(k, b, c.bridge.u, c.bridge.v, c.bridge.rot, { y: 0 });
    }
  }
  if (c.hut && stage >= c.hut.stage) hut(k, c.hut.u, c.hut.v);
  if (c.jetty) jetty(k, c.jetty.u, c.jetty.v, c.jetty.rot);

  // fences: open paddocks tidy, locked ones old and broken
  const fb = batch(k);
  for (const z of c.zones) {
    fencePoly(k, fb, z.poly, z.stage > stage);
    if (z.stage <= stage && z.contours) {
      const us = z.poly.map((p) => p[0]);
      for (const cv of z.contours) fenceLine(k, fb, [Math.min(...us), cv], [Math.max(...us), cv], 2.4);
    }
    if (z.stage <= stage && z.wet) {
      // the cleared drain: a straight little channel along the paddock's low edge
      const us = z.poly.map((p) => p[0]), vs = z.poly.map((p) => p[1]);
      const u0 = Math.min(...us), u1 = Math.max(...us), dv = Math.max(...vs) - 0.9;
      const g = new THREE.BoxGeometry(u1 - u0 - 1, 0.08, 0.55);
      const d = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: "#9cc9d9", roughness: 0.3 }));
      const mu = (u0 + u1) / 2;
      d.position.set(mu, ground(mu, dv) + 0.05, -dv);
      root.add(d);
    }
  }
  const fg = fb.build();
  if (fg) root.add(mesh(mats, fg, "world", { outline: 0 }));

  // locked land: scrub, rushes, pools, a sign; farmed land: sheep and a trough
  const pb = batch(k);
  let sheepN = 0;
  for (const z of c.zones) {
    const [cu, cv] = centroid(z.poly);
    const us = z.poly.map((p) => p[0]), vs = z.poly.map((p) => p[1]);
    const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
    const pick = (m: number): UV | null => {
      for (let t = 0; t < 30; t++) {
        const u = lerp(u0, u1, rng()), v = lerp(v0, v1, rng());
        if (polyInset(u, v, z.poly) > m) return [u, v];
      }
      return null;
    };
    if (z.stage > stage) {
      const area = (u1 - u0) * (v1 - v0);
      const n = Math.round(area / (z.wet ? 16 : 11));
      for (let i = 0; i < n; i++) {
        const p = pick(0.8);
        if (!p) continue;
        if (z.wet && rng() < 0.6) rushes(k, pb, p[0], p[1]);
        else scrub(k, pb, p[0], p[1], 0.8 + rng() * 0.5);
      }
      if (z.wet) for (let i = 0; i < 4; i++) { const p = pick(1.5); if (p) pool(k, p[0], p[1], 0.9 + rng() * 0.8); }
      // sign on the edge nearest the viewer
      const su = cu + (u1 - u0) * 0.18, sv = v0 + 0.3;
      sign(k, su, sv, z.how);
      mist(k, cu, cv, ground(cu, cv) + 1.6, (u1 - u0) * 1.25, (v1 - v0) * 0.9 + 4, 0.75);
    } else {
      const n = z.flock ?? 4;
      for (let i = 0; i < n; i++) {
        const p = pick(1.2);
        if (!p) continue;
        const colour = FLOCK_COLOURS[(sheepN + i * 5) % FLOCK_COLOURS.length]!;
        const s: LabSheep = { name: `${c.id}${z.id}${i}`, colour, lamb: i % 4 === 3 };
        const g = buildSheep2(mats, s, opts.sheepScale ?? 2.1);
        g.position.set(p[0], ground(p[0], p[1]), -p[1]);
        g.rotation.y = rng() * Math.PI * 2;
        g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
        root.add(g);
      }
      sheepN += n;
      const t = pick(1.5);
      if (t) {
        const y = ground(t[0], t[1]);
        pb.box("#b9c3c9", [1.6, 0.5, 0.7], [t[0], y + 0.25, -t[1]]);
        pb.box("#9cc9d9", [1.4, 0.05, 0.5], [t[0], y + 0.5, -t[1]]);
      }
    }
  }
  const pg = pb.build();
  if (pg) root.add(mesh(mats, pg, "world", { outline: 0 }));

  // native bush: mature where it was, young plantings (with guards) where it has just grown
  const gb = batch(k);
  const step = 2.4;
  for (let u = -50; u < 50; u += step) {
    for (let v = -32; v < 42; v += step) {
      const pu = u + (rng() - 0.5) * step * 0.8, pv = v + (rng() - 0.5) * step * 0.8;
      if (rhoOf(pu, pv) > 0.92 || nearRoad(pu, pv) || inZone(pu, pv) || nearSpot(pu, pv)) continue;
      const h = c.height(pu, pv);
      if (h < c.water + 0.2 || h > c.snowLine - 0.6) continue;
      const s = bushScore(c, pu, pv);
      if (s > BUSH_AT[stage]) {
        const young = stage > 0 && s <= BUSH_AT[(stage - 1) as Stage];
        if (young) {
          if (rng() < 0.55) {
            if (rng() < 0.5) kowhaiTree(k, pu, pv, 0.5); else flax(k, pu, pv, 0.8);
            guard(k, gb, pu + 0.9, pv + 0.4);
          }
          continue;
        }
        const r = rng();
        if (r < 0.5) bushClump(k, pu, pv, 0.85 + rng() * 0.45);
        else if (r < 0.78) ponga(k, pu, pv, 0.85 + rng() * 0.3);
        else if (r < 0.9) kowhaiTree(k, pu, pv, 0.9);
        else cabbageTree(k, pu, pv, 0.9);
      }
    }
  }
  if (c.marsh) {
    for (let u = -50; u < 50; u += 1.8) {
      for (let v = -32; v < 42; v += 1.8) {
        const pu = u + (rng() - 0.5), pv = v + (rng() - 0.5);
        if (c.marsh(pu, pv) > 0.45 && c.height(pu, pv) > c.water - 0.05 && rng() < 0.55) {
          if (rng() < 0.4) flax(k, pu, pv, 0.8); else rushes(k, gb, pu, pv);
        }
      }
    }
  }
  // tussock on open high ground
  for (let i = 0; i < 260; i++) {
    const u = -48 + rng() * 96, v = -30 + rng() * 70;
    if (rhoOf(u, v) > 0.9 || inZone(u, v) || nearRoad(u, v)) continue;
    const h = c.height(u, v);
    if (h > c.snowLine - 0.4 || c.tussock(u, v, h) < 0.55 || bushScore(c, u, v) > BUSH_AT[stage]) continue;
    tussock(k, gb, u, v, 0.8 + rng() * 0.6);
  }
  for (const hd of c.hedges ?? []) if (hd.stage <= stage) hedge(k, gb, hd.pts);
  for (const t of c.trees ?? []) {
    if (t.kind === "cabbage") cabbageTree(k, t.u, t.v, t.s ?? 1);
    else if (t.kind === "pohutukawa") pohutukawa(k, t.u, t.v, t.s ?? 1);
    else if (t.kind === "kowhai") kowhaiTree(k, t.u, t.v, t.s ?? 1);
    else if (t.kind === "flax") flax(k, t.u, t.v, t.s ?? 1);
    else macrocarpa(k, gb, t.u, t.v, t.s ?? 1);
  }
  const gg = gb.build();
  if (gg) root.add(mesh(mats, gg, "world", { outline: 0 }));

  // clouds over the tops, mist on the rim (never over paddocks)
  for (const [u, v, y, s] of [[-30, 36, 18, 1.2], [10, 42, 21, 1], [34, 28, 16, 0.8]] as const) {
    const b = batch(k);
    for (let i = 0; i < 5; i++) blob(k, b, "#ffffff", (1.4 - Math.abs(i - 2) * 0.25) * s * 1.6, [(i - 2) * 1.8 * s, 0, rng() - 0.5], [1, 0.7, 0.9]);
    place(k, b, u, v, 0.5, { y, outline: 0 });
  }
  const rimN = opts.close ? 0 : 28;
  for (let i = 0; i < rimN; i++) {
    const th = (i / rimN) * Math.PI * 2;
    const e = edge(th) * 1.0;
    const u = CENTRE.u + Math.cos(th) * e * RAD.u, v = CENTRE.v + Math.sin(th) * e * RAD.v;
    const back = Math.sin(th) > 0.3;
    mist(k, u, v, ground(u, v) + (back ? 4 : 1.2), back ? 34 : 22, back ? 14 : 6, back ? 0.9 : 0.55);
  }
  // a mist band along the tops
  for (let u = -45; u <= 45; u += 12) mist(k, u, 30 + 3 * Math.sin(u * 0.2), 9.5, 30, 8, 0.8);

  return {
    root,
    ground,
    toWorld(u: number, v: number, y?: number) {
      return root.localToWorld(new THREE.Vector3(u, y ?? ground(u, v), -v));
    },
  };
}
