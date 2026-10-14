// Fleece rendering experiments (debug URL param `?fleece=a|b|c|d`; default "0" is the current lock-bubble fleece in sheepMesh.ts).
//  a  felted shell: one continuous mesh, a lumpy quilted surface (soft lumps with shaded creases), breeds and rare wools shaped in the field
//  b  staple locks: fewer, bigger tapered staples with crimp waves, shingled down the body over a dense under-coat, tips sun-bleached
//  c  needle felt: a near-smooth plush shell with a velvet sheen and a fine fibre texture in the shader (a felted toy)
//  d  bump-mapped wool: a gently lumpy shell whose curls are drawn by the shader (cellular bumps lit per pixel), so the
//     silhouette stays soft while the surface reads as dense curly fleece
// Geometry is deterministic per sheep (the caller's seeded rng). Cosmetic only; nothing here touches game rules.
import * as THREE from "three";
import { GeoBatch, type V3 } from "./builder.js";
import type { Rng } from "./rng.js";

export type FleeceStyle = "0" | "a" | "b" | "c" | "d";
const STYLES: readonly FleeceStyle[] = ["0", "a", "b", "c", "d"];
function fromUrl(): FleeceStyle {
  try {
    const v = new URLSearchParams((globalThis as { location?: { search?: string } }).location?.search ?? "").get("fleece");
    return v && (STYLES as readonly string[]).includes(v) ? (v as FleeceStyle) : "0";
  } catch {
    return "0";
  }
}
let STYLE: FleeceStyle = fromUrl();
export const fleeceStyle = (): FleeceStyle => STYLE;
/** For scripts (triangle counts): pick a style without a URL. Rigs already built keep their fleece. */
export function setFleeceStyle(s: FleeceStyle): void { STYLE = s; }

/** The breed look numbers the fleece reads (a subset of sheepMesh's BreedLook). */
export interface FleeceLook { locks: number; lockR: number; stretch: number; tail: number; wrinkle: number; hang: number; hairy: number; under: number }

export interface FleeceCtx {
  rng: Rng;
  L: number; H: number; W: number;
  /** body unit (L / 0.62) */
  u: number;
  wool: THREE.Color; under: THREE.Color; tip: THREE.Color; spotHex: string;
  /** spotted pattern test on a direction from the body centre */
  isSpot: (x: number, y: number, z: number) => boolean;
  look: FleeceLook;
  /** 0..1 from crimp */
  curl: number;
  /** the current style's lock radius and lock count (detail-scaled) */
  lockR: number; locks: number;
  lite: boolean;
  steel: boolean; cloud: boolean; glow: boolean; paua: boolean; poh: boolean; swept: boolean;
  /** pōhutukawa: 0 winter .. 1 high summer */
  bloom: number;
  pauaStreak: (x: number, y: number, z: number) => THREE.Color;
}

export interface FleeceOut {
  /** unsmoothed, unshaded body geometry (position, color, and aWool for the shader styles) */
  body: THREE.BufferGeometry;
  glow?: { a: THREE.BufferGeometry; b: THREE.BufferGeometry } | undefined;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const _up = new THREE.Vector3(0, 1, 0);
const _z = new THREE.Vector3(0, 0, 1);
const DOWN = new THREE.Vector3(0, -1, 0);
const WIND = new THREE.Vector3(-1, -0.22, 0).normalize();
const qm = (p: THREE.Vector3, q: THREE.Quaternion, s: V3 | number = 1) =>
  new THREE.Matrix4().compose(p, q, typeof s === "number" ? new THREE.Vector3(s, s, s) : new THREE.Vector3(s[0], s[1], s[2]));
function fib(i: number, n: number): [number, number, number] {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * 2.399963229728653;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

// ------------------------------------------------------------------ shared rare-wool pieces

/** A round spring: 2.2 turns of constant radius 1 rising 1.5 along +z (one steel ringlet, scaled per coil). */
class SpringCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private turns = 2.2, private rise = 1.5) { super(); }
  override getPoint(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    const a = t * Math.PI * 2 * this.turns;
    const r = 1 - 0.25 * t;
    return out.set(Math.cos(a) * r, Math.sin(a) * r, t * this.rise);
  }
}
export function springGeo(lite: boolean): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new SpringCurve(), lite ? 10 : 14, 0.3, lite ? 4 : 5, false);
}

/** A pāua chip: a small flat lens of nacre lying flush on the fleece (not a bead standing off it). */
export function pauaChip(bb: GeoBatch, p: THREE.Vector3, n: THREE.Vector3, size: number, col: THREE.ColorRepresentation, rng: Rng): void {
  const q = new THREE.Quaternion().setFromUnitVectors(_up, n).multiply(new THREE.Quaternion().setFromAxisAngle(_up, rng() * 6.28));
  bb.add(new THREE.IcosahedronGeometry(1, 0), col, qm(p, q, [size * 1.5, size * 0.18, size * 0.8]));
}
export const PAUA_NACRE = ["#9ef0dc", "#b9a6ff", "#8fdcff", "#c8ffb0"];
/** Glow-worm by day: a cave-water teal-green, paler on the back. */
export const GLOW_DAY = new THREE.Color("#8fd8c6");
export const GLOW_BELLY = new THREE.Color("#4f9fb0");

type Surf = (x: number, y: number, z: number) => { p: THREE.Vector3; n: THREE.Vector3 };

/** Rare-wool additions over any fleece surface, and the glow-worm night lights. */
function rareExtras(bb: GeoBatch, c: FleeceCtx, surf: Surf, opts: { springs: number; billows: boolean }): FleeceOut["glow"] {
  const { rng, L, H, W, lockR, u, lite } = c;
  if (c.steel && opts.springs > 0) {
    const spring = springGeo(lite);
    const n = opts.springs;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = fib(i, n);
      if (y < -0.6) continue;
      const s = surf(x, y, z);
      const ax = s.n.clone().add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.5)).add(DOWN.clone().multiplyScalar(0.25)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(_z, ax).multiply(new THREE.Quaternion().setFromAxisAngle(_z, rng() * 6.28));
      const r = lockR * (0.7 + rng() * 0.25);
      const col = new THREE.Color(rng() < 0.3 ? "#a8b3c2" : "#6a7480").multiplyScalar((0.85 + rng() * 0.3) * (0.8 + 0.3 * smooth((y + 0.7) / 1.5)));
      bb.add(spring.clone(), col, qm(s.p.clone().addScaledVector(s.n, -r * 0.5), q, [r, r, r * 1.1]));
    }
    spring.dispose();
  }
  if (c.cloud) {
    if (opts.billows) {
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        bb.ico(new THREE.Color("#ffffff").multiplyScalar(0.97 + rng() * 0.04).getHex(), lockR * (1.15 + rng() * 0.35), 1,
          [L * (-0.55 + t * 1.0 + (rng() - 0.5) * 0.15), H * (0.92 + rng() * 0.12), (rng() - 0.5) * W * 0.8], [1.2, 0.9, 1.1], [rng() * 3, rng() * 3, rng() * 3]);
      }
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng() * 0.5, side = Math.sin(a) > 0 ? 1 : -1;
      bb.ico(new THREE.Color("#dbe6f8").lerp(new THREE.Color("#a9bbd8"), rng() * 0.6).getHex(), lockR * 0.7, 1,
        [Math.cos(a) * L * 0.9 - (rng() * 0.2) * L, -H * (0.55 + rng() * 0.2), side * W * (0.5 + rng() * 0.4)], [1.7, 0.45, 1], [0, rng() * 0.6 - 0.3, rng() * 0.4 - 0.2]);
    }
  }
  if (c.swept) {
    // streamers whipping off the rump and the back of the neck: tapered, lying back on the wind
    for (let i = 0; i < 9; i++) {
      const t = i / 8, side = (i % 2 ? 1 : -1) * (0.15 + rng() * 0.5);
      const len = (0.28 - t * 0.08) * u * (0.8 + rng() * 0.4);
      const p = new THREE.Vector3(-L * (0.95 + t * 0.3) - len * 0.4, H * (0.35 - t * 0.2 + (rng() - 0.5) * 0.35), side * W);
      const dir = WIND.clone().add(new THREE.Vector3(0, (rng() - 0.5) * 0.3, side * 0.3)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
      bb.add(new THREE.ConeGeometry(lockR * 0.45, len, 5, 1), new THREE.Color(c.wool).lerp(new THREE.Color("#ffffff"), 0.35).getHex(), qm(p, q, [1, 1, 0.45]));
    }
  }
  if (c.glow) {
    for (let i = 0; i < 22; i++) {
      const [x, y, z] = fib(i * 3 + 1, 70);
      if (y < -0.5) continue;
      const s = surf(x, y, z);
      bb.add(new THREE.OctahedronGeometry(lockR * (0.13 + rng() * 0.08), 0), i % 3 ? "#2fb59c" : "#eafff8", qm(s.p.clone().addScaledVector(s.n, lockR * 0.05), new THREE.Quaternion(), 1));
    }
  }
  if (c.paua) {
    for (let i = 0; i < 16; i++) {
      const [x, y, z] = fib(i * 4 + 1, 64);
      if (y < -0.35) continue;
      const s = surf(x, y, z);
      pauaChip(bb, s.p.clone().addScaledVector(s.n, -lockR * 0.02), s.n, lockR * (0.22 + rng() * 0.12), PAUA_NACRE[i % PAUA_NACRE.length]!, rng);
    }
  }
  if (c.poh) {
    const bloom = c.bloom;
    const tufts = Math.round((lite ? 0.7 : 1) * (4 + 20 * bloom));
    const len0 = (0.1 + 0.1 * bloom) * u;
    for (let i = 0; i < tufts; i++) {
      const [x, y, z] = fib(i * 2 + 1, tufts * 2 + 2);
      if (y < -0.35) continue;
      const s = surf(x, y, z), nv = s.n, base = s.p.clone().addScaledVector(nv, -lockR * 0.2);
      const blossom = bloom > 0.3;
      const arms = lite ? 3 : 4;
      for (let k = 0; k < arms; k++) {
        const a = (k / arms) * Math.PI * 2 + rng(), spread = 0.55 + rng() * 0.25;
        const side = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).cross(nv).normalize();
        const dirV = nv.clone().multiplyScalar(Math.cos(spread)).addScaledVector(side, Math.sin(spread)).normalize();
        const len = len0 * (0.8 + rng() * 0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(_up, dirV);
        bb.add(new THREE.ConeGeometry(len * 0.1, len, 3, 1, true), new THREE.Color(blossom ? "#d4163c" : "#7a1f2c").multiplyScalar(0.85 + rng() * 0.35).getHex(), qm(base.clone().addScaledVector(dirV, len * 0.5), q));
        if (blossom) bb.add(new THREE.OctahedronGeometry(len * 0.11, 0), "#ffd36a", qm(base.clone().addScaledVector(dirV, len), new THREE.Quaternion()));
      }
    }
  }
  if (!c.glow) return undefined;
  const ga = new GeoBatch(0, rng), gb = new GeoBatch(0, rng);
  const dot = (b: GeoBatch, p: THREE.Vector3, r: number) => b.add(new THREE.OctahedronGeometry(r, 0), "#ffffff", qm(p, new THREE.Quaternion()));
  const cnt = lite ? 56 : 104;
  for (let i = 0; i < cnt; i++) {
    const [x, y, z] = fib(i, cnt);
    if (y < -0.55) continue;
    const s = surf(x, y, z);
    dot(i % 2 ? ga : gb, s.p.clone().addScaledVector(s.n, lockR * 0.12), lockR * (0.2 + rng() * 0.12));
  }
  for (let t = 0; t < 4; t++) {
    const bx = L * (-0.5 + t * 0.34), bz = (t % 2 ? 1 : -1) * W * (0.45 + rng() * 0.25), by = -H * 0.88;
    for (let k = 0; k < 4; k++) dot(k % 2 ? ga : gb, new THREE.Vector3(bx, by - k * lockR * 1.3, bz), lockR * (0.24 - k * 0.02));
  }
  return { a: ga.build()!, b: gb.build()! };
}

/** Drysdale guard hair: spiky cones standing out of the fleece, and a mane along the neck. */
function hairyExtras(bb: GeoBatch, c: FleeceCtx, surf: Surf, k0: number): void {
  const { rng, L, H, wool, u, look } = c;
  const k = Math.round(k0 * look.hairy);
  for (let i = 0; i < k; i++) {
    const [x, y, z] = fib(i * 3 + 1, k * 3);
    if (y < -0.45) continue;
    const s = surf(x, y, z);
    const dir = s.n.clone().add(new THREE.Vector3(0, 0.25, 0)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
    const len = (0.13 + rng() * 0.1) * u;
    bb.add(new THREE.ConeGeometry(0.03 * u, len, 4), new THREE.Color(wool).multiplyScalar(0.8 + rng() * 0.35), qm(s.p.clone().addScaledVector(dir, len * 0.3), q));
  }
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    bb.ico(new THREE.Color(wool).multiplyScalar(0.85 + rng() * 0.2).getHex(), 0.07 * u, 0, [L * (0.35 + t * 0.7), H * (1.0 + t * 0.12), 0], [0.9, 1.9, 0.9], [0, 0, 0.5 - t * 0.9]);
  }
}

// ------------------------------------------------------------------ the shell (styles a, c, d)

/** cheap seeded 3D value noise, -1..1 */
function makeNoise(seed: number): (x: number, y: number, z: number) => number {
  const h = (i: number, j: number, k: number) => {
    let n = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 144269) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) & 0xffff) / 0x7fff - 1;
  };
  return (x, y, z) => {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
    const fx = smooth(x - i), fy = smooth(y - j), fz = smooth(z - k);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(
      l(l(h(i, j, k), h(i + 1, j, k), fx), l(h(i, j + 1, k), h(i + 1, j + 1, k), fx), fy),
      l(l(h(i, j, k + 1), h(i + 1, j, k + 1), fx), l(h(i, j + 1, k + 1), h(i + 1, j + 1, k + 1), fx), fy),
      fz,
    );
  };
}

interface Ell { c: V3; r: V3 }
function ellSdf(x: number, y: number, z: number, e: Ell): number {
  const qx = (x - e.c[0]) / e.r[0], qy = (y - e.c[1]) / e.r[1], qz = (z - e.c[2]) / e.r[2];
  const k0 = Math.hypot(qx, qy, qz), k1 = Math.hypot(qx / e.r[0], qy / e.r[1], qz / e.r[2]);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(e.r[0], e.r[1], e.r[2]);
}
function smin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

interface Bump { c: THREE.Vector3; r: number; a: number; axis: THREE.Vector3 | null; s: number; spike: boolean; tint: number; tip: boolean }

export interface ShellOpts {
  /** lump height and radius (in lockR) and how many lumps (× ctx.locks) */
  amp: number; rad: number; count: number;
  /** crease darkening 0..1 */
  crease: number;
  /** low-frequency wobble (in lockR) */
  wobble: number;
  /** sphere resolution (full detail) */
  seg: [number, number];
}

class Shell {
  readonly ells: Ell[] = [];
  readonly bumps: Bump[] = [];
  private k: number;
  private R0: number;
  private noise: (x: number, y: number, z: number) => number;
  constructor(private c: FleeceCtx, private o: ShellOpts) {
    const { L, H, W, u, look } = c;
    this.k = 0.07 * u;
    this.noise = makeNoise(Math.floor(c.rng() * 1e6));
    this.ells.push({ c: [0, 0, 0], r: [L, H, W] });
    this.ells.push({ c: [-L * 0.6, H * 0.1, 0], r: [0.3 * u, 0.3 * u * 1.02, 0.3 * u * 1.08] });
    this.ells.push({ c: [L * 0.68, H * 0.28, 0], r: [0.26 * u, 0.26 * u * 1.1, 0.26 * u * 0.95] });
    this.ells.push({ c: [L * 0.98, H * 0.72, 0], r: [0.2 * u * 1.15, 0.2 * u * 1.1, 0.2 * u * 0.82] });
    this.ells.push({ c: [-L * 1.04, H * 0.18, 0], r: [0.1 * u * look.tail * 0.9, 0.1 * u * look.tail * 1.3, 0.1 * u * look.tail * 0.9] });
    this.R0 = 1.25 * Math.max(L * 1.25, H, W) + 0.5 * u;
    this.makeBumps();
  }

  field(x: number, y: number, z: number): number {
    let d = ellSdf(x, y, z, this.ells[0]!);
    for (let i = 1; i < this.ells.length; i++) d = smin(d, ellSdf(x, y, z, this.ells[i]!), this.k);
    return d;
  }

  /** The base surface along a direction from the centre (outermost hit), and its normal. */
  base(dx: number, dy: number, dz: number): { p: THREE.Vector3; n: THREE.Vector3 } {
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    let t = this.R0;
    for (let i = 0; i < 80; i++) {
      const d = this.field(dx * t, dy * t, dz * t);
      if (d < 2e-4) break;
      t -= Math.max(d * 0.9, 1e-3);
      if (t <= 0) { t = 0; break; }
    }
    const p = new THREE.Vector3(dx * t, dy * t, dz * t);
    const e = 0.004 * this.c.u;
    const n = new THREE.Vector3(
      this.field(p.x + e, p.y, p.z) - this.field(p.x - e, p.y, p.z),
      this.field(p.x, p.y + e, p.z) - this.field(p.x, p.y - e, p.z),
      this.field(p.x, p.y, p.z + e) - this.field(p.x, p.y, p.z - e),
    ).normalize();
    return { p, n };
  }

  private makeBumps(): void {
    const { c, o } = this;
    const { look, rng, lockR, L, H, W } = c;
    const n = Math.max(8, Math.round(c.locks * o.count));
    for (let i = 0; i < n; i++) {
      let [x, y, z] = fib(i, n);
      x += (rng() - 0.5) * 0.12; y += (rng() - 0.5) * 0.12; z += (rng() - 0.5) * 0.12;
      const b = this.base(x * L, y * H, z * W);
      let axis: THREE.Vector3 | null = null, s = 1;
      if (c.swept) { axis = WIND.clone().addScaledVector(b.n, -WIND.dot(b.n)).normalize(); s = 3.2; }
      else if (look.hang > 0.05) { axis = DOWN.clone().addScaledVector(b.n, -DOWN.dot(b.n)).normalize(); s = 1 + 1.6 * look.hang * Math.min(1, Math.abs(b.n.z) * 1.4); }
      else if (look.stretch > 1.05) { axis = DOWN.clone().addScaledVector(b.n, -DOWN.dot(b.n)).normalize(); s = look.stretch; }
      this.bumps.push({
        c: b.p, r: lockR * o.rad * (0.8 + rng() * 0.4) * (c.cloud ? 1.25 : c.swept ? 0.6 : 1), a: lockR * o.amp * (0.7 + rng() * 0.6) * (look.hairy > 0.5 ? 1.25 : 1),
        axis, s, spike: look.hairy > 0.5, tint: 0.95 + rng() * 0.1, tip: false,
      });
    }
    if (c.cloud) {
      // big billows heaped on the back
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const b = this.base(-0.6 + t * 1.15 + (rng() - 0.5) * 0.15, 1, (rng() - 0.5) * 0.9);
        this.bumps.push({ c: b.p, r: lockR * o.rad * 2.2, a: lockR * o.amp * 2.1, axis: null, s: 1, spike: false, tint: 1.02, tip: false });
      }
    }
  }

  /** Lump height at a base-surface point; returns the height and the index of the tallest lump. */
  bump(p: THREE.Vector3): [number, number] {
    let sum = 0, best = -1, bestH = 0;
    for (let i = 0; i < this.bumps.length; i++) {
      const b = this.bumps[i]!;
      const qx = p.x - b.c.x, qy = p.y - b.c.y, qz = p.z - b.c.z;
      let d2 = qx * qx + qy * qy + qz * qz;
      if (d2 > b.r * b.r * b.s * b.s) continue;
      if (b.axis) {
        const al = qx * b.axis.x + qy * b.axis.y + qz * b.axis.z;
        d2 = d2 - al * al + (al * al) / (b.s * b.s);
      }
      d2 /= b.r * b.r;
      if (d2 >= 1) continue;
      const t = 1 - d2;
      const h = b.a * (b.spike ? t * t * t : t * t * (1.5 - 0.5 * t));
      sum += h * h * h * h;
      if (h > bestH) { bestH = h; best = i; }
    }
    let h = Math.pow(sum, 0.25);
    const { c } = this;
    // low-frequency wobble so the outline isn't a perfect barrel
    const f = 3.2 / c.u;
    h += this.o.wobble * c.lockR * this.noise(p.x * f, p.y * f, p.z * f);
    // southerly: long streaks combed along the wind
    if (c.swept) {
      const al = (p.x * WIND.x + p.y * WIND.y) / c.u;
      const r = this.noise(al * 1.3, p.y * 11 / c.u, p.z * 11 / c.u);
      h += c.lockR * 0.5 * Math.pow(1 - Math.abs(r), 2) * (this.o.amp / 0.6) * (this.o.rad / 1.6);
    }
    // Merino: soft folds ringing the neck just behind the head
    if (c.look.wrinkle > 0.05 && p.x > c.L * 0.72 && p.y > -c.H * 0.4) {
      const w = smooth((p.x - c.L * 0.72) / (c.L * 0.12)) * c.look.wrinkle;
      h += w * c.lockR * 0.45 * Math.max(0, Math.cos(((p.x - c.L * 0.8) / (c.L * 0.085)) * Math.PI * 2 + p.y * 3));
    }
    return [h, best];
  }

  /**
   * Where the base point ends up: lifted by the lumps along the normal, then long wool (Romney, Icelandic) hangs down off the
   * flanks in a scalloped hem of locks, and a southerly fleece is combed back toward the tail. Returns the drop (0..1) too.
   */
  place(p0: THREE.Vector3, n: THREE.Vector3, h: number): [THREE.Vector3, number] {
    const { c } = this;
    const p = p0.clone().addScaledVector(n, h + c.lockR * 0.25);
    const dx = p0.x / c.L, dy = p0.y / c.H, dz = p0.z / c.W;
    let drop = 0;
    if (c.look.hang > 0.05) {
      const a = Math.atan2(dz, dx * 1.3);
      const side = smooth(Math.abs(dz) / 0.55);
      const lock = Math.pow(0.5 + 0.5 * Math.cos(a * 9 + this.noise(dx * 2, 0.5, dz * 2) * 1.2), 1.4);
      drop = smooth((-dy - 0.1) / 0.75) * (0.25 + 0.75 * (0.5 * (1 - side) + side * (0.1 + 0.9 * lock)));
      p.y -= drop * 0.18 * c.u * c.look.hang;
      p.addScaledVector(n, drop * 0.02 * c.u);
    }
    if (c.swept) {
      const back = smooth((0.35 - dx) / 1.2) * (0.6 + 0.4 * smooth((dy + 0.6) / 1.4));
      p.x -= back * 0.2 * c.u;
      p.y -= back * 0.03 * c.u;
    }
    return [p, drop];
  }

  /** A point on the finished fleece surface (for rare pieces, hair and glow dots). */
  surf: Surf = (x, y, z) => {
    const b = this.base(x * this.c.L, y * this.c.H, z * this.c.W);
    const [h] = this.bump(b.p);
    return { p: this.place(b.p, b.n, h)[0], n: b.n };
  };

  /** Build the shell mesh: position, colour, and the shader's aWool (strength, cell scale, stretch). */
  geometry(colour: (p: THREE.Vector3, n: THREE.Vector3, h: number, bump: Bump | null, drop: number, out: THREE.Color) => void, wool: V3): THREE.BufferGeometry {
    const [sw, sh] = this.o.seg;
    const k = this.c.lite ? 0.62 : 1;
    const sph = new THREE.SphereGeometry(1, Math.round(sw * k), Math.round(sh * k));
    const pos = sph.getAttribute("position");
    const n = pos.count;
    const P = new Float32Array(n * 3), C = new Float32Array(n * 3), A = new Float32Array(n * 3);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const b = this.base(pos.getX(i) * this.c.L, pos.getY(i) * this.c.H, pos.getZ(i) * this.c.W);
      const [h, bi] = this.bump(b.p);
      const [p, drop] = this.place(b.p, b.n, h);
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
      colour(b.p, b.n, h, bi >= 0 ? this.bumps[bi]! : null, drop, col);
      C[i * 3] = col.r; C[i * 3 + 1] = col.g; C[i * 3 + 2] = col.b;
      A[i * 3] = wool[0]; A[i * 3 + 1] = wool[1]; A[i * 3 + 2] = wool[2];
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(sph.getIndex());
    g.setAttribute("position", new THREE.BufferAttribute(P, 3));
    g.setAttribute("color", new THREE.BufferAttribute(C, 3));
    g.setAttribute("aWool", new THREE.BufferAttribute(A, 3));
    sph.dispose();
    return g.toNonIndexed();
  }
}

/** Merge the shell (with aWool) and a batch of extra pieces (aWool zero: no shader wool on them). */
function withExtras(shell: THREE.BufferGeometry, extras: THREE.BufferGeometry | null): THREE.BufferGeometry {
  if (!extras) return shell;
  const e = extras.index ? extras.toNonIndexed() : extras;
  e.deleteAttribute("normal");
  e.setAttribute("aWool", new THREE.BufferAttribute(new Float32Array(e.getAttribute("position").count * 3), 3));
  const parts = [shell, e];
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "color", "aWool"]) {
    const total = parts.reduce((a, g) => a + g.getAttribute(name).array.length, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of parts) { arr.set(g.getAttribute(name).array as Float32Array, o); o += g.getAttribute(name).array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  shell.dispose(); e.dispose(); if (e !== extras) extras.dispose();
  return out;
}

/** Colour of the shell: the wool, spots, crease shading, a little patchwork per lump, and the rare tints. */
function shellColour(c: FleeceCtx, aMax: number, crease: number) {
  const white = new THREE.Color("#ffffff"), cloudLo = new THREE.Color("#a9bbd8"), steelA = new THREE.Color("#5b6470"), steelB = new THREE.Color("#8d98a6");
  return (p: THREE.Vector3, _n: THREE.Vector3, h: number, b: Bump | null, drop: number, out: THREE.Color) => {
    const dx = p.x / c.L, dy = p.y / c.H, dz = p.z / c.W;
    out.set(c.isSpot(dx, dy, dz) ? c.spotHex : c.look.under > 0 ? c.under : c.wool);
    // the long outer coat hanging below the belly line is lighter at the tips
    if (c.look.under > 0) out.lerp(c.tip, smooth(drop * 1.6 + (dy - 0.2) * 0.6));
    else if (drop > 0) out.lerp(white, 0.08 * drop);
    if (c.cloud) out.copy(cloudLo).lerp(white, smooth((dy + 0.6) / 1.2));
    if (c.steel) out.copy(steelA).lerp(steelB, smooth(h / aMax));
    if (c.glow) out.copy(GLOW_BELLY).lerp(GLOW_DAY, smooth((dy + 0.7) / 1.3));
    if (c.paua) out.lerp(c.pauaStreak(dx, dy, dz), 0.9);
    if (b) out.multiplyScalar(b.tint);
    const cr = smooth(h / aMax);
    out.multiplyScalar(1 - crease * (1 - cr));
  };
}

function shellStyle(c: FleeceCtx, style: "a" | "c" | "d"): FleeceOut {
  const o: ShellOpts =
    style === "a" ? { amp: 0.62, rad: 1.6, count: 0.85, crease: 0.24, wobble: 0.25, seg: [64, 40] }
    : style === "c" ? { amp: 0.42, rad: 2.1, count: 0.5, crease: 0.12, wobble: 0.35, seg: [48, 30] }
    : { amp: 0.34, rad: 2.2, count: 0.5, crease: 0.08, wobble: 0.25, seg: [48, 30] };
  if (c.steel) { o.amp *= 0.6; o.rad *= 0.7; o.count *= 1.6; }
  if (c.cloud) { o.amp *= 1.6; o.count *= 0.7; o.crease *= 0.6; }
  if (c.look.hairy > 0.5) { o.amp *= 1.15; o.rad *= 0.8; }
  if (c.look.wrinkle > 0.5 && style === "a") { o.rad *= 0.8; o.count *= 1.3; }
  const shell = new Shell(c, o);
  const aMax = c.lockR * o.amp * 1.1;
  // shader wool (c, d): strength, cells per unit and vertical stretch, by breed
  const L = c.look;
  const fine = 1 + 0.6 * L.wrinkle + 0.4 * c.curl - 0.3 * L.hairy;
  const cells = (style === "d" ? 11.5 : 48) * fine / c.u;
  const stretch = c.swept ? -3 : 1 + 1.4 * L.hang + 2 * L.hairy + 0.3 * Math.max(0, L.stretch - 1);
  const strength = c.steel ? 0.35 : c.cloud ? 0.6 : 1;
  const geo = shell.geometry(shellColour(c, aMax, o.crease), [style === "a" ? 0 : strength, cells, stretch]);
  const bb = new GeoBatch(0, c.rng);
  if (L.hairy > 0.05) hairyExtras(bb, c, shell.surf, style === "a" ? (c.lite ? 18 : 30) : (c.lite ? 22 : 36));
  const glow = rareExtras(bb, c, shell.surf, { springs: c.steel ? Math.round(c.locks * 0.45) : 0, billows: false });
  return { body: withExtras(geo, bb.empty ? null : bb.build()), glow };
}

// ------------------------------------------------------------------ staples (style b)

/**
 * One wool lock growing from its root along local +y: fat near the root and tapering to a tip (pointed, or rounded for fine crimpy wool),
 * flattened along local z (the fleece normal), waved by crimp, and drooping toward `g` (gravity in the lock's own frame) as it grows,
 * so long locks drape over the body instead of sticking out. Colour runs from a shaded root to a bleached tip.
 */
function stapleGeo(len: number, rad: number, opts: { wave: number; waves: number; blunt: number; segR: number; segL: number; root: THREE.Color; tip: THREE.Color; flat: number; g: THREE.Vector3; droop: number }): THREE.BufferGeometry {
  const { segR, segL } = opts;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const cc = new THREE.Color();
  const p = new THREE.Vector3(), d = new THREE.Vector3(0, 1, 0), zf = new THREE.Vector3(), xf = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i <= segL; i++) {
    const t = i / segL;
    const tt = 0.04 + 0.96 * t;
    const pointy = Math.pow(Math.sin(Math.PI * Math.pow(tt, 0.7)), 0.8);
    const round = Math.pow(Math.sin(Math.PI * tt), 0.45);
    const r = rad * (pointy + (round - pointy) * opts.blunt);
    zf.set(0, 0, 1).addScaledVector(d, -d.z);
    if (zf.lengthSq() < 1e-6) zf.set(1, 0, 0);
    zf.normalize();
    xf.crossVectors(d, zf);
    const cx = opts.wave * rad * Math.sin(t * opts.waves * Math.PI * 2) * smooth(t * 2.5);
    cc.copy(opts.root).lerp(opts.tip, smooth(t * 1.3));
    for (let j = 0; j < segR; j++) {
      const a = (j / segR) * Math.PI * 2;
      q.copy(p).addScaledVector(xf, cx + Math.cos(a) * r).addScaledVector(zf, Math.sin(a) * r * opts.flat);
      pos.push(q.x, q.y, q.z);
      col.push(cc.r, cc.g, cc.b);
    }
    p.addScaledVector(d, len / segL);
    d.addScaledVector(opts.g, (opts.droop * 1.6) / segL).normalize();
  }
  for (let i = 0; i < segL; i++) for (let j = 0; j < segR; j++) {
    const a = i * segR + j, b = i * segR + ((j + 1) % segR), c2 = a + segR, e = b + segR;
    idx.push(a, c2, b, b, c2, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function stapleStyle(c: FleeceCtx): FleeceOut {
  const { rng, L, H, W, u, look, lockR, lite } = c;
  const bb = new GeoBatch(0, rng);
  const ground = c.cloud ? new THREE.Color("#b4c4e0") : c.paua ? new THREE.Color("#0b1238") : c.steel ? new THREE.Color("#4a525d") : c.glow ? GLOW_BELLY.clone().lerp(GLOW_DAY, 0.4) : new THREE.Color(c.look.under > 0 ? c.under : c.wool).multiplyScalar(0.8);
  // a dense under-coat: the barrel, rump, breast and neck
  bb.ico(ground, 1, 2, [0, 0, 0], [L, H, W]);
  bb.ico(ground, 0.29 * u, 2, [-L * 0.6, H * 0.12, 0], [1, 1.02, 1.08]);
  bb.ico(ground, 0.25 * u, 2, [L * 0.68, H * 0.3, 0], [1, 1.1, 0.95]);
  bb.ico(new THREE.Color(c.wool), 0.2 * u, 2, [L * 0.98, H * 0.72, 0], [1.15, 1.1, 0.82]);
  bb.ico(new THREE.Color(c.wool), 0.1 * u * look.tail, 1, [-L * 1.05, H * 0.18, 0], [0.9, 1.3, 0.9]);
  const nrm = (x: number, y: number, z: number) => new THREE.Vector3(x / L, y / H, z / W).normalize();
  const surf: Surf = (x, y, z) => { const n = nrm(x, y, z); return { p: new THREE.Vector3(x * L, y * H, z * W).addScaledVector(n, lockR * 0.55), n }; };
  const segR = lite ? 5 : 6, segL = lite ? 5 : 6;
  const crimpWaves = 0.8 + c.curl * 1.6;
  const white = new THREE.Color("#ffffff");
  const layer = (count: number, p: { len: number; rad: number; out: number; down: number; back: number; wave: number; waves: number; blunt: number; minY: number; tone: THREE.Color | null; flat: number; jitter: number; droop: number }) => {
    const order: [number, number, number][] = [];
    for (let i = 0; i < count; i++) order.push(fib(i, count));
    // root the lower rows first so the upper staples lie over them like shingles
    order.sort((a, b) => a[1] - b[1]);
    for (const [x0, y0, z0] of order) {
      const x = x0 + (rng() - 0.5) * p.jitter, y = y0 + (rng() - 0.5) * p.jitter, z = z0 + (rng() - 0.5) * p.jitter;
      if (y < p.minY) continue;
      const nv = nrm(x, y, z);
      let dir: THREE.Vector3;
      if (c.swept) dir = WIND.clone().addScaledVector(nv, -WIND.dot(nv) * 0.75).normalize();
      else {
        // lie down the body like shingles: along the surface toward the ground (or back off the spine), tilted out a little
        const td = DOWN.clone().addScaledVector(nv, -DOWN.dot(nv));
        if (td.lengthSq() < 0.05) td.add(new THREE.Vector3(-0.1, 0, z >= 0 ? 0.3 : -0.3)); // the fleece parts along the spine
        dir = td.normalize().multiplyScalar(p.down).addScaledVector(nv, p.out).add(new THREE.Vector3(-p.back, 0, 0)).normalize();
      }
      const len = lockR * p.len * (0.8 + rng() * 0.4) * (c.swept ? 1.6 : 1);
      const rad = lockR * p.rad * (0.85 + rng() * 0.3);
      const base = c.isSpot(x, y, z) ? new THREE.Color(c.spotHex) : p.tone ? p.tone.clone() : new THREE.Color(c.wool);
      if (c.paua) base.lerp(c.pauaStreak(x, y, z), 0.92).multiplyScalar(0.85 + rng() * 0.35);
      if (c.glow) base.copy(GLOW_BELLY).lerp(GLOW_DAY, smooth((y + 0.6) / 1.2));
      if (c.cloud) base.set("#a9bbd8").lerp(white, smooth((y + 0.5) / 1.1));
      base.multiplyScalar(0.96 + rng() * 0.08);
      const root = base.clone().multiplyScalar(0.72);
      const tip = base.clone().lerp(white, c.paua || c.glow ? 0.08 : 0.16 + 0.1 * look.hang);
      // the lock lies flat against the fleece (its thin side along the normal), so neighbours overlap like shingles
      const zAx = nv.clone().addScaledVector(dir, -nv.dot(dir));
      if (zAx.lengthSq() < 1e-4) zAx.set(0, 0, 1);
      zAx.normalize();
      const xAx = new THREE.Vector3().crossVectors(dir, zAx);
      const gw = c.swept ? WIND : DOWN;
      const gl = new THREE.Vector3(gw.dot(xAx), gw.dot(dir), gw.dot(zAx));
      const g = stapleGeo(len, rad, { wave: p.wave * (rng() < 0.5 ? -1 : 1), waves: p.waves, blunt: p.blunt, segR, segL, root, tip, flat: p.flat, g: gl, droop: c.swept ? 0.8 : p.droop });
      const at = new THREE.Vector3(x * L, y * H, z * W).addScaledVector(nv, rad * p.flat * 0.35);
      bb.addColored(g, new THREE.Matrix4().makeBasis(xAx, dir, zAx).setPosition(at));
    }
  };
  // lock counts are set per breed below, so undo the breed's lock-count factor
  const n = c.locks / Math.max(0.3, look.locks);
  if (c.steel) {
    // springy ringlets hanging out of a gunmetal under-coat
    const spring = springGeo(lite);
    const k = Math.round(n * 0.7);
    for (let i = 0; i < k; i++) {
      const [x, y, z] = fib(i, k);
      if (y < -0.62) continue;
      const nv = nrm(x, y, z);
      const ax = nv.clone().add(DOWN.clone().multiplyScalar(0.5 * Math.abs(nv.z))).add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.3)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(_z, ax).multiply(new THREE.Quaternion().setFromAxisAngle(_z, rng() * 6.28));
      const r = lockR * (0.62 + rng() * 0.2);
      const col = new THREE.Color(rng() < 0.3 ? "#a8b3c2" : "#6a7480").multiplyScalar((0.85 + rng() * 0.3) * (0.8 + 0.3 * smooth((y + 0.7) / 1.5)));
      bb.add(spring.clone(), col, qm(new THREE.Vector3(x * L, y * H, z * W).addScaledVector(nv, -r * 0.2), q, [r, r, r * 1.15]));
    }
    spring.dispose();
  } else if (c.cloud) {
    // cloud wool billows: round puffs, bright on top and blue-grey beneath
    const k = Math.round(n * 0.55);
    for (let i = 0; i < k; i++) {
      const [x, y, z] = fib(i, k);
      const col = new THREE.Color("#a9bbd8").lerp(white, smooth((y + 0.6) / 1.2)).multiplyScalar(0.97 + rng() * 0.05);
      bb.ico(col.getHex(), lockR * 1.9 * (0.85 + rng() * 0.4), 1, [x * L, y * H, z * W], [1.15, 0.92, 1.05], [rng() * 3, rng() * 3, rng() * 3]);
    }
  } else {
    const hairy = look.hairy, hang = look.hang;
    if (look.under > 0.05) {
      // Icelandic: a short dense under-coat, then long pointed outer locks hanging over it
      layer(Math.round(n * 1.1), { len: 1.8, rad: 0.85, out: 0.6, down: 1, back: 0.1, wave: 0.12, waves: crimpWaves, blunt: 0.8, minY: -0.7, tone: c.under, flat: 0.7, jitter: 0.1, droop: 0.4 });
      layer(Math.round(n * 0.7), { len: 3.2 + 1.0 * hang, rad: 0.6, out: 0.3, down: 1, back: 0.1, wave: 0.2, waves: 1.2, blunt: 0.1, minY: -0.4, tone: c.tip, flat: 0.6, jitter: 0.12, droop: 1.1 });
    } else if (hairy > 0.5) {
      // Drysdale: coarse hair, long, thin and spiky, standing out
      layer(Math.round(n * 1.1), { len: 2.4, rad: 0.75, out: 0.45, down: 1, back: 0.15, wave: 0.1, waves: 1, blunt: 0.5, minY: -0.68, tone: null, flat: 0.6, jitter: 0.1, droop: 0.4 });
      layer(Math.round(n * 0.45), { len: 2.6, rad: 0.42, out: 1.6, down: 0.6, back: 0.2, wave: 0.05, waves: 0.8, blunt: 0, minY: -0.5, tone: null, flat: 1, jitter: 0.15, droop: 0 });
    } else {
      const st = look.stretch;
      layer(Math.round(n * (1.5 + 0.5 * look.wrinkle) * (1 - 0.15 * hang)), {
        len: 2.5 * Math.pow(st, 0.75) * (1 - 0.3 * look.wrinkle), rad: 0.7 + 0.45 * look.wrinkle - 0.1 * hang, out: 0.45 - 0.15 * hang + 0.5 * look.wrinkle, down: 1, back: 0.1,
        wave: 0.12 + 0.18 * hang + 0.05 * c.curl, waves: crimpWaves * (1 + 0.6 * look.wrinkle) * (hang > 0.5 ? 0.6 : 1), blunt: 0.7 + 0.3 * look.wrinkle - 0.45 * hang,
        minY: -0.68, tone: null, flat: 0.6, jitter: 0.1, droop: 0.5 + 0.9 * hang - 0.4 * look.wrinkle,
      });
    }
    if (look.wrinkle > 0.05) {
      const ridge = Math.max(2, Math.round(3 * look.wrinkle)), crease = new THREE.Color(c.wool).multiplyScalar(0.72).getHex();
      for (let i = 0; i < ridge; i++) {
        const xi = L * (0.9 + i * 0.075), yi = H * (0.62 - i * 0.045), rr = 0.045 * u, half = W * 0.55;
        bb.ico(crease, rr, 1, [xi - 0.05 * u, yi - 0.015 * u, 0], [0.45, 0.8, half / rr * 0.9], [0, 0, -0.35]);
        bb.ico(c.wool, rr * 1.15, 1, [xi, yi + 0.012 * u, 0], [0.6, 0.85, half / (rr * 1.1)], [0, 0, -0.35]);
      }
    }
    if (hairy > 0.05) {
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        bb.ico(new THREE.Color(c.wool).multiplyScalar(0.85 + rng() * 0.2).getHex(), 0.07 * u, 0, [L * (0.35 + t * 0.7), H * (1.05 + t * 0.12), 0], [0.9, 1.9, 0.9], [0, 0, 0.5 - t * 0.9]);
      }
    }
  }
  const glow = rareExtras(bb, c, surf, { springs: 0, billows: c.cloud });
  return { body: bb.build()!, glow };
}

export function buildFleece(c: FleeceCtx, style: FleeceStyle): FleeceOut {
  return style === "b" ? stapleStyle(c) : shellStyle(c, style === "c" ? "c" : style === "d" ? "d" : "a");
}

// ------------------------------------------------------------------ shader wool (styles c, d)

const NOISE_GLSL = /* glsl */ `
varying vec3 vObj;
varying vec3 vWool;
varying vec3 vAx;
varying vec3 vAy;
varying vec3 vAz;
vec3 fl_hash33(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float fl_hash13(vec3 p) { p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float fl_vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fl_hash13(i), fl_hash13(i + vec3(1,0,0)), f.x), mix(fl_hash13(i + vec3(0,1,0)), fl_hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fl_hash13(i + vec3(0,0,1)), fl_hash13(i + vec3(1,0,1)), f.x), mix(fl_hash13(i + vec3(0,1,1)), fl_hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec2 fl_worley(vec3 p) {
  vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z)); vec3 r = g + fl_hash33(i + g) * 0.85 - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(vec2(d1, d2));
}
// curly wool height: a round soft dome on every curl, with a little shadowed gap where curls meet
float fl_curl(vec3 q) {
  vec2 w = fl_worley(q);
  float dome = 1.0 - smoothstep(0.0, 0.95, w.x);
  return dome * dome * (3.0 - 2.0 * dome) * (0.55 + 0.45 * smoothstep(0.0, 0.3, w.y - w.x));
}
float fl_felt(vec3 q) { return fl_vnoise(q) * 0.6 + fl_vnoise(q * 2.7 + 3.1) * 0.4; }
// tilt the view-space normal by an object-space height gradient (smooth per pixel, unlike screen-space derivatives)
vec3 fl_tilt(vec3 n, vec3 g, float k) {
  vec3 gv = g.x * vAx + g.y * vAy + g.z * vAz;
  return normalize(n - k * (gv - dot(gv, n) * n));
}
`;

/** Patch a shared wool material for the shader styles (c: felt fibre and sheen, d: per-pixel curls). */
export function patchWoolMaterial(m: THREE.MeshStandardMaterial, style: FleeceStyle): void {
  if (style !== "c" && style !== "d") return;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aWool;\nvarying vec3 vObj;\nvarying vec3 vWool;\nvarying vec3 vAx;\nvarying vec3 vAy;\nvarying vec3 vAz;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position; vWool = aWool; vAx = normalize(normalMatrix * vec3(1.0, 0.0, 0.0)); vAy = normalize(normalMatrix * vec3(0.0, 1.0, 0.0)); vAz = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));");
    const body = style === "d" ? /* glsl */ `
      if (vWool.x > 0.0) {
        vec3 sc = vWool.z > 0.0 ? vec3(1.0, 1.0 / vWool.z, 1.0) : vec3(-1.0 / vWool.z, 1.0, 1.0);
        vec3 q = vObj * sc * vWool.y;
        // fade the curls out where a cell is smaller than a couple of pixels (no shimmer when zoomed out)
        float near = 1.0 - smoothstep(0.2, 0.6, length(fwidth(q)));
        float h = fl_curl(q);
        if (near > 0.0) {
          const float e = 0.08;
          vec3 g = vec3(fl_curl(q + vec3(e, 0.0, 0.0)) - h, fl_curl(q + vec3(0.0, e, 0.0)) - h, fl_curl(q + vec3(0.0, 0.0, e)) - h) / e;
          normal = fl_tilt(normal, g * sc, 0.4 * vWool.x * near);
        }
        float ao = mix(0.88, 0.74 + 0.28 * h, near);
        diffuseColor.rgb *= mix(1.0, ao / 0.88, vWool.x);
      }` : /* glsl */ `
      if (vWool.x > 0.0) {
        // felt: a fine fibre mottle, felted micro-bumps and a soft fuzzy rim
        vec3 sc = vWool.z > 0.0 ? vec3(1.0, 1.0 / vWool.z, 1.0) : vec3(-1.0 / vWool.z, 1.0, 1.0);
        vec3 q = vObj * sc * vWool.y;
        float near = 1.0 - smoothstep(0.3, 1.0, length(fwidth(q)));
        float f = fl_felt(q);
        if (near > 0.0) {
          const float e = 0.1;
          vec3 g = vec3(fl_felt(q + vec3(e, 0.0, 0.0)) - f, fl_felt(q + vec3(0.0, e, 0.0)) - f, fl_felt(q + vec3(0.0, 0.0, e)) - f) / e;
          normal = fl_tilt(normal, g * sc, 0.3 * vWool.x * near);
        }
        diffuseColor.rgb *= mix(1.0, 0.84 + 0.26 * f, vWool.x * mix(0.5, 1.0, near));
        float fres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.2);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.08 + vec3(0.07), fres * 0.75 * vWool.x);
      }`;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + NOISE_GLSL)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + body);
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${key()}|fleece-${style}`;
  m.needsUpdate = true;
}
