// Style lab round 2: felt & fibre UI (DESIGN-v3 §15 item 20) over the Misty Pastoral world.
// Three skins share one markup: (i) felted wool, (ii) chunky knit, (iii) woven tweed. Decorative
// hooks (pom-poms, toggles, stitches) are always in the markup; each skin shows its own.
// Copy stays tiny, icons big, at most two primary actions per panel.
import type { ColourInput } from "@blue-sheep/genetics";
import { hexOf, type LabSheep } from "../sheep.js";
import { bird, type BirdId } from "./birds.js";
import { icon, type Icon2 } from "./icons2.js";
import { buildSheep2 } from "./sheep2.js";
import { H, portraits, project, renderMap, W } from "./stage.js";
import { defs, textureVars } from "./textures.js";
import "./ui.css";

const col = (red: number, yellow: number, blue: number, dilute = false): ColourInput => ({ white: false, red, yellow, blue, dilute, depth: 1 });
const PIKELET: LabSheep = { name: "Pikelet", colour: col(4, 0, 0, true) };
const BLUEY: LabSheep = { name: "Bluey", colour: { ...col(0, 0, 4), depth: 1.05 }, horns: true };
const LITTER: ColourInput[] = [
  col(2, 0, 2, true), col(2, 0, 2, true), col(2, 0, 2, true), col(1, 0, 2, true), col(2, 0, 1, true),
  col(2, 0, 2), col(2, 0, 2), col(1, 0, 2), col(2, 0, 3), col(1, 0, 3),
];

const hearts = (n: number, of = 5) => `<span class="hearts">${Array.from({ length: of }, (_, i) => icon("heart", i < n ? "on" : "off")).join("")}</span>`;
const dots = (n: number, hex: string) => `<span class="dots">${Array.from({ length: 4 }, (_, i) => `<i class="${i < n ? "on" : ""}" style="--c:${hex}"></i>`).join("")}</span>`;
const pigment = () => `<span class="pig">${dots(4, "#c8322f")}${dots(0, "#e8b52a")}${dots(0, "#2f5da8")}</span>`;
const btn = (cls: string, ic: Icon2, label: string) => `<button class="btn ${cls}"><i class="toggle"></i>${icon(ic)}<span>${label}</span></button>`;
const panel = (cls: string, inner: string) => `<div class="panel ${cls}"><i class="pom p1"></i><i class="cable"></i><div class="patch">${inner}</div></div>`;

function hud(open: boolean): string {
  const season = `<div class="badge season"><i class="pomball"></i>${icon("flower")}<span><b>Spring</b><small>Year 2</small></span></div>`;
  const coins = `<div class="badge stat"><i class="pomball"></i>${icon("coin")}<b>128</b></div>`;
  const flock = `<div class="badge stat flock"><i class="pomball"></i>${icon("sheep")}<b>9</b></div>`;
  const goal = `<div class="goal"><i class="toggle"></i>${icon("rosette")}<b>A true-blue lamb</b><span class="pips"><i class="on"></i><i></i><i></i></span></div>`;
  const tray = open
    ? `<div class="tray">${([["store", "Store"], ["yarn", "Woolshed"], ["vet", "Vet"], ["book", "Diary"]] as [Icon2, string][]).map(([i, l]) => `<button class="tray-b">${icon(i)}<span>${l}</span></button>`).join("")}</div>`
    : "";
  return `<div class="hud-tl">${season}${coins}${flock}</div>${goal}<div class="acts">${tray}<button class="act more">${icon("bag")}</button>${btn("primary sleep", "moon", "Next season")}</div>`;
}

function card(photo: string): string {
  return panel("card", `
    <div class="photo"><img src="${photo}" alt=""></div>
    <h1 class="name">Pikelet</h1>
    <div class="who">${icon("eye")}<span>curious ewe</span></div>
    ${hearts(3)}
    <div class="say">“Is that the smoko tin?”</div>
    <div class="facts">
      <div class="fact colour"><span class="chip" style="--c:${hexOf(PIKELET.colour)}"></span>${pigment()}<small>pink</small></div>
      <div class="fact">${icon("fleece")}<b>soft</b></div>
      <div class="fact">${icon("cake")}<b>2</b></div>
    </div>
    <div class="card-acts">${btn("primary", "rings", "Find a mate")}${btn("second", "brush", "Brush")}</div>`);
}

function forecast(ewe: string, ram: string, lambs: string[]): string {
  const litter = lambs.map((src, i) => `<div class="lamb" style="--c:${hexOf(LITTER[i]!)}"><img src="${src}" alt=""><i class="sw"></i></div>`).join("");
  return `<div class="scrim"></div>` + panel("forecast", `
    <button class="close">×</button>
    <div class="parents">
      <div class="par"><img src="${ewe}" alt=""><b class="name">Pikelet</b></div>
      <span class="plus">${icon("heart")}</span>
      <div class="par"><img src="${ram}" alt=""><b class="name">Bluey</b></div>
    </div>
    <div class="litter">${litter}</div>
    <p class="hint">${icon("sparkle")}<span>Mostly lilac and purple. Maybe a bluey one!</span></p>
    ${btn("primary commit", "check", "Pair them up!")}`);
}

const STATIONS: { id: BirdId; bird: string; job: string; ic: Icon2; hearts: number; from: string; to: Icon2; toHex: string; left: number; note: string }[] = [
  { id: "kaka", bird: "Kākā", job: "Carding", ic: "comb", hearts: 4, from: "#e8e1d2", to: "fleece", toHex: "#e8e1d2", left: 3, note: "strong wool" },
  { id: "tui", bird: "Tūī", job: "Spinning", ic: "spindle", hearts: 3, from: "#E18E8D", to: "yarn", toHex: "#E18E8D", left: 2, note: "fine wool" },
  { id: "piwakawaka", bird: "Pīwakawaka", job: "Knitting", ic: "needles", hearts: 5, from: "#C0A9CF", to: "jumper", toHex: "#C0A9CF", left: 1, note: "quick hands" },
];

function woolshed(): string {
  const st = STATIONS.map((s) => `
    <div class="station st-${s.id}">
      <div class="st-head">${icon(s.ic)}<b>${s.job}</b></div>
      <div class="bird-patch">${bird(s.id)}</div>
      <b class="name">${s.bird}</b>
      ${hearts(s.hearts)}
      <div class="job"><span class="sw-in" style="--c:${s.from}">${icon("fleece")}</span>${icon("arrow", "to")}<span class="sw-out" style="--c:${s.toHex}">${icon(s.to)}</span></div>
      <div class="left">${Array.from({ length: 3 }, (_, i) => `<i class="${i < s.left ? "on" : ""}"></i>`).join("")}</div>
    </div>`).join("");
  return `<div class="scrim"></div>` + panel("woolshed", `
    <button class="close">×</button>
    <div class="ws-head"><h1 class="name">Woolshed</h1><span class="chip-row"><span class="mini">${icon("fleece")}<b>6</b></span><span class="mini">${icon("sun")}<b>Spring clip</b></span></span></div>
    <div class="stations">${st}</div>
    <div class="ws-acts">${btn("primary", "play", "Work the day")}${btn("second", "swap", "Swap birds")}</div>`);
}

export async function uiScene(p: URLSearchParams): Promise<void> {
  const variant = p.get("variant") ?? "i";
  const screen = p.get("screen") ?? "hud";
  document.body.classList.add("r2", "ui", `v-${variant}`, `screen-${screen}`);
  const app = document.getElementById("app")!;
  app.innerHTML = `<style>${textureVars()}</style>${defs()}<div id="stage"><canvas id="world" width="${W}" height="${H}"></canvas></div><div class="fx rim"></div><div id="ui"></div>`;
  await document.fonts.ready;
  const view = { hud: { u: -12, v: 0, halfW: 30 }, card: { u: -8, v: -1, halfW: 26 }, forecast: { u: -12, v: 0, halfW: 30 }, woolshed: { u: -10, v: -7, halfW: 24 } }[screen] ?? { u: -12, v: 0, halfW: 30 };
  const { c, cam, world } = renderMap("a", 1, view);
  const at = (u: number, v: number, dy: number) => project(cam, world.toWorld(u, v, world.ground(u, v) + dy));
  let html = "";
  if (screen === "hud") {
    const tags: [Icon2, { x: number; y: number }][] = [["shed", at(c.homestead.u, c.homestead.v, 5.5)], ["yarn", at(c.woolshed.u, c.woolshed.v, 6)]];
    html += tags.map(([ic, pt]) => `<div class="pl" style="left:${pt.x}px;top:${pt.y}px"><span class="plb">${icon(ic)}</span></div>`).join("");
    html += hud(true);
  } else if (screen === "card") {
    const [photo] = portraits(buildSheep2, [PIKELET], 520, 420, 0.8);
    html += hud(false) + card(photo!);
  } else if (screen === "forecast") {
    const lambs: LabSheep[] = LITTER.map((colour, i) => ({ name: `lamb${i}`, colour, lamb: true }));
    const shots = portraits(buildSheep2, [PIKELET, BLUEY, ...lambs], 240, 200, 0.85, 0.72);
    html += hud(false) + forecast(shots[0]!, shots[1]!, shots.slice(2));
  } else {
    html += hud(false) + woolshed();
  }
  document.getElementById("ui")!.innerHTML = html;
  requestAnimationFrame(() => { document.body.dataset.ready = "1"; });
}
