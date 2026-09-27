// Movement prototype (DESIGN-v3 §15 item 22): close isometric with a walking farmer versus drag-pan + signposts.
// Throwaway; the live game is untouched.
//   proto-walk.html?mode=walk|pan   the control scheme (also the felt switch, top right)
//   &lite=1                         cheaper fallback (no shadows, less grass, no antialias, pixel ratio 1)
//   &fps=1                          frame-time meter
//   &test=1                         time only moves through window.__proto.advance(seconds) (for the shoot script)
import * as THREE from "three";
import "../fonts/fonts.css";
import "../r2/r2.css";
import "../r3/r3.css";
import "./proto.css";
import { voiceFor, Voices, type VoicePersonality } from "../../audio/index.js";
import { icon } from "../r2/icons2.js";
import { portraits } from "../r2/stage.js";
import { buildSheep2 } from "../r2/sheep2.js";
import { defs, textureVars } from "../r2/textures.js";
import { hexOf, type LabSheep } from "../sheep.js";
import { AREAS, FLATS_FLOCK, HOME_FLOCK, type UV } from "../r3/farm.js";
import { acts, bubble, card, hudTop, nameTag, placard, priceTag, stationTag } from "../r3/hud.js";
import { greet, makeSheep, updateFlock, type Sheep, type Temper } from "./flock.js";
import { Grid } from "./grid.js";
import { drawMinimapBase, drawMinimapLive, hint, modeSwitch, MM, mmToUV, promptEl, signposts, SIGNS, type Mode } from "./ui.js";
import { buildSheepRig, buildWorld, ISO_PITCH, SCREEN_RIGHT, SCREEN_UP } from "./world.js";

const params = new URLSearchParams(location.search);
let mode: Mode = params.get("mode") === "pan" ? "pan" : "walk";
const LITE = params.get("lite") === "1";
const TEST = params.get("test") === "1";
const SHOW_FPS = params.get("fps") === "1";

// ---------------------------------------------------------------- page
document.body.classList.add("r3", "v1", "proto");
const app = document.getElementById("app")!;
app.innerHTML = `<style>${textureVars()}</style>${defs()}<div id="stage"><canvas id="world"></canvas></div><div class="fx rim"></div>
  <div id="ui"><div id="tags"></div><div id="hud"></div><div id="cardbox"></div><div id="toast" class="fl"></div><div id="fps"></div></div>`;
await document.fonts.ready;
const canvas = document.getElementById("world") as HTMLCanvasElement;
const ui = document.getElementById("ui")!;
const tags = document.getElementById("tags")!;
const hud = document.getElementById("hud")!;
const cardbox = document.getElementById("cardbox")!;
const toastEl = document.getElementById("toast")!;
const fpsEl = document.getElementById("fps")!;

const world = buildWorld(canvas, { lite: LITE });
const { farm, cam, walker, reveal } = world;
const grid = new Grid();
const voices = new Voices();

// ---------------------------------------------------------------- flock (v3 colours, the round-3 friendlier face)
type Def = { name: string; temper: Temper; hearts: number; who: string; say: string; voice: VoicePersonality; at?: UV };
const DEFS: Def[] = [
  { name: "Pikelet", temper: "fond", hearts: 4, who: "curious ewe", say: "Is that the smoko tin?", voice: "curious" },
  { name: "Bluey", temper: "fond", hearts: 5, who: "bold ram", say: "Lead on, boss.", voice: "bold" },
  { name: "Tiny", temper: "fond", hearts: 4, who: "cheeky lamb", say: "Wait for me!", voice: "curious" },
  { name: "Pickle", temper: "calm", hearts: 3, who: "easy-going ewe", say: "Grass is good today.", voice: "calm" },
  { name: "Lavender", temper: "shy", hearts: 2, who: "shy ewe", say: "…oh. Hello.", voice: "shy" },
  { name: "Scone", temper: "shy", hearts: 1, who: "timid ewe", say: "Not too close, please.", voice: "shy" },
  { name: "Slate", temper: "calm", hearts: 3, who: "steady ewe", say: "Nice morning for it.", voice: "calm", at: [-25, -2] },
  { name: "Butter", temper: "calm", hearts: 3, who: "dozy wether", say: "Mm? Oh, it's you.", voice: "calm", at: [-11, 6] },
];
const ALL = [...HOME_FLOCK, ...FLATS_FLOCK];
let fondSlot = 0;
const flock: Sheep[] = DEFS.map((d) => {
  const base = ALL.find((s) => s.name === d.name)!;
  const s = { ...base, at: d.at ?? base.at, rot: base.rot };
  const rig = buildSheepRig(world.mats, s);
  farm.root.add(rig.root);
  farm.sheep.set(s.name, rig.root);
  return makeSheep(s, rig, d.temper, d.hearts, d.who, d.say, d.temper === "fond" ? fondSlot++ : 0);
});
const voiceOf = (sh: Sheep) => voiceFor({ id: sh.s.name, sex: sh.s.horns ? "ram" : "ewe", adult: !sh.s.lamb, size: sh.s.lamb ? 28 : 62, personality: DEFS.find((d) => d.name === sh.s.name)!.voice, fondness: sh.hearts * 20 });
const bleat = (sh: Sheep) => { try { voices.bleat(voiceOf(sh)); } catch { /* audio is a nicety */ } };

// ---------------------------------------------------------------- state
const farmer = { u: -15, v: -2.5, heading: -0.4, vel: [0, 0] as UV, path: [] as UV[], chase: null as Sheep | null, arrive: 0, then: null as null | (() => void), idle: 0, lookNext: 2, repath: 0 };
const camS = { u: -14, v: -1, halfW: 13, vel: [0, 0] as UV, glide: null as null | { from: UV; to: UV; hw0: number; hw1: number; t: number; dur: number } };
let cardSheep: Sheep | null = null;
let coins = 96;
let revealed = false;
let revealT = -1;
let brush: { sh: Sheep; t: number } | null = null;
let markerT = 0;
let clock = 0;
const keys = new Set<string>();
const W_AT: UV = [4, -8.2], M_AT: UV = [-8.5, -11.2], T_AT: UV = [23.5, -11.2];
const FLATS_TAG: UV = [24.5, -7.5];

// ---------------------------------------------------------------- projection and picking
const tmp = new THREE.Vector3();
function screenOf(p: THREE.Vector3) {
  tmp.copy(p).project(cam);
  return { x: ((tmp.x + 1) / 2) * canvas.clientWidth, y: ((1 - tmp.y) / 2) * canvas.clientHeight };
}
const screenUV = (u: number, v: number, dy = 0) => screenOf(farm.at(u, v, dy));
const ray = new THREE.Raycaster();
function groundAt(x: number, y: number): UV {
  ray.setFromCamera(new THREE.Vector2((x / canvas.clientWidth) * 2 - 1, -(y / canvas.clientHeight) * 2 + 1), cam);
  const o = ray.ray.origin, d = ray.ray.direction;
  let h = 0.4, p = new THREE.Vector3();
  for (let i = 0; i < 4; i++) { const t = (h - o.y) / d.y; p = o.clone().addScaledVector(d, t); h = farm.ground(p.x, -p.z); }
  return [p.x, -p.z];
}
function pickSheep(x: number, y: number): Sheep | null {
  let best: Sheep | null = null, bd = Infinity;
  const pxPerUnit = canvas.clientWidth / (2 * camS.halfW);
  for (const sh of flock) {
    const p = screenUV(sh.u, sh.v, sh.s.lamb ? 0.55 : 0.8);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < Math.max(26, pxPerUnit * 1.25) && d < bd) { bd = d; best = sh; }
  }
  return best;
}

// ---------------------------------------------------------------- HUD
function renderHud() {
  hud.innerHTML = hudTop("early") + acts() + modeSwitch(mode) + hint(mode) + (mode === "pan" ? signposts(revealed) : "") +
    `<div class="mmap fl panel"><div class="mm-stack" style="width:${MM.w}px;height:${MM.h}px"><canvas class="mm-base" style="width:${MM.w}px;height:${MM.h}px"></canvas><canvas class="mm-live" style="width:${MM.w}px;height:${MM.h}px"></canvas></div><span class="mm-zoom"><button class="fl" data-zoom="-1">+</button><button class="fl" data-zoom="1">−</button></span></div>`;
  drawMinimapBase(hud.querySelector(".mm-base") as HTMLCanvasElement, revealed);
  (hud.querySelector(".pomb.coins b") as HTMLElement).textContent = String(coins);
  (hud.querySelector(".pomb.flock b") as HTMLElement).innerHTML = `${flock.length}<small>/${revealed ? 14 : 10}</small>`;
  document.body.dataset.mode = mode;
}
// world-anchored tags, created once and moved every frame
tags.innerHTML = `<div id="t-name"></div><div id="t-bub"></div><div id="t-pp" class="pp-wrap"></div><div id="t-ws"></div><div id="t-mail"></div><div id="t-home"></div>
  <div id="t-flats"></div><div id="t-rushy"></div><div id="t-high"></div><div id="t-stations"></div>`;
const T = (id: string) => document.getElementById(id)!;
T("t-ws").innerHTML = placard({ x: 0, y: 0 }, "yarn", "Woolshed", "shed");
T("t-mail").innerHTML = placard({ x: 0, y: 0 }, "book", "Mail");
T("t-home").innerHTML = placard({ x: 0, y: 0 }, "shed", "Home");
T("t-rushy").innerHTML = priceTag({ x: 0, y: 0 }, "rushy", { small: true });
T("t-high").innerHTML = priceTag({ x: 0, y: 0 }, "high", { small: true, soon: false });
T("t-stations").innerHTML = farm.stations.map((s) => stationTag({ x: 0, y: 0 }, s, { compact: true })).join("");
let flatsTagKey = "";
function place(el: Element | null, p: { x: number; y: number }, show = true) {
  const e = el as HTMLElement | null;
  if (!e) return;
  e.style.display = show ? "" : "none";
  if (show) { e.style.left = `${Math.round(p.x)}px`; e.style.top = `${Math.round(p.y)}px`; }
}
let ppKey = "";
let hoverSheep: Sheep | null = null;
function nearSheep(): Sheep | null {
  if (mode !== "walk") return null;
  let best: Sheep | null = null, bd = 3.0;
  for (const sh of flock) { const d = Math.hypot(sh.u - farmer.u, sh.v - farmer.v); if (d < bd) { bd = d; best = sh; } }
  return best;
}
type Spot = { key: string; at: THREE.Vector3; html: string };
function currentSpot(): Spot | null {
  if (mode !== "walk" || revealT >= 0) return null;
  // places win over a sheep that tagged along; a sheep wins when you've walked right up to it
  const sh = nearSheep();
  const d = (p: UV) => Math.hypot(p[0] - farmer.u, p[1] - farmer.v);
  const close = sh && Math.hypot(sh.u - farmer.u, sh.v - farmer.v) < 1.9;
  if (d(W_AT) < 4.2 && !close) return { key: "woolshed", at: farm.at(W_AT[0] + 1.5, W_AT[1] + 1, 0), html: promptEl("E", "Work the day", "work") };
  if (d(M_AT) < 2.8 && !close) return { key: "mail", at: farm.at(M_AT[0] + 1.2, M_AT[1], 0), html: promptEl("E", "Check the mail", "mail") };
  if (sh) return { key: `sheep:${sh.s.name}`, at: farm.at(sh.u, sh.v, 0), html: promptEl("E", "Say hello", "hello") + promptEl("F", "Brush", "brush", true) };
  return null;
}
function updateTags() {
  // hover name tag
  place(T("t-name"), { x: 0, y: 0 }, false);
  if (hoverSheep && hoverSheep !== cardSheep) {
    T("t-name").innerHTML = nameTag({ x: 0, y: 0 }, hoverSheep.s.name);
    place(T("t-name"), screenUV(hoverSheep.u, hoverSheep.v, hoverSheep.s.lamb ? 1.5 : 2.0));
  }
  // nearby sheep bubble + prompts (walk)
  const spot = currentSpot();
  const sh = nearSheep();
  if (sh && sh !== cardSheep) {
    if (T("t-bub").dataset.k !== `${sh.s.name}:${sh.hearts}`) { T("t-bub").innerHTML = bubble({ x: 0, y: 0 }, sh.s, sh.hearts); T("t-bub").dataset.k = `${sh.s.name}:${sh.hearts}`; }
    place(T("t-bub"), screenUV(sh.u, sh.v, sh.s.lamb ? 1.55 : 2.1));
    if (hoverSheep === sh) place(T("t-name"), { x: 0, y: 0 }, false);
  } else place(T("t-bub"), { x: 0, y: 0 }, false);
  const pp = T("t-pp");
  if (spot) {
    if (spot.key !== ppKey) { pp.innerHTML = spot.html; ppKey = spot.key; }
    const p = screenOf(spot.at);
    place(pp, { x: p.x + 70, y: p.y + 10 });
  } else { place(pp, { x: 0, y: 0 }, false); ppKey = ""; }
  if (brush) (pp.querySelector(".pp.hold") as HTMLElement | null)?.style.setProperty("--p", String(Math.min(1, brush.t / 1.2)));
  // placards and price tags
  place(T("t-ws"), screenUV(6, 1.5, 9.2));
  place(T("t-mail"), screenUV(-8.5, -12.3, 3.2));
  place(T("t-home"), screenUV(-44, 1, 8.5));
  const nearTag = mode === "pan" || Math.hypot(T_AT[0] - farmer.u, T_AT[1] - farmer.v) < 4.5;
  const fk = revealed || revealT >= 0 ? "" : nearTag ? "button" : "tag";
  if (fk !== flatsTagKey) { T("t-flats").innerHTML = fk ? priceTag({ x: 0, y: 0 }, "flats", { button: fk === "button" }) : ""; flatsTagKey = fk; }
  place(T("t-flats").firstElementChild, screenUV(FLATS_TAG[0], FLATS_TAG[1], 4.0), !!fk);
  place(T("t-rushy").firstElementChild, screenUV(58, 1, 4.2));
  place(T("t-high").firstElementChild, screenUV(-4, 31, 4.2));
  // woolshed stations: when you're there
  const showSt = mode === "walk" ? Math.hypot(W_AT[0] - farmer.u, W_AT[1] - farmer.v) < 11 : Math.hypot(camS.u - 4, camS.v + 4) < 12 && camS.halfW < 19;
  T("t-stations").querySelectorAll(".stag").forEach((el, i) => { const s = farm.stations[i]!; place(el, screenUV(s.at[0], s.at[1], 4.1), showSt); });
}
let mmNext = 0;
function updateMinimap() {
  const live = hud.querySelector(".mm-live") as HTMLCanvasElement | null;
  if (!live) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const view = ([[0, 0], [w, 0], [w, h], [0, h]] as const).map(([x, y]) => groundAt(x, y));
  drawMinimapLive(live, view, flock.map((sh) => ({ u: sh.u, v: sh.v, hex: hexOf(sh.s.colour) })), mode === "walk" ? [farmer.u, farmer.v] : null);
}

// ---------------------------------------------------------------- toasts, pops, the card
let toastTimer = 0;
function toast(html: string, secs = 2.6) {
  toastEl.innerHTML = html;
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("on"), secs * 1000);
}
function pop(p: { x: number; y: number }, html: string, cls = "") {
  const el = document.createElement("div");
  el.className = `pop ${cls}`;
  el.innerHTML = html;
  el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
  ui.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}
const heartPop = (sh: Sheep) => pop(screenUV(sh.u, sh.v, sh.s.lamb ? 1.6 : 2.1), icon("heart", "on"), "heart");
const photos = new Map<string, string>();
const friendly = (m: Parameters<typeof buildSheep2>[0], s: LabSheep, sc?: number) => buildSheep2(m, s, sc, { friendly: true });
const photo = (s: LabSheep) => { if (!photos.has(s.name)) photos.set(s.name, portraits(friendly, [s], 400, 316, 0.78)[0]!); return photos.get(s.name)!; };
function openCard(sh: Sheep) {
  cardSheep = sh;
  cardbox.innerHTML = card(photo(sh.s), sh.s, sh.who, sh.say, sh.hearts);
  cardbox.firstElementChild?.classList.add("in");
  document.body.dataset.card = sh.s.name;
  bleat(sh);
}
function closeCard() {
  cardSheep = null;
  cardbox.innerHTML = "";
  document.body.dataset.card = "";
  farm.select(null);
}
function sayHello(sh: Sheep) {
  greet(sh, farmer.u, farmer.v, 3.5);
  bleat(sh);
  heartPop(sh);
  pop(screenUV(sh.u, sh.v, sh.s.lamb ? 2.3 : 2.9), `<span class="fl">“${sh.say}”</span>`, "say");
  farmer.heading = Math.atan2(sh.v - farmer.v, sh.u - farmer.u);
}
function brushed(sh: Sheep) {
  sh.hearts = Math.min(5, sh.hearts + 1);
  greet(sh, farmer.u, farmer.v, 2.5);
  for (let i = 0; i < 3; i++) setTimeout(() => heartPop(sh), i * 180);
  toast(`${icon("brush")}<b>${sh.s.name}</b> loved that`);
  if (cardSheep === sh) openCard(sh);
}

// ---------------------------------------------------------------- walking
function walkTo(to: UV, opts: { chase?: Sheep; arrive?: number; then?: () => void; marker?: boolean } = {}) {
  const path = grid.path([farmer.u, farmer.v], to);
  farmer.chase = opts.chase ?? null;
  farmer.arrive = opts.arrive ?? 0.25;
  farmer.then = opts.then ?? null;
  farmer.repath = 0.5;
  farmer.path = path ?? [];
  if (!path) toast("Can't get through there");
  if (opts.marker !== false && path) {
    const end = path[path.length - 1]!;
    world.marker.position.copy(farm.at(end[0], end[1], 0.08));
    world.marker.visible = true;
    markerT = 0;
  }
}
function tapWalk(x: number, y: number) {
  const sh = pickSheep(x, y);
  if (sh) {
    if (Math.hypot(sh.u - farmer.u, sh.v - farmer.v) < 2.6) { greet(sh, farmer.u, farmer.v); openCard(sh); return; }
    walkTo([sh.u, sh.v], { chase: sh, arrive: 2.2, marker: false, then: () => { greet(sh, farmer.u, farmer.v); farmer.heading = Math.atan2(sh.v - farmer.v, sh.u - farmer.u); openCard(sh); } });
    return;
  }
  const [u, v] = groundAt(x, y);
  if (u > -7.5 && u < 21.5 && v > -6.5 && v < 5.5) { walkTo(W_AT); return; }
  if (Math.hypot(u - M_AT[0], v - (M_AT[1] - 1)) < 2.2) { walkTo(M_AT); return; }
  const f = AREAS.flats.rect!;
  if (!revealed && u > f[0] && u < f[1] && v > f[2] && v < f[3]) { walkTo(T_AT); return; }
  walkTo([u, v]);
}
function stepFarmer(dt: number) {
  let iu = 0, iv = 0;
  const k = (a: string, b: string) => keys.has(a) || keys.has(b);
  const up = +k("w", "arrowup") - +k("s", "arrowdown"), right = +k("d", "arrowright") - +k("a", "arrowleft");
  if (up || right) {
    iu = SCREEN_UP[0] * up + SCREEN_RIGHT[0] * right; iv = SCREEN_UP[1] * up + SCREEN_RIGHT[1] * right;
    const l = Math.hypot(iu, iv); iu /= l; iv /= l;
    farmer.path = []; farmer.then = null; farmer.chase = null;
  }
  const speed = keys.has("shift") ? 7 : 4.6;
  let du = iu * speed, dv = iv * speed;
  if (!up && !right && (farmer.path.length || farmer.chase)) {
    if (farmer.chase) {
      farmer.repath -= dt;
      const c = farmer.chase;
      if (Math.hypot(c.u - farmer.u, c.v - farmer.v) < farmer.arrive) { farmer.path = []; const t = farmer.then; farmer.then = null; farmer.chase = null; t?.(); }
      else if (farmer.repath <= 0 || Math.hypot(farmer.vel[0], farmer.vel[1]) < 0.3) { farmer.path = grid.path([farmer.u, farmer.v], [c.u, c.v]) ?? farmer.path; farmer.repath = 0.5; }
    }
    const p = farmer.path[0];
    if (p) {
      const dx = p[0] - farmer.u, dy = p[1] - farmer.v, d = Math.hypot(dx, dy);
      const last = farmer.path.length === 1;
      if (d < (last && !farmer.chase ? farmer.arrive : 0.35)) {
        farmer.path.shift();
        if (!farmer.path.length && !farmer.chase) { const t = farmer.then; farmer.then = null; t?.(); }
      } else {
        const sp = last ? Math.min(speed, 1.2 + d * 2.2) : speed;
        du = (dx / d) * sp; dv = (dy / d) * sp;
      }
    }
  }
  const a = Math.min(1, dt * 12);
  farmer.vel[0] += (du - farmer.vel[0]) * a;
  farmer.vel[1] += (dv - farmer.vel[1]) * a;
  const nu = farmer.u + farmer.vel[0] * dt, nv = farmer.v + farmer.vel[1] * dt;
  const free = (u: number, v: number) => !grid.blocked(u, v); // same clearance the paths are planned with
  if (free(nu, nv)) { farmer.u = nu; farmer.v = nv; }
  else if (free(nu, farmer.v)) farmer.u = nu;
  else if (free(farmer.u, nv)) farmer.v = nv;
  else { farmer.vel[0] *= 0.3; farmer.vel[1] *= 0.3; }
  const sp = Math.hypot(farmer.vel[0], farmer.vel[1]);
  if (sp > 0.3) {
    const ta = Math.atan2(farmer.vel[1], farmer.vel[0]);
    const diff = Math.atan2(Math.sin(ta - farmer.heading), Math.cos(ta - farmer.heading));
    farmer.heading += diff * Math.min(1, dt * 12);
    farmer.idle = 0;
    walker.look(0);
  } else {
    farmer.idle += dt;
    farmer.lookNext -= dt;
    if (farmer.idle > 1.2 && farmer.lookNext <= 0) {
      // idle look-around: glance at a sheep nearby, or just take in the view
      let yaw = (Math.random() - 0.5) * 1.8;
      const near = flock.map((sh) => ({ sh, d: Math.hypot(sh.u - farmer.u, sh.v - farmer.v) })).filter((o) => o.d < 8).sort((x, y) => x.d - y.d)[0];
      if (near && Math.random() < 0.6) yaw = Math.atan2(near.sh.v - farmer.v, near.sh.u - farmer.u) - farmer.heading;
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      walker.look(Math.max(-1.1, Math.min(1.1, yaw)));
      farmer.lookNext = 1.6 + Math.random() * 2.2;
    }
  }
  if (walker.pose(sp, dt, clock)) {
    const side = Math.random() < 0.5 ? 1 : -1;
    world.dust(farmer.u - Math.cos(farmer.heading) * 0.2 + Math.sin(farmer.heading) * 0.15 * side, farmer.v - Math.sin(farmer.heading) * 0.2 - Math.cos(farmer.heading) * 0.15 * side, sp > 5.5 ? 0.75 : 0.55);
  }
  walker.root.position.copy(farm.at(farmer.u, farmer.v));
  walker.root.rotation.y = farmer.heading;
}

// ---------------------------------------------------------------- camera
const clampCam = () => { camS.u = Math.max(-56, Math.min(90, camS.u)); camS.v = Math.max(-13, Math.min(30, camS.v)); };
function glideTo(to: UV, hw: number, dur = 1.2) { camS.glide = { from: [camS.u, camS.v], to, hw0: camS.halfW, hw1: hw, t: 0, dur }; camS.vel = [0, 0]; }
function stepCamera(dt: number) {
  if (camS.glide) {
    const g = camS.glide;
    g.t += dt;
    const k = Math.min(1, g.t / g.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const dist = Math.hypot(g.to[0] - g.from[0], g.to[1] - g.from[1]);
    camS.u = g.from[0] + (g.to[0] - g.from[0]) * e;
    camS.v = g.from[1] + (g.to[1] - g.from[1]) * e;
    camS.halfW = g.hw0 + (g.hw1 - g.hw0) * e + Math.sin(k * Math.PI) * Math.min(6, dist * 0.08);
    if (k >= 1) camS.glide = null;
  } else if (mode === "walk" && revealT < 0) {
    // follow with a little look-ahead in the direction of travel
    const la = 0.55, lu = farmer.vel[0] * la, lv = farmer.vel[1] * la, ll = Math.hypot(lu, lv), m = ll > 3 ? 3 / ll : 1;
    const f = 1 - Math.exp(-dt * 3.2);
    // the farmer sits a little below centre so there's more to see ahead
    camS.u += (farmer.u + lu * m + SCREEN_UP[0] * 1.4 - camS.u) * f;
    camS.v += (farmer.v + lv * m + SCREEN_UP[1] * 1.4 - camS.v) * f;
  } else if (mode === "pan" && !drag) {
    camS.u += camS.vel[0] * dt; camS.v += camS.vel[1] * dt;
    const damp = Math.exp(-dt * 5);
    camS.vel[0] *= damp; camS.vel[1] *= damp;
  }
  clampCam();
  world.frame(camS.u, camS.v, camS.halfW);
}

// ---------------------------------------------------------------- the reveal: scrub clears, rank grass gives way to lawn, the fence mends
/** Move each piece's pivot to its footprint centre at ground level so it can grow and shrink in place. */
function pivot(o: THREE.Object3D) {
  const m = o as THREE.Mesh;
  if (!m.isMesh || m.userData.pivoted) return;
  m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox!;
  const c = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
  m.geometry.translate(-c.x, -c.y, -c.z);
  m.position.add(c);
  m.userData.pivoted = true;
  m.userData.u = m.position.x;
}
for (const list of [reveal.scrub, reveal.broken, reveal.mended]) list.forEach(pivot);
for (const o of reveal.open) o.traverse(pivot);
reveal.scrub.sort((a, b) => a.position.x - b.position.x);
const mistBase = reveal.mist.map((s) => ({ s, o: (s.material as THREE.SpriteMaterial).opacity, y: s.position.y, sx: s.scale.x }));
const grassInst = (im?: THREE.InstancedMesh) => {
  if (!im) return [];
  const out: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }[] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); out.push({ p, q, s }); }
  return out;
};
const tall = grassInst(reveal.tallGrass), short = grassInst(reveal.shortGrass);
const F0 = AREAS.flats.rect![0], FW = AREAS.flats.rect![1] - F0;
const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const back = (x: number) => { const c = 1.9; const t = Math.max(0, Math.min(1, x)); return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const sweep = (u: number) => (u - F0) / FW; // 0 at the woolshed side, 1 at the far end

function openLand() {
  if (revealed || revealT >= 0) return;
  if (coins < (AREAS.flats.price ?? 0)) { toast("Not enough coins yet"); return; }
  coins -= AREAS.flats.price!;
  (hud.querySelector(".pomb.coins b") as HTMLElement).textContent = String(coins);
  closeCard();
  farmer.path = []; farmer.chase = null; farmer.then = null;
  revealT = 0;
  glideTo([33, -1.5], 18.5, 1.1);
  document.body.dataset.reveal = "running";
}
const M = new THREE.Matrix4(), V1 = new THREE.Vector3();
function stepReveal(dt: number) {
  if (revealT < 0) return;
  const t0 = revealT;
  revealT += dt;
  const t = revealT;
  // mist lifts and drifts off (only if the farm was built with mist; the prototype has none by default)
  for (const m of mistBase) {
    const k = ss(0.4, 2.4, t);
    (m.s.material as THREE.SpriteMaterial).opacity = m.o * (1 - k);
    m.s.position.y = m.y + k * 4;
    m.s.scale.x = m.sx * (1 + 0.35 * k);
    m.s.visible = k < 1;
  }
  // scrub clears in a sweep away from the gate
  for (const o of reveal.scrub) {
    const d = 0.9 + sweep(o.position.x) * 1.5;
    const k = ss(d, d + 0.45, t);
    o.scale.set(1 - 0.5 * k, Math.max(0.001, 1 - k), 1 - 0.5 * k);
    if (k > 0 && k < 1 && t0 < d + 0.05 && t >= d + 0.05) world.dust(o.position.x, -o.position.z, 1.1);
    o.visible = k < 1;
  }
  // rank grass shrinks, lawn grows in, and the ground greens behind the sweep
  if (reveal.tallGrass && reveal.shortGrass && t < 4.5) {
    tall.forEach((g, i) => { const d = 1.0 + sweep(g.p.x) * 1.5, k = 1 - ss(d, d + 0.5, t); reveal.tallGrass!.setMatrixAt(i, M.compose(g.p, g.q, V1.copy(g.s).multiplyScalar(Math.max(0.001, k)))); });
    short.forEach((g, i) => { const d = 1.3 + sweep(g.p.x) * 1.5, k = ss(d, d + 0.6, t); reveal.shortGrass!.setMatrixAt(i, M.compose(g.p, g.q, V1.copy(g.s).multiplyScalar(Math.max(0.001, k)))); });
    reveal.tallGrass.instanceMatrix.needsUpdate = true;
    reveal.shortGrass.instanceMatrix.needsUpdate = true;
    reveal.shortGrass.visible = true;
    const tr = reveal.terrain, arr = tr.attr!.array as Float32Array;
    for (let i = 0; i < tr.idx.length; i++) {
      const d = 1.0 + sweep(tr.at[i * 2]!) * 1.5, k = ss(d, d + 0.7, t), j = tr.idx[i]!;
      arr[j] = tr.from[i * 3]! + (tr.to[i * 3]! - tr.from[i * 3]!) * k;
      arr[j + 1] = tr.from[i * 3 + 1]! + (tr.to[i * 3 + 1]! - tr.from[i * 3 + 1]!) * k;
      arr[j + 2] = tr.from[i * 3 + 2]! + (tr.to[i * 3 + 2]! - tr.from[i * 3 + 2]!) * k;
    }
    tr.attr!.needsUpdate = true;
  }
  // the old sign and broken fence go; new posts stand up one after another around the paddock
  for (const o of reveal.sign) { const k = ss(0.8, 1.3, t); o.scale.y = Math.max(0.001, 1 - k); o.visible = k < 1; }
  for (const o of reveal.broken) { const k = ss(1.1, 1.7, t); o.scale.y = Math.max(0.001, 1 - k); o.visible = k < 1; }
  reveal.mended.forEach((o, i) => {
    const d = 1.6 + (i / reveal.mended.length) * 1.8, k = (t - d) / 0.35;
    o.visible = k > 0;
    o.scale.y = Math.max(0.001, back(k));
    if (t0 < d && t >= d) world.dust(o.position.x, -o.position.z, 0.8);
  });
  reveal.open.forEach((o, i) => { const k = (t - 3.4 - i * 0.12) / 0.4; o.visible = k > 0; o.scale.setScalar(Math.max(0.001, back(k))); });
  if (t0 < 3.9 && t >= 3.9) {
    revealed = true;
    grid.openFlats();
    renderHud();
    toast(`${icon("sparkle")}<b>Creek flats are open!</b> Room for four more`, 3.2);
    for (let i = 0; i < 7; i++) setTimeout(() => pop(screenUV(24 + i * 3, -2 + (i % 3) * 2, 2), icon(i % 2 ? "sparkle" : "heart", "on"), "heart"), i * 90);
  }
  if (t >= 5.2) {
    revealT = -1;
    document.body.dataset.reveal = "done";
    if (mode === "walk") { camS.glide = null; }
  }
}

// ---------------------------------------------------------------- input
let drag: { x: number; y: number; u: number; v: number; moved: boolean; lx: number; ly: number; lt: number } | null = null;
canvas.addEventListener("pointerdown", (e) => {
  voices.unlock();
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, u: camS.u, v: camS.v, moved: false, lx: e.clientX, ly: e.clientY, lt: performance.now() };
  camS.vel = [0, 0];
});
canvas.addEventListener("pointermove", (e) => {
  hoverSheep = pickSheep(e.clientX, e.clientY);
  canvas.style.cursor = hoverSheep ? "pointer" : mode === "pan" ? (drag?.moved ? "grabbing" : "grab") : "";
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
  if (drag.moved && mode === "pan") {
    const per = (2 * camS.halfW) / canvas.clientWidth;
    const upk = per / Math.sin(ISO_PITCH);
    camS.u = drag.u - dx * per * SCREEN_RIGHT[0] + dy * upk * SCREEN_UP[0];
    camS.v = drag.v - dx * per * SCREEN_RIGHT[1] + dy * upk * SCREEN_UP[1];
    camS.glide = null;
    const now = performance.now(), dtm = Math.max(1, now - drag.lt) / 1000;
    const mx = e.clientX - drag.lx, my = e.clientY - drag.ly;
    camS.vel = [(-mx * per * SCREEN_RIGHT[0] + my * upk * SCREEN_UP[0]) / dtm, (-mx * per * SCREEN_RIGHT[1] + my * upk * SCREEN_UP[1]) / dtm];
    drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = now;
    clampCam();
    kick();
  }
});
canvas.addEventListener("pointerup", (e) => {
  const d = drag;
  drag = null;
  if (!d) return;
  if (performance.now() - d.lt > 80) camS.vel = [0, 0];
  if (d.moved) { kick(); return; }
  if (revealT >= 0) return;
  if (mode === "walk") tapWalk(e.clientX, e.clientY);
  else {
    const sh = pickSheep(e.clientX, e.clientY);
    if (sh) { greet(sh, sh.u - 1, sh.v - 1, 2); openCard(sh); }
    else {
      const [u, v] = groundAt(e.clientX, e.clientY);
      if (u > -7.5 && u < 21.5 && v > -6.5 && v < 5.5) glideTo(SIGNS[1]!.focus, SIGNS[1]!.halfW);
      else if (cardSheep) closeCard();
    }
  }
  kick();
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const [lo, hi] = mode === "walk" ? [9, 18] : [9, 34];
  const before = groundAt(e.clientX, e.clientY);
  camS.halfW = Math.max(lo, Math.min(hi, camS.halfW * Math.exp(e.deltaY * 0.0012)));
  world.frame(camS.u, camS.v, camS.halfW);
  if (mode === "pan") { const after = groundAt(e.clientX, e.clientY); camS.u += before[0] - after[0]; camS.v += before[1] - after[1]; clampCam(); }
  kick();
}, { passive: false });

function interact() {
  const spot = currentSpot();
  if (!spot) return;
  if (spot.key.startsWith("sheep:")) { const sh = nearSheep(); if (sh) sayHello(sh); }
  else if (spot.key === "woolshed") work();
  else if (spot.key === "mail") mail();
}
const work = () => { world.hopBirds(); toast(`${icon("yarn")}<b>The birds get to work</b> · carding, spinning, knitting`); };
const mail = () => toast(`${icon("book")}<b>A letter from Old Tom</b> · “Heard the creek flats are going cheap…”`, 3.4);
const startBrush = () => { const sh = nearSheep(); if (sh && !brush) { brush = { sh, t: 0 }; farmer.heading = Math.atan2(sh.v - farmer.v, sh.u - farmer.u); greet(sh, farmer.u, farmer.v, 2); } };
window.addEventListener("keydown", (e) => {
  voices.unlock();
  const k = e.key.toLowerCase();
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) {
    if (mode === "walk") { keys.add(k); e.preventDefault(); }
    else if (k !== "shift") {
      // arrows nudge the camera in pan mode too
      const up = k === "w" || k === "arrowup" ? 1 : k === "s" || k === "arrowdown" ? -1 : 0, rt = k === "d" || k === "arrowright" ? 1 : k === "a" || k === "arrowleft" ? -1 : 0;
      glideTo([camS.u + (SCREEN_UP[0] * up + SCREEN_RIGHT[0] * rt) * 6, camS.v + (SCREEN_UP[1] * up + SCREEN_RIGHT[1] * rt) * 6], camS.halfW, 0.35);
    }
  }
  if (k === "e" && !e.repeat) interact();
  if (k === "f" && !e.repeat) startBrush();
  if (k === "escape") closeCard();
  if (k === "tab") { e.preventDefault(); setMode(mode === "walk" ? "pan" : "walk"); }
  kick();
});
window.addEventListener("keyup", (e) => { const k = e.key.toLowerCase(); keys.delete(k); if (k === "f") brush = null; kick(); });
window.addEventListener("blur", () => { keys.clear(); brush = null; });

ui.addEventListener("pointerdown", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest(".pp.hold")) { startBrush(); e.preventDefault(); }
});
window.addEventListener("pointerup", () => { if (brush && !keys.has("f")) brush = null; });
ui.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const q = (sel: string) => t.closest(sel) as HTMLElement | null;
  if (q(".modesw button")) setMode(q(".modesw button")!.dataset.m as Mode);
  else if (q(".ptag3 .open")) openLand();
  else if (q("#t-flats .tag")) { if (mode === "walk") walkTo(T_AT); else glideTo(SIGNS[2]!.focus, SIGNS[2]!.halfW); }
  else if (q(".pp[data-act]")) { const a = q(".pp[data-act]")!.dataset.act; if (a === "hello") { const sh = nearSheep(); if (sh) sayHello(sh); } else if (a === "work") work(); else if (a === "mail") mail(); }
  else if (q(".fcard .x")) closeCard();
  else if (q(".fcard .second")) { if (cardSheep) brushed(cardSheep); }
  else if (q(".fcard .primary")) toast(`${icon("rings")}Matchmaking lives in the real game`);
  else if (q("[data-sign]")) { const s = SIGNS.find((x) => x.id === q("[data-sign]")!.dataset.sign)!; glideTo(s.focus, s.halfW); hud.querySelectorAll(".sign").forEach((el) => el.classList.toggle("on", el === q("[data-sign]"))); }
  else if (q("[data-zoom]")) { const z = Number(q("[data-zoom]")!.dataset.zoom); const [lo, hi] = mode === "walk" ? [9, 18] : [9, 34]; glideTo([camS.u, camS.v], Math.max(lo, Math.min(hi, camS.halfW * (z > 0 ? 1.3 : 1 / 1.3))), 0.35); }
  else if (q(".mm-stack")) {
    const r = q(".mm-stack")!.getBoundingClientRect();
    const uv = mmToUV(((e.clientX - r.left) / r.width) * MM.w, ((e.clientY - r.top) / r.height) * MM.h);
    if (mode === "walk") walkTo(uv); else glideTo([uv[0], uv[1]], camS.halfW);
  }
  else if (q("#t-ws .plac")) { if (mode === "walk") walkTo(W_AT); else glideTo(SIGNS[1]!.focus, SIGNS[1]!.halfW); }
  else if (q("#t-mail .plac")) { if (mode === "walk") walkTo(M_AT); else mail(); }
  kick();
});

function setMode(m: Mode) {
  if (m === mode) return;
  mode = m;
  keys.clear();
  if (mode === "walk") {
    // drop the farmer in near the middle of the view if they are off screen
    const p = screenUV(farmer.u, farmer.v);
    if (p.x < 0 || p.y < 0 || p.x > canvas.clientWidth || p.y > canvas.clientHeight) {
      const f = grid.nearestFree(camS.u, camS.v);
      if (f) { farmer.u = f[0]; farmer.v = f[1]; }
      world.dust(farmer.u, farmer.v, 1.2);
    }
    camS.halfW = Math.min(camS.halfW, 18);
    glideTo([farmer.u, farmer.v - 0.5], Math.max(11, Math.min(15, camS.halfW)), 0.7);
  }
  farmer.path = []; farmer.chase = null; farmer.then = null;
  walker.root.visible = mode === "walk";
  const url = new URL(location.href);
  url.searchParams.set("mode", mode);
  history.replaceState(null, "", url);
  renderHud();
}

// ---------------------------------------------------------------- loop
function step(dt: number) {
  clock += dt;
  if (mode === "walk" && revealT < 0) stepFarmer(dt);
  else walker.pose(0, dt, clock);
  updateFlock(flock, { u: farmer.u, v: farmer.v, moving: Math.hypot(farmer.vel[0], farmer.vel[1]) > 0.5, present: mode === "walk" }, grid, farm, dt,
    (sh) => world.dust(sh.u - Math.cos(sh.heading) * 0.6, sh.v - Math.sin(sh.heading) * 0.6, 0.4), heartPopLater);
  if (brush) {
    brush.t += dt;
    if (Math.hypot(brush.sh.u - farmer.u, brush.sh.v - farmer.v) > 3.2) brush = null;
    else if (brush.t >= 1.2) { brushed(brush.sh); brush = null; }
  }
  stepReveal(dt);
  world.tick(dt, clock);
  if (world.marker.visible) {
    markerT += dt;
    const s = 1 + Math.sin(markerT * 6) * 0.08;
    world.marker.scale.set(s, 1, s);
    (world.marker.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - Math.max(0, markerT - 0.8) * 2);
    if (!farmer.path.length && markerT > 0.4) world.marker.visible = markerT < 1.3;
  }
  stepCamera(dt);
}
const pendingHearts: Sheep[] = [];
function heartPopLater(sh: Sheep) { pendingHearts.push(sh); }
let frameMs = 16, lastRenderMs = 0;
function draw() {
  if (cardSheep) farm.select(cardSheep.s.name);
  const t0 = performance.now();
  world.render();
  lastRenderMs = performance.now() - t0;
  updateTags();
  while (pendingHearts.length) heartPop(pendingHearts.pop()!);
  if (clock >= mmNext) { updateMinimap(); mmNext = clock + 0.12; }
}
let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  frameMs += ((now - last) - frameMs) * 0.05;
  last = now;
  step(dt);
  draw();
  if (SHOW_FPS) fpsEl.textContent = `${(1000 / frameMs).toFixed(0)} fps · ${frameMs.toFixed(1)} ms · ${world.renderer.info.render.calls} calls · ${(world.renderer.info.render.triangles / 1000).toFixed(0)}k tris${LITE ? " · lite" : ""}`;
  requestAnimationFrame(loop);
}
let kickQueued = false;
/** In test mode nothing runs on its own; after an input, draw once so the page shows it. */
function kick() {
  if (!TEST || kickQueued) return;
  kickQueued = true;
  queueMicrotask(() => { kickQueued = false; world.frame(camS.u, camS.v, camS.halfW); draw(); });
}

window.addEventListener("resize", () => { world.resize(); kick(); });
walker.root.visible = mode === "walk";
if (mode === "pan") { camS.u = -12; camS.v = 0; camS.halfW = 16; }
renderHud();
world.resize();
stepCamera(0);
step(0.001);
draw();

declare global {
  interface Window {
    __proto: {
      state(): unknown;
      advance(sec: number, fps?: number): void;
      screen(u: number, v: number, dy?: number): { x: number; y: number };
      sheepScreen(name: string): { x: number; y: number };
      stats(): { renderMs: number; calls: number; triangles: number; frameMs: number };
    };
  }
}
window.__proto = {
  state: () => ({
    mode, coins, revealed, revealing: revealT >= 0, card: cardSheep?.s.name ?? null,
    farmer: { u: +farmer.u.toFixed(2), v: +farmer.v.toFixed(2), path: farmer.path.length, visible: walker.root.visible },
    camera: { u: +camS.u.toFixed(2), v: +camS.v.toFixed(2), halfW: +camS.halfW.toFixed(2), gliding: !!camS.glide },
    prompt: ppKey, sheep: flock.map((sh) => ({ name: sh.s.name, temper: sh.temper, mode: sh.mode, u: +sh.u.toFixed(2), v: +sh.v.toFixed(2), hearts: sh.hearts })),
  }),
  advance(sec, fps = 30) { const n = Math.max(1, Math.round(sec * fps)); for (let i = 0; i < n; i++) step(1 / fps); draw(); },
  screen: (u, v, dy = 0) => screenUV(u, v, dy),
  sheepScreen: (name) => { const sh = flock.find((s) => s.s.name === name)!; return screenUV(sh.u, sh.v, sh.s.lamb ? 0.55 : 0.8); },
  stats: () => ({ renderMs: lastRenderMs, calls: world.renderer.info.render.calls, triangles: world.renderer.info.render.triangles, frameMs }),
};
if (!TEST) {
  requestAnimationFrame((n) => { last = n; requestAnimationFrame(loop); });
  // warm the card portraits in idle moments so the first tap doesn't hitch
  let i = 0;
  const warm = () => { if (i < flock.length) { photo(flock[i++]!.s); setTimeout(warm, 400); } };
  setTimeout(warm, 1500);
}
document.body.dataset.ready = "1";
