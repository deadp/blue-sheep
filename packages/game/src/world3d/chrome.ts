// The world's own felt chrome (DESIGN-v3 §15 items 22–24): the walk / pan switch, felt price tags on locked
// land, little placards on the places, walk-up prompts (E say hello, F hold to brush, E at a building), the
// controls hint, and in pan mode the signposts and the felt minimap. Plain HTML over the canvas, styled by
// chrome.css with the felt tokens; icons are the embroidered set (ui/felt/icons.ts is pure strings).
import "./chrome.css";
import { icon, type IconName } from "../ui/felt/icons.js";
import type { AreaId, Hotspot, LandInfo, MoveMode } from "./types.js";
import { AREAS, AREA_IDS, BRIDGE, SPOTS, TREES, bushScore, creekV, roadV, type UV } from "./valley.js";

export interface ChromeHandlers {
  mode(m: MoveMode): void;
  /** "Open this land" on a price tag. */
  area(id: AreaId): void;
  /** The tag itself or a signpost: go and have a look. */
  goto(where: { area?: AreaId; spot?: Hotspot | "home"; u?: number; v?: number }): void;
  /** A prompt was clicked (E) or its hold started/stopped (F). */
  prompt(act: "hello" | "use" | "brush-down" | "brush-up"): void;
}

export interface PromptSpec { key: string; act: "hello" | "use"; label: string; hold?: { label: string } }

const PLACES: { id: Hotspot; ic: IconName; label: string }[] = [
  { id: "house", ic: "house", label: "Home" },
  { id: "shed", ic: "board", label: "Woolshed" },
  { id: "market", ic: "store", label: "Trader" },
  { id: "vet", ic: "vet", label: "Vet" },
  { id: "fairground", ic: "rosette", label: "Showground" },
  { id: "mailbox", ic: "mail", label: "Mail" },
];

const SIGNS: { id: string; name: string; ic: IconName; area?: AreaId; spot?: Hotspot | "home" }[] = [
  { id: "home", name: "Home paddock", ic: "sheep", spot: "home" },
  { id: "shed", name: "Woolshed", ic: "board", spot: "shed" },
  { id: "flats", name: "Creek flats", ic: "leaf", area: "flats" },
  { id: "farbank", name: "Far bank", ic: "fence", area: "farbank" },
  { id: "road", name: "The road", ic: "store", spot: "market" },
];

/** Minimap window over the valley (farm u, v). */
export const MM = { u0: -66, u1: 92, v0: -30, v1: 40, w: 220, h: 98 };
const mmX = (u: number) => ((u - MM.u0) / (MM.u1 - MM.u0)) * MM.w;
const mmY = (v: number) => MM.h - ((v - MM.v0) / (MM.v1 - MM.v0)) * MM.h;
export const mmToUV = (x: number, y: number): UV => [MM.u0 + (x / MM.w) * (MM.u1 - MM.u0), MM.v0 + ((MM.h - y) / MM.h) * (MM.v1 - MM.v0)];

export class WorldChrome {
  readonly el: HTMLDivElement;
  private readonly tags: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly sw: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly signs: HTMLDivElement;
  private readonly mm: HTMLDivElement;
  private readonly mmBase: HTMLCanvasElement;
  private readonly mmLive: HTMLCanvasElement;
  private mode: MoveMode = "walk";
  private land = new Map<AreaId, LandInfo>();
  private landKey = "";
  private promptKey = "";
  private readonly placeEls = new Map<Hotspot, HTMLElement>();
  private readonly tagEls = new Map<AreaId, HTMLElement>();

  constructor(container: HTMLElement, private readonly h: ChromeHandlers) {
    this.el = document.createElement("div");
    this.el.className = "w3d-chrome";
    this.el.innerHTML = `<div class="w3d-tags"></div><div class="w3d-prompt"></div>
      <div class="w3d-switch felt" role="group" aria-label="How to get about">
        <button data-move="walk" title="Walk the farmer (Tab switches)">${icon("paw")}<span>Walk</span></button>
        <button data-move="pan" title="Look around the farm (Tab switches)">${icon("eye")}<span>Pan</span></button><i class="knob"></i></div>
      <div class="w3d-hint felt"></div>
      <div class="w3d-signs"></div>
      <div class="w3d-mm felt"><div class="mm-stack"><canvas class="mm-base"></canvas><canvas class="mm-live"></canvas></div></div>`;
    container.appendChild(this.el);
    const q = <T extends Element>(s: string) => this.el.querySelector(s) as T;
    this.tags = q(".w3d-tags");
    this.prompt = q(".w3d-prompt");
    this.sw = q(".w3d-switch");
    this.hint = q(".w3d-hint");
    this.signs = q(".w3d-signs");
    this.mm = q(".w3d-mm");
    this.mmBase = q(".mm-base");
    this.mmLive = q(".mm-live");
    for (const c of [this.mmBase, this.mmLive]) { c.width = MM.w * 2; c.height = MM.h * 2; c.style.width = `${MM.w}px`; c.style.height = `${MM.h}px`; }
    for (const p of PLACES) {
      const e = document.createElement("button");
      e.className = "w3d-plac";
      e.dataset.place = p.id;
      e.innerHTML = `<span class="disc">${icon(p.ic)}</span><span class="lab">${p.label}</span>`;
      e.title = p.label;
      this.tags.appendChild(e);
      this.placeEls.set(p.id, e);
    }
    this.el.addEventListener("click", this.onClick);
    this.el.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointerup", this.onUp);
    this.setMode("walk", true);
  }

  private readonly onClick = (ev: MouseEvent): void => {
    const t = ev.target as HTMLElement;
    const q = (s: string) => t.closest(s) as HTMLElement | null;
    if (q("[data-move]")) this.h.mode(q("[data-move]")!.dataset.move as MoveMode);
    else if (q("[data-open-area]")) this.h.area(q("[data-open-area]")!.dataset.openArea as AreaId);
    else if (q("[data-tag]")) this.h.goto({ area: q("[data-tag]")!.dataset.tag as AreaId });
    else if (q("[data-sign]")) { const s = SIGNS.find((x) => x.id === q("[data-sign]")!.dataset.sign)!; this.h.goto(s.area ? { area: s.area } : { spot: s.spot! }); }
    else if (q("[data-place]")) this.h.goto({ spot: q("[data-place]")!.dataset.place as Hotspot });
    else if (q("[data-act=hello]")) this.h.prompt("hello");
    else if (q("[data-act=use]")) this.h.prompt("use");
    else if (q(".mm-stack")) {
      const r = q(".mm-stack")!.getBoundingClientRect();
      const [u, v] = mmToUV(((ev.clientX - r.left) / r.width) * MM.w, ((ev.clientY - r.top) / r.height) * MM.h);
      this.h.goto({ u, v });
    }
  };
  private holding = false;
  private readonly onDown = (ev: PointerEvent): void => {
    if ((ev.target as HTMLElement).closest("[data-act=brush]")) { this.holding = true; this.h.prompt("brush-down"); ev.preventDefault(); }
  };
  private readonly onUp = (): void => { if (this.holding) { this.holding = false; this.h.prompt("brush-up"); } };

  setMode(m: MoveMode, force = false): void {
    if (m === this.mode && !force) return;
    this.mode = m;
    this.sw.dataset.mode = m;
    for (const b of Array.from(this.sw.querySelectorAll<HTMLElement>("button"))) b.classList.toggle("on", b.dataset.move === m);
    this.el.dataset.mode = m;
    this.hint.innerHTML = m === "walk"
      ? `<span class="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>or tap to walk</span><span class="sep"></span><kbd>E</kbd><span>talk</span><kbd>F</kbd><span>hold to brush</span>`
      : `${icon("paw")}<span>Drag to look · scroll to zoom · tap a sheep</span>`;
    this.renderSigns();
  }

  setLand(list: LandInfo[]): void {
    const key = JSON.stringify(list);
    if (key === this.landKey) return;
    this.landKey = key;
    this.land = new Map(list.map((l) => [l.id, l]));
    for (const id of AREA_IDS) {
      if (id === "home") continue;
      const l = this.land.get(id);
      let e = this.tagEls.get(id);
      if (!l || l.state === "open") { e?.remove(); this.tagEls.delete(id); continue; }
      if (!e) { e = document.createElement("div"); e.className = "w3d-ptag"; this.tags.appendChild(e); this.tagEls.set(id, e); }
      const a = AREAS[id];
      const how: Record<string, [IconName, string]> = { mend: ["hand", "Mend the fences"], drain: ["sprout", "Clear the drain"], lease: ["lock", "Lease it"], bridge: ["fence", "Build the bridge"] };
      const [ic, words] = how[a.how]!;
      const later = l.state === "later";
      e.dataset.area = id;
      e.innerHTML = `<i class="string"></i><div class="tagcard felt ${later ? "later" : ""}" data-tag="${id}"><i class="hole"></i>
        <span class="how">${icon(ic)}</span><b class="nm">${a.name}</b>
        ${later ? `<small>Coming later</small>` : `<span class="pr">${icon("coin")}${l.price ?? ""}</span><small>${l.note ?? words}</small>`}</div>
        ${!later && l.can ? `<button class="primary open" data-open-area="${id}">${icon("check")}<span>Open this land</span></button>` : ""}`;
    }
    this.drawMinimapBase();
    this.renderSigns();
  }

  private renderSigns(): void {
    if (this.mode !== "pan") { this.signs.innerHTML = ""; return; }
    this.signs.innerHTML = SIGNS.map((s) => {
      const l = s.area ? this.land.get(s.area) : undefined;
      const locked = !!l && l.state !== "open";
      return `<button class="sign ${locked ? "locked" : ""}" data-sign="${s.id}">${icon(locked ? "lock" : s.ic)}<b>${s.name}</b>${locked && l?.price && l.state === "locked" ? `<small>${icon("coin")}${l.price}</small>` : ""}</button>`;
    }).join("");
  }

  /** Per frame: place the world-anchored bits. `screen` projects a farm point (u, v, height) to client px within the container. */
  update(o: {
    screen(u: number, v: number, y: number): { x: number; y: number; inView: boolean };
    prompt: { at: { x: number; y: number } | null; spec: PromptSpec | null; hold: number };
    farmer: UV | null;
    near: (u: number, v: number) => number;
  }): void {
    for (const p of PLACES) {
      const e = this.placeEls.get(p.id)!;
      const [u, v, y] = PLACE_AT[p.id];
      const s = o.screen(u, v, y);
      place(e, s, s.inView);
    }
    for (const [id, e] of this.tagEls) {
      const a = AREAS[id];
      const s = o.screen(a.tag[0], a.tag[1], 3.6);
      place(e, s, s.inView);
    }
    const spec = o.prompt.spec;
    const key = spec ? `${spec.key}|${spec.label}|${spec.hold?.label ?? ""}` : "";
    if (key !== this.promptKey) {
      this.promptKey = key;
      this.prompt.innerHTML = spec
        ? `<button class="pp" data-act="${spec.act}"><kbd>${spec.key}</kbd><span>${spec.label}</span></button>${spec.hold ? `<button class="pp hold" data-act="brush"><kbd>F<svg viewBox="0 0 36 36"><circle class="ring" cx="18" cy="18" r="15"/></svg></kbd><span>${spec.hold.label}</span></button>` : ""}`
        : "";
      this.el.dataset.prompt = spec ? spec.act : "";
    }
    if (spec && o.prompt.at) place(this.prompt, o.prompt.at, true);
    else this.prompt.style.display = "none";
    this.prompt.style.setProperty("--p", String(Math.max(0, Math.min(1, o.prompt.hold))));
  }

  /** The live minimap layer: sheep dots in their wool colours, the farmer, the view window. */
  drawMinimapLive(view: UV[], sheep: { u: number; v: number; hex: string }[], farmer: UV | null): void {
    if (this.mode !== "pan") return;
    const g = this.mmLive.getContext("2d");
    if (!g) return;
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, MM.w, MM.h);
    for (const s of sheep) { g.fillStyle = s.hex; g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 1; g.beginPath(); g.arc(mmX(s.u), mmY(s.v), 2.2, 0, 7); g.fill(); g.stroke(); }
    if (farmer) { g.fillStyle = "#b8403a"; g.strokeStyle = "#fbf4e6"; g.lineWidth = 1.6; g.beginPath(); g.arc(mmX(farmer[0]), mmY(farmer[1]), 3.4, 0, 7); g.fill(); g.stroke(); }
    if (view.length === 4) {
      g.strokeStyle = "#fbf4e6"; g.lineWidth = 2.2; g.setLineDash([4, 3]);
      g.beginPath(); view.forEach(([u, v], i) => (i ? g.lineTo(mmX(u), mmY(v)) : g.moveTo(mmX(u), mmY(v)))); g.closePath(); g.stroke();
      g.strokeStyle = "rgba(183,110,95,.9)"; g.lineWidth = 1; g.setLineDash([]); g.stroke();
    }
  }

  /** Felt appliqué base map: paddocks, creek, bush, buildings; locked land shows its price. */
  private drawMinimapBase(): void {
    const g = this.mmBase.getContext("2d");
    if (!g) return;
    const { w, h } = MM;
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.fillStyle = "#cfe2b4"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#e3d6a6";
    g.beginPath(); g.moveTo(0, 0);
    for (let u = MM.u0; u <= MM.u1; u += 2) g.lineTo(mmX(u), mmY(creekV(u) + 8));
    g.lineTo(w, 0); g.closePath(); g.fill();
    g.fillStyle = "#6f9f78";
    for (let u = MM.u0; u < MM.u1; u += 2.4) for (let v = MM.v0; v < MM.v1; v += 2.4) if (bushScore(u, v) > 0.62) { g.beginPath(); g.arc(mmX(u), mmY(v), 2.4, 0, 7); g.fill(); }
    for (const [, u, v] of TREES) { g.beginPath(); g.arc(mmX(u), mmY(v), 1.6, 0, 7); g.fill(); }
    g.strokeStyle = "#f1e5c8"; g.lineWidth = 3.2; g.beginPath();
    for (let u = MM.u0; u <= MM.u1; u += 4) { if (u === MM.u0) g.moveTo(mmX(u), mmY(roadV(u))); else g.lineTo(mmX(u), mmY(roadV(u))); }
    g.stroke();
    g.strokeStyle = "#8fc3d6"; g.lineWidth = 4; g.lineCap = "round"; g.beginPath();
    for (let u = MM.u0; u <= MM.u1; u += 2) { const y = mmY(creekV(u)); if (u === MM.u0) g.moveTo(mmX(u), y); else g.lineTo(mmX(u), y); }
    g.stroke();
    if (this.land.get("farbank")?.state === "open") { g.strokeStyle = "#c2a88c"; g.lineWidth = 3; g.lineCap = "butt"; g.beginPath(); g.moveTo(mmX(BRIDGE[0]), mmY(BRIDGE[1] - 3)); g.lineTo(mmX(BRIDGE[0]), mmY(BRIDGE[1] + 3)); g.stroke(); }
    for (const id of AREA_IDS) {
      const a = AREAS[id], [u0, u1, v0, v1] = a.rect;
      const l = this.land.get(id);
      const open = id === "home" || l?.state === "open";
      g.fillStyle = open ? "#9cc97e" : "rgba(170,165,140,.85)";
      g.beginPath(); g.roundRect(mmX(u0), mmY(v1), mmX(u1) - mmX(u0), mmY(v0) - mmY(v1), 4); g.fill();
      g.setLineDash(open ? [3, 2.5] : [2, 3]); g.lineWidth = 1.2; g.strokeStyle = open ? "rgba(255,255,255,.9)" : "rgba(110,95,85,.7)";
      g.beginPath(); g.roundRect(mmX(u0) + 2, mmY(v1) + 2, mmX(u1) - mmX(u0) - 4, mmY(v0) - mmY(v1) - 4, 3); g.stroke();
      g.setLineDash([]);
      if (!open && l?.state === "locked" && l.price) { g.fillStyle = "#b24f43"; g.font = "800 9px Nunito, sans-serif"; g.textAlign = "center"; g.fillText(`${l.price}`, (mmX(u0) + mmX(u1)) / 2, (mmY(v0) + mmY(v1)) / 2 + 3); }
    }
    const box = (u: number, v: number, w2: number, h2: number, c: string) => { g.fillStyle = c; g.beginPath(); g.roundRect(mmX(u - w2), mmY(v + h2), mmX(u + w2) - mmX(u - w2), mmY(v - h2) - mmY(v + h2), 1.5); g.fill(); };
    box(SPOTS.woolshed[0], SPOTS.woolshed[1], 7, 3.5, "#dc9484");
    box(SPOTS.homestead[0], SPOTS.homestead[1], 5, 4, "#fbf6ec");
    box(SPOTS.barn[0], SPOTS.barn[1], 5.5, 3.5, "#c89668");
    box(SPOTS.market[0], SPOTS.market[1], 2.5, 1.2, "#f28b82");
    box(SPOTS.vet[0], SPOTS.vet[1], 2, 1.7, "#7cc4b8");
    box(SPOTS.showground[0], SPOTS.showground[1], 4.5, 4, "#f2d59a");
  }

  dispose(): void {
    this.el.removeEventListener("click", this.onClick);
    this.el.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    this.el.remove();
  }
}

/** Where each place's placard floats (u, v, height). */
const PLACE_AT: Record<Hotspot, [number, number, number]> = {
  house: [-55, 1, 9.2], shed: [6, 1.5, 8.8], market: [-13, -12.4, 4.4], vet: [17, -12.2, 5.2], fairground: [36, -24.5, 4.6], mailbox: [-4.5, -14.3, 3.2],
};

function place(e: HTMLElement, p: { x: number; y: number }, show: boolean): void {
  e.style.display = show ? "" : "none";
  if (show) { e.style.left = `${Math.round(p.x)}px`; e.style.top = `${Math.round(p.y)}px`; }
}
