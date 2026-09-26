/**
 * Dev preview for the UI panels (no 3D world). Not part of the game build.
 *   /ui-dev.html                         gallery: every panel for a fixture, one after another
 *   /ui-dev.html?fx=act2&panel=forecast  one panel in the real overlay over a fake field, clickable
 * Fixtures: fresh, afterFirst, midAct1, act2, act3, act4.
 */
import "./styles.css";
import {
  acceptOrder, advanceSeason, buySheep, declineOrder, enterFair, hireVisitingRam, planMating, sellSheep, vetTest,
  type GameState, type Goal,
} from "../core/index.js";
import { fixtures } from "./fixtures.js";
import { Overlay, PANEL_NAMES, delegateActions, hudHtml, panelOptions, renderPanel, toast, type PanelName, type View } from "./index.js";
import { COLOUR_HEX } from "./util.js";

const params = new URLSearchParams(location.search);
const FX = fixtures(Number(params.get("seed") ?? 7));
const fx = FX.find((f) => f.name === (params.get("fx") ?? "afterFirst")) ?? FX[1]!;
const state: GameState = fx.state;

function portraitFor(id: string): string {
  const s = state.sheep[id];
  const wool = COLOUR_HEX[String(s?.phenotype["colour"] ?? "white")] ?? "#ccc";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='#e6f0d8'/><ellipse cx='30' cy='36' rx='20' ry='15' fill='${wool}' stroke='#3b3330' stroke-width='3'/><ellipse cx='48' cy='30' rx='8' ry='7' fill='#4a3f3b' stroke='#3b3330' stroke-width='2'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** ?sheep=young → the youngest flock sheep with grandparents on record (for the tree). */
function pickSheep(p: string | null): string | null {
  if (p !== "young") return p;
  const ids = state.flock.filter((id) => { const s = state.sheep[id]!; return s.dam && state.sheep[s.dam]?.dam; });
  return ids[ids.length - 1] ?? state.flock[0] ?? null;
}

const view: View = {
  panel: (params.get("panel") as PanelName | null) ?? null, sheepId: pickSheep(params.get("sheep")), mateId: null,
  goal: (params.get("goal") as Goal | null) ?? "blue", tab: params.get("tab"), report: fx.report, portraits: portraitFor,
};

const hud = document.querySelector<HTMLElement>("#hud")!;
const gallery = document.querySelector<HTMLElement>("#gallery")!;

function renderHud(): void { hud.innerHTML = hudHtml(state, view); }

const overlay = new Overlay((d) => {
  try {
    if (d["goal"]) view.goal = d["goal"] as Goal;
    else if (d["mate"]) view.mateId = d["mate"];
    else if (d["open"]) { view.panel = d["open"] as PanelName; if (d["tab"] !== undefined) view.tab = d["tab"]; if (d["sheepId"]) view.sheepId = d["sheepId"]; }
    else if (d["tab"] !== undefined) view.tab = d["tab"] || null;
    else if (d["sheep"]) { view.panel = "sheep"; view.sheepId = d["sheep"]; }
    else if (d["findmate"]) { view.panel = "forecast"; view.sheepId = d["findmate"]; view.mateId = null; }
    else if (d["plan"]) { const [e, r] = d["plan"].split(":"); planMating(state, e!, r!); }
    else if (d["buy"]) buySheep(state, d["buy"]);
    else if (d["sell"]) sellSheep(state, d["sell"]);
    else if (d["hire"]) hireVisitingRam(state);
    else if (d["test"]) { const [id, l] = d["test"].split(":"); vetTest(state, id!, l!); }
    else if (d["accept"]) acceptOrder(state, d["accept"]);
    else if (d["decline"]) declineOrder(state, d["decline"]);
    else if (d["enter"]) enterFair(state, d["enter"] === "none" ? null : d["enter"]);
    else if (d["sleep"]) { view.report = advanceSeason(state); view.panel = "report"; }
    else if (d["toggle"]) view.reducedMotion = !view.reducedMotion;
    else toast(`(dev) action ${JSON.stringify(d)}`);
  } catch (e) { toast((e as Error).message); }
  refresh();
});
overlay.onClose = () => { view.panel = null; renderHud(); };
delegateActions(hud, (d) => {
  if (d["open"]) view.panel = d["open"] as PanelName;
  if (d["sleep"]) { view.report = advanceSeason(state); view.panel = "report"; }
  refresh();
});

function refresh(): void {
  renderHud();
  if (view.panel) overlay.show(renderPanel(state, view), panelOptions(view.panel));
  else overlay.close();
  document.body.dataset.panel = view.panel ?? "";
}

if (params.has("panel") || params.has("single")) {
  document.body.classList.add("single");
  refresh();
} else {
  document.body.classList.add("gallery-mode");
  renderHud();
  gallery.innerHTML = `<h1>UI gallery · fixture “${fx.name}” · act ${state.act}</h1>` + PANEL_NAMES.map((p) => {
    const html = renderPanel(state, { ...view, panel: p });
    const o = panelOptions(p);
    return `<section><h2 class="g-h">${p}</h2><div class="panel ${o.wide ? "wide" : ""}">${html}</div></section>`;
  }).join("");
}
document.body.dataset.ready = "1";
