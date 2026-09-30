/** The forecast panel: goal tabs, ranked candidates, ten lamb icons, range bars, relationship, learn meter, commit. */
import {
  ADULT_AGE, GOALS, HUE_NAMES, RAM_CAPACITY, canBreed, seasonLabel, flockStats, forecastVisitor, fractionWords, goalColour, isAdult, isIll, lambRoom,
  litterOf, oddsLabel, oddsText, pColour, ramLoad, woolOf,
  type CrossForecast, type GameState, type Goal, type LambSwatch, type Sheep,
} from "../core/index.js";
import type { QuantForecast } from "@blue-sheep/inference";
import {
  esc, hex, learnMeter, learnWord, numbersOn, portrait, prop, sexMark, swatch, woolSwatch,
} from "./util.js";
import { btn, head, icon, more, nm, tag, type IconName } from "./felt/index.js";
import type { View } from "./view.js";
import { rankCached } from "./cache.js";
import { growingText } from "./misc.js";

/** Largest-remainder split of a distribution into ten icons. */
export function tenths(dist: Record<string, number>): { key: string; p: number; n: number }[] {
  const entries = Object.entries(dist).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]);
  const counts = entries.map(([key, p]) => ({ key, p, n: Math.floor(p * 10), frac: p * 10 - Math.floor(p * 10) }));
  let left = 10 - counts.reduce((a, b) => a + b.n, 0);
  for (const e of [...counts].sort((a, b) => b.frac - a.frac)) { if (left <= 0) break; e.n++; left--; }
  return counts.map(({ key, p, n }) => ({ key, p, n }));
}

/** One forecast lamb: its colour class (words, shade, key), and whether it is horned or spotted. */
export interface LambLook { key: string; word: string; wool: string; hidden: boolean; trueBlue: boolean; pattern: string; horns: string }

type LitterForecast = Pick<CrossForecast, "swatches" | "horns" | "pattern" | "trueBlue">;

/**
 * The ten lambs of a forecast (the swatch litter, core `litterOf`), most likely colour first. Horns are spread
 * across them in proportion; spots only on lambs that show colour.
 */
export function litterLooks(f: LitterForecast): LambLook[] {
  const ten = litterOf(f.swatches);
  const hornedN = Math.round((f.horns["horned"] ?? 0) * 10 + 1e-6);
  let spottedN = Math.round((f.pattern["spotted"] ?? 0) * 10 + 1e-6);
  const out: LambLook[] = ten.map((w, k) => ({ key: w.key, word: w.word, wool: w.hex, hidden: w.hidden, trueBlue: w.trueBlue, horns: k < hornedN ? "horned" : "polled", pattern: "solid" }));
  for (let k = out.length - 1; k >= 0 && spottedN > 0; k--) if (!out[k]!.hidden) { out[k]!.pattern = "spotted"; spottedN--; }
  return out;
}

function lookWords(l: LambLook): string {
  const base = l.hidden ? "white on top, colour underneath unknown" : `${l.word}${l.trueBlue ? " (true blue!)" : ""}`;
  return `${base}${l.pattern === "spotted" ? ", spotted" : ""}${l.horns === "horned" ? ", horned" : ""}`;
}

/** One lamb tile: a rendered lamb portrait tinted with the class colour, or a wool-coloured blob. White lambs wear a "?". */
export function lambTile(view: Pick<View, "lambArt"> | null, l: LambLook, i = 0, extra = "", d?: number): string {
  let src = "";
  try { src = view?.lambArt?.({ wool: l.wool, pattern: l.pattern, horns: l.horns }) ?? ""; } catch { src = ""; }
  const badges = `${l.horns === "horned" ? `<b class="lb horn" aria-hidden="true">${icon("horn")}</b>` : ""}${l.pattern === "spotted" ? `<b class="lb spot" aria-hidden="true"></b>` : ""}${l.hidden ? `<b class="lb q" aria-hidden="true">?</b>` : ""}${l.trueBlue ? `<b class="lb tb" aria-hidden="true">${icon("heart")}</b>` : ""}`;
  const cls = ["lamb-tile", src ? "art" : "blob", l.hidden ? "hidden" : "", extra].filter(Boolean).join(" ");
  return `<span class="${cls}" data-wool="${esc(l.wool)}" data-key="${esc(l.key)}" style="--i:${i};${d !== undefined ? `--d:${d};` : ""}--wool:${esc(l.wool)}" title="${esc(lookWords(l))}">${src ? `<img src="${esc(src)}" alt="">` : `<span class="lamb ${l.pattern === "spotted" ? "spot" : ""}">${l.horns === "horned" ? "<i></i>" : ""}</span>`}${badges}</span>`;
}

/**
 * The litter: ten lamb portraits (one per "one in ten") in a 5 × 2 grid, each tinted with its forecast wool
 * colour, and a caption ("each lamb = one chance in ten" and the horned/spotted share). `small` for inline use
 * (report, market): tiles only. The colour key (the words per colour, % with numbers) is `litterKey`.
 */
export function litterRow(state: GameState, f: LitterForecast, small = false, view: Pick<View, "lambArt"> | null = null): string {
  const looks = litterLooks(f);
  const tiles = looks.map((l, i) => lambTile(view, l, i)).join("");
  const hornedN = Math.round((f.horns["horned"] ?? 0) * 10 + 1e-6);
  const spottedN = looks.filter((l) => l.pattern === "spotted").length;
  const extras: string[] = [];
  if (hornedN > 0) extras.push(`<span class="xkey"><b class="lb horn">${icon("horn")}</b> ${esc(hornedN >= 10 ? "all horned" : `${fractionWords(f.horns["horned"] ?? 0)} horned`)}</span>`);
  if (spottedN > 0) extras.push(`<span class="xkey"><b class="lb spot"></b> ${esc(spottedN >= 10 ? "all spotted" : `${fractionWords(f.pattern["spotted"] ?? 0)} spotted`)}</span>`);
  if (looks.some((l) => l.hidden)) extras.push(`<span class="xkey"><b class="lb q">?</b> white on top</span>`);
  return `<div class="litter ${small ? "small" : ""}" role="img" aria-label="${esc(litterWords(state, f))}">${tiles}</div>
    ${small ? "" : `<div class="litter-cap"><span class="each">Each lamb = one chance in ten</span>${extras.length ? `<span class="legend extras">${extras.join("")}</span>` : ""}</div>`}`;
}

/** The colour key for a litter: each colour's share in words ("3 in 10"), or % with numbers, and the rare ones. */
export function litterKey(state: GameState, f: Pick<CrossForecast, "swatches">, view: Pick<View, "lambArt"> | null = null): string {
  const ten = litterOf(f.swatches);
  const nums = numbersOn(state);
  const n = (key: string) => ten.filter((w) => w.key === key).length;
  const rare = f.swatches.filter((w) => n(w.key) === 0 && w.p > 0.005).slice(0, 3).map((w) => w.word);
  const keyArt = (w: LambSwatch) => {
    let src = "";
    try { src = view?.lambArt?.({ wool: w.hex, pattern: "solid", horns: "polled" }) ?? ""; } catch { src = ""; }
    return src ? `<img class="k-art" src="${esc(src)}" alt="">` : `<b style="--wool:${esc(w.hex)}"></b>`;
  };
  const shown = f.swatches.filter((w) => n(w.key) > 0 || (nums && w.p >= 0.01));
  const legend = shown.map((w) => {
    const k = n(w.key);
    return `<span class="key">${keyArt(w)}<span><span class="k-name">${esc(w.hidden ? "white (colour hidden)" : w.word)}</span> <span class="k-n">${nums ? `${w.p < 0.01 ? "<1" : Math.round(w.p * 100)}%` : k === 10 ? "every lamb" : `${k} in 10`}</span></span></span>`;
  }).join("");
  const rareNote = rare.length && !nums ? `<div class="meta rare">A ${esc(orList(rare))} lamb could happen, but rarely.</div>` : "";
  return `<div class="legend">${legend}</div>${rareNote}`;
}

function orList(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
}

/** "mostly snow-white, about one in ten bright red". Percentages only with numbers. */
export function litterWords(state: GameState, f: Pick<CrossForecast, "swatches" | "trueBlue">): string {
  const e = f.swatches.filter((w) => w.p > 0.005);
  if (!e.length) return "unknown";
  const nums = numbersOn(state);
  const w = (c: string, p: number) => nums ? `${Math.round(p * 100)}% ${c}` : p >= 0.95 ? `all ${c}` : `${fractionWords(p)} ${c}`;
  const [top, ...rest] = e;
  const head = top!.p >= 0.95 ? (nums ? w(top!.word, top!.p) : `all ${top!.word}`) : top!.p >= 0.6 ? `mostly ${top!.word}` : w(top!.word, top!.p);
  const tail = rest.slice(0, 2).map((x) => w(x.word, x.p));
  if (f.trueBlue > 0.005 && !e.slice(0, 3).some((x) => x.trueBlue)) tail.push(w("true blue", f.trueBlue));
  return [head, ...tail].join(", ");
}

export interface RangeMarks {
  ewe: { value: number; art: string; name: string };
  ram: { value: number; art: string; name: string };
  flock: number;
}

/**
 * Range bar with a proper axis: end words (finer ← → coarser), pins with the parents' faces above the track,
 * flock average and the expected lamb below it, and the shaded band where most lambs would land.
 * Numbers (axis values, the parents' measurements) only with the numbers unlock.
 */
export function rangeBar(
  state: GameState, label: string, unit: string, f: QuantForecast, lo: number, hi: number,
  marks: RangeMarks, words: [string, string],
): string {
  const pos = (v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const bL = pos(f.mean - f.sd), bR = pos(f.mean + f.sd);
  const nums = numbersOn(state);
  const vague = f.h2.pairs < 4;
  const fmt = (v: number) => `${v.toFixed(1)} ${unit}`;
  const note = nums
    ? `Expected lamb ${fmt(f.mean)} ± ${f.sd.toFixed(1)} · heritability ${f.h2.h2.toFixed(2)} from ${f.h2.pairs} families`
    : vague ? "Only a rough guess — more lambs on record will sharpen this." : `Based on ${f.h2.pairs} families on your farm.`;
  const ex = pos(marks.ewe.value), rx = pos(marks.ram.value);
  const close = Math.abs(ex - rx) < 0.14;
  const pin = (who: "ewe" | "ram", m: RangeMarks["ewe"], x: number, high: boolean) =>
    `<span class="pin ${who} ${high ? "high" : ""}" style="${prop("x", x)}" title="${esc(`${m.name}${nums ? ` · ${fmt(m.value)}` : ""}`)}">${m.art ? `<img src="${esc(m.art)}" alt="">` : `<span class="pin-dot"></span>`}<span class="pin-lbl">${esc(m.name)}${nums ? ` <span class="num">${m.value.toFixed(1)}</span>` : ""}</span></span>`;
  const fx = pos(marks.flock), mx = pos(f.mean);
  const below = (cls: string, x: number, text: string, high: boolean) =>
    `<span class="bpin ${cls} ${high ? "low2" : ""}" style="${prop("x", x)}"><span class="b-mark"></span><span class="b-lbl">${text}</span></span>`;
  return `<div class="range">
    <div class="rlabel">${esc(label)}</div>
    <div class="rgraph">
      <div class="pins">${pin("ewe", marks.ewe, ex, false)}${pin("ram", marks.ram, rx, close)}</div>
      <div class="track">
        <div class="band" style="${prop("l", bL)};${prop("w", Math.max(0.012, bR - bL))}"></div>
        <div class="tick flock" style="${prop("x", fx)}"></div>
        <div class="tick ewe" style="${prop("x", ex)}"></div>
        <div class="tick ram" style="${prop("x", rx)}"></div>
        <div class="tick mean" style="${prop("x", mx)}"></div>
      </div>
      <div class="bpins">${below("flock", fx, `flock${nums ? ` ${marks.flock.toFixed(1)}` : ""}`, false)}${below("mean", mx, `${icon("sheep", "inl")} lamb${nums ? ` ${f.mean.toFixed(1)}` : ""}`, Math.abs(fx - mx) < 0.16)}</div>
      <div class="axis"><span>← ${esc(words[0])}${nums ? ` · ${lo.toFixed(0)} ${esc(unit)}` : ""}</span><span>${nums ? `${hi.toFixed(0)} ${esc(unit)} · ` : ""}${esc(words[1])} →</span></div>
    </div>
    <div class="meta">${esc(note)}</div></div>`;
}

export function relationText(r: number, F: number): { text: string; warn: string } {
  const label = r <= 0 ? "Unrelated" : r >= 0.5 ? "Parent and child, or full siblings" : r >= 0.25 ? "Half siblings, or grandparent" : r >= 0.125 ? "Cousins" : "Distant relatives";
  const warn = F >= 0.25 ? "Lambs would be strongly inbred — small and weak." : F >= 0.125 ? "Lambs would be inbred and may be small." : F > 0.03 ? "A little shared blood; lambs should be fine." : "";
  return { text: label, warn };
}

function woolHint(state: GameState, f: CrossForecast): string {
  const fin = flockStats(state, "fineness"), fw = flockStats(state, "fleeceWeight");
  const dF = (f.fineness.mean - fin.mean) / fin.sd, dW = (f.fleeceWeight.mean - fw.mean) / fw.sd;
  const finW = dF < -0.4 ? "finer than most of the flock" : dF > 0.4 ? "coarser than most" : "about average";
  const fwW = dW > 0.4 ? "heavier fleeces" : dW < -0.4 ? "lighter fleeces" : "ordinary fleeces";
  return `Wool: likely ${finW}, with ${fwW}.`;
}

/** The chance a goal tab is after, for one forecast. */
function goalChance(f: CrossForecast, goal: Goal): number | null {
  const c = goalColour(goal);
  if (c) return c === "vivid" ? f.vivid : pColour(f, c, "bright");
  return goal === "trueblue" ? f.trueBlue : null;
}

/** The goal's hint line in words. */
function goalLine(f: CrossForecast, goal: Goal): string {
  const c = goalColour(goal);
  if (!c) return goal === "trueblue" ? f.blueText : f.colourText;
  const p = goalChance(f, goal) ?? 0;
  const what = c === "vivid" ? "a vivid colour" : `${c}, bright or better`;
  return p <= 0 ? `No lambs ${what}, as far as you know. ${f.colourText}` : `${oddsText(p, "lamb").replace(/\.$/, "")} would be ${what}. ${f.colourText}`;
}

function hintFor(state: GameState, f: CrossForecast, goal: Goal): string {
  const nums = numbersOn(state);
  const p = goalChance(f, goal);
  if (p !== null) return nums ? `${Math.round(p * 100)}%` : p <= 0 ? "no" : oddsLabel(p).toLowerCase().replace("possible, but don't count on it", "possible");
  switch (goal) {
    case "learn": return f.learnBits * 2 > 2 ? "loads" : f.learnBits * 2 > 1 ? "a lot" : f.learnBits > 0.02 ? "a little" : "—";
    case "fine": return nums ? `${f.fineness.mean.toFixed(1)} µm` : "";
    case "heavy": return nums ? `${f.fleeceWeight.mean.toFixed(1)} kg` : "";
    default: return "";
  }
}

/** Which sheep the forecast is "for": the view's sheep, else the first adult ewe, else any adult. */
export function forecastSubject(state: GameState, view: View): Sheep | null {
  const s = view.sheepId ? state.sheep[view.sheepId] : undefined;
  if (s) return s;
  const flock = state.flock.map((id) => state.sheep[id]!);
  return flock.find((x) => x.sex === "ewe" && canBreed(x, state.season)) ?? flock.find((x) => isAdult(x, state.season)) ?? flock[0] ?? null;
}

/** Short goal names with icons for the forecast's goal tabs. */
function goalTab(id: Goal): { label: string; icon: IconName } {
  if (goalColour(id)) return { label: "Colour", icon: "spots" };
  return ({ trueblue: { label: "True blue", icon: "heart" }, learn: { label: "Learn", icon: "lens" }, fine: { label: "Fine wool", icon: "yarn" }, heavy: { label: "Heavy fleece", icon: "scissors" } } as Record<string, { label: string; icon: IconName }>)[id]!;
}

/** Colour chips under the Colour tab: any vivid colour, then the colours on the farm (and their lambs' likely ones). */
function colourChips(state: GameState, goal: Goal): string {
  const on = goalColour(goal);
  if (!on) return "";
  const seen = new Set<string>();
  for (const id of state.flock) { const w = woolOf(state.sheep[id]!); if ((HUE_NAMES as readonly string[]).includes(w.name)) seen.add(w.name); }
  for (const c of ["red", "orange", "purple"]) seen.add(c);
  const names = [...(HUE_NAMES as readonly string[])].filter((n) => seen.has(n) || n === on);
  const chip = (id: string, label: string, sw: string) => `<button class="chip cc ${on === id ? "on" : ""}" data-goal="colour:${esc(id)}" aria-pressed="${on === id}">${sw}<span>${esc(label)}</span></button>`;
  return `<div class="colour-chips" role="group" aria-label="Which colour?">${chip("vivid", "any vivid", `<span class="swatch rainbow" aria-hidden="true"></span>`)}${names.map((n) => chip(n, n, swatch(hex(n)))).join("")}</div>`;
}

function parentCard(view: View, s: Sheep, cls = "", mate = false): string {
  const inner = `${portrait(view, s, "md")}<span class="par-name"><span class="nm">${esc(s.name)}</span>${sexMark(s)}</span>`;
  return mate ? `<button class="par ${cls}" data-mate="${esc(s.id)}" title="The only mate ready this season">${inner}</button>` : `<div class="par ${cls}">${inner}</div>`;
}

export function forecastPanelHtml(state: GameState, view: View): string {
  const me = forecastSubject(state, view);
  if (!me) return `${head("rings", "Find a mate", 2)}<p>There are no sheep on the farm. Visit the market.</p>`;
  const head0 = `<div class="panel-head">${portrait(view, me, "sm")}${head("rings", `A mate for ${nm(esc(me.name))}`, 2)}</div>`;
  if (!isAdult(me, state.season)) {
    return `${head0}<p class="note-line">${icon("sprout", "inl")} ${esc(me.name)} is still growing: ${me.sex === "ewe" ? "she" : "he"} can breed from ${esc(seasonLabel(me.born + ADULT_AGE))}.</p>
      <div class="row">${btn(`Buy a grown ${me.sex} at the market`, { icon: "store", data: { open: "market" } })}</div>`;
  }
  if (isIll(me, state.season)) return `${head0}<p>${icon("warn", "inl")} ${esc(me.name)} is poorly this season and needs rest. Try again next season.</p>`;
  if (!canBreed(me, state.season)) return `${head0}<p>${esc(me.name)} has retired from lambing and enjoys the grass.</p>`;
  if (!state.flock.includes(me.id)) return `${head0}<p>${esc(me.name)} isn't part of your flock.</p>`;

  const goal = view.goal;
  const ranked = rankCached(state, me.id, goal);
  const isOn = (id: Goal) => id === goal || (!!goalColour(id) && !!goalColour(goal));
  const tabs = `<div class="tabs" role="tablist" aria-label="What are you breeding for?">${GOALS.map((g) =>
    `<button class="tab ${isOn(g.id) ? "on" : ""}" role="tab" aria-selected="${isOn(g.id)}" data-goal="${g.id}" title="${esc(g.label)}">${icon(goalTab(g.id).icon)}<span>${esc(goalTab(g.id).label)}</span></button>`).join("")}</div>${colourChips(state, goal)}`;
  if (!ranked.length) {
    const other = me.sex === "ewe" ? "ram" : "ewe";
    const g = growingText(state, other);
    return `${head0}${tabs}<p class="note-line">No ${other}s are ready to breed this season.${g ? ` ${esc(g)}` : ""}</p>
      <div class="row">${btn(`Buy a grown ${other} at the market`, { icon: "store", data: { open: "market" } })}</div>`;
  }
  const chosen = ranked.find((x) => x.sheep.id === view.mateId) ?? ranked[0]!;
  const pairOf = (c: Sheep): [string, string] => (me.sex === "ewe" ? [me.id, c.id] : [c.id, me.id]);
  const visitorId = state.visitingRam && state.visitingRam.season === state.season ? state.visitingRam.id : null;

  const list = ranked.map(({ sheep: c, forecast: f }) => {
    const [e, r] = pairOf(c);
    const planned = state.plans[e] === r;
    const busy = c.sex === "ram" && !planned && ramLoad(state, c.id) >= RAM_CAPACITY;
    const isVisitor = c.id === visitorId;
    const elsewhere = me.sex === "ram" && state.plans[e] && state.plans[e] !== r ? state.sheep[state.plans[e]!]?.name : null;
    const sub = isVisitor ? "visiting — nothing known" : busy ? "busy this season" : elsewhere ? `planned with ${elsewhere}` : "";
    return `<button class="cand ${c.id === chosen.sheep.id ? "on" : ""} ${busy ? "busy" : ""} ${isVisitor ? "visitor" : ""}" data-mate="${esc(c.id)}" ${busy ? "disabled" : ""} ${sub ? `title="${esc(sub)}"` : ""}>
      ${woolSwatch(c)}
      <span class="cname"><span class="cn nm" title="${esc(c.name)}">${esc(c.name)}${planned ? ` <span class="star" title="planned">${icon("star", "inl")}</span>` : ""}${c.rosettes.length ? icon("rosette", "inl") : ""}</span>${sub ? `<span class="csub">${esc(sub)}</span>` : ""}</span>
      <span class="hint">${esc(hintFor(state, f, goal))}</span></button>`;
  }).join("");

  const [eweId, ramId] = pairOf(chosen.sheep);
  const ewe = state.sheep[eweId]!, ram = state.sheep[ramId]!;
  const f = chosen.forecast;
  const planned = state.plans[eweId] === ramId;
  const isVisitor = ramId === visitorId;
  const hired = isVisitor && state.hiredRam === ramId;
  const rel = relationText(f.relatedness, f.inbreeding);
  const fin = flockStats(state, "fineness"), fw = flockStats(state, "fleeceWeight");
  const art = (x: Sheep) => { try { return view.portraits(x.id) || ""; } catch { return ""; } };
  const marks = (trait: string, flockMean: number): RangeMarks => ({
    ewe: { value: Number(ewe.phenotype[trait]), art: art(ewe), name: ewe.name },
    ram: { value: Number(ram.phenotype[trait]), art: art(ram), name: ram.name },
    flock: flockMean,
  });
  const bars = state.act >= 2
    ? `<div class="ranges">${rangeBar(state, "Fibre fineness", "µm", f.fineness, fin.mean - 3 * fin.sd, fin.mean + 3 * fin.sd, marks("fineness", fin.mean), ["finer", "coarser"])}
      ${rangeBar(state, "Fleece weight", "kg", f.fleeceWeight, fw.mean - 3 * fw.sd, fw.mean + 3 * fw.sd, marks("fleeceWeight", fw.mean), ["lighter", "heavier"])}
      <div class="ticks-key meta"><span class="k band"></span>where most lambs from this pair would land <span class="k flock"></span>flock average <span class="k mean"></span>the lamb you'd most expect</div></div>`
    : `<p class="wool-hint">${icon("yarn", "inl")} ${esc(woolHint(state, f))}</p>`;
  const nPlanned = Object.keys(state.plans).length;
  const room = lambRoom(state);
  const learnV = Math.min(1, f.learnBits * 0.8);
  // One hint line for the goal you picked.
  const line = goal === "learn" ? { i: "lens" as IconName, t: f.learnText } : goal === "fine" || goal === "heavy" ? { i: "yarn" as IconName, t: woolHint(state, f) } : { i: (goal === "trueblue" ? "heart" : "spots") as IconName, t: goalLine(f, goal) };
  let commit: string;
  if (isVisitor && !hired) {
    commit = `${btn(`Hire ${esc(ram.name)} · ${state.visitingRam?.fee ?? 0}`, { kind: "primary", icon: "coin", data: { hire: "1" }, disabled: state.money < (state.visitingRam?.fee ?? 0), title: `${forecastVisitor(state).text} Here this season only.` })}`;
  } else {
    const blocked = !planned && room < 1 && state.plans[eweId] === undefined;
    commit = `${btn(planned ? "Cancel this mating" : state.plans[eweId] ? "Switch to this mating" : "Plan this mating", { kind: planned ? "secondary" : "primary", icon: planned ? "close" : "rings", data: { plan: `${eweId}:${ramId}` }, disabled: blocked })}
      ${blocked ? btn("Make room", { kind: "ghost", icon: "store", data: { open: "market" }, title: `No room for more lambs: your fields are full.${growingText(state) ? ` ${growingText(state)!}` : ""}` }) : ""}
      <span class="meta planned-n">${nPlanned === 0 ? "" : `${icon("moon", "inl")} ${nPlanned} mating${nPlanned === 1 ? "" : "s"} planned`}</span>`;
  }
  const others = ranked.length > 1 ? `<div class="cands" aria-label="Mates, best first">${list}</div>` : "";
  const details = `
      ${litterKey(state, f, view)}
      ${bars}
      <div class="row rel">${tag(esc(rel.text), { icon: "family" })}${numbersOn(state) && f.inbreeding > 0 ? `<span class="meta">inbreeding ${f.inbreeding.toFixed(3)}</span>` : ""}</div>
      <div class="learn"><span class="learn-label">${icon("lens", "inl")} What you'd learn</span>${learnMeter(learnV, learnWord(learnV))}<span class="meta">${esc(f.learnText)}</span></div>
      ${isVisitor ? `<p class="meta">${esc(forecastVisitor(state).text)} He's only here this season.</p>` : ""}`;
  return `<div class="fc">
    <div class="fc-left">
      ${parentCard(view, me, "me")}
      <span class="plus" aria-hidden="true">${icon("heart", "sm")}</span>
      ${parentCard(view, chosen.sheep, "mate", ranked.length === 1)}
      ${ranked.length > 1 ? `<div class="cands-h">${icon("rings", "inl")} Mates, best first</div>` : ""}
      ${others}
    </div>
    <div class="forecast">
      ${tabs}
      <div class="litter-box">${litterRow(state, f, false, view)}</div>
      ${isVisitor ? `<p class="note-line visitor">${icon("ram", "inl")} Visiting: nothing known about his family, so this is a wide guess.</p>` : ""}
      ${rel.warn ? `<p class="note-line warn">${icon("warn", "inl")} ${esc(rel.warn)}</p>` : ""}
      <p class="blue-line">${icon(line.i)}<span>${esc(line.t)}</span></p>
      ${goal === "trueblue" || goal === "learn" ? `<p class="colour-line meta">${esc(f.colourText)}</p>` : ""}
      <div class="row commit">${planned ? tag("planned", { icon: "star", tone: "butter", cls: "planned" }) : ""}${commit}</div>
      ${more("forecast-more", "Colours, wool, kinship, what you'd learn", details)}
    </div>
  </div>`;
}
