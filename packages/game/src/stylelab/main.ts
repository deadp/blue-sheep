// Style lab entry: style-lab.html?dir=A..D&scene=farm|hud|card|forecast|sheep|label
// Without params it shows an index of every shot for a human to click through.
import * as THREE from "three";
import type { ColourInput } from "@blue-sheep/genetics";
import "./fonts/fonts.css";
import "./lab.css";
import { FILTERS } from "./icons.js";
import { makeStage, Mats } from "./render.js";
import { buildSheep, hexOf, nameOf, TRIO, type LabSheep } from "./sheep.js";
import { DIR_IDS, DIRECTIONS, type DirId, type Direction } from "./styles.js";
import { cardScene, farmScene, forecastScene, hudScene, labelTile, sheepScene, type Lamb, type SceneData, type Tag } from "./ui.js";
import { buildValley, creekV, placeSheep, SPOTS, type Valley } from "./valley.js";

const SCENES = ["farm", "hud", "card", "forecast", "sheep", "label"] as const;
type Scene = (typeof SCENES)[number];

const params = new URLSearchParams(location.search);
const dirId = (params.get("dir") ?? "") as DirId;
const scene = (params.get("scene") ?? "farm") as Scene;
const W = 1280, H = 800;
const CAM_DIR = new THREE.Vector3(1, 0.98, 1).normalize();

const col = (red: number, yellow: number, blue: number, dilute = false, depth = 1, white = false): ColourInput => ({ white, red, yellow, blue, dilute, depth });

/** The flock in the valley: mostly pale founders, with the trio among them. */
const FLOCK: [LabSheep, number, number, number][] = [
  [{ name: "Scone", colour: col(0, 0, 0, false, 1, true) }, -20, -0.5, 0.4],
  [{ name: "Lamington", colour: col(0, 0, 0) }, -17.5, 1.5, 2.2],
  [{ name: "Jandal", colour: col(0, 2, 1, true) }, -12, -1.2, -0.8],
  [{ name: "Tiny", colour: col(4, 0, 0, true), lamb: true }, -14.2, -0.1, 1.2],
  [{ name: "Buzzy", colour: col(0, 0, 2, true) }, -22, 2.2, -2.4],
  [{ name: "Flat White", colour: col(0, 0, 0, false, 1, true) }, -8, -14, 0.9],
  [{ name: "Hokey", colour: col(1, 3, 0, true) }, -3, -16.5, 2.5],
  [{ name: "Pōkē", colour: col(0, 0, 0) }, 1, -13, -1.5],
  [{ name: "Marmite", colour: col(3, 3, 3) }, -11, -17, 0.3],
  [{ name: "Tussock", colour: col(0, 0, 0, false, 1, true) }, -28, 14, 1.4],
  [{ name: "Ridge", colour: col(0, 1, 0, true) }, -21, 17.2, -0.4],
  [{ name: "Summit", colour: col(0, 0, 0) }, -25, 20.3, 2.9],
];

/** Pikelet (pastel pink) × Bluey (true blue): ten lambs, sorted by colour. */
const LITTER: ColourInput[] = [
  col(2, 0, 2, true), col(2, 0, 2, true), col(2, 0, 2, true), col(1, 0, 2, true), col(2, 0, 1, true),
  col(2, 0, 2), col(2, 0, 2), col(1, 0, 2), col(2, 0, 3), col(1, 0, 3),
];

function frame(cam: THREE.OrthographicCamera, target: THREE.Vector3, halfW: number) {
  cam.left = -halfW; cam.right = halfW; cam.top = halfW * (H / W); cam.bottom = -halfW * (H / W);
  cam.near = 1; cam.far = 500;
  cam.position.copy(target).addScaledVector(CAM_DIR, 160);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

function project(cam: THREE.Camera, p: THREE.Vector3): { x: number; y: number } {
  const v = p.clone().project(cam);
  return { x: Math.round(((v.x + 1) / 2) * W), y: Math.round(((1 - v.y) / 2) * H) };
}

/** Transparent studio portraits of sheep in the direction's style. */
function portraits(dir: Direction, list: LabSheep[], w: number, h: number): string[] {
  const canvas = document.createElement("canvas");
  const st = makeStage(dir, canvas, w, h, true);
  st.sun.castShadow = false;
  // close-up: the ink line would swamp a small lamb, so draw it finer
  const mats = new Mats({ ...dir, outline: dir.outline * 0.4 });
  const cam = new THREE.PerspectiveCamera(26, w / h, 0.1, 50);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: dir.id === "A" ? 0.08 : 0.16 }));
  shadow.scale.set(1.2, 1, 0.8);
  shadow.position.y = 0.01;
  st.scene.add(shadow);
  const out: string[] = [];
  for (const s of list) {
    const g = buildSheep(mats, s);
    g.rotation.y = s.lamb ? 0.35 : -0.15;
    st.scene.add(g);
    const lamb = !!s.lamb;
    const t = new THREE.Vector3(0.12, lamb ? 0.52 : 0.72, 0);
    cam.position.set(t.x + 3.1, t.y + 1.0, t.z + 3.4).multiplyScalar(lamb ? 0.8 : 1);
    cam.lookAt(t);
    st.renderer.render(st.scene, cam);
    out.push(canvas.toDataURL("image/png"));
    st.scene.remove(g);
  }
  st.renderer.dispose();
  st.renderer.forceContextLoss();
  return out;
}

function fxLayers(): string {
  return `<div class="fx paper"></div><div class="fx vignette"></div><div class="fx tilt top"></div><div class="fx tilt bot"></div>`;
}

async function renderScene(dir: Direction) {
  document.body.classList.add(`dir-${dir.id}`, `scene-${scene}`);
  const app = document.getElementById("app")!;
  app.insertAdjacentHTML("beforeend", FILTERS);
  if (scene === "label") {
    app.insertAdjacentHTML("beforeend", `<div id="stage"></div><div id="ui">${labelTile(dir)}</div>${fxLayers()}`);
    await document.fonts.ready;
    document.body.dataset.ready = "1";
    return;
  }
  app.insertAdjacentHTML("beforeend", `<div id="stage"><canvas id="world" width="${W}" height="${H}"></canvas></div>${fxLayers()}<div id="ui"></div>`);
  const canvas = document.getElementById("world") as HTMLCanvasElement;
  const st = makeStage(dir, canvas, W, H, true);
  const mats = new Mats(dir);
  const valley: Valley = buildValley(dir, mats);
  st.scene.add(valley.root);
  valley.root.updateMatrixWorld(true);
  if (dir.fog) st.scene.fog = new THREE.Fog("#e4edf0", 150, 300);

  const close = scene === "sheep";
  const trioAt: [number, number][] = [[-16.2, 0.2], [-14.3, -0.9], [-12.6, 0.5]];
  for (const [s, u, v, r] of FLOCK) {
    if (close && Math.hypot(u + 14.4, v) < 7) continue;
    placeSheep(valley, mats, s, u, v, r, scene === "farm" ? 1.9 : 1.5);
  }
  const trio = TRIO.map((s, i) => placeSheep(valley, mats, s, trioAt[i]![0], trioAt[i]![1], [-0.75, -1.35, -2.2][i]!, 1.5));

  const cam = new THREE.OrthographicCamera();
  const views: Record<Exclude<Scene, "label">, [number, number, number, number]> = {
    farm: [2, 7, 0, 48],
    hud: [-10, 3, 0, 30],
    card: [-7, 2, 0, 26],
    forecast: [-9, 3, 0, 28],
    sheep: [-14.4, -0.1, 1.0, 4.6],
  };
  const [cu, cv, cy, halfW] = views[scene];
  const target = valley.toWorld(cu, cv, valley.ground(cu, cv) + cy);
  frame(cam, target, halfW);
  st.sun.target.position.copy(target);
  st.sun.position.copy(target).add(new THREE.Vector3(...dir.sun.dir).multiplyScalar(80));
  if (close) {
    const sc = st.sun.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12;
    sc.updateProjectionMatrix();
  }
  st.renderer.render(st.scene, cam);

  const tags: Tag[] = [];
  const at = (u: number, v: number, dy: number) => project(cam, valley.toWorld(u, v, valley.ground(u, v) + dy));
  if (scene === "farm" || scene === "hud") {
    const home = at(SPOTS.homestead.u, SPOTS.homestead.v, 5.5), shed = at(SPOTS.woolshed.u, SPOTS.woolshed.v, 5.8);
    tags.push({ id: "homestead", label: "Homestead", x: home.x - 30, y: home.y });
    tags.push({ id: "woolshed", label: "Woolshed", x: shed.x + 30, y: shed.y });
    if (scene === "farm") {
      tags.push({ id: "bush", label: "ngahere", ...at(27, 13, 7) });
      tags.push({ id: "creek", label: "the awa", ...at(-33, creekV(-33), 1.5) });
      tags.push({ id: "show", label: "A&P Show", ...at(SPOTS.showground.u, SPOTS.showground.v, 5) });
    }
  }
  const TRIO_WORD = ["pink", "true blue", "olive"];
  if (close) {
    trio.forEach((g, i) => {
      const p = g.position.clone().add(new THREE.Vector3(0, 2.35, 0));
      const s = TRIO[i]!;
      tags.push({ id: s.name, label: s.name, sub: TRIO_WORD[i]!, hex: hexOf(s.colour), ...project(cam, valley.root.localToWorld(p)) });
    });
  }

  const data: SceneData = { dir, tags };
  if (scene === "card") data.card = portraits(dir, [TRIO[0]!], 520, 440)[0]!;
  if (scene === "forecast") {
    const lambs: LabSheep[] = LITTER.map((c, i) => ({ name: `lamb${i}`, colour: c, lamb: true }));
    const shots = portraits(dir, [TRIO[0]!, TRIO[1]!, ...lambs], 240, 210);
    data.ewe = shots[0]!;
    data.ram = shots[1]!;
    data.lambs = LITTER.map((c, i): Lamb => ({ src: shots[i + 2]!, hex: hexOf(c), name: nameOf(c) }));
  }
  const ui = document.getElementById("ui")!;
  ui.innerHTML = { farm: farmScene, hud: hudScene, card: cardScene, forecast: forecastScene, sheep: sheepScene }[scene](data);
  await document.fonts.ready;
  requestAnimationFrame(() => { document.body.dataset.ready = "1"; });
}

function index() {
  document.body.classList.add("lab-index");
  const rows = DIR_IDS.map((id) => {
    const d = DIRECTIONS[id];
    const links = SCENES.map((s) => `<a href="?dir=${id}&scene=${s}">${s}</a>`).join(" · ");
    return `<li><b>${id}. ${d.name}</b> — ${d.tagline}<br>${links}</li>`;
  }).join("");
  document.getElementById("app")!.innerHTML = `<main class="idx"><h1>Blue Sheep of Kōwhai Creek: style lab</h1><ul>${rows}</ul></main>`;
  document.body.dataset.ready = "1";
}

const dir = DIRECTIONS[dirId];
if (dir && (SCENES as readonly string[]).includes(scene)) void renderScene(dir);
else index();
