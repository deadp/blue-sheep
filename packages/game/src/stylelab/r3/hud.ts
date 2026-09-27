// Style lab round 3: the felted-wool HUD and in-world affordances shared by the four camera options.
// Round-2 picks (DESIGN-v3 §15 item 21): felted wool panels with blanket stitching, pom-pom badges
// for the HUD, handwritten names, a clean font for numbers and buttons. Few words, big icons.
import { hexOf, type LabSheep } from "../sheep.js";
import { icon, type Icon2 } from "../r2/icons2.js";
import { AREAS, AREA_ORDER, bushScore, creekV, isOpen, type AreaId, type Stage, type UV } from "./farm.js";

export interface Pt { x: number; y: number }

const hearts = (n: number, of = 5) => `<span class="hearts">${Array.from({ length: of }, (_, i) => icon("heart", i < n ? "on" : "off")).join("")}</span>`;
const dots = (n: number, hex: string) => `<span class="dots">${Array.from({ length: 4 }, (_, i) => `<i class="${i < n ? "on" : ""}" style="--c:${hex}"></i>`).join("")}</span>`;
export const btn = (cls: string, ic: Icon2, label: string) => `<button class="fbtn fl ${cls}">${icon(ic)}<span>${label}</span></button>`;

/** Top-left pom-pom badges and the goal chip. */
export function hudTop(st: Stage, opts: { goal?: boolean | undefined } = {}): string {
  const year = st === "early" ? "Year 1" : "Year 3";
  const coins = st === "early" ? 96 : 342;
  const flock = st === "early" ? "6" : "12";
  const cap = st === "early" ? "10" : "14";
  const pom = (cls: string, ic: Icon2, inner: string) => `<div class="pomb fl ${cls}"><i class="pom"></i>${icon(ic)}${inner}</div>`;
  const goal = opts.goal === false ? "" : `<div class="goal fl">${icon("rosette")}<b>A true-blue lamb</b><span class="pips"><i class="on"></i><i></i><i></i></span></div>`;
  return `<div class="hud-tl">${pom("season", "flower", `<span><b>Spring</b><small>${year}</small></span>`)}${pom("coins", "coin", `<b>${coins}</b>`)}${pom("flock", "sheep", `<b>${flock}<small>/${cap}</small></b>`)}</div>${goal}`;
}

/** Bottom-right actions: the bag (store, vet, diary) and Next season. */
export function acts(extra = ""): string {
  return `<div class="acts">${extra}<button class="round fl more">${icon("bag")}</button>${btn("sleep", "moon", "Next season")}</div>`;
}

/** The felt sheep card (compact, docked right). */
export function card(photo: string, s: LabSheep, who: string, say: string, h = 3): string {
  const c = s.colour;
  return `<div class="fcard fl panel"><div class="photo"><img src="${photo}" alt=""></div>
    <h1 class="name">${s.name}</h1>
    <div class="who">${icon("eye")}<span>${who}</span></div>
    ${hearts(h)}
    <div class="say">“${say}”</div>
    <div class="facts">
      <div class="fact fl colour"><span class="chip" style="--c:${hexOf(c)}"></span><span class="pig">${dots(c.red, "#c8322f")}${dots(c.yellow, "#e8b52a")}${dots(c.blue, "#2f5da8")}</span></div>
      <div class="fact fl">${icon("fleece")}<b>soft</b></div>
      <div class="fact fl">${icon("cake")}<b>2</b></div>
    </div>
    <div class="card-acts">${btn("primary", "rings", "Find a mate")}${btn("second", "brush", "Brush")}</div>
    <button class="x">×</button></div>`;
}

/** A small floating selection bubble over a sheep in the world. */
export function bubble(p: Pt, s: LabSheep, h: number, hint = ""): string {
  return `<div class="bub" style="left:${p.x}px;top:${p.y}px"><div class="fl bub-in"><span class="chip" style="--c:${hexOf(s.colour)}"></span><b class="name">${s.name}</b>${hearts(h)}</div>${hint ? `<div class="bub-hint fl">${hint}</div>` : ""}<i class="tail"></i></div>`;
}

/** A hover name tag (lighter than the selection bubble). */
export function nameTag(p: Pt, name: string): string {
  return `<div class="ntag" style="left:${p.x}px;top:${p.y}px"><span class="fl">${name}</span></div>`;
}

/** A hotspot placard on a building: a pom-pom disc with an icon and a short label. */
export function placard(p: Pt, ic: Icon2, label: string, cls = ""): string {
  return `<div class="plac ${cls}" style="left:${p.x}px;top:${p.y}px"><span class="fl disc">${icon(ic)}</span><span class="fl lab">${label}</span></div>`;
}

const HOW: Record<string, [Icon2, string]> = { mend: ["hammer", "Mend the fences"], drain: ["spade", "Clear the drain"], lease: ["key", "Lease it"] };

/** The felt price tag on locked land, plus the "open this land" button when it is affordable. */
export function priceTag(p: Pt, id: AreaId, opts: { button?: boolean; soon?: boolean; small?: boolean } = {}): string {
  const a = AREAS[id];
  const [ic, how] = HOW[a.how!]!;
  return `<div class="ptag3 ${opts.small ? "small" : ""} ${opts.soon === false ? "later" : ""}" style="left:${p.x}px;top:${p.y}px">
    <i class="string"></i>
    <div class="tag fl"><i class="hole"></i><span class="how">${icon(ic)}</span><b class="name">${a.name}</b><span class="pr">${icon("coin")}${a.price}</span><small>${how}</small></div>
    ${opts.button ? `<button class="fbtn fl primary open">${icon("check")}<span>Open this land</span></button>` : ""}
  </div>`;
}

/** Woolshed station tag above a bird: the job, the bird, fondness and today's work. */
export function stationTag(p: Pt, s: { id: string; job: string }, opts: { compact?: boolean } = {}): string {
  const M: Record<string, { bird: string; ic: Icon2; hearts: number; from: string; to: Icon2; left: number }> = {
    kaka: { bird: "Kākā", ic: "comb", hearts: 4, from: "#e8e1d2", to: "fleece", left: 3 },
    tui: { bird: "Tūī", ic: "spindle", hearts: 3, from: "#E18E8D", to: "yarn", left: 2 },
    piwakawaka: { bird: "Pīwakawaka", ic: "needles", hearts: 5, from: "#C0A9CF", to: "jumper", left: 1 },
  };
  const m = M[s.id]!;
  return `<div class="stag ${opts.compact ? "compact" : ""} st-${s.id}" style="left:${p.x}px;top:${p.y}px"><div class="fl stag-in">
    <div class="st-head">${icon(m.ic)}<b>${s.job}</b></div>
    <b class="name">${m.bird}</b>${hearts(m.hearts)}
    <div class="job"><span class="sw fl" style="--c:${m.from}">${icon("fleece")}</span>${icon("arrow", "to")}<span class="sw fl" style="--c:${m.from}">${icon(m.to)}</span></div>
    <div class="left">${Array.from({ length: 3 }, (_, i) => `<i class="${i < m.left ? "on" : ""}"></i>`).join("")}</div>
  </div><i class="tail"></i></div>`;
}

/** Woolshed strip: what's in the shed today and the two actions. */
export function woolshedBar(): string {
  return `<div class="wsbar fl panel"><h2 class="name">Woolshed</h2><span class="mini fl">${icon("fleece")}<b>6</b></span><span class="mini fl">${icon("sun")}<b>Spring clip</b></span>${btn("primary", "play", "Work the day")}${btn("second", "swap", "Swap birds")}</div>`;
}

/** A pointer: a felt hand (drag), a finger (tap) or a hold ring. */
export function cursor(p: Pt, kind: "drag" | "tap" | "hold"): string {
  return `<div class="cur ${kind}" style="left:${p.x}px;top:${p.y}px">${kind === "drag" ? HAND_OPEN : HAND_POINT}</div>`;
}
const HAND_OPEN = `<svg viewBox="0 0 40 44"><path d="M12 22V9a2.6 2.6 0 0 1 5.2 0v10V6a2.6 2.6 0 0 1 5.2 0v13V8a2.6 2.6 0 0 1 5.2 0v12-7a2.6 2.6 0 0 1 5.2 0v13c0 9-5 15-13 15-6 0-9-3-12-8l-4-7a2.6 2.6 0 0 1 4.4-2.8z" fill="#fbf4e6" stroke="#6b5552" stroke-width="2" stroke-linejoin="round"/></svg>`;
const HAND_POINT = `<svg viewBox="0 0 40 44"><path d="M14 22V5a2.8 2.8 0 0 1 5.6 0v14-2a2.6 2.6 0 0 1 5.2 0v3-1a2.6 2.6 0 0 1 5.2 0v3a2.6 2.6 0 0 1 5.2 0v7c0 8-5 13-12 13-6 0-9-3-12-8l-4-6a2.6 2.6 0 0 1 4.4-2.8z" fill="#fbf4e6" stroke="#6b5552" stroke-width="2" stroke-linejoin="round"/></svg>`;

// ---------------------------------------------------------------- minimap (option 1)

const MM = { u0: -62, u1: 100, v0: -20, v1: 44 };
/** A felt applique minimap drawn in 2D: paddocks, creek, bush, buildings and the view window. */
export function minimap(st: Stage, view: UV[], w = 236, h = 132): string {
  const cv = document.createElement("canvas");
  cv.width = w * 2; cv.height = h * 2;
  const g = cv.getContext("2d")!;
  g.scale(2, 2);
  const X = (u: number) => ((u - MM.u0) / (MM.u1 - MM.u0)) * w;
  const Y = (v: number) => h - ((v - MM.v0) / (MM.v1 - MM.v0)) * h;
  g.fillStyle = "#cfe2b4"; g.fillRect(0, 0, w, h);
  // hills behind the creek
  g.fillStyle = "#e3d6a6";
  g.beginPath(); g.moveTo(0, 0);
  for (let u = MM.u0; u <= MM.u1; u += 2) g.lineTo(X(u), Y(creekV(u) + 9));
  g.lineTo(w, 0); g.closePath(); g.fill();
  // bush
  g.fillStyle = "#6f9f78";
  for (let u = MM.u0; u < MM.u1; u += 2.2) for (let v = MM.v0; v < MM.v1; v += 2.2) if (bushScore(u, v) > (st === "mid" ? 0.48 : 0.62)) { g.beginPath(); g.arc(X(u), Y(v), 2.6, 0, 7); g.fill(); }
  // road
  g.strokeStyle = "#f1e5c8"; g.lineWidth = 3.5; g.beginPath();
  g.moveTo(0, Y(-14.3)); g.lineTo(w, Y(-14)); g.stroke();
  // creek
  g.strokeStyle = "#8fc3d6"; g.lineWidth = 4; g.lineCap = "round"; g.beginPath();
  for (let u = MM.u0; u <= MM.u1; u += 2) { const y = Y(creekV(u)); if (u === MM.u0) g.moveTo(X(u), y); else g.lineTo(X(u), y); }
  g.stroke();
  // paddocks
  for (const id of ["home", "flats", "rushy", "high"] as AreaId[]) {
    const a = AREAS[id], [u0, u1, v0, v1] = a.rect!;
    const open = isOpen(a, st);
    g.fillStyle = open ? "#9cc97e" : "rgba(170,165,140,.85)";
    g.beginPath(); g.roundRect(X(u0), Y(v1), X(u1) - X(u0), Y(v0) - Y(v1), 5); g.fill();
    g.setLineDash(open ? [3, 2.5] : [2, 3]); g.lineWidth = 1.3; g.strokeStyle = open ? "rgba(255,255,255,.9)" : "rgba(110,95,85,.7)";
    g.beginPath(); g.roundRect(X(u0) + 2, Y(v1) + 2, X(u1) - X(u0) - 4, Y(v0) - Y(v1) - 4, 4); g.stroke();
    g.setLineDash([]);
    if (!open) { g.fillStyle = "#b24f43"; g.font = "800 9px Nunito, sans-serif"; g.textAlign = "center"; g.fillText(`${a.price}`, (X(u0) + X(u1)) / 2, (Y(v0) + Y(v1)) / 2 + 3); }
  }
  // buildings
  g.fillStyle = "#dc9484"; g.beginPath(); g.roundRect(X(-1), Y(5), X(13) - X(-1), Y(-2) - Y(5), 2); g.fill();
  g.fillStyle = "#fbf6ec"; g.beginPath(); g.roundRect(X(-49), Y(4.5), X(-39) - X(-49), Y(-2.5) - Y(4.5), 2); g.fill();
  // sheep dots
  const flocks: UV[] = [[-17, -1.5], [-12.5, 2.8], [-23, 3.5], [-20.5, -5], [-9.5, -4.2], [-15, -3]];
  if (st === "mid") flocks.push([27, 2], [33, -3.5], [38, 3.5], [41.5, -2], [30, 5.5], [29.5, -1.2]);
  for (const [u, v] of flocks) { g.fillStyle = "#fbf8ef"; g.beginPath(); g.arc(X(u), Y(v), 1.8, 0, 7); g.fill(); }
  // view window
  g.strokeStyle = "#fbf4e6"; g.lineWidth = 2.4; g.setLineDash([4, 3]);
  g.beginPath(); view.forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v)))); g.closePath(); g.stroke();
  g.strokeStyle = "rgba(183,110,95,.9)"; g.lineWidth = 1; g.setLineDash([]); g.stroke();
  return `<div class="mmap fl panel"><img src="${cv.toDataURL()}" alt="" width="${w}" height="${h}"><span class="mm-zoom"><button class="fl">+</button><button class="fl">−</button></span></div>`;
}

// ---------------------------------------------------------------- travel strip (option 3)

const SIGN_IC: Record<AreaId, Icon2> = { home: "sheep", woolshed: "yarn", flats: "leaf", rushy: "spade", bush: "bird", high: "snow" };
export function travelStrip(st: Stage, active: AreaId | null, glideTo?: AreaId): string {
  const signs = AREA_ORDER.map((id) => {
    const a = AREAS[id];
    const open = isOpen(a, st);
    const cls = [open ? "open" : "locked", id === active ? "on" : "", id === glideTo ? "to" : ""].join(" ");
    return `<button class="sign ${cls}"><span class="board fl">${icon(open ? SIGN_IC[id] : "key")}<b>${a.name}</b>${open ? "" : `<small>${icon("coin")}${a.price}</small>`}</span><i class="post"></i>${id === active ? '<i class="pom"></i>' : ""}</button>`;
  }).join("");
  return `<div class="travel"><div class="rail"></div>${signs}</div>`;
}

// ---------------------------------------------------------------- valley ribbon (option 2)

/** A felt ribbon of the whole valley with the current window; arrows at the screen edges. */
export function ribbon(st: Stage, from: number, to: number): string {
  const U0 = -60, U1 = 100;
  const x = (u: number) => ((u - U0) / (U1 - U0)) * 100;
  const segs: [number, number, string, Icon2 | null, boolean][] = [
    [-56, -36, "yard", "shed", true], [-30, -6, "pad", "sheep", true], [-4, 17, "shed", "yarn", true],
    [20, 46, "pad", "leaf", isOpen(AREAS.flats, st)], [50, 70, "pad", "spade", false], [74, 98, "bush", "bird", true],
  ];
  const html = segs.map(([a, b, cls, ic, open]) => `<span class="rseg ${cls} ${open ? "" : "locked"}" style="left:${x(a)}%;width:${x(b) - x(a)}%">${ic ? icon(open ? ic : "key") : ""}</span>`).join("");
  return `<div class="ribbon fl panel"><div class="rtrack">${html}<span class="rwin" style="left:${x(from)}%;width:${x(to) - x(from)}%"></span></div></div>
    <button class="edge-arrow left fl">${icon("arrow")}</button><button class="edge-arrow right fl">${icon("arrow")}</button>`;
}

// ---------------------------------------------------------------- farmer's-eye controls (option 4)

export function joystick(): string {
  return `<div class="joy"><div class="joy-ring fl"><span class="joy-nub fl">${icon("paw")}</span></div><span class="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></div>`;
}
export function compass(heading: number, marks: { deg: number; ic: Icon2; locked?: boolean }[]): string {
  const m = marks.map((k) => {
    let d = ((k.deg - heading + 540) % 360) - 180;
    if (Math.abs(d) > 80) return "";
    return `<span class="cm ${k.locked ? "locked" : ""}" style="left:${50 + (d / 80) * 50}%">${icon(k.ic)}</span>`;
  }).join("");
  return `<div class="compass fl panel"><div class="ctrack">${m}<i class="cnorth"></i></div></div>`;
}
export function prompt(p: Pt, key: string, label: string, cls = ""): string {
  return `<div class="prompt ${cls}" style="left:${p.x}px;top:${p.y}px"><kbd class="fl">${key}</kbd><span class="fl">${label}</span></div>`;
}

/** Option label (only for the contact sheets: the frame itself stays clean of lab chrome). */
export function labLabel(text: string): string {
  return `<div class="lablabel">${text}</div>`;
}
