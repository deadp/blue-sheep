// Procedural low-poly sheep built from a WorldSheep phenotype.
// Two merged geometries per sheep (wool body + tail, head), vertex-coloured so
// materials are shared across the whole flock. Legs, ears and eyes are
// articulated parts: instanced flock-wide in the world (parts.ts), real
// meshes in portraits (buildFullRig). SheepPose drives both.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { GeoBatch, mat, type V3 } from "./builder.js";
import { hashString, mulberry32 } from "./rng.js";
import { woolHex } from "./palette.js";
import type { WorldSheep } from "./types.js";

export interface SheepDims {
  /** overall body scale from size */
  s: number;
  L: number;
  H: number;
  W: number;
  legLen: number;
  bodyY: number;
  /** head pivot at the poll (body space) */
  neck: V3;
  /** head scale (the friendlier round-3 face: a touch bigger; bigger still on lambs) */
  hs: number;
  /** marker height in root space (before lamb scale) */
  top: number;
  /** root scale (lambs are 0.66) */
  rootScale: number;
}

/** Articulated parts drawn separately from the merged body/head (instanced in the world). */
export interface SheepParts {
  /** Hip pivots in root space (before rootScale): front-left, front-right, back-left, back-right. */
  hips: V3[];
  /** Leg radius (root space). */
  legR: number;
  /** Ear pivots in head space (after head scale): left (+z), right (-z). */
  ears: V3[];
  earScale: number;
  /** Eye centres in head space (after head scale). */
  eyes: V3[];
  eyeR: number;
  /** Eyes sit on the sides of the head: how far each turns from straight ahead (rad). */
  eyeYaw: number;
  face: string;
}

export interface SheepGeos {
  key: string;
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  dims: SheepDims;
  parts: SheepParts;
}

/** Sheep read better a little larger than life next to the buildings. */
export const WORLD_SCALE = 1.22;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const num = (v: number, d: number) => (Number.isFinite(v) ? v : d);

/** Detail of the fleece (wool locks per sheep): "lite" halves the triangles for slow machines. */
let LOCKS = 52;
export function setSheepDetail(d: "full" | "lite"): void { LOCKS = d === "lite" ? 34 : 52; }

/**
 * Modest procedural breed looks (DESIGN-v3 §3.2, §13 phase 3): build, fleece texture and face/leg colour. The
 * default is the Farm sheep. `locks` and `lockR` scale the number and size of wool locks, `stretch` makes them
 * longer (shaggy), `body` scales the build, `face` is the face and leg colour on white or oatmeal sheep and
 * `faceDark` on coloured ones (null: the usual dark brown tinted by the fleece).
 */
export interface BreedLook { locks: number; lockR: number; stretch: number; body: number; face: string | null; faceDark: string | null; tail: number }
const FARM_LOOK: BreedLook = { locks: 1, lockR: 1, stretch: 1, body: 1, face: null, faceDark: null, tail: 1 };
export const BREED_LOOKS: Record<string, BreedLook> = {
  farm: FARM_LOOK,
  // fine, dense and compact; creamy face under a woolly cap
  merino: { locks: 1.3, lockR: 0.82, stretch: 0.9, body: 0.93, face: "#f1e6d3", faceDark: "#8a7565", tail: 1 },
  corriedale: { locks: 1.05, lockR: 0.95, stretch: 1, body: 1.03, face: "#efe4d2", faceDark: null, tail: 1 },
  // hardy hill sheep: a greyish face and legs, a touch sturdier
  perendale: { locks: 0.95, lockR: 1.05, stretch: 1.1, body: 0.98, face: "#cfc4b3", faceDark: "#5d4e47", tail: 1 },
  // lustrous longwool: long, sleek locks, a big frame, a clean white face
  romney: { locks: 0.82, lockR: 1.12, stretch: 1.4, body: 1.07, face: "#f3ebdd", faceDark: null, tail: 1 },
  // hairy carpet wool: shaggy, rangy, tan face
  drysdale: { locks: 0.68, lockR: 1.3, stretch: 1.6, body: 1.02, face: "#b8a58d", faceDark: "#6d5a4b", tail: 1.2 },
  // Icelandic: smaller, shaggy double coat, tan face and legs, a fat short tail
  icelandic: { locks: 0.74, lockR: 1.28, stretch: 1.5, body: 0.9, face: "#9a7d60", faceDark: "#5b4638", tail: 1.7 },
};
export function breedLook(w: WorldSheep): BreedLook {
  return BREED_LOOKS[w.breed ?? "farm"] ?? FARM_LOOK;
}

export function sheepKey(w: WorldSheep): string {
  return [
    w.id, w.breed ?? "farm", woolHex(w), w.pattern, w.horns, w.sex, w.adult ? 1 : 0,
    Math.round(num(w.size, 60)), Math.round(num(w.fleeceWeight, 4) * 4), Math.round(num(w.crimp, 5) * 2),
  ].join("|");
}

/** The natural sheep (DESIGN-v3 §15 items 20–22): a woolly barrel on slim legs, a natural head carried forward. */
export function sheepDims(w: WorldSheep): SheepDims {
  const s = clamp((0.75 + (num(w.size, 60) - 40) * 0.0105) * breedLook(w).body, 0.62, 1.25);
  const p = clamp(0.9 + num(w.fleeceWeight, 4) * 0.04, 0.95, 1.18);
  const L = 0.62 * s * p;
  const H = 0.38 * s * p;
  const W = 0.37 * s * p;
  const legLen = (w.adult ? 0.47 : 0.52) * Math.sqrt(s);
  const bodyY = legLen + H * 0.62;
  const hs = (w.adult ? 1.34 : 1.62) * Math.sqrt(s);
  const neck: V3 = [L * 1.16, bodyY + H * 0.98, 0];
  return {
    s, L, H, W, legLen, bodyY, neck, hs,
    top: Math.max(bodyY + H + 0.45, neck[1] + 0.22 * hs + 0.3),
    rootScale: WORLD_SCALE * (w.adult ? 1 : 0.66),
  };
}

/** Face and leg colour: cream on white sheep, a warm dark brown (faintly tinted by the fleece) otherwise. */
export function faceHex(w: WorldSheep): string {
  const look = breedLook(w);
  if (w.family === "white" || w.family === "oatmeal") return look.face ?? "#eadfce";
  const c = new THREE.Color(look.faceDark ?? "#6a564d").lerp(new THREE.Color(woolHex(w)), 0.14);
  return `#${c.getHexString()}`;
}

const HORN = "#dcc59a";
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
/** Golden-angle points on a sphere: an even spread for the wool locks. */
function fib(i: number, n: number): [number, number, number] {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * 2.399963229728653;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

/** Soft top light baked into the fleece: shaded belly, bright back. */
function shadeByHeight(geo: THREE.BufferGeometry, y0: number, y1: number, lo: number, hi: number): void {
  const p = geo.getAttribute("position");
  const c = geo.getAttribute("color");
  for (let i = 0; i < p.count; i++) {
    const t = clamp((p.getY(i) - y0) / (y1 - y0), 0, 1);
    const k = lo + (hi - lo) * (t * t * (3 - 2 * t));
    c.setXYZ(i, Math.min(1, c.getX(i) * k), Math.min(1, c.getY(i) * k), Math.min(1, c.getZ(i) * k));
  }
  c.needsUpdate = true;
}

/** Weld a merged, vertex-coloured geometry so it shades smoothly (soft wool rather than facets). */
export function smoothGeo(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.deleteAttribute("normal");
  const g = mergeVertices(geo, 1e-4);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  geo.dispose();
  return g;
}

/** Head-space transform shared by the head mesh, eyes and ears: tilted a little down, then scaled. */
const HEAD_TILT = -0.28;
function headPoint(x: number, y: number, z: number, hs: number): V3 {
  const c = Math.cos(HEAD_TILT), s = Math.sin(HEAD_TILT);
  return [(x * c - y * s) * hs, (x * s + y * c) * hs, z * hs];
}

export function buildSheepGeos(w: WorldSheep): SheepGeos {
  const d = sheepDims(w);
  const rng = mulberry32(hashString(w.id) ^ 0x5eed);
  const wool = new THREE.Color(woolHex(w));
  const face = faceHex(w);
  const faceC = new THREE.Color(face);
  const spotHex = w.family === "white" ? "#6b5646" : "#f6f1e6";
  const { L, H, W } = d;

  // ---- fleece: a barrel covered in small locks (crimp → more, smaller locks; fleece weight → a fuller barrel)
  const crimp = clamp(num(w.crimp, 5), 1, 10);
  const curl = (crimp - 2) / 6;
  const spots: THREE.Vector3[] = [];
  if (w.pattern === "spotted") {
    const k = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < k; i++) spots.push(new THREE.Vector3(rng() * 2 - 1, rng() * 1.2 - 0.1, rng() * 2 - 1).normalize());
  }
  const isSpot = (x: number, y: number, z: number) => { _dir.set(x, y, z).normalize(); return spots.some((sp) => _dir.dot(sp) > 0.82); };
  const bb = new GeoBatch(0, rng);
  bb.ico(wool, 1, 2, [0, 0, 0], [L, H, W]);
  const look = breedLook(w);
  const n = Math.round(LOCKS * (0.85 + curl * 0.35) * look.locks);
  const lockR = (0.1 - curl * 0.02) * ((L + H + W) / 1.37) * Math.sqrt(72 / LOCKS) * look.lockR;
  for (let i = 0; i < n; i++) {
    const [x, y, z] = fib(i, n);
    if (y < -0.72) continue;
    _c.set(isSpot(x, y, z) ? spotHex : wool).multiplyScalar(0.97 + rng() * 0.06);
    const r = lockR * (0.85 + rng() * 0.4);
    bb.ico(_c.getHex(), r, 1, [x * L * 0.97, y * H * 0.95, z * W * 0.97], [1.2, (0.85 + curl * 0.2) * look.stretch, 1], [rng() * 3, rng() * 3, rng() * 3]);
  }
  // rump and breast fullness, a woolly neck carrying the head forward, a short docked tail
  const woolAt = (x: number, y: number, z: number) => (isSpot(x, y, z) ? spotHex : wool);
  bb.ico(woolAt(-1, 0.1, 0), 0.3 * (L / 0.62), 2, [-L * 0.62, H * 0.12, 0], [1, 1.02, 1.08]);
  bb.ico(woolAt(1, 0.3, 0), 0.26 * (L / 0.62), 2, [L * 0.7, H * 0.3, 0], [1, 1.1, 0.95]);
  bb.ico(wool, 0.2 * (L / 0.62), 2, [L * 0.98, H * 0.72, 0], [1.15, 1.1, 0.82]);
  bb.ico(wool, 0.1 * (L / 0.62) * look.tail, 1, [-L * 1.05, H * 0.18, 0], [0.9, 1.3, 0.9]);
  const body = smoothGeo(bb.build()!);
  shadeByHeight(body, -H * 1.05, H * 0.9, 0.8, 1.03);

  // ---- head (pivot at the poll; faces +x; the friendlier round-3 face). Ears and eyes are separate parts.
  const hs = d.hs;
  const hb = new GeoBatch(0, rng);
  const at = (x: number, y: number, z: number) => headPoint(x, y, z, hs);
  const sc = (x: number, y: number, z: number): V3 => [x * hs, y * hs, z * hs];
  const hico = (c: THREE.ColorRepresentation, r: number, det: number, p: V3, s: V3 = [1, 1, 1], rot: V3 = [0, 0, 0]) =>
    hb.add(new THREE.IcosahedronGeometry(r, det), c, mat(at(p[0], p[1], p[2]), [rot[0], rot[1], rot[2] + HEAD_TILT], sc(s[0], s[1], s[2])));
  hico(face, 1, 2, [0.08, 0, 0], [0.18, 0.145, 0.125]);
  hico(face, 1, 2, [0.07, 0.01, 0], [0.19, 0.155, 0.14]);
  hico(face, 1, 2, [0.2, -0.045, 0], [0.13, 0.092, 0.095]);
  const nose = faceC.clone().lerp(new THREE.Color("#c99a90"), w.family === "white" || w.family === "oatmeal" ? 0.5 : 0.3);
  hico(nose, 1, 1, [0.31, -0.055, 0], [0.035, 0.055, 0.065]);
  // wool topknot and fleece behind the face
  hico(wool, 0.1, 1, [0.02, 0.1, 0], [1.1, 0.85, 1.15]);
  hico(wool, 0.06, 1, [0.1, 0.12, 0.04]);
  hico(wool, 0.06, 1, [0.1, 0.12, -0.04]);
  hico(wool, 0.13, 1, [-0.06, -0.02, 0], [1, 1.1, 1.2]);
  // a faint pale patch round each soft eye
  const patch = faceC.clone().lerp(new THREE.Color("#f4e8da"), 0.22);
  for (const side of [1, -1]) hico(patch, 0.064, 1, [0.138, 0.042, side * 0.106], [1.1, 1.05, 0.55], [0, side * 0.35, 0]);
  if (w.horns === "horned") {
    const ram = w.sex === "ram" && w.adult;
    const R = ram ? 0.13 : 0.085, turn = ram ? Math.PI * 1.8 : Math.PI * 1.35, segs = ram ? 12 : 9;
    const r0 = ram ? 0.05 : 0.036, r1 = ram ? 0.022 : 0.018;
    for (const side of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const a = Math.PI * 0.6 + t * turn;
        const r = R * (1 - 0.35 * t);
        const p = at(-0.02 + r * Math.cos(a), 0.04 + r * Math.sin(a), side * (0.1 + (ram ? 0.1 : 0.07) * t));
        pts.push(new THREE.Vector3(p[0], p[1], p[2]));
      }
      for (let i = 0; i < segs; i++) {
        const a = pts[i]!, b = pts[i + 1]!;
        const dv = new THREE.Vector3().subVectors(b, a);
        const len = dv.length();
        const q = new THREE.Quaternion().setFromUnitVectors(_up, dv.normalize());
        const rr = (r0 + (r1 - r0) * (i / segs)) * hs;
        hb.add(new THREE.CylinderGeometry(rr * 0.88, rr, len * 1.3, 7), HORN, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
      }
    }
  }
  const head = smoothGeo(hb.build()!);

  const hipY = d.legLen + 0.05;
  const parts: SheepParts = {
    hips: [[0.45 * L, hipY, 0.42 * W], [0.45 * L, hipY, -0.42 * W], [-0.45 * L, hipY, 0.42 * W], [-0.45 * L, hipY, -0.42 * W]],
    legR: 0.056 * Math.sqrt(d.s) * (w.adult ? 1 : 1.12),
    ears: [at(-0.01, 0.06, 0.1), at(-0.01, 0.06, -0.1)],
    earScale: hs * 1.05,
    eyes: [at(0.148, 0.042, 0.117), at(0.148, 0.042, -0.117)],
    eyeR: 0.05 * hs,
    eyeYaw: Math.PI / 2 - 0.42,
    face,
  };
  return { key: sheepKey(w), body, head, dims: d, parts };
}

export function disposeGeos(g: SheepGeos): void {
  g.body.dispose();
  g.head.dispose();
}

// ---------------------------------------------------------------- pose

/** Everything that animates on a sheep. The world and the live portrait both drive rigs through this. */
export interface SheepPose {
  /** body lift above the legs (walk bounce) */
  bob: number;
  /** breathing, ~±0.02 */
  breathe: number;
  /** vertical stretch for hops (1 = none) */
  squash: number;
  bodyRoll: number;
  bodyPitch: number;
  /** wool wobble: side-to-side jiggle of the fleece */
  wobble: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  /** leg swing angles (rad) FL, FR, BL, BR */
  legs: [number, number, number, number];
  /** 0 standing … 1 lying down with legs tucked */
  fold: number;
  /** ear droop (rad, rest ≈ 0.55) and sweep back (rad), left then right */
  earDroop: [number, number];
  earSweep: [number, number];
  /** 0 open … 1 closed */
  blink: number;
  /** pupil offset, -1..1 (portrait only) */
  lookX: number;
  lookY: number;
}

export function restPose(): SheepPose {
  return {
    bob: 0, breathe: 0, squash: 1, bodyRoll: 0, bodyPitch: 0, wobble: 0,
    headPitch: 0, headYaw: 0, headRoll: 0, legs: [0, 0, 0, 0], fold: 0,
    earDroop: [EAR_REST, EAR_REST], earSweep: [0, 0], blink: 0, lookX: 0, lookY: 0,
  };
}

/** Ears held out to the side, tips a little down (the natural sheep). */
export const EAR_REST = 0.32;

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Leg matrix in root space. */
export function legMatrix(out: THREE.Matrix4, geos: SheepGeos, i: number, pose: SheepPose): THREE.Matrix4 {
  const h = geos.parts.hips[i]!;
  const d = geos.dims;
  const drop = d.legLen * 0.85 * pose.fold;
  const side = h[2] > 0 ? 1 : -1;
  const len = Math.max(0.05, h[1] - drop);
  _e.set(side * 0.9 * pose.fold, 0, pose.legs[i]! * (1 - pose.fold));
  _q.setFromEuler(_e);
  const r = geos.parts.legR;
  return out.compose(_v.set(h[0], h[1] - drop, h[2]), _q, _s.set(r, len * (1 - 0.35 * pose.fold), r));
}

/** Ear matrix in head-pivot space. */
export function earMatrix(out: THREE.Matrix4, geos: SheepGeos, i: number, pose: SheepPose): THREE.Matrix4 {
  const p = geos.parts.ears[i]!;
  _e.set(pose.earDroop[i]!, pose.earSweep[i]!, 0, "XYZ");
  _q.setFromEuler(_e);
  if (i === 1) _q.premultiply(_qFlip);
  const k = geos.parts.earScale;
  return out.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(k, k, k));
}
const _qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

const _yAxis = new THREE.Vector3(0, 1, 0);
/** Eye matrix in head-pivot space (blink squashes it flat). */
export function eyeMatrix(out: THREE.Matrix4, geos: SheepGeos, i: number, pose: SheepPose): THREE.Matrix4 {
  const p = geos.parts.eyes[i]!;
  const r = geos.parts.eyeR;
  _q.setFromAxisAngle(_yAxis, i === 0 ? -geos.parts.eyeYaw : geos.parts.eyeYaw);
  return out.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(r, r * Math.max(0.12, 1 - pose.blink), r));
}

/** Transforms for the merged pieces (bob group, body, head pivot). */
export function applyPose(rig: SheepRig, geos: SheepGeos, pose: SheepPose): void {
  const d = geos.dims;
  const drop = d.legLen * 0.85 * pose.fold;
  rig.bob.position.y = pose.bob - drop;
  rig.bob.rotation.set(pose.bodyRoll, 0, pose.bodyPitch);
  const sq = pose.squash;
  const br = pose.breathe;
  rig.body.scale.set(1 / Math.sqrt(sq) + pose.wobble * 0.02, sq * (1 + br), (1 + br * 0.7) / Math.sqrt(sq));
  rig.body.rotation.x = pose.wobble * 0.05;
  rig.headPivot.rotation.set(pose.headRoll, pose.headYaw, pose.headPitch, "YXZ");
  rig.headPivot.position.y = d.neck[1] + (sq - 1) * d.H * 0.6;
}

// ---------------------------------------------------------------- materials

/** Shared flock materials and unit part geometries. Wool sheen is bucketed by fineness so materials stay shared. */
export class SheepMaterials {
  readonly wool: THREE.MeshStandardMaterial[];
  readonly skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  /** instanced parts take their colour from instanceColor */
  readonly part = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.9, metalness: 0 });
  /** eyes: vertex-coloured (a soft dark eye, a warm iris and catch-lights) */
  readonly eye = new THREE.MeshBasicMaterial({ vertexColors: true });
  readonly outlineSel = new THREE.MeshBasicMaterial({ color: "#ffd257", side: THREE.BackSide });
  readonly outlineHover = new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.BackSide, transparent: true, opacity: 0.85 });
  readonly pick = new THREE.MeshBasicMaterial({ visible: false });
  readonly pickGeo = new THREE.BoxGeometry(1, 1, 1);
  /** unit slim leg with a darker hoof: radius 1 at the hip, hangs from y=0 to y=-1 (vertex colour tints the hoof) */
  readonly legGeo = smoothGeo(new GeoBatch()
    .add(new THREE.CylinderGeometry(1, 0.82, 0.86, 8).translate(0, -0.43, 0), "#ffffff")
    .add(new THREE.CylinderGeometry(0.92, 1.02, 0.14, 8).translate(0, -0.93, 0), "#8c8580")
    .build()!);
  /** an ear held out to the side, pointing +z from its pivot */
  readonly earGeo = smoothGeo(new GeoBatch()
    .add(new THREE.IcosahedronGeometry(1, 1).scale(0.055, 0.025, 0.13).translate(0, 0, 0.085), "#ffffff")
    .build()!);
  /** world eye (the friendlier face): a soft dark eye facing +x, a warm iris and two catch-lights, one geometry */
  readonly eyeGeo = new GeoBatch()
    .add(new THREE.IcosahedronGeometry(1, 2).scale(0.62, 1.04, 1), "#2b1e19")
    .add(new THREE.IcosahedronGeometry(0.56, 1).scale(0.6, 1, 1).translate(0.22, -0.18, 0), "#6a4636")
    .add(new THREE.IcosahedronGeometry(0.4, 1).translate(0.42, 0.4, 0), "#ffffff")
    .add(new THREE.IcosahedronGeometry(0.16, 0).translate(0.5, -0.42, 0), "#ffffff")
    .build()!;
  /** portrait eye: the dark eye alone; the iris and catch-lights are a child that follows the look */
  readonly eyeWhiteGeo = new GeoBatch().add(new THREE.IcosahedronGeometry(1, 2).scale(0.62, 1.04, 1), "#2b1e19").build()!;
  readonly irisGeo = new GeoBatch()
    .add(new THREE.IcosahedronGeometry(0.56, 1).scale(0.5, 1, 1).translate(-0.02, -0.18, 0), "#6a4636")
    .add(new THREE.IcosahedronGeometry(0.4, 1).translate(0.14, 0.4, 0), "#ffffff")
    .add(new THREE.IcosahedronGeometry(0.16, 0).translate(0.2, -0.42, 0), "#ffffff")
    .build()!;

  constructor() {
    this.wool = [0.62, 0.8, 0.96].map(
      (roughness) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 }),
    );
  }

  woolFor(fineness: number): THREE.MeshStandardMaterial {
    const f = num(fineness, 26);
    return this.wool[f < 21 ? 0 : f < 28 ? 1 : 2]!;
  }

  dispose(): void {
    for (const m of this.wool) m.dispose();
    this.skin.dispose();
    this.part.dispose();
    this.eye.dispose();
    this.outlineSel.dispose();
    this.outlineHover.dispose();
    this.pick.dispose();
    this.pickGeo.dispose();
    this.legGeo.dispose();
    this.earGeo.dispose();
    this.eyeGeo.dispose();
    this.eyeWhiteGeo.dispose();
    this.irisGeo.dispose();
  }
}

// ---------------------------------------------------------------- rigs

export interface SheepRig {
  root: THREE.Group;
  bob: THREE.Group;
  body: THREE.Mesh;
  outline: THREE.Mesh;
  headPivot: THREE.Group;
  pick: THREE.Mesh;
  markerAnchor: THREE.Group;
}

/** World rig: merged body + head; legs, ears and eyes are drawn by the flock's instanced parts. */
export function buildRig(geos: SheepGeos, w: WorldSheep, mats: SheepMaterials, shadows: boolean): SheepRig {
  const d = geos.dims;
  const root = new THREE.Group();
  root.scale.setScalar(d.rootScale);
  const bob = new THREE.Group();
  root.add(bob);
  const body = new THREE.Mesh(geos.body, mats.woolFor(w.fineness));
  body.position.y = d.bodyY;
  body.castShadow = shadows;
  bob.add(body);
  const outline = new THREE.Mesh(geos.body, mats.outlineSel);
  outline.scale.setScalar(1.09);
  outline.visible = false;
  body.add(outline);
  const headPivot = new THREE.Group();
  headPivot.position.set(d.neck[0], d.neck[1], d.neck[2]);
  const head = new THREE.Mesh(geos.head, mats.skin);
  head.castShadow = false; // tiny; saves one shadow draw call per sheep
  headPivot.add(head);
  bob.add(headPivot);
  const pick = new THREE.Mesh(mats.pickGeo, mats.pick);
  pick.scale.set(d.L * 2 + 0.9, d.bodyY + d.H + 0.9, d.W * 2 + 0.8);
  pick.position.set(0.1, (d.bodyY + d.H) / 2 + 0.1, 0);
  pick.userData.sheepId = w.id;
  root.add(pick);
  const markerAnchor = new THREE.Group();
  markerAnchor.position.y = d.top;
  root.add(markerAnchor);
  return { root, bob, body, outline, headPivot, pick, markerAnchor };
}

/** A standalone rig with real meshes for every part (portraits). */
export interface FullRig {
  rig: SheepRig;
  legs: THREE.Mesh[];
  ears: THREE.Mesh[];
  eyes: THREE.Mesh[];
  pupils: THREE.Mesh[];
  pose(p: SheepPose): void;
}

/** `faceMat` colours legs and ears; it should have `vertexColors: true` (the hooves are tinted by vertex colour). */
export function buildFullRig(geos: SheepGeos, w: WorldSheep, mats: SheepMaterials, faceMat: THREE.Material): FullRig {
  const rig = buildRig(geos, w, mats, false);
  rig.root.remove(rig.pick);
  rig.root.remove(rig.markerAnchor);
  const mk = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.matrixAutoUpdate = false;
    parent.add(mesh);
    return mesh;
  };
  const legs = [0, 1, 2, 3].map(() => mk(mats.legGeo, faceMat, rig.root));
  const ears = [0, 1].map(() => mk(mats.earGeo, faceMat, rig.headPivot));
  const eyes = [0, 1].map(() => mk(mats.eyeWhiteGeo, mats.eye, rig.headPivot));
  const pupils = eyes.map((e) => {
    const p = new THREE.Mesh(mats.irisGeo, mats.eye);
    e.add(p);
    return p;
  });
  return {
    rig, legs, ears, eyes, pupils,
    pose(p: SheepPose) {
      applyPose(rig, geos, p);
      for (let i = 0; i < 4; i++) { legMatrix(legs[i]!.matrix, geos, i, p); legs[i]!.matrixWorldNeedsUpdate = true; }
      for (let i = 0; i < 2; i++) {
        earMatrix(ears[i]!.matrix, geos, i, p); ears[i]!.matrixWorldNeedsUpdate = true;
        eyeMatrix(eyes[i]!.matrix, geos, i, p); eyes[i]!.matrixWorldNeedsUpdate = true;
        // pupil sits on the front of the eye, nudged by the look direction (eye space is unit sized)
        pupils[i]!.position.set(0.3, 0.02 + p.lookY * 0.16, (i === 0 ? 1 : -1) * p.lookX * 0.2);
        pupils[i]!.visible = p.blink < 0.6;
      }
    },
  };
}

/** Temporary matrix for callers. */
export const tmpMatrix = _m;
