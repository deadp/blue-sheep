// Style lab: the HTML layer for each direction and scene. Tiny copy, icons first, two actions max.
import { icon, type IconName } from "./icons.js";
import type { DirId, Direction } from "./styles.js";

export interface Lamb { src: string; hex: string; name: string }
export interface Tag { id: string; label: string; x: number; y: number; icon?: IconName; hex?: string; sub?: string }

export interface SceneData {
  dir: Direction;
  card?: string;
  ewe?: string;
  ram?: string;
  lambs?: Lamb[];
  tags: Tag[];
}

const hearts = (n: number, of = 5) =>
  `<span class="hearts">${Array.from({ length: of }, (_, i) => icon("heart", i < n ? "on" : "off")).join("")}</span>`;

const dots = (n: number, hex: string) =>
  `<span class="dots">${Array.from({ length: 4 }, (_, i) => `<i class="${i < n ? "on" : ""}" style="--c:${hex}"></i>`).join("")}</span>`;

const pigment = () => `<span class="pig">${dots(4, "#c8322f")}${dots(0, "#f2c230")}${dots(0, "#2f5da8")}</span>`;

// ---------------------------------------------------------------- farm (place tags only)

const TAG_ICON: Record<string, IconName> = { homestead: "shed", woolshed: "yarn", bush: "leaf", show: "rosette", creek: "sparkle" };

function placeTags(d: SceneData, minimal = false): string {
  return d.tags
    .map((t) => {
      const ic = t.icon ?? TAG_ICON[t.id] ?? "star";
      return `<div class="tag tag-${t.id}${minimal ? " mini" : ""}" style="left:${t.x}px;top:${t.y}px">
        <span class="tag-in">${icon(ic)}${minimal ? "" : `<b>${t.label}</b>`}${t.id === "show" && !minimal ? icon("arrow", "arr") : ""}</span></div>`;
    })
    .join("");
}

function title(dir: DirId): string {
  const extra = dir === "A" ? `<i class="tape"></i>` : dir === "B" ? `<i class="nail l"></i><i class="nail r"></i>` : "";
  return `<div class="plaque">${extra}<span class="small">welcome to</span><b>Kōwhai Creek</b></div>`;
}

export function farmScene(d: SceneData): string {
  return `${title(d.dir.id)}${placeTags(d)}`;
}

// ---------------------------------------------------------------- HUD

function hudBits(dir: DirId, open: boolean): string {
  const season = `<span class="season">${icon("flower")}<span><b>Spring</b><small>Year 2</small></span></span>`;
  const coins = `<span class="stat coins">${icon("coin")}<b>128</b></span>`;
  const flock = `<span class="stat flock">${icon("sheep")}<b>9</b></span>`;
  const goal = `<div class="goal">${dir === "A" ? `<i class="tape"></i>` : ""}${dir === "B" ? `<i class="chain l"></i><i class="chain r"></i>` : ""}
      ${icon("rosette")}<div><small>Goal</small><b>A true-blue lamb</b><span class="pips"><i class="on"></i><i></i><i></i></span></div></div>`;
  const tray = open
    ? `<div class="tray">
        ${[["store", "Store"], ["shed", "Woolshed"], ["vet", "Vet"], ["book", "Diary"]].map(([i, l]) => `<button class="tray-b">${icon(i as IconName)}<span>${l}</span></button>`).join("")}
      </div>`
    : "";
  const acts = `<div class="acts">${tray}
      <button class="act more${open ? " open" : ""}">${icon("bag")}</button>
      <button class="act sleep">${icon("moon")}<span>Next season</span></button></div>`;
  const tl = dir === "A"
    ? `<div class="hud-tl"><i class="tape"></i>${season}<span class="row">${coins}${flock}</span></div>`
    : dir === "B"
      ? `<div class="hud-tl"><i class="nail l"></i><i class="nail r"></i>${season}${coins}${flock}</div>`
      : `<div class="hud-tl">${season}${coins}${flock}</div>`;
  return `${tl}${goal}${acts}`;
}

export function hudScene(d: SceneData): string {
  return `${placeTags(d, true)}${hudBits(d.dir.id, true)}`;
}

// ---------------------------------------------------------------- sheep card

export function cardScene(d: SceneData): string {
  const id = d.dir.id;
  const deco = id === "A" ? `<i class="rings"></i>` : id === "B" ? `<i class="nail tl"></i><i class="nail tr"></i><i class="nail bl"></i><i class="nail br"></i>` : "";
  const photo = id === "A"
    ? `<div class="photo"><i class="tape"></i><img src="${d.card}" alt=""></div>`
    : `<div class="photo"><img src="${d.card}" alt=""></div>`;
  return `${hudBits(id, false)}
  <div class="card">${deco}
    ${photo}
    <div class="card-head">
      <h1>Pikelet</h1>
      <div class="who">${icon("eye")}<span>curious ewe</span></div>
      ${hearts(3)}
    </div>
    <div class="say">“Is that the smoko tin?”</div>
    <div class="facts">
      <div class="fact colour"><span class="chip" style="--c:#E18E8D"></span>${pigment()}<small>pink</small></div>
      <div class="fact">${icon("yarn")}<b>soft</b></div>
      <div class="fact">${icon("cake")}<b>2</b></div>
    </div>
    <div class="card-acts">
      <button class="btn primary">${icon("rings")}<span>Find a mate</span></button>
      <button class="btn second">${icon("brush")}<span>Brush</span></button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- forecast

export function forecastScene(d: SceneData): string {
  const id = d.dir.id;
  const lambs = (d.lambs ?? [])
    .map((l, i) => `<div class="lamb" style="--c:${l.hex};--i:${i}">${id === "D" ? `<i class="cap"></i>` : ""}<img src="${l.src}" alt=""><i class="sw"></i></div>`)
    .join("");
  const parents = `<div class="parents">
      <div class="par">${id === "A" ? `<i class="tape"></i>` : ""}<img src="${d.ewe}" alt=""><b>Pikelet</b></div>
      <span class="plus">${icon("heart")}</span>
      <div class="par">${id === "A" ? `<i class="tape"></i>` : ""}<img src="${d.ram}" alt=""><b>Bluey</b></div>
    </div>`;
  const deco = id === "A" ? `<i class="spine"></i>` : id === "B" ? `<i class="nail tl"></i><i class="nail tr"></i><i class="nail bl"></i><i class="nail br"></i>` : "";
  return `${hudBits(id, false)}
  <div class="scrim"></div>
  <div class="forecast">${deco}
    <button class="close" aria-label="close">×</button>
    ${parents}
    <div class="litter">${lambs}</div>
    <p class="hint">${icon("sparkle")}<span>Mostly lilac and purple. Maybe a bluey one!</span></p>
    <button class="btn primary commit">${icon("check")}<span>Pair them up!</span></button>
  </div>`;
}

// ---------------------------------------------------------------- sheep close-up

export function sheepScene(d: SceneData): string {
  const tags = d.tags
    .map((t) => `<div class="ntag" style="left:${t.x}px;top:${t.y}px;--c:${t.hex ?? "#fff"}">${d.dir.id === "A" ? `<i class="string"></i>` : ""}<span class="dot"></span><b>${t.label}</b><small>${t.sub ?? ""}</small></div>`)
    .join("");
  return tags;
}

/** Label tile for the contact sheet. */
export function labelTile(dir: Direction): string {
  const P = dir.palette;
  const sw = [P.grass, P.bush, P.tussock, P.water, P.roofRed, P.pohutukawa, P.kowhai, P.ink].map((c) => `<i style="background:${c}"></i>`).join("");
  return `<div class="label-tile">
    <div class="lt-id">${dir.id}</div>
    <h1>${dir.name}</h1>
    <p class="tagline">${dir.tagline}</p>
    <ul>${dir.notes.map((n) => `<li>${n}</li>`).join("")}</ul>
    <div class="sw">${sw}</div>
    <div class="demo">
      <button class="btn primary">${icon("rings")}<span>Find a mate</span></button>
      ${hearts(3)}
    </div>
  </div>`;
}
