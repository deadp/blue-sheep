// Style lab round 3 entry (DESIGN-v3 §15 item 21): gameplay-view options. Throwaway; the live game is untouched.
//   style-lab-r3.html?view=1..4&shot=play|woolshed|expand|mid|motion&frame=0..5
//   style-lab-r3.html?scene=faces       (round-2 face vs the friendlier face)
// window.__show(shot, frame) re-renders in place (the farm is built once per stage and cached).
import * as THREE from "three";
import "../fonts/fonts.css";
import "../r2/r2.css";
import "./r3.css";
import { makeStage } from "../render.js";
import { MISTY, portraits } from "../r2/stage.js";
import { buildSheep2 } from "../r2/sheep2.js";
import { defs, textureVars } from "../r2/textures.js";
import type { LabSheep } from "../sheep.js";
import { buildFarm, type Farm, type Stage } from "./farm.js";
import { H, projector, stageOf, VIEWS, W, type Shot } from "./views.js";

const params = new URLSearchParams(location.search);
const view = Number(params.get("view") ?? "0");
declare global { interface Window { __show?: (shot: Shot, frame?: number) => Promise<void> } }

const friendly = (m: Parameters<typeof buildSheep2>[0], s: LabSheep, sc?: number) => buildSheep2(m, s, sc, { friendly: true });

async function viewPage() {
  document.body.classList.add("r2", "r3", `v${view}`);
  const app = document.getElementById("app")!;
  app.innerHTML = `<style>${textureVars()}</style>${defs()}<div id="stage"><canvas id="world" width="${W}" height="${H}"></canvas></div><div class="fx rim"></div><div id="ui"></div>`;
  await document.fonts.ready;
  const canvas = document.getElementById("world") as HTMLCanvasElement;
  const stg = makeStage(MISTY, canvas, W, H, true);
  stg.sun.shadow.mapSize.set(4096, 4096);
  const farms = new Map<Stage, Farm>();
  const photos = new Map<string, string>();
  const photo = (s: LabSheep) => {
    if (!photos.has(s.name)) photos.set(s.name, portraits(friendly, [s], 400, 316, 0.78)[0]!);
    return photos.get(s.name)!;
  };
  let shown: Farm | null = null;
  window.__show = async (shot: Shot, frame = 0) => {
    document.body.dataset.ready = "0";
    const st = stageOf(shot);
    if (!farms.has(st)) farms.set(st, buildFarm(st, { backdrop: view !== 1 }).farm);
    const farm = farms.get(st)!;
    if (shown !== farm) { if (shown) stg.scene.remove(shown.root); stg.scene.add(farm.root); shown = farm; }
    farm.farmer.visible = false;
    const out = VIEWS[view]!({ farm, st, photo }, shot, frame);
    stg.scene.fog = out.fog ? new THREE.Fog("#e4ecec", out.fog[0], out.fog[1]) : null;
    // keep the sun's shadow box on what the camera is looking at
    const sc = stg.sun.shadow.camera;
    const half = view === 1 ? 46 : view === 2 ? 60 : 50;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.far = 300;
    sc.updateProjectionMatrix();
    stg.sun.target.position.copy(out.focus);
    stg.sun.position.copy(out.focus).add(new THREE.Vector3(...MISTY.sun.dir).normalize().multiplyScalar(120));
    stg.sun.target.updateMatrixWorld();
    farm.root.updateMatrixWorld(true);
    stg.renderer.render(stg.scene, out.cam);
    document.getElementById("ui")!.innerHTML = out.html(projector(out.cam));
    document.body.dataset.shot = shot;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.body.dataset.ready = "1";
  };
  await window.__show((params.get("shot") ?? "play") as Shot, Number(params.get("frame") ?? "0"));
}

async function faces() {
  document.body.classList.add("r2", "r3", "faces");
  const app = document.getElementById("app")!;
  await document.fonts.ready;
  const col = (red: number, yellow: number, blue: number, dilute = false, white = false) => ({ white, red, yellow, blue, dilute, depth: 1 });
  const five: LabSheep[] = [
    { name: "Pikelet", colour: col(4, 0, 0, true) }, { name: "Bluey", colour: col(0, 0, 4), horns: true },
    { name: "Pickle", colour: col(1, 3, 2) }, { name: "Lavender", colour: col(3, 0, 3, true) }, { name: "Scone", colour: col(0, 0, 0, false, true) },
  ];
  const r2 = portraits(buildSheep2, five, 448, 380, 0.72);
  const r3 = portraits(friendly, five, 448, 380, 0.72);
  const row = (h: string, sub: string, imgs: string[]) => `<div class="srow"><div class="shead"><h2>${h}</h2><small>${sub}</small></div>${imgs.map((src, i) => `<figure><img src="${src}"><figcaption>${five[i]!.name}</figcaption></figure>`).join("")}</div>`;
  app.innerHTML = `<div class="sheep-sheet"><h1>Sheep face: round 2 vs round 3 (friendlier)</h1>${row("Round 2", "natural head, small dark eyes", r2)}${row("Round 3", "head +16%, shorter muzzle, soft eyes in a pale patch", r3)}</div>`;
  document.body.classList.add("scene-sheep");
  requestAnimationFrame(() => { document.body.dataset.ready = "1"; });
}

function index() {
  const shots = ["play", "woolshed", "expand", "mid", "motion"];
  document.getElementById("app")!.innerHTML = `<main class="idx"><h1>Style lab round 3: gameplay views</h1><ul>${[1, 2, 3, 4].map((v) => `<li><b>View ${v}</b> ${shots.map((s) => `<a href="?view=${v}&shot=${s}">${s}</a>`).join(" · ")}</li>`).join("")}<li><a href="?scene=faces">faces</a></li></ul></main>`;
  document.body.dataset.ready = "1";
}

if (params.get("scene") === "faces") void faces();
else if (view >= 1 && view <= 4) void viewPage();
else index();
