// Style lab round 2 entry (DESIGN-v3 §15 item 20). Throwaway exploration; the live game is untouched.
//   style-lab-r2.html?scene=map&concept=a..d&stage=start|mid|late
//   style-lab-r2.html?scene=ui&variant=i|ii|iii&screen=hud|card|forecast|woolshed
//   style-lab-r2.html?scene=sheep
import "../fonts/fonts.css";
import "./r2.css";
import { CONCEPTS, CONCEPT_IDS, type ConceptId } from "./concepts.js";
import { centroid } from "./map.js";
import { H, project, renderMap, W } from "./stage.js";
import { mapOverlay, type MapTag } from "./overlay.js";
import { STAGE_NAMES, type Stage, type StageName } from "./types.js";

const params = new URLSearchParams(location.search);
const scene = params.get("scene") ?? "";

async function mapScene() {
  const id = (params.get("concept") ?? "a") as ConceptId;
  const stageName = (params.get("stage") ?? "start") as StageName;
  const stage = Math.max(0, STAGE_NAMES.indexOf(stageName)) as Stage;
  document.body.classList.add("r2", "scene-map");
  const app = document.getElementById("app")!;
  app.innerHTML = `<div id="stage"><canvas id="world" width="${W}" height="${H}"></canvas></div><div class="fx rim"></div><div id="ui"></div>`;
  await document.fonts.ready;
  const { c, cam, world } = renderMap(id, stage);
  const at = (u: number, v: number, dy: number) => project(cam, world.toWorld(u, v, world.ground(u, v) + dy));
  const tags: MapTag[] = [];
  for (const z of c.zones) {
    const [u, v] = centroid(z.poly);
    if (z.stage > stage) tags.push({ kind: "price", how: z.how, price: z.price ?? 0, label: z.name, ...at(u, v, 1.5), soon: z.stage === stage + 1 });
    else if (z.stage === stage && stage > 0) tags.push({ kind: "new", label: z.name, ...at(u, v, 3) });
  }
  tags.push({ kind: "place", icon: "shed", label: "Homestead", ...at(c.homestead.u, c.homestead.v, 5.5) });
  tags.push({ kind: stage === 2 ? "new" : "place", icon: "yarn", label: stage === 2 ? "Woolshed stations" : "Woolshed", ...at(c.woolshed.u, c.woolshed.v, 6) });
  tags.push({ kind: "place", icon: "rosette", label: "A&P Show", ...at(c.showground.u, c.showground.v, 4.5) });
  tags.push({ kind: "bush", label: ["Native bush: never cleared", "Bush grows with each planting", "Bird edge: tūī, kākā, ruru"][stage]!, ...at(c.bushTag.u, c.bushTag.v, 6) });
  if (c.hut && stage >= c.hut.stage) tags.push({ kind: "place", icon: "shed", label: "Musterers' hut", ...at(c.hut.u, c.hut.v, 4) });
  if (c.jetty) tags.push({ kind: "place", icon: "bag", label: "Trader's jetty", ...at(c.jetty.u + 6, c.jetty.v, 3) });
  document.getElementById("ui")!.innerHTML = mapOverlay(c, stage, tags);
  requestAnimationFrame(() => { document.body.dataset.ready = "1"; });
}

function index() {
  const maps = CONCEPT_IDS.map((id) => `<li><b>${id}. ${CONCEPTS[id].name}</b> ${STAGE_NAMES.map((s) => `<a href="?scene=map&concept=${id}&stage=${s}">${s}</a>`).join(" · ")}</li>`).join("");
  const uis = ["i", "ii", "iii"].map((v) => `<li><b>UI ${v}</b> ${["hud", "card", "forecast", "woolshed"].map((s) => `<a href="?scene=ui&variant=${v}&screen=${s}">${s}</a>`).join(" · ")}</li>`).join("");
  document.getElementById("app")!.innerHTML = `<main class="idx"><h1>Style lab round 2</h1><ul>${maps}${uis}<li><a href="?scene=sheep">sheep compare</a></li></ul></main>`;
  document.body.dataset.ready = "1";
}

const run: Record<string, () => Promise<void> | void> = {
  map: mapScene,
  ui: async () => (await import("./uiScene.js")).uiScene(params),
  sheep: async () => (await import("./sheepScene.js")).sheepScene(),
};
void (run[scene] ?? index)();
