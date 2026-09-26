/** The forecast panel: goal tabs, ranked candidates, ten lamb icons, range bars, relationship, learn meter, commit. */
import {
  ADULT_AGE, GOALS, RAM_CAPACITY, canBreed, seasonLabel, flockStats, forecastVisitor, fractionWords, isAdult, isIll, lambRoom, oddsLabel, ramLoad,
  type CrossForecast, type GameState, type Goal, type Sheep,
} from "../core/index.js";
import type { QuantForecast } from "@blue-sheep/inference";
import {
  esc, hex, numbersOn, portrait, prop, sexMark, swatch,
} from "./util.js";
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

/** Ten lamb icons coloured by probability, with a legend. `small` for inline use (report, market). */
export function litterRow(state: GameState, f: Pick<CrossForecast, "colour" | "horns" | "pattern">, small = false): string {
  const counts = tenths(f.colour);
  const hornedN = Math.round((f.horns["horned"] ?? 0) * 10);
  const spottedN = Math.round((f.pattern["spotted"] ?? 0) * 10);
  let icons = "";
  let k = 0;
  for (const e of counts) for (let i = 0; i < e.n; i++, k++) {
    const horned = k < hornedN, spotted = !small && 9 - k < spottedN;
    icons += `<span class="lamb ${spotted ? "spot" : ""}" style="--wool:${hex(e.key)}" title="${esc(e.key)}${horned ? ", horned" : ""}${spotted ? ", spotted" : ""}">${horned ? "<i></i>" : ""}</span>`;
  }
  const nums = numbersOn(state);
  const rare = counts.filter((e) => e.n === 0).map((e) => e.key);
  const legend = counts.filter((e) => e.n > 0 || nums).map((e) =>
    `<span class="key"><b style="--wool:${hex(e.key)}"></b>${esc(e.key)}${nums ? ` ${e.p < 0.01 ? "<1" : Math.round(e.p * 100)}%` : ` ×${e.n}`}</span>`).join("");
  const rareNote = rare.length && !nums ? `<span class="meta">(a ${esc(orList(rare))} lamb could happen, but rarely)</span>` : "";
  const extras: string[] = [];
  if (hornedN > 0) extras.push(hornedN >= 10 ? "all horned" : `${fractionWords(f.horns["horned"] ?? 0)} horned`);
  if (spottedN > 0) extras.push(spottedN >= 10 ? "all spotted" : `${fractionWords(f.pattern["spotted"] ?? 0)} spotted`);
  return `<div class="litter ${small ? "small" : ""}" role="img" aria-label="${esc(litterWords(state, f.colour))}">${icons}</div>
    ${small ? "" : `<div class="legend">${legend}${rareNote}</div>${extras.length ? `<div class="meta extras">Also: ${esc(extras.join(", "))}.</div>` : ""}`}`;
}

function orList(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
}

/** "mostly white, about one in ten blue". Percentages only with numbers. */
export function litterWords(state: GameState, colour: Record<string, number>): string {
  const e = Object.entries(colour).filter(([, p]) => p > 0.005).sort((a, b) => b[1] - a[1]);
  if (!e.length) return "unknown";
  const nums = numbersOn(state);
  const w = (c: string, p: number) => nums ? `${Math.round(p * 100)}% ${c}` : p >= 0.95 ? `all ${c}` : `${fractionWords(p)} ${c}`;
  const [top, ...rest] = e;
  const head = top![1] >= 0.95 ? (nums ? w(top![0], top![1]) : `all ${top![0]}`) : top![1] >= 0.6 ? `mostly ${top![0]}` : w(top![0], top![1]);
  const tail = rest.slice(0, 2).map(([c, p]) => w(c, p));
  const blue = rest.find(([c]) => c === "blue");
  if (blue && !rest.slice(0, 2).includes(blue)) tail.push(w("blue", blue[1]));
  return [head, ...tail].join(", ");
}

/** Range bar: band = expected lamb ± spread; ticks for ewe, ram, flock average and expected value. */
export function rangeBar(
  state: GameState, label: string, unit: string, f: QuantForecast, lo: number, hi: number,
  ewe: number, ram: number, flock: number, lowerIsBetter: boolean,
): string {
  const pos = (v: number) => (v - lo) / (hi - lo);
  const bL = Math.max(0, pos(f.mean - f.sd)), bR = Math.min(1, pos(f.mean + f.sd));
  const nums = numbersOn(state);
  const vague = f.h2.pairs < 4;
  const note = nums
    ? `expected ${f.mean.toFixed(1)} ${unit} ± ${f.sd.toFixed(1)} · heritability ${f.h2.h2.toFixed(2)} from ${f.h2.pairs} families`
    : vague ? "Only a rough guess — more lambs on record will sharpen this." : `Based on ${f.h2.pairs} families on your farm.`;
  return `<div class="range">
    <div class="rlabel">${esc(label)} <span class="meta">${lowerIsBetter ? "finer ←" : "lighter ←"} → ${lowerIsBetter ? "coarser" : "heavier"}</span></div>
    <div class="track">
      <div class="band" style="${prop("l", bL)};${prop("w", Math.max(0.01, bR - bL))}"></div>
      <div class="tick flock" style="${prop("x", pos(flock))}" title="flock average"></div>
      <div class="tick ewe" style="${prop("x", pos(ewe))}" title="ewe"></div>
      <div class="tick ram" style="${prop("x", pos(ram))}" title="ram"></div>
      <div class="tick mean" style="${prop("x", pos(f.mean))}" title="expected lamb"></div>
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

function hintFor(state: GameState, f: CrossForecast, goal: Goal): string {
  const nums = numbersOn(state);
  switch (goal) {
    case "blue": {
      const p = f.colour["blue"] ?? 0;
      return nums ? `${Math.round(p * 100)}%` : p <= 0 ? "no" : oddsLabel(p).toLowerCase().replace("possible, but don't count on it", "possible");
    }
    case "learn": return "🔍".repeat(Math.min(3, Math.ceil(f.learnBits * 2))) || "—";
    case "fine": return nums ? `${f.fineness.mean.toFixed(1)} µm` : "";
    case "heavy": return nums ? `${f.fleeceWeight.mean.toFixed(1)} kg` : "";
  }
}

function learnMeter(bits: number, text: string): string {
  const n = Math.min(5, Math.round(bits * 2.5));
  let seg = "";
  for (let i = 0; i < 5; i++) seg += `<i class="${i < n ? "on" : ""}"></i>`;
  return `<div class="learn"><span class="learn-label">🔍 Learn</span><span class="meter">${seg}</span><span>${esc(text)}</span></div>`;
}

/** Which sheep the forecast is "for": the view's sheep, else the first adult ewe, else any adult. */
export function forecastSubject(state: GameState, view: View): Sheep | null {
  const s = view.sheepId ? state.sheep[view.sheepId] : undefined;
  if (s) return s;
  const flock = state.flock.map((id) => state.sheep[id]!);
  return flock.find((x) => x.sex === "ewe" && canBreed(x, state.season)) ?? flock.find((x) => isAdult(x, state.season)) ?? flock[0] ?? null;
}

export function forecastPanelHtml(state: GameState, view: View): string {
  const me = forecastSubject(state, view);
  if (!me) return `<h2>Find a mate</h2><p>There are no sheep on the farm. Visit the market.</p>`;
  const head = `<div class="panel-head">${portrait(view, me, "sm")}<div><h2>Find a mate for ${esc(me.name)} ${sexMark(me)}</h2>
    <div class="meta">Pick a goal, compare mates, then plan. Lambs arrive when you sleep.</div></div></div>`;
  if (!isAdult(me, state.season)) {
    return `${head}<p class="note-line">${esc(me.name)} is still growing — lambs take ${ADULT_AGE} seasons to grow up, so ${me.sex === "ewe" ? "she" : "he"} can breed from ${esc(seasonLabel(me.born + ADULT_AGE))}.</p>
      <div class="row"><button class="secondary" data-open="market">Buy a grown ${me.sex} at the market</button></div>`;
  }
  if (isIll(me, state.season)) return `${head}<p>${esc(me.name)} is poorly this season and needs rest. Try again next season.</p>`;
  if (!canBreed(me, state.season)) return `${head}<p>${esc(me.name)} has retired from lambing and enjoys the grass.</p>`;
  if (!state.flock.includes(me.id)) return `${head}<p>${esc(me.name)} isn't part of your flock.</p>`;

  const goal = view.goal;
  const ranked = rankCached(state, me.id, goal);
  const tabs = `<div class="tabs" role="tablist">${GOALS.map((g) =>
    `<button class="tab ${g.id === goal ? "on" : ""}" role="tab" aria-selected="${g.id === goal}" data-goal="${g.id}">${esc(g.label)}</button>`).join("")}</div>`;
  if (!ranked.length) {
    const other = me.sex === "ewe" ? "ram" : "ewe";
    const g = growingText(state, other);
    return `${head}${tabs}<p class="note-line">No ${other}s are ready to breed this season.${g ? ` ${esc(g)}` : ""}</p>
      <div class="row"><button data-open="market">Buy a grown ${other} at the market</button></div>`;
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
    const sub = isVisitor ? "visiting — nothing known" : busy ? "busy this season" : elsewhere ? `planned with ${elsewhere}` : c.rosettes.length ? `🏵 ×${c.rosettes.length}` : "";
    return `<button class="cand ${c.id === chosen.sheep.id ? "on" : ""} ${busy ? "busy" : ""} ${isVisitor ? "visitor" : ""}" data-mate="${esc(c.id)}" ${busy ? "disabled" : ""}>
      ${swatch(String(c.phenotype["colour"]))}
      <span class="cname">${esc(c.name)}${planned ? ` <span class="star" title="planned">★</span>` : ""}${sub ? `<span class="csub">${esc(sub)}</span>` : ""}</span>
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
  const bars = state.act >= 2
    ? rangeBar(state, "Fibre fineness", "µm", f.fineness, fin.mean - 3 * fin.sd, fin.mean + 3 * fin.sd, Number(ewe.phenotype["fineness"]), Number(ram.phenotype["fineness"]), fin.mean, true)
      + rangeBar(state, "Fleece weight", "kg", f.fleeceWeight, fw.mean - 3 * fw.sd, fw.mean + 3 * fw.sd, Number(ewe.phenotype["fleeceWeight"]), Number(ram.phenotype["fleeceWeight"]), fw.mean, false)
      + `<div class="ticks-key meta"><span class="k ewe"></span>ewe <span class="k ram"></span>ram <span class="k flock"></span>flock <span class="k mean"></span>expected lamb</div>`
    : `<p class="wool-hint">${esc(woolHint(state, f))}</p>`;
  const nPlanned = Object.keys(state.plans).length;
  const room = lambRoom(state);
  let commit: string;
  if (isVisitor && !hired) {
    commit = `<button data-hire="1" ${state.money < (state.visitingRam?.fee ?? 0) ? "disabled" : ""}>Hire ${esc(ram.name)} for ${state.visitingRam?.fee ?? 0} coins</button>
      <span class="meta">${esc(forecastVisitor(state).text)} He's only here this season.</span>`;
  } else {
    const blocked = !planned && room < 1 && state.plans[eweId] === undefined;
    commit = `<button data-plan="${esc(eweId)}:${esc(ramId)}" class="${planned ? "secondary" : "primary"}" ${blocked ? "disabled" : ""}>${planned ? "Cancel this mating" : state.plans[eweId] ? "Switch to this mating" : "Plan this mating"}</button>
      ${blocked ? `<button class="secondary small" data-open="market">Make room at the market</button>` : ""}
      ${blocked ? `<div class="note-line">No room for more lambs — your fields are full.${growingText(state) ? ` ${esc(growingText(state)!)}` : ""}</div>` : ""}
      <span class="meta">${nPlanned === 0 ? "Nothing planned yet" : `${nPlanned} mating${nPlanned === 1 ? "" : "s"} planned`} · sleep to see the lambs</span>`;
  }
  return `${head}${tabs}
  <div class="picker">
    <div class="cands" aria-label="Candidates, best first">${list}</div>
    <div class="forecast">
      <h3>${esc(ewe.name)} × ${esc(ram.name)}${planned ? ` <span class="star">★ planned</span>` : ""}</h3>
      ${isVisitor ? `<div class="note-line visitor">Visiting — nothing known about his family, so this forecast is only a wide guess.</div>` : ""}
      <div class="meta">If they had ten lambs…</div>
      ${litterRow(state, f)}
      <p class="blue-line">${swatch("blue")} ${esc(f.blueText)}</p>
      ${bars}
      <div class="row rel"><span class="tag">${esc(rel.text)}</span>${rel.warn ? `<span class="tag warn">⚠ ${esc(rel.warn)}</span>` : ""}${numbersOn(state) && f.inbreeding > 0 ? `<span class="meta">inbreeding ${f.inbreeding.toFixed(3)}</span>` : ""}</div>
      ${learnMeter(f.learnBits, f.learnText)}
      <div class="row commit">${commit}</div>
    </div>
  </div>`;
}

