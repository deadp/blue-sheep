// Procedural low-poly sheep built from a WorldSheep phenotype.
// Three geometries per sheep (wool body, head, legs), all vertex-coloured so
// materials are shared across the whole flock.
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

export interface SheepGeos {
  key: string;
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  legs: THREE.BufferGeometry;
  dims: SheepDims;
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
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const body = g;

  // ---- head (local frame: pivot at neck, sheep faces +x)
  const hb = new GeoBatch(0.05, rng);
  hb.ico(face, 0.25, 1, [0.25, -0.08, 0], [1.3, 0.95, 0.82], [0, 0, -0.35]);
  hb.ico(wool, 0.2, 1, [0.1, 0.12, 0], [1.15, 0.85, 1.12]);
  hb.box(face, [0.1, 0.045, 0.24], [0.08, 0.04, 0.22], [0.5, 0, 0]);
  hb.box(face, [0.1, 0.045, 0.24], [0.08, 0.04, -0.22], [-0.5, 0, 0]);
  hb.ico("#f4efe6", 0.035, 0, [0.33, 0.02, 0.14]);
  hb.ico("#f4efe6", 0.035, 0, [0.33, 0.02, -0.14]);
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

  // ---- legs + tail
  const lb = new GeoBatch(0.04, rng);
  const lh = d.legLen + d.H * 0.4;
  for (const [sx, sz] of [[0.52, 0.42], [0.52, -0.42], [-0.5, 0.42], [-0.5, -0.42]] as const) {
    lb.cyl(face, 0.075 * d.s, 0.055 * d.s, lh, 6, [sx * d.L, lh / 2, sz * d.W]);
  }
  lb.ico(wool, 0.16 * d.s, 0, [-d.L * 0.97, d.bodyY + d.H * 0.25, 0], [1, 1.2, 1]);
  const legs = lb.build()!;

  return { key: sheepKey(w), body, head, legs, dims: d };
}

export function disposeGeos(g: SheepGeos): void {
  g.body.dispose();
  g.head.dispose();
  g.legs.dispose();
}

/** Shared flock materials. Wool sheen is bucketed by fineness so materials stay shared. */
export class SheepMaterials {
  readonly wool: THREE.MeshStandardMaterial[];
  readonly skin = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  readonly outlineSel = new THREE.MeshBasicMaterial({ color: "#ffd257", side: THREE.BackSide });
  readonly outlineHover = new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.BackSide, transparent: true, opacity: 0.85 });
  readonly pick = new THREE.MeshBasicMaterial({ visible: false });
  readonly pickGeo = new THREE.BoxGeometry(1, 1, 1);

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
    this.outlineSel.dispose();
    this.outlineHover.dispose();
    this.pick.dispose();
    this.pickGeo.dispose();
  }
}

export interface SheepRig {
  root: THREE.Group;
  bob: THREE.Group;
  body: THREE.Mesh;
  outline: THREE.Mesh;
  headPivot: THREE.Group;
  legs: THREE.Mesh;
  pick: THREE.Mesh;
  markerAnchor: THREE.Group;
}

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
  const legs = new THREE.Mesh(geos.legs, mats.skin);
  legs.castShadow = shadows;
  root.add(legs);
  const pick = new THREE.Mesh(mats.pickGeo, mats.pick);
  pick.scale.set(d.L * 2 + 0.9, d.bodyY + d.H + 0.9, d.W * 2 + 0.8);
  pick.position.set(0.1, (d.bodyY + d.H) / 2 + 0.1, 0);
  pick.userData.sheepId = w.id;
  root.add(pick);
  const markerAnchor = new THREE.Group();
  markerAnchor.position.y = d.top;
  root.add(markerAnchor);
  return { root, bob, body, outline, headPivot, legs, pick, markerAnchor };
}
