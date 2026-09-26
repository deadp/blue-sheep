/** The season report: lambs next to the forecast the player saw, money, orders, fair, event, discoveries, act advance. */
import {
  FAIR_LABEL, seasonLabel, type CrossForecast, type GameState, type SeasonReport, type Sheep,
} from "../core/index.js";
import { litterRow, litterWords } from "./forecast.js";
import { cap, discoveryText, discoveryTitle, esc, hex, portrait, UNLOCK_WORDS } from "./util.js";
import type { View } from "./view.js";

const SURPRISE = 0.2;
const MAX_CARDS = 4;

function lambReveal(state: GameState, view: View, l: Sheep, f: CrossForecast | undefined): string {
  const colour = String(l.phenotype["colour"]);
  const p = f ? f.colour[colour] ?? 0 : 1;
  const surprise = !!f && p < SURPRISE;
  const blue = colour === "blue";
  return `<button class="born ${surprise ? "surprise" : ""} ${blue ? "blue" : ""}" data-sheep="${esc(l.id)}">
    ${portrait(view, l, "sm")}
    <span><b>${esc(l.name)}</b> <span class="meta">${l.sex === "ewe" ? "♀" : "♂"}</span><br>
    <span class="swatch" style="--wool:${hex(colour)}"></span>${esc(colour)}${l.phenotype["pattern"] === "spotted" ? ", spotted" : ""}${l.phenotype["horns"] === "horned" ? ", horned" : ""}${blue ? " — blue!" : ""}
    ${surprise ? `<br><span class="surprise-tag">✨ Surprise! Only a long shot</span>` : ""}${l.inbreeding >= 0.125 ? `<br><span class="meta">a little small — close kin</span>` : ""}</span>
  </button>`;
}

function matingRows(state: GameState, view: View, r: SeasonReport): string {
  const ewes = Object.keys(r.matings);
  if (!ewes.length) return "";
  return ewes.map((e) => {
    const ewe = state.sheep[e], ram = state.sheep[r.matings[e]!];
    const f = r.forecastsSeen[e];
    const lambs = r.lambs.filter((l) => l.dam === e);
    return `<div class="reveal">
      <div class="r-pair"><b>${esc(ewe?.name ?? "?")} × ${esc(ram?.name ?? "?")}</b></div>
      <div class="r-fore"><div class="lbl">You expected</div>${f ? litterRow(state, f, true) : ""}<div class="meta">${f ? esc(litterWords(state, f.colour)) : ""}</div></div>
      <div class="r-arrow" aria-hidden="true">→</div>
      <div class="r-born"><div class="lbl">Born</div>${lambs.length ? lambs.map((l) => lambReveal(state, view, l, f)).join("") : `<span class="meta">${esc(ewe?.name ?? "She")} was too poorly to lamb.</span>`}</div>
    </div>`;
  }).join("");
}

function latestSummary(state: GameState): string {
  const last = state.log.filter((l) => l.season === state.season).slice(-8);
  return `<h2>${esc(seasonLabel(state.season))}</h2>
    ${last.length ? `<ul class="plain">${last.map((l) => `<li>${esc(l.text)}</li>`).join("")}</ul>` : `<p>Nothing has happened yet this season. Plan some matings, then sleep.</p>`}
    <div class="row"><button class="primary" data-close>Carry on</button></div>`;
}

export function reportHtml(state: GameState, view: View): string {
  const r = view.report;
  if (!r) return latestSummary(state);
  const blocks: string[] = [];
  if (r.actAdvanced) {
    const a = r.actAdvanced;
    blocks.push(`<div class="act-banner"><div class="act">Act ${a.act + 1} · ${esc(a.title)}</div><blockquote>“${esc(a.line)}”</blockquote>
      <div><b>New goal:</b> ${esc(a.goalText)}</div>
      ${a.unlocks.length ? `<div class="unlocks">${a.unlocks.map((u) => `<span class="tag ok">🔓 ${esc(UNLOCK_WORDS[u])}</span>`).join("")}</div>` : ""}
      ${a.flockCap > 0 ? `<div class="meta">Room for ${state.flockCap} sheep.</div>` : ""}</div>`);
  }
  const blues = r.lambs.filter((l) => l.phenotype["colour"] === "blue");
  if (blues.length && state.stats.bluesBorn === blues.length) {
    blocks.push(`<div class="act-banner blue"><div class="act">💙 Your first blue lamb!</div><div>${esc(blues.map((b) => b.name).join(" and "))} ${blues.length > 1 ? "are" : "is"} blue — the colour hiding in the flock all along.</div></div>`);
  }
  if (r.endingReached) blocks.push(`<div class="act-banner gold"><div class="act">🏅 Your breed is registered!</div><div>The whole village is coming to see.</div></div>`);
  const matings = matingRows(state, view, r);
  blocks.push(`<h3>Lambing</h3>${matings || `<p class="meta">No matings were planned, so no lambs this time.</p>`}`);
  if (r.discoveries.length) {
    // A big season can turn up a dozen facts; show the first few and send the rest to the codex.
    const shown = r.discoveries.slice(0, MAX_CARDS);
    const more = r.discoveries.length - shown.length;
    blocks.push(`<h3>New discoveries</h3><div class="dcards">${shown.map((d) =>
      `<div class="dcard sparkle"><div class="d-top">✨ ${esc(discoveryTitle(d))}</div><div>${esc(discoveryText(state, d))}</div></div>`).join("")}</div>
      ${more > 0 ? `<p class="meta">…and ${more} more. <button class="link" data-open="codex">See them all in the codex</button></p>` : ""}`);
  }
  const shed = r.shedBonus ? ` (the shearing shed added ${r.shedBonus})` : "";
  const money: string[] = [`🧶 Wool sold for <b>${r.income}</b> coins${shed}`, `🌾 feed cost <b>${r.feed}</b>`];
  const lines: string[] = [];
  for (const o of r.orderResults) lines.push(`<li class="${o.outcome === "filled" ? "good" : "bad"}">${o.outcome === "filled" ? "✉️" : "💔"} ${esc(cap(o.text))}${o.reward ? ` <b>+${o.reward}</b>` : ""}</li>`);
  if (r.fairResult) {
    const fr = r.fairResult;
    lines.push(`<li class="${fr.place === 1 ? "good" : ""}">🎪 ${esc(FAIR_LABEL[fr.category])}: ${esc(fr.text)}${fr.prize ? ` <b>+${fr.prize}</b>` : ""}</li>`);
  }
  if (r.event) lines.push(`<li>${r.event.kind === "fox" ? "🦊" : r.event.kind === "hardWinter" ? "❄️" : "📈"} ${esc(r.event.text)}</li>`);
  for (const d of r.deaths) lines.push(`<li>🕊 ${esc(d.name)} is gone.</li>`);
  for (const a of r.autoSold) lines.push(`<li class="bad">🛒 The trader took ${esc(a.name)} for ${a.price} coins (${a.reason === "feed" ? "feed money ran short" : "no room"}).</li>`);
  if (r.announced) lines.push(`<li>📣 ${esc(r.announced.text)}</li>`);
  if (r.newOrders.length) lines.push(`<li>✉️ ${r.newOrders.length} new order${r.newOrders.length === 1 ? "" : "s"} in the mailbox.</li>`);
  blocks.push(`<h3>The farm</h3><p>${money.join(" · ")}. You have ${state.money} coins.</p>${lines.length ? `<ul class="plain events">${lines.join("")}</ul>` : ""}`);
  return `<h2>${esc(seasonLabel(r.season))} <span class="meta">— a new season</span></h2>
    ${blocks.join("")}
    <div class="row"><button class="primary" data-close>Back to the farm</button>${r.newOrders.length ? `<button class="secondary" data-open="orders">Read the orders</button>` : ""}</div>`;
}
