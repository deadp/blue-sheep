// The river-valley farm at play scale (DESIGN-v3 §9, §15 items 20–24), built once and batched: terrain,
// the creek, homestead, barn, home paddock, woolshed with its verandah stations (empty benches for now),
// trader's stall, mailbox, vet's hut, showground, native bush and the land you can open (creek flats, far bank
// over the bridge, rushy corner, terraces). Locked land reads through scrub, rank grass, broken fences and a
// sign, never mist; each area keeps its pieces so opening it can be played as a reveal.
import * as THREE from "three";
import { GeoBatch, mat, type V3 } from "./builder.js";
import { mulberry32, type Rng } from "./rng.js";
import { smoothGeo } from "./sheepMesh.js";
import type { Hotspot, Zone } from "./types.js";
import {
  AREAS, AREA_IDS, BUSH_AT, BRIDGE, FENCES, HEDGES, HOTSPOT_LABEL, OBSTACLES, PADDOCK_TREES, PROPS, RUTTED, SHEEP_TRACKS, SOLIDS, SPOTS,
  STONE_WALLS, TRACKS, TREES, areaFence, bushScore, creekV, groundY, height, lerp, lineDist, roadV,
  smoothstep as ss, softRect, toRect, type AreaId, type Rect, type TreeKind, type URect, type UV,
} from "./valley.js";
import { clothesline, contactShadow, hayScatter, hedge, quadBike, ribbon, rocks, softPatch, stoneWall, tankStand, thistle, toetoe, tractor, wheelbarrow, woodpile, woolpack } from "./dress.js";

export { HOTSPOT_LABEL, type Rect } from "./valley.js";

/** Soft pastoral palette (round 3, "Misty Pastoral" minus the mist). */
export const P = {
  grass: "#a9d08a", grass2: "#98c97c", hill: "#a9c79b", tussock: "#e3cf9a", rock: "#b9b4ae", snow: "#ffffff",
  soil: "#cdb89a", road: "#eadcc0", bush: "#5f9470", bush2: "#83ad80", pohutukawa: "#e07a7c", kowhai: "#f1d36e",
  cabbage: "#9dbb86", fern: "#7fae84", trunk: "#a08670", wall: "#fbf6ec", trim: "#9bb6c9", roofIron: "#b9c3c9",
  roofRed: "#d98b7c", shedWall: "#dc9484", fence: "#c2a88c", rank: "#bdb58c",
};

/** Zones sheep stand in (world rectangles). */
export const ZONES: Record<Zone, Rect> = {
  paddock: toRect(AREAS.home.rect, 0.9),
  paddock2: toRect(AREAS.flats.rect, 0.9),
  meadow: toRect(AREAS.farbank.rect, 0.9),
  barn: { x0: -41.2, x1: -31.8, z0: -4.3, z1: 1.6 },
  market: { x0: -21.6, x1: -16.4, z0: 10.9, z1: 14.2 },
  visitor: { x0: 18.2, x1: 21, z0: -4, z1: 1 },
};

interface HotspotDef { anchor: V3; pickSize: V3; pickPos: V3 }
const at = (u: number, v: number, y = 0): V3 => [u, y, -v];
export const HOTSPOT_DEF: Record<Hotspot, HotspotDef> = {
  house: { anchor: at(-55, 1, 8.4), pickSize: [10.5, 7, 8.5], pickPos: at(-55, 0.5, 3.4) },
  shed: { anchor: at(4, 1.5, 8.2), pickSize: [17, 6.8, 10], pickPos: at(4.8, -0.6, 3.2) },
  market: { anchor: at(-13, -12.5, 4.2), pickSize: [5, 4.4, 3.6], pickPos: at(-13, -12.4, 2) },
  vet: { anchor: at(17, -12.2, 5), pickSize: [5, 5, 4.4], pickPos: at(17, -12.2, 2.3) },
  fairground: { anchor: at(36, -24.5, 4.4), pickSize: [12, 3.6, 11], pickPos: at(36, -24.5, 1.4) },
  mailbox: { anchor: at(-4.5, -14.3, 2.8), pickSize: [1.8, 2.8, 1.8], pickPos: at(-4.5, -14.3, 1.2) },
};

/** How far the terrain reaches (world units): enough for the widest pan-mode view. */
export const GROUND = { x0: -110, x1: 150, z0: -95, z1: 60 };
/** Static scenery is cut into square tiles this size so the close camera culls most of the valley. */
const TILE = 24;

// ---------------------------------------------------------------- seasonal materials

/** Uniforms shared by every seasonal surface: snow settles on what faces up. */
export const SEASON_U = { uSnow: { value: 0 }, uSnowColor: { value: new THREE.Color("#f7f9fb") } };

function seasonal<T extends THREE.MeshStandardMaterial>(m: T, snowy = true): T {
  if (!snowy) return m;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = SEASON_U.uSnow;
    sh.uniforms.uSnowColor = SEASON_U.uSnowColor;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vUp;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvUp = normalize(mat3(modelMatrix) * objectNormal).y;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vUp;\nuniform float uSnow;\nuniform vec3 uSnowColor;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, uSnow * smoothstep(0.45, 0.8, vUp));");
  };
  m.customProgramCacheKey = () => "seasonal";
  return m;
}

const std = (o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, ...o });

// ---------------------------------------------------------------- the reveal pieces

/** One lockable area in pieces: what goes (scrub, rank grass, broken fence and sign) and what comes (a mended fence, the gate, a trough). */
export interface Land {
  id: AreaId;
  /** Terrain vertex colours: indices into the terrain colour attribute, locked and open colours, and each vertex's (u, v). */
  idx: number[]; from: number[]; to: number[]; uv: number[];
  scrub: THREE.InstancedMesh[];
  scrubM: THREE.Matrix4[][];
  tall: THREE.InstancedMesh | null; tallM: THREE.Matrix4[];
  short: THREE.InstancedMesh | null; shortM: THREE.Matrix4[];
  broken: THREE.Mesh | null;
  posts: THREE.InstancedMesh | null; postsM: THREE.Matrix4[];
  rails: THREE.InstancedMesh | null; railsM: THREE.Matrix4[];
  open: THREE.Mesh | null;
  /** The sweep runs from the gate across the land: 0 at the gate, 1 at the far side. */
  sweep(u: number, v: number): number;
}

export interface FarmBuild {
  group: THREE.Group;
  terrainAttr: THREE.BufferAttribute;
  mats: { terrain: THREE.MeshStandardMaterial; props: THREE.MeshStandardMaterial; foliage: THREE.MeshStandardMaterial; grass: THREE.MeshStandardMaterial; water: THREE.MeshStandardMaterial };
  /** Tree crowns and posts for the ambient birds (world points). */
  perches: THREE.Vector3[];
  /** What lite detail hides at run time: small dense dressing and a third of the grass tufts. */
  dense: { layer: THREE.Object3D; grass: { mesh: THREE.InstancedMesh; base: number; full: number }[] };
  windowMat: THREE.MeshStandardMaterial;
  smoke: THREE.Mesh[];
  smokeAt: THREE.Vector3;
  layers: {
    spring: THREE.Object3D; summer: THREE.Object3D; flowers: THREE.Object3D; clover: THREE.Object3D; autumn: THREE.Object3D; snow: THREE.Object3D;
    bunting: THREE.Object3D; visitor: THREE.Object3D; snugBarn: THREE.Object3D; shearing: THREE.Object3D;
    bridge: THREE.Object3D; bridgeStumps: THREE.Object3D;
  };
  lands: Record<AreaId, Land>;
  /** The meadow grass tufts (hidden under winter snow). */
  grass: THREE.InstancedMesh[];
  hotspotMeshes: Record<Hotspot, THREE.Mesh>;
  hotspotPicks: THREE.Mesh[];
  /** Pieces that cast shadows (for the lite toggle). */
  dispose(): void;
}

export interface FarmOpts { shadows: boolean; lite: boolean }

// ---------------------------------------------------------------- small builders

type B = GeoBatch;
const rot = (b: B, geo: THREE.BufferGeometry | null, u: number, v: number, ry = 0, s = 1, y = 0, target?: B): void => {
  if (!geo) return;
  geo.applyMatrix4(mat([u, y, -v], [0, ry, 0], s));
  (target ?? b).addColored(geo);
};

/** Post-and-rail fence that follows the rolling ground (a rail per bay, tilted with the land). */
function fenceWood(b: B, a: UV, c: UV, h = 1.0, col = P.fence): void {
  const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const n = Math.max(1, Math.round(len / 2.3));
  const ry = Math.atan2(c[1] - a[1], c[0] - a[0]);
  const post = new THREE.Color(col).multiplyScalar(0.9);
  let pu = 0, pv = 0, py = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = lerp(a[0], c[0], t), v = lerp(a[1], c[1], t), y = groundY(u, v);
    b.box(post, [0.17, h + 0.12, 0.17], [u, y + h / 2 - 0.04, -v]);
    b.box(post, [0.2, 0.05, 0.2], [u, y + h + 0.03, -v]);
    if (i > 0) {
      const bl = len / n, tilt = Math.atan2(y - py, bl);
      for (const k of [0.45, 0.85]) b.box(col, [bl + 0.1, 0.08, 0.06], [(u + pu) / 2, (y + py) / 2 + k * h, -(v + pv) / 2], [0, ry, tilt]);
    }
    pu = u; pv = v; py = y;
  }
}

/** The old barn fence helper (x/z space, used by the ported barn, market and fairground). */
function fence(b: B, x0: number, z0: number, x1: number, z1: number, h = 0.9, post = "#f1e8d6", rail = "#e2d4b8"): void {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.round(len / 1.7));
  for (let i = 0; i <= n; i++) { const t = i / n; b.box(post, [0.18, h, 0.18], [x0 + dx * t, h / 2, z0 + dz * t]); }
  const ry = -Math.atan2(dz, dx);
  for (const y of [h * 0.42, h * 0.8]) b.box(rail, [len, 0.09, 0.07], [(x0 + x1) / 2, y, (z0 + z1) / 2], [0, ry, 0]);
}

function triangle(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, w, 0, 0, w / 2, -h, 0, 0, 0, 0, w / 2, -h, 0, w, 0, 0], 3));
  return g;
}

function blob(b: B, rng: Rng, c: THREE.ColorRepresentation, r: number, p: V3, s: V3 | number = 1, det = 1): void {
  b.ico(c, r, det, p, s, [rng() * 3, rng() * 3, rng() * 3]);
}

function kowhai(fo: B, st: B, rng: Rng, u: number, v: number, s: number, spring: B, bloom = 11): void {
  st.cyl(P.trunk, 0.1 * s, 0.17 * s, 1.6 * s, 6, [u, 0.8 * s, -v], [0.1, 0, 0.12]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    blob(fo, rng, P.bush2, 0.65 * s, [u + Math.cos(a) * 0.6 * s, 2.0 * s + rng() * 0.3, -v + Math.sin(a) * 0.6 * s], [1, 0.85, 1]);
  }
  blob(fo, rng, P.bush2, 0.7 * s, [u, 2.5 * s, -v]);
  // kōwhai bloom in spring
  for (let i = 0; i < bloom; i++) {
    const a = rng() * Math.PI * 2, r = (0.5 + rng() * 0.6) * s;
    spring.add(new THREE.OctahedronGeometry(0.13 * s, 0), i % 3 ? P.kowhai : "#f5c64f", mat([u + Math.cos(a) * r, 2.0 * s + rng() * 1.0 * s, -v + Math.sin(a) * r], [0, rng() * 3, 0], [1, 1.5, 1]));
  }
}
function cabbage(fo: B, st: B, rng: Rng, u: number, v: number, s: number): void {
  st.cyl(P.trunk, 0.1 * s, 0.16 * s, 2.4 * s, 6, [u, 1.2 * s, -v]);
  const heads: V3[] = [[0.5 * s, 3.2 * s, 0.1 * s], [-0.4 * s, 3.0 * s, -0.2 * s], [0, 3.5 * s, 0]];
  for (const h of heads) {
    st.cyl(P.trunk, 0.06 * s, 0.09 * s, 1.1 * s, 4, [u + h[0] / 2, 2.6 * s + (h[1] - 2.4 * s) / 2 - 0.2 * s, -v + h[2] / 2], [h[2] * 0.6, 0, -h[0] * 0.6]);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, tilt = 0.9 + (i % 3) * 0.35;
      fo.add(new THREE.ConeGeometry(0.07 * s, 1.1 * s, 3), i % 2 ? P.cabbage : P.fern, mat([u + h[0] + Math.cos(a) * 0.3 * s, h[1], -v + h[2] + Math.sin(a) * 0.3 * s], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt]));
    }
  }
  void rng;
}
function pohutukawa(fo: B, st: B, rng: Rng, u: number, v: number, s: number, summer: B): void {
  for (const [dx, dz, lean] of [[0, 0, 0.25], [0.3, 0.2, -0.35], [-0.2, -0.3, 0.1]] as const) st.cyl(P.trunk, 0.16 * s, 0.26 * s, 1.8 * s, 6, [u + dx * s, 0.8 * s, -v + dz * s], [lean, 0, lean * 0.6]);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    blob(fo, rng, i % 2 ? P.bush : P.bush2, 1.1 * s, [u + Math.cos(a) * 1.3 * s, 2.1 * s + rng() * 0.3, -v + Math.sin(a) * 1.3 * s], [1, 0.72, 1]);
  }
  blob(fo, rng, P.bush2, 1.3 * s, [u, 2.6 * s, -v], [1.1, 0.7, 1.1]);
  // crimson blossom in summer
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 1.9 * s;
    summer.ico("#c9383f", 0.32 * s, 0, [u + Math.cos(a) * r, 2.8 * s + (1.9 * s - r) * 0.3, -v + Math.sin(a) * r], [1, 0.6, 1]);
  }
}
function flax(fo: B, u: number, v: number, s: number): void {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    fo.add(new THREE.ConeGeometry(0.1 * s, 1.5 * s, 3), i % 3 ? P.fern : P.bush, mat([u + Math.cos(a) * 0.2 * s, 0.65 * s, -v + Math.sin(a) * 0.2 * s], [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45], [1, 1, 0.3]));
  }
}
/** Ponga (silver tree fern): a slim dark trunk with a skirt of old fronds and a crown of arching, tapering fronds. */
function ponga(fo: B, st: B, rng: Rng, u: number, v: number, s: number, y: number): void {
  const h = 1.8 * s;
  st.cyl("#5f4e42", 0.14 * s, 0.22 * s, h, 6, [u, y + h / 2, -v]);
  st.cone("#7c6450", 0.36 * s, 0.75 * s, 7, [u, y + h - 0.3 * s, -v], [Math.PI, 0, 0]);
  const n = 14;
  const greens = ["#5d9467", "#6b9f70", "#578a60"];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.25;
    const up = i % 2 === 0;
    const lift = (up ? 0.75 : 0.35) + rng() * 0.2;
    let px = u, py = y + h + (up ? 0.08 * s : 0), pz = -v;
    // three segments, each drooping more and narrower: an arching frond that falls away at the tip
    for (let k = 0; k < 3; k++) {
      const len = (0.55 - k * 0.07) * s, pitch = lift - k * 0.62, w = (0.3 - k * 0.08) * s;
      const dx = Math.cos(a) * Math.cos(pitch) * len, dy = Math.sin(pitch) * len, dz = Math.sin(a) * Math.cos(pitch) * len;
      fo.add(new THREE.BoxGeometry(len, 0.03 * s, w).translate(len / 2, 0, 0), greens[(i + k) % 3]!, mat([px, py, pz], [0, -a, pitch]));
      px += dx; py += dy; pz += dz;
    }
  }
}
function bushClump(fo: B, rng: Rng, u: number, v: number, s: number, y: number, det = 1): void {
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = (0.9 + rng() * 0.6) * s;
    blob(fo, rng, rng() < 0.5 ? P.bush : P.bush2, r, [u + (rng() - 0.5) * 2 * s, y + r * 0.9 + rng() * 0.8 * s, -v + (rng() - 0.5) * 2 * s], [1, 1.15, 1], det);
  }
}
function tussock(b: B, rng: Rng, u: number, v: number, s: number, y: number): void {
  const cols = ["#d9c07e", "#c9a25a", "#e3cf9a"];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng();
    const tilt = 0.35 + rng() * 0.35;
    b.add(new THREE.ConeGeometry(0.08 * s, 1.0 * s, 3), cols[i % 3]!, mat([u + Math.cos(a) * 0.15 * s, y + 0.42 * s, -v + Math.sin(a) * 0.15 * s], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt]));
  }
}
function rushes(b: B, u: number, v: number, y = groundY(u, v)): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add(new THREE.ConeGeometry(0.06, 1.2, 3), i % 2 ? "#7d8a4f" : "#96905a", mat([u + Math.cos(a) * 0.2, y + 0.55, -v + Math.sin(a) * 0.2], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]));
  }
}
function trough(b: B, u: number, v: number, y = groundY(u, v)): void {
  // a concrete trough on a little plinth, with a ball-cock box at one end
  b.box("#c3cbcf", [1.9, 0.55, 0.8], [u, y + 0.3, -v]);
  b.box("#aab4ba", [2.0, 0.08, 0.9], [u, y + 0.04, -v]);
  b.box("#8fc3d6", [1.66, 0.05, 0.56], [u, y + 0.56, -v]);
  b.box("#b3bcc1", [0.4, 0.62, 0.8], [u + 1.1, y + 0.31, -v]);
  b.cyl("#8e979c", 0.04, 0.04, 1.2, 5, [u + 1.35, y + 0.15, -v - 0.25], [0, 0, Math.PI / 2]);
}
function bale(b: B, u: number, v: number, y = groundY(u, v), ry = 0.3): void {
  b.cyl("#e2c77e", 0.62, 0.62, 1.0, 14, [u, y + 0.6, -v], [Math.PI / 2, 0, ry]);
  b.cyl("#d3b56a", 0.5, 0.5, 1.02, 14, [u, y + 0.6, -v], [Math.PI / 2, 0, ry]);
  b.cyl("#c9a95c", 0.3, 0.3, 1.04, 10, [u, y + 0.6, -v], [Math.PI / 2, 0, ry]);
}
/** A five-bar galvanised gate swung open, hinged at (u, v), across the gate gap. */
function gate(b: B, u: number, v: number, ry: number, y = groundY(u, v)): void {
  const g = new GeoBatch();
  for (let i = 0; i < 5; i++) g.box("#c9cdd0", [3.4, 0.06, 0.06], [1.7, 0.3 + i * 0.2, 0]);
  g.box("#c9cdd0", [0.07, 1.0, 0.07], [0.05, 0.7, 0]);
  g.box("#c9cdd0", [0.07, 1.0, 0.07], [3.35, 0.7, 0]);
  g.box("#c9cdd0", [3.6, 0.05, 0.05], [1.7, 0.7, 0], [0, 0, 0.27]);
  g.box("#9d8163", [0.26, 1.3, 0.26], [0, 0.65, 0]);
  // the latch: a sliding bolt and a loop of chain at the free end
  g.box("#7d858a", [0.28, 0.06, 0.1], [3.42, 0.95, 0]);
  g.box("#e0b449", [0.08, 0.14, 0.12], [3.3, 0.95, 0]);
  for (let i = 0; i < 4; i++) g.ico("#8e969b", 0.035, 0, [3.5, 0.9 - i * 0.07, 0.02 * (i % 2)]);
  rot(b, g.build(), u, v, ry, 1, y);
}
function brokenFence(b: B, rng: Rng, a: UV, c: UV): void {
  const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const n = Math.max(1, Math.round(len / 2.6));
  const grey = "#b7a893";
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = lerp(a[0], c[0], t), v = lerp(a[1], c[1], t);
    if (rng() < 0.16) { prev = null; continue; }
    const y = groundY(u, v);
    b.box(grey, [0.16, 0.95, 0.16], [u, y + 0.42, -v], [(rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5]);
    const p = new THREE.Vector3(u, y, -v);
    if (prev && rng() < 0.5) {
      const mid = prev.clone().add(p).multiplyScalar(0.5);
      const d = p.clone().sub(prev);
      b.box(grey, [Math.hypot(d.x, d.z), 0.07, 0.06], [mid.x, mid.y + 0.4 + rng() * 0.3, mid.z], [0, -Math.atan2(d.z, d.x), (rng() - 0.5) * 0.35]);
    }
    prev = p;
  }
}
function signPost(b: B, u: number, v: number, y = 0): void {
  b.box(P.trunk, [0.16, 2.0, 0.16], [u - 0.9, y + 1.0, -v]);
  b.box(P.trunk, [0.16, 2.0, 0.16], [u + 0.9, y + 1.0, -v]);
  b.box("#efe4cf", [2.4, 1.1, 0.1], [u, y + 1.55, -v + 0.1]);
  b.box("#c2574a", [1.8, 0.14, 0.12], [u, y + 1.75, -v + 0.12]);
  b.box("#b9a58a", [1.4, 0.1, 0.12], [u, y + 1.4, -v + 0.12]);
}

// ---------------------------------------------------------------- terrain

/** Clover patches (u, v, radius) for this farm: a cooler, darker green baked into the pasture colours. */
let CLOVER: [number, number, number][] = [];
function placeClover(seed: number, lite: boolean): void {
  CLOVER = [];
  const r3 = mulberry32(seed ^ 0xc10e);
  for (let i = 0, placed = 0; i < 500 && placed < (lite ? 30 : 60); i++) {
    const u = -34 + r3() * 64, v = -16 + r3() * 30;
    if (Math.abs(v - roadV(u)) < 2.5 || TRACKS.some((t) => lineDist(u, v, t) < 1.5)) continue;
    const inHome = softRect(u, v, AREAS.home.rect, 0.5) > 0.5;
    if (!inHome && r3() < 0.55) continue;
    if (SOLIDS.some((r) => u > r[0] - 1 && u < r[1] + 1 && v > r[2] - 1 && v < r[3] + 1)) continue;
    placed++;
    const big = r3() < 0.35;
    CLOVER.push([u, v, big ? 1.8 + r3() * 1.4 : 1.0 + r3() * 0.7]);
  }
}

function groundColour(u: number, v: number, h: number, slope: number, jit: number, openSet: Set<AreaId>): THREE.Color {
  const hex = (c: string) => new THREE.Color(c);
  const blot = Math.sin(u * 0.31 + Math.cos(v * 0.23) * 2) * Math.cos(v * 0.27 - u * 0.05);
  const fine = Math.sin(u * 1.7 + v * 0.9) * Math.sin(v * 1.3 - u * 0.6);
  const c = hex(P.grass).lerp(hex(P.hill), 0.3 + 0.25 * blot);
  c.lerp(hex(P.tussock), ss(3.5, 8, h) * 0.85);
  for (const id of AREA_IDS) {
    const a = AREAS[id];
    const w = softRect(u, v, a.rect, 0.8);
    if (w <= 0) continue;
    if (openSet.has(id)) {
      const lush = hex(P.grass2).lerp(hex(P.grass), 0.15 + 0.2 * blot);
      lush.multiplyScalar(1 + 0.03 * Math.sin((u + v * 0.3) * 0.9));
      lush.lerp(hex("#b8d98f"), Math.max(0, fine) * 0.25);
      c.lerp(lush, w);
    } else {
      const rank = hex(P.rank).lerp(hex("#9aa27a"), 0.5 + 0.4 * blot);
      if (a.wet) rank.lerp(hex("#8f9c74"), 0.6);
      if (a.tussock) rank.lerp(hex(P.tussock), 0.5);
      rank.lerp(hex("#8c8f68"), Math.max(0, fine) * 0.35);
      c.lerp(rank, w * 0.85);
    }
  }
  // yards, the homestead lawn, the showground
  c.lerp(hex("#d8ccae"), 0.55 * (1 - ss(3, 6, Math.hypot((u - 17.5) * 0.8, v - 1.5))));
  c.lerp(hex(P.grass2), 0.5 * (1 - ss(5, 9, Math.hypot(u + 55, v + 1))));
  c.lerp(hex("#e3d9b4"), 0.35 * (1 - ss(4, 7, Math.hypot(u - 36, v + 24.5))));
  c.lerp(hex("#dccfa6"), 0.5 * (1 - ss(3.5, 5.5, Math.hypot((u + 36.5) * 0.7, v - 1.2))));
  const b = bushScore(u, v);
  if (b > BUSH_AT - 0.05) c.lerp(hex(P.bush), 0.55 * ss(BUSH_AT - 0.05, BUSH_AT + 0.1, b));
  if (slope > 0.8) c.lerp(hex(P.rock), ss(0.8, 1.6, slope) * 0.5);
  if (h > 19 + 1.5 * Math.sin(u * 0.2)) c.lerp(hex(P.snow), ss(19, 21, h));
  const d = v - creekV(u);
  if (Math.abs(d) < 3.2) c.lerp(hex(P.soil), 0.55 * (1 - ss(2, 3.2, Math.abs(d))));
  const rd = Math.abs(v - roadV(u));
  if (rd < 1.8) c.lerp(hex(P.road), 1 - ss(1.3, 1.8, rd));
  // worn tracks and paths (the bridge approach only once the far bank is open)
  TRACKS.forEach((t, i) => {
    if (i === 3) return; // the bridge approach (behind the woolshed) stays grass
    const td = lineDist(u, v, t), w = RUTTED.has(i) ? 1.15 : 0.7;
    if (td < w + 0.9) c.lerp(hex(RUTTED.has(i) ? "#dccca4" : "#d6c9a2"), 0.88 * (1 - ss(w * 0.55, w + 0.9, td)));
  });
  for (const t of SHEEP_TRACKS) { const td = lineDist(u, v, t); if (td < 1.1) c.lerp(hex("#c9c998"), 0.45 * (1 - ss(0.2, 1.1, td))); }
  // hoof-churned mud at gates and the trough, bare earth under the shade tree, hay fed out by the bale
  const spots: [number, number, number, string][] = [
    [AREAS.home.rect[1] - 0.4, AREAS.home.gate.at, 2.3, "#a88f6a"], [AREAS.home.rect[1] + 1.4, AREAS.home.gate.at - 0.5, 1.8, "#b29a74"],
    [-27.5, 5.7, 2.2, "#ab936e"], [-15.4, 5.6, 2.8, "#c4b489"], [-9, 5.3, 1.9, "#ccb880"], [-26.6, -6.9, 1.6, "#bdb088"],
  ];
  for (const id of ["flats", "rushy", "farbank", "terraces"] as AreaId[]) {
    if (!openSet.has(id)) continue;
    const a = AREAS[id], g = a.gate;
    spots.push([g.side === "w" ? a.rect[0] + 0.6 : g.at, g.side === "s" ? a.rect[2] + 0.6 : g.at, 2.1, "#a88f6a"]);
  }
  for (const [su, sv, sr, col] of spots) {
    const sd = Math.hypot(u - su, (v - sv) * 1.15);
    if (sd < sr + 0.8) c.lerp(hex(col), 0.9 * (1 - ss(sr * 0.35, sr + 0.8, sd + 0.25 * Math.sin(u * 3.1 + v * 2.3))));
  }
  // mottled pasture: sunny dry patches, lusher hollows, clover-dark drifts (varied, not uniform noise)
  const floor = d < 2 && h > -0.2 && h < 1.2;
  if (floor) {
    const dry = Math.sin(u * 0.47 + Math.sin(v * 0.38) * 1.7) * Math.sin(v * 0.52 - u * 0.17 + 0.8);
    const lush = Math.sin(u * 0.29 - v * 0.21 + 2.2) * Math.cos(v * 0.33 + u * 0.12);
    if (dry > 0.35) c.lerp(hex("#c9d58f"), (dry - 0.35) * 0.5);
    if (lush > 0.4) c.lerp(hex("#8ec07a"), (lush - 0.4) * 0.55);
    for (const [cu, cv, cr] of CLOVER) {
      const cd = Math.hypot(u - cu, v - cv);
      if (cd < cr) c.lerp(hex("#86b877"), 0.5 * (1 - ss(cr * 0.4, cr, cd + 0.3 * Math.sin(u * 2.3 + v * 1.7))));
    }
    // hollows a touch greener, rises a touch sunnier
    c.multiplyScalar(1 + (h - 0.1) * 0.05);
  }
  // soft baked occlusion round buildings, walls, hedges and trunks
  let ao = 0;
  for (const r of SOLIDS) {
    const dx = Math.max(r[0] - u, 0, u - r[1]), dv = Math.max(r[2] - v, 0, v - r[3]);
    const dd = Math.hypot(dx, dv);
    if (dd < 2.2) ao = Math.max(ao, (1 - ss(0, 2.2, dd)) * 0.13);
  }
  for (const w of [...STONE_WALLS, ...HEDGES]) { const wd = lineDist(u, v, w); if (wd < 1.8) ao = Math.max(ao, (1 - ss(0.2, 1.8, wd)) * 0.12); }
  for (const [kind, tu, tv, ts] of TREES) {
    if (Math.abs(u - tu) > 4 || Math.abs(v - tv) > 4) continue;
    if (kind === "flax" || kind === "toetoe" || kind === "cabbage") continue;
    const r = 2.6 * ts;
    const td = Math.hypot(u - tu, v - tv);
    if (td < r) ao = Math.max(ao, (1 - ss(0.5, r, td)) * 0.1);
  }
  c.multiplyScalar(1 - ao);
  c.multiplyScalar(0.985 + jit * 0.03);
  return c;
}

// ---------------------------------------------------------------- build

export function buildFarm(seed: number, opts: FarmOpts): FarmBuild {
  const rng = mulberry32(0x5eed ^ seed);
  placeClover(seed, opts.lite);
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const shadows = opts.shadows;
  const terrainMat = seasonal(std());
  const propMat = seasonal(std());
  const foliageMat = seasonal(std());
  const grassMat = seasonal(std({ roughness: 1 }));
  const waterMat = std({ roughness: 0.2 });
  const plainMat = std();
  const windowMat = std({ color: "#a9cbe0", emissive: "#ffc766", emissiveIntensity: 0, vertexColors: true });
  // soft contact shadows, wheel ruts and clover: multiplied onto whatever is under them, white = no change
  const shadeMat = new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  disposables.push(terrainMat, propMat, foliageMat, grassMat, waterMat, plainMat, windowMat, shadeMat);

  const mk = (b: GeoBatch, m: THREE.Material, cast = true, receive = true, parent: THREE.Object3D = group, smooth = false): THREE.Mesh | null => {
    let g = b.build();
    if (!g) return null;
    if (smooth) g = smoothGeo(g);
    disposables.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = shadows && cast;
    mesh.receiveShadow = shadows && receive;
    parent.add(mesh);
    return mesh;
  };
  const layer = (kind = "layer"): THREE.Group => { const gr = new THREE.Group(); gr.userData.kind = kind; group.add(gr); return gr; };
  /** Build a big batch as square tiles (by triangle centre) so the camera culls what it can't see. */
  const tiled = (b: GeoBatch, m: THREE.Material, cast: boolean, receive: boolean, smooth: boolean, parent: THREE.Object3D = group, tile = TILE, kind = ""): void => {
    const g = b.build();
    if (!g) return;
    const pos = g.getAttribute("position"), col = g.getAttribute("color");
    const buckets = new Map<string, number[]>();
    for (let t = 0; t < pos.count; t += 3) {
      const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      const off = tile >= 1000 ? tile / 2 : 0; // one huge tile (lite) must not split at x = 0 / z = 0
      const key = `${Math.floor((cx + off) / tile)},${Math.floor((cz + off) / tile)}`;
      let list = buckets.get(key);
      if (!list) { list = []; buckets.set(key, list); }
      list.push(t);
    }
    for (const list of buckets.values()) {
      const P = new Float32Array(list.length * 9), C = new Float32Array(list.length * 9);
      list.forEach((t, k) => { for (let v = 0; v < 3; v++) { P.set([pos.getX(t + v), pos.getY(t + v), pos.getZ(t + v)], k * 9 + v * 3); C.set([col.getX(t + v), col.getY(t + v), col.getZ(t + v)], k * 9 + v * 3); } });
      let tg = new THREE.BufferGeometry();
      tg.setAttribute("position", new THREE.BufferAttribute(P, 3));
      tg.setAttribute("color", new THREE.BufferAttribute(C, 3));
      tg.computeVertexNormals();
      if (smooth) tg = smoothGeo(tg);
      tg.computeBoundingSphere();
      disposables.push(tg);
      const mesh = new THREE.Mesh(tg, m);
      mesh.castShadow = shadows && cast;
      mesh.receiveShadow = shadows && receive;
      if (m === shadeMat) mesh.renderOrder = 1;
      if (kind) mesh.userData.kind = kind;
      parent.add(mesh);
    }
    g.dispose();
  };

  /** Tile size for the thin layers (flowers, blossom, contact shadows): lite trades culling for fewer draws. */
  const THIN = opts.lite ? 1e5 : TILE * 3;
  const st = new GeoBatch(0, rng); // buildings, fences, trunks
  const fo = new GeoBatch(0, rng); // foliage (smooth)
  const flat = new GeoBatch(0, rng); // decals that don't cast
  const shade = new GeoBatch(0, rng); // contact shadows (multiplied; all year)
  const wear = new GeoBatch(0, rng); // wheel ruts, sheep tracks, wet mud (multiplied; hidden under snow)

  const dense = new GeoBatch(0, rng); // small dense dressing lite hides (thistles, hay scraps)
  const denseGrass: { mesh: THREE.InstancedMesh; base: number; full: number }[] = [];
  const spring = new GeoBatch(0, rng);
  const summer = new GeoBatch(0, rng);
  const flowers = new GeoBatch(0, rng);
  const autumn = new GeoBatch(0, rng);
  const snow = new GeoBatch(0, rng);
  const win = new GeoBatch(0, rng);

  // ---------------------------------------------------------------- terrain (vertex colours carry paddocks, tracks, the bush)
  const lands = {} as Record<AreaId, Land>;
  const grassTiles: THREE.InstancedMesh[] = [];
  const lockable: AreaId[] = ["flats", "rushy", "farbank", "terraces"];
  for (const id of AREA_IDS) {
    const a = AREAS[id];
    const [u0, u1, v0, v1] = a.rect;
    const g = a.gate;
    const gu = g.side === "w" ? u0 : g.side === "e" ? u1 : g.at, gv = g.side === "s" ? v0 : g.side === "n" ? v1 : g.at;
    const far = Math.max(Math.hypot(u1 - u0, v1 - v0), 1);
    lands[id] = {
      id, idx: [], from: [], to: [], uv: [], scrub: [], scrubM: [], tall: null, tallM: [], short: null, shortM: [],
      broken: null, posts: null, postsM: [], rails: null, railsM: [], open: null,
      sweep: (u, v) => Math.min(1, Math.hypot(u - gu, v - gv) / far),
    };
  }
  let terrainAttr: THREE.BufferAttribute;
  {
    // fine spacing over the farm (the swells and the tracks need it), coarser out on the hills
    const S = opts.lite ? 1.6 : 1.1, SC = opts.lite ? 3.2 : 2.6;
    const U0 = GROUND.x0, U1 = GROUND.x1, V0 = -GROUND.z1, V1 = -GROUND.z0;
    const axis = (a0: number, a1: number, f0: number, f1: number): number[] => {
      const out: number[] = [];
      for (let x = a0; x < f0; x += SC) out.push(x);
      for (let x = f0; x < f1; x += S) out.push(x);
      for (let x = f1; x < a1; x += SC) out.push(x);
      out.push(a1);
      return out;
    };
    const US = axis(U0, U1, -76, 100), VS = axis(V0, V1, -36, 44);
    const nu = US.length - 1, nv = VS.length - 1;
    const pos = new Float32Array((nu + 1) * (nv + 1) * 3), col = new Float32Array((nu + 1) * (nv + 1) * 3);
    const home = new Set<AreaId>(["home"]);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = US[i]!, v = VS[j]!;
      const h = height(u, v);
      const slope = Math.hypot(height(u + 0.5, v) - h, height(u, v + 0.5) - h) * 2;
      const jit = rng();
      const c = groundColour(u, v, h, slope, jit, home);
      const k = (j * (nu + 1) + i) * 3;
      for (const id of lockable) {
        if (softRect(u, v, AREAS[id].rect, 0.8) <= 0) continue;
        const L = lands[id];
        const o = groundColour(u, v, h, slope, jit, new Set<AreaId>(["home", id]));
        L.idx.push(k); L.from.push(c.r, c.g, c.b); L.to.push(o.r, o.g, o.b); L.uv.push(u, v);
      }
      pos[k] = u; pos[k + 1] = h; pos[k + 2] = -v;
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
    // one set of vertices (shared attributes, so the land reveal's colour updates land everywhere), drawn as
    // square tiles with their own index lists so the close camera culls most of the valley
    const tileIdx = new Map<string, { idx: number[]; min: THREE.Vector3; max: THREE.Vector3 }>();
    const TT = opts.lite ? 1e5 : TILE * 2.7, TO = opts.lite ? 5e4 : 0; // lite: one terrain draw
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      const key = `${Math.floor(((US[i]! + US[i + 1]!) / 2 + TO) / TT)},${Math.floor(((VS[j]! + VS[j + 1]!) / 2 + TO) / TT)}`;
      let t = tileIdx.get(key);
      if (!t) { t = { idx: [], min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity) }; tileIdx.set(key, t); }
      // split each quad along the diagonal that follows the land (no saw-tooth on the swells)
      const ha = pos[a * 3 + 1]!, hb = pos[b * 3 + 1]!, hc = pos[c * 3 + 1]!, hd = pos[d * 3 + 1]!;
      if (Math.abs(ha - hd) <= Math.abs(hb - hc)) t.idx.push(a, b, d, a, d, c);
      else t.idx.push(a, b, c, b, d, c);
      for (const k of [a, d]) { t.min.min(new THREE.Vector3(pos[k * 3]!, pos[k * 3 + 1]!, pos[k * 3 + 2]!)); t.max.max(new THREE.Vector3(pos[k * 3]!, pos[k * 3 + 1]!, pos[k * 3 + 2]!)); }
    }
    const g = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3);
    g.setAttribute("position", posAttr);
    terrainAttr = new THREE.BufferAttribute(col, 3);
    g.setAttribute("color", terrainAttr);
    // smooth normals over the whole grid (from every tile's triangles)
    g.setIndex([...tileIdx.values()].flatMap((t) => t.idx));
    g.computeVertexNormals();
    const normAttr = g.getAttribute("normal");
    disposables.push(g);
    for (const t of tileIdx.values()) {
      const tg = new THREE.BufferGeometry();
      tg.setAttribute("position", posAttr);
      tg.setAttribute("color", terrainAttr);
      tg.setAttribute("normal", normAttr);
      tg.setIndex(t.idx);
      tg.boundingBox = new THREE.Box3(t.min.clone().addScalar(-0.5), t.max.clone().addScalar(0.5));
      tg.boundingSphere = tg.boundingBox.getBoundingSphere(new THREE.Sphere());
      disposables.push(tg);
      const tm = new THREE.Mesh(tg, terrainMat);
      tm.userData.kind = "terrain";
      tm.receiveShadow = shadows;
      group.add(tm);
    }
    // the creek: a ribbon of water, deeper blue down the middle
    const wpos: number[] = [], wcol: number[] = [];
    const shallow = new THREE.Color("#a6d2df"), deep = new THREE.Color("#6fa9c4");
    const Y = -0.3, w = 2.1;
    for (let u = U0; u < U1; u += 1) {
      const a0 = creekV(u), a1 = creekV(u + 1);
      const quad = (p: V3[], c: THREE.Color[]) => { for (let k = 0; k < 3; k++) { wpos.push(...p[k]!); wcol.push(c[k]!.r, c[k]!.g, c[k]!.b); } };
      const L0: V3 = [u, Y, -(a0 - w)], L1: V3 = [u + 1, Y, -(a1 - w)], M0: V3 = [u, Y, -a0], M1: V3 = [u + 1, Y, -a1], R0: V3 = [u, Y, -(a0 + w)], R1: V3 = [u + 1, Y, -(a1 + w)];
      quad([L0, L1, M0], [shallow, shallow, deep]); quad([L1, M1, M0], [shallow, deep, deep]);
      quad([M0, M1, R0], [deep, deep, shallow]); quad([M1, R1, R0], [deep, shallow, shallow]);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(wpos, 3));
    wg.setAttribute("color", new THREE.Float32BufferAttribute(wcol, 3));
    wg.computeVertexNormals();
    disposables.push(wg);
    const wm = new THREE.Mesh(wg, waterMat);
    wm.userData.kind = "water";
    wm.receiveShadow = shadows;
    group.add(wm);
  }

  // ---------------------------------------------------------------- homestead (hotspot "house")
  const house = new GeoBatch(0, rng);
  {
    const hb = new GeoBatch(0, rng);
    hb.box(P.wall, [5, 2.2, 3.6], [0, 1.3, 0]);
    hb.box(P.soil, [5.2, 0.3, 3.8], [0, 0.15, 0]);
    hb.add(new THREE.ConeGeometry(3.6, 1.8, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.78), P.roofIron, mat([0, 3.2, 0]));
    hb.box(P.wall, [2.2, 2.0, 1.6], [1.4, 1.2, 2.3]);
    hb.gable(P.roofIron, 2.4, 1.9, 1.1, [1.4, 2.2, 2.3], Math.PI / 2);
    hb.box(P.roofIron, [3.1, 0.12, 1.4], [-1.0, 2.25, 2.3], [0.18, 0, 0]);
    for (const x of [-2.4, -1.0, 0.3]) hb.cyl(P.trim, 0.06, 0.06, 2.0, 4, [x, 1.2, 2.9]);
    hb.box(P.fence, [3.1, 0.12, 1.3], [-1.0, 0.3, 2.3]);
    hb.box(P.roofRed, [0.6, 1.2, 0.06], [-0.1, 1.0, 1.83]);
    hb.box(P.roofRed, [0.5, 1.6, 0.5], [-1.6, 3.6, -0.6]);
    hb.cyl(P.roofIron, 0.8, 0.8, 1.7, 12, [3.4, 0.95, -0.8]);
    hb.cone(P.roofIron, 0.85, 0.35, 12, [3.4, 1.98, -0.8]);
    hb.cyl("#2f3a2f", 0.1, 0.1, 0.4, 5, [-0.3, 0.5, 2.7]);
    hb.cyl("#2f3a2f", 0.1, 0.1, 0.4, 5, [-0.05, 0.5, 2.75]);
    for (let i = 0; i < 6; i++) blob(hb, rng, i % 2 ? P.kowhai : P.pohutukawa, 0.28, [-2.6 + i * 0.5, 0.35, 3.6], [1, 0.8, 1]);
    rot(house, hb.build(), SPOTS.homestead[0], SPOTS.homestead[1], -0.1, 1.7);
    const wb = new GeoBatch(0, rng);
    for (const x of [-1.8, -0.4]) wb.box("#ffffff", [0.7, 0.9, 0.06], [x, 1.5, 1.84]);
    wb.box("#ffffff", [0.7, 0.9, 0.06], [1.4, 1.4, 3.14]);
    rot(win, wb.build(), SPOTS.homestead[0], SPOTS.homestead[1], -0.1, 1.7);
    const sb = new GeoBatch(0, rng);
    sb.add(new THREE.ConeGeometry(3.7, 1.85, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.78), P.snow, mat([0, 3.25, 0]));
    rot(snow, sb.build(), SPOTS.homestead[0], SPOTS.homestead[1], -0.1, 1.7);
  }
  // garden fence, the shelter belt behind
  for (const [a, c] of FENCES.slice(0, 2)) fenceWood(st, a, c, 0.9);
  for (let u = -76; u < -40; u += 2.6) {
    const v = 10.5 + (Math.abs(u) % 2);
    st.cyl(P.trunk, 0.25, 0.35, 2, 6, [u, 1, -v]);
    for (let i = 0; i < 3; i++) blob(fo, rng, i % 2 ? "#4e7a5a" : "#5c8a64", 1.7 - i * 0.3, [u + (rng() - 0.5) * 0.5, 2.6 + i * 1.3, -v - 0.5 + (rng() - 0.5)], [1, 0.8, 1]);
  }

  // ---------------------------------------------------------------- the barn (lean-to, zone "barn"), ported from the diorama and moved
  const BX = -19; // the old barn's x shift
  const snugL = layer();
  {
    const b = new GeoBatch(0.02, rng);
    b.box("#e8d596", [10.6, 0.05, 7.2], [-17.5, 0.03, -1.55]);
    b.box("#b5835a", [11.2, 2.9, 0.3], [-17.5, 1.45, -5.2]);
    b.box("#a9774f", [0.3, 2.9, 2.8], [-23, 1.45, -3.85]);
    for (const x of [-22.8, -17.5, -12.2]) b.cyl("#9c6b4a", 0.13, 0.15, 2.5, 6, [x, 1.25, -2.6]);
    b.box("#cf7560", [11.8, 0.18, 3.4], [-17.5, 2.75, -3.95], [0.2, 0, 0]);
    for (const [x, z] of [[-22.2, -4.4], [-21.1, -4.4], [-22.2, -3.4]] as const) b.box("#e8cc72", [1, 0.7, 0.9], [x, 0.35, z]);
    b.box("#e8cc72", [1, 0.7, 0.9], [-21.65, 1.05, -4.4]);
    b.box("#c89668", [2.2, 0.5, 0.6], [-15, 0.3, -4.6]);
    fence(b, -23, 2.3, -15.2, 2.3, 0.8, "#c89668", "#b98a5e");
    fence(b, -13.8, 2.3, -12, 2.3, 0.8, "#c89668", "#b98a5e");
    fence(b, -23, -2.6, -23, 2.3, 0.8, "#c89668", "#b98a5e");
    const g = b.build()!;
    g.translate(BX, 0, 0);
    st.addColored(g);
    const s = new GeoBatch(0, rng);
    s.box(P.snow, [11.9, 0.08, 3.45], [-17.5 + BX, 2.87, -3.95], [0.2, 0, 0]);
    snow.addColored(s.build()!);
    win.box("#ffffff", [0.25, 0.35, 0.25], [-17.5 + BX, 2.2, -2.45]);
    // the snug barn upgrade: a second wall, kick boards, a red door, hay and a weathervane
    const u = new GeoBatch(0.03, rng);
    u.box("#a9774f", [0.3, 2.9, 2.8], [-12.05, 1.45, -3.85]);
    for (const [x0, x1] of [[-22.8, -19.2], [-15.8, -12.2]] as const) {
      const n = Math.round((x1 - x0) / 0.45);
      for (let i = 0; i < n; i++) u.box(i % 2 ? "#b98a5e" : "#c69466", [0.44, 0.95, 0.1], [x0 + (i + 0.5) * ((x1 - x0) / n), 0.48, -2.45]);
    }
    u.box("#d0574c", [0.08, 1.8, 1.3], [-11.86, 0.9, -3.85]);
    u.box("#f4e9d8", [0.06, 2.1, 0.1], [-11.8, 0.9, -3.85], [0.64, 0, 0]);
    u.box("#f4e9d8", [0.06, 2.1, 0.1], [-11.8, 0.9, -3.85], [-0.64, 0, 0]);
    u.box("#e8cc72", [1.1, 0.7, 0.9], [-13.2, 0.35, -4.5]);
    u.box("#e8cc72", [1.1, 0.7, 0.9], [-14.4, 0.35, -4.5]);
    u.box("#8a8f96", [0.06, 1.1, 0.06], [-17.5, 3.6, -4.8]);
    u.box("#8a8f96", [0.7, 0.05, 0.05], [-17.5, 4.05, -4.8]);
    u.ico("#f2c257", 0.08, 0, [-17.5, 4.15, -4.8]);
    const ug = u.build()!;
    ug.translate(BX, 0, 0);
    const ub = new GeoBatch(); ub.addColored(ug);
    mk(ub, propMat, true, true, snugL);
  }

  // ---------------------------------------------------------------- the home paddock: fence, open gate, trough, a bale
  for (const [a, c] of areaFence(AREAS.home)) fenceWood(st, a, c);
  gate(st, AREAS.home.rect[1], AREAS.home.gate.at - 1.8, 0.2);
  trough(st, -27.5, 6.8);
  bale(st, -9, 6.5);

  // ---------------------------------------------------------------- woolshed with the verandah stations (hotspot "shed")
  const shed = new GeoBatch(0, rng);
  {
    const [u, v] = SPOTS.woolshed;
    const S = 1.75, W = 7.4 * S, D = 3.8 * S;
    const b = new GeoBatch(0, rng);
    for (let i = -4; i <= 4; i++) for (const z of [-D / 2 + 0.2, D / 2 - 0.2]) b.box(P.trunk, [0.3, 0.8, 0.3], [i * (W / 9), 0.4, z]);
    b.box(P.shedWall, [W, 4.2, D], [0, 2.9, 0]);
    b.gable(P.roofRed, W + 0.8, D + 1.2, 2.6, [0, 5.0, 0]);
    b.box(P.shedWall, [4.2, 3.0, 4.2], [-W / 2 - 2.1, 2.3, -0.6]);
    b.box(P.roofRed, [4.8, 0.14, 4.8], [-W / 2 - 2.1, 4.35, -0.6], [0, 0, 0.18]);
    b.box(P.wall, [2.4, 2.8, 0.06], [W * 0.3, 2.2, D / 2 + 0.02]);
    b.box(P.fence, [0.1, 2.8, 0.08], [W * 0.3, 2.2, D / 2 + 0.05]);
    for (let i = -6; i <= 6; i++) b.box("#c9786b", [0.08, 4.2, 0.05], [i * (W / 13), 2.9, D / 2 + 0.01]);
    b.box(P.roofRed, [W * 0.72, 0.14, 1.6], [-W * 0.13, 4.3, D / 2 + 0.75], [0.3, 0, 0]);
    b.box(P.fence, [W * 0.74, 0.16, 4.4], [-W * 0.13, 0.55, D / 2 + 2.1]);
    // three station bays: benches with a little wool and an empty perch (birds come in a later phase)
    const bays = [{ bench: "#e7d3a8", x: -W * 0.37 }, { bench: "#d9c6e0", x: -W * 0.13 }, { bench: "#bcd8c0", x: W * 0.11 }];
    for (const [k, bay] of bays.entries()) {
      b.box("#c2a88c", [2.0, 0.12, 1.1], [bay.x, 1.55, D / 2 + 2.6]);
      for (const dx of [-0.85, 0.85]) b.box("#a08670", [0.12, 1.0, 1.0], [bay.x + dx, 1.05, D / 2 + 2.6]);
      b.box(bay.bench, [1.9, 0.06, 1.0], [bay.x, 1.63, D / 2 + 2.6]);
      if (k === 0) for (let i = 0; i < 4; i++) b.ico("#efe6d4", 0.26, 1, [bay.x - 0.5 + i * 0.3, 1.82, D / 2 + 2.5 + (i % 2) * 0.2], [1.3, 0.7, 1]);
      if (k === 1) { b.cyl("#8a6d55", 0.35, 0.35, 0.08, 16, [bay.x - 0.35, 1.7, D / 2 + 2.6]); b.ico("#e39a95", 0.2, 1, [bay.x + 0.4, 1.82, D / 2 + 2.6]); }
      if (k === 2) { b.box("#c0a9cf", [0.7, 0.06, 0.5], [bay.x - 0.2, 1.7, D / 2 + 2.6]); b.cyl("#d9cbb4", 0.02, 0.02, 0.9, 5, [bay.x - 0.1, 1.85, D / 2 + 2.6], [0, 0, 1.2]); }
      b.cyl(P.trunk, 0.05, 0.05, 1.0, 5, [bay.x + 0.7, 2.1, D / 2 + 3.5]);
      b.box(P.trunk, [0.7, 0.07, 0.07], [bay.x + 0.7, 2.6, D / 2 + 3.5]);
    }
    for (let i = 0; i < 3; i++) b.box("#efe6d4", [1.0, 1.1, 0.9], [W * 0.43 + (i % 2) * 0.2, 1.35 + Math.floor(i / 2) * 1.1, D / 2 + 1.0 + (i === 1 ? 1.0 : 0)]);
    b.box(P.fence, [1.4, 0.14, 3.2], [W * 0.3, 0.45, D / 2 + 1.9], [-0.3, 0, 0]);
    // notice board on the verandah post
    b.box(P.trunk, [0.14, 2.2, 0.14], [-W * 0.52, 1.1, D / 2 + 3.9]);
    b.box("#b78655", [1.4, 1.0, 0.12], [-W * 0.52, 1.9, D / 2 + 3.95]);
    for (const [x, y, c] of [[-0.35, 2.0, "#fffdf5"], [0.1, 1.85, "#fff1a8"], [0.4, 2.05, "#ffd3e0"]] as const) b.box(c, [0.35, 0.4, 0.03], [-W * 0.52 + x, y, D / 2 + 4.03]);
    rot(shed, b.build(), u, v);
    const s = new GeoBatch(0, rng);
    s.gable(P.snow, W + 0.9, D + 1.3, 2.62, [0, 5.05, 0]);
    rot(snow, s.build(), u, v);
    // yards on the east end (the visiting ram's pen)
    const Y: URect = [u + W / 2 + 1, u + W / 2 + 9, v - 3, v + 3];
    for (const [a, c] of [[[Y[0], Y[3]], [Y[1], Y[3]]], [[Y[1], Y[3]], [Y[1], Y[2]]], [[Y[1], Y[2]], [Y[0], Y[2]]], [[Y[0], Y[2]], [Y[0], Y[3]]], [[Y[0] + 4, Y[2]], [Y[0] + 4, Y[3]]]] as [UV, UV][]) fenceWood(st, a, c, 1.1);
  }
  const visitorL = layer();
  {
    const b = new GeoBatch(0, rng);
    b.box("#ffffff", [0.05, 1.3, 0.05], [21.8, 1.35, 3.2]);
    b.add(triangle(0.6, 0.4).rotateZ(-Math.PI / 2).translate(0.02, 2.0, 0), "#8fa8d8", mat([21.8, 0, 3.2]));
    mk(b, plainMat, false, false, visitorL);
  }
  // the shearing upgrade: a shearing stand, wool press and a stack of bales by the yards
  const shearL = layer();
  {
    const b = new GeoBatch(0.03, rng);
    const cx = 15.5, cz = 7.5;
    b.box("#c89668", [3.6, 0.2, 2.4], [cx, 0.1, cz]);
    for (const [x, y, z] of [[-1.1, 0.5, -0.5], [-0.3, 0.5, -0.5], [-0.7, 1.1, -0.5], [1.0, 0.5, -0.6]] as const) {
      b.box("#f3eee2", [0.75, 0.6, 0.7], [cx + x, y, cz + z]);
      b.box("#c9b89a", [0.77, 0.06, 0.72], [cx + x, y, cz + z]);
    }
    b.box("#9c6b4a", [0.9, 1.3, 0.8], [cx + 1.1, 0.8, cz + 0.5]);
    b.box("#9c6b4a", [0.1, 1.5, 0.1], [cx - 1.6, 0.75, cz + 1.2]);
    b.box("#fff6ea", [0.9, 0.6, 0.08], [cx - 1.6, 1.55, cz + 1.22]);
    b.box("#6f7c8a", [0.5, 0.05, 0.04], [cx - 1.6, 1.58, cz + 1.28], [0, 0, 0.6]);
    b.box("#6f7c8a", [0.5, 0.05, 0.04], [cx - 1.6, 1.58, cz + 1.28], [0, 0, -0.6]);
    mk(b, propMat, true, true, shearL);
  }

  // ---------------------------------------------------------------- the trader's stall and the market pen (hotspot "market")
  const mkt = new GeoBatch(0, rng);
  {
    const b = new GeoBatch(0.02, rng);
    b.box("#d9a36b", [3.6, 1.1, 1.1], [-12, 0.55, 11]);
    b.box("#e9bd85", [3.8, 0.12, 1.3], [-12, 1.14, 11]);
    for (const [x, z] of [[-13.75, 10.45], [-10.25, 10.45], [-13.75, 11.5], [-10.25, 11.5]] as const) b.cyl("#9c6b4a", 0.07, 0.07, 2.6, 5, [x, 1.3, z]);
    for (let i = 0; i < 6; i++) b.box(i % 2 ? "#fff6ea" : "#f28b82", [0.66, 0.08, 1.9], [-13.65 + i * 0.66, 2.65, 10.95], [0.28, 0, 0]);
    for (let i = 0; i < 6; i++) b.box(i % 2 ? "#fff6ea" : "#f28b82", [0.66, 0.3, 0.05], [-13.65 + i * 0.66, 2.3, 11.92]);
    const produce = ["#e45b52", "#8cc76b", "#f3eee2", "#f0b34a", "#e45b52", "#8fa8d8"];
    for (let i = 0; i < 6; i++) b.ico(produce[i]!, 0.2, 0, [-13.3 + i * 0.52, 1.35, 11.05 + (i % 2) * 0.2]);
    b.box("#fff6ea", [2.2, 0.45, 0.08], [-12, 3.05, 11.1]);
    // Sheryl the trader stands behind the stall
    b.cyl("#7fb3d5", 0.26, 0.36, 1.25, 7, [-12, 0.62, 10.1]);
    b.ico("#f0c9a4", 0.27, 1, [-12, 1.5, 10.1]);
    b.cyl("#e2c07a", 0.5, 0.5, 0.05, 10, [-12, 1.68, 10.1]);
    b.cyl("#e2c07a", 0.22, 0.28, 0.25, 8, [-12, 1.82, 10.1]);
    b.ico("#3a302e", 0.04, 0, [-11.85, 1.55, 10.34]);
    b.ico("#3a302e", 0.04, 0, [-12.15, 1.55, 10.34]);
    const g = b.build()!;
    g.translate(-1, 0, 1.5);
    mkt.addColored(g);
    // the pen for sheep on sale
    flat.box("#e8d596", [6.2, 0.05, 4.4], [-19, 0.03, 12.5]);
    for (const [a, c] of FENCES.slice(4)) fenceWood(st, a, c, 0.85, "#c89668");
    st.box("#e8cc72", [0.9, 0.5, 0.7], [-21.5, 0.25, 14.1]);
    const s = new GeoBatch(0, rng);
    s.box(P.snow, [4.0, 0.06, 1.9], [-13, 2.72, 12.45], [0.28, 0, 0]);
    snow.addColored(s.build()!);
  }

  // ---------------------------------------------------------------- mailbox by the road (hotspot)
  const mail = new GeoBatch(0, rng);
  {
    const [u, v] = SPOTS.mailbox;
    const b = new GeoBatch(0, rng);
    b.box(P.trunk, [0.16, 1.3, 0.16], [0, 0.65, 0]);
    b.box("#c2574a", [0.75, 0.55, 0.5], [0, 1.45, 0]);
    b.cyl("#c2574a", 0.25, 0.25, 0.75, 12, [0, 1.72, 0], [0, 0, Math.PI / 2]);
    b.box("#f3efe4", [0.05, 0.3, 0.5], [0.39, 1.5, 0]);
    // the flag is up: there's post
    b.box("#8a8f94", [0.04, 0.7, 0.04], [0.1, 2.0, 0.28]);
    b.box("#f2b233", [0.04, 0.26, 0.34], [0.1, 2.22, 0.45]);
    // a box of rocks for a stand, and a newspaper tube
    b.box("#b9b3aa", [0.5, 0.2, 0.5], [0, 0.1, 0]);
    b.cyl("#e9e2cf", 0.08, 0.08, 0.5, 8, [0, 1.0, 0.18], [0, 0, Math.PI / 2]);
    rot(mail, b.build(), u, v, 0.3, 1.2);
  }

  // ---------------------------------------------------------------- the vet's hut and ute by the road (hotspot)
  const vet = new GeoBatch(0, rng);
  {
    const [u, v] = SPOTS.vet;
    const b = new GeoBatch(0.02, rng);
    b.box("#f7f4ee", [3.4, 2.3, 3], [0, 1.15, 0]);
    b.gable("#7cc4b8", 3.9, 3.6, 1.3, [0, 2.3, 0]);
    b.box("#7aa7c7", [0.95, 1.7, 0.08], [0.6, 0.85, 1.52]);
    b.box("#f7f4ee", [1.1, 1.1, 0.1], [-0.7, 1.9, 1.6]);
    b.box("#e4574f", [0.8, 0.24, 0.06], [-0.7, 1.9, 1.67]);
    b.box("#e4574f", [0.24, 0.8, 0.06], [-0.7, 1.9, 1.67]);
    rot(vet, b.build(), u, v, 0, 1.15);
    const s = new GeoBatch(0, rng);
    s.gable(P.snow, 4.0, 3.75, 1.35, [0, 2.35, 0]);
    rot(snow, s.build(), u, v, 0, 1.15);
    const w = new GeoBatch(0, rng);
    w.box("#ffffff", [0.08, 0.7, 0.9], [1.73, 1.4, 0]);
    rot(win, w.build(), u, v, 0, 1.15);
    // the vet's white ute: cab, a tray with a dog box and a spare, lights, a stripe and a roof rack
    const ute = new GeoBatch(0, rng);
    ute.box("#eeeadf", [1.44, 0.55, 2.9], [0, 0.62, 0]);
    ute.box("#eeeadf", [1.34, 0.62, 1.2], [0, 1.2, 0.5]);
    ute.box("#b9d6e0", [1.2, 0.42, 0.05], [0, 1.25, 1.11]);
    for (const x of [-0.68, 0.68]) ute.box("#b9d6e0", [0.05, 0.36, 0.8], [x, 1.25, 0.5]);
    ute.box("#6fb7a8", [1.46, 0.12, 2.92], [0, 0.6, 0]);
    ute.box("#d9d4c6", [1.46, 0.35, 0.08], [0, 1.02, -1.42]);
    for (const x of [-0.7, 0.7]) ute.box("#d9d4c6", [0.08, 0.35, 1.5], [x, 1.02, -0.7]);
    ute.box("#b8a37f", [1.0, 0.55, 0.8], [0, 1.15, -0.8]);
    ute.box("#9a8566", [0.9, 0.08, 0.7], [0, 1.44, -0.8]);
    ute.box("#4a4a4a", [1.5, 0.18, 0.14], [0, 0.42, 1.48]);
    for (const x of [-0.5, 0.5]) ute.box("#fff5c4", [0.26, 0.14, 0.04], [x, 0.74, 1.46]);
    for (const x of [-0.55, 0.55]) ute.box("#d9463b", [0.2, 0.14, 0.04], [x, 0.74, -1.47]);
    for (const x of [-0.5, 0.5]) ute.box("#8b9196", [0.05, 0.06, 1.0], [x, 1.55, 0.5]);
    for (const x of [-0.72, 0.72]) for (const z of [-0.9, 0.95]) { ute.cyl("#2a2a2a", 0.32, 0.32, 0.22, 12, [x, 0.32, z], [0, 0, Math.PI / 2]); ute.cyl("#b9bdc0", 0.15, 0.15, 0.23, 8, [x, 0.32, z], [0, 0, Math.PI / 2]); }
    rot(st, ute.build(), SPOTS.ute[0], SPOTS.ute[1], 1.3, 1.25);
  }

  // ---------------------------------------------------------------- the showground down the road (hotspot "fairground")
  const fair = new GeoBatch(0, rng);
  const buntL = layer();
  {
    const [cu, cv] = SPOTS.showground;
    const b = new GeoBatch(0.02, rng);
    b.cyl("#ecdcb0", 4.6, 4.6, 0.08, 20, [0, 0.04, 0]);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (i === 4 || i === 5) continue; // entrance towards the camera and the road
      b.box("#f7f4ee", [0.14, 0.6, 0.14], [Math.cos(a) * 4.3, 0.3, Math.sin(a) * 4.3]);
      const a2 = ((i + 1) / 18) * Math.PI * 2;
      if (i + 1 === 4) continue;
      const len = 2 * 4.3 * Math.sin(Math.PI / 18);
      b.box("#f2b5c4", [len, 0.08, 0.06], [(Math.cos(a) + Math.cos(a2)) * 2.15, 0.48, (Math.sin(a) + Math.sin(a2)) * 2.15], [0, -(a + a2) / 2 + Math.PI / 2, 0]);
    }
    // a little grandstand and a marquee
    for (let i = 0; i < 3; i++) b.box(P.wall, [4, 0.5, 0.8], [0.5, 0.25 + i * 0.5, -5.6 - i * 0.8]);
    b.box(P.roofRed, [4.4, 0.12, 3], [0.5, 2.6, -6.4], [-0.2, 0, 0]);
    for (const x of [-1.5, 2.5]) b.cyl(P.trunk, 0.06, 0.06, 2.6, 4, [x, 1.3, -5.2]);
    for (let i = 0; i < 6; i++) b.box(i % 2 ? "#fffaf2" : "#f0a9a0", [0.6, 1.4, 3], [5.6 + i * 0.6, 0.7, 1.5]);
    b.add(new THREE.ConeGeometry(2.6, 1.5, 4, 1).rotateY(Math.PI / 4).scale(0.85, 1, 0.75), "#f0a9a0", mat([7.1, 2.15, 1.5]));
    b.box("#ffd257", [0.8, 0.6, 0.8], [0, 0.3, -1.4]);
    b.box("#d8dde3", [0.8, 0.4, 0.8], [-0.8, 0.2, -1.4]);
    b.box("#e2a36b", [0.8, 0.28, 0.8], [0.8, 0.14, -1.4]);
    const poles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75].map((a) => [Math.cos(a) * 4.9, Math.sin(a) * 4.9] as const);
    for (const [x, z] of poles) { b.cyl("#f7f4ee", 0.07, 0.09, 3.0, 6, [x, 1.5, z]); b.ico("#ffd257", 0.13, 0, [x, 3.05, z]); }
    rot(fair, b.build(), cu, cv);
    const bb = new GeoBatch(0, rng);
    const cols = ["#f28b82", "#ffd257", "#8fd0e8", "#b9e39a", "#d6a8ee"];
    let ci = 0;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = poles[k]!, [bx, bz] = poles[(k + 1) % 4]!;
      const ry = -Math.atan2(bz - az, bx - ax);
      for (let i = 0; i < 9; i++) {
        const t = (i + 0.5) / 9;
        bb.add(triangle(0.42, 0.5).translate(-0.21, 0, 0), cols[ci++ % cols.length]!, mat([ax + (bx - ax) * t, 2.9 - Math.sin(t * Math.PI) * 0.6, az + (bz - az) * t], [0, ry, 0]));
      }
    }
    const bg = bb.build()!;
    bg.translate(cu, 0, -cv);
    const b2 = new GeoBatch(); b2.addColored(bg);
    mk(b2, plainMat, false, false, buntL);
    // a sign by the road
    st.box(P.trunk, [0.14, 2.2, 0.14], [cu - 3.2, 1.1, -(cv + 5.8)]);
    st.box("#f7e7c6", [2.2, 0.8, 0.1], [cu - 3.2, 2.0, -(cv + 5.8)]);
    st.box("#c2574a", [1.8, 0.14, 0.12], [cu - 3.2, 2.15, -(cv + 5.8) + 0.05]);
  }

  // ---------------------------------------------------------------- bridge to the far bank (built when the far bank opens)
  const bridgeL = layer();
  const stumpsL = layer();
  {
    const [u, v] = BRIDGE;
    const b = new GeoBatch(0, rng);
    b.box(P.fence, [2.6, 0.22, 8.6], [0, 0.1, 0]);
    for (const x of [-1.25, 1.25]) {
      b.box(P.trunk, [0.12, 0.12, 8.6], [x, 0.9, 0]);
      for (const z of [-4, -2, 0, 2, 4]) b.box(P.trunk, [0.16, 0.9, 0.16], [x, 0.5, z]);
    }
    for (const z of [-4.1, 4.1]) b.box(P.soil, [2.8, 0.5, 0.7], [0, -0.1, z]);
    const g = b.build()!;
    g.translate(u, 0, -v);
    const bb = new GeoBatch(); bb.addColored(g);
    mk(bb, propMat, true, true, bridgeL);
    const s = new GeoBatch(0, rng);
    for (const z of [-4.1, 4.1]) s.box(P.soil, [2.8, 0.5, 0.7], [u, -0.1, -v + z]);
    s.box("#b7a893", [0.2, 1.4, 0.2], [u - 0.8, 0.3, -v + 3.4], [0.3, 0, 0.2]);
    s.box("#b7a893", [2.2, 0.16, 0.5], [u + 0.2, -0.05, -v - 2.6], [0.1, 0.4, 0.2]);
    mk(s, propMat, true, true, stumpsL);
  }

  // ---------------------------------------------------------------- lockable land: scrub, rank grass, broken fences, a sign; mended fences, gates and a trough
  const scrubGeos = (() => {
    const out: THREE.BufferGeometry[] = [];
    for (const gorse of [true, false]) {
      const b = new GeoBatch(0, rng);
      const base = gorse ? "#6f7f4c" : "#9b7f55";
      for (let i = 0; i < 3; i++) { const r = 0.5 + i * 0.12; b.ico(base, r, 1, [(i - 1) * 0.55, r * 0.7, (i % 2 - 0.5) * 0.6], [1, 0.8, 1]); }
      if (gorse) for (let i = 0; i < 6; i++) b.ico("#e6c65a", 0.12, 0, [(i / 5 - 0.5) * 1.2, 0.75 + (i % 3) * 0.15, ((i * 7) % 5 / 5 - 0.5) * 1.1]);
      out.push(smoothGeo(b.build()!));
    }
    return out;
  })();
  const postGeo = new THREE.BoxGeometry(0.16, 1.0, 0.16).translate(0, 0.5, 0);
  const railGeo = new GeoBatch().box(P.fence, [1, 0.08, 0.06], [0.5, 0.45, 0]).box(P.fence, [1, 0.08, 0.06], [0.5, 0.85, 0]).build()!;
  const postMat = std({ vertexColors: false, color: P.fence });
  disposables.push(...scrubGeos, postGeo, railGeo, postMat);
  const tuftGeo = (() => {
    const blade = new THREE.ConeGeometry(0.05, 0.42, 3, 1, true);
    const t = new GeoBatch(0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      t.add(blade.clone(), "#ffffff", mat([Math.cos(a) * 0.08, 0.18, Math.sin(a) * 0.08], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4], [1.15, 1, 1.15]));
    }
    blade.dispose();
    return t.build()!;
  })();
  disposables.push(tuftGeo);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const inst = (geo: THREE.BufferGeometry, m: THREE.Material, list: THREE.Matrix4[], cast: boolean, colours?: THREE.Color[]): THREE.InstancedMesh | null => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, m, list.length);
    list.forEach((mm, i) => { im.setMatrixAt(i, mm); if (colours) im.setColorAt(i, colours[i]!); });
    im.castShadow = shadows && cast;
    im.receiveShadow = shadows;
    im.computeBoundingSphere();
    group.add(im);
    return im;
  };
  const scrubMat = std();
  disposables.push(scrubMat);
  for (const id of ["flats", "rushy", "farbank", "terraces"] as AreaId[]) {
    const a = AREAS[id], L = lands[id];
    const [u0, u1, v0, v1] = a.rect;
    const pick = (m: number): UV => [lerp(u0 + m, u1 - m, rng()), lerp(v0 + m, v1 - m, rng())];
    // scrub (gorse and bracken), two instanced meshes
    const lists: THREE.Matrix4[][] = [[], []];
    const area = (u1 - u0) * (v1 - v0);
    const n = Math.round(area / (a.wet ? 14 : a.tussock ? 16 : 10) * (opts.lite ? 0.6 : 1));
    const loose = new GeoBatch(0, rng);
    for (let i = 0; i < n; i++) {
      const [u, v] = pick(0.9);
      if (a.wet && rng() < 0.6) { rushes(loose, u, v); continue; }
      if (a.tussock && rng() < 0.6) { tussock(loose, rng, u, v, 1.3, groundY(u, v)); continue; }
      const s = 0.8 + rng() * 0.5;
      e.set(0, rng() * 6, 0); q.setFromEuler(e);
      lists[rng() < 0.55 ? 0 : 1]!.push(new THREE.Matrix4().compose(p3.set(u, groundY(u, v) - 0.05, -v), q, s3.set(s, s, s)));
    }
    if (a.wet) for (let i = 0; i < 5; i++) { const [u, v] = pick(1.5); loose.add(new THREE.CircleGeometry(0.9 + rng() * 0.8, 16).rotateX(-Math.PI / 2).scale(1.4, 1, 1), "#a9c9cf", mat([u, groundY(u, v) + 0.04, -v])); }
    L.scrubM = lists;
    for (const [k, list] of lists.entries()) { const im = inst(scrubGeos[k]!, scrubMat, list, true); if (im) L.scrub.push(im); }
    // rank grass now, short lawn after the reveal
    const nf = Math.round(area * (opts.lite ? 0.35 : 0.8));
    const tallC: THREE.Color[] = [], shortC: THREE.Color[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < nf; i++) {
      const [u, v] = pick(0.4);
      const s = 1.5 + rng() * 0.9, s2 = 0.55 + rng() * 0.4;
      e.set(0, rng() * 6, 0); q.setFromEuler(e);
      const gy = groundY(u, v) - 0.02;
      L.tallM.push(new THREE.Matrix4().compose(p3.set(u, gy, -v), q, s3.set(s, s * (0.8 + rng() * 0.5), s)));
      L.shortM.push(new THREE.Matrix4().compose(p3.set(u, gy, -v), q, s3.set(s2, s2 * (0.8 + rng() * 0.5), s2)));
      tallC.push(c.set(a.tussock ? "#c9b57e" : "#a9a57a").lerp(new THREE.Color("#8f9a6a"), rng()).multiplyScalar(0.92 + rng() * 0.12).clone());
      shortC.push(c.set(P.grass2).lerp(new THREE.Color("#7fb86a"), rng()).multiplyScalar(0.92 + rng() * 0.12).clone());
    }
    L.tall = inst(tuftGeo, grassMat, L.tallM, false, tallC);
    L.short = inst(tuftGeo, grassMat, L.shortM, false, shortC);
    // broken fence, a sign, the loose dressing (rushes, tussock, pools)
    const br = new GeoBatch(0, rng);
    for (const [pa, pc] of areaFence(a)) brokenFence(br, rng, pa, pc);
    if (id !== "farbank") signPost(br, u0 + 3, v0 - 0.9, groundY(u0 + 3, v0 - 0.9));
    for (const g of [loose.build()]) if (g) br.addColored(g);
    L.broken = mk(br, propMat, true, true);
    // the mended fence as posts and rails, raised one after another around the paddock
    for (const [pa, pc] of areaFence(a)) {
      const len = Math.hypot(pc[0] - pa[0], pc[1] - pa[1]);
      const k = Math.max(1, Math.round(len / 2.3));
      const ry = Math.atan2(pc[1] - pa[1], pc[0] - pa[0]);
      for (let i = 0; i <= k; i++) {
        const u = lerp(pa[0], pc[0], i / k), v = lerp(pa[1], pc[1], i / k);
        const y0 = groundY(u, v);
        L.postsM.push(new THREE.Matrix4().makeTranslation(u, y0, -v));
        if (i < k) {
          const u1 = lerp(pa[0], pc[0], (i + 1) / k), v1 = lerp(pa[1], pc[1], (i + 1) / k), y1 = groundY(u1, v1);
          e.set(0, ry, Math.atan2(y1 - y0, len / k)); q.setFromEuler(e);
          L.railsM.push(new THREE.Matrix4().compose(p3.set(u, y0, -v), q, s3.set(Math.hypot(len / k, y1 - y0), 1, 1)));
        }
      }
    }
    L.posts = inst(postGeo, postMat, L.postsM, true);
    L.rails = inst(railGeo, propMat, L.railsM, true);
    // what arrives with the land: the gate swung open, a trough and a couple of bales
    const ob = new GeoBatch(0, rng);
    const g = a.gate;
    if (g.side === "w") gate(ob, u0, g.at - 1.8, Math.PI - 0.2);
    else if (g.side === "s") gate(ob, g.at - 1.8, v0, -1.4);
    trough(ob, u0 + 2.5, v1 - 2.2);
    bale(ob, u1 - 3, v1 - 2.5);
    bale(ob, u1 - 5, v0 + 3);
    // (the worn gateway arrives with the land's terrain colours: groundColour's mud spots for open land)
    L.open = mk(ob, propMat, true, true);
  }

  // ---------------------------------------------------------------- trees, the native bush edge, tussock on the slopes
  /** Birds perch on tree crowns (the ambient life), gathered as the trees go in. */
  const perches: THREE.Vector3[] = [];
  const placeTree = (kind: TreeKind, u: number, v: number, s: number, y = groundY(u, v)): void => {
    const tf = new GeoBatch(0, rng), ts = new GeoBatch(0, rng), tsp = new GeoBatch(0, rng), tsu = new GeoBatch(0, rng);
    if (kind === "kowhai") { kowhai(tf, ts, rng, 0, 0, s, tsp); perches.push(new THREE.Vector3(u, y + 3.1 * s, -v)); }
    else if (kind === "cabbage") { cabbage(tf, ts, rng, 0, 0, s); perches.push(new THREE.Vector3(u + 0.5 * s, y + 3.3 * s, -v)); }
    else if (kind === "pohutukawa") { pohutukawa(tf, ts, rng, 0, 0, s, tsu); perches.push(new THREE.Vector3(u, y + 3.3 * s, -v)); }
    else if (kind === "toetoe") toetoe(tf, ts, rng, 0, 0, s, 0);
    else if (kind === "ponga") { ponga(tf, ts, rng, 0, 0, s, 0); perches.push(new THREE.Vector3(u, y + 2.9 * s, -v)); }
    else flax(tf, 0, 0, s);
    const put = (src: GeoBatch, dst: GeoBatch) => { const g = src.build(); if (g) { g.translate(u, y, -v); dst.addColored(g); } };
    put(tf, fo); put(ts, st); put(tsp, spring); put(tsu, summer);
    // a soft contact shadow under every tree and clump
    const cr = kind === "flax" || kind === "toetoe" ? 1.1 * s : kind === "cabbage" ? 0.9 * s : kind === "ponga" ? 1.2 * s : 2.1 * s;
    contactShadow(shade, u + 0.2, v - 0.15, cr, kind === "flax" || kind === "toetoe" ? 0.22 : 0.3);
  };
  for (const [kind, u, v, s] of TREES) placeTree(kind, u, v, s);
  // birds also sit on the home paddock's fence posts (every few posts)
  for (const [a, c] of areaFence(AREAS.home)) {
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.round(len / 2.3));
    for (let i = 1; i < n; i += 3) { const u = lerp(a[0], c[0], i / n), v = lerp(a[1], c[1], i / n); perches.push(new THREE.Vector3(u, groundY(u, v) + 1.17, -v)); }
  }
  for (const [kind, u, v, s] of PADDOCK_TREES) placeTree(kind, u, v, s);
  // flax along the creek banks
  for (let u = -60; u < 80; u += 7 + rng() * 6) {
    if (Math.abs(u - BRIDGE[0]) < 4) continue;
    const side = rng() < 0.5 ? -1 : 1;
    const v = creekV(u) + side * (2.9 + rng() * 0.6);
    const k = rng();
    placeTree(k < 0.7 ? "flax" : "toetoe", u, v, 0.9 + rng() * 0.3, Math.max(-0.3, groundY(u, v)));
  }
  // river stones along the water's edge
  for (let u = -58; u < 78; u += 1.3 + rng() * 2.2) {
    const side = rng() < 0.5 ? -1 : 1;
    const v = creekV(u) + side * (1.7 + rng() * 0.7);
    if (Math.abs(u - BRIDGE[0]) < 3) continue;
    rocks(fo, rng, u, v, 0.55 + rng() * 0.35, 1 + Math.floor(rng() * 2));
  }
  {
    const step = opts.lite ? 3.4 : 2.6;
    for (let u = -70; u < 125; u += step) for (let v = -24; v < 58; v += step) {
      const pu = u + (rng() - 0.5) * step * 0.8, pv = v + (rng() - 0.5) * step * 0.8;
      const s = bushScore(pu, pv);
      if (s <= BUSH_AT) continue;
      const d = pv - creekV(pu);
      if (Math.abs(d) < 2.8 || Math.abs(pv - roadV(pu)) < 3) continue;
      if (AREA_IDS.some((id) => softRect(pu, pv, AREAS[id].rect, 0.5) > 0.01)) continue;
      const y = Math.max(0, height(pu, pv));
      const r = rng();
      const far = pv > 22 || pu > 95;
      if (r < (far ? 0.7 : 0.46)) bushClump(fo, rng, pu, pv, 1.3 + rng() * 0.6, y, far || opts.lite ? 0 : 1);
      else if (r < 0.74) ponga(fo, st, rng, pu, pv, 1.2 + rng() * 0.4, y);
      else if (r < 0.88) { const b = new GeoBatch(0, rng), sp = new GeoBatch(0, rng); kowhai(b, b, rng, 0, 0, 1.3, sp, 6); rot(fo, b.build(), pu, pv, 0, 1, y); rot(spring, sp.build(), pu, pv, 0, 1, y); }
      else { const b = new GeoBatch(0, rng); cabbage(b, b, rng, 0, 0, 1.3); rot(fo, b.build(), pu, pv, 0, 1, y); }
    }
    const tb = new GeoBatch(0, rng);
    for (let i = 0; i < (opts.lite ? 260 : 520); i++) {
      const u = -80 + rng() * 200, v = 20 + rng() * 45;
      const h = height(u, v);
      if (h < 2.5 || h > 19 || bushScore(u, v) > BUSH_AT) continue;
      if (AREA_IDS.some((id) => softRect(u, v, AREAS[id].rect, 0.5) > 0.01)) continue;
      tussock(tb, rng, u, v, 1.1 + rng() * 0.6, h);
    }
    const tg = tb.build();
    if (tg) st.addColored(tg);
  }

  // ---------------------------------------------------------------- the dressing: tracks, mud, clover, rocks, walls, hedges, farm things
  {
    // worn tracks are in the terrain colours; rutted farm tracks get two soft wheel ruts, sheep tracks a faint line
    TRACKS.forEach((t, i) => {
      if (i === 3 || !RUTTED.has(i)) return;
      for (const off of [-0.55, 0.55]) ribbon(wear, rng, t, 0.55, "#e3d6c3", { off, jag: 0.4, lift: 0.045 });
    });
    for (const t of SHEEP_TRACKS) ribbon(wear, rng, t, 0.7, "#eeeccd", { jag: 0.5, lift: 0.04 });
    // wet mud in the middle of the gateway and round the trough, and a puddle
    const gu1 = AREAS.home.rect[1], gv1 = AREAS.home.gate.at;
    softPatch(wear, rng, gu1 - 0.5, gv1, 1.5, "#cdbba6", 1.3);
    softPatch(wear, rng, -27.5, 5.8, 1.3, "#d4c3ad", 1.4);
    flat.add(new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2).scale(1.6, 1, 1), "#a9c6cd", mat([gu1 - 1.1, groundY(gu1 - 1.1, gv1 + 0.4) + 0.06, -(gv1 + 0.4)]));
    flat.add(new THREE.CircleGeometry(0.32, 10).rotateX(-Math.PI / 2).scale(1.4, 1, 1), "#b3cdd2", mat([gu1 + 0.3, groundY(gu1 + 0.3, gv1 - 0.9) + 0.06, -(gv1 - 0.9)]));
    hayScatter(dense, rng, -9.3, 5.2, 1.5);
    // rocks: in the paddock corner, a lone one mid-paddock, a few along the verges
    rocks(fo, rng, -26.6, -6.9, 1.35, 4);
    rocks(fo, rng, -19.2, -2.4, 0.9, 1);
    for (const [u, v, sc] of [[-33, -11, 1], [-8.5, 14.5, 1.1], [26, -16.2, 0.9], [-60, -12.5, 1.1], [14, 9, 0.8], [33, -8.5, 0.8], [-38, 12.8, 1]] as const) rocks(fo, rng, u, v, sc, 2 + Math.floor(rng() * 2));
    // thistles along the home paddock's fence lines (long grass the sheep can't reach)
    for (const [a, c] of areaFence(AREAS.home)) {
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      for (let k = 0; k < len / 4.5; k++) {
        const t = rng();
        const nu = -(c[1] - a[1]) / len, nv = (c[0] - a[0]) / len, side = rng() < 0.5 ? 0.45 : -0.45;
        thistle(dense, rng, lerp(a[0], c[0], t) + nu * side, lerp(a[1], c[1], t) + nv * side, 0.8 + rng() * 0.5);
      }
    }
    // dry-stone walls by the road, hedgerows across it and round the garden
    for (const w of STONE_WALLS) stoneWall(fo, rng, w);
    for (const h of HEDGES) hedge(fo, rng, h);
    for (const w of [...STONE_WALLS, ...HEDGES]) for (let i = 0; i < w.length - 1; i++) {
      const a = w[i]!, c = w[i + 1]!, n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 1.6);
      for (let k = 0; k <= n; k++) contactShadow(shade, lerp(a[0], c[0], k / n) + 0.3, lerp(a[1], c[1], k / n) - 0.35, 1.3, 0.2);
    }
    // the farm things: the washing out, the woodpile, the tractor by the barn, the quad and woolpacks at the woolshed
    clothesline(st, PROPS.clothesline[0], PROPS.clothesline[1]);
    contactShadow(shade, PROPS.clothesline[0] + 0.3, PROPS.clothesline[1] - 0.3, 1.9, 0.14);
    woodpile(st, rng, PROPS.woodpile[0], PROPS.woodpile[1]);
    contactShadow(shade, PROPS.woodpile[0], PROPS.woodpile[1] - 0.2, 1.7, 0.3, 1.3, 0.8);
    tractor(st, PROPS.tractor[0], PROPS.tractor[1], PROPS.tractor[2]);
    contactShadow(shade, PROPS.tractor[0], PROPS.tractor[1], 1.7, 0.34, 1.2, 0.9);
    quadBike(st, PROPS.quad[0], PROPS.quad[1], PROPS.quad[2]);
    contactShadow(shade, PROPS.quad[0], PROPS.quad[1], 1.3, 0.34, 1.2, 0.85);
    tankStand(st, PROPS.tank[0], PROPS.tank[1]);
    contactShadow(shade, PROPS.tank[0] + 0.2, PROPS.tank[1] - 0.2, 1.7, 0.3);
    wheelbarrow(st, PROPS.barrow[0], PROPS.barrow[1], PROPS.barrow[2]);
    contactShadow(shade, PROPS.barrow[0], PROPS.barrow[1], 0.9, 0.3, 1.3, 0.9);
    PROPS.woolpacks.forEach(([u, v], i) => { woolpack(st, rng, u, v, 0.2 + i * 0.5, i === 2 ? 0.12 : 0); contactShadow(shade, u, v, 0.9, 0.3); });
    // contact shadows under the paddock things and round the buildings' feet
    for (const [u, v, r] of OBSTACLES) contactShadow(shade, u + 0.15, v - 0.1, r * 1.35, 0.3);
    contactShadow(shade, -27.5, 6.8, 1.6, 0.32, 1.3, 0.8);
    for (const [u, v] of [[-26.6, -6.9], [-19.2, -2.4]] as const) contactShadow(shade, u, v, 1.2, 0.3);
    contactShadow(shade, SPOTS.mailbox[0], SPOTS.mailbox[1], 0.8, 0.3);
    contactShadow(shade, SPOTS.ute[0], SPOTS.ute[1], 2.2, 0.32, 1, 1.3);
    // the kids' old tyre swing under the kōwhai by the homestead
    softPatch(wear, rng, -46.4, 5.3, 1.0, "#e2d6c2");
    st.cyl("#3a3636", 0.42, 0.42, 0.2, 12, [-46.4, groundY(-46.4, 5.3) + 0.95, -5.3], [Math.PI / 2 - 0.1, 0, 0]);
    st.cyl("#d9cfb8", 0.015, 0.015, 2.2, 3, [-46.4, groundY(-46.4, 5.3) + 2.2, -5.3]);
  }

  // ---------------------------------------------------------------- grass tufts and flowers (instanced)
  {
    // pasture tufts cluster in drifts (lusher in hollows, round the trough and the shade tree) with long grass
    // along the fence lines, where the flock can't reach
    const N = opts.lite ? 2400 : 7600;
    const r2 = mulberry32(99 ^ seed);
    const list: THREE.Matrix4[] = [], cols: THREE.Color[] = [], denseIdx: boolean[] = [];
    const c = new THREE.Color();
    const clump = (u: number, v: number) => 0.5 + 0.5 * Math.sin(u * 0.61 + Math.sin(v * 0.47) * 2.1) * Math.sin(v * 0.58 - u * 0.23 + 1.1);
    const homeFence = areaFence(AREAS.home);
    for (let t = 0; t < N * 5 && list.length < N; t++) {
      const u = -70 + r2() * 160, v = -30 + r2() * 46;
      const d = v - creekV(u);
      if (d > -2.6 || Math.abs(v - roadV(u)) < 1.9) continue;
      if (AREA_IDS.some((id) => id !== "home" && softRect(u, v, AREAS[id].rect, 0.2) > 0.1)) continue;
      if (TRACKS.some((tr, i) => i !== 3 && lineDist(u, v, tr) < (RUTTED.has(i) ? 0.9 : 0.5))) continue;
      const inPad = softRect(u, v, AREAS.home.rect, 0.2) > 0.5;
      const fd = inPad ? Math.min(...homeFence.map(([a, b]) => lineDist(u, v, [a, b]))) : 9;
      const edge = fd < 0.9;
      if (!edge && r2() > 0.25 + clump(u, v) * 0.85) continue;
      if (!inPad && !edge && r2() < 0.45) continue;
      const s = edge ? 0.75 + r2() * 0.45 : inPad ? 0.42 + r2() * 0.36 : 0.55 + r2() * 0.45;
      e.set(0, r2() * 6, 0); q.setFromEuler(e);
      list.push(new THREE.Matrix4().compose(p3.set(u, groundY(u, v) - 0.02, -v), q, s3.set(s, s * (0.8 + r2() * 0.5 + (edge ? 0.3 : 0)), s)));
      const k = clump(u, v);
      cols.push(c.set(P.grass2).lerp(new THREE.Color(k > 0.6 ? "#6fae5e" : "#8fc26f"), r2()).lerp(new THREE.Color("#c9cf86"), edge ? 0.25 * r2() : 0).multiplyScalar(0.9 + r2() * 0.14).clone());
      denseIdx.push(list.length % 3 === 0);
    }
    const tiles = new Map<string, number[]>();
    const GT = 36; // grass tiles: a little bigger than the scenery's (fewer draws, still culled)
    list.forEach((mm, i) => { const k = `${Math.floor(mm.elements[12]! / GT)},${Math.floor(mm.elements[14]! / GT)}`; const a = tiles.get(k) ?? []; a.push(i); tiles.set(k, a); });
    for (const idx of tiles.values()) {
      // the dense third goes last, so lite can simply draw fewer instances
      idx.sort((x, y) => Number(denseIdx[x]) - Number(denseIdx[y]));
      const im = inst(tuftGeo, grassMat, idx.map((i) => list[i]!), false, idx.map((i) => cols[i]!));
      if (!im) continue;
      im.userData.kind = "grass";
      grassTiles.push(im);
      denseGrass.push({ mesh: im, base: idx.filter((i) => !denseIdx[i]).length, full: idx.length });
    }
    // flower drifts: daisies and buttercups gather in drifts (a few strays between), clover heads in the clover,
    // self-heal and speedwell by the fences; spring and summer only
    const fl = new GeoBatch(0, rng);
    const flowerGeo = () => new THREE.OctahedronGeometry(1, 0);
    const drift = (u: number, v: number) => Math.sin(u * 0.33 + Math.cos(v * 0.29) * 2.4) * Math.sin(v * 0.41 - u * 0.13 + 0.6);
    const n = opts.lite ? 700 : 1900;
    for (let i = 0, placed = 0; i < n * 8 && placed < n; i++) {
      const u = -66 + r2() * 110, v = -16 + r2() * 30;
      const home = softRect(u, v, AREAS.home.rect, 0.2) > 0.5, garden = Math.hypot(u + 55, v + 1) < 9, verge = v > 9.4 && v < creekV(u) - 3 && u > -40 && u < 32;
      if (!(home || garden || verge)) continue;
      if (TRACKS.some((tr) => lineDist(u, v, tr) < 0.8)) continue;
      const dd = drift(u, v);
      if (dd < 0.25 && r2() > 0.12) continue;
      placed++;
      const k = r2();
      const col = dd > 0.55 ? (k < 0.55 ? "#fbf8ef" : k < 0.85 ? "#f3d34a" : "#f7e9f0") : k < 0.5 ? "#fbf8ef" : k < 0.7 ? "#f3d34a" : k < 0.85 ? "#e9c6dc" : "#b9a7e6";
      const r = 0.055 + r2() * 0.03;
      fl.add(flowerGeo(), col, mat([u, groundY(u, v) + 0.12 + r2() * 0.1, -v], [0, r2() * 3, 0], [r, r * 0.55, r]));
      if (col === "#fbf8ef" && r2() < 0.3) fl.add(flowerGeo(), "#f1c43a", mat([u, groundY(u, v) + 0.15 + 0.07, -v], [0, 0, 0], [r * 0.4, r * 0.4, r * 0.4]));
    }
    flowers.addColored(fl.build() ?? new THREE.BufferGeometry());
    // autumn leaves under the trees, a snowman in winter
    for (const [, u, v, s] of TREES) for (let k = 0; k < 6; k++) { const au = u + (rng() - 0.5) * 3 * s, av = v + (rng() - 0.5) * 3 * s; autumn.ico(k % 2 ? "#e0673f" : "#ee9a4c", 0.14, 0, [au, groundY(au, av) + 0.05, -av], [1, 0.25, 1]); }
    for (let k = 0; k < 40; k++) { const au = -15.4 + (rng() - 0.5) * 5, av = 5.6 + (rng() - 0.5) * 5; autumn.ico(k % 3 ? "#e8a53c" : "#d9643a", 0.13, 0, [au, groundY(au, av) + 0.05, -av], [1, 0.25, 1]); }
    snow.ico(P.snow, 0.55, 1, [-49, 0.5, 8.5]);
    snow.ico(P.snow, 0.4, 1, [-49, 1.25, 8.5]);
    snow.ico(P.snow, 0.28, 1, [-49, 1.8, 8.5]);
    snow.cone("#f0a53a", 0.06, 0.3, 5, [-48.75, 1.8, 8.65], [0, 0, -Math.PI / 2]);
  }

  // ---------------------------------------------------------------- build meshes
  mk(flat, plainMat, false, true);
  tiled(st, propMat, true, true, false, group, TILE, "props");
  tiled(fo, foliageMat, true, true, true, group, TILE, "foliage");
  tiled(shade, shadeMat, false, false, false, group, THIN, "shade");
  // the wear layer (ruts, tracks, wet mud) — hidden in winter, when snow covers it (FarmBuild.layers.clover)
  const cloverL = layer("wear");
  tiled(wear, shadeMat, false, false, false, cloverL, THIN);
  const denseL = layer("dense");
  const wm = mk(win, windowMat, false, false);
  if (wm) wm.userData.windows = true;
  for (const L of Object.values(lands)) for (const o of [...L.scrub, L.tall, L.short, L.broken, L.posts, L.rails, L.open]) if (o) o.userData.kind = "land";
  const springL = layer("spring"); tiled(spring, foliageMat, false, false, false, springL, THIN);
  const summerL = layer("summer"); tiled(summer, foliageMat, false, false, false, summerL, THIN);
  // thistles and hay scraps ride with the flowers (spring and summer; one set of tiles)
  { const g = dense.build(); if (g) flowers.addColored(g); }
  const flowersL = layer("flowers"); tiled(flowers, plainMat, false, false, false, flowersL, THIN);
  const autumnL = layer("autumn"); tiled(autumn, plainMat, false, true, false, autumnL, THIN);
  const snowL = layer("snow"); mk(snow, plainMat, false, true, snowL);

  const hotspotMeshes = {} as Record<Hotspot, THREE.Mesh>;
  const hotspotPicks: THREE.Mesh[] = [];
  const pickGeo = new THREE.BoxGeometry(1, 1, 1);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  disposables.push(pickGeo, pickMat);
  const hs: [Hotspot, GeoBatch][] = [["house", house], ["shed", shed], ["market", mkt], ["vet", vet], ["fairground", fair], ["mailbox", mail]];
  for (const [id, b] of hs) {
    const m = std({ emissive: "#fff3c4", emissiveIntensity: 0 });
    disposables.push(m);
    const mesh = mk(b, m, id !== "fairground", true)!;
    mesh.userData.hotspot = id;
    mesh.userData.kind = "buildings";
    hotspotMeshes[id] = mesh;
    const def = HOTSPOT_DEF[id];
    const pick = new THREE.Mesh(pickGeo, pickMat);
    pick.scale.set(...def.pickSize);
    pick.position.set(...def.pickPos);
    pick.userData.hotspot = id;
    group.add(pick);
    hotspotPicks.push(pick);
  }

  // chimney smoke puffs (animated by the view)
  const smokeGeo = new THREE.IcosahedronGeometry(0.4, 1);
  const smokeMat = new THREE.MeshStandardMaterial({ color: "#f6f3ee", transparent: true, opacity: 0.55, roughness: 1, depthWrite: false });
  disposables.push(smokeGeo, smokeMat);
  const smoke: THREE.Mesh[] = [];
  const smokeAt = new THREE.Vector3(-1.6, 4.5, -0.6).applyMatrix4(mat([SPOTS.homestead[0], 0, -SPOTS.homestead[1]], [0, -0.1, 0], 1.7));
  for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(smokeGeo, smokeMat); m.position.copy(smokeAt); m.castShadow = false; m.userData.kind = "smoke"; group.add(m); smoke.push(m); }

  return {
    group, terrainAttr: terrainAttr!, windowMat, smoke, smokeAt, perches,
    dense: { layer: denseL, grass: denseGrass },
    mats: { terrain: terrainMat, props: propMat, foliage: foliageMat, grass: grassMat, water: waterMat },
    layers: { spring: springL, summer: summerL, flowers: flowersL, clover: cloverL, autumn: autumnL, snow: snowL, bunting: buntL, visitor: visitorL, snugBarn: snugL, shearing: shearL, bridge: bridgeL, bridgeStumps: stumpsL },
    lands, grass: grassTiles, hotspotMeshes, hotspotPicks,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}

export type { AreaId } from "./valley.js";
