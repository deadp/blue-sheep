// Style lab: one procedural sheep, drawn four ways (ink puffs, chunky woodcut, soft felt, plasticine).
// Wool colour comes from the v3 colour model (@blue-sheep/genetics woolColour).
import * as THREE from "three";
import { woolColour, type ColourInput } from "@blue-sheep/genetics";
import { GeoBatch } from "../world3d/builder.js";
import { hashString, mulberry32 } from "../world3d/rng.js";
import { mesh, type Mats } from "./render.js";

export interface LabSheep {
  name: string;
  colour: ColourInput;
  lamb?: boolean;
  horns?: boolean;
}

export const hexOf = (c: ColourInput): string => woolColour(c).hex;
export const nameOf = (c: ColourInput): string => woolColour(c).name;

/** The three close-up sheep: pastel pink, true blue, olive. */
export const TRIO: LabSheep[] = [
  { name: "Pikelet", colour: { white: false, red: 4, yellow: 0, blue: 0, dilute: true, depth: 1 } },
  { name: "Bluey", colour: { white: false, red: 0, yellow: 0, blue: 4, dilute: false, depth: 1.05 }, horns: true },
  { name: "Pickle", colour: { white: false, red: 1, yellow: 3, blue: 2, dilute: false, depth: 1 } },
];

function fib(i: number, n: number): [number, number, number] {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * 2.399963229728653;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

/** Lumpy plasticine blob: a sphere pushed out by a few soft bumps. */
function clayBlob(r: [number, number, number], seed: number, bumps = 9, amp = 0.09, detail = 5): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const centres: THREE.Vector3[] = [];
  for (let i = 0; i < bumps; i++) {
    const [x, y, z] = fib(i, bumps);
    centres.push(new THREE.Vector3(x + (rng() - 0.5) * 0.3, y + (rng() - 0.5) * 0.3, z + (rng() - 0.5) * 0.3).normalize());
  }
  const p = g.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let k = 1;
    for (const c of centres) k += amp * Math.exp(-(1 - v.dot(c)) * 9);
    // thumb-smoothed: faint fingerprint ripples
    k += 0.006 * Math.sin(v.x * 40 + v.y * 25);
    p.setXYZ(i, v.x * k * r[0], v.y * k * r[1], v.z * k * r[2]);
  }
  return g;
}

/** Build a sheep facing +x, standing on y = 0, about 1.3 units long (adult). */
export function buildSheep(mats: Mats, s: LabSheep, scale = 1): THREE.Group {
  const dir = mats.dir;
  const style = dir.sheep;
  const rng = mulberry32(hashString(s.name) ^ 0x51ee9);
  const wool = new THREE.Color(hexOf(s.colour));
  const face = dir.palette.face;
  const root = new THREE.Group();
  const bodyG = new THREE.Group();
  root.add(bodyG);
  const lamb = !!s.lamb;
  const k = (lamb ? 0.68 : 1) * scale;
  root.scale.setScalar(k);

  const L = 0.62, H = 0.5, W = 0.5;
  const legLen = style === "clay" ? 0.3 : 0.28;
  const bodyY = legLen + H * 0.72;

  // ---- wool body
  const wb = new GeoBatch(style === "chunky" ? 0.0 : dir.jitter, rng);
  if (style === "clay") {
    wb.add(clayBlob([L * 1.02, H * 0.9, W * 0.96], hashString(s.name), 11, 0.08), wool);
    // little balls of plasticine pressed on for wool
    const c = new THREE.Color();
    const n = 26;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = fib(i, n);
      if (y < -0.3) continue;
      c.copy(wool).multiplyScalar(0.97 + rng() * 0.06);
      wb.add(new THREE.SphereGeometry(0.13 + rng() * 0.03, 14, 10), c.getHex(),
        new THREE.Matrix4().compose(new THREE.Vector3(x * L * 0.98, y * H * 0.88, z * W * 0.94), new THREE.Quaternion(), new THREE.Vector3(1, 0.8, 1)));
    }
  } else {
    const detail = style === "chunky" ? 0 : style === "soft" ? 3 : 1;
    wb.ico(wool, 1, detail, [0, 0, 0], [L * 0.86, H * 0.82, W * 0.86]);
    const n = style === "chunky" ? 10 : style === "soft" ? 18 : 16;
    const pr = style === "chunky" ? 0.34 : style === "soft" ? 0.27 : 0.25;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const [x, y, z] = fib(i, n);
      if (y < -0.45) continue;
      const shade = style === "soft" ? 1 : 0.95 + rng() * 0.08;
      c.copy(wool).multiplyScalar(shade);
      wb.ico(c.getHex(), pr * (0.9 + rng() * 0.2), detail, [x * L * 0.78, y * H * 0.72, z * W * 0.78], [1, 0.92, 1], [rng() * 3, rng() * 3, rng() * 3]);
    }
  }
  // tail
  wb.ico(wool, style === "clay" ? 0.13 : 0.12, style === "clay" ? 3 : dir.detail, [-L * 1.02, H * 0.3, 0]);
  const body = mesh(mats, wb.build()!, style === "clay" ? "clay" : "wool", { scale: k });
  body.position.y = bodyY;
  bodyG.add(body);

  // ---- legs
  const lg = new GeoBatch(0, rng);
  const legR = style === "clay" ? 0.095 : style === "chunky" ? 0.085 : 0.07;
  const segs = style === "chunky" ? 5 : style === "clay" ? 12 : 8;
  for (const [x, z] of [[0.36, 0.22], [0.36, -0.22], [-0.36, 0.22], [-0.36, -0.22]] as const) {
    lg.cyl(face, legR, legR * 0.92, legLen + 0.2, segs, [x * L * 1.3, (legLen + 0.2) / 2, z * W * 1.4]);
    if (style === "clay") lg.ico(face, legR * 1.05, 2, [x * L * 1.3, legR * 0.6, z * W * 1.4], [1.1, 0.7, 1.1]);
  }
  bodyG.add(mesh(mats, lg.build()!, style === "clay" ? "clay" : "skin", { scale: k }));

  // ---- head (pivot at neck, facing +x)
  const head = new THREE.Group();
  head.position.set(L * 0.95, bodyY + H * 0.38, 0);
  head.rotation.z = -0.12;
  bodyG.add(head);
  const hs = lamb ? 1.08 : 1;
  head.scale.setScalar(hs);
  const hb = new GeoBatch(style === "chunky" ? 0 : dir.jitter, rng);
  const hd = style === "chunky" ? 0 : style === "soft" ? 3 : style === "clay" ? 4 : 1;
  if (style === "clay") hb.add(clayBlob([0.25, 0.24, 0.22], hashString(s.name) + 7, 5, 0.05, 4), face, new THREE.Matrix4().makeTranslation(0.16, -0.02, 0));
  else hb.ico(face, 0.25, hd, [0.16, -0.02, 0], [1.05, 0.95, 0.9]);
  const muzzle = new THREE.Color(face).lerp(new THREE.Color("#d9b8a8"), style === "chunky" ? 0.12 : 0.28).getHex();
  hb.ico(muzzle, 0.13, hd, [0.36, -0.1, 0], [0.9, 0.74, 1.1]);
  // wool cap
  hb.ico(wool, 0.19, hd, [0.04, 0.08, 0], [1, 1, 1.15]);
  hb.ico(wool, 0.11, hd, [0.17, 0.2, 0]);
  if (style === "clay") for (const [x, z] of [[0.02, 0.12], [0.02, -0.12], [0.12, 0.08], [0.12, -0.08]] as const) hb.add(new THREE.SphereGeometry(0.075, 12, 8), wool, new THREE.Matrix4().makeTranslation(x, 0.2, z));
  if (style !== "chunky") {
    hb.ico(wool, 0.08, hd, [0.1, 0.22, 0.08]);
    hb.ico(wool, 0.08, hd, [0.1, 0.22, -0.08]);
  }
  // ears
  for (const side of [1, -1]) {
    hb.ico(face, 1, hd, [0.07, 0.06, side * 0.27], [0.08, 0.035, 0.14], [0.2 * side, 0, -0.5 * side]);
  }
  if (style === "clay" || style === "soft") {
    for (const side of [1, -1]) hb.ico("#f29ea4", 0.05, 2, [0.33, -0.08, side * 0.17], [0.9, 0.7, 0.35]);
  }
  if (s.horns) {
    const horn = "#e8cf9a";
    for (const side of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      const segsH = style === "chunky" ? 6 : 10;
      for (let i = 0; i <= segsH; i++) {
        const t = i / segsH;
        const a = Math.PI / 2 + t * Math.PI * 1.6;
        const r = 0.13 * (1 - 0.3 * t);
        pts.push(new THREE.Vector3(0.05 + r * Math.cos(a), 0.14 - 0.13 + r * Math.sin(a), side * (0.21 + 0.1 * t)));
      }
      for (let i = 0; i < segsH; i++) {
        const a = pts[i]!, b = pts[i + 1]!;
        const d = new THREE.Vector3().subVectors(b, a);
        const len = d.length();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        const r0 = 0.055 - 0.03 * (i / segsH);
        const g = new THREE.CylinderGeometry(r0 * 0.85, r0, len * 1.25, style === "chunky" ? 5 : 8);
        hb.add(g, horn, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
      }
    }
  }
  head.add(mesh(mats, hb.build()!, style === "clay" ? "clay" : "skin", { scale: k * hs }));

  // eyes (unlit)
  const eb = new GeoBatch(0);
  for (const side of [1, -1]) {
    const z = side * 0.125;
    if (style === "clay") {
      eb.ico("#ffffff", 0.085, 2, [0.33, 0.06, z * 1.05]);
      eb.ico("#161212", 0.045, 2, [0.4, 0.055, z * 1.02]);
      eb.ico("#ffffff", 0.014, 1, [0.44, 0.075, z * 0.98]);
    } else if (style === "chunky") {
      eb.ico("#f7ecd6", 0.06, 1, [0.335, 0.04, z]);
      eb.ico("#1a1210", 0.038, 1, [0.37, 0.04, z]);
    } else {
      eb.ico("#1d1614", 0.05, 2, [0.35, 0.04, z]);
      eb.ico("#ffffff", 0.017, 1, [0.395, 0.06, z * 0.9]);
    }
  }
  head.add(new THREE.Mesh(eb.build()!, mats.unlit()));
  return root;
}
