/**
 * The woolshed's crafting side (DESIGN-v3 §5, §6, §13 Phase 5): the benches with their jobs, the wool to work, the pattern
 * cards with a forecast each (Decide, Forecast, Commit), the finished items, and the item buyer. Words, stars and bars;
 * the quality numbers only with the "numbers" unlock.
 */
import {
  BENCH_LABEL, BENCH_UPGRADES, RECIPES, STOCK_KINDS, allSources, benchCapacity, benchOwned, benchTier, demandLevel, forecastItemSale,
  forecastJob, forecastUpgrade, handsLevel, handsWord, itemKey, itemName, itemPrice, itemsOf, jobsOf, patternList, recipeOf, seasonLabel,
  starsWord, upgradeBlocked, upgradeDef, hasUpgrade, qualityWord,
  type BenchName, type GameState, type Job, type JobForecast, type Item, type SeenForecast,
} from "../core/index.js";
import { btn, head, icon, tag } from "./felt/index.js";
import { esc, numbersOn, swatch } from "./util.js";
import { demandMeter } from "./woolshed.js";
import type { View } from "./view.js";

const BENCHES: BenchName[] = ["card", "spin", "knit", "weave", "felt"];
const BENCH_ICON = { card: "brush", spin: "yarn", knit: "pencil", weave: "board", felt: "hand" } as const;
const STAGE_WORD: Record<string, string> = { card: "carding", spin: "spinning", knit: "knitting", weave: "weaving", felt: "felting" };

/** "★★★" with the empty stars of a five-star scale greyed. */
export function starsHtml(n: number, label = ""): string {
  const full = Math.max(0, Math.min(5, n));
  return `<span class="cstars" role="img" aria-label="${esc(label || `${full} of 5 stars`)}">${"★".repeat(full)}<i>${"★".repeat(5 - full)}</i></span>`;
}
/** A star band: "★★★ to ★★★★" or one run when it is a single value. */
export function starBand(lo: number, hi: number): string {
  return lo === hi ? starsHtml(lo) : `${starsHtml(lo)} <span class="meta">to</span> ${starsHtml(hi)}`;
}
const coinBand = (lo: number, hi: number): string => (lo === hi ? `${lo}` : `${lo}–${hi}`);

/** The wool the player has picked (the first source until they pick another). */
export function pickedSource(state: GameState, view: View): string | null {
  const all = allSources(state);
  const want = view.src ? all.find((s) => s.key === view.src) : null;
  return (want ?? all[0])?.key ?? null;
}

function whenWord(state: GameState, finish: number): string {
  const n = finish - state.season;
  return `${seasonLabel(finish)} (${n} season${n === 1 ? "" : "s"})`;
}

function jobCard(state: GameState, j: Job): string {
  const stage = j.route[0]!;
  const left = j.seen.finish - state.season;
  return `<div class="job" data-job="${j.id}" style="--wool:${esc(j.mat.hex)}">
    ${swatch(j.mat.hex, "job-sw")}
    <div class="j-body"><b>${esc(itemName(j.item))}</b> <span class="meta">from ${esc(j.mat.name)}'s ${esc(j.mat.word)} wool</span>
      <div class="meta">${esc(STAGE_WORD[stage]!)} now${j.route.length > 1 ? `, then ${j.route.slice(1).map((s) => esc(STAGE_WORD[s]!)).join(", then ")}` : ""} · ready ${left <= 0 ? "soon" : esc(seasonLabel(j.seen.finish))}</div>
      ${j.item === "batt" || j.item === "yarn" ? `<div class="meta">Stock for later.</div>` : `<div class="meta">Forecast ${starBand(j.seen.starsLo, j.seen.starsHi)}</div>`}</div>
    ${j.started ? `<span class="meta">under way</span>` : btn("", { kind: "ghost", icon: "close", cls: "small", data: { cancel: String(j.id) }, aria: "Cancel this job and take the wool back", title: "Cancel and take the wool back" })}
  </div>`;
}

function benchColumn(state: GameState, b: BenchName): string {
  const owned = benchOwned(state, b);
  const jobs = jobsOf(state).filter((j) => j.route[0] === b);
  const cap = benchCapacity(state, b);
  const unit = b === "card" || b === "spin" ? "kg" : "work";
  const load = jobs.reduce((n, j) => n + j.left, 0);
  const pips = Array.from({ length: 4 }, (_, i) => `<i class="${i < benchTier(state, b) ? "on" : ""}"></i>`).join("");
  const next = BENCH_UPGRADES.filter((u) => u.bench === b && !hasUpgrade(state, u.id)).sort((a, c) => a.tier - c.tier)[0];
  const lvl = handsLevel(state, b);
  const upg = next ? (() => {
    const d = upgradeDef(next.id), why = upgradeBlocked(state, next.id);
    return `<div class="b-up">${btn(`${esc(d.name)} · ${d.price}`, { kind: why ? "ghost" : "secondary", icon: "coin", cls: "small", data: { upgrade: next.id }, title: why ?? forecastUpgrade(state, next.id).text })}
      <span class="meta">${esc(d.blurb)}</span></div>`;
  })() : "";
  return `<div class="bench ${owned ? "" : "locked"}" data-bench="${b}">
    <div class="b-head">${icon(owned ? BENCH_ICON[b] : "lock")}<b>${esc(BENCH_LABEL[b])}</b><span class="b-tier" title="Bench size">${pips}</span></div>
    ${owned ? `<div class="meta">${numbersOn(state) ? `${cap} ${unit} a season · ` : ""}${load > 0 ? (load > cap ? "booked up" : "busy") : "free"} · hands: ${esc(handsWord(lvl))}</div>
      <div class="b-jobs">${jobs.length ? jobs.map((j) => jobCard(state, j)).join("") : `<p class="meta">Nothing on the bench.</p>`}</div>`
      : `<p class="meta">${b === "weave" ? "A loom opens weaving." : "A felting table opens felting."}</p>`}
    ${upg}
  </div>`;
}

function forecastBox(state: GameState, f: JobForecast, item: string): string {
  if (!f.ok) return `<div class="cf-box off"><span class="meta">${esc(f.why)}</span></div>`;
  if (f.stock) return `<div class="cf-box"><div>Ready <b>${esc(whenWord(state, f.finish))}</b></div><div class="meta">${f.kg} kg of ${item === "batt" ? "carded batt" : "spun yarn"} for later.</div></div>`;
  const nums = numbersOn(state);
  return `<div class="cf-box" data-cf="${esc(item)}">
    <div class="cf-row"><span class="meta">Should come out</span> ${starBand(f.starsLo, f.starsHi)} <span class="meta">${esc(qualityWord(f.starsHi))}${nums ? ` · quality ${Math.round(f.qLo)}–${Math.round(f.qHi)}` : ""}</span></div>
    <div class="cf-row"><span class="meta">Worth about</span> <b>${coinBand(f.coinsLo, f.coinsHi)}</b> ${icon("coin", "inl")} <span class="meta">each, if sold then</span></div>
    <div class="cf-row"><span class="meta">Ready</span> <b>${esc(whenWord(state, f.finish))}</b></div>
    ${f.notes.length ? `<div class="meta">${esc(f.notes.join(" "))}</div>` : ""}
  </div>`;
}

function patternCard(state: GameState, view: View, srcKey: string | null, item: string, known: boolean, hint: string): string {
  const r = recipeOf(item)!;
  if (!known) {
    return `<div class="pattern locked" data-pattern="${esc(item)}" data-locked="1" aria-label="A pattern you haven't learned yet">
      <div class="p-sil" aria-hidden="true">${icon("lock")}</div>
      <div class="p-body"><b>???</b><div class="meta">${esc(hint)}</div></div></div>`;
  }
  const f = srcKey ? forecastJob(state, { item, source: srcKey }) : null;
  return `<div class="pattern" data-pattern="${esc(item)}">
    <div class="p-body"><b>${esc(r.name)}</b> <span class="meta">${esc(r.blurb)}</span>
      ${f ? forecastBox(state, f, item) : `<div class="cf-box off"><span class="meta">Pick some wool first.</span></div>`}</div>
    <div class="p-act">${btn("Queue", { kind: "primary", icon: "yarn", cls: "small", data: { queue: item }, disabled: !f || !f.ok, title: f && !f.ok ? f.why : `Start ${r.name.toLowerCase()}` })}</div>
  </div>`;
}

function makeAhead(state: GameState, srcKey: string | null): string {
  const cards = STOCK_KINDS.map((k) => {
    const f = srcKey ? forecastJob(state, { item: k, source: srcKey }) : null;
    const ok = !!f && f.ok;
    return `<div class="pattern stock" data-pattern="${k}"><div class="p-body"><b>${k === "batt" ? "Card a batt" : "Spin yarn"}</b>
      <span class="meta">${k === "batt" ? "Cards half a kilo to keep for later (skips a step when you felt or spin)." : "Cards and spins half a kilo to keep (skips two steps when you knit or weave)."}</span>
      ${f ? `<div class="meta">${ok ? `Ready ${esc(whenWord(state, f.finish))}` : esc(f.why)}</div>` : ""}</div>
      <div class="p-act">${btn("Queue", { kind: "secondary", icon: "yarn", cls: "small", data: { queue: k }, disabled: !ok })}</div></div>`;
  }).join("");
  return cards;
}

/** The workbench tab. */
export function workbenchHtml(state: GameState, view: View): string {
  const srcKey = pickedSource(state, view);
  const sources = allSources(state);
  const chips = sources.length
    ? sources.map((s) => `<button class="chip ${s.key === srcKey ? "on" : ""}" data-src="${esc(s.key)}" aria-pressed="${s.key === srcKey}">${swatch(s.mat.hex, "chip-sw")}<span class="nm">${esc(s.label)}</span><span class="meta">${s.mat.kg.toFixed(1)} kg</span></button>`).join("")
    : `<p class="meta">No wool in the shed. Your sheep are shorn in spring and autumn; with auto-sell off the clip waits in the store.</p>`;
  const pats = patternList(state);
  return `${head("yarn", "Wool to work")}
    <div class="chips src-chips" role="group" aria-label="Wool to work">${chips}</div>
    ${head("pencil", "Patterns")}
    <div class="patterns">${pats.map((p) => patternCard(state, view, srcKey, p.item, p.known, p.hint)).join("")}</div>
    ${head("box", "Make ahead")}
    <div class="patterns">${makeAhead(state, srcKey)}</div>
    ${head("board", "The benches")}
    <p class="meta">Each job does one step a season, in the order it was queued. Cancel a job before it starts to take the wool back.</p>
    <div class="benches">${BENCHES.map((b) => benchColumn(state, b)).join("")}</div>`;
}

/** What the player saw, next to what they got (the report and the item card). */
export function flipLine(it: Item, seen: SeenForecast | null): string {
  if (!seen) return "";
  const ok = it.stars >= seen.starsLo && it.stars <= seen.starsHi;
  const verdict = it.stars > seen.starsHi ? "Better than hoped!" : ok ? "Ka pai!" : "Not your best.";
  return `Forecast ${starBand(seen.starsLo, seen.starsHi)}, made ${starsHtml(it.stars)}. ${verdict}`;
}

function itemCard(state: GameState, it: Item): string {
  const p = itemPrice(it.kind, it.q, demandLevel(state, itemKey(it.kind)));
  return `<div class="item" data-item="${it.id}" style="--wool:${esc(it.hex)}">
    ${swatch(it.hex, "lot-sw")}
    <div class="i-body"><b>${esc(itemName(it.kind))}</b> <span class="meta">${esc(it.word)} wool</span>
      <div>${starsHtml(it.stars)} <span class="meta">${esc(qualityWord(it.stars))}${numbersOn(state) ? ` · quality ${it.q}` : ""}</span></div>
      ${it.seen ? `<div class="meta flip">${flipLine(it, it.seen)}</div>` : ""}</div>
    <div class="i-act">${btn(`Sell · ${p.coins}`, { kind: "secondary", icon: "coin", cls: "small", data: { sellitem: String(it.id) } })}</div>
  </div>`;
}

/** The items tab: finished goods and their demand. */
export function itemsTabHtml(state: GameState, view: View, sale: string): string {
  const items = itemsOf(state);
  if (!items.length) return `${sale}<p class="meta">Nothing finished yet. Queue a job on the workbench: the report will show each item when it is done.</p>`;
  const kinds = [...new Set(items.map((i) => i.kind))];
  return `${sale}${kinds.map((k) => {
    const mine = items.filter((i) => i.kind === k).sort((a, b) => b.q - a.q);
    const f = forecastItemSale(state, k);
    return `<div class="item-group" data-kind="${esc(k)}">
      <div class="ig-head"><b>${esc(itemName(k))}</b> ${demandMeter(state, demandLevel(state, itemKey(k)), `${itemName(k)} demand`, { compact: true })}
        ${mine.length > 1 ? btn(`Sell all ${mine.length} · ${f.coins}`, { kind: "primary", icon: "coin", cls: "small", data: { sellitems: k } }) : ""}</div>
      ${mine.length > 1 ? `<div class="meta">After you sell them all: ${demandMeter(state, f.after, `${itemName(k)} after selling`, { compact: true })}</div>` : ""}
      <div class="lots">${mine.map((i) => itemCard(state, i)).join("")}</div></div>`;
  }).join("")}`;
}

/** The market's item buyer: a meter per kind of item you have made, and what selling them would do. */
export function itemBuyerHtml(state: GameState): string {
  const items = itemsOf(state);
  const kinds = RECIPES.filter((r) => items.some((i) => i.kind === r.id) || state.demand?.[itemKey(r.id)] !== undefined);
  if (!kinds.length) return "";
  const rows = kinds.map((r) => {
    const mine = items.filter((i) => i.kind === r.id);
    const d = demandLevel(state, itemKey(r.id));
    const f = mine.length ? forecastItemSale(state, r.id) : null;
    return `<div class="buyer-row" data-item-kind="${esc(r.id)}">
      <div class="b-name">${tag(esc(r.name), { icon: "yarn" })}</div>
      <div class="b-meter">${demandMeter(state, d, `${r.name} demand`)}${f ? `<div class="b-after"><span class="meta">After you sell:</span> ${demandMeter(state, f.after, `${r.name} after selling`, { compact: true })}</div>` : ""}</div>
      <div class="b-act">${f ? btn(`Sell ${mine.length} · ${f.coins}`, { kind: "primary", icon: "coin", cls: "small", data: { sellitems: r.id } }) : `<span class="meta">none made</span>`}</div>
    </div>`;
  }).join("");
  return `${head("star", "Handmade goods")}
    <p class="meta">${icon("lens", "inl")} Each kind of item has its own appetite: knitted hats are wanted in winter, tea cosies in summer. Sell a lot at once and the price sags until the village wants more.</p>
    <div class="buyer-rows">${rows}</div>`;
}
