/** Title, help, settings, ending and the HUD. */
import {
  canBreed, currentAct, lambRoom, seasonLabel, seasonOfYear, type GameState,
} from "../core/index.js";
import { esc, has, prop, stars } from "./util.js";
import type { View } from "./view.js";

const FLAVOUR = [
  "Somewhere in this flock, a blue lamb is waiting to be born.",
  "Two white sheep, one black lamb. Something is hiding in the wool.",
  "Every lamb is a little surprise. Some are big ones.",
];

function sheepArt(): string {
  return `<div class="title-sheep" aria-hidden="true"><span class="body"></span><span class="head"></span><span class="leg l1"></span><span class="leg l2"></span></div>`;
}

export function titleHtml(state: GameState, view: View): string {
  const played = view.hasSave ?? (state.season > 0 || Object.keys(state.plans).length > 0);
  return `<div class="title">
    ${sheepArt()}
    <h1>Blue Sheep</h1>
    <p class="flavour">${esc(FLAVOUR[state.seed % FLAVOUR.length])}</p>
    <div class="title-actions">
      ${played ? `<button class="primary big" data-close>Continue · ${esc(seasonLabel(state.season))}</button>` : `<button class="primary big" data-close>Start farming</button>`}
      <div class="newgame"><label>Seed <input name="seed" inputmode="numeric" placeholder="random" size="8"></label>
        <button class="secondary" data-newgame="">New farm</button></div>
      <button class="link" data-open="help">How to play</button>
    </div>
  </div>`;
}

export function helpHtml(_state: GameState, _view: View): string {
  return `<h2>How to play</h2>
  <div class="help-grid">
    <div><h3>Around the farm</h3><ul class="plain">
      <li>🐑 <b>Click a sheep</b> to see what you know about it.</li>
      <li>🏠 <b>House</b> — sleep to end the season.</li>
      <li>📋 <b>Shed</b> — the board with your plans and diary.</li>
      <li>🛒 <b>Market</b> — buy and sell sheep.</li>
      <li>🩺 <b>Vet</b> — test for hidden traits.</li>
      <li>🎪 <b>Fairground</b> — enter the autumn show.</li>
      <li>📮 <b>Mailbox</b> — villagers' orders.</li>
    </ul></div>
    <div><h3>Forecasts</h3>
      <p>Choose a sheep, press <b>Find a mate</b>, and the forecast shows ten imaginary lambs from what you know so far — not the whole truth. Surprises teach you things, and the next forecast gets sharper.</p>
      <h3>Keys</h3><p><b>Esc</b> closes a panel. Everything else is a click.</p></div>
  </div>
  <div class="row"><button class="primary" data-close>Got it</button></div>`;
}

export function settingsHtml(_state: GameState, view: View): string {
  const confirm = view.tab === "confirm-new";
  return `<h2>Settings</h2>
    <div class="setting"><div><b>Reduced motion</b><div class="meta">Calmer camera and fewer sparkles.</div></div>
      <button class="toggle ${view.reducedMotion ? "on" : ""}" data-toggle="motion" role="switch" aria-checked="${view.reducedMotion ? "true" : "false"}">${view.reducedMotion ? "On" : "Off"}</button></div>
    <div class="setting"><div><b>Save file</b><div class="meta">Your farm saves itself. Keep a copy, or load one.</div></div>
      <div class="row"><button class="secondary" data-export="1">Export save</button><button class="secondary" data-import="1">Import save</button></div></div>
    <div class="setting"><div><b>Start over</b><div class="meta">A fresh farm with a new flock.</div></div>
      ${confirm
        ? `<div class="confirm"><span>Really leave this farm?</span><div class="row"><button class="danger" data-newgame="">Yes, new farm</button><button class="secondary" data-tab="">Keep this one</button></div></div>`
        : `<button class="secondary" data-tab="confirm-new">New game…</button>`}</div>
    <div class="row"><button class="primary" data-close>Done</button></div>`;
}

function tookWords(seasons: number): string {
  const y = Math.floor(seasons / 4), s = seasons % 4;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (!y) return part(s, "season");
  return s ? `${part(y, "year")} and ${part(s, "season")}` : part(y, "year");
}

export function endingHtml(state: GameState, _view: View): string {
  const st = state.stats;
  const stat = (n: number, label: string) => `<div class="stat"><b>${n}</b><span>${esc(label)}</span></div>`;
  return `<div class="ending">
    <div class="confetti" aria-hidden="true">${"<i></i>".repeat(18)}</div>
    <h1>A breed of your own</h1>
    <p>The village gathers at the gate. Six blue sheep, fine wool, healthy lines — the registry has a new page, and it has your farm's name on it.</p>
    <div class="stats">${stat(st.lambsBorn, "lambs born")}${stat(st.bluesBorn, "blue lambs")}${stat(st.discoveries, "discoveries")}${stat(st.ordersFilled, "orders filled")}${stat(st.fairsWon, "rosettes")}${stat(st.coinsEarned, "coins earned")}</div>
    <p class="meta">It took ${tookWords(state.season)}.</p>
    <div class="row center"><button class="primary big" data-close>Keep farming</button><button class="secondary" data-newgame="">Start a new farm</button></div>
  </div>`;
}

// ---- HUD --------------------------------------------------------------------

function hint(state: GameState, view: View): string {
  const n = Object.keys(state.plans).length;
  if (view.panel === "forecast") return "Compare mates, then plan. The lambs come when you sleep.";
  if (state.season === 0 && n === 0) return "Click a sheep to see what you know about it, then find it a mate.";
  if (n > 0) return `${n} mating${n === 1 ? "" : "s"} planned — sleep in the house when you're ready.`;
  if (lambRoom(state) < 1) return "Your fields are full. Sell a sheep at the market to make room for lambs.";
  const ready = state.flock.map((id) => state.sheep[id]!).filter((x) => canBreed(x, state.season));
  const hired = state.hiredRam ? 1 : 0;
  if (!ready.some((x) => x.sex === "ram") && !hired) return "No ram is ready to breed. Buy one at the market, or wait for a ram lamb to grow up.";
  if (!ready.some((x) => x.sex === "ewe")) return "No ewe is ready to breed. Buy one at the market, or wait for a ewe lamb to grow up.";
  const open = state.orders.filter((o) => o.status === "open").length;
  if (open && has(state, "orders")) return `${open} letter${open === 1 ? "" : "s"} waiting in the mailbox.`;
  return "Click a sheep to see what you know about it.";
}

const SEASON_ICON = ["🌱", "☀️", "🍂", "❄️"];

export function hudHtml(state: GameState, view: View): string {
  const a = currentAct(state);
  const nPlans = Object.keys(state.plans).length;
  const openOrders = state.orders.filter((o) => o.status === "open").length;
  const btn = (panel: string, label: string, icon: string, badge = 0, sec = false) =>
    `<button class="hud-btn ${sec ? "sec" : ""} ${view.panel === panel ? "on" : ""}" data-open="${panel}" title="${esc(label)}"><span class="i">${icon}</span><span class="t">${esc(label)}</span>${badge ? `<span class="badge">${badge}</span>` : ""}</button>`;
  return `<div class="hud-bar">
    <div class="hud-stats">
      <div class="hud-row">
      <span class="pill season">${SEASON_ICON[seasonOfYear(state.season)]} ${esc(seasonLabel(state.season))}</span>
      <span class="pill" title="Coins">🪙 ${state.money}</span>
      <span class="pill" title="Flock size">🐑 ${state.flock.length}<span class="dim">/${state.flockCap}</span></span>
      ${has(state, "orders") ? `<span class="pill">${stars(state.reputation)}</span>` : ""}
      </div>
      <button class="pill goal" data-open="board" title="${esc(a.progressText)}"><span class="g-act">${a.endless ? "Endless" : `Act ${a.act + 1}`} · ${esc(a.title)}</span><span class="g-text">${esc(a.goalText)}</span><span class="bar"><span style="${prop("p", a.progress)}"></span></span></button>
    </div>
    <div class="hud-btns">
      ${btn("board", "Board", "📋")}
      ${has(state, "orders") ? btn("orders", "Orders", "📮", openOrders) : ""}
      ${btn("market", "Market", "🛒")}
      ${has(state, "vet") ? btn("vet", "Vet", "🩺", 0, true) : ""}
      ${has(state, "fair") ? btn("fair", "Fair", "🎪", 0, true) : ""}
      ${has(state, "cards") ? btn("codex", "Codex", "📖", 0, true) : ""}
      ${btn("help", "Help", "❔", 0, true)}
      ${btn("settings", "Settings", "⚙️", 0, true)}
      <button class="hud-sleep" data-sleep="1" title="Sleep to end the season">Sleep 🌙${nPlans ? `<span class="badge">${nPlans}</span>` : ""}</button>
    </div>
  </div>
  <div class="hud-hint">${esc(hint(state, view))}</div>`;
}
