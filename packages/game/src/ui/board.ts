/** Shed board (goal, plans, orders, announcements, diary) and the orders panel. */
import {
  FAIR_LABEL, MAX_ACCEPTED_ORDERS, currentAct, forecastOrderFor, lambRoom, seasonLabel,
  type GameState, type Order,
} from "../core/index.js";
import { litterWords } from "./forecast.js";
import { crossCached } from "./cache.js";
import { dueWords, esc, has, pips, prop, swatch } from "./util.js";
import type { View } from "./view.js";

export function goalCard(state: GameState): string {
  const a = currentAct(state);
  return `<div class="goal-card">
    <div class="act">${a.endless ? "Endless" : `Act ${a.act + 1}`} · ${esc(a.title)}</div>
    <div class="goal">${esc(a.goalText)}</div>
    <div class="bar" role="progressbar" aria-label="Goal progress"><span style="${prop("p", a.progress)}"></span></div>
    <div class="meta">${esc(a.progressText)}</div>
  </div>`;
}

function upcoming(state: GameState): string[] {
  const out: string[] = [];
  if (state.pendingEvent) out.push(`📣 ${state.pendingEvent.text}`);
  if (lambRoom(state) < 1) out.push("🌾 The fields are full — no room for new lambs until you sell.");
  if (has(state, "fair")) {
    const when = state.fair.nextSeason - state.season;
    const entry = state.fair.entry ? state.sheep[state.fair.entry]?.name : null;
    out.push(`🎪 Village fair ${when <= 0 ? "this season" : `in ${seasonLabel(state.fair.nextSeason)}`}: ${FAIR_LABEL[state.fair.category].toLowerCase()}. ${entry ? `${entry} is entered.` : "No entry yet."}`);
  }
  if (state.visitingRam && state.visitingRam.season === state.season) {
    const r = state.sheep[state.visitingRam.id];
    if (r) out.push(`🐏 ${r.name}, a visiting ram, is here this season only${state.hiredRam === r.id ? " — hired!" : ` (${state.visitingRam.fee} coins to hire).`}`);
  }
  return out;
}

export function boardHtml(state: GameState, _view: View): string {
  const plans = Object.entries(state.plans).map(([e, r]) => {
    const ewe = state.sheep[e], ram = state.sheep[r];
    if (!ewe || !ram) return "";
    let words = "";
    try { words = litterWords(state, crossCached(state, e, r).colour); } catch { words = ""; }
    return `<li><button class="link" data-findmate="${esc(e)}">${esc(ewe.name)} × ${esc(ram.name)}</button>
      ${words ? `<span class="meta">${esc(words)}</span>` : ""}
      <button class="icon" data-plan="${esc(e)}:${esc(r)}" title="Cancel this mating" aria-label="Cancel ${esc(ewe.name)} × ${esc(ram.name)}">✕</button></li>`;
  }).join("");
  const accepted = state.orders.filter((o) => o.status === "accepted");
  const orders = accepted.map((o) => {
    let f = { pFill: 0, text: "" };
    try { f = forecastOrderFor(state, o); } catch { /* keep blank */ }
    return `<li><div>${esc(o.text)}<div class="meta">${esc(dueWords(state, o.deadline))}</div><div class="o-forecast">${pips(state, f.pFill)} <span class="meta">${esc(f.text)}</span></div></div></li>`;
  }).join("");
  const news = upcoming(state);
  let lastSeason = -Infinity;
  const diary = state.log.slice(-10).reverse().map((l) => {
    const head = l.season !== lastSeason ? `<li class="day">${esc(seasonLabel(l.season))}</li>` : "";
    lastSeason = l.season;
    return `${head}<li>${esc(l.text)}</li>`;
  }).join("");
  return `<h2>Shed board</h2>
  <div class="notes">
    <div class="note goal-note">${goalCard(state)}</div>
    <div class="note"><b>Planned matings</b>
      ${plans ? `<ul class="plain">${plans}</ul>` : `<p class="meta">None yet. Click a sheep, then “Find a mate”.</p>`}
      <div class="row"><button class="primary" data-sleep="1">Sleep 🌙</button></div></div>
    ${has(state, "orders") ? `<div class="note"><b>Promised orders</b>${orders ? `<ul class="plain">${orders}</ul>` : `<p class="meta">None taken. Check the mailbox.</p>`}
      <div class="row"><button class="secondary" data-open="orders">Orders</button></div></div>` : ""}
    <div class="note"><b>Coming up</b>${news.length ? `<ul class="plain">${news.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : `<p class="meta">A quiet season ahead.</p>`}</div>
  </div>
  <h3>Diary</h3><ul class="diary">${diary}</ul>`;
}

// ---- Orders -----------------------------------------------------------------

function orderIcon(o: Order): string {
  if (o.kind === "wool") return "🧶";
  if (o.kind === "horns") return "🐏";
  return swatch(o.colour ?? "white");
}

function orderCard(state: GameState, o: Order, mode: "open" | "accepted"): string {
  let f = { pFill: 0, text: "" };
  try { f = forecastOrderFor(state, o); } catch { /* keep blank */ }
  const full = state.acceptedOrders.length >= MAX_ACCEPTED_ORDERS;
  return `<div class="order ${mode}">
    <div class="o-icon">${orderIcon(o)}</div>
    <div class="o-body">
      <div class="o-text">${esc(o.text)}</div>
      <div class="meta">${esc(dueWords(state, o.deadline))} · reward ${o.reward} coins${o.reputation ? ` and ${"★".repeat(o.reputation)}` : ""}</div>
      <div class="o-forecast"><span class="lbl">Chance you can fill it</span> ${pips(state, f.pFill)} <span>${esc(f.text)}</span></div>
    </div>
    <div class="o-actions">${mode === "open"
      ? `<button class="primary" data-accept="${esc(o.id)}" ${full ? "disabled title=\"You can only take two at a time\"" : ""}>Accept</button><button class="secondary" data-decline="${esc(o.id)}">Decline</button>`
      : `<button class="secondary" data-decline="${esc(o.id)}" title="Giving up costs a little reputation">Give up</button>`}</div>
  </div>`;
}

export function ordersHtml(state: GameState, _view: View): string {
  if (!has(state, "orders")) return `<h2>Mailbox</h2><p>No letters yet. Once the village hears about your flock, orders will arrive here.</p>`;
  const open = state.orders.filter((o) => o.status === "open");
  const accepted = state.orders.filter((o) => o.status === "accepted");
  const past = state.orderHistory.slice(-4).reverse();
  return `<h2>Orders</h2>
    <p class="meta">Villagers pay well for the right sheep. Each forecast uses what you know and the matings you've planned. You can hold ${MAX_ACCEPTED_ORDERS} at a time.</p>
    <h3>Promised (${accepted.length} of ${MAX_ACCEPTED_ORDERS})</h3>
    ${accepted.length ? accepted.map((o) => orderCard(state, o, "accepted")).join("") : `<p class="meta">Nothing promised yet.</p>`}
    <h3>New letters</h3>
    ${open.length ? open.map((o) => orderCard(state, o, "open")).join("") : `<p class="meta">No new letters. More arrive with the seasons.</p>`}
    ${past.length ? `<h3>Past orders</h3><ul class="plain past">${past.map((o) => `<li><span class="tag ${o.status === "filled" ? "ok" : "warn"}">${esc(o.status)}</span> ${esc(o.text)}</li>`).join("")}</ul>` : ""}`;
}
