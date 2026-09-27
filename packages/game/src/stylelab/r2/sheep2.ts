// Style lab round 2: a slightly more realistic sheep (DESIGN-v3 §15 item 20). Closer to option C's
// proportions but less toy-like: a longer woolly barrel, a smaller natural head carried forward on
// a woolly neck, a tapered face and muzzle, side ears, slim legs with hooves, and soft belly shading.
// Still cute: eyes a touch larger than life and a wool topknot. Wool colour is the v3 colour model.
import * as THREE from "three";
import { GeoBatch } from "../../world3d/builder.js";
import { hashString, mulberry32 } from "../../world3d/rng.js";
import { mesh, type Mats } from "../render.js";
import { hexOf, type LabSheep } from "../sheep.js";

function fib(i: number, n: number): [number, number, number] {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * 2.399963229728653;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

/** Face and leg colour: cream on white sheep, a warm dark brown (faintly tinted by the fleece) otherwise. */
export function faceOf(s: LabSheep): THREE.Color {
  const wool = new THREE.Color(hexOf(s.colour));
  if (s.colour.white) return new THREE.Color("#eadfce");
  return new THREE.Color("#6a564d").lerp(wool, 0.14);
}

/** Paint a geometry's colours with a soft top-light gradient: shaded belly, bright back. */
function shadeByHeight(geo: THREE.BufferGeometry, y0: number, y1: number, lo: number, hi: number) {
  const p = geo.getAttribute("position");
  const c = geo.getAttribute("color");
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, (p.getY(i) - y0) / (y1 - y0)));
    const k = lo + (hi - lo) * (t * t * (3 - 2 * t));
    c.setXYZ(i, Math.min(1, c.getX(i) * k), Math.min(1, c.getY(i) * k), Math.min(1, c.getZ(i) * k));
  }
  c.needsUpdate = true;
}

export interface Sheep2Opts {
  /** Round-3 friendlier face (DESIGN-v3 §15 item 21): a slightly bigger head, shorter muzzle,
   *  bigger soft eyes set a little forward in a pale eye patch, with a relaxed upper lid. */
  friendly?: boolean;
}

/** Build a sheep facing +x, standing on y = 0, about 1.45 units long (adult). */
export function buildSheep2(mats: Mats, s: LabSheep, scale = 1, opts: Sheep2Opts = {}): THREE.Group {
  const fr = !!opts.friendly;
  const rng = mulberry32(hashString(s.name) ^ 0x2ee9);
  const wool = new THREE.Color(hexOf(s.colour));
  const face = faceOf(s);
  const hoof = face.clone().multiplyScalar(0.55);
  const root = new THREE.Group();
  const lamb = !!s.lamb;
  root.scale.setScalar((lamb ? 0.66 : 1) * scale * 1.1);

  const L = 0.56, H = 0.34, W = 0.33; // wool barrel half-extents
  const legLen = lamb ? 0.46 : 0.42;
  const bodyY = legLen + H * 0.62;

  // ---- fleece: a barrel covered in small locks, belly softly shaded
  const wb = new GeoBatch(0, rng);
  wb.ico(wool, 1, 3, [0, 0, 0], [L, H, W]);
  // many small locks just proud of the barrel: a soft crimped fleece rather than big puffs
  const n = 110;
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const [x, y, z] = fib(i, n);
    if (y < -0.7) continue;
    c.copy(wool).multiplyScalar(0.975 + rng() * 0.05);
    const r = 0.085 + rng() * 0.04;
    wb.ico(c.getHex(), r, 1, [x * L * 0.97, y * H * 0.95, z * W * 0.97], [1.2, 0.85, 1], [rng() * 3, rng() * 3, rng() * 3]);
  }
  // rump and breast fullness, a woolly neck carrying the head forward
  wb.ico(wool, 0.3, 2, [-L * 0.62, H * 0.12, 0], [1, 1.02, 1.08]);
  wb.ico(wool, 0.26, 2, [L * 0.7, H * 0.3, 0], [1, 1.1, 0.95]);
  wb.ico(wool, 0.19, 2, [L * 1.0, H * 0.75, 0], [1.15, 1.1, 0.82]);
  // short docked tail
  wb.ico(wool, 0.09, 2, [-L * 1.05, H * 0.18, 0], [0.9, 1.3, 0.9]);
  const wg = wb.build()!;
  shadeByHeight(wg, -H * 1.05, H * 0.9, 0.8, 1.03);
  const body = mesh(mats, wg, "wool", { outline: 0 });
  body.position.y = bodyY;
  root.add(body);

  // ---- legs: slim, darker hooves, a little wool at the top
  const lg = new GeoBatch(0, rng);
  for (const [x, z] of [[0.36, 0.15], [0.36, -0.15], [-0.36, 0.15], [-0.36, -0.15]] as const) {
    const lx = x * L * 1.25;
    lg.cyl(face, 0.048, 0.04, legLen + 0.08, 8, [lx, (legLen + 0.08) / 2 + 0.05, z]);
    lg.cyl(hoof, 0.045, 0.05, 0.07, 8, [lx + 0.008, 0.035, z]);
  }
  root.add(mesh(mats, lg.build()!, "skin", { outline: 0 }));

  // ---- head: pivot at the poll, carried forward and a little down
  const head = new THREE.Group();
  head.position.set(L * 1.2, bodyY + H * 1.0, 0);
  head.rotation.z = -0.28;
  root.add(head);
  const hs = (lamb ? 1.18 : 1) * (fr ? 1.16 : 1);
  head.scale.setScalar(hs);
  const hb = new GeoBatch(0, rng);
  // tapered face: a skull and a narrower muzzle
  hb.ico(face, 1, 3, [0.08, 0, 0], [0.18, 0.145, 0.125]);
  if (fr) {
    // rounder skull, shorter softer muzzle
    hb.ico(face, 1, 3, [0.07, 0.01, 0], [0.19, 0.155, 0.14]);
    hb.ico(face, 1, 3, [0.2, -0.045, 0], [0.13, 0.092, 0.095]);
  } else hb.ico(face, 1, 3, [0.23, -0.04, 0], [0.14, 0.09, 0.088]);
  const nose = face.clone().lerp(new THREE.Color("#c99a90"), s.colour.white ? 0.5 : fr ? 0.3 : 0.2);
  hb.ico(nose, 1, 2, [fr ? 0.31 : 0.35, -0.055, 0], [0.035, 0.055, 0.065]);
  // wool topknot and cheeks of fleece behind the face
  hb.ico(wool, 0.1, 2, [0.02, 0.1, 0], [1.1, 0.85, 1.15]);
  hb.ico(wool, 0.06, 2, [0.1, 0.12, 0.04]);
  hb.ico(wool, 0.06, 2, [0.1, 0.12, -0.04]);
  hb.ico(wool, 0.13, 2, [-0.06, -0.02, 0], [1, 1.1, 1.2]);
  // ears held out to the side, tips slightly down
  for (const side of [1, -1]) {
    hb.ico(face, 1, 2, [-0.01, 0.06, side * 0.18], [0.055, 0.025, 0.13], [0.3 * side, 0.3 * side, -0.2 * side]);
  }
  if (s.horns) {
    const horn = "#dcc59a";
    for (const side of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const a = Math.PI * 0.6 + t * Math.PI * 1.7;
        const r = 0.1 * (1 - 0.35 * t);
        pts.push(new THREE.Vector3(-0.02 + r * Math.cos(a), 0.02 + r * Math.sin(a), side * (0.1 + 0.08 * t)));
      }
      for (let i = 0; i < 12; i++) {
        const a = pts[i]!, b = pts[i + 1]!;
        const d = new THREE.Vector3().subVectors(b, a);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
        const r0 = 0.04 - 0.024 * (i / 12);
        hb.add(new THREE.CylinderGeometry(r0 * 0.85, r0, d.length() * 1.3, 8), horn, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
      }
    }
  }
  head.add(mesh(mats, hb.build()!, "skin", { outline: 0 }));
  // eyes on the sides of the head, a little larger than life, with a catch-light
  const eb = new GeoBatch(0);
  if (fr) {
    // soft eyes: a faint pale patch, a big warm-dark eye set forward, a large catch-light and a small one
    const patch = face.clone().lerp(new THREE.Color("#f4e8da"), s.colour.white ? 0.2 : 0.2);
    const lb = new GeoBatch(0);
    for (const side of [1, -1]) {
      lb.ico(patch, 0.064, 2, [0.138, 0.042, side * 0.106], [1.1, 1.05, 0.55], [0, side * 0.35, 0]);
      eb.ico("#2b1e19", 0.05, 2, [0.148, 0.042, side * 0.117], [1, 1.04, 0.62], [0, side * 0.35, 0]);
      eb.ico("#6a4636", 0.028, 2, [0.158, 0.03, side * 0.133], [1, 1, 0.5], [0, side * 0.35, 0]);
      eb.ico("#ffffff", 0.02, 1, [0.168, 0.062, side * 0.14]);
      eb.ico("#ffffff", 0.008, 1, [0.14, 0.024, side * 0.143]);
    }
    head.add(mesh(mats, lb.build()!, "skin", { outline: 0 }));
  } else {
    for (const side of [1, -1]) {
      eb.ico("#1d1614", 0.038, 2, [0.15, 0.04, side * 0.104], [1, 1.1, 0.7]);
      eb.ico("#ffffff", 0.012, 1, [0.17, 0.055, side * 0.124]);
    }
  }
  head.add(new THREE.Mesh(eb.build()!, mats.unlit()));
  return root;
}
