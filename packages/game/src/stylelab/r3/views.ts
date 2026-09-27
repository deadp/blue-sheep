// Style lab round 3: four gameplay camera options over the same farm (DESIGN-v3 §15 item 21).
//   1. Close isometric, pan & zoom (orthographic, drag to pan, felt minimap)
//   2. 2.5D side-on valley (low perspective, parallax ranges, scroll left/right, valley ribbon)
//   3. Paddock scenes with travel (framed close-ups, felt signpost strip, camera glide)
//   4. Farmer's-eye (third-person behind a farmer, walk through gates)
// Every shot returns a camera plus the felt HUD for that moment: play, woolshed, expand, mid, motion.
import * as THREE from "three";
import type { LabSheep } from "../sheep.js";
import { AREAS, FLATS_FLOCK, HOME_FLOCK, type AreaId, type Farm, type Stage, type UV } from "./farm.js";
import {
  acts, bubble, card, compass, cursor, hudTop, joystick, minimap, nameTag, placard, priceTag, prompt, ribbon,
  stationTag, travelStrip, woolshedBar, type Pt,
} from "./hud.js";

export const W = 1280, H = 800;
export type Shot = "play" | "woolshed" | "expand" | "mid" | "motion";
export const stageOf = (s: Shot): Stage => (s === "mid" ? "mid" : "early");

export interface Ctx {
  farm: Farm;
  st: Stage;
  photo(s: LabSheep): string;
}
export interface Out {
  cam: THREE.Camera;
  html: (p: (v: THREE.Vector3) => Pt) => string;
  focus: THREE.Vector3;
  fog?: [number, number] | null;
}

const PIKELET = HOME_FLOCK[0]!;
const sheepAt = (farm: Farm, name: string, dy = 2.1) => {
  const g = farm.sheep.get(name)!;
  return new THREE.Vector3(g.position.x, g.position.y + dy, g.position.z);
};
const flockOf = (name: string) => [...HOME_FLOCK, ...FLATS_FLOCK].find((s) => s.name === name)!;

function project(cam: THREE.Camera, v: THREE.Vector3): Pt {
  const p = v.clone().project(cam);
  return { x: Math.round(((p.x + 1) / 2) * W), y: Math.round(((1 - p.y) / 2) * H) };
}
export const projector = (cam: THREE.Camera) => (v: THREE.Vector3) => project(cam, v);

// ---------------------------------------------------------------- cameras

const ISO_YAW = 0.42, ISO_PITCH = (37 * Math.PI) / 180;
const ISO_DIR = new THREE.Vector3(Math.sin(ISO_YAW) * Math.cos(ISO_PITCH), Math.sin(ISO_PITCH), Math.cos(ISO_YAW) * Math.cos(ISO_PITCH));
function isoCam(target: THREE.Vector3, halfW: number): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfW * (H / W), -halfW * (H / W), 1, 600);
  cam.position.copy(target).addScaledVector(ISO_DIR, 200);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}
function persp(pos: THREE.Vector3, look: THREE.Vector3, fov: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.3, 900);
  cam.position.copy(pos);
  cam.lookAt(look);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** World point from farm coordinates (u east, v north). */
const P = (farm: Farm, u: number, v: number, dy = 0) => farm.at(u, v, dy);

/** Where the screen corners hit the ground: the view window for the minimap. */
function groundWindow(cam: THREE.Camera): UV[] {
  const rc = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4);
  const out: UV[] = [];
  for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
    rc.setFromCamera(new THREE.Vector2(x, y), cam);
    const hit = new THREE.Vector3();
    if (rc.ray.intersectPlane(plane, hit)) out.push([hit.x, -hit.z]);
  }
  return out;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------- 1. close isometric

function view1(c: Ctx, shot: Shot, f: number): Out {
  const { farm, st } = c;
  const mk = (u: number, v: number, halfW: number) => { const t = P(farm, u, v, 0.4); return { cam: isoCam(t, halfW), focus: t }; };
  const hud = (cam: THREE.Camera, inner: string, opts: { acts?: boolean; goal?: boolean } = {}) =>
    inner + hudTop(st, { goal: opts.goal }) + minimap(st, groundWindow(cam)) + (opts.acts === false ? "" : acts());
  if (shot === "play") {
    farm.select("Pikelet");
    const { cam, focus } = mk(-12.5, 1.5, 17);
    return { cam, focus, html: (p) => hud(cam,
      nameTag(p(sheepAt(farm, "Bluey", 1.9)), "Bluey") + placard(p(P(farm, 6, 1.5, 9)), "yarn", "Woolshed", "shed") +
      cursor({ ...p(sheepAt(farm, "Pikelet", 0.9)), }, "tap") + card(c.photo(PIKELET), PIKELET, "curious ewe", "Is that the smoko tin?")) };
  }
  if (shot === "woolshed") {
    farm.select(null);
    const { cam, focus } = mk(1.5, -3.5, 11);
    return { cam, focus, html: (p) => hud(cam,
      farm.stations.map((s) => stationTag(p(P(farm, s.at[0], s.at[1], 4.6)), s)).join("") + woolshedBar(), { acts: false }) };
  }
  if (shot === "expand") {
    farm.select(null);
    const { cam, focus } = mk(14, 0, 17);
    return { cam, focus, html: (p) => hud(cam,
      placard(p(P(farm, 6, 1.5, 9)), "yarn", "Woolshed", "shed") +
      priceTag(p(P(farm, 26, 2, 4.5)), "flats", { button: true }) + cursor({ x: p(P(farm, 26, 2, 4.5)).x + 40, y: p(P(farm, 26, 2, 4.5)).y + 50 }, "tap")) };
  }
  if (shot === "mid") {
    farm.select(null);
    const { cam, focus } = mk(10, 1, 31);
    return { cam, focus, html: (p) => hud(cam,
      placard(p(P(farm, 6, 1.5, 9)), "yarn", "Woolshed", "shed") + placard(p(P(farm, -44, 1, 9)), "shed", "Home") +
      priceTag(p(P(farm, 58, 1, 4)), "rushy", { small: true }) + priceTag(p(P(farm, -4, 31, 4)), "high", { small: true, soon: false })) };
  }
  // motion: drag to pan east along the valley
  farm.select(null);
  const t = f / 5;
  const u = lerp(-16, 26, ease(t));
  const { cam, focus } = mk(u, 0.5 - 1.5 * Math.sin(t * Math.PI), 17);
  return { cam, focus, html: (p) => hud(cam, cursor({ x: 700 - Math.round(ease(t) * 160), y: 430 }, "drag") +
    (f >= 3 ? priceTag(p(P(farm, 26, 2, 4.5)), "flats", { small: true }) : "")) };
}

// ---------------------------------------------------------------- 2. side-on valley

function sideCam(farm: Farm, x: number, dist = 36, hgt = 6.5, fov = 29): { cam: THREE.PerspectiveCamera; focus: THREE.Vector3 } {
  const look = V(x, 5.2, -6);
  const cam = persp(V(x, hgt, dist), look, fov);
  void farm;
  return { cam, focus: look };
}
function view2(c: Ctx, shot: Shot, f: number): Out {
  const { farm, st } = c;
  const hud = (inner: string, from: number, to: number, opts: { acts?: boolean } = {}) => inner + hudTop(st) + ribbon(st, from, to) + (opts.acts === false ? "" : acts());
  const fog: [number, number] = [120, 330];
  if (shot === "play") {
    farm.select("Pikelet");
    const { cam, focus } = sideCam(farm, -12.5);
    return { cam, focus, fog, html: (p) => hud(nameTag(p(sheepAt(farm, "Bluey", 1.9)), "Bluey") + cursor(p(sheepAt(farm, "Pikelet", 0.9)), "tap") +
      placard(p(P(farm, 6, 1.5, 9)), "yarn", "Woolshed", "shed") + card(c.photo(PIKELET), PIKELET, "curious ewe", "Is that the smoko tin?"), -30, 5) };
  }
  if (shot === "woolshed") {
    farm.select(null);
    const look = V(2, 2.6, -3);
    const cam = persp(V(2, 6.5, 21), look, 30);
    return { cam, focus: look, fog, html: (p) => hud(farm.stations.map((s) => stationTag(p(P(farm, s.at[0], s.at[1], 3.6)), s)).join("") + woolshedBar(), -8, 12, { acts: false }) };
  }
  if (shot === "expand") {
    farm.select(null);
    const { cam, focus } = sideCam(farm, 22);
    return { cam, focus, fog, html: (p) => hud(placard(p(P(farm, 6, 1.5, 9)), "yarn", "Woolshed", "shed") +
      priceTag(p(P(farm, 31, 0, 5.2)), "flats", { button: true }) + cursor({ x: p(P(farm, 31, 0, 5.2)).x + 40, y: p(P(farm, 31, 0, 5.2)).y + 50 }, "tap"), 4, 40) };
  }
  if (shot === "mid") {
    farm.select(null);
    const look = V(8, 8.5, -6);
    const cam = persp(V(8, 11, 74), look, 30);
    return { cam, focus: look, fog, html: (p) => hud(placard(p(P(farm, 6, 1.5, 9)), "yarn", "Woolshed", "shed") +
      priceTag(p(P(farm, 58, 0, 4.5)), "rushy", { small: true }), -30, 46) };
  }
  farm.select(null);
  const t = ease(f / 5);
  const x = lerp(-16, 24, t);
  const { cam, focus } = sideCam(farm, x);
  return { cam, focus, fog, html: (p) => hud((f >= 3 ? priceTag(p(P(farm, 31, 0, 5.2)), "flats", { small: true }) : "") +
    cursor({ x: 1232, y: 430 }, "tap"), x - 18, x + 18) };
}

// ---------------------------------------------------------------- 3. paddock scenes with travel

interface SceneCam { pos: THREE.Vector3; look: THREE.Vector3; fov: number }
function sceneCam(farm: Farm, id: AreaId): SceneCam {
  switch (id) {
    case "home": return { pos: P(farm, -27, -25, 14), look: P(farm, -16.5, 0, 0.6), fov: 34 };
    case "woolshed": return { pos: P(farm, 5, -22, 9), look: P(farm, 3, -2.5, 2.2), fov: 34 };
    case "flats": return { pos: P(farm, 42, -26, 14), look: P(farm, 32, 0, 0.6), fov: 34 };
    default: return { pos: P(farm, 0, -30, 14), look: P(farm, 0, 0, 1), fov: 34 };
  }
}
function view3(c: Ctx, shot: Shot, f: number): Out {
  const { farm, st } = c;
  const fog: [number, number] = [90, 300];
  const frameHtml = `<div class="frame"></div>`;
  const hud = (inner: string, active: AreaId | null, title: string, glideTo?: AreaId, opts: { acts?: boolean } = {}) =>
    frameHtml + inner + hudTop(st) + (title ? `<div class="scene-title fl">${title}</div>` : "") + travelStrip(st, active, glideTo) + (opts.acts === false ? "" : acts());
  const mk = (s: SceneCam) => ({ cam: persp(s.pos, s.look, s.fov), focus: s.look });
  if (shot === "play") {
    farm.select("Pikelet");
    const { cam, focus } = mk(sceneCam(farm, "home"));
    return { cam, focus, fog, html: (p) => hud(nameTag(p(sheepAt(farm, "Bluey", 1.9)), "Bluey") + cursor(p(sheepAt(farm, "Pikelet", 0.9)), "tap") +
      card(c.photo(PIKELET), PIKELET, "curious ewe", "Is that the smoko tin?"), "home", "") };
  }
  if (shot === "woolshed") {
    farm.select(null);
    const { cam, focus } = mk(sceneCam(farm, "woolshed"));
    return { cam, focus, fog, html: (p) => hud(farm.stations.map((s) => stationTag(p(P(farm, s.at[0], s.at[1], 3.7)), s)).join("") +
      `<div class="wsbar-wrap">${woolshedBar()}</div>`, "woolshed", "", undefined, { acts: false }) };
  }
  if (shot === "expand" || shot === "mid") {
    farm.select(null);
    const { cam, focus } = mk(sceneCam(farm, "flats"));
    const tag = shot === "expand";
    return { cam, focus, fog, html: (p) => hud((tag ? priceTag(p(P(farm, 33, 1, 5)), "flats", { button: true }) : nameTag(p(sheepAt(farm, "Slate", 1.9)), "Slate") + nameTag(p(sheepAt(farm, "Rosie", 1.9)), "Rosie")),
      "flats", tag ? "" : "", undefined) };
  }
  // motion: glide from the home paddock to the woolshed
  farm.select(null);
  const t = ease(f / 5);
  const a = sceneCam(farm, "home"), b = sceneCam(farm, "woolshed");
  const lift = Math.sin(t * Math.PI);
  const pos = a.pos.clone().lerp(b.pos, t).add(V(0, 14 * lift, 8 * lift));
  const look = a.look.clone().lerp(b.look, t);
  const cam = persp(pos, look, lerp(a.fov, b.fov, t) + 8 * lift);
  return { cam, focus: look, fog, html: () => hud(f === 0 ? cursor({ x: 205, y: 745 }, "tap") : "", f < 5 ? "home" : "woolshed", "", f < 5 ? "woolshed" : undefined) };
}

// ---------------------------------------------------------------- 4. farmer's-eye

function follow(farm: Farm, u: number, v: number, heading: number, back = 5.8, up = 3.3, ahead = 5, fov = 50, side = 1.4) {
  farm.setFarmer(u, v, heading);
  const du = Math.cos(heading), dv = Math.sin(heading);
  const ru = Math.sin(heading), rv = -Math.cos(heading); // to the farmer's right
  const g = farm.ground(u, v);
  const pos = V(u - du * back + ru * side, g + up, -(v - dv * back + rv * side));
  const look = V(u + du * ahead + ru * side * 1.2, g + 1.0, -(v + dv * ahead + rv * side * 1.2));
  return { cam: persp(pos, look, fov), focus: look };
}
const deg = (r: number) => (r * 180) / Math.PI;
function marks(u: number, v: number, st: Stage) {
  const to = (a: UV) => deg(Math.atan2(a[1] - v, a[0] - u));
  return [
    { deg: to(AREAS.home.focus), ic: "sheep" as const },
    { deg: to([6, 1.5]), ic: "yarn" as const },
    { deg: to(AREAS.flats.focus), ic: "leaf" as const, locked: st === "early" },
    { deg: to([-44, 1]), ic: "shed" as const },
    { deg: to(AREAS.bush.focus), ic: "bird" as const },
  ];
}
function view4(c: Ctx, shot: Shot, f: number): Out {
  const { farm, st } = c;
  const fog: [number, number] = [70, 260];
  const hud = (inner: string, u: number, v: number, heading: number, opts: { acts?: boolean } = {}) =>
    inner + hudTop(st, { goal: false }) + compass(deg(heading), marks(u, v, st)) + joystick() + (opts.acts === false ? "" : acts());
  if (shot === "play") {
    farm.select("Pikelet");
    const u = -21.2, v = -0.2;
    const pk = HOME_FLOCK[0]!.at;
    const hd = Math.atan2(pk[1] - v, pk[0] - u) + 0.42;
    const { cam, focus } = follow(farm, u, v, hd);
    return { cam, focus, fog, html: (p) => hud(bubble(p(sheepAt(farm, "Pikelet", 1.95)), PIKELET, 3) +
      prompt({ x: p(sheepAt(farm, "Pikelet", 0)).x + 150, y: p(sheepAt(farm, "Pikelet", 0)).y + 40 }, "E", "Look closer") +
      prompt({ x: p(sheepAt(farm, "Pikelet", 0)).x + 150, y: p(sheepAt(farm, "Pikelet", 0)).y + 88 }, "F", "Hold to brush") +
      nameTag(p(sheepAt(farm, "Bluey", 1.9)), "Bluey"), u, v, hd) };
  }
  if (shot === "woolshed") {
    farm.select(null);
    const u = 1.5, v = -12.5, hd = Math.PI / 2 + 0.05;
    const { cam, focus } = follow(farm, u, v, hd, 5.2, 3.0, 6, 52);
    return { cam, focus, fog, html: (p) => hud(farm.stations.map((s) => stationTag(p(P(farm, s.at[0], s.at[1], 3.6)), s, { compact: true })).join("") +
      prompt({ x: 640, y: 560 }, "E", "Work the day") + prompt({ x: 640, y: 610 }, "Q", "Swap birds"), u, v, hd) };
  }
  if (shot === "expand") {
    farm.select(null);
    const u = 16.5, v = -5.5, hd = 0.3;
    const { cam, focus } = follow(farm, u, v, hd);
    return { cam, focus, fog, html: (p) => hud(priceTag(p(P(farm, 25, -2, 4.2)), "flats", { button: true }) , u, v, hd) };
  }
  if (shot === "mid") {
    farm.select(null);
    const u = 14.5, v = -8.5, hd = 0.28;
    const { cam, focus } = follow(farm, u, v, hd, 9, 7.5, 16, 55);
    return { cam, focus, fog, html: (p) => hud(nameTag(p(sheepAt(farm, "Slate", 1.9)), "Slate") + nameTag(p(sheepAt(farm, "Butter", 1.9)), "Butter") +
      priceTag(p(P(farm, 58, 0, 4)), "rushy", { small: true }), u, v, hd) };
  }
  // motion: walk out through the home paddock gate and along the track to the woolshed
  farm.select(null);
  const path: [number, number, number][] = [[-15, -1.5, -0.3], [-11.5, -3, -0.15], [-8, -3.8, -0.05], [-4.5, -4, -0.1], [-1.5, -6, -0.3], [1, -9.5, 0.9]];
  const [u, v, hd] = path[f]!;
  const { cam, focus } = follow(farm, u, v, hd);
  return { cam, focus, fog, html: () => hud("", u, v, hd) };
}

export const VIEWS: Record<number, (c: Ctx, shot: Shot, f: number) => Out> = { 1: view1, 2: view2, 3: view3, 4: view4 };
export const VIEW_NAMES: Record<number, string> = {
  1: "1. Close isometric · pan & zoom",
  2: "2. Side-on valley · parallax",
  3: "3. Paddock scenes · travel",
  4: "4. Farmer's-eye · third person",
};
void flockOf;
