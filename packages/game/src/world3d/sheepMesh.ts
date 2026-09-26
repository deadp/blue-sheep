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
  /** marker height in root space (before lamb scale) */
  top: number;
  /** root scale (lambs are 0.6) */
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
  const L = 0.8 * s * p;
  const H = 0.58 * s * p;
  const W = 0.58 * s * p;
  const legLen = 0.34 * s;
  const bodyY = legLen + H * 0.72;
  return {
    s, L, H, W, legLen, bodyY,
    neck: [L * 0.8, bodyY + H * 0.42, 0],
    top: bodyY + H + 0.55,
    rootScale: WORLD_SCALE * (w.adult ? 1 : 0.6),
  };
}

export function faceHex(w: WorldSheep): string {
  return w.colour === "black" ? "#2a2224" : "#3a302e";
}

const HORN = "#dcc38e";
const _c = new THREE.Color();
const _spot = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

export function buildSheepGeos(w: WorldSheep): SheepGeos {
  const d = sheepDims(w);
  const rng = mulberry32(hashString(w.id) ^ 0x5eed);
  const wool = WOOL_HEX[w.colour] ?? WOOL_HEX.white;
  const face = faceHex(w);

  // ---- body: bumpy icosphere, crimp → frequency/amplitude, spots via face colour.
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const crimp = clamp(num(w.crimp, 5), 1, 10);
  const f = 2.4 + crimp * 0.85;
  const amp = 0.035 + crimp * 0.011;
  const ph = [rng() * 6.3, rng() * 6.3, rng() * 6.3, rng() * 6.3];
  const unit: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    unit.push(x, y, z);
    const n =
      Math.sin(x * f + ph[0]!) * Math.sin(y * f + ph[1]!) * Math.sin(z * f + ph[2]!) +
      0.45 * Math.sin((x + z) * f * 1.6 + ph[3]!);
    const r = 1 + amp * n;
    let yy = y * r;
    if (yy < -0.55) yy = -0.55 + (yy + 0.55) * 0.45; // flatter belly
    // slightly taller rump, narrower chest
    const taper = 1 - 0.08 * Math.max(0, x);
    pos.setXYZ(i, x * r * d.L, yy * d.H * (1 + 0.06 * Math.max(0, -x)), z * r * d.W * taper);
  }
  const spots: THREE.Vector3[] = [];
  if (w.pattern === "spotted") {
    const k = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < k; i++) {
      const v = new THREE.Vector3(rng() * 2 - 1, rng() * 1.2 - 0.2, rng() * 2 - 1).normalize();
      v.setLength(0.62 + rng() * 0.2); // encode radius as cos threshold via length
      spots.push(v);
    }
  }
  _c.set(wool);
  _spot.set(w.colour === "white" ? "#6b5646" : "#f6f1e6");
  const col = new Float32Array(pos.count * 3);
  const cen = new THREE.Vector3();
  for (let v = 0; v < pos.count; v += 3) {
    cen.set(unit[v * 3]! + unit[v * 3 + 3]! + unit[v * 3 + 6]!, unit[v * 3 + 1]! + unit[v * 3 + 4]! + unit[v * 3 + 7]!, unit[v * 3 + 2]! + unit[v * 3 + 5]! + unit[v * 3 + 8]!).normalize();
    let spotted = false;
    for (const sp of spots) {
      const cosT = sp.length(); // ~0.62..0.82 → blob radius
      if (cen.dot(sp) / cosT > cosT) { spotted = true; break; }
    }
    const base = spotted ? _spot : _c;
    let k = 0.93 + rng() * 0.1;
    if (cen.y < -0.35) k *= 0.86;
    for (let j = v; j < v + 3; j++) {
      col[j * 3] = base.r * k;
      col[j * 3 + 1] = base.g * k;
      col[j * 3 + 2] = base.b * k;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  // tail, merged into the wool so it breathes with the body
  const bb = new GeoBatch(0, rng);
  bb.addColored(g);
  bb.ico(wool, 0.16 * d.s, 0, [-d.L * 0.97, d.H * 0.25, 0], [1, 1.2, 1]);
  const body = bb.build()!;

  // ---- head (local frame: pivot at neck, sheep faces +x). Ears and eyes are separate parts.
  const hb = new GeoBatch(0.05, rng);
  hb.ico(face, 0.25, 1, [0.25, -0.08, 0], [1.3, 0.95, 0.82], [0, 0, -0.35]);
  hb.ico(wool, 0.2, 1, [0.1, 0.12, 0], [1.15, 0.85, 1.12]);
  // soft muzzle and nostrils
  hb.ico(w.colour === "black" ? "#3a3033" : "#4d403c", 0.1, 1, [0.52, -0.2, 0], [0.9, 0.75, 1.15]);
  hb.ico("#1e1716", 0.018, 0, [0.6, -0.17, 0.045]);
  hb.ico("#1e1716", 0.018, 0, [0.6, -0.17, -0.045]);
  if (w.horns === "horned") {
    const ram = w.sex === "ram" && w.adult;
    const R = ram ? 0.22 : 0.13;
    const turn = ram ? Math.PI * 1.6 : Math.PI * 0.9;
    const r0 = ram ? 0.088 : 0.052;
    const r1 = ram ? 0.03 : 0.02;
    const segs = ram ? 11 : 6;
    for (const side of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const a = Math.PI / 2 + t * turn;
        const r = R * (1 - 0.35 * t);
        pts.push(new THREE.Vector3(
          0.12 + r * Math.cos(a),
          0.2 - R + r * Math.sin(a),
          side * (0.19 + (ram ? 0.2 : 0.09) * t),
        ));
      }
      for (let i = 0; i < segs; i++) {
        const a = pts[i]!, b = pts[i + 1]!;
        const dir = new THREE.Vector3().subVectors(b, a);
        const len = dir.length();
        dir.normalize();
        const t0 = i / segs, t1 = (i + 1) / segs;
        const cg = new THREE.CylinderGeometry(r0 + (r1 - r0) * t1, r0 + (r1 - r0) * t0, len * 1.12, 6);
        const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
        const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
        hb.add(cg, HORN, m);
      }
    }
  }
  const head = hb.build()!;
  const hs = w.adult ? 1.2 : 1.45;
  head.scale(hs, hs, hs);

  const lh = d.legLen + d.H * 0.4;
  const parts: SheepParts = {
    hips: [[0.52 * d.L, lh, 0.42 * d.W], [0.52 * d.L, lh, -0.42 * d.W], [-0.5 * d.L, lh, 0.42 * d.W], [-0.5 * d.L, lh, -0.42 * d.W]],
    legR: d.s,
    ears: [[0.1 * hs, 0.05 * hs, 0.15 * hs], [0.1 * hs, 0.05 * hs, -0.15 * hs]],
    earScale: hs * (w.adult ? 1 : 1.15),
    eyes: [[0.33 * hs, 0.0 * hs, 0.135 * hs], [0.33 * hs, 0.0 * hs, -0.135 * hs]],
    eyeR: 0.045 * hs * (w.adult ? 1 : 1.12),
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

export const EAR_REST = 0.55;

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
  const r = 0.075 * geos.parts.legR;
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

/** Eye matrix in head-pivot space (blink squashes it flat). */
export function eyeMatrix(out: THREE.Matrix4, geos: SheepGeos, i: number, pose: SheepPose): THREE.Matrix4 {
  const p = geos.parts.eyes[i]!;
  const r = geos.parts.eyeR;
  _q.identity();
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
  readonly part = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });
  readonly eyeWhite = new THREE.MeshBasicMaterial({ color: "#f7f2e8" });
  readonly pupil = new THREE.MeshBasicMaterial({ color: "#1b1413" });
  readonly outlineSel = new THREE.MeshBasicMaterial({ color: "#ffd257", side: THREE.BackSide });
  readonly outlineHover = new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.BackSide, transparent: true, opacity: 0.85 });
  readonly pick = new THREE.MeshBasicMaterial({ visible: false });
  readonly pickGeo = new THREE.BoxGeometry(1, 1, 1);
  /** unit leg: radius 1 at the hip, hangs from y=0 to y=-1 */
  readonly legGeo = new THREE.CylinderGeometry(1, 0.78, 1, 6).translate(0, -0.5, 0);
  /** leaf-shaped ear pointing +z from its pivot */
  readonly earGeo = new THREE.IcosahedronGeometry(1, 0).scale(0.06, 0.022, 0.13).translate(0, 0, 0.11);
  readonly eyeGeo = new THREE.IcosahedronGeometry(1, 1);

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
    this.eyeWhite.dispose();
    this.pupil.dispose();
    this.outlineSel.dispose();
    this.outlineHover.dispose();
    this.pick.dispose();
    this.pickGeo.dispose();
    this.legGeo.dispose();
    this.earGeo.dispose();
    this.eyeGeo.dispose();
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
  const eyes = [0, 1].map(() => mk(mats.eyeGeo, mats.eyeWhite, rig.headPivot));
  const pupils = eyes.map((e) => {
    const p = new THREE.Mesh(mats.eyeGeo, mats.pupil);
    p.scale.setScalar(0.62);
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
        pupils[i]!.position.set(0.5, 0.12 + p.lookY * 0.3, (i === 0 ? 0.08 : -0.08) - p.lookX * 0.35);
        pupils[i]!.visible = p.blink < 0.6;
      }
    },
  };
}

/** Temporary matrix for callers. */
export const tmpMatrix = _m;
