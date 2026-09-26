// Sheep behaviour: a small state machine per sheep (wander, graze, look about,
// nuzzle, follow, greet the camera, sleep) plus the pose it produces each frame.
// Cosmetic only, so Math.random is fine here; under reduced motion nothing
// steps and poses are computed statically.
import * as THREE from "three";
import type { MarkerKind } from "./markers.js";
import type { Rect } from "./farm.js";
import { EAR_REST, restPose, type SheepGeos, type SheepPose, type SheepRig } from "./sheepMesh.js";
import type { Personality, WorldSheep, Zone } from "./types.js";

export type Mode = "idle" | "walk" | "graze" | "nuzzle" | "attend";

export interface Ent {
  ws: WorldSheep;
  key: string;
  geos: SheepGeos;
  rig: SheepRig;
  zone: Zone;
  personality: Personality;
  x: number;
  z: number;
  heading: number;
  tx: number;
  tz: number;
  mode: Mode;
  timer: number;
  phase: number;
  radius: number;
  spawn: number; // <0 = done, else seconds since spawn
  removing: number; // <0 = alive, else seconds since removal
  marker: THREE.Mesh | null;
  markerKind: MarkerKind | null;
  ring: THREE.Mesh | null;
  selected: boolean;
  // animation state
  pose: SheepPose;
  faceColor: THREE.Color;
  speed: number;
  turnRate: number;
  stride: number;
  pitch: number;
  yaw: number;
  roll: number;
  /** seconds into a hop, or -1 */
  hop: number;
  hopDur: number;
  hopH: number;
  /** backwards drift during a flinch hop */
  hopBack: number;
  /** seconds since the last landing (wool jiggle), large = settled */
  landed: number;
  fold: number;
  blinkIn: number;
  blinkT: number;
  earT: [number, number];
  earIn: number;
  /** walking with little skips (lambs) */
  skip: boolean;
  nuzzle: Ent | null;
  /** seconds since attention started, or -1 */
  attendT: number;
  /** a point to glance at while idle (x, z) */
  look: [number, number] | null;
}

export interface FlockCtx {
  time: number;
  night: number;
  attended: Ent | null;
  ents: Iterable<Ent>;
  insetRect(zone: Zone, r: number): Rect;
  puff(x: number, z: number, n: number, size?: number): void;
}

/** Fondness at or above this: the sheep seeks you out (comes to the front, follows the sheep you visit). */
export const FOND_TRUSTING = 60;
/** Below this: skittish, it keeps its distance and backs away from a fuss. */
export const FOND_SKITTISH = 20;

export function fondOf(e: Ent): number {
  const f = e.ws.fondness;
  return typeof f === "number" && Number.isFinite(f) ? f : 30;
}

/** Heading that faces the isometric camera (which looks from +x +z). */
export const FACE_CAMERA = -Math.PI / 4;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const rnd = (a: number, b: number) => a + (b - a) * Math.random();
const approach = (cur: number, to: number, k: number) => cur + (to - cur) * k;

interface Temper { reach: number; speed: number; graze: number; idle: number; nuzzle: number }
const TEMPER: Record<Personality, Temper> = {
  shy: { reach: 2.4, speed: 0.5, graze: 0.45, idle: 0.3, nuzzle: 0.02 },
  calm: { reach: 3, speed: 0.5, graze: 0.5, idle: 0.25, nuzzle: 0.08 },
  curious: { reach: 4, speed: 0.62, graze: 0.3, idle: 0.3, nuzzle: 0.1 },
  bold: { reach: 6.5, speed: 0.72, graze: 0.3, idle: 0.2, nuzzle: 0.08 },
};

export function newAnimState(): Pick<Ent, "pose" | "speed" | "turnRate" | "stride" | "pitch" | "yaw" | "roll" | "hop" | "hopDur" | "hopH" | "hopBack" | "landed" | "fold" | "blinkIn" | "blinkT" | "earT" | "earIn" | "skip" | "nuzzle" | "attendT" | "look"> {
  return {
    pose: restPose(), speed: 0, turnRate: 0, stride: 0, pitch: 0, yaw: 0, roll: 0,
    hop: -1, hopDur: 0.5, hopH: 0.3, hopBack: 0, landed: 99, fold: 0,
    blinkIn: rnd(1, 4), blinkT: -1, earT: [-1, -1], earIn: rnd(2, 7), skip: false, nuzzle: null, attendT: -1, look: null,
  };
}

export function startHop(e: Ent, h: number, dur: number, back = 0): void {
  if (e.hop >= 0) return;
  e.hop = 0;
  e.hopH = h;
  e.hopDur = dur;
  e.hopBack = back;
}

export function flickEars(e: Ent, which: 0 | 1 | 2 = 2): void {
  if (which !== 1) e.earT[0] = 0;
  if (which !== 0) e.earT[1] = 0;
}

function sameZone(a: Ent, b: Ent): boolean {
  return a.zone === b.zone && b.removing < 0;
}

function dist(a: Ent, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function walkTo(e: Ent, x: number, z: number, ctx: FlockCtx, skip = false): void {
  const r = ctx.insetRect(e.zone, e.radius);
  e.tx = clamp(x, r.x0, r.x1);
  e.tz = clamp(z, r.z0, r.z1);
  e.mode = "walk";
  e.timer = 10;
  e.skip = skip;
}

function findDam(e: Ent, ctx: FlockCtx): Ent | null {
  const dam = e.ws.dam;
  if (!dam || e.ws.adult) return null;
  for (const o of ctx.ents) if (o.ws.id === dam && sameZone(e, o)) return o;
  return null;
}

function choose(e: Ent, ctx: FlockCtx): void {
  const T = TEMPER[e.personality];
  e.look = null;
  e.skip = false;
  // Lambs stay close to mum, skipping to catch up.
  const dam = findDam(e, ctx);
  if (dam && dist(e, dam) > 2.4) {
    const a = Math.random() * Math.PI * 2;
    walkTo(e, dam.x + Math.cos(a) * 1.3, dam.z + Math.sin(a) * 1.3, ctx, true);
    return;
  }
  // Curious sheep, and sheep that are fond of you, come over to see who's getting attention.
  const att = ctx.attended;
  const fond = fondOf(e);
  if ((e.personality === "curious" || fond >= FOND_TRUSTING) && fond >= FOND_SKITTISH && att && att !== e && sameZone(e, att)) {
    const d = dist(e, att);
    if (d > 2.6) {
      const k = (d - 1.9) / d;
      walkTo(e, e.x + (att.x - e.x) * k, e.z + (att.z - e.z) * k, ctx);
    } else {
      e.mode = "idle"; e.timer = rnd(2, 4); e.look = [att.x, att.z];
    }
    return;
  }
  const r = Math.random();
  if (r < T.graze) { e.mode = "graze"; e.timer = rnd(3, 8); return; }
  if (r < T.graze + T.idle) {
    e.mode = "idle"; e.timer = rnd(2, 5);
    // glance at a neighbour now and then
    if (Math.random() < 0.4) {
      for (const o of ctx.ents) if (o !== e && sameZone(e, o) && dist(e, o) < 4) { e.look = [o.x, o.z]; break; }
    }
    return;
  }
  if (Math.random() < T.nuzzle * 3 && e.ws.adult) {
    let best: Ent | null = null, bd = 4;
    for (const o of ctx.ents) {
      if (o === e || !sameZone(e, o) || o.mode === "nuzzle" || o.mode === "attend" || o.fold > 0.1 || o.nuzzle) continue;
      const d = dist(e, o);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) {
      const d = Math.max(0.01, bd);
      const gap = (e.radius + best.radius) * 0.8;
      walkTo(e, best.x + ((e.x - best.x) / d) * gap, best.z + ((e.z - best.z) / d) * gap, ctx);
      e.nuzzle = best;
      best.nuzzle = e;
      best.mode = "idle";
      best.timer = 6;
      best.look = [e.x, e.z];
      return;
    }
  }
  const rect = ctx.insetRect(e.zone, e.radius);
  if (e.personality === "shy" || (fond < FOND_SKITTISH && Math.random() < 0.6)) {
    // keep to the fence line
    const edge = Math.floor(Math.random() * 4);
    const ux = rect.x0 + (rect.x1 - rect.x0) * Math.random(), uz = rect.z0 + (rect.z1 - rect.z0) * Math.random();
    const px = edge === 0 ? rect.x0 : edge === 1 ? rect.x1 : ux;
    const pz = edge === 2 ? rect.z0 : edge === 3 ? rect.z1 : uz;
    const k = Math.min(1, T.reach / Math.max(0.1, Math.hypot(px - e.x, pz - e.z)));
    walkTo(e, e.x + (px - e.x) * k, e.z + (pz - e.z) * k, ctx);
    return;
  }
  if ((e.personality === "bold" && Math.random() < 0.3) || (fond >= FOND_TRUSTING && Math.random() < 0.3)) {
    // saunter to the front of the field, towards the camera
    walkTo(e, rect.x1 - Math.random() * 2, rect.z1 - Math.random() * 2, ctx);
    return;
  }
  walkTo(e, e.x + (Math.random() - 0.5) * 2 * T.reach, e.z + (Math.random() - 0.5) * 2 * T.reach, ctx, !e.ws.adult && Math.random() < 0.6);
}

function turnToward(e: Ent, desired: number, dt: number, rate = 3): number {
  const turn = wrapAngle(desired - e.heading);
  const want = clamp(turn * rate, -2.6, 2.6);
  e.turnRate = approach(e.turnRate, want, 1 - Math.exp(-dt * 10));
  e.heading += e.turnRate * dt;
  return turn;
}

/** Advance one sheep by dt seconds. */
export function stepSheep(e: Ent, dt: number, ctx: FlockCtx): void {
  const t = ctx.time + e.phase;
  const kSmooth = 1 - Math.exp(-dt * 6);
  let pitch = 0, yaw = 0, roll = 0, speedTo = 0;

  // blinking and ear flicks
  if (e.blinkT >= 0) { e.blinkT += dt; if (e.blinkT > 0.16) e.blinkT = -1; }
  else if ((e.blinkIn -= dt) <= 0) { e.blinkT = 0; e.blinkIn = Math.random() < 0.2 ? 0.25 : rnd(2, 5.5); }
  for (let i = 0; i < 2; i++) if (e.earT[i]! >= 0) { e.earT[i]! += dt; if (e.earT[i]! > 0.35) e.earT[i] = -1; }
  if ((e.earIn -= dt) <= 0) { flickEars(e, Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? 1 : 2); e.earIn = rnd(2.5, 9); }

  // hops
  if (e.hop >= 0) {
    e.hop += dt;
    if (e.hopBack) {
      e.x -= Math.cos(e.heading) * e.hopBack * dt;
      e.z += Math.sin(e.heading) * e.hopBack * dt;
    }
    if (e.hop >= e.hopDur) {
      e.hop = -1;
      e.landed = 0;
      const s = e.geos.dims.rootScale;
      ctx.puff(e.x, e.z, e.hopH > 0.25 ? 6 : 4, 0.7 * s);
    }
  }
  e.landed += dt;

  // bedtime: lie down, staggered through the flock
  const sleepy = ctx.night > 0.25 + (e.phase % 1) * 0.35;
  e.fold = approach(e.fold, sleepy ? 1 : 0, 1 - Math.exp(-dt * (sleepy ? 2.2 : 3)));
  if (sleepy || e.fold > 0.04) {
    e.mode = "idle";
    e.timer = 0.5 + Math.random();
    e.nuzzle = null;
    e.speed = approach(e.speed, 0, kSmooth);
    pitch = -0.45 * e.fold; yaw = 0.35 * e.fold * Math.sin(e.phase); roll = 0.15 * e.fold;
    e.pitch = approach(e.pitch, pitch, kSmooth);
    e.yaw = approach(e.yaw, yaw, kSmooth);
    e.roll = approach(e.roll, roll, kSmooth);
    return;
  }

  // attention: greet the camera
  if (ctx.attended === e) {
    if (e.attendT < 0) e.attendT = 0;
    e.attendT += dt;
    e.mode = "attend";
    e.nuzzle = null;
    const turn = turnToward(e, FACE_CAMERA, dt, 5);
    e.stride += Math.abs(e.turnRate) * dt * 2.2;
    const a = e.attendT;
    const P = e.personality;
    if (a < 0.4) { pitch = 0.18; }
    else {
      const tilt = P === "curious" ? 0.32 : P === "shy" ? -0.22 : P === "bold" ? 0.12 : 0.18;
      roll = tilt * (0.8 + 0.2 * Math.sin(t * 1.3));
      pitch = P === "shy" ? -0.12 : P === "bold" ? 0.2 : 0.06 + 0.04 * Math.sin(t * 1.7);
      yaw = 0.12 * Math.sin(t * 0.8);
      if (P === "calm" && a > 0.5 && a < 1.3) pitch = 0.06 + 0.16 * Math.sin((a - 0.5) * Math.PI * 2.5); // slow nod
    }
    e.speed = approach(e.speed, 0, kSmooth);
    if (Math.abs(turn) < 0.3 && e.landed > 1.2 && e.hop < 0 && a > 5 && Math.random() < dt * 0.12) {
      flickEars(e);
      startHop(e, 0.16, 0.34);
    }
    e.pitch = approach(e.pitch, pitch, kSmooth);
    e.yaw = approach(e.yaw, yaw, kSmooth);
    e.roll = approach(e.roll, roll, 1 - Math.exp(-dt * 4));
    return;
  }
  if (e.attendT >= 0) { e.attendT = -1; e.mode = "idle"; e.timer = rnd(0.8, 2); }

  e.timer -= dt;
  if (e.timer <= 0 && e.hop < 0) choose(e, ctx);

  const T = TEMPER[e.personality];
  if (e.mode === "walk") {
    const dx = e.tx - e.x, dz = e.tz - e.z;
    const d = Math.hypot(dx, dz);
    const partner = e.nuzzle;
    if (d < 0.2 || (partner && dist(e, partner) < (e.radius + partner.radius) * 0.95)) {
      if (partner) {
        e.mode = "nuzzle"; e.timer = rnd(2.2, 3.4);
        partner.mode = "nuzzle"; partner.timer = e.timer;
      } else { e.mode = "idle"; e.timer = rnd(1, 3); }
    } else {
      const turn = turnToward(e, Math.atan2(-dz, dx), dt);
      const cos = Math.max(0, Math.cos(turn));
      speedTo = (e.ws.adult ? T.speed : T.speed * 1.35) * cos * cos * clamp(d / 0.8, 0.35, 1);
      if (e.skip && e.hop < 0 && e.landed > 0.25 && Math.random() < dt * 2.2) startHop(e, 0.22, 0.32);
    }
    pitch = -0.06 + 0.04 * Math.sin(e.stride * 2);
  } else if (e.mode === "graze") {
    // head down, chewing, with the odd look up
    const up = Math.sin(t * 0.37) > 0.93;
    pitch = up ? 0.05 : -0.85 + 0.06 * Math.sin(t * 11) ;
    yaw = up ? 0.3 * Math.sin(t * 0.5) : 0.1 * Math.sin(t * 0.9);
    roll = up ? 0 : 0.03 * Math.sin(t * 5.5);
  } else if (e.mode === "nuzzle") {
    const p = e.nuzzle;
    if (!p || p.removing >= 0 || p.fold > 0.1 || p.mode === "attend") { e.nuzzle = null; e.mode = "idle"; e.timer = 1; }
    else {
      const face = Math.atan2(-(p.z - e.z), p.x - e.x);
      const turn = turnToward(e, face, dt, 3);
      speedTo = 0;
      yaw = clamp(turn, -0.6, 0.6);
      pitch = -0.25 + 0.12 * Math.sin(t * 4.2);
      roll = 0.12 * Math.sin(t * 2.1);
      if (e.timer <= 0.05) { e.nuzzle = null; if (p.nuzzle === e) p.nuzzle = null; }
    }
  } else {
    // idle: look about, or at something
    if (e.look) {
      const face = Math.atan2(-(e.look[1] - e.z), e.look[0] - e.x);
      yaw = clamp(wrapAngle(face - e.heading), -0.9, 0.9);
    } else yaw = 0.45 * Math.sin(t * 0.45) + 0.15 * Math.sin(t * 1.9);
    pitch = 0.06 * Math.sin(t * 1.3);
    roll = 0.05 * Math.sin(t * 0.7);
    e.turnRate = approach(e.turnRate, 0, kSmooth);
  }
  e.speed = approach(e.speed, speedTo, 1 - Math.exp(-dt * 4));
  if (e.speed > 0.01) {
    e.x += Math.cos(e.heading) * e.speed * dt;
    e.z -= Math.sin(e.heading) * e.speed * dt;
    e.stride += e.speed * dt * (e.ws.adult ? 9 : 12);
  } else if (Math.abs(e.turnRate) > 0.3) {
    e.stride += Math.abs(e.turnRate) * dt * 2; // shuffle while turning on the spot
  }
  e.pitch = approach(e.pitch, pitch, kSmooth);
  e.yaw = approach(e.yaw, yaw, kSmooth);
  e.roll = approach(e.roll, roll, kSmooth);
}

/** Write e.pose from the animation state. `still` = reduced motion (static poses). */
export function computePose(e: Ent, time: number, still: boolean): SheepPose {
  const p = e.pose;
  const t = time + e.phase;
  if (still) {
    const lie = e.fold > 0.5;
    p.bob = 0; p.breathe = 0; p.squash = 1; p.bodyRoll = 0; p.bodyPitch = 0; p.wobble = 0;
    p.headPitch = lie ? -0.45 : e.mode === "attend" ? 0.06 : 0;
    p.headYaw = 0; p.headRoll = e.mode === "attend" ? 0.2 : lie ? 0.15 : 0;
    p.legs[0] = p.legs[1] = p.legs[2] = p.legs[3] = 0;
    p.fold = lie ? 1 : 0;
    p.earDroop[0] = p.earDroop[1] = lie ? 0.85 : EAR_REST;
    p.earSweep[0] = p.earSweep[1] = 0;
    p.blink = lie ? 1 : 0;
    return p;
  }
  const walk = clamp(e.speed / 0.55, 0, 1);
  const shuffle = e.speed < 0.05 && Math.abs(e.turnRate) > 0.3 ? 0.35 : 0;
  const amp = 0.5 * Math.max(walk, shuffle);
  const s = Math.sin(e.stride);
  p.legs[0] = s * amp; p.legs[3] = s * amp;
  p.legs[1] = -s * amp; p.legs[2] = -s * amp;
  let hopY = 0, squash = 1, bodyPitch = 0;
  if (e.hop >= 0) {
    const u = clamp(e.hop / e.hopDur, 0, 1);
    hopY = 4 * e.hopH * u * (1 - u);
    squash = 1 + 0.12 * Math.sin(u * Math.PI);
    bodyPitch = 0.18 * Math.cos(u * Math.PI) * (e.hopH > 0.2 ? 1 : 0.6);
    // tuck the legs in the air
    const tuck = Math.sin(u * Math.PI) * 0.5;
    p.legs[0] = p.legs[1] = -tuck; p.legs[2] = p.legs[3] = tuck;
  } else if (e.landed < 0.25) {
    squash = 1 - 0.14 * Math.sin((e.landed / 0.25) * Math.PI);
  }
  p.bob = Math.abs(Math.sin(e.stride)) * 0.05 * walk + hopY;
  p.squash = squash;
  p.bodyRoll = Math.sin(e.stride) * 0.035 * walk;
  p.bodyPitch = bodyPitch;
  p.wobble = Math.sin(t * 13) * Math.exp(-e.landed * 4) * 1.4 + Math.sin(e.stride * 2) * 0.35 * walk;
  const sleeping = e.fold > 0.5;
  p.breathe = sleeping ? Math.sin(t * 1.1) * 0.03 : Math.sin(t * 2.2) * 0.018;
  p.headPitch = e.pitch;
  p.headYaw = e.yaw;
  p.headRoll = e.roll;
  p.fold = e.fold;
  for (let i = 0; i < 2; i++) {
    const et = e.earT[i]!;
    const f = et >= 0 ? Math.sin(clamp(et / 0.35, 0, 1) * Math.PI) : 0;
    p.earDroop[i] = EAR_REST + 0.3 * e.fold - 0.75 * f + 0.05 * Math.sin(t * 1.7 + i);
    p.earSweep[i] = 0.35 * f;
  }
  p.blink = sleeping ? 1 : e.blinkT >= 0 ? Math.sin(clamp(e.blinkT / 0.16, 0, 1) * Math.PI) : 0;
  return p;
}
