// Geometry batching: many small primitives with per-vertex colour merged into
// one BufferGeometry, so the whole diorama costs a handful of draw calls.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type V3 = readonly [number, number, number];

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function mat(pos: V3, rot: V3 = [0, 0, 0], scale: V3 | number = 1): THREE.Matrix4 {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _p.set(pos[0], pos[1], pos[2]);
  if (typeof scale === "number") _s.set(scale, scale, scale);
  else _s.set(scale[0], scale[1], scale[2]);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/** Strip to position (+colour), non-indexed, transformed. Disposes the input. */
function prep(geo: THREE.BufferGeometry, m: THREE.Matrix4 | null): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  for (const name of Object.keys(g.attributes)) {
    if (name !== "position" && name !== "color") g.deleteAttribute(name);
  }
  g.morphAttributes = {};
  g.clearGroups();
  if (m) g.applyMatrix4(m);
  return g;
}

export class GeoBatch {
  private parts: THREE.BufferGeometry[] = [];
  /** Optional per-face shade jitter (0 = none), gives a hand-made faceted look. */
  constructor(private jitter = 0, private rng: () => number = Math.random) {}

  get empty(): boolean {
    return this.parts.length === 0;
  }

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m: THREE.Matrix4 | null = null): this {
    const g = prep(geo, m);
    const n = g.attributes.position!.count;
    const col = new Float32Array(n * 3);
    _c.set(color);
    for (let f = 0; f < n; f += 3) {
      const k = this.jitter ? 1 - this.jitter + this.rng() * this.jitter * 2 : 1;
      for (let v = f; v < f + 3 && v < n; v++) {
        col[v * 3] = _c.r * k;
        col[v * 3 + 1] = _c.g * k;
        col[v * 3 + 2] = _c.b * k;
      }
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  /** Geometry that already carries a colour attribute. */
  addColored(geo: THREE.BufferGeometry, m: THREE.Matrix4 | null = null): this {
    this.parts.push(prep(geo, m));
    return this;
  }

  box(c: THREE.ColorRepresentation, size: V3, pos: V3, rot: V3 = [0, 0, 0]): this {
    return this.add(new THREE.BoxGeometry(size[0], size[1], size[2]), c, mat(pos, rot));
  }

  cyl(c: THREE.ColorRepresentation, rTop: number, rBot: number, h: number, seg: number, pos: V3, rot: V3 = [0, 0, 0]): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), c, mat(pos, rot));
  }

  ico(c: THREE.ColorRepresentation, r: number, detail: number, pos: V3, scale: V3 | number = 1, rot: V3 = [0, 0, 0]): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), c, mat(pos, rot, scale));
  }

  cone(c: THREE.ColorRepresentation, r: number, h: number, seg: number, pos: V3, rot: V3 = [0, 0, 0]): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), c, mat(pos, rot));
  }

  /** Gable prism: ridge along x, width w (x), depth d (z), height h, base at pos.y. */
  gable(c: THREE.ColorRepresentation, w: number, d: number, h: number, pos: V3, rotY = 0): this {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0);
    shape.lineTo(d / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    return this.add(g, c, mat(pos, [0, rotY, 0]));
  }

  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false) as THREE.BufferGeometry | null;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!merged) return null;
    merged.computeVertexNormals();
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}
