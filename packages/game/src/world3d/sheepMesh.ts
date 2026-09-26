// Procedural low-poly sheep built from a WorldSheep phenotype.
// Two merged geometries per sheep (wool body + tail, head), vertex-coloured so
// materials are shared across the whole flock. Legs, ears and eyes are
// articulated parts: instanced flock-wide in the world (parts.ts), real
// meshes in portraits (buildFullRig). SheepPose drives both.
import * as THREE from "three";
import { GeoBatch, mat, type V3 } from "./builder.js";
import { hashString, mulberry32 } from "./rng.js";
import { WOOL_HEX } from "./palette.js";
import type { WorldSheep } from "./types.js";

export interface SheepDims {
  /** overall body scale from size */
  s: number;
  L: number;
  H: number;
  W: number;
  legLen: number;
  bodyY: number;
  /** neck pivot (body space) */
  neck: V3;
  /** head scale (chibi: big heads, bigger still on lambs) */
  hs: number;
  /** marker height in root space (before lamb scale) */
  top: number;
  /** root scale (lambs are 0.62) */
  rootScale: number;
}

/** Articulated parts drawn separately from the merged body/head (instanced in the world). */
export interface SheepParts {
  /** Hip pivots in root space (before rootScale): front-left, front-right, back-left, back-right. */
  hips: V3[];
  /** Leg thickness scale. */
  legR: number;
  /** Ear pivots in head space (after head scale): left (+z), right (-z). */
  ears: V3[];
  earScale: number;
  /** Eye centres in head space (after head scale). */
  eyes: V3[];
  eyeR: number;
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

export function sheepKey(w: WorldSheep): string {
  return [
    w.id, w.colour, w.pattern, w.horns, w.sex, w.adult ? 1 : 0,
    Math.round(num(w.size, 60)), Math.round(num(w.fleeceWeight, 4) * 4), Math.round(num(w.crimp, 5) * 2),
  ].join("|");
}

export function sheepDims(w: WorldSheep): SheepDims {
  const s = clamp(0.75 + (num(w.size, 60) - 40) * 0.0105, 0.62, 1.25);
  const p = clamp(0.88 + num(w.fleeceWeight, 4) * 0.045, 0.9, 1.2);
  // round, cloud-like body: nearly as tall and wide as it is long
  const L = 0.7 * s * p;
  const H = 0.6 * s * p;
  const W = 0.6 * s * p;
  // short stubby legs
  const legLen = 0.25 * s;
  const bodyY = legLen + H * 0.74;
  const hs = w.adult ? 1.68 : 2.1;
  const neck: V3 = [L * 0.92, bodyY + H * 0.52, 0];
  return {
    s, L, H, W, legLen, bodyY, neck, hs,
    top: Math.max(bodyY + H + 0.5, neck[1] + 0.34 * hs + 0.28),
    rootScale: WORLD_SCALE * (w.adult ? 1 : 0.62),
  };
}

export function faceHex(w: WorldSheep): string {
  return w.colour === "black" ? "#2e2628" : "#47393a";
}

const HORN = "#e3cb98";
const CHEEK = "#f3a2a6";
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
/** Golden-angle points on a sphere: an even spread for the wool puffs. */
function fib(i: number, n: number): [number, number, number] {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * 2.399963229728653;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

export function buildSheepGeos(w: WorldSheep): SheepGeos {
  const d = sheepDims(w);
  const rng = mulberry32(hashString(w.id) ^ 0x5eed);
  const wool = WOOL_HEX[w.colour] ?? WOOL_HEX.white;
  const face = faceHex(w);
  const spotHex = w.colour === "white" ? "#6b5646" : "#f6f1e6";

  // ---- body: a cloud of overlapping wool puffs around a soft core.
  // crimp → curliness (more, smaller, lumpier puffs); fleece weight → puffiness (bigger puffs, set in dims).
  const crimp = clamp(num(w.crimp, 5), 1, 10);
  const curl = (crimp - 2) / 6; // 0 smooth … 1 very curly
  const fleece = clamp((num(w.fleeceWeight, 4) - 2) / 4, 0, 1);
  const spots: THREE.Vector3[] = [];
  if (w.pattern === "spotted") {
    const k = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < k; i++) spots.push(new THREE.Vector3(rng() * 2 - 1, rng() * 1.1 - 0.1, rng() * 2 - 1).normalize());
  }
  const bb = new GeoBatch(0.025, rng);
  bb.ico(wool, 1, 1, [0, -0.02 * d.H, 0], [d.L * 0.84, d.H * 0.8, d.W * 0.84]);
  const total = Math.round(15 + curl * 8);
  const pr = (0.36 - curl * 0.07 + fleece * 0.04) * (d.L + d.H + d.W) / 3 / 0.62;
  for (let i = 0; i < total; i++) {
    const [x, y, z] = fib(i, total);
    if (y < -0.42) continue; // the belly stays smooth
    const jig = 0.1 + curl * 0.12;
    _dir.set(x + (rng() - 0.5) * jig, y + (rng() - 0.5) * jig, z + (rng() - 0.5) * jig).normalize();
    let spotted = false;
    for (const sp of spots) if (_dir.dot(sp) > 0.8) { spotted = true; break; }
    _c.set(spotted ? spotHex : wool);
    const shade = (0.97 + rng() * 0.04) * (_dir.y < -0.15 ? 0.92 : 1);
    _c.multiplyScalar(shade);
    const r = pr * (0.9 + rng() * 0.2) * (1 - Math.max(0, -_dir.y) * 0.25);
    bb.ico(_c.getHex(), r, 1, [_dir.x * d.L * 0.74, _dir.y * d.H * 0.7 + 0.02, _dir.z * d.W * 0.74],
      [1, 0.9 + rng() * 0.15, 1], [rng() * 3, rng() * 3, rng() * 3]);
  }
  // tiny tail: two puffs
  bb.ico(wool, 0.13 * d.s, 1, [-d.L * 1.02, d.H * 0.32, 0]);
  bb.ico(wool, 0.08 * d.s, 1, [-d.L * 1.12, d.H * 0.22, 0]);
  const body = bb.build()!;

  // ---- head (local frame: pivot at neck, sheep faces +x). Ears and eyes are separate parts.
  const hb = new GeoBatch(0.035, rng);
  const muzzle = _c.set(face).lerp(new THREE.Color("#c9a898"), w.colour === "black" ? 0.2 : 0.3).getHex();
  hb.ico(face, 0.25, 1, [0.17, -0.02, 0], [1.0, 0.94, 0.94]);
  // soft round muzzle, a little lighter, with a button nose
  hb.ico(muzzle, 0.13, 1, [0.36, -0.1, 0], [0.9, 0.74, 1.12]);
  hb.ico("#1d1515", 0.017, 0, [0.475, -0.075, 0.042]);
  hb.ico("#1d1515", 0.017, 0, [0.475, -0.075, -0.042]);
  // rosy cheeks
  for (const side of [1, -1]) hb.ico(CHEEK, 0.05, 1, [0.325, -0.085, side * 0.172], [0.95, 0.7, 0.32], [0, side * 0.5, 0]);
  // wool bonnet round the back of the head and a tuft on top
  hb.ico(wool, 0.2, 1, [0.03, 0.06, 0], [1.0, 1.0, 1.2]);
  hb.ico(wool, 0.105, 1, [0.17, 0.2, 0]);
  hb.ico(wool, 0.085, 1, [0.08, 0.215, 0.08]);
  hb.ico(wool, 0.085, 1, [0.08, 0.215, -0.08]);
  hb.ico(wool, 0.07, 1, [0.24, 0.16, 0.05]);
  hb.ico(wool, 0.065, 1, [0.25, 0.165, -0.055]);
  if (w.horns === "horned") {
    // little round curls; rams' are bigger
    const ram = w.sex === "ram" && w.adult;
    const R = ram ? 0.14 : 0.085;
    const turn = ram ? Math.PI * 1.75 : Math.PI * 1.25;
    const r0 = ram ? 0.062 : 0.042;
    const r1 = ram ? 0.03 : 0.022;
    const segs = ram ? 12 : 8;
    for (const side of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const a = Math.PI / 2 + t * turn;
        const r = R * (1 - 0.3 * t);
        pts.push(new THREE.Vector3(0.06 + r * Math.cos(a), 0.16 - R + r * Math.sin(a), side * (0.23 + (ram ? 0.1 : 0.05) * t)));
      }
      for (let i = 0; i < segs; i++) {
        const a = pts[i]!, b = pts[i + 1]!;
        const dir = new THREE.Vector3().subVectors(b, a);
        const len = dir.length();
        dir.normalize();
        const t0 = i / segs, t1 = (i + 1) / segs;
        const cg = new THREE.CylinderGeometry(r0 + (r1 - r0) * t1, r0 + (r1 - r0) * t0, len * 1.25, 7);
        const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
        const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
        hb.add(cg, HORN, m);
      }
      hb.ico(HORN, r1 * 1.05, 0, [pts[segs]!.x, pts[segs]!.y, pts[segs]!.z]);
    }
  }
  const head = hb.build()!;
  const hs = d.hs;
  head.scale(hs, hs, hs);

  const lh = d.legLen + d.H * 0.3;
  const parts: SheepParts = {
    hips: [[0.45 * d.L, lh, 0.42 * d.W], [0.45 * d.L, lh, -0.42 * d.W], [-0.45 * d.L, lh, 0.42 * d.W], [-0.45 * d.L, lh, -0.42 * d.W]],
    legR: d.s * (w.adult ? 1 : 1.2),
    ears: [[0.07 * hs, 0.08 * hs, 0.19 * hs], [0.07 * hs, 0.08 * hs, -0.19 * hs]],
    earScale: hs * (w.adult ? 1 : 1.1),
    eyes: [[0.335 * hs, 0.035 * hs, 0.128 * hs], [0.335 * hs, 0.035 * hs, -0.128 * hs]],
    eyeR: 0.062 * hs * (w.adult ? 1 : 1.08),
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

/** Floppy ears hang a little lower than they used to. */
export const EAR_REST = 0.85;

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
  const r = 0.085 * geos.parts.legR;
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

/** Eyes look forward and a little outward, so a three-quarter view sees one big eye. */
const EYE_YAW = 0.42;
const _yAxis = new THREE.Vector3(0, 1, 0);
/** Eye matrix in head-pivot space (blink squashes it flat). */
export function eyeMatrix(out: THREE.Matrix4, geos: SheepGeos, i: number, pose: SheepPose): THREE.Matrix4 {
  const p = geos.parts.eyes[i]!;
  const r = geos.parts.eyeR;
  _q.setFromAxisAngle(_yAxis, i === 0 ? -EYE_YAW : EYE_YAW);
  return out.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(r * 0.8, r * Math.max(0.12, 1 - pose.blink), r));
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
  readonly skin = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  /** instanced parts take their colour from instanceColor */
  readonly part = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true, vertexColors: true });
  /** eyes: vertex-coloured (white, dark iris, highlight dot) */
  readonly eye = new THREE.MeshBasicMaterial({ vertexColors: true });
  readonly outlineSel = new THREE.MeshBasicMaterial({ color: "#ffd257", side: THREE.BackSide });
  readonly outlineHover = new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.BackSide, transparent: true, opacity: 0.85 });
  readonly pick = new THREE.MeshBasicMaterial({ visible: false });
  readonly pickGeo = new THREE.BoxGeometry(1, 1, 1);
  /** unit stubby leg with a little hoof: radius 1 at the hip, hangs from y=0 to y=-1 (vertex colour tints the hoof) */
  readonly legGeo = new GeoBatch()
    .add(new THREE.CylinderGeometry(1, 0.92, 0.8, 7).translate(0, -0.4, 0), "#ffffff")
    .add(new THREE.CylinderGeometry(1.0, 1.08, 0.2, 7).translate(0, -0.9, 0), "#d8b6a0")
    .build()!;
  /** soft floppy ear pointing +z from its pivot */
  readonly earGeo = new GeoBatch()
    .add(new THREE.IcosahedronGeometry(1, 1).scale(0.075, 0.026, 0.12).translate(0, 0, 0.1), "#ffffff")
    .build()!;
  /** world eye: white, a big dark iris looking forward (+x) and a highlight dot, one geometry */
  readonly eyeGeo = new GeoBatch()
    .add(new THREE.IcosahedronGeometry(1, 1), "#fbf7ef")
    .add(new THREE.IcosahedronGeometry(0.86, 1).translate(0.3, 0.02, 0), "#1d1516")
    .add(new THREE.IcosahedronGeometry(0.27, 1).translate(1.0, 0.4, 0.28), "#ffffff")
    .add(new THREE.IcosahedronGeometry(0.1, 0).translate(1.1, -0.2, -0.12), "#ffffff")
    .build()!;
  /** portrait eye: the white alone, the iris is a child that follows the look */
  readonly eyeWhiteGeo = new GeoBatch().add(new THREE.IcosahedronGeometry(1, 1), "#fbf7ef").build()!;
  readonly irisGeo = new GeoBatch()
    .add(new THREE.IcosahedronGeometry(0.86, 1), "#1d1516")
    .add(new THREE.IcosahedronGeometry(0.27, 1).translate(0.7, 0.38, 0.28), "#ffffff")
    .add(new THREE.IcosahedronGeometry(0.1, 0).translate(0.8, -0.22, -0.12), "#ffffff")
    .build()!;

  constructor() {
    this.wool = [0.42, 0.68, 0.95].map(
      (roughness) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness, metalness: 0 }),
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
        pupils[i]!.position.set(0.3, 0.02 + p.lookY * 0.16, (i === 0 ? 0.03 : -0.03) - p.lookX * 0.2);
        pupils[i]!.visible = p.blink < 0.6;
      }
    },
  };
}

/** Temporary matrix for callers. */
export const tmpMatrix = _m;
