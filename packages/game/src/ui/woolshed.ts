/** The wool store (the woolshed panel) and the wool buyer with its demand meters (in the market). DESIGN-v3 §5, §7. */
import {
  WOOL_TYPES, WOOL_TYPE_LABEL, autoSellOn, boomColourNow, demandFraction, demandLevel, demandMult, demandWord, finenessWord, flockSheep, forecastSale, isAdult, isShearingSeason,
  lotPrice, rawKey, seasonLabel, storeCap, storeOf, woolTypeOf, type FleeceLot, type GameState,
} from "../core/index.js";
import { btn, head, icon, tag } from "./felt/index.js";
import { esc, numbersOn, swatch } from "./util.js";
import type { View } from "./view.js";

/** A demand meter: ten felt dots filled to the level, the word beside it; the price multiplier only with numbers. */
export function demandMeter(state: GameState, d: number, label: string, o: { compact?: boolean } = {}): string {
  const n = Math.max(0, Math.min(10, Math.round(demandFraction(d) * 10)));
  let segs = "";
  for (let i = 0; i < 10; i++) segs += `<i class="${i < n ? `on s${i}` : ""}"></i>`;
  const word = demandWord(d);
  return `<span class="meter2 demand ${o.compact ? "compact" : ""}" role="meter" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${n}" aria-label="${esc(`${label}: ${word}`)}" title="${esc(`${label}: ${word}`)}">
    <span class="m-row"><span class="m-bar demand">${segs}</span><span class="m-word">${esc(word)}${numbersOn(state) ? ` <span class="num">${demandMult(d).toFixed(2)}×</span>` : ""}</span></span></span>`;
}

function clipWord(kg: number): string {
  return kg < 6 ? "a light clip" : kg < 11 ? "a fair clip" : "a heavy clip";
}

/** The words of a phrase, lower-cased, hyphens splitting compounds ("medium-fine" has "medium"). */
const wordsOf = (t: string): string[] => t.toLowerCase().split(/[^a-z]+/).filter(Boolean);

/**
 * "Strong, a heavy clip": the wool type, the fineness word and the clip. The fineness word is dropped when it
 * shares a word with the type's name (a Strong fleece is strong already), so no word repeats.
 */
export function lotDescription(type: string, microns: number, greasyKg: number): string {
  const typeName = WOOL_TYPE_LABEL[type as keyof typeof WOOL_TYPE_LABEL] ?? type;
  const fine = finenessWord(microns);
  const taken = new Set(wordsOf(typeName));
  const parts = [typeName, ...(wordsOf(fine).some((w) => taken.has(w)) ? [] : [fine]), clipWord(greasyKg)];
  return parts.join(", ");
}

/** Wool types worth a row: those in the store or on an adult sheep, in the usual order. */
function typesShown(state: GameState): string[] {
  const have = new Set<string>(storeOf(state).map((l) => l.type));
  for (const s of flockSheep(state)) if (isAdult(s, state.season)) have.add(woolTypeOf(s));
  return WOOL_TYPES.filter((t) => have.has(t));
}

/** What the player expected from the last sale, next to what they got (the Reveal). */
function revealLine(view: View): string {
  const s = view.sale;
  if (!s) return "";
  const ok = s.paid === s.forecast;
  return `<div class="sale-reveal ${ok ? "same" : "off"}" data-sale="1">${icon("check", "inl")} ${esc(s.text)} You expected <b>${s.forecast}</b> coins and got <b>${s.paid}</b>.</div>`;
}

/** The wool buyer: a demand meter per wool type, and what selling what you have stored would do (Forecast, then Commit). */
export function woolBuyerHtml(state: GameState, view: View): string {
  const store = storeOf(state);
  const types = typesShown(state);
  const boom = boomColourNow(state);
  const rows = types.map((t) => {
    const lots = store.filter((l) => l.type === t);
    const d = demandLevel(state, rawKey(t));
    const label = `${WOOL_TYPE_LABEL[t as keyof typeof WOOL_TYPE_LABEL]} wool`;
    let after = "";
    let act = `<span class="meta">nothing stored</span>`;
    if (lots.length) {
      const f = forecastSale(state, lots.map((l) => l.id));
      const dAfter = f.after[t] ?? d;
      after = `<div class="b-after" data-after="${esc(t)}"><span class="meta">After you sell:</span> ${demandMeter(state, dAfter, `${label} after selling`, { compact: true })}</div>`;
      act = btn(`Sell ${lots.length} · ${f.coins}`, { kind: "primary", icon: "coin", cls: "small", data: { selltype: t }, title: `${lots.length} fleece${lots.length === 1 ? "" : "s"} for ${f.coins} coins` });
    }
    return `<div class="buyer-row" data-wool-type="${esc(t)}">
      <div class="b-name">${tag(esc(WOOL_TYPE_LABEL[t as keyof typeof WOOL_TYPE_LABEL]), { icon: "yarn", cls: `wool-type wt-${t}` })}</div>
      <div class="b-meter">${demandMeter(state, d, label)}${after}</div>
      <div class="b-act">${act}</div>
    </div>`;
  }).join("");
  const all = store.length ? forecastSale(state, store.map((l) => l.id)) : null;
  return `${head("yarn", "Wool buyer")}
    <p class="meta">${icon("lens", "inl")} The more of one kind of wool you sell, the less it fetches that season; it recovers as the seasons pass.${boom ? ` The weavers want ${esc(boom)} wool: it fetches double for now.` : ""}</p>
    ${revealLine(view)}
    <div class="buyer-rows">${rows || `<p class="meta">No grown sheep to shear yet.</p>`}</div>
    ${all && store.length > 1 ? `<div class="row">${btn(`Sell all ${store.length} fleeces · ${all.coins}`, { kind: "secondary", icon: "coin", data: { selltype: "all" } })}</div>` : ""}
    <div class="row">${btn("Open the woolshed", { kind: "ghost", icon: "board", data: { open: "woolshed" } })}</div>`;
}

function lotCard(state: GameState, l: FleeceLot): string {
  const p = lotPrice(state, l, demandLevel(state, rawKey(l.type)));
  const nums = numbersOn(state);
  return `<div class="lot" data-lot="${esc(l.id)}" style="--wool:${esc(l.hex)}">
    ${swatch(l.hex, "lot-sw")}
    <div class="l-body"><div class="l-name"><b>${esc(l.name)}</b>'s ${esc(l.word)} fleece</div>
      <div class="meta">${esc(lotDescription(l.type, l.microns, l.greasy))}${nums ? ` · ${l.greasy} kg greasy, ${l.clean} kg washed · ${Math.round(l.microns)} µm` : ""} · shorn ${esc(seasonLabel(l.season))}</div></div>
    <div class="l-act">${btn(`Sell · ${p.coins}`, { kind: "secondary", icon: "coin", cls: "small", data: { selllot: l.id }, title: `${demandWord(demandLevel(state, rawKey(l.type)))} demand for ${l.type} wool` })}</div>
  </div>`;
}

/** The woolshed: the wool store with its fleece lots, auto-sell, and a way to the wool buyer. */
export function woolshedHtml(state: GameState, view: View): string {
  const store = storeOf(state), cap = storeCap(state), auto = autoSellOn(state);
  const next = isShearingSeason(state.season) ? "at the end of this season" : "next spring or autumn";
  const lots = store.length
    ? `<div class="lots">${store.map((l) => lotCard(state, l)).join("")}</div>`
    : `<p class="meta">${auto ? "Auto-sell is on, so each clip goes straight to the wool buyer." : "The store is empty."} Your sheep are shorn ${next}.</p>`;
  return `<div class="panel-head">${head("yarn", "Woolshed", 2)}<div class="tags">${tag(`${store.length} of ${cap} fleeces`, { icon: "store", tone: store.length >= cap ? "rose" : "sage", title: "Fleeces in the store" })}${tag(String(state.money), { icon: "coin", tone: "butter", title: "Your coins" })}</div></div>
    <p class="meta">Every adult is shorn in spring and autumn. Each fleece is washed and kept here until you sell it, so you can wait for the wool buyer to want it. A full store sends the extra fleeces straight to the buyer.</p>
    <div class="row autosell">${btn(`Auto-sell: ${auto ? "on" : "off"}`, { kind: auto ? "secondary" : "primary", icon: auto ? "check" : "yarn", data: { autosell: auto ? "off" : "on" }, title: "Sell each clip to the wool buyer at shearing" })}
      <span class="meta">${auto ? "Each clip is sold at shearing." : "Clips are kept here until you sell them."}</span></div>
    ${revealLine(view)}
    ${head("store", "In the store")}
    ${lots}
    ${woolBuyerHtml(state, { ...view, sale: undefined })}`;
}
