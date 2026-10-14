// Procedural low-poly sheep built from a WorldSheep phenotype.
// Two merged geometries per sheep (wool body + tail, head), vertex-coloured so
// materials are shared across the whole flock. Legs, ears and eyes are
// articulated parts: instanced flock-wide in the world (parts.ts), real
// meshes in portraits (buildFullRig). SheepPose drives both.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GeoBatch, mat, type V3 } from "./builder.js";
import { hashString, mulberry32 } from "./rng.js";
import { woolHex } from "./palette.js";
import type { WorldSheep } from "./types.js";
import { buildFleece, fleeceStyle, GLOW_BELLY, GLOW_DAY, PAUA_NACRE, patchWoolMaterial, pauaChip, springGeo } from "./fleece.js";

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
  /** glow-worm only: pinpoint lights across the fleece in two twinkling sets, in body space */
  glow?: { a: THREE.BufferGeometry; b: THREE.BufferGeometry } | undefined;
}

/** Sheep read better a little larger than life next to the buildings. */
export const WORLD_SCALE = 1.22;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const num = (v: number, d: number) => (Number.isFinite(v) ? v : d);

/** Detail of the fleece (wool locks per sheep): "lite" halves the triangles for slow machines. */
let LOCKS = 52;
export function setSheepDetail(d: "full" | "lite"): void { LOCKS = d === "lite" ? 34 : 52; }

/**
 * Procedural breed looks (DESIGN-v3 §3.2, §15 item 30): build, fleece texture and face/leg colour. The default is
 * the Farm sheep. `locks` and `lockR` scale the number and size of wool locks, `stretch` makes them longer
 * (shaggy), `body` scales the build, `legs` the leg length, `face` is the face and leg colour on white or oatmeal
 * sheep and `faceDark` on coloured ones (null: the usual dark brown tinted by the fleece). The 0..1 features:
 * `wrinkle` neck folds (Merino), `hang` long locks hanging from the flanks (Romney, Icelandic outer coat),
 * `hairy` coarse spiky hair with a mane (Drysdale), `under` a short dense under-wool beneath long outer locks
 * (Icelandic), `cap` extra face wool, `horn` horn size multiplier.
 */
export interface BreedLook {
  locks: number; lockR: number; stretch: number; body: number; legs: number; face: string | null; faceDark: string | null; tail: number;
  wrinkle: number; hang: number; hairy: number; under: number; cap: number; horn: number;
}
const FARM_LOOK: BreedLook = { locks: 1, lockR: 1, stretch: 1, body: 1, legs: 1, face: null, faceDark: null, tail: 1, wrinkle: 0, hang: 0, hairy: 0, under: 0, cap: 0, horn: 1 };
const look = (o: Partial<BreedLook>): BreedLook => ({ ...FARM_LOOK, ...o });
export const BREED_LOOKS: Record<string, BreedLook> = {
  farm: FARM_LOOK,
  // fine, dense, crimped and compact: many small round locks, deep neck folds, a woolly cap on a creamy face
  merino: look({ locks: 1.3, lockR: 0.78, stretch: 0.8, body: 0.95, face: "#f1e6d3", faceDark: "#8a7565", wrinkle: 1, cap: 1 }),
  corriedale: look({ locks: 1.08, lockR: 0.95, stretch: 1.05, body: 1.03, face: "#efe4d2", cap: 0.4 }),
  // hardy hill sheep: a greyish face and legs, a touch sturdier and rangier
  perendale: look({ locks: 0.95, lockR: 1.05, stretch: 1.12, body: 0.99, legs: 1.04, face: "#cfc4b3", faceDark: "#5d4e47" }),
  // lustrous longwool: a big frame under long locks that hang in rows past the belly, a clean white face
  romney: look({ locks: 0.85, lockR: 1.1, stretch: 1.9, body: 1.07, face: "#f3ebdd", hang: 1 }),
  // hairy carpet wool: coarse spiky hair, a mane and forelock, rangy, tan face, big horns
  drysdale: look({ locks: 0.6, lockR: 1.05, stretch: 1.5, body: 1.03, legs: 1.06, face: "#b8a58d", faceDark: "#6d5a4b", tail: 1.2, hairy: 1, horn: 1.3 }),
  // Icelandic: smaller on shorter legs, a short dense under-coat with a long outer coat hanging over it, a fat tail
  icelandic: look({ locks: 0.95, lockR: 0.85, stretch: 1.1, body: 0.86, legs: 0.8, face: "#9a7d60", faceDark: "#5b4638", tail: 1.7, hang: 0.9, under: 1, horn: 1.15 }),
};
const hexOr = (c: string | null, d: string) => new THREE.Color(c ?? d);
/** The look of a sheep: its breed's, or a blend by `breedMix` weights (numbers by weight, face colours lerped). */
export function breedLook(w: WorldSheep): BreedLook {
  const mix = w.breedMix;
  if (!mix || mix.length < 2) return BREED_LOOKS[w.breed ?? "farm"] ?? FARM_LOOK;
  const out: BreedLook = { ...FARM_LOOK };
  const keys: (keyof BreedLook)[] = ["locks", "lockR", "stretch", "body", "legs", "tail", "wrinkle", "hang", "hairy", "under", "cap", "horn"];
  const tot = mix.reduce((a, m) => a + m.share, 0) || 1;
  for (const k of keys) (out[k] as number) = 0;
  const face = new THREE.Color(0, 0, 0), dark = new THREE.Color(0, 0, 0);
  for (const m of mix) {
    const l = BREED_LOOKS[m.breed] ?? FARM_LOOK, k = m.share / tot;
    for (const key of keys) (out[key] as number) += (l[key] as number) * k;
    face.r += hexOr(l.face, "#eadfce").r * k; face.g += hexOr(l.face, "#eadfce").g * k; face.b += hexOr(l.face, "#eadfce").b * k;
    dark.r += hexOr(l.faceDark, "#6a564d").r * k; dark.g += hexOr(l.faceDark, "#6a564d").g * k; dark.b += hexOr(l.faceDark, "#6a564d").b * k;
  }
  out.face = `#${face.getHexString()}`;
  out.faceDark = `#${dark.getHexString()}`;
  return out;
}

export function sheepKey(w: WorldSheep): string {
  return [
    w.id, w.fantasy ?? "", w.breed ?? "farm", (w.breedMix ?? []).map((m) => `${m.breed}${Math.round(m.share * 20)}`).join("+"), woolHex(w), w.pattern, w.horns, w.sex, w.adult ? 1 : 0,
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
  const legLen = (w.adult ? 0.47 : 0.52) * Math.sqrt(s) * breedLook(w).legs;
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
/** Pāua shimmer: three tints (teal, blue, violet) laid across the fleece by position. */
// Pāua shell: a deep navy ground with dark blue streaks, and thinner bands of teal, green and violet between them.
const PAUA_BASE = new THREE.Color("#22346e");
const PAUA_BANDS = ["#0b1238", "#1d3f9a", "#0e1a4a", "#17a3aa", "#0b1238", "#2b5bd0", "#35c98a", "#0e1a4a", "#8a4fd6", "#0b1238", "#1d3f9a", "#0e1a4a"].map((h) => new THREE.Color(h));
/** The pāua streak colour at a point on the fleece: wavy bands swept along the body, like the growth lines on the shell. */
function pauaStreak(x: number, y: number, z: number): THREE.Color {
  const t = (x * 2.2 + y * 1.4 + 0.7 * Math.sin(z * 3 + x * 2)) * 2.3;
  const i = Math.floor(t);
  return PAUA_BANDS[((i % PAUA_BANDS.length) + PAUA_BANDS.length) % PAUA_BANDS.length]!;
}
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const u0 = (L: number) => L / 0.62;
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
  // Rare wools (DESIGN-v3 §4) change the fleece itself: steel is gunmetal in tight curls, cloud is whiter and puffier,
  // glow-worm leans cool, pāua is deep navy with dark blue streaks and teal / green / violet bands like the shell, southerly locks are swept back.
  const fantasy = w.fantasy ?? "";
  if (fantasy === "steel") wool.lerp(new THREE.Color("#5d6672"), 0.9);
  else if (fantasy === "cloud") wool.lerp(new THREE.Color("#ffffff"), 0.7);
  else if (fantasy === "glow") wool.lerp(GLOW_DAY, 0.8);
  else if (fantasy === "paua") wool.lerp(PAUA_BASE, 0.85);
  const swept = fantasy === "southerly", paua = fantasy === "paua", steel = fantasy === "steel", cloud = fantasy === "cloud", glow = fantasy === "glow", poh = fantasy === "pohutukawa";
  // pōhutukawa blooms with the season: the controller blends the fleece toward crimson, so its redness says how far into summer we are
  const bloom = poh ? clamp(((wool.r - (wool.g + wool.b) / 2) - 0.1) / 0.4, 0, 1) : 0;
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
  const look0 = breedLook(w);
  const style = fleeceStyle();
  const look = look0;
  const lite = LOCKS < 40;
  let body: THREE.BufferGeometry;
  let glowDots: SheepGeos["glow"];
  if (style !== "0") {
    // experimental fleece styles (fleece.ts, `?fleece=a|b|c|d`)
    const u = L / 0.62;
    const f = buildFleece({
      rng, L, H, W, u, wool, spotHex, isSpot, look, curl, lite, bloom, pauaStreak,
      under: new THREE.Color(wool).multiplyScalar(1 - 0.16 * look.under), tip: new THREE.Color(wool).lerp(new THREE.Color("#fff6e4"), 0.18 * look.under),
      lockR: (0.1 - curl * 0.02) * ((L + H + W) / 1.37) * Math.sqrt(72 / LOCKS) * look.lockR,
      locks: Math.round(LOCKS * (0.85 + curl * 0.35) * look.locks),
      steel, cloud, glow, paua, poh, swept,
    }, style);
    body = smoothGeo(f.body);
    shadeByHeight(body, -H * 1.05, H * 0.9, cloud ? 0.9 : 0.8, 1.03);
    glowDots = f.glow;
  } else {
    const bb = new GeoBatch(0, rng);
    bb.ico(cloud ? "#b4c4e0" : paua ? "#0b1238" : steel ? "#4a525d" : look0.under > 0 ? new THREE.Color(wool).multiplyScalar(1 - 0.16 * look0.under) : wool, 1, 2, [0, 0, 0], [L, H, W]);
    const n = Math.round(LOCKS * (0.85 + curl * 0.35) * look.locks * (steel ? 0.95 : cloud ? 0.55 : glow ? 0.8 : poh ? 0.9 - 0.3 * bloom : 1));
    const lockR = (0.1 - curl * 0.02) * ((L + H + W) / 1.37) * Math.sqrt(72 / LOCKS) * look.lockR * (steel ? 0.85 : cloud ? 1.9 : 1);
    // Icelandic: the base layer is a short dense under-wool a shade darker than the long outer locks laid over it
    const under = new THREE.Color(wool).multiplyScalar(1 - 0.16 * look.under);
    const tip = new THREE.Color(wool).lerp(new THREE.Color("#fff6e4"), 0.18 * look.under);
    const nrm = (x: number, y: number, z: number) => new THREE.Vector3(x / L, y / H, z / W).normalize();
    const _z = new THREE.Vector3(0, 0, 1), _xAxis = new THREE.Vector3(1, 0, 0);
    const quatMat = (p: THREE.Vector3, q: THREE.Quaternion, sc: V3) => new THREE.Matrix4().compose(p, q, new THREE.Vector3(sc[0], sc[1], sc[2]));
    const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const wind = new THREE.Vector3(-1, -0.22, 0).normalize();
    // one unit spring (a round 2.2-turn coil standing along +z) copied for every steel ringlet
    const spring = steel ? springGeo(lite) : null;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = fib(i, n);
      if (y < -0.72) continue;
      _c.set(isSpot(x, y, z) ? spotHex : look.under > 0 ? under : wool).multiplyScalar(0.97 + rng() * 0.06);
      const r = lockR * (0.85 + rng() * 0.4);
      if (paua) {
        _c.lerp(pauaStreak(x, y, z), 0.92);
        _c.multiplyScalar(0.8 + rng() * 0.5);
      }
      if (glow) _c.copy(GLOW_BELLY).lerp(GLOW_DAY, smooth((y + 0.7) / 1.3)).multiplyScalar(0.96 + rng() * 0.08);
      const rot: V3 = [rng() * 3, rng() * 3, rng() * 3];
      if (steel) {
        // springy ringlets: a round coil standing out of the fleece and drooping a little, like a pulled curl
        const nv = nrm(x, y, z), ax = nv.clone().add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.4)).add(new THREE.Vector3(0, -0.3, 0)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(_z, ax);
        const bright = rng() < 0.3 ? 1.35 : 0.9 + rng() * 0.3;
        _c.set(rng() < 0.25 ? "#9eaabb" : "#5f6874").multiplyScalar(bright * (0.8 + 0.3 * smooth((y + 0.7) / 1.5)));
        const p = new THREE.Vector3(x * L * 0.97, y * H * 0.95, z * W * 0.97).addScaledVector(nv, -r * 0.2);
        // a dense gunmetal under-curl, then a springy coil standing out of it
        bb.ico(new THREE.Color("#4f5864").multiplyScalar(0.85 + rng() * 0.4).getHex(), r * 1.2, 0, [x * L * 0.97, y * H * 0.95, z * W * 0.97], [1, 1, 1], rot);
        if (i % 3 === 0) continue; // fewer, rounder coils than locks
        bb.add(spring!.clone(), _c.clone(), quatMat(p, q.multiply(new THREE.Quaternion().setFromAxisAngle(_z, rng() * 6.28)), [r * 0.75, r * 0.75, r * 0.8]));
        continue;
      }
      if (cloud) {
        // billowing puffs: bright tops, soft blue-grey undersides
        _c.set("#a9bbd8").lerp(new THREE.Color("#ffffff"), smooth((y + 0.6) / 1.2)).multiplyScalar(0.97 + rng() * 0.05);
        bb.ico(_c.getHex(), r, 1, [x * L * 1.0, y * H * 1.0, z * W * 1.0], [1.15, 0.92, 1.05], rot);
        continue;
      }
      if (swept) {
        // a southerly fleece: every lock combed long toward the tail and streaming back, as if leaning into a gale
        const nv = nrm(x, y, z), tv = wind.clone().addScaledVector(nv, -wind.dot(nv)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(_xAxis, tv);
        const len = 3.1 + rng() * 1.6;
        _c.lerp(new THREE.Color("#ffffff"), 0.12 * (0.5 - z * z));
        const p = new THREE.Vector3(x * L * 0.97, y * H * 0.95, z * W * 0.97).addScaledVector(tv, r * len * 0.32);
        bb.add(new THREE.IcosahedronGeometry(r * 0.8, 1), _c.getHex(), quatMat(p, q, [len, 0.58, 0.95]));
        continue;
      }
      bb.ico(_c.getHex(), r, 1, [x * L * 0.97, y * H * 0.95, z * W * 0.97], [1.2, (0.85 + curl * 0.2) * look.stretch, 1], rot);
    }
    if (steel) {
      // brushed-metal glints: a few bright catches on the coils
      for (let i = 0; i < 12; i++) {
        const [x, y, z] = fib(i * 5 + 2, 60);
        if (y < -0.2) continue;
        const nv = nrm(x, y, z), p = new THREE.Vector3(x * L, y * H, z * W).addScaledVector(nv, lockR * 0.9);
        bb.add(new THREE.OctahedronGeometry(lockR * (0.2 + rng() * 0.16), 0), "#f4f8ff", quatMat(p, new THREE.Quaternion(), [1, 1, 1]));
      }
    }
    if (cloud) {
      // big billows heaped on the back, and loose wisps trailing off the underside
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        bb.ico(new THREE.Color("#ffffff").multiplyScalar(0.97 + rng() * 0.04).getHex(), lockR * (1.15 + rng() * 0.35), 1,
          [L * (-0.55 + t * 1.0 + (rng() - 0.5) * 0.15), H * (0.92 + rng() * 0.12), (rng() - 0.5) * W * 0.8], [1.2, 0.9, 1.1], [rng() * 3, rng() * 3, rng() * 3]);
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rng() * 0.5, side = Math.sin(a) > 0 ? 1 : -1;
        bb.ico(new THREE.Color("#dbe6f8").lerp(new THREE.Color("#a9bbd8"), rng() * 0.6).getHex(), lockR * 0.7, 0,
          [Math.cos(a) * L * 0.9 - (rng() * 0.2) * L, -H * (0.5 + rng() * 0.2), side * W * (0.5 + rng() * 0.4)], [1.7, 0.5, 1], [0, rng() * 0.6 - 0.3, rng() * 0.4 - 0.2]);
      }
    }
    if (swept) {
      // loose wisps whipping off the rump and the back of the neck
      for (let i = 0; i < 9; i++) {
        const t = i / 8, side = (i % 2 ? 1 : -1) * (0.15 + rng() * 0.5);
        const p = new THREE.Vector3(-L * (0.95 + t * 0.55), H * (0.35 - t * 0.2 + (rng() - 0.5) * 0.35), side * W);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side * 0.25, -0.1 - rng() * 0.2));
        bb.add(new THREE.IcosahedronGeometry(lockR * (0.6 - t * 0.2), 0), new THREE.Color(wool).lerp(new THREE.Color("#ffffff"), 0.4).getHex(), quatMat(p, q, [4.2 - t, 0.3, 0.6]));
      }
    }
    if (glow) {
      // by day, tiny pale and teal flecks dotted through the fleece
      for (let i = 0; i < 26; i++) {
        const [x, y, z] = fib(i * 3 + 1, 80);
        if (y < -0.5) continue;
        const nv = nrm(x, y, z), p = new THREE.Vector3(x * L, y * H, z * W).addScaledVector(nv, lockR * 0.8);
        bb.add(new THREE.OctahedronGeometry(lockR * (0.16 + rng() * 0.1), 0), i % 3 ? "#38b4a2" : "#f2fffb", quatMat(p, new THREE.Quaternion(), [1, 1, 1]));
      }
    }
    if (paua) {
      // small flat chips of nacre lying flush on the locks, where the shell catches the light
      for (let i = 0; i < 16; i++) {
        const [x, y, z] = fib(i * 4 + 1, 64);
        if (y < -0.35) continue;
        const nv = nrm(x, y, z), p = new THREE.Vector3(x * L * 0.97, y * H * 0.95, z * W * 0.97).addScaledVector(nv, lockR * 0.98);
        pauaChip(bb, p, nv, lockR * (0.2 + rng() * 0.1), PAUA_NACRE[i % PAUA_NACRE.length]!, rng);
      }
    }
    if (poh) {
      // stamens: spiky brush tufts of crimson with golden tips, thick in summer and only buds in winter
      const tufts = Math.round((lite ? 0.7 : 1) * (4 + 20 * bloom));
      const len0 = (0.1 + 0.1 * bloom) * u0(L);
      for (let i = 0; i < tufts; i++) {
        const [x, y, z] = fib(i * 2 + 1, tufts * 2 + 2);
        if (y < -0.35) continue;
        const nv = nrm(x, y, z), base = new THREE.Vector3(x * L * 0.98, y * H * 0.98, z * W * 0.98);
        const blossom = bloom > 0.3;
        const arms = lite ? 3 : 4;
        for (let k = 0; k < arms; k++) {
          const a = (k / arms) * Math.PI * 2 + rng(), spread = 0.55 + rng() * 0.25;
          const side = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).cross(nv).normalize();
          const dirV = nv.clone().multiplyScalar(Math.cos(spread)).addScaledVector(side, Math.sin(spread)).normalize();
          const len = len0 * (0.8 + rng() * 0.5);
          const q = new THREE.Quaternion().setFromUnitVectors(_up, dirV);
          const pos = base.clone().addScaledVector(dirV, len * 0.5);
          bb.add(new THREE.ConeGeometry(len * 0.1, len, 3, 1, true), new THREE.Color(blossom ? "#d4163c" : "#7a1f2c").multiplyScalar(0.85 + rng() * 0.35).getHex(), quatMat(pos, q, [1, 1, 1]));
          if (blossom) bb.add(new THREE.OctahedronGeometry(len * 0.11, 0), "#ffd36a", quatMat(base.clone().addScaledVector(dirV, len), new THREE.Quaternion(), [1, 1, 1]));
        }
      }
    }
    spring?.dispose();
    // rump and breast fullness, a woolly neck carrying the head forward, a short docked tail
    const woolAt = (x: number, y: number, z: number) => (isSpot(x, y, z) ? spotHex : wool);
    bb.ico(woolAt(-1, 0.1, 0), 0.3 * (L / 0.62), 2, [-L * 0.62, H * 0.12, 0], [1, 1.02, 1.08]);
    bb.ico(woolAt(1, 0.3, 0), 0.26 * (L / 0.62), 2, [L * 0.7, H * 0.3, 0], [1, 1.1, 0.95]);
    bb.ico(wool, 0.2 * (L / 0.62), 2, [L * 0.98, H * 0.72, 0], [1.15, 1.1, 0.82]);
    bb.ico(wool, 0.1 * (L / 0.62) * look.tail, 1, [-L * 1.05, H * 0.18, 0], [0.9, 1.3, 0.9]);
    const u = L / 0.62;
    // Merino: a few small skin folds on the neck, just behind the head: short ridges of wool wrapped round the neck
    // (never over the back) with a darker crease behind each. Kept small so they read as folds, not lumps.
    if (look.wrinkle > 0.05) {
      const ridge = Math.max(2, Math.round(3 * look.wrinkle)), crease = new THREE.Color(wool).multiplyScalar(0.72).getHex();
      for (let i = 0; i < ridge; i++) {
        // from the shoulder-front forward to the head, stepping slightly down the neck's slope
        const xi = L * (0.9 + i * 0.075), yi = H * (0.62 - i * 0.045), rr = 0.045 * u, half = W * 0.5;
        bb.ico(crease, rr, 1, [xi - 0.05 * u, yi - 0.015 * u, 0], [0.45, 0.8, half / rr * 0.9], [0, 0, -0.35]);
        bb.ico(woolAt(1, 0.5, 0), rr * 1.1, 1, [xi, yi + 0.012 * u, 0], [0.6, 0.85, half / (rr * 1.1)], [0, 0, -0.35]);
      }
      bb.ico(wool, 0.12 * u, 1, [L * 1.0, H * 0.18, 0], [0.8, 1.1, 0.9]);
    }
    // Romney / Icelandic outer coat: long locks hanging in rows from the shoulder, flank and rump
    if (look.hang > 0.05) {
      const rows = lite ? 2 : 3, per = Math.round(10 * look.hang * (lite ? 0.8 : 1));
      for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) {
        const a = ((i + (r % 2) * 0.5) / per) * Math.PI * 2;
        const x = Math.cos(a) * L * 0.9, z = Math.sin(a) * W * 0.9;
        if (Math.abs(z) < 0.15 * W) continue; // keep the spine and belly line clean
        const topY = H * (0.4 - r * 0.32), len = (0.27 + 0.08 * r + rng() * 0.06) * u * look.hang;
        _c.set(isSpot(x / L, 0, z / W) ? spotHex : look.under > 0 ? tip : wool).multiplyScalar(0.94 + rng() * 0.1);
        bb.ico(_c.getHex(), len * 0.5, 0, [x * 0.98, topY - len * 0.4, z * 1.02], [0.55, 1, 0.7], [0, a, (rng() - 0.5) * 0.25]);
      }
    }
    // Drysdale: coarse hair, spiky guard hairs standing out from the fleece, a shaggy mane along the neck
    if (look.hairy > 0.05) {
      const k = Math.round((lite ? 26 : 44) * look.hairy);
      for (let i = 0; i < k; i++) {
        const [x, y, z] = fib(i * 3 + 1, k * 3);
        if (y < -0.45) continue;
        _dir.set(x * L, y * H, z * W).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(_up, _dir);
        const len = (0.15 + rng() * 0.12) * u;
        const col = new THREE.Color(wool).multiplyScalar(0.8 + rng() * 0.35);
        const pos = new THREE.Vector3(x * L, y * H, z * W).addScaledVector(_dir, len * 0.45);
        bb.add(new THREE.ConeGeometry(0.035 * u, len, 4), col, new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)));
      }
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        bb.ico(new THREE.Color(wool).multiplyScalar(0.85 + rng() * 0.2).getHex(), 0.07 * u, 0, [L * (0.35 + t * 0.7), H * (0.95 + t * 0.12), 0], [0.9, 1.9, 0.9], [0, 0, 0.5 - t * 0.9]);
      }
    }
    body = smoothGeo(bb.build()!);
    shadeByHeight(body, -H * 1.05, H * 0.9, cloud ? 0.9 : 0.8, 1.03);
    // glow-worm cave: pinpoint lights across the fleece (two sets that twinkle out of step) and a few silk threads of beads hanging below
    if (glow) {
      const ga = new GeoBatch(0, rng), gb = new GeoBatch(0, rng);
      const dot = (b: GeoBatch, p: THREE.Vector3, r: number) => b.add(new THREE.OctahedronGeometry(r, 0), "#ffffff", new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
      const cnt = lite ? 56 : 104;
      for (let i = 0; i < cnt; i++) {
        const [x, y, z] = fib(i, cnt);
        if (y < -0.55) continue;
        const nv = new THREE.Vector3(x / L, y / H, z / W).normalize();
        dot(i % 2 ? ga : gb, new THREE.Vector3(x * L, y * H, z * W).addScaledVector(nv, lockR * 1.05), lockR * (0.22 + rng() * 0.14));
      }
      for (let t = 0; t < 4; t++) {
        const bx = L * (-0.5 + t * 0.34), bz = (t % 2 ? 1 : -1) * W * (0.45 + rng() * 0.25), by = -H * 0.82;
        for (let k = 0; k < 4; k++) dot(k % 2 ? ga : gb, new THREE.Vector3(bx, by - k * lockR * 1.3, bz), lockR * (0.24 - k * 0.02));
      }
      glowDots = { a: ga.build()!, b: gb.build()! };
    }
  }

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
  // a woolly cap and cheek ruffs on woolly breeds (Merino most); Drysdale gets a coarse forelock
  if (look.cap > 0.05) {
    const c = look.cap;
    hico(wool, 0.085 * (0.8 + 0.4 * c), 1, [0.06, 0.11, 0], [1.2, 0.85, 1.4]);
    hico(wool, 0.055, 1, [0.13, 0.11, 0.05 * c + 0.02]);
    hico(wool, 0.055, 1, [0.13, 0.11, -0.05 * c - 0.02]);
    for (const side of [1, -1]) hico(wool, 0.07, 1, [0.04, -0.06, side * 0.1 * c + side * 0.02], [1.1, 0.9, 0.8]);
  }
  if (look.hairy > 0.05) {
    hico(new THREE.Color(wool).multiplyScalar(0.82), 0.08, 0, [0.15, 0.14, 0], [1.4, 1.2, 0.6], [0, 0, -0.5]);
    hico(new THREE.Color(wool).multiplyScalar(0.9), 0.07, 0, [0.0, 0.17, 0.05], [0.8, 1.8, 0.7], [0, 0, 0.3]);
    hico(new THREE.Color(wool).multiplyScalar(0.9), 0.07, 0, [0.0, 0.17, -0.05], [0.8, 1.8, 0.7], [0, 0, 0.3]);
  }
  // a faint pale patch round each soft eye
  const patch = faceC.clone().lerp(new THREE.Color("#f4e8da"), 0.22);
  for (const side of [1, -1]) hico(patch, 0.064, 1, [0.138, 0.042, side * 0.106], [1.1, 1.05, 0.55], [0, side * 0.35, 0]);
  if (w.horns === "horned") {
    const ram = w.sex === "ram" && w.adult;
    const hk = look.horn, R = (ram ? 0.13 : 0.085) * hk, turn = ram ? Math.PI * 1.8 : Math.PI * 1.35, segs = ram ? 12 : 9;
    const r0 = (ram ? 0.05 : 0.036) * Math.sqrt(hk), r1 = (ram ? 0.022 : 0.018) * Math.sqrt(hk);
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
  return { key: sheepKey(w), body, head, dims: d, parts, glow: glowDots };
}

export function disposeGeos(g: SheepGeos): void {
  g.body.dispose();
  g.head.dispose();
  g.glow?.a.dispose();
  g.glow?.b.dispose();
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

/** A soft room environment map for the metallic and iridescent wools; null where the renderer can't make one. */
export function makeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture | null {
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pm.fromScene(room, 0.04).texture;
    room.dispose();
    pm.dispose();
    return env;
  } catch {
    return null;
  }
}

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

  /**
   * Rare wool materials (DESIGN-v3 §4), shared by every sheep that shows that wool: steel is metallic (reflecting the room
   * environment when there is one), glow-worm is emissive (its glow follows the night), pāua is iridescent, cloud is a touch
   * luminous. Pōhutukawa and southerly use the ordinary wool (their look is in the colour and the shape).
   */
  readonly steel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.85, emissive: "#1a2029", emissiveIntensity: 0.3 });
  readonly glow = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, emissive: "#06302d", emissiveIntensity: 0.1 });
  /** glow-worm pinpoint lights: two sets that twinkle out of step, fading in with the dark */
  readonly glowDotA = new THREE.MeshBasicMaterial({ color: "#6dffd8", transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
  readonly glowDotB = new THREE.MeshBasicMaterial({ color: "#8fe8ff", transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
  /** the soft shadow a floating cloud sheep casts on the grass */
  readonly softShadow = new THREE.MeshBasicMaterial({ color: "#1d2a3a", transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  readonly softShadowGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  readonly paua = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.15, iridescence: 1, iridescenceIOR: 2.0, iridescenceThicknessRange: [220, 820], clearcoat: 0.4, clearcoatRoughness: 0.18, emissive: "#6a7fd8", emissiveIntensity: 0.08 });
  readonly cloud = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0, emissive: "#dff0ff", emissiveIntensity: 0.16 });

  constructor() {
    this.wool = [0.62, 0.8, 0.96].map(
      (roughness) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 }),
    );
    // experimental fleece styles c and d draw the wool texture in the shader
    for (const m of [...this.wool, this.glow, this.cloud]) patchWoolMaterial(m, fleeceStyle());
  }

  /**
   * Where the room environment steel and pāua reflect comes from (the owner's renderer makes it). It is built the first time a
   * steel or pāua sheep is drawn, so a farm without them never pays for it; absent, those wools still shade with the lights.
   */
  private envSource: (() => THREE.Texture | null) | null = null;
  private env: THREE.Texture | null = null;
  setEnvironmentSource(make: () => THREE.Texture | null): void {
    this.envSource = make;
  }
  private ensureEnvironment(): void {
    const make = this.envSource;
    if (!make) return;
    this.envSource = null;
    this.env = make();
    for (const m of [this.steel, this.paua]) { m.envMap = this.env; m.envMapIntensity = m === this.steel ? 1.5 : 0.5; m.needsUpdate = true; }
  }

  /** Which animated rare materials have been handed out (a farm without glow-worm or pāua wool pays nothing per frame). */
  private inUse = { glow: false, paua: false };

  /** Per frame: the glow-worm fleece brightens as it gets dark, and pāua slowly shifts its colours. */
  update(time: number, night: number): void {
    if (this.inUse.glow) {
      this.glow.emissiveIntensity = 0.1 + 0.55 * night + Math.sin(time * 1.3) * 0.04 * night;
      const k = Math.min(1, night * 1.5);
      this.glowDotA.opacity = k * (0.7 + 0.3 * Math.sin(time * 1.7));
      this.glowDotB.opacity = k * (0.7 + 0.3 * Math.sin(time * 2.3 + 2));
      this.glowDotA.visible = this.glowDotA.opacity > 0.02; this.glowDotB.visible = this.glowDotB.opacity > 0.02;
    }
    if (this.inUse.paua) {
      const r = this.paua.iridescenceThicknessRange;
      r[0] = 220 + Math.sin(time * 0.8) * 140; r[1] = 820 + Math.cos(time * 0.6) * 160;
      this.paua.emissive.setHSL((0.55 + 0.12 * Math.sin(time * 0.5)) % 1, 0.55, 0.6);
    }
  }

  /** The material for a rare wool, or null for the ordinary wool of the sheep's fineness. */
  fantasyFor(id: string | undefined): THREE.MeshStandardMaterial | null {
    if (id === "glow") this.inUse.glow = true;
    else if (id === "paua") this.inUse.paua = true;
    return id === "steel" ? this.steel : id === "glow" ? this.glow : id === "paua" ? this.paua : id === "cloud" ? this.cloud : null;
  }

  woolFor(fineness: number, fantasy?: string): THREE.MeshStandardMaterial {
    const rare = this.fantasyFor(fantasy);
    if (rare) {
      if (fantasy === "steel" || fantasy === "paua") this.ensureEnvironment();
      return rare;
    }
    const f = num(fineness, 26);
    return this.wool[f < 21 ? 0 : f < 28 ? 1 : 2]!;
  }

  dispose(): void {
    for (const m of this.wool) m.dispose();
    for (const m of [this.steel, this.glow, this.paua, this.cloud]) m.dispose();
    for (const m of [this.glowDotA, this.glowDotB, this.softShadow]) m.dispose();
    this.softShadowGeo.dispose();
    this.env?.dispose();
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
  /** cloud wool: the soft contact shadow under the floating sheep (root space) */
  shadow?: THREE.Mesh | undefined;
}

/** World rig: merged body + head; legs, ears and eyes are drawn by the flock's instanced parts. */
export function buildRig(geos: SheepGeos, w: WorldSheep, mats: SheepMaterials, shadows: boolean): SheepRig {
  const d = geos.dims;
  const root = new THREE.Group();
  root.scale.setScalar(d.rootScale);
  const bob = new THREE.Group();
  root.add(bob);
  const body = new THREE.Mesh(geos.body, mats.woolFor(w.fineness, w.fantasy));
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
  if (geos.glow) {
    const a = new THREE.Mesh(geos.glow.a, mats.glowDotA), b = new THREE.Mesh(geos.glow.b, mats.glowDotB);
    for (const m of [a, b]) { m.raycast = () => {}; m.frustumCulled = false; body.add(m); }
  }
  let shadow: THREE.Mesh | undefined;
  if (w.fantasy === "cloud") {
    shadow = new THREE.Mesh(mats.softShadowGeo, mats.softShadow);
    shadow.scale.set(d.L * 1.15, 1, d.W * 1.5);
    shadow.position.set(0, 0.03, 0);
    shadow.raycast = () => {};
    root.add(shadow);
  }
  return { root, bob, body, outline, headPivot, pick, markerAnchor, shadow };
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
  if (rig.shadow) rig.shadow.visible = false;
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
