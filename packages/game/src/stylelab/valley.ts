// Style lab: the Kōwhai Creek river valley (DESIGN-v3 §9) as one procedural diorama.
// Local frame: x = u (along the valley, screen right), z = -v (v grows up the far slope).
// The root is turned 45° so the orthographic isometric camera looks along the valley.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GeoBatch, mat, type V3 } from "../world3d/builder.js";
import { mulberry32, type Rng } from "../world3d/rng.js";
import { mesh, type Mats } from "./render.js";
import { buildSheep, type LabSheep } from "./sheep.js";
import type { Direction } from "./styles.js";

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------- layout (u, v)

export const CENTRE = { u: 0, v: 5 };
const RAD = { u: 50, v: 36 };

/** Organic boundary radius (1 = nominal ellipse) by polar angle. */
function edge(theta: number): number {
  return 1 + 0.05 * Math.sin(theta * 3 + 0.7) + 0.035 * Math.sin(theta * 7 + 2.1) + 0.02 * Math.sin(theta * 13);
}

export function creekV(u: number): number {
  return -6 + 2.5 * Math.sin(u * 0.09 + 0.3) + 0.8 * Math.sin(u * 0.23 + 1);
}

export const SPOTS = {
  homestead: { u: -17, v: 7 },
  woolshed: { u: -3, v: 8 },
  bridge: { u: 11, v: creekV(11) },
  showground: { u: 33, v: -15 },
  mailbox: { u: -10, v: 2.6 },
};

/** Fenced paddocks as (u0, u1, v0, v1). */
export const PADDOCKS = {
  home: [-24, -9, -2.5, 3.2],
  flats: [-14, 4, -19, -11],
  hill: [-34, -14, 12, 22],
} as const;

/** The road as a polyline (u, v): homestead → woolshed → bridge → A&P showground. */
export const ROAD: [number, number][] = [
  [-19, 3.6], [-8, 3.6], [2, 3.4], [8, 2], [11, creekV(11) + 2.5], [11, creekV(11) - 2.5], [15, -12], [24, -15.5], [33, -15], [44, -14],
];

function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
export function roadDist(u: number, v: number): number {
  let d = Infinity;
  for (let i = 0; i < ROAD.length - 1; i++) {
    const a = ROAD[i]!, b = ROAD[i + 1]!;
    d = Math.min(d, distSeg(u, v, a[0], a[1], b[0], b[1]));
  }
  return d;
}

const inRect = (u: number, v: number, r: readonly [number, number, number, number], pad = 0) =>
  u > r[0] - pad && u < r[1] + pad && v > r[2] - pad && v < r[3] + pad;

/** Raw height of the valley floor and slopes. */
export function height(u: number, v: number): number {
  const cv = creekV(u);
  const d = v - cv;
  let h = 0.7 + 0.35 * Math.sin(u * 0.21) * Math.cos(v * 0.17) + 0.3 * Math.sin(u * 0.07 + v * 0.13);
  if (d > 0) {
    // far side: rolling hills climbing to the high country
    h += 5.2 * smoothstep(8, 30, d) + 0.9 * Math.sin(u * 0.16 + 0.5) * smoothstep(12, 24, d);
  } else {
    // near side: a gentle rise of foreground hills
    h += 3.4 * smoothstep(6, 24, -d) + 1.3 * Math.sin(u * 0.19 + 1) * smoothstep(9, 22, -d);
  }
  // snowy tops along the back
  h += smoothstep(25, 38, v) * (4.8 + 2.2 * Math.sin(u * 0.19 + 0.4) + 2.2 * Math.abs(Math.sin(u * 0.43)));
  // floodplain, then the creek channel
  h = lerp(h, 0.55, Math.exp(-(d * d) / 22));
  h -= 1.05 * Math.exp(-(d * d) / 2.4);
  // flat building pads and the showground
  for (const [p, r, y] of [[SPOTS.homestead, 5, null], [SPOTS.woolshed, 6, null], [SPOTS.showground, 7.5, null]] as const) {
    const w = 1 - smoothstep(r * 0.7, r * 1.4, Math.hypot(u - p.u, v - p.v));
    if (w > 0) h = lerp(h, y ?? padBase(p.u, p.v), w);
  }
  // road benches into the slope a little
  const rd = roadDist(u, v);
  if (rd < 3 && Math.abs(d) > 2.5) h = lerp(h, Math.max(0.6, h - 0.15), 1 - smoothstep(1, 3, rd));
  // terraces on the hill paddock
  const hill = PADDOCKS.hill;
  const tw = smoothstep(-2, 1, Math.min(u - hill[0], hill[1] - u, v - hill[2], hill[3] - v));
  if (tw > 0) {
    const step = 0.9;
    const f = h / step;
    const q = (Math.floor(f) + smoothstep(0.78, 1, f - Math.floor(f))) * step;
    h = lerp(h, q, tw);
  }
  return h;
}
function padBase(u: number, v: number): number {
  // the surroundings without pads: a gentle shelf
  const d = v - creekV(u);
  return 0.7 + 0.3 * Math.sin(u * 0.07 + v * 0.13) + (d > 0 ? 5.2 * smoothstep(8, 30, d) : 0);
}

/** Polar coordinates of (u, v) against the boundary: rho < 1 is inside. */
export function rhoOf(u: number, v: number): number {
  const x = (u - CENTRE.u) / RAD.u, y = (v - CENTRE.v) / RAD.v;
  return Math.hypot(x, y) / edge(Math.atan2(y, x));
}

// ---------------------------------------------------------------- terrain

export interface Valley {
  root: THREE.Group;
  /** Ground height at (u, v) for placing props (tiles are quantised). */
  ground(u: number, v: number): number;
  /** Local (u, v, y) → world position. */
  toWorld(u: number, v: number, y?: number): THREE.Vector3;
}

export function hex(c: string | THREE.Color): THREE.Color {
  return c instanceof THREE.Color ? c.clone() : new THREE.Color(c);
}

/** Ground colour at a spot, before any edge fade. */
function groundColour(dir: Direction, u: number, v: number, h: number, slope: number, rng: Rng): THREE.Color {
  const P = dir.palette;
  const d = v - creekV(u);
  let c = hex(P.grass);
  // rolling colour variation (watercolour blotches for A and C)
  const blot = Math.sin(u * 0.31 + Math.cos(v * 0.23) * 2) * Math.cos(v * 0.27 - u * 0.05);
  c.lerp(hex(P.hill), 0.35 + 0.25 * blot);
  if (v > 16) c.lerp(hex(P.tussock), smoothstep(16, 24, v) * 0.9);
  if (inRect(u, v, PADDOCKS.home) || inRect(u, v, PADDOCKS.flats) || inRect(u, v, PADDOCKS.hill)) c = hex(P.grass2).lerp(hex(P.grass), 0.2 + 0.2 * blot);
  if (Math.abs(d) < 5 && !inRect(u, v, PADDOCKS.flats)) c.lerp(hex(P.flats), 0.5 * (1 - Math.abs(d) / 5));
  if (Math.abs(d) < 1.8) c.lerp(hex(P.soil), 0.6);
  // bush floor
  if (u > 13 && u < 36 && v > -3 && v < 26) c.lerp(hex(P.bush), 0.45 * smoothstep(13, 18, u));
  if (slope > 0.7) c.lerp(hex(P.rock), smoothstep(0.7, 1.4, slope) * 0.7);
  const snowLine = 9.6 + 1.0 * Math.sin(u * 0.3);
  if (h > snowLine) c = hex(P.snow).lerp(hex(P.rock), slope > 1.2 ? 0.35 : 0);
  if (roadDist(u, v) < 1.1 && Math.abs(d) > 1.9) c = hex(P.road);
  if (Math.hypot(u - SPOTS.showground.u, v - SPOTS.showground.v) < 6.5) c.lerp(hex(P.grass2), 0.5);
  if (dir.jitter) c.multiplyScalar(1 - dir.jitter + rng() * dir.jitter * 2);
  return c;
}

function smoothTerrain(dir: Direction, mats: Mats, rng: Rng): THREE.Object3D[] {
  const P = dir.palette;
  const NR = 56, NT = 220;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const bg = hex(P.bg);
  const at = (i: number, j: number) => {
    const rho = i / NR;
    const th = (j / NT) * Math.PI * 2;
    const e = edge(th) * rho;
    return { u: CENTRE.u + Math.cos(th) * e * RAD.u, v: CENTRE.v + Math.sin(th) * e * RAD.v, rho };
  };
  for (let i = 0; i <= NR; i++) {
    for (let j = 0; j < NT; j++) {
      const { u, v, rho } = at(i, j);
      let h = height(u, v);
      const slope = Math.hypot(height(u + 0.5, v) - h, height(u, v + 0.5) - h) * 2;
      const c = groundColour(dir, u, v, h, slope, rng);
      if (dir.terrain === "fade") {
        // melt into the page / the mist at the rim
        c.lerp(bg, smoothstep(0.8, 1.0, rho) * (dir.id === "A" ? 0.92 : 0.8));
        h = lerp(h, Math.min(h, 1.2), smoothstep(0.9, 1.0, rho) * 0.4);
      }
      pos.push(u, h, -v);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NR; i++) {
    for (let j = 0; j < NT; j++) {
      const a = i * NT + j, b = i * NT + ((j + 1) % NT), c = (i + 1) * NT + j, d = (i + 1) * NT + ((j + 1) % NT);
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  let g: THREE.BufferGeometry = geo;
  if (dir.flat) {
    g = geo.toNonIndexed();
    geo.dispose();
  }
  g.computeVertexNormals();
  const terrain = new THREE.Mesh(g, mats.surface("terrain"));
  terrain.receiveShadow = dir.shadows;
  // woodcut: ink the hill silhouettes too
  if (dir.terrain === "slab") mats.outline(terrain, 1, 0.8);
  const out: THREE.Object3D[] = [terrain];

  if (dir.terrain === "slab") {
    // cut-earth edge: a skirt down to a flat base, with strata stripes
    const sp: number[] = [], sc: number[] = [];
    const strata = [hex(P.soil), hex(P.soil).multiplyScalar(0.8), hex(P.soil).lerp(hex(P.tussock), 0.3), hex(P.soil).multiplyScalar(0.7)];
    const base = -5;
    for (let j = 0; j < NT; j++) {
      const p0 = at(NR, j), p1 = at(NR, (j + 1) % NT);
      const h0 = height(p0.u, p0.v), h1 = height(p1.u, p1.v);
      const layers = [h0, h1, 0.2, -1.8, -3.4, base];
      for (let s = 0; s < 4; s++) {
        const top0 = s === 0 ? h0 : layers[s + 1]!, top1 = s === 0 ? h1 : layers[s + 1]!;
        const bot = layers[s + 2]!;
        const c = strata[s]!;
        const quad: V3[] = [[p0.u, top0, -p0.v], [p0.u, bot, -p0.v], [p1.u, top1, -p1.v], [p1.u, top1, -p1.v], [p0.u, bot, -p0.v], [p1.u, bot, -p1.v]];
        for (const q of quad) { sp.push(q[0], q[1], q[2]); sc.push(c.r, c.g, c.b); }
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
    sg.computeVertexNormals();
    const skirt = new THREE.Mesh(sg, mats.surface("terrain"));
    (skirt.material as THREE.Material).side = THREE.DoubleSide;
    out.push(skirt);
    // ink rim along the top edge
    const rim: THREE.Vector3[] = [];
    for (let j = 0; j <= NT; j++) {
      const p = at(NR, j % NT);
      rim.push(new THREE.Vector3(p.u, height(p.u, p.v) + 0.02, -p.v));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), NT, 0.14, 4, true);
    out.push(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: P.ink })));
    const bottom: THREE.Vector3[] = [];
    for (let j = 0; j <= NT; j++) {
      const p = at(NR, j % NT);
      bottom.push(new THREE.Vector3(p.u, base, -p.v));
    }
    out.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bottom, true), NT, 0.14, 4, true), new THREE.MeshBasicMaterial({ color: P.ink })));
  }
  return out;
}

const TILE = 2;
const STEP = 0.5;
function tileTop(u: number, v: number): number {
  const cu = (Math.floor(u / TILE) + 0.5) * TILE, cv = (Math.floor(v / TILE) + 0.5) * TILE;
  const d = cv - creekV(cu);
  if (Math.abs(d) < 1.6) return 0.2;
  return Math.max(0.5, Math.min(3.5, Math.round((height(cu, cv) * 0.62) / STEP) * STEP));
}

function tileTerrain(dir: Direction, mats: Mats, rng: Rng): THREE.Object3D[] {
  const P = dir.palette;
  const cells: { u: number; v: number; top: number; c: THREE.Color; water: boolean }[] = [];
  for (let u = -60; u < 60; u += TILE) {
    for (let v = -40; v < 50; v += TILE) {
      const cu = u + TILE / 2, cv = v + TILE / 2;
      if (rhoOf(cu, cv) > 0.97) continue;
      const top = tileTop(cu, cv);
      const water = top === 0.2;
      const h = height(cu, cv);
      const slope = Math.hypot(height(cu + 0.5, cv) - h, height(cu, cv + 0.5) - h) * 2;
      const c = water ? hex(P.water) : groundColour(dir, cu, cv, h, slope, rng);
      // checkerboard nudge: reads as toy tiles
      if (!water && ((Math.floor(u / TILE) + Math.floor(v / TILE)) & 1)) c.multiplyScalar(0.95);
      cells.push({ u: cu, v: cv, top, c, water });
    }
  }
  const cap = new RoundedBoxGeometry(TILE * 0.96, 0.6, TILE * 0.96, 2, 0.16);
  const capMesh = new THREE.InstancedMesh(cap, mats.surface("terrain"), cells.length);
  const colGeo = new THREE.BoxGeometry(TILE * 0.9, 1, TILE * 0.9);
  const colMat = new THREE.MeshStandardMaterial({ color: P.soil, roughness: 0.8 });
  const colMesh = new THREE.InstancedMesh(colGeo, colMat, cells.length);
  const m = new THREE.Matrix4();
  const base = -3.2;
  cells.forEach((cell, i) => {
    m.makeTranslation(cell.u, cell.top - 0.3, -cell.v);
    capMesh.setMatrixAt(i, m);
    capMesh.setColorAt(i, cell.c);
    const hgt = cell.top - 0.4 - base;
    m.makeScale(1, hgt, 1).setPosition(cell.u, base + hgt / 2, -cell.v);
    colMesh.setMatrixAt(i, m);
  });
  // material must read instance colours rather than vertex colours
  const capMat = (mats.surface("terrain") as THREE.MeshPhysicalMaterial).clone();
  capMat.vertexColors = false;
  capMesh.material = capMat;
  capMesh.receiveShadow = true;
  capMesh.castShadow = true;
  colMesh.receiveShadow = true;
  // a chunky round toy base under the whole diorama, with a coloured rim
  const baseGeo = new THREE.CylinderGeometry(1, 1, 1, 96);
  const boardMesh = new THREE.Mesh(baseGeo, new THREE.MeshPhysicalMaterial({ color: "#fff4df", roughness: 0.4, clearcoat: 0.6 }));
  boardMesh.scale.set(RAD.u * 1.07, 1.2, RAD.v * 1.1);
  boardMesh.position.set(CENTRE.u, base - 0.6, -CENTRE.v);
  boardMesh.receiveShadow = true;
  const rim = new THREE.Mesh(baseGeo, new THREE.MeshPhysicalMaterial({ color: "#ff8a4a", roughness: 0.4, clearcoat: 0.6 }));
  rim.scale.set(RAD.u * 1.1, 1.4, RAD.v * 1.13);
  rim.position.set(CENTRE.u, base - 1.8, -CENTRE.v);
  // water shine layer inside the creek cells
  return [capMesh, colMesh, boardMesh, rim];
}

// ---------------------------------------------------------------- props

export interface Kit {
  dir: Direction;
  mats: Mats;
  rng: Rng;
  ground(u: number, v: number): number;
  add(o: THREE.Object3D): void;
}

export const seg = (k: Kit, base: number) => Math.max(3, Math.round((base * k.dir.seg) / 8));

/** Place a batch built in a local frame at (u, v) facing angle `rot` (radians about Y). */
export function place(k: Kit, b: GeoBatch, u: number, v: number, rot = 0, opts: { kind?: "world" | "water"; outline?: number; y?: number } = {}): THREE.Mesh | null {
  const geo = b.build();
  if (!geo) return null;
  const m = mesh(k.mats, geo, opts.kind ?? "world", { outline: opts.outline ?? 1 });
  m.position.set(u, opts.y ?? k.ground(u, v), -v);
  m.rotation.y = rot;
  k.add(m);
  return m;
}

export function batch(k: Kit): GeoBatch {
  return new GeoBatch(k.dir.jitter, k.rng);
}

export function blob(k: Kit, b: GeoBatch, c: string | number, r: number, p: V3, s: V3 | number = 1) {
  b.ico(c, r, k.dir.detail, p, s, [k.rng() * 3, k.rng() * 3, k.rng() * 3]);
}

export function pohutukawa(k: Kit, u: number, v: number, s = 1) {
  const P = k.dir.palette, b = batch(k);
  for (const [dx, dz, lean] of [[0, 0, 0.25], [0.3, 0.2, -0.35], [-0.2, -0.3, 0.1]] as const) {
    b.cyl(P.trunk, 0.16 * s, 0.26 * s, 1.8 * s, seg(k, 6), [dx * s, 0.8 * s, dz * s], [lean, 0, lean * 0.6]);
  }
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    blob(k, b, i % 2 ? P.bush : P.bush2, 1.1 * s, [Math.cos(a) * 1.3 * s, 2.1 * s + k.rng() * 0.3, Math.sin(a) * 1.3 * s], [1, 0.72, 1]);
  }
  blob(k, b, P.bush2, 1.3 * s, [0, 2.6 * s, 0], [1.1, 0.7, 1.1]);
  // crimson blossom
  for (let i = 0; i < 14; i++) {
    const a = k.rng() * Math.PI * 2, r = k.rng() * 1.9 * s;
    blob(k, b, P.pohutukawa, 0.34 * s, [Math.cos(a) * r, 2.8 * s + (1.9 * s - r) * 0.3, Math.sin(a) * r], [1, 0.6, 1]);
  }
  place(k, b, u, v, k.rng() * 6);
}

export function cabbageTree(k: Kit, u: number, v: number, s = 1) {
  const P = k.dir.palette, b = batch(k);
  b.cyl(P.trunk, 0.1 * s, 0.16 * s, 2.4 * s, seg(k, 5), [0, 1.2 * s, 0]);
  const heads: V3[] = [[0.5 * s, 3.2 * s, 0.1 * s], [-0.4 * s, 3.0 * s, -0.2 * s], [0, 3.5 * s, 0]];
  for (const h of heads) {
    b.cyl(P.trunk, 0.06 * s, 0.09 * s, 1.1 * s, 4, [h[0] / 2, 2.6 * s + (h[1] - 2.4 * s) / 2 - 0.2 * s, h[2] / 2], [h[2] * 0.6, 0, -h[0] * 0.6]);
    const n = k.dir.id === "B" ? 7 : 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const tilt = 0.9 + (i % 3) * 0.35;
      b.add(new THREE.ConeGeometry(0.07 * s, 1.1 * s, 3), i % 2 ? P.cabbage : P.fern,
        mat([h[0] + Math.cos(a) * 0.3 * s, h[1], h[2] + Math.sin(a) * 0.3 * s], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt]));
    }
  }
  place(k, b, u, v, k.rng() * 6);
}

export function ponga(k: Kit, u: number, v: number, s = 1) {
  const P = k.dir.palette, b = batch(k);
  const h = 2.6 * s;
  b.cyl(P.trunk, 0.18 * s, 0.24 * s, h, seg(k, 6), [0, h / 2, 0]);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + k.rng() * 0.3;
    // an arching frond: two tapered slabs, the outer one drooping
    const dirx = Math.cos(a), dirz = Math.sin(a);
    b.add(new THREE.BoxGeometry(1.2 * s, 0.05 * s, 0.42 * s).translate(0.6 * s, 0, 0), P.fern, mat([0, h + 0.05, 0], [0, -a, 0.35]));
    b.add(new THREE.BoxGeometry(1.0 * s, 0.05 * s, 0.3 * s).translate(0.5 * s, 0, 0), P.bush2,
      mat([dirx * 1.1 * s, h + 0.4 * s, dirz * 1.1 * s], [0, -a, -0.45]));
  }
  place(k, b, u, v, 0);
}

export function kowhaiTree(k: Kit, u: number, v: number, s = 1) {
  const P = k.dir.palette, b = batch(k);
  b.cyl(P.trunk, 0.1 * s, 0.17 * s, 1.6 * s, seg(k, 5), [0, 0.8 * s, 0], [0.1, 0, 0.12]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    blob(k, b, i % 2 ? P.kowhai : P.bush2, 0.65 * s, [Math.cos(a) * 0.6 * s, 2.0 * s + k.rng() * 0.3, Math.sin(a) * 0.6 * s], [1, 0.85, 1]);
  }
  blob(k, b, P.kowhai, 0.7 * s, [0, 2.5 * s, 0]);
  place(k, b, u, v, k.rng() * 6);
}

export function bushClump(k: Kit, u: number, v: number, s = 1) {
  const P = k.dir.palette, b = batch(k);
  const n = 3 + Math.floor(k.rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = (0.9 + k.rng() * 0.6) * s;
    blob(k, b, k.rng() < 0.5 ? P.bush : P.bush2, r, [(k.rng() - 0.5) * 2 * s, r * 0.9 + k.rng() * 0.8 * s, (k.rng() - 0.5) * 2 * s], [1, 1.15, 1]);
  }
  place(k, b, u, v, 0);
}

export function flax(k: Kit, u: number, v: number, s = 1) {
  const P = k.dir.palette, b = batch(k);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.add(new THREE.ConeGeometry(0.1 * s, 1.5 * s, 3), i % 3 ? P.fern : P.bush, mat([Math.cos(a) * 0.2 * s, 0.65 * s, Math.sin(a) * 0.2 * s], [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45], [1, 1, 0.3]));
  }
  place(k, b, u, v, k.rng() * 6);
}

export function tussock(k: Kit, b: GeoBatch, u: number, v: number, s = 1) {
  const y = k.ground(u, v);
  const c = k.dir.palette.tussock;
  if (k.dir.id !== "A") {
    b.ico(c, 0.45 * s, k.dir.detail, [u, y + 0.15 * s, -v], [1, 0.7, 1]);
    return;
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    b.add(new THREE.ConeGeometry(0.09 * s, 0.8 * s, 3), c, mat([u + Math.cos(a) * 0.12 * s, y + 0.35 * s, -v + Math.sin(a) * 0.12 * s], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]));
  }
}

export function homestead(k: Kit, u = SPOTS.homestead.u, v = SPOTS.homestead.v, rot = -0.15) {
  const P = k.dir.palette, b = batch(k);
  // villa: weatherboards, hipped iron roof, verandah
  b.box(P.wall, [5, 2.2, 3.6], [0, 1.1 + 0.2, 0]);
  b.box(P.soil, [5.2, 0.3, 3.8], [0, 0.15, 0]);
  b.add(new THREE.ConeGeometry(3.6, 1.8, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.78), P.roofIron, mat([0, 3.2, 0]));
  b.box(P.wall, [2.2, 2.0, 1.6], [1.4, 1.2, 2.3]);
  b.gable(P.roofIron, 2.4, 1.9, 1.1, [1.4, 2.2, 2.3], Math.PI / 2);
  // verandah
  b.box(P.roofIron, [3.1, 0.12, 1.4], [-1.0, 2.25, 2.3], [0.18, 0, 0]);
  for (const x of [-2.4, -1.0, 0.3]) b.cyl(P.trim, 0.06, 0.06, 2.0, 4, [x, 1.2, 2.9]);
  b.box(P.fence, [3.1, 0.12, 1.3], [-1.0, 0.3, 2.3]);
  // windows and door
  for (const x of [-1.8, -0.4]) b.box(P.trim, [0.7, 0.9, 0.06], [x, 1.5, 1.83]);
  b.box(P.trim, [0.7, 0.9, 0.06], [1.4, 1.4, 3.13]);
  b.box(P.roofRed, [0.6, 1.2, 0.06], [-1.0 + 0.9, 1.0, 1.83]);
  // chimney
  b.box(P.roofRed, [0.5, 1.6, 0.5], [-1.6, 3.6, -0.6]);
  // water tank
  b.cyl(P.roofIron, 0.8, 0.8, 1.7, seg(k, 10), [3.4, 0.95, -0.8]);
  b.cone(P.roofIron, 0.85, 0.35, seg(k, 10), [3.4, 1.98, -0.8]);
  // gumboots by the door
  b.cyl("#2f3a2f", 0.1, 0.1, 0.4, 5, [-0.3, 0.5, 2.7]);
  b.cyl("#2f3a2f", 0.1, 0.1, 0.4, 5, [-0.05, 0.5, 2.75]);
  // garden
  for (let i = 0; i < 6; i++) blob(k, b, i % 2 ? P.kowhai : P.pohutukawa, 0.28, [-2.6 + i * 0.5, 0.35, 3.6], [1, 0.8, 1]);
  place(k, b, u, v, rot);
}

export function woolshed(k: Kit, u = SPOTS.woolshed.u, v = SPOTS.woolshed.v, yards = true) {
  const P = k.dir.palette, b = batch(k);
  // on piles, long red shed with a red iron gable roof and a skillion over the board
  for (let i = -3; i <= 3; i++) for (const z of [-1.6, 1.6]) b.box(P.trunk, [0.25, 0.8, 0.25], [i * 1.1, 0.4, z]);
  b.box(P.shedWall, [7.4, 2.6, 3.6], [0, 0.8 + 1.3, 0]);
  b.gable(P.roofRed, 7.8, 4.2, 1.7, [0, 3.4, 0]);
  b.box(P.shedWall, [2.6, 1.8, 2.2], [-4.6, 0.8 + 0.9, 0.5]);
  b.box(P.roofRed, [2.9, 0.12, 2.6], [-4.6, 2.75, 0.5], [0, 0, 0.2]);
  // doors, battens, skylight
  b.box(P.wall, [1.6, 1.8, 0.06], [1.2, 1.8, 1.83]);
  b.box(P.fence, [0.08, 1.8, 0.07], [1.2, 1.8, 1.86]);
  b.box(P.wall, [0.8, 0.6, 0.06], [-1.8, 2.4, 1.83]);
  b.box(P.roofIron, [1.2, 0.08, 1.6], [0.8, 3.95, 0.6], [0.4, 0, 0]);
  // ramp and yards
  b.box(P.fence, [1.2, 0.12, 2.4], [2.8, 0.45, 2.8], [-0.35, 0, 0]);
  place(k, b, u, v, 0.05);
  if (!yards) return;
  const y = batch(k);
  const Y = [u + 0.5, u + 7, v - 5.2, v - 1.2] as const;
  fenceRect(k, y, Y, 1.1);
  fenceLine(k, y, [u + 3.75, v - 5.2], [u + 3.75, v - 1.2], 1.1);
  const m = y.build();
  if (m) {
    const me = mesh(k.mats, m, "world", { outline: 0.6 });
    k.add(me);
  }
}

export function fenceLine(k: Kit, b: GeoBatch, a: [number, number], c: [number, number], spacing = 2.2) {
  const P = k.dir.palette;
  const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const n = Math.max(1, Math.round(len / spacing));
  const postH = k.dir.id === "D" ? 0.9 : 1.0;
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = lerp(a[0], c[0], t), v = lerp(a[1], c[1], t);
    const y = k.ground(u, v);
    if (k.dir.id === "D") b.add(new RoundedBoxGeometry(0.28, postH, 0.28, 1, 0.08), P.fence, mat([u, y + postH / 2, -v]));
    else b.box(P.fence, [0.16, postH, 0.16], [u, y + postH / 2, -v]);
    const p = new THREE.Vector3(u, y, -v);
    if (prev) {
      for (const hgt of k.dir.id === "D" ? [0.6] : [0.45, 0.85]) {
        const mid = prev.clone().add(p).multiplyScalar(0.5);
        const d = p.clone().sub(prev);
        const L = d.length();
        const rot: V3 = [0, -Math.atan2(d.z, d.x), Math.atan2(d.y, Math.hypot(d.x, d.z))];
        b.box(P.fence, [L, k.dir.id === "D" ? 0.2 : 0.08, k.dir.id === "D" ? 0.14 : 0.06], [mid.x, mid.y + hgt, mid.z], rot);
      }
    }
    prev = p;
  }
}

export function fenceRect(k: Kit, b: GeoBatch, r: readonly [number, number, number, number], spacing = 2.2, gap = false) {
  const [u0, u1, v0, v1] = r;
  fenceLine(k, b, [u0, v0], [u1, v0], spacing);
  fenceLine(k, b, [u1, v0], [u1, v1], spacing);
  if (gap) {
    fenceLine(k, b, [u1, v1], [lerp(u0, u1, 0.6), v1], spacing);
    fenceLine(k, b, [lerp(u0, u1, 0.45), v1], [u0, v1], spacing);
  } else fenceLine(k, b, [u1, v1], [u0, v1], spacing);
  fenceLine(k, b, [u0, v1], [u0, v0], spacing);
}

export function bridge(k: Kit, u = SPOTS.bridge.u, v = SPOTS.bridge.v, rot = 0, y = 0) {
  const P = k.dir.palette, b = batch(k);
  b.box(P.fence, [2.6, 0.22, 6.6], [0, 0.95, 0]);
  for (const x of [-1.25, 1.25]) {
    b.box(P.trunk, [0.12, 0.12, 6.6], [x, 1.6, 0]);
    for (const z of [-3, -1, 1, 3]) b.box(P.trunk, [0.16, 0.8, 0.16], [x, 1.3, z]);
  }
  for (const z of [-3.1, 3.1]) b.box(P.soil, [2.7, 0.6, 0.6], [0, 0.5, z]);
  place(k, b, u, v, rot, { y });
}

export function showground(k: Kit, u = SPOTS.showground.u, v = SPOTS.showground.v, tents = true) {
  const P = k.dir.palette;
  const b = batch(k);
  // two striped marquees
  const tent = (x: number, z: number, w: number, d: number) => {
    const n = 6;
    for (let i = 0; i < n; i++) b.box(i % 2 ? P.tent : P.tent2, [w / n, 1.4, d], [x - w / 2 + (i + 0.5) * (w / n), 0.7, z]);
    b.add(new THREE.ConeGeometry(Math.hypot(w, d) / 2 * 1.05, 1.5, 4, 1).rotateY(Math.PI / 4).scale(w / Math.hypot(w, d) * 1.42, 1, d / Math.hypot(w, d) * 1.42), P.tent2, mat([x, 2.15, z]));
    b.cyl(P.trunk, 0.05, 0.05, 1.2, 4, [x, 3.3, z]);
    b.box(P.kowhai, [0.6, 0.35, 0.03], [x + 0.3, 3.7, z]);
  };
  if (tents) {
    tent(-2, 1.5, 4, 3);
    tent(3.2, -1.5, 3, 2.6);
  }
  // little grandstand
  for (let i = 0; i < 3; i++) b.box(P.wall, [4, 0.5, 0.8], [0.5, 0.25 + i * 0.5, -4 - i * 0.8]);
  b.box(P.roofRed, [4.4, 0.12, 3], [0.5, 2.6, -4.8], [-0.2, 0, 0]);
  for (const x of [-1.5, 2.5]) b.cyl(P.trunk, 0.06, 0.06, 2.6, 4, [x, 1.3, -3.6]);
  // bunting between poles
  const poles: V3[] = tents ? [[-5, 0, 4], [0, 0, 5], [5, 0, 3.5], [6, 0, -3]] : [];
  for (const p of poles) b.cyl(P.trunk, 0.07, 0.07, 3, 4, [p[0], 1.5, p[2]]);
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i]!, c = poles[i + 1]!;
    for (let j = 1; j < 8; j++) {
      const t = j / 8;
      const x = lerp(a[0], c[0], t), z = lerp(a[2], c[2], t);
      const sag = 2.9 - Math.sin(t * Math.PI) * 0.5;
      b.add(new THREE.ConeGeometry(0.22, 0.45, 3).rotateX(Math.PI), P.bunting[j % P.bunting.length]!, mat([x, sag - 0.2, z], [0, Math.atan2(c[0] - a[0], c[2] - a[2]), 0]));
    }
  }
  place(k, b, u, v, 0.2);
}

export function mailbox(k: Kit) {
  const P = k.dir.palette, b = batch(k);
  b.box(P.trunk, [0.15, 1.1, 0.15], [0, 0.55, 0]);
  b.box(P.roofRed, [0.5, 0.4, 0.7], [0, 1.25, 0]);
  place(k, b, SPOTS.mailbox.u, SPOTS.mailbox.v, 0.3);
}

export function ute(k: Kit, u: number, v: number) {
  const P = k.dir.palette, b = batch(k);
  const body = k.dir.id === "B" ? P.trim : k.dir.id === "D" ? "#3f8fe0" : "#e8e1cf";
  b.box(body, [1.4, 0.7, 2.8], [0, 0.65, 0]);
  b.box(body, [1.3, 0.6, 1.2], [0, 1.25, 0.6]);
  b.box("#b9d6e0", [1.2, 0.4, 0.05], [0, 1.3, 1.22]);
  for (const x of [-0.72, 0.72]) for (const z of [-0.9, 0.9]) b.cyl("#2a2a2a", 0.3, 0.3, 0.2, seg(k, 8), [x, 0.3, z], [0, 0, Math.PI / 2]);
  place(k, b, u, v, 1.3);
}

/** Toybox only: big rounded snowy mountains standing on the back tiles. */
function toyMountains(k: Kit) {
  if (k.dir.terrain !== "tiles") return;
  const P = k.dir.palette;
  for (const [u, v, r, h] of [[-34, 29, 7, 11], [-18, 33, 8, 14], [0, 34, 7.5, 12], [16, 31, 7, 10.5], [-4, 28, 5, 7]] as const) {
    const b = batch(k);
    b.add(new THREE.ConeGeometry(r, h, 28, 4), P.hill, mat([0, h / 2, 0]));
    b.add(new THREE.ConeGeometry(r * 0.42, h * 0.42, 28, 2), P.snow, mat([0, h - h * 0.21 + 0.05, 0], [0, 0, 0], [1.04, 1, 1.04]));
    b.add(new THREE.SphereGeometry(r * 0.2, 16, 8), P.snow, mat([0, h * 0.96, 0], [0, 0, 0], [1, 0.5, 1]));
    place(k, b, u, v, 0);
  }
}

export function clouds(k: Kit) {
  if (k.dir.id === "A") return;
  const c = k.dir.id === "B" ? "#fbf1db" : "#ffffff";
  for (const [u, v, y, s] of [[-30, 30, 17, 1.2], [8, 40, 22, 1], [30, 22, 16, 0.8]] as const) {
    const b = batch(k);
    for (let i = 0; i < 5; i++) blob(k, b, c, (1.4 - Math.abs(i - 2) * 0.25) * s * 1.6, [(i - 2) * 1.8 * s, 0, (k.rng() - 0.5)], [1, 0.7, 0.9]);
    place(k, b, u, v, 0.5, { y, outline: 0.7 });
  }
}

function water(k: Kit) {
  if (k.dir.terrain === "tiles") return;
  const P = k.dir.palette;
  const pos: number[] = [], col: number[] = [];
  const c = hex(P.water);
  for (let u = -60; u < 60; u += 1) {
    const a0 = creekV(u), a1 = creekV(u + 1);
    const w = 2.3;
    const quad: V3[] = [[u, 0.12, -(a0 - w)], [u + 1, 0.12, -(a1 - w)], [u, 0.12, -(a0 + w)], [u, 0.12, -(a0 + w)], [u + 1, 0.12, -(a1 - w)], [u + 1, 0.12, -(a1 + w)]];
    const cc = c;
    for (const q of quad) {
      if (rhoOf(q[0], -q[2]) > 0.985) continue;
      pos.push(q[0], q[1], q[2]);
      col.push(cc.r, cc.g, cc.b);
    }
  }
  // keep whole triangles only
  const n = Math.floor(pos.length / 9) * 9;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos.slice(0, n), 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col.slice(0, n), 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, k.mats.surface("water"));
  m.receiveShadow = k.dir.shadows;
  k.add(m);
}

/** A sheep in the valley: v3 colour, placed on the ground. */
export function placeSheep(v: Valley, mats: Mats, s: LabSheep, u: number, vv: number, rot: number, scale = 1): THREE.Group {
  const g = buildSheep(mats, s, scale);
  g.position.set(u, v.ground(u, vv), -vv);
  g.rotation.y = rot;
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = mats.dir.shadows;
  });
  v.root.add(g);
  return g;
}

export function buildValley(dir: Direction, mats: Mats): Valley {
  const rng = mulberry32(0xc0ffee);
  const root = new THREE.Group();
  root.rotation.y = Math.PI / 4;
  const ground = dir.terrain === "tiles" ? tileTop : height;
  const k: Kit = { dir, mats, rng, ground, add: (o) => root.add(o) };
  for (const o of dir.terrain === "tiles" ? tileTerrain(dir, mats, rng) : smoothTerrain(dir, mats, rng)) root.add(o);
  water(k);
  homestead(k);
  woolshed(k);
  bridge(k);
  showground(k);
  mailbox(k);
  ute(k, -8.5, 5.6);
  clouds(k);
  toyMountains(k);

  // paddock fences
  const fb = batch(k);
  fenceRect(k, fb, PADDOCKS.home, 2.2, true);
  fenceRect(k, fb, PADDOCKS.flats, 2.4, true);
  fenceRect(k, fb, PADDOCKS.hill, 2.4);
  // terrace contour fences on the hill paddock
  for (const tv of [15.5, 18.8]) fenceLine(k, fb, [PADDOCKS.hill[0], tv], [PADDOCKS.hill[1], tv], 2.4);
  const fg = fb.build();
  if (fg) k.add(mesh(mats, fg, "world", { outline: 0.6 }));

  // native bush edge (ngahere): dense clumps, ponga, cabbage trees, pōhutukawa by the awa
  const inBush = (u: number, v: number) => u > 15 && u < 40 && v > -1 && v < 26 && rhoOf(u, v) < 0.93;
  for (let i = 0; i < 70; i++) {
    const u = 15 + rng() * 25, v = -1 + rng() * 27;
    if (!inBush(u, v) || roadDist(u, v) < 2.5) continue;
    const r = rng();
    if (r < 0.5) bushClump(k, u, v, 0.9 + rng() * 0.5);
    else if (r < 0.8) ponga(k, u, v, 0.9 + rng() * 0.3);
    else kowhaiTree(k, u, v, 0.9);
  }
  pohutukawa(k, 17, creekV(17) + 3.2, 1.25);
  pohutukawa(k, 25, creekV(25) + 3.5, 1.1);
  pohutukawa(k, -30, creekV(-30) - 3.6, 1.0);
  for (const [u, v] of [[-6, -8.2], [-27, 4], [6, 12], [-22, -14], [20, -8]] as const) cabbageTree(k, u, v, 1);
  for (const [u, v] of [[-19, creekV(-19) + 2.4], [-2, creekV(-2) - 2.4], [4, creekV(4) + 2.5], [-36, creekV(-36) + 2.4], [28, creekV(28) - 2.6]] as const) flax(k, u, v, 1);
  kowhaiTree(k, -21, 9.5, 1);
  kowhaiTree(k, -12, 10.5, 0.9);
  ponga(k, 9, 6, 0.9);
  bushClump(k, -38, 9, 1.1);
  bushClump(k, -40, 1, 1);
  // high-country tussock
  const tb = batch(k);
  for (let i = 0; i < 60; i++) {
    const u = -45 + rng() * 62, v = 19 + rng() * 12;
    if (rhoOf(u, v) > 0.9 || height(u, v) > 9 || inRect(u, v, PADDOCKS.hill, 1)) continue;
    tussock(k, tb, u, v, 0.8 + rng() * 0.6);
  }
  const tg = tb.build();
  if (tg) k.add(mesh(mats, tg, "world", { outline: 0.5 }));

  return {
    root,
    ground,
    toWorld(u: number, v: number, y?: number) {
      return root.localToWorld(new THREE.Vector3(u, y ?? ground(u, v), -v));
    },
  };
}
