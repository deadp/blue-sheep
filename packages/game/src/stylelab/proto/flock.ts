// Movement prototype: sheep that graze, wander, trot after the farmer (fond ones) or step away (shy ones).
// Cosmetic only (Math.random is fine here; nothing feeds game state).
import type { LabSheep } from "../sheep.js";
import { AREAS, type Farm, type UV } from "../r3/farm.js";
import type { Grid } from "./grid.js";
import type { SheepRig } from "./world.js";

export type Temper = "fond" | "shy" | "calm";
export interface Sheep {
  s: LabSheep;
  rig: SheepRig;
  temper: Temper;
  hearts: number;
  who: string;
  say: string;
  u: number; v: number; heading: number;
  speed: number;
  mode: "graze" | "walk" | "follow" | "flee" | "greet";
  timer: number;
  target: UV | null;
  path: UV[];
  repath: number;
  phase: number;
  headDown: number;
  lookYaw: number;
  slot: number;
  /** Seconds this sheep has been following (for the heart that floats up now and then). */
  followT: number;
}

const HOME = AREAS.home.rect!, FLATS = AREAS.flats.rect!;
const inRect = (r: number[], u: number, v: number, m: number) => u > r[0]! + m && u < r[1]! - m && v > r[2]! + m && v < r[3]! - m;
const inHome = (u: number, v: number, m = 1.2) => inRect(HOME, u, v, m);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function makeSheep(s: LabSheep & { at: UV; rot: number }, rig: SheepRig, temper: Temper, hearts: number, who: string, say: string, slot: number): Sheep {
  return { s, rig, temper, hearts, who, say, u: s.at[0], v: s.at[1], heading: s.rot, speed: 0, mode: "graze", timer: 1 + Math.random() * 4, target: null, path: [], repath: 0, phase: Math.random() * 6, headDown: 1, lookYaw: 0, slot, followT: 0 };
}

export interface FarmerView { u: number; v: number; moving: boolean; present: boolean }

export function updateFlock(flock: Sheep[], farmer: FarmerView, grid: Grid, farm: Farm, dt: number, onStep: (sh: Sheep) => void, onHeart: (sh: Sheep) => void) {
  for (const sh of flock) {
    const du = farmer.u - sh.u, dv = farmer.v - sh.v;
    const d = farmer.present ? Math.hypot(du, dv) : Infinity;
    let want = 0; // desired speed
    let goal: UV | null = null;
    if (sh.mode === "greet") {
      sh.timer -= dt;
      if (sh.timer <= 0) { sh.mode = "graze"; sh.timer = 2 + Math.random() * 3; }
    } else if (sh.temper === "fond" && d < 26 && (d > 3.2 || (farmer.moving && d > 2.4))) {
      if (sh.mode !== "follow") { sh.mode = "follow"; sh.repath = 0; }
      // a loose trail behind the farmer: each fond sheep keeps its own spot
      const a = Math.atan2(-dv, -du) + (sh.slot - 1) * 0.7;
      const r = 2.2 + sh.slot * 0.8;
      goal = [farmer.u + Math.cos(a) * r, farmer.v + Math.sin(a) * r];
      want = Math.min(d > 7 ? 5.4 : 4.2, Math.max(0.9, (d - 2) * 1.1));
      sh.followT += dt;
      if (sh.followT > 4 && Math.random() < dt * 0.25) { onHeart(sh); sh.followT = 0; }
    } else if (sh.temper === "shy" && d < 4.2) {
      sh.mode = "flee";
      const away = Math.atan2(-dv, -du) + (Math.random() - 0.5) * 0.3;
      goal = [sh.u + Math.cos(away) * 4, sh.v + Math.sin(away) * 4];
      want = 2.4;
      sh.path = [];
    } else {
      if (sh.mode === "follow" || sh.mode === "flee") { sh.mode = "graze"; sh.timer = 1.5 + Math.random() * 3; sh.path = []; }
      const paddock = inHome(sh.u, sh.v, 0.3) ? HOME : grid.flatsOpen && inRect(FLATS, sh.u, sh.v, 0.3) ? FLATS : null;
      if (sh.mode === "graze") {
        sh.timer -= dt;
        if (sh.timer <= 0 && !paddock) {
          // left behind outside a paddock: amble back to the home paddock
          const t: UV = [HOME[0] + 4 + Math.random() * (HOME[1] - HOME[0] - 8), HOME[2] + 3 + Math.random() * (HOME[3] - HOME[2] - 6)];
          sh.path = grid.path([sh.u, sh.v], t) ?? [];
          if (sh.path.length) { sh.target = sh.path[sh.path.length - 1]!; sh.mode = "walk"; } else sh.timer = 2;
        }
        if (sh.timer <= 0 && sh.mode === "graze") {
          // wander a few steps, staying inside the home paddock when already in it
          for (let k = 0; k < 8; k++) {
            const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5;
            const t: UV = [sh.u + Math.cos(a) * r, sh.v + Math.sin(a) * r];
            if (paddock && !inRect(paddock, t[0], t[1], 1.2)) continue;
            if (!grid.clear([sh.u, sh.v], t)) continue;
            sh.target = t; sh.mode = "walk"; break;
          }
          if (sh.mode === "graze") sh.timer = 1 + Math.random() * 2;
        }
      }
      if (sh.mode === "walk" && sh.target) {
        goal = sh.target; want = sh.path.length ? 1.6 : 1.1;
        if (Math.hypot(sh.target[0] - sh.u, sh.target[1] - sh.v) < 0.5) { sh.mode = "graze"; sh.timer = 3 + Math.random() * 6; sh.target = null; goal = null; want = 0; }
      }
    }
    // followers path around fences; others walk straight (their targets were checked clear)
    let steer: UV | null = goal;
    if (goal && sh.mode === "walk" && sh.path.length) {
      while (sh.path.length > 1 && Math.hypot(sh.path[0]![0] - sh.u, sh.path[0]![1] - sh.v) < 0.6) sh.path.shift();
      steer = sh.path[0]!;
    }
    if (goal && sh.mode === "follow") {
      sh.repath -= dt;
      if (sh.speed < 0.2 && d > 4) sh.repath = Math.min(sh.repath, 0.2); // stuck on a corner: look again soon
      if (grid.clear([sh.u, sh.v], goal)) sh.path = [];
      else if (sh.repath <= 0 || !sh.path.length) { sh.path = grid.path([sh.u, sh.v], goal) ?? []; sh.repath = 0.9; }
      while (sh.path.length && Math.hypot(sh.path[0]![0] - sh.u, sh.path[0]![1] - sh.v) < 0.6) sh.path.shift();
      if (sh.path.length) steer = sh.path[0]!;
    }
    if (steer && want > 0) {
      const ta = Math.atan2(steer[1] - sh.v, steer[0] - sh.u);
      const diff = wrap(ta - sh.heading);
      sh.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * (sh.mode === "flee" ? 6 : 3.5));
      want *= Math.max(0, Math.cos(diff));
    } else want = 0;
    sh.speed += (want - sh.speed) * Math.min(1, dt * 4);
    let nu = sh.u + Math.cos(sh.heading) * sh.speed * dt, nv = sh.v + Math.sin(sh.heading) * sh.speed * dt;
    // keep a little space from the others and the farmer
    for (const o of flock) {
      if (o === sh) continue;
      const ou = nu - o.u, ov = nv - o.v, od = Math.hypot(ou, ov);
      if (od < 1.5 && od > 1e-3) { nu += (ou / od) * (1.5 - od) * 0.5; nv += (ov / od) * (1.5 - od) * 0.5; }
    }
    if (farmer.present) {
      const fu = nu - farmer.u, fv = nv - farmer.v, fd = Math.hypot(fu, fv);
      if (fd < 1.3 && fd > 1e-3) { nu += (fu / fd) * (1.3 - fd); nv += (fv / fd) * (1.3 - fd); }
    }
    if (!grid.blocked(nu, nv)) { sh.u = nu; sh.v = nv; }
    else if (sh.mode === "walk" || sh.mode === "flee") { sh.mode = "graze"; sh.timer = 1; sh.target = null; sh.speed = 0; }

    // pose: trot legs, bob, head down to graze or up to look at the farmer
    const moving = sh.speed > 0.15;
    const prev = Math.sin(sh.phase);
    sh.phase += dt * (moving ? 3 + sh.speed * 3.2 : 0);
    const sw = Math.min(1, sh.speed / 1.5) * 0.55;
    const s = Math.sin(sh.phase);
    sh.rig.legs[0]!.rotation.z = s * sw; sh.rig.legs[1]!.rotation.z = s * sw;
    sh.rig.legs[2]!.rotation.z = -s * sw; sh.rig.legs[3]!.rotation.z = -s * sw;
    sh.rig.body.position.y = (sh.rig.body.userData.y0 ??= sh.rig.body.position.y) + Math.abs(Math.cos(sh.phase)) * 0.05 * Math.min(1, sh.speed);
    if (moving && sh.speed > 1.8 && Math.sign(s) !== Math.sign(prev)) onStep(sh);
    const grazing = sh.mode === "graze" && !(d < 5);
    sh.headDown += ((grazing ? 1 : 0) - sh.headDown) * Math.min(1, dt * 2.5);
    const nib = grazing ? Math.sin(sh.phase * 0 + performance.now() * 0.008 + sh.slot) * 0.06 : 0;
    sh.rig.head.rotation.z = -0.28 - sh.headDown * 0.85 + nib;
    const look = d < 6 && !moving ? wrap(Math.atan2(dv, du) - sh.heading) : 0;
    sh.lookYaw += (Math.max(-0.9, Math.min(0.9, look)) - sh.lookYaw) * Math.min(1, dt * 4);
    sh.rig.head.rotation.y = sh.lookYaw;
    sh.rig.root.position.set(sh.u, farm.ground(sh.u, sh.v), -sh.v);
    sh.rig.root.rotation.y = sh.heading;
  }
}

/** The sheep stops and turns to face the farmer for a moment. */
export function greet(sh: Sheep, fu: number, fv: number, secs = 3) {
  sh.mode = "greet";
  sh.timer = secs;
  sh.speed = 0;
  sh.heading = Math.atan2(fv - sh.v, fu - sh.u);
  sh.path = [];
}
