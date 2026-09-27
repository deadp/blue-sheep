// Movement prototype: the felt HUD pieces that are new here (the mode switch, signposts, prompts, the live
// minimap, toasts). Everything else comes from the round-3 HUD (../r3/hud.ts).
import { icon, type Icon2 } from "../r2/icons2.js";
import { AREAS, bushScore, creekV, type AreaId, type UV } from "../r3/farm.js";

export type Mode = "walk" | "pan";

export function modeSwitch(mode: Mode): string {
  return `<div class="modesw fl" data-mode="${mode}">
    <button data-m="walk" class="${mode === "walk" ? "on" : ""}">${icon("paw")}<span>Walk</span></button>
    <button data-m="pan" class="${mode === "pan" ? "on" : ""}">${icon("eye")}<span>Pan</span></button>
    <i class="knob fl"></i></div>`;
}

export interface Sign { id: AreaId; name: string; ic: Icon2; focus: UV; halfW: number }
export const SIGNS: Sign[] = [
  { id: "home", name: "Home paddock", ic: "sheep", focus: [-17, -0.5], halfW: 16 },
  { id: "woolshed", name: "Woolshed", ic: "yarn", focus: [4, -5], halfW: 12 },
  { id: "flats", name: "Creek flats", ic: "leaf", focus: [30, -2], halfW: 17 },
  { id: "bush", name: "Bush edge", ic: "bird", focus: [80, -3], halfW: 17 },
  { id: "high", name: "High run", ic: "snow", focus: [-6, 26], halfW: 19 },
];

export function signposts(flatsOpen: boolean): string {
  return `<div class="travel posts"><div class="rail"></div>${SIGNS.map((s) => {
    const locked = (s.id === "flats" && !flatsOpen) || s.id === "high";
    const a = AREAS[s.id];
    return `<button class="sign ${locked ? "locked" : "open"}" data-sign="${s.id}"><span class="board fl">${icon(locked ? "key" : s.ic)}<b>${s.name}</b>${locked ? `<small>${icon("coin")}${a.price}</small>` : ""}</span><i class="post"></i></button>`;
  }).join("")}</div>`;
}

export function hint(mode: Mode): string {
  return mode === "walk"
    ? `<div class="hint fl"><span class="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>or tap the ground to walk</span><span class="sep"></span><kbd>E</kbd><span>talk</span><kbd>F</kbd><span>hold to brush</span></div>`
    : `<div class="hint fl">${icon("paw")}<span>Drag to look around · scroll to zoom · tap a sheep</span></div>`;
}

/** A floating felt prompt: an optional key and a label. `hold` gets a fill ring. */
export function promptEl(key: string, label: string, act: string, hold = false): string {
  return `<button class="pp ${hold ? "hold" : ""}" data-act="${act}"><kbd class="fl">${key}<svg viewBox="0 0 36 36"><circle class="ring" cx="18" cy="18" r="15"/></svg></kbd><span class="fl">${label}</span></button>`;
}

// ---------------------------------------------------------------- live minimap

export const MM = { u0: -62, u1: 100, v0: -20, v1: 44, w: 236, h: 132 };
export const mmX = (u: number) => ((u - MM.u0) / (MM.u1 - MM.u0)) * MM.w;
export const mmY = (v: number) => MM.h - ((v - MM.v0) / (MM.v1 - MM.v0)) * MM.h;
export const mmToUV = (x: number, y: number): UV => [MM.u0 + (x / MM.w) * (MM.u1 - MM.u0), MM.v0 + ((MM.h - y) / MM.h) * (MM.v1 - MM.v0)];

/** Felt applique base map (paddocks, creek, bush, buildings); locked land shows its price. */
export function drawMinimapBase(cv: HTMLCanvasElement, flatsOpen: boolean) {
  const { w, h } = MM;
  cv.width = w * 2; cv.height = h * 2;
  const g = cv.getContext("2d")!;
  g.setTransform(2, 0, 0, 2, 0, 0);
  const X = mmX, Y = mmY;
  g.fillStyle = "#cfe2b4"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#e3d6a6";
  g.beginPath(); g.moveTo(0, 0);
  for (let u = MM.u0; u <= MM.u1; u += 2) g.lineTo(X(u), Y(creekV(u) + 9));
  g.lineTo(w, 0); g.closePath(); g.fill();
  g.fillStyle = "#6f9f78";
  for (let u = MM.u0; u < MM.u1; u += 2.2) for (let v = MM.v0; v < MM.v1; v += 2.2) if (bushScore(u, v) > 0.62) { g.beginPath(); g.arc(X(u), Y(v), 2.6, 0, 7); g.fill(); }
  g.strokeStyle = "#f1e5c8"; g.lineWidth = 3.5; g.beginPath(); g.moveTo(0, Y(-14.3)); g.lineTo(w, Y(-14)); g.stroke();
  g.strokeStyle = "#8fc3d6"; g.lineWidth = 4; g.lineCap = "round"; g.beginPath();
  for (let u = MM.u0; u <= MM.u1; u += 2) { const y = Y(creekV(u)); if (u === MM.u0) g.moveTo(X(u), y); else g.lineTo(X(u), y); }
  g.stroke();
  for (const id of ["home", "flats", "rushy", "high"] as AreaId[]) {
    const a = AREAS[id], [u0, u1, v0, v1] = a.rect!;
    const open = id === "home" || (id === "flats" && flatsOpen);
    g.fillStyle = open ? "#9cc97e" : "rgba(170,165,140,.85)";
    g.beginPath(); g.roundRect(X(u0), Y(v1), X(u1) - X(u0), Y(v0) - Y(v1), 5); g.fill();
    g.setLineDash(open ? [3, 2.5] : [2, 3]); g.lineWidth = 1.3; g.strokeStyle = open ? "rgba(255,255,255,.9)" : "rgba(110,95,85,.7)";
    g.beginPath(); g.roundRect(X(u0) + 2, Y(v1) + 2, X(u1) - X(u0) - 4, Y(v0) - Y(v1) - 4, 4); g.stroke();
    g.setLineDash([]);
    if (!open) { g.fillStyle = "#b24f43"; g.font = "800 9px Nunito, sans-serif"; g.textAlign = "center"; g.fillText(`${a.price}`, (X(u0) + X(u1)) / 2, (Y(v0) + Y(v1)) / 2 + 3); }
  }
  g.fillStyle = "#dc9484"; g.beginPath(); g.roundRect(X(-1), Y(5), X(13) - X(-1), Y(-2) - Y(5), 2); g.fill();
  g.fillStyle = "#fbf6ec"; g.beginPath(); g.roundRect(X(-49), Y(4.5), X(-39) - X(-49), Y(-2.5) - Y(4.5), 2); g.fill();
}

/** The live layer: sheep dots in their wool colours, the farmer, and the view window. */
export function drawMinimapLive(cv: HTMLCanvasElement, view: UV[], sheep: { u: number; v: number; hex: string }[], farmer: UV | null) {
  const { w, h } = MM;
  if (cv.width !== w * 2) { cv.width = w * 2; cv.height = h * 2; }
  const g = cv.getContext("2d")!;
  g.setTransform(2, 0, 0, 2, 0, 0);
  g.clearRect(0, 0, w, h);
  for (const s of sheep) { g.fillStyle = s.hex; g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 1; g.beginPath(); g.arc(mmX(s.u), mmY(s.v), 2.2, 0, 7); g.fill(); g.stroke(); }
  if (farmer) { g.fillStyle = "#b8403a"; g.strokeStyle = "#fbf4e6"; g.lineWidth = 1.6; g.beginPath(); g.arc(mmX(farmer[0]), mmY(farmer[1]), 3.4, 0, 7); g.fill(); g.stroke(); }
  if (view.length === 4) {
    g.strokeStyle = "#fbf4e6"; g.lineWidth = 2.4; g.setLineDash([4, 3]);
    g.beginPath(); view.forEach(([u, v], i) => (i ? g.lineTo(mmX(u), mmY(v)) : g.moveTo(mmX(u), mmY(v)))); g.closePath(); g.stroke();
    g.strokeStyle = "rgba(183,110,95,.9)"; g.lineWidth = 1; g.setLineDash([]); g.stroke();
  }
}
