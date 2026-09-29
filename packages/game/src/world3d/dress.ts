// The world dressing pass (DESIGN-v3 §15 item 27): the small things that make the valley read as a lived-in
// Kiwi farm at play zoom — toetoe, rocks, dry-stone walls, hedgerows, worn tracks with wheel ruts, gateway mud,
// clover and flower drifts, a rotary clothesline, woolpacks, a quad bike, a little grey tractor, a woodpile,
// and soft contact shadows. Everything here is static geometry merged into the farm's tiled batches (no new
// draw calls per prop); the lists of places live in valley.ts.
import * as THREE from "three";
import { GeoBatch, mat, type V3 } from "./builder.js";
import type { Rng } from "./rng.js";
import { groundY, type UV } from "./valley.js";

type B = GeoBatch;

/** A flat fan of triangles lying on the ground, each vertex lifted to the ground (so it follows the swells). */
function groundFan(b: B, u: number, v: number, radius: (a: number, ring: number) => number, colour: (ring: number) => THREE.Color, lift = 0.035, segs = 14, rings = 2): void {
  const pos: number[] = [], col: number[] = [];
  const pt = (a: number, ring: number): [number, number, number, THREE.Color] => {
    const r = ring === 0 ? 0 : radius(a, ring);
    const x = u + Math.cos(a) * r, z = -(v + Math.sin(a) * r);
    return [x, groundY(x, -z) + lift, z, colour(ring)];
  };
  const push = (p: [number, number, number, THREE.Color]) => { pos.push(p[0], p[1], p[2]); col.push(p[3].r, p[3].g, p[3].b); };
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    for (let r = 0; r < rings; r++) {
      const p00 = pt(a0, r), p01 = pt(a1, r), p10 = pt(a0, r + 1), p11 = pt(a1, r + 1);
      // wound to face up (angle runs anticlockwise in u, v; world z = -v)
      if (r === 0) { push(p00); push(p10); push(p11); }
      else { push(p00); push(p10); push(p11); push(p00); push(p11); push(p01); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  b.addColored(g);
}

/**
 * A soft contact shadow (for a multiply-blended batch): dark in the middle, white (no change) at the rim.
 * `k` is how dark the middle gets (0–1).
 */
export function contactShadow(b: B, u: number, v: number, r: number, k = 0.28, sx = 1, sv = 1): void {
  const mid = new THREE.Color(1 - k, 1 - k * 0.95, 1 - k * 0.85), half = new THREE.Color(1 - k * 0.55, 1 - k * 0.52, 1 - k * 0.45), rim = new THREE.Color(1, 1, 1);
  const pos: number[] = [], col: number[] = [];
  const segs = 12, rs = [0, 0.45, 1];
  const cs = [mid, half, rim];
  const P = (a: number, ri: number): number[] => {
    const x = u + Math.cos(a) * r * rs[ri]! * sx, vv = v + Math.sin(a) * r * rs[ri]! * sv;
    return [x, groundY(x, vv) + 0.045, -vv];
  };
  const push = (p: number[], ri: number) => { pos.push(p[0]!, p[1]!, p[2]!); col.push(cs[ri]!.r, cs[ri]!.g, cs[ri]!.b); };
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    push(P(a0, 0), 0); push(P(a0, 1), 1); push(P(a1, 1), 1);
    push(P(a0, 1), 1); push(P(a0, 2), 2); push(P(a1, 2), 2);
    push(P(a0, 1), 1); push(P(a1, 2), 2); push(P(a1, 1), 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  b.addColored(g);
}

/**
 * A soft ragged patch for the multiply-blended wear batch: `tint` in the middle fading to white (no change) at a
 * lumpy rim — clover, wet mud, trampled spots. Multiply only darkens, so light wear lives in the terrain colours.
 */
export function softPatch(b: B, rng: Rng, u: number, v: number, r: number, tint: string, stretch = 1): void {
  const ph = rng() * 6, ph2 = rng() * 6, lobes = 3 + Math.floor(rng() * 3);
  const ci = new THREE.Color(tint), cm = new THREE.Color(tint).lerp(new THREE.Color(1, 1, 1), 0.35), co = new THREE.Color(1, 1, 1);
  groundFan(b, u, v, (a, ring) => r * (ring === 1 ? 0.55 : 1) * (1 + 0.22 * Math.sin(a * lobes + ph) + 0.12 * Math.sin(a * 7 + ph2)) * (Math.abs(Math.cos(a)) * (stretch - 1) + 1), (ring) => (ring === 0 ? ci : ring === 1 ? cm : co), 0.04, 16, 2);
}

/**
 * A soft worn ribbon along a polyline for the multiply batch (wheel ruts, sheep tracks): `tint` down the middle
 * fading to white at ragged edges. `off` shifts it sideways (the two ruts either side of a track's middle).
 */
export function ribbon(b: B, rng: Rng, pts: UV[], width: number, tint: string, opts: { off?: number; jag?: number; lift?: number; step?: number } = {}): void {
  const off = opts.off ?? 0, jag = opts.jag ?? 0.25, lift = opts.lift ?? 0.04, step = opts.step ?? 0.5;
  const samples: { u: number; v: number; nu: number; nv: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, c = pts[i + 1]!;
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const n = Math.max(1, Math.round(len / step));
    const du = (c[0] - a[0]) / len, dv = (c[1] - a[1]) / len;
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      samples.push({ u: a[0] + (c[0] - a[0]) * t, v: a[1] + (c[1] - a[1]) * t, nu: -dv, nv: du });
    }
  }
  const mid = new THREE.Color(tint), white = new THREE.Color(1, 1, 1);
  const pos: number[] = [], col: number[] = [];
  // four points across: edge, inner, inner, edge
  let prev: { p: number[][]; c: THREE.Color[] } | null = null;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const end = Math.min(1, Math.min(i, samples.length - 1 - i) / 3);
    const cm = white.clone().lerp(mid, end * (0.8 + rng() * 0.2));
    const w = width / 2, jl = 1 + (rng() - 0.5) * jag * 2, jr = 1 + (rng() - 0.5) * jag * 2;
    const cu = s.u + s.nu * off, cv = s.v + s.nv * off;
    const across = [w * jl, w * 0.35, -w * 0.35, -w * jr];
    const p = across.map((d) => { const u = cu + s.nu * d, v = cv + s.nv * d; return [u, groundY(u, v) + lift, -v]; });
    const c = [white, cm, cm, white];
    if (prev) {
      for (let k = 0; k < 3; k++) {
        const quad: [number[], THREE.Color][] = [[prev.p[k]!, prev.c[k]!], [prev.p[k + 1]!, prev.c[k + 1]!], [p[k + 1]!, c[k + 1]!], [prev.p[k]!, prev.c[k]!], [p[k + 1]!, c[k + 1]!], [p[k]!, c[k]!]];
        for (const [pp, cc] of quad) { pos.push(pp[0]!, pp[1]!, pp[2]!); col.push(cc.r, cc.g, cc.b); }
      }
    }
    prev = { p, c };
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  b.addColored(g);
}

// ---------------------------------------------------------------- plants

/** Toetoe: a fountain of pale leaves with tall cream plumes nodding out of it. */
export function toetoe(fo: B, st: B, rng: Rng, u: number, v: number, s: number, y = groundY(u, v)): void {
  const leaf = ["#a9b97a", "#bfc58a", "#95a86e"];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rng() * 0.4;
    const tilt = 0.45 + rng() * 0.5;
    fo.add(new THREE.ConeGeometry(0.07 * s, 1.5 * s, 3), leaf[i % 3]!, mat([u + Math.cos(a) * 0.25 * s, y + 0.6 * s, -v + Math.sin(a) * 0.25 * s], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt], [1, 1, 0.4]));
  }
  const n = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, lean = 0.25 + rng() * 0.45, h = (2.1 + rng() * 0.7) * s;
    const base: V3 = [u + Math.cos(a) * 0.12 * s, y, -v + Math.sin(a) * 0.12 * s];
    const tip: V3 = [base[0] + Math.cos(a) * lean * s, y + h, base[2] + Math.sin(a) * lean * s];
    stick(st, "#cdbf8e", 0.025 * s, base, tip);
    // the plume hangs off the tip, nodding outwards
    const dir = new THREE.Vector3(tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().add(new THREE.Vector3(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35)).normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3(tip[0] + dir.x * 0.3 * s, tip[1] + dir.y * 0.3 * s, tip[2] + dir.z * 0.3 * s), q, new THREE.Vector3(0.75, 2.8, 0.75));
    fo.add(new THREE.IcosahedronGeometry(0.15 * s, 0), i % 2 ? "#f3ead0" : "#eadcb4", m);
  }
}

/** A thin cylinder from one point to another. */
export function stick(b: B, c: string, r: number, from: V3, to: V3, seg = 4): void {
  const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2), q, new THREE.Vector3(1, 1, 1));
  b.add(new THREE.CylinderGeometry(r * 0.8, r, len, seg), c, m);
}

/** A few half-buried grey rocks, lichen on the tops. */
export function rocks(b: B, rng: Rng, u: number, v: number, s: number, n = 3): void {
  const greys = ["#b8b3aa", "#a9a59d", "#c7c1b5", "#9e9a92"];
  for (let i = 0; i < n; i++) {
    const r = (0.2 + rng() * 0.22) * s * (i === 0 ? 1.35 : 1);
    const a = rng() * Math.PI * 2, d = i === 0 ? 0 : (0.45 + rng() * 0.4) * s;
    const x = u + Math.cos(a) * d, vv = v + Math.sin(a) * d;
    const y = groundY(x, vv);
    b.ico(greys[Math.floor(rng() * greys.length)]!, r, 1, [x, y + r * 0.2, -vv], [1.25, 0.7, 1], [rng(), rng() * 3, rng()]);
    if (rng() < 0.5) b.ico(rng() < 0.5 ? "#c3c78a" : "#d4cf98", r * 0.5, 0, [x + r * 0.1, y + r * 0.62, -vv], [1.3, 0.3, 1.1]);
  }
}

/** Thistles along a fence: a spiky rosette and a purple head or two. */
export function thistle(b: B, rng: Rng, u: number, v: number, s: number): void {
  const y = groundY(u, v);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng();
    b.add(new THREE.ConeGeometry(0.06 * s, 0.55 * s, 3), "#8aa476", mat([u + Math.cos(a) * 0.12 * s, y + 0.18 * s, -v + Math.sin(a) * 0.12 * s], [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1], [1, 1, 0.35]));
  }
  const heads = 1 + Math.floor(rng() * 2);
  for (let k = 0; k < heads; k++) {
    const dx = (rng() - 0.5) * 0.3 * s, dz = (rng() - 0.5) * 0.3 * s, h = (0.55 + rng() * 0.35) * s;
    b.cyl("#7f9a6a", 0.018 * s, 0.025 * s, h, 3, [u + dx, y + h / 2, -v + dz]);
    b.ico("#8fa373", 0.07 * s, 0, [u + dx, y + h, -v + dz]);
    b.ico("#b777c9", 0.065 * s, 0, [u + dx, y + h + 0.07 * s, -v + dz], [1, 0.9, 1]);
  }
}

// ---------------------------------------------------------------- walls, hedges

/** A dry-stone wall along a polyline: three courses of lumpy stones, the top ones smaller, moss here and there. */
export function stoneWall(b: B, rng: Rng, pts: UV[]): void {
  const greys = ["#c4beb2", "#b3ada3", "#cfc9bd", "#aaa59c", "#bcb5a6"];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, c = pts[i + 1]!;
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const ry = Math.atan2(c[1] - a[1], c[0] - a[0]);
    const n = Math.max(2, Math.round(len / 0.42));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const u = a[0] + (c[0] - a[0]) * t, v = a[1] + (c[1] - a[1]) * t;
      const y = groundY(u, v);
      // a tumbledown gap now and then
      const courses = rng() < 0.07 ? 1 : 3;
      for (let q = 0; q < courses; q++) {
        const r = (0.27 - q * 0.04) * (0.85 + rng() * 0.3);
        const sh = q % 2 ? 0.21 : 0;
        b.ico(greys[Math.floor(rng() * greys.length)]!, r, 0, [u + Math.cos(ry) * sh * 0.5 + (rng() - 0.5) * 0.06, y + 0.15 + q * 0.27, -v + Math.sin(ry) * sh * 0.5 + (rng() - 0.5) * 0.1], [1.2, 0.7, 0.95], [rng() * 0.3, ry + rng() * 0.5, rng() * 0.3]);
      }
      if (rng() < 0.18) b.ico("#9dbb84", 0.15, 0, [u + (rng() - 0.5) * 0.3, y + 0.15 + courses * 0.25, -v], [1.4, 0.45, 1.2]);
    }
  }
}

/** A clipped hedgerow along a polyline: a solid green body with a bumpy, rounded top and a darker skirt. */
export function hedge(fo: B, rng: Rng, pts: UV[], h = 1.3): void {
  const greens = ["#6f9c69", "#7aa672", "#679362", "#82ab76"];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, c = pts[i + 1]!;
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const ry = Math.atan2(c[1] - a[1], c[0] - a[0]);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
      const u = a[0] + (c[0] - a[0]) * tm, v = a[1] + (c[1] - a[1]) * tm;
      const y = Math.min(groundY(a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0), groundY(a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1));
      const seg = len / n;
      fo.box("#5e8a5c", [seg + 0.05, h * 0.72, 1.0], [u, y + h * 0.36, -v], [0, ry, 0]);
      for (let j = 0; j < 3; j++) {
        const tj = t0 + (t1 - t0) * (j + 0.5) / 3;
        const uj = a[0] + (c[0] - a[0]) * tj, vj = a[1] + (c[1] - a[1]) * tj;
        fo.ico(greens[Math.floor(rng() * greens.length)]!, 0.5 + rng() * 0.08, 1, [uj, y + h * 0.72 + (rng() - 0.5) * 0.08, -vj + (rng() - 0.5) * 0.1], [1.1, 0.62, 1.08], [0, rng() * 3, 0]);
      }
      // a softer skirt either side (perpendicular to the run: (-sin, cos) in u, v)
      for (const side of [-1, 1]) fo.ico(greens[Math.floor(rng() * greens.length)]!, 0.42, 0, [u - Math.sin(ry) * 0.42 * side, y + h * 0.42, -(v + Math.cos(ry) * 0.42 * side)], [1.8, 0.75, 0.6], [0, ry, 0]);
    }
  }
}

// ---------------------------------------------------------------- farm things

/** A rotary clothesline (the Kiwi backyard classic) with the washing out. */
export function clothesline(b: B, u: number, v: number): void {
  const y = groundY(u, v);
  const g = new GeoBatch();
  const metal = "#c9ced2";
  g.cyl(metal, 0.05, 0.06, 2.1, 6, [0, 1.05, 0]);
  const R = 1.7, arms = 4;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + Math.PI / 4;
    g.box(metal, [R, 0.035, 0.035], [Math.cos(a) * R / 2, 2.02 + 0.12, -Math.sin(a) * R / 2], [0, a, 0.14]);
  }
  // three squares of line
  for (const rr of [0.6, 1.1, 1.6]) {
    for (let i = 0; i < arms; i++) {
      const a0 = (i / arms) * Math.PI * 2 + Math.PI / 4, a1 = ((i + 1) / arms) * Math.PI * 2 + Math.PI / 4;
      const x0 = Math.cos(a0) * rr, z0 = -Math.sin(a0) * rr, x1 = Math.cos(a1) * rr, z1 = -Math.sin(a1) * rr;
      const L = Math.hypot(x1 - x0, z1 - z0);
      g.box("#e9e4da", [L, 0.015, 0.015], [(x0 + x1) / 2, 2.05 + (rr / R) * 0.2, (z0 + z1) / 2], [0, -Math.atan2(z1 - z0, x1 - x0), 0]);
    }
  }
  // washing: a check shirt, a towel, socks, a tea towel, a blue singlet
  const hang = (rr: number, side: number, t: number, w: number, hh: number, c: string) => {
    const a0 = (side / arms) * Math.PI * 2 + Math.PI / 4, a1 = ((side + 1) / arms) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a0) * rr * (1 - t) + Math.cos(a1) * rr * t, z = -Math.sin(a0) * rr * (1 - t) - Math.sin(a1) * rr * t;
    const ry = -Math.atan2(-Math.sin(a1) * rr + Math.sin(a0) * rr, Math.cos(a1) * rr - Math.cos(a0) * rr);
    g.box(c, [w, hh, 0.03], [x, 2.05 + (rr / R) * 0.2 - hh / 2, z], [0, ry, 0]);
  };
  hang(1.6, 0, 0.3, 0.6, 0.7, "#d65a4a");
  hang(1.6, 0, 0.72, 0.5, 0.8, "#f4d27a");
  hang(1.6, 1, 0.45, 0.7, 0.55, "#ffffff");
  hang(1.1, 2, 0.4, 0.45, 0.6, "#7fa7d6");
  hang(1.6, 3, 0.3, 0.16, 0.34, "#3c3b44");
  hang(1.6, 3, 0.45, 0.16, 0.34, "#3c3b44");
  hang(1.1, 3, 0.65, 0.5, 0.5, "#b8d9b0");
  hang(1.6, 2, 0.7, 0.55, 0.62, "#f2b6c6");
  // a peg basket
  g.box("#d2b48c", [0.5, 0.3, 0.36], [0.45, 0.15, 0.5]);
  g.box("#ffffff", [0.42, 0.08, 0.3], [0.45, 0.32, 0.5]);
  const geo = g.build();
  if (geo) { geo.applyMatrix4(mat([u, y, -v], [0, 0.2, 0])); b.addColored(geo); }
}

/** A woolpack: a tall square sack of wool with its stencil and stitched top. */
export function woolpack(b: B, rng: Rng, u: number, v: number, ry: number, lean = 0): void {
  const y = groundY(u, v);
  const g = new GeoBatch(0.03, rng);
  g.box("#f1ead8", [0.9, 1.3, 0.9], [0, 0.65, 0]);
  g.ico("#f6f0e2", 0.52, 1, [0, 1.3, 0], [1, 0.32, 1]);
  g.box("#6f8fb8", [0.55, 0.16, 0.02], [0, 0.85, 0.46]);
  g.box("#c05a50", [0.3, 0.1, 0.02], [0, 0.62, 0.46]);
  g.box("#6f8fb8", [0.02, 0.16, 0.45], [0.46, 0.85, 0]);
  for (const x of [-0.3, 0, 0.3]) g.ico("#d8cdb2", 0.05, 0, [x, 1.43, 0.3]);
  const geo = g.build();
  if (geo) { geo.applyMatrix4(mat([u, y, -v], [lean, ry, lean * 0.5])); b.addColored(geo); }
}

/** A red farm quad bike with racks (and a coil of rope). */
export function quadBike(b: B, u: number, v: number, ry: number): void {
  const y = groundY(u, v);
  const g = new GeoBatch();
  const red = "#c9463d", dark = "#2d2b2b", grey = "#9aa0a4";
  for (const [x, z] of [[-0.62, -0.55], [-0.62, 0.55], [0.62, -0.55], [0.62, 0.55]] as const) {
    g.cyl(dark, 0.32, 0.32, 0.26, 10, [x, 0.32, z], [Math.PI / 2, 0, 0]);
    g.cyl("#8c8f91", 0.14, 0.14, 0.27, 8, [x, 0.32, z], [Math.PI / 2, 0, 0]);
  }
  g.box(red, [1.2, 0.3, 0.7], [0, 0.62, 0]);
  g.box(red, [0.55, 0.22, 1.18], [0.62, 0.66, 0]);
  g.box(red, [0.5, 0.22, 1.18], [-0.62, 0.66, 0]);
  g.box(dark, [0.62, 0.14, 0.42], [-0.1, 0.84, 0]);
  g.box(red, [0.35, 0.3, 0.45], [0.35, 0.86, 0]);
  g.cyl(dark, 0.025, 0.025, 0.8, 5, [0.5, 1.08, 0], [Math.PI / 2, 0, 0]);
  g.cyl(grey, 0.03, 0.03, 0.3, 5, [0.47, 0.95, 0], [0, 0, 0.3]);
  for (const x of [-0.72, 0.78]) { g.box(grey, [0.55, 0.04, 0.9], [x, 0.86, 0]); g.box(grey, [0.04, 0.12, 0.9], [x + (x < 0 ? -0.26 : 0.26), 0.92, 0]); }
  g.cyl("#e0c37a", 0.2, 0.2, 0.1, 10, [-0.75, 0.93, 0]);
  g.box("#f2f1ec", [0.12, 0.08, 0.12], [0.93, 0.7, 0.22]);
  g.box("#f2f1ec", [0.12, 0.08, 0.12], [0.93, 0.7, -0.22]);
  const geo = g.build();
  if (geo) { geo.applyMatrix4(mat([u, y, -v], [0, ry, 0], 1.05)); b.addColored(geo); }
}

/** A little grey tractor (a "Fergie") parked by the barn. */
export function tractor(b: B, u: number, v: number, ry: number): void {
  const y = groundY(u, v);
  const g = new GeoBatch();
  const grey = "#a9b0b3", dark = "#2f2d2c", red = "#c5523f";
  // big rear wheels, small front wheels (x forward)
  for (const z of [-0.72, 0.72]) {
    g.cyl(dark, 0.62, 0.62, 0.32, 14, [-0.55, 0.62, z], [Math.PI / 2, 0, 0]);
    g.cyl(red, 0.34, 0.34, 0.34, 10, [-0.55, 0.62, z], [Math.PI / 2, 0, 0]);
    g.cyl(dark, 0.34, 0.34, 0.2, 10, [0.95, 0.34, z * 0.8], [Math.PI / 2, 0, 0]);
    g.cyl(red, 0.17, 0.17, 0.22, 8, [0.95, 0.34, z * 0.8], [Math.PI / 2, 0, 0]);
    // mudguards
    g.box(grey, [0.95, 0.06, 0.4], [-0.55, 1.22, z], [0, 0, 0]);
  }
  g.box(grey, [1.6, 0.5, 0.6], [0.35, 0.72, 0]);
  g.box(grey, [0.9, 0.42, 0.55], [0.6, 1.1, 0], [0, 0, -0.08]);
  g.box("#8f989b", [0.08, 0.36, 0.5], [1.07, 1.0, 0]);
  g.box(dark, [0.5, 0.1, 0.5], [-0.45, 1.12, 0]);
  g.box(dark, [0.1, 0.4, 0.5], [-0.7, 1.35, 0]);
  g.cyl(dark, 0.03, 0.03, 0.5, 5, [0.05, 1.3, 0], [0, 0, 0.7]);
  g.cyl(dark, 0.18, 0.18, 0.04, 10, [-0.07, 1.46, 0], [0, 0, 0.7]);
  g.cyl("#56524e", 0.05, 0.05, 0.7, 6, [0.8, 1.55, 0.18]);
  const geo = g.build();
  if (geo) { geo.applyMatrix4(mat([u, y, -v], [0, ry, 0], 1.05)); b.addColored(geo); }
}

/** A stack of split firewood under a small iron lean-to roof. */
export function woodpile(b: B, rng: Rng, u: number, v: number): void {
  const y = groundY(u, v);
  const g = new GeoBatch(0.05, rng);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6 - row; i++) {
    g.cyl(i % 2 ? "#a57a55" : "#94694a", 0.16, 0.16, 1.1, 6, [-0.85 + i * 0.33 + row * 0.16, 0.17 + row * 0.29, 0], [Math.PI / 2, 0, 0]);
    g.cyl("#e2c79c", 0.12, 0.12, 0.02, 6, [-0.85 + i * 0.33 + row * 0.16, 0.17 + row * 0.29, 0.56], [Math.PI / 2, 0, 0]);
  }
  g.box("#b9c3c9", [2.3, 0.06, 1.5], [0, 1.25, -0.05], [0.18, 0, 0]);
  for (const x of [-1.05, 1.05]) g.box("#9d8163", [0.1, 1.25, 0.1], [x, 0.62, 0.55]);
  g.box("#6a6a6a", [0.06, 0.5, 0.06], [1.3, 0.25, 0.35], [0, 0, 0.2]);
  const geo = g.build();
  if (geo) { geo.applyMatrix4(mat([u, y, -v], [0, 0.1, 0])); b.addColored(geo); }
}

/** A few pieces of hay scattered where a bale's been fed out. */
export function hayScatter(b: B, rng: Rng, u: number, v: number, r: number): void {
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
    const x = u + Math.cos(a) * d, vv = v + Math.sin(a) * d;
    b.box(rng() < 0.5 ? "#e6cf86" : "#d8bd6c", [0.5 + rng() * 0.4, 0.04, 0.08], [x, groundY(x, vv) + 0.06, -vv], [0, rng() * 3, 0]);
  }
}

/** A corrugated-iron rainwater tank on a timber stand (the woolshed's water). */
export function tankStand(b: B, u: number, v: number): void {
  const y = groundY(u, v);
  const g = new GeoBatch();
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as const) g.box("#9d8163", [0.16, 1.3, 0.16], [x, 0.65, z]);
  g.box("#b39574", [2.0, 0.12, 2.0], [0, 1.32, 0]);
  g.cyl("#c9d0d4", 0.95, 0.95, 1.7, 16, [0, 2.23, 0]);
  for (let i = 0; i < 6; i++) g.cyl("#b4bcc1", 0.97, 0.97, 0.05, 16, [0, 1.5 + i * 0.28, 0]);
  g.cone("#b9c1c6", 1.0, 0.35, 16, [0, 3.25, 0]);
  g.cyl("#8e979c", 0.05, 0.05, 1.6, 6, [0.9, 0.8, 0.5]);
  g.box("#8e979c", [0.3, 0.06, 0.06], [0.9, 0.2, 0.62]);
  const geo = g.build();
  if (geo) { geo.applyMatrix4(mat([u, y, -v], [0, 0.3, 0])); b.addColored(geo); }
}

/** A wheelbarrow with a load of dagging, parked tipped a little. */
export function wheelbarrow(b: B, u: number, v: number, ry: number): void {
  const y = groundY(u, v);
  const g = new GeoBatch();
  g.box("#4f8a6a", [0.9, 0.35, 0.62], [0.05, 0.52, 0], [0, 0, -0.08]);
  g.box("#3f7258", [0.8, 0.05, 0.52], [0.05, 0.36, 0]);
  g.ico("#e8e0cf", 0.26, 1, [0.05, 0.72, 0], [1.4, 0.45, 1]);
  g.cyl("#2d2b2b", 0.2, 0.2, 0.1, 10, [0.62, 0.2, 0], [Math.PI / 2, 0, 0]);
  for (const z of [-0.26, 0.26]) { g.box("#9d8163", [1.3, 0.05, 0.05], [0, 0.45, z], [0, 0, -0.18]); g.box("#8e969b", [0.05, 0.36, 0.05], [-0.28, 0.18, z]); }
  const geo = g.build();
  if (geo) { geo.applyMatrix4(mat([u, y, -v], [0, ry, 0])); b.addColored(geo); }
}

export type { V3 };
