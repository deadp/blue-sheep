// Static farm diorama: ground, buildings (hotspots), fences, pond, trees,
// seasonal layers. Everything is batched into a few vertex-coloured meshes.
import * as THREE from "three";
import { GeoBatch, mat, type V3 } from "./builder.js";
import type { Rng } from "./rng.js";
import type { Hotspot, Zone } from "./types.js";

export interface Rect { x0: number; x1: number; z0: number; z1: number }

/** Interior rectangles where sheep may stand/wander (world units, y up, +z towards camera). */
export const ZONES: Record<Zone, Rect> = {
  paddock: { x0: -8.2, x1: 6.2, z0: -9.2, z1: 1.2 },
  paddock2: { x0: 9.3, x1: 19.2, z0: -10.2, z1: 0.2 },
  barn: { x0: -22.2, x1: -12.8, z0: -2.3, z1: 1.6 },
  market: { x0: -21.6, x1: -16.4, z0: 10.9, z1: 14.2 },
  visitor: { x0: -13.3, x1: -10.7, z0: 14.4, z1: 16.6 },
};

export const HOTSPOT_LABEL: Record<Hotspot, string> = {
  house: "Farmhouse · sleep",
  shed: "Shed · notice board",
  market: "Market",
  vet: "Vet",
  fairground: "Fairground",
  mailbox: "Mailbox",
};

interface HotspotDef { anchor: V3; pickSize: V3; pickPos: V3 }
export const HOTSPOT_DEF: Record<Hotspot, HotspotDef> = {
  house: { anchor: [-17, 6.2, -12], pickSize: [7.8, 6.4, 5.4], pickPos: [-17, 3.2, -12] },
  shed: { anchor: [5.8, 4.2, 9.5], pickSize: [6, 4, 5.4], pickPos: [5.8, 2, 10] },
  market: { anchor: [-12, 3.9, 10.6], pickSize: [4.4, 3.8, 3.2], pickPos: [-12, 1.9, 10.4] },
  vet: { anchor: [21, 4.1, 10], pickSize: [4, 4, 4], pickPos: [21, 2, 10.2] },
  fairground: { anchor: [14, 3.6, 11], pickSize: [8, 2.4, 8], pickPos: [14, 1.2, 11] },
  mailbox: { anchor: [3, 2.0, 17.3], pickSize: [1.4, 2, 1.4], pickPos: [3, 1, 17.3] },
};

export const GROUND = { x0: -25, x1: 25, z0: -19, z1: 19 };

/** Areas nothing decorative may be scattered into. */
const KEEP_OUT: Rect[] = [
  { x0: -21, x1: -13, z0: -15, z1: -9 }, // house
  { x0: -24, x1: -11, z0: -6, z1: 2.8 }, // barn
  { x0: -10, x1: 8, z0: -11, z1: 3 }, // paddock
  { x0: 8, x1: 21, z0: -12, z1: 2 }, // paddock2
  { x0: -21, x1: 21.5, z0: 3.9, z1: 6.1 }, // lane
  { x0: -0.2, x1: 2.2, z0: 3.9, z1: 19 }, // gate lane
  { x0: -18, x1: -9.5, z0: -9, z1: 5 }, // house path
  { x0: -8.5, x1: -1.5, z0: 6, z1: 13 }, // pond
  { x0: 2.8, x1: 9, z0: 6.8, z1: 13 }, // shed
  { x0: -23, x1: -9.5, z0: 9, z1: 17.5 }, // market + pens
  { x0: 9.8, x1: 18.2, z0: 6.8, z1: 15.2 }, // fair
  { x0: 18.8, x1: 23.4, z0: 7.6, z1: 12.8 }, // vet
  { x0: 1.8, x1: 4, z0: 16, z1: 18.8 }, // mailbox
];

export function freeAt(x: number, z: number, pad = 0): boolean {
  if (x < GROUND.x0 + 0.8 || x > GROUND.x1 - 0.8 || z < GROUND.z0 + 0.8 || z > GROUND.z1 - 0.8) return false;
  for (const r of KEEP_OUT) if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return false;
  return true;
}

const C = {
  post: "#f1e8d6", rail: "#e2d4b8", wood: "#c89668", woodDark: "#9c6b4a", stone: "#c9c1b5",
  cream: "#f6e7cc", roof: "#e3876f", path: "#dcc59c", dirt: "#b98e62", dirtDark: "#8f6a4a",
  straw: "#ecd99c", hay: "#e8cc72", white: "#f7f4ee", teal: "#7cc4b8", red: "#e4574f",
  pine: "#5c9d6c", trunk: "#9a6e4c", snow: "#fbfdff", rock: "#aeb1b3", sand: "#ecdcb0",
};

export interface FarmBuild {
  group: THREE.Group;
  groundMat: THREE.MeshLambertMaterial;
  foliageMat: THREE.MeshLambertMaterial;
  meadowMat: THREE.MeshLambertMaterial;
  pondMat: THREE.MeshLambertMaterial;
  windowMat: THREE.MeshLambertMaterial;
  smoke: THREE.Mesh[];
  layers: {
    snow: THREE.Object3D; spring: THREE.Object3D; flowers: THREE.Object3D; autumn: THREE.Object3D;
    paddock2: THREE.Object3D; meadow: THREE.Object3D; mainGate: THREE.Object3D; bunting: THREE.Object3D; visitor: THREE.Object3D;
  };
  hotspotMeshes: Record<Hotspot, THREE.Mesh>;
  hotspotPicks: THREE.Mesh[];
  dispose(): void;
}

function fence(b: GeoBatch, x0: number, z0: number, x1: number, z1: number, h = 0.9, post = C.post, rail = C.rail): void {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.round(len / 1.7));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.box(post, [0.18, h, 0.18], [x0 + dx * t, h / 2, z0 + dz * t]);
  }
  const ry = -Math.atan2(dz, dx);
  for (const y of [h * 0.42, h * 0.8]) b.box(rail, [len, 0.09, 0.07], [(x0 + x1) / 2, y, (z0 + z1) / 2], [0, ry, 0]);
}

function triangle(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, w, 0, 0, w / 2, -h, 0, 0, 0, 0, w / 2, -h, 0, w, 0, 0], 3));
  return g;
}

export function buildFarm(rng: Rng, shadows: boolean): FarmBuild {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const staticMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const foliageMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const meadowMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const pondMat = new THREE.MeshLambertMaterial({ color: "#8ccbe6" });
  const windowMat = new THREE.MeshLambertMaterial({ color: "#a9cbe0", emissive: "#ffc766", emissiveIntensity: 0 });
  disposables.push(staticMat, groundMat, foliageMat, meadowMat, pondMat, windowMat);

  const mk = (b: GeoBatch, m: THREE.Material, cast = true, receive = true, parent: THREE.Object3D = group): THREE.Mesh | null => {
    const g = b.build();
    if (!g) return null;
    disposables.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = shadows && cast;
    mesh.receiveShadow = shadows && receive;
    parent.add(mesh);
    return mesh;
  };
  const layer = (): THREE.Group => {
    const gr = new THREE.Group();
    group.add(gr);
    return gr;
  };

  // ---------------------------------------------------------------- ground
  {
    const top = new GeoBatch(0.035, rng);
    top.add(new THREE.PlaneGeometry(GROUND.x1 - GROUND.x0, GROUND.z1 - GROUND.z0, 25, 19).rotateX(-Math.PI / 2), "#ffffff");
    mk(top, groundMat, false, true);
    const sides = new GeoBatch(0.03, rng);
    sides.box(C.dirt, [50, 1.3, 38], [0, -0.67, 0]);
    sides.box(C.dirtDark, [50.3, 0.5, 38.3], [0, -1.5, 0]);
    mk(sides, staticMat, false, false);
  }

  const st = new GeoBatch(0.04, rng); // static, casts shadows
  const flat = new GeoBatch(0, rng); // flat decals on the ground (paths, floors)
  const fol = new GeoBatch(0.1, rng); // foliage (white-ish vertex colour × seasonal material)
  const snow = new GeoBatch(0.02, rng);
  const spring = new GeoBatch(0.05, rng);
  const flowers = new GeoBatch(0.05, rng);
  const autumn = new GeoBatch(0.05, rng);
  const win = new GeoBatch(0, rng);

  // ---------------------------------------------------------------- paths
  flat.box(C.path, [42, 0.06, 1.6], [0.5, 0.03, 5]);
  flat.box(C.path, [1.6, 0.07, 14.2], [1, 0.035, 12]);
  flat.box(C.path, [1.4, 0.07, 2.6], [-17, 0.035, -8.6]);
  flat.box(C.path, [7.4, 0.075, 1.4], [-13.8, 0.037, -7.5]);
  flat.box(C.path, [1.4, 0.08, 12.6], [-10.5, 0.04, -1.25]);
  flat.box(C.path, [1.3, 0.07, 2.2], [-12, 0.035, 5 + 1.6 + 0.8]);
  flat.box(C.path, [1.3, 0.07, 1.4], [21, 0.035, 6.4]);
  flat.box(C.path, [1.3, 0.07, 1.4], [6.8, 0.035, 6.3]);

  // ---------------------------------------------------------------- house (hotspot)
  const house = new GeoBatch(0.03, rng);
  house.box(C.stone, [7.4, 0.35, 4.9], [-17, 0.175, -12]);
  house.box(C.cream, [7, 3, 4.5], [-17, 1.85, -12]);
  house.gable(C.roof, 7.9, 5.4, 2.3, [-17, 3.35, -12]);
  house.box("#c77a64", [0.75, 2.0, 0.75], [-14.8, 4.6, -12.9]);
  house.box("#9f5f4e", [0.9, 0.18, 0.9], [-14.8, 5.65, -12.9]);
  house.box(C.woodDark, [1.0, 1.9, 0.1], [-17, 1.3, -9.72]);
  house.box("#e7c56b", [0.1, 0.1, 0.06], [-16.7, 1.3, -9.64]);
  house.box(C.stone, [1.6, 0.18, 0.8], [-17, 0.09, -9.4]);
  for (const x of [-19.2, -14.8]) {
    house.box(C.white, [1.2, 1.05, 0.08], [x, 2.05, -9.73]);
    house.box("#b5835a", [1.2, 0.22, 0.35], [x, 1.45, -9.6]);
    for (let i = 0; i < 4; i++) flowers.ico(["#f28bb0", "#ffd45c", "#f7f7f7", "#c79ae8"][i]!, 0.12, 0, [x - 0.45 + i * 0.3, 1.66, -9.58]);
    win.box("#ffffff", [0.9, 0.8, 0.08], [x, 2.05, -9.68]);
  }
  win.box("#ffffff", [0.08, 0.8, 0.9], [-13.48, 2.05, -12]);
  house.box(C.white, [0.06, 1.05, 1.2], [-13.52, 2.05, -12]);
  snow.gable(C.snow, 8.0, 5.55, 2.36, [-17, 3.4, -12]);
  snow.box(C.snow, [0.95, 0.15, 0.95], [-14.8, 5.8, -12.9]);
  // barrel + bench
  st.cyl("#b07a52", 0.35, 0.35, 0.8, 8, [-20.2, 0.4, -9.3]);
  st.box(C.wood, [1.4, 0.1, 0.45], [-15, 0.5, -9.2]);
  st.box(C.woodDark, [0.1, 0.45, 0.4], [-15.6, 0.23, -9.2]);
  st.box(C.woodDark, [0.1, 0.45, 0.4], [-14.4, 0.23, -9.2]);

  // ---------------------------------------------------------------- barn / lean-to (zone "barn")
  flat.box(C.straw, [10.6, 0.05, 7.2], [-17.5, 0.025, -1.55]);
  st.box("#b5835a", [11.2, 2.9, 0.3], [-17.5, 1.45, -5.2]);
  st.box("#a9774f", [0.3, 2.9, 2.8], [-23, 1.45, -3.85]);
  for (const x of [-22.8, -17.5, -12.2]) st.cyl(C.woodDark, 0.13, 0.15, 2.5, 6, [x, 1.25, -2.6]);
  st.box("#cf7560", [11.8, 0.18, 3.4], [-17.5, 2.75, -3.95], [0.2, 0, 0]);
  snow.box(C.snow, [11.9, 0.08, 3.45], [-17.5, 2.87, -3.95], [0.2, 0, 0]);
  for (const [x, z] of [[-22.2, -4.4], [-21.1, -4.4], [-22.2, -3.4]] as const) st.box(C.hay, [1, 0.7, 0.9], [x, 0.35, z]);
  st.box(C.hay, [1, 0.7, 0.9], [-21.65, 1.05, -4.4]);
  st.box(C.wood, [2.2, 0.5, 0.6], [-15, 0.3, -4.6]); // trough
  fence(st, -23, 2.3, -15.2, 2.3, 0.8, C.wood, "#b98a5e");
  fence(st, -13.8, 2.3, -12, 2.3, 0.8, C.wood, "#b98a5e");
  fence(st, -23, -2.6, -23, 2.3, 0.8, C.wood, "#b98a5e");
  win.box("#ffffff", [0.25, 0.35, 0.25], [-17.5, 2.2, -2.45]); // lantern

  // ---------------------------------------------------------------- main paddock
  fence(st, -9, -10, 7, -10);
  fence(st, -9, -10, -9, 2);
  fence(st, 7, -10, 7, -5.2);
  fence(st, 7, -3.2, 7, 2);
  fence(st, -9, 2, 0.2, 2);
  fence(st, 1.8, 2, 7, 2);
  st.box(C.rail, [1.4, 0.7, 0.08], [0.9, 0.5, 2.7], [0, -1.2, 0]); // open gate leaf
  st.box(C.wood, [1.8, 0.5, 0.7], [-6.5, 0.28, -10.7]); // water trough (outside the fence)
  st.box("#9fd0e8", [1.6, 0.05, 0.5], [-6.5, 0.54, -10.7]);
  const mainGate = layer();
  { const b = new GeoBatch(0.03, rng); fence(b, 7, -5.2, 7, -3.2, 0.9, C.post, "#d8c6a2"); mk(b, staticMat, true, true, mainGate); }

  // ---------------------------------------------------------------- paddock 2 (fenced) / meadow
  const pad2 = layer();
  {
    const b = new GeoBatch(0.03, rng);
    fence(b, 8.5, -11, 20, -11);
    fence(b, 20, -11, 20, 1);
    fence(b, 8.5, 1, 20, 1);
    fence(b, 8.5, -11, 8.5, -5.2);
    fence(b, 8.5, -3.2, 8.5, 1);
    fence(b, 7, -5.2, 8.5, -5.2, 0.9);
    fence(b, 7, -3.2, 8.5, -3.2, 0.9);
    b.box(C.rail, [1.9, 0.7, 0.08], [7.2, 0.5, -6.1], [0, -1.35, 0]);
    b.box(C.wood, [0.9, 0.9, 0.12], [9.2, 1.2, 1.3]);
    mk(b, staticMat, true, true, pad2);
  }
  const meadow = layer();
  {
    const b = new GeoBatch(0.12, rng);
    for (let i = 0; i < 70; i++) {
      const x = 9 + rng() * 11, z = -11 + rng() * 12;
      const h = 0.35 + rng() * 0.45;
      b.cone("#ffffff", 0.16 + rng() * 0.1, h, 4, [x, h / 2, z], [0, rng() * 3, 0]);
    }
    mk(b, meadowMat, false, true, meadow);
    const r = new GeoBatch(0.05, rng);
    r.box(C.woodDark, [0.16, 0.6, 0.16], [8.6, 0.3, -9.5], [0.2, 0, 0.1]);
    r.box(C.woodDark, [0.16, 0.45, 0.16], [12.3, 0.22, -11], [0, 0, -0.3]);
    r.ico(C.rock, 0.45, 0, [16.5, 0.2, -2.5], [1.2, 0.7, 1]);
    mk(r, staticMat, true, true, meadow);
  }

  // ---------------------------------------------------------------- pond
  {
    const g = new THREE.CylinderGeometry(2.9, 2.9, 0.06, 14).translate(-5, 0.035, 9.5);
    g.scale(1, 1, 0.82).translate(0, 0, 9.5 * 0.18);
    disposables.push(g);
    const pond = new THREE.Mesh(g, pondMat);
    pond.receiveShadow = shadows;
    group.add(pond);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rng() * 0.2;
      st.ico(C.rock, 0.28 + rng() * 0.12, 0, [-5 + Math.cos(a) * 3.05, 0.08, 9.5 + Math.sin(a) * 2.5], [1.2, 0.55, 1]);
    }
    for (let i = 0; i < 7; i++) st.cone("#79a95b", 0.06, 0.9 + rng() * 0.4, 4, [-7.4 + rng() * 0.9, 0.5, 7.9 + rng() * 0.9]);
    flowers.cyl("#6fb35d", 0.3, 0.3, 0.03, 7, [-4.2, 0.08, 10.2]);
    flowers.cyl("#6fb35d", 0.24, 0.24, 0.03, 7, [-3.5, 0.08, 9.3]);
    flowers.ico("#f7a8c8", 0.08, 0, [-4.1, 0.14, 10.1]);
    // duck
    st.ico("#fbf8f0", 0.22, 0, [-5.6, 0.18, 9.9], [1.3, 0.8, 1]);
    st.ico("#fbf8f0", 0.13, 0, [-5.3, 0.4, 9.9]);
    st.box("#f0a53a", [0.14, 0.05, 0.08], [-5.15, 0.38, 9.9]);
  }

  // ---------------------------------------------------------------- shed with notice board (hotspot)
  const shed = new GeoBatch(0.03, rng);
  shed.box(C.wood, [5, 2.5, 3.6], [5.8, 1.25, 9.1]);
  for (let i = 0; i < 6; i++) shed.box("#b8875b", [0.06, 2.4, 0.04], [3.6 + i * 0.85, 1.2, 10.92]);
  shed.gable("#8ea4bf", 5.6, 4.3, 1.4, [5.8, 2.5, 9.1]);
  shed.box(C.woodDark, [1.2, 1.9, 0.08], [7.3, 0.95, 10.93]);
  shed.box("#b5cfe0", [0.8, 0.6, 0.06], [4.4, 1.7, 10.95]);
  shed.box(C.woodDark, [0.14, 1.8, 0.14], [4.0, 0.9, 12.1]);
  shed.box(C.woodDark, [0.14, 1.8, 0.14], [6.0, 0.9, 12.1]);
  shed.box("#b78655", [2.4, 1.3, 0.14], [5.0, 1.55, 12.1]);
  shed.box("#8c6340", [2.6, 0.12, 0.3], [5.0, 2.25, 12.1]);
  const papers: [number, number, string][] = [[4.35, 1.75, "#fffdf5"], [4.95, 1.55, "#fff1a8"], [5.55, 1.8, "#ffd3e0"], [4.6, 1.25, "#d9f0ff"], [5.45, 1.25, "#fffdf5"]];
  for (const [x, y, c] of papers) shed.box(c, [0.45, 0.5, 0.03], [x, y, 12.19], [0, 0, (x * 7) % 0.3 - 0.15]);
  snow.gable(C.snow, 5.7, 4.45, 1.45, [5.8, 2.55, 9.1]);
  win.box("#ffffff", [0.7, 0.5, 0.05], [4.4, 1.7, 10.98]);

  // ---------------------------------------------------------------- market stall + trader (hotspot)
  const mkt = new GeoBatch(0.03, rng);
  mkt.box("#d9a36b", [3.6, 1.1, 1.1], [-12, 0.55, 11]);
  mkt.box("#e9bd85", [3.8, 0.12, 1.3], [-12, 1.14, 11]);
  for (const [x, z] of [[-13.75, 10.45], [-10.25, 10.45], [-13.75, 11.5], [-10.25, 11.5]] as const) mkt.cyl(C.woodDark, 0.07, 0.07, 2.6, 5, [x, 1.3, z]);
  for (let i = 0; i < 6; i++) mkt.box(i % 2 ? "#fff6ea" : "#f28b82", [0.66, 0.08, 1.9], [-13.65 + i * 0.66, 2.65, 10.95], [0.28, 0, 0]);
  for (let i = 0; i < 6; i++) mkt.box(i % 2 ? "#fff6ea" : "#f28b82", [0.66, 0.3, 0.05], [-13.65 + i * 0.66, 2.3, 11.92]);
  const produce = ["#e45b52", "#8cc76b", "#f3eee2", "#f0b34a", "#e45b52", "#8fa8d8"];
  for (let i = 0; i < 6; i++) mkt.ico(produce[i]!, 0.2, 0, [-13.3 + i * 0.52, 1.35, 11.05 + (i % 2) * 0.2]);
  mkt.box("#fff6ea", [2.2, 0.45, 0.08], [-12, 3.05, 11.1]);
  // trader
  mkt.cyl("#7fb3d5", 0.26, 0.36, 1.25, 7, [-12, 0.62, 10.1]);
  mkt.ico("#f0c9a4", 0.27, 1, [-12, 1.5, 10.1]);
  mkt.cyl("#e2c07a", 0.5, 0.5, 0.05, 10, [-12, 1.68, 10.1]);
  mkt.cyl("#e2c07a", 0.22, 0.28, 0.25, 8, [-12, 1.82, 10.1]);
  mkt.ico("#3a302e", 0.04, 0, [-11.85, 1.55, 10.34]);
  mkt.ico("#3a302e", 0.04, 0, [-12.15, 1.55, 10.34]);
  mkt.box("#7fb3d5", [0.16, 0.6, 0.16], [-11.72, 1.05, 10.3], [0.4, 0, 0.5]);
  snow.box(C.snow, [4.0, 0.06, 1.9], [-12, 2.72, 10.95], [0.28, 0, 0]);
  // market pen + visitor pen
  flat.box(C.straw, [6.2, 0.05, 4.4], [-19, 0.025, 12.5]);
  fence(st, -22.2, 10.2, -15.8, 10.2, 0.8, C.wood, "#b98a5e");
  fence(st, -22.2, 14.8, -15.8, 14.8, 0.8, C.wood, "#b98a5e");
  fence(st, -22.2, 10.2, -22.2, 14.8, 0.8, C.wood, "#b98a5e");
  fence(st, -15.8, 10.2, -15.8, 11.6, 0.8, C.wood, "#b98a5e");
  fence(st, -15.8, 13.2, -15.8, 14.8, 0.8, C.wood, "#b98a5e");
  flat.box(C.straw, [3.4, 0.05, 2.9], [-12, 0.025, 15.5]);
  fence(st, -13.8, 13.9, -10.2, 13.9, 0.8, "#e9d7b6", "#d7c19a");
  fence(st, -13.8, 17.1, -10.2, 17.1, 0.8, "#e9d7b6", "#d7c19a");
  fence(st, -13.8, 13.9, -13.8, 17.1, 0.8, "#e9d7b6", "#d7c19a");
  fence(st, -10.2, 13.9, -10.2, 17.1, 0.8, "#e9d7b6", "#d7c19a");
  st.box(C.wood, [0.1, 1.3, 0.1], [-9.8, 0.65, 13.7]);
  st.box("#fff6ea", [0.9, 0.5, 0.06], [-9.8, 1.35, 13.75]);
  const visitorL = layer();
  {
    const b = new GeoBatch(0, rng);
    b.box("#ffffff", [0.05, 1.1, 0.05], [-10.2, 1.35, 13.9]);
    b.add(triangle(0.55, 0.36).rotateZ(-Math.PI / 2).translate(0.02, 1.9, 0), "#8fa8d8", mat([-10.2, 0, 13.9]));
    b.box("#ffd257", [0.5, 0.12, 0.08], [-9.8, 1.35, 13.8]);
    mk(b, staticMat, false, false, visitorL);
  }
  st.box(C.hay, [0.9, 0.5, 0.7], [-21.5, 0.25, 14.1]);

  // ---------------------------------------------------------------- vet hut (hotspot)
  const vet = new GeoBatch(0.03, rng);
  vet.box(C.white, [3.4, 2.3, 3], [21, 1.15, 10]);
  vet.gable(C.teal, 3.9, 3.6, 1.3, [21, 2.3, 10]);
  vet.box("#7aa7c7", [0.95, 1.7, 0.08], [21.6, 0.85, 11.52]);
  vet.box(C.white, [1.1, 1.1, 0.1], [20.3, 1.9, 11.6]);
  vet.box(C.red, [0.8, 0.24, 0.06], [20.3, 1.9, 11.67]);
  vet.box(C.red, [0.24, 0.8, 0.06], [20.3, 1.9, 11.67]);
  vet.box(C.woodDark, [0.12, 1.6, 0.12], [22.9, 0.8, 12.2]);
  vet.box(C.white, [0.8, 0.8, 0.1], [22.9, 1.8, 12.2]);
  vet.box(C.red, [0.56, 0.17, 0.06], [22.9, 1.8, 12.27]);
  vet.box(C.red, [0.17, 0.56, 0.06], [22.9, 1.8, 12.27]);
  snow.gable(C.snow, 4.0, 3.75, 1.35, [21, 2.35, 10]);
  win.box("#ffffff", [0.08, 0.7, 0.9], [22.73, 1.4, 10]);

  // ---------------------------------------------------------------- fairground (hotspot)
  const fair = new GeoBatch(0.03, rng);
  fair.cyl(C.sand, 3.7, 3.7, 0.08, 16, [14, 0.04, 11]);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    if (i === 4) continue; // entrance facing the camera
    fair.box(C.white, [0.14, 0.6, 0.14], [14 + Math.cos(a) * 3.4, 0.3, 11 + Math.sin(a) * 3.4]);
    const a2 = ((i + 1) / 16) * Math.PI * 2;
    if (i + 1 === 4) continue;
    const mx = 14 + (Math.cos(a) + Math.cos(a2)) * 1.7, mz = 11 + (Math.sin(a) + Math.sin(a2)) * 1.7;
    const len = 2 * 3.4 * Math.sin(Math.PI / 16);
    fair.box("#f2b5c4", [len, 0.08, 0.06], [mx, 0.48, mz], [0, -(a + a2) / 2 + Math.PI / 2, 0]);
  }
  fair.box("#ffd257", [0.8, 0.6, 0.8], [14, 0.3, 9]);
  fair.box("#d8dde3", [0.8, 0.4, 0.8], [13.2, 0.2, 9]);
  fair.box("#e2a36b", [0.8, 0.28, 0.8], [14.8, 0.14, 9]);
  const poleA = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  const poleP = poleA.map((a) => [14 + Math.cos(a) * 4.0, 11 + Math.sin(a) * 4.0] as const);
  for (const [x, z] of poleP) {
    fair.cyl(C.white, 0.07, 0.09, 3.0, 6, [x, 1.5, z]);
    fair.ico("#ffd257", 0.13, 0, [x, 3.05, z]);
  }
  const bunt = layer();
  {
    const b = new GeoBatch(0, rng);
    const cols = ["#f28b82", "#ffd257", "#8fd0e8", "#b9e39a", "#d6a8ee"];
    let ci = 0;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = poleP[k]!;
      const [bx, bz] = poleP[(k + 1) % 4]!;
      const n = 9;
      const ry = -Math.atan2(bz - az, bx - ax);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const y = 2.9 - Math.sin(t * Math.PI) * 0.6;
        const m = mat([ax + (bx - ax) * t, y, az + (bz - az) * t], [0, ry, 0]);
        b.add(triangle(0.42, 0.5).translate(-0.21, 0, 0), cols[ci++ % cols.length]!, m);
      }
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < 6; s++) {
        const t0 = s / 6, t1 = (s + 1) / 6;
        const y0 = 2.92 - Math.sin(t0 * Math.PI) * 0.6, y1 = 2.92 - Math.sin(t1 * Math.PI) * 0.6;
        const tm = (t0 + t1) / 2;
        b.box("#fffaf0", [len / 6 + 0.02, 0.03, 0.03], [ax + (bx - ax) * tm, (y0 + y1) / 2, az + (bz - az) * tm], [0, ry, Math.atan2(y1 - y0, len / 6)]);
      }
    }
    b.box("#ffffff", [0.06, 1.2, 0.06], [14, 1.2, 9]);
    b.add(triangle(0.6, 0.4).rotateZ(-Math.PI / 2).translate(0.03, 1.8, 0), "#f28b82", mat([14, 0, 9]));
    mk(b, staticMat, false, false, bunt);
  }

  // ---------------------------------------------------------------- mailbox + gate + lamp (mailbox is a hotspot)
  const mail = new GeoBatch(0.03, rng);
  mail.box(C.woodDark, [0.14, 1.1, 0.14], [3, 0.55, 17.3]);
  mail.box("#6f9fd8", [0.5, 0.42, 0.75], [3, 1.3, 17.3]);
  mail.cyl("#6f9fd8", 0.25, 0.25, 0.75, 8, [3, 1.5, 17.3], [Math.PI / 2, 0, 0]);
  mail.box(C.red, [0.05, 0.4, 0.06], [3.29, 1.6, 17.0]);
  mail.box(C.red, [0.05, 0.14, 0.2], [3.29, 1.75, 16.9]);
  snow.box(C.snow, [0.55, 0.1, 0.8], [3, 1.76, 17.3]);
  st.box(C.post, [0.3, 1.4, 0.3], [0.05, 0.7, 18.6]);
  st.box(C.post, [0.3, 1.4, 0.3], [1.95, 0.7, 18.6]);
  st.box(C.rail, [1.5, 0.8, 0.08], [2.6, 0.6, 17.9], [0, 1.25, 0]);
  st.cyl("#5f6b73", 0.06, 0.08, 2.4, 6, [-0.7, 1.2, 17.9]);
  st.box("#5f6b73", [0.4, 0.08, 0.4], [-0.7, 2.62, 17.9]);
  win.box("#ffffff", [0.28, 0.32, 0.28], [-0.7, 2.42, 17.9]);

  // front hedge
  for (let x = -24.2; x < 24.5; x += 1.1) {
    if (x > -0.9 && x < 3.7) continue;
    fol.ico("#e6f0e0", 0.62, 0, [x, 0.45, 18.4], [1.1, 0.8, 0.85], [rng(), rng(), rng()]);
    snow.ico(C.snow, 0.4, 0, [x, 0.8, 18.4], [1.2, 0.35, 0.8]);
  }

  // ---------------------------------------------------------------- trees
  const spots: [number, number][] = [
    [-23, -16.5], [-10, -16.4], [-4.5, -16.8], [2.5, -16], [9, -16.8], [15, -16.3], [22.5, -15.8],
    [23.2, -6.5], [22.8, 3.2], [-23.5, 7.3], [-23.4, 17.2], [23.3, 16.8],
  ];
  const trees: [number, number, boolean][] = [];
  for (const [x, z] of spots) {
    if (rng() < 0.22 && trees.length > 7) continue;
    trees.push([x + (rng() - 0.5) * 1.2, z + (rng() - 0.5) * 0.8, rng() < 0.35]);
  }
  for (const [x, z, pine] of trees) {
    const s = 0.85 + rng() * 0.35;
    if (pine) {
      st.cyl(C.trunk, 0.18 * s, 0.24 * s, 1.0 * s, 6, [x, 0.5 * s, z]);
      for (let k = 0; k < 3; k++) {
        const r = (1.5 - k * 0.38) * s, h = (1.7 - k * 0.2) * s, y = (1.0 + k * 1.05) * s + h / 2;
        st.cone(C.pine, r, h, 7, [x, y, z], [0, rng(), 0]);
        snow.cone(C.snow, r * 0.55, h * 0.45, 7, [x, y + h * 0.3, z]);
      }
    } else {
      st.cyl(C.trunk, 0.2 * s, 0.3 * s, 1.8 * s, 6, [x, 0.9 * s, z]);
      const blobs: [number, number, number, number][] = [[0, 2.6, 0, 1.35], [0.8, 2.1, 0.3, 0.95], [-0.7, 2.2, -0.2, 1.0], [0.1, 3.3, -0.1, 0.9]];
      for (const [bx, by, bz, br] of blobs) {
        const shade = 0.82 + rng() * 0.18;
        const g = Math.round(255 * shade);
        fol.ico(`rgb(${g},${g},${g})`, br * s, 0, [x + bx * s, by * s, z + bz * s], 1, [rng() * 3, rng() * 3, 0]);
      }
      snow.ico(C.snow, 0.95 * s, 0, [x + 0.05 * s, 3.65 * s, z - 0.05 * s], [1.1, 0.42, 1.1]);
      for (let k = 0; k < 9; k++) {
        const a = rng() * Math.PI * 2, e = rng() * 1.2;
        spring.ico(k % 3 ? "#f7b6cf" : "#fde6ef", 0.16, 0, [x + Math.cos(a) * 1.25 * s, (2.6 + e) * s, z + Math.sin(a) * 1.25 * s]);
      }
      for (let k = 0; k < 5; k++) autumn.ico(k % 2 ? "#e0673f" : "#ee9a4c", 0.14, 0, [x + (rng() - 0.5) * 3, 0.03, z + (rng() - 0.5) * 3], [1, 0.25, 1]);
    }
  }
  // bushes
  for (let i = 0; i < 18; i++) {
    const x = -24 + rng() * 48, z = -18 + rng() * 36;
    if (!freeAt(x, z, 0.8)) continue;
    const s = 0.4 + rng() * 0.3;
    fol.ico("#dfe9d8", s, 0, [x, s * 0.6, z], [1.2, 0.8, 1]);
    snow.ico(C.snow, s * 0.8, 0, [x, s * 1.0, z], [1.2, 0.4, 1]);
    if (rng() < 0.5) spring.ico("#fff4a8", 0.08, 0, [x + 0.2, s * 1.1, z + 0.3]);
  }
  // rocks
  for (let i = 0; i < 10; i++) {
    const x = -24 + rng() * 48, z = -18 + rng() * 36;
    if (!freeAt(x, z, 0.3)) continue;
    st.ico(C.rock, 0.2 + rng() * 0.25, 0, [x, 0.08, z], [1.3, 0.6, 1], [rng(), rng(), rng()]);
  }
  // flowers + grass tufts
  const fcols = ["#f28bb0", "#ffd45c", "#ffffff", "#c79ae8", "#ff9d7a", "#8fc8f0"];
  for (let i = 0, placed = 0; i < 400 && placed < 90; i++) {
    const x = -24.5 + rng() * 49, z = -18.5 + rng() * 37;
    if (!freeAt(x, z, 0.2)) continue;
    placed++;
    const c = fcols[Math.floor(rng() * fcols.length)]!;
    flowers.box("#6fb35d", [0.04, 0.26, 0.04], [x, 0.13, z]);
    flowers.ico(c, 0.1, 0, [x, 0.28, z]);
    if (rng() < 0.5) autumn.ico(rng() < 0.5 ? "#e0673f" : "#f2c257", 0.12, 0, [x, 0.02, z], [1, 0.2, 1]);
  }
  // pumpkins (autumn) & snowman (winter)
  for (const [x, z, r] of [[-18.3, -9.1, 0.32], [-17.8, -8.9, 0.24], [-10.9, 11.9, 0.26], [-13.1, 12.0, 0.3]] as const) {
    autumn.ico("#f09a3e", r, 1, [x, r * 0.8, z], [1.2, 0.85, 1.2]);
    autumn.box("#6c8a3e", [0.06, 0.15, 0.06], [x, r * 1.55, z]);
  }
  snow.ico(C.snow, 0.55, 1, [-20.3, 0.5, -7.7]);
  snow.ico(C.snow, 0.4, 1, [-20.3, 1.25, -7.7]);
  snow.ico(C.snow, 0.28, 1, [-20.3, 1.8, -7.7]);
  snow.cone("#f0a53a", 0.06, 0.3, 5, [-20.05, 1.8, -7.55], [0, 0, -Math.PI / 2]);

  // ---------------------------------------------------------------- build meshes
  mk(flat, staticMat, false, true);
  mk(st, staticMat);
  mk(fol, foliageMat);
  const wm = mk(win, windowMat, false, false);
  if (wm) wm.userData.windows = true;
  const snowL = layer(); mk(snow, staticMat, true, true, snowL);
  const springL = layer(); mk(spring, staticMat, true, true, springL);
  const flowersL = layer(); mk(flowers, staticMat, false, true, flowersL);
  const autumnL = layer(); mk(autumn, staticMat, false, true, autumnL);

  const hotspotMeshes = {} as Record<Hotspot, THREE.Mesh>;
  const hotspotPicks: THREE.Mesh[] = [];
  const pickGeo = new THREE.BoxGeometry(1, 1, 1);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  disposables.push(pickGeo, pickMat);
  const hs: [Hotspot, GeoBatch][] = [["house", house], ["shed", shed], ["market", mkt], ["vet", vet], ["fairground", fair], ["mailbox", mail]];
  for (const [id, b] of hs) {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: "#fff3c4", emissiveIntensity: 0 });
    disposables.push(m);
    const mesh = mk(b, m, id !== "fairground", true)!;
    mesh.userData.hotspot = id;
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
  const smokeGeo = new THREE.IcosahedronGeometry(0.28, 0);
  const smokeMat = new THREE.MeshLambertMaterial({ color: "#f4f4f4", transparent: true, opacity: 0.8, flatShading: true });
  disposables.push(smokeGeo, smokeMat);
  const smoke: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(smokeGeo, smokeMat);
    m.position.set(-14.8, 6.2 + i * 0.6, -12.9);
    group.add(m);
    smoke.push(m);
  }

  return {
    group, groundMat, foliageMat, meadowMat, pondMat, windowMat, smoke,
    layers: { snow: snowL, spring: springL, flowers: flowersL, autumn: autumnL, paddock2: pad2, meadow, mainGate, bunting: bunt, visitor: visitorL },
    hotspotMeshes, hotspotPicks,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}
