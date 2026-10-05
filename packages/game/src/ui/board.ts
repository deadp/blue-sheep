/** Shed board (goal, plans, orders, announcements, diary) and the orders panel. */
import {
  FAIR_LABEL, MAX_ACCEPTED_ORDERS, currentAct, forecastOrderFor, lambRoom, miceComingText, nextDated, seasonLabel,
  type GameState, type Order, type Unlock,
} from "../core/index.js";
import { myAnimalsHtml } from "./pets.js";
import { litterWords } from "./forecast.js";
import { crossCached } from "./cache.js";
import { dueWords, esc, has, hex, pips, prop, stars, swatch } from "./util.js";
import { btn, head, icon, iconBtn, iconize, more, nm, tag, type IconName } from "./felt/index.js";
import type { View } from "./view.js";
import { actTrack } from "./track.js";

export function goalCard(state: GameState): string {
  const a = currentAct(state);
  return `<div class="goal-card">
    ${actTrack(state)}
    <div class="act">${a.endless ? "Endless" : `Act ${a.act + 1}`} · ${esc(a.title)}</div>
    <div class="goal">${esc(a.goalText)}</div>
    <div class="bar" role="progressbar" aria-label="Goal progress" title="${esc(a.progressText)}"><span style="${prop("p", a.progress)}"></span></div>
  </div>`;
}

const COMING: Partial<Record<Unlock, string>> = {
  vet: "the vet's hut opens", craft: "the woolshed opens", farm: "the trader brings farm improvements", dogs: "dogs come to the market", cat: "a farm cat comes to the market",
};

function upcoming(state: GameState): { icon: IconName; text: string }[] {
  const out: { icon: IconName; text: string }[] = [];
  if (state.pendingEvent) out.push({ icon: "megaphone", text: state.pendingEvent.text });
  const mice = miceComingText(state);
  if (mice) out.push({ icon: "mouse", text: mice });
  if (lambRoom(state) < 1) out.push({ icon: "fence", text: "The fields are full: no room for new lambs until you sell." });
  if (has(state, "fair")) {
    const when = state.fair.nextSeason - state.season;
    const entry = state.fair.entry ? state.sheep[state.fair.entry]?.name : null;
    out.push({ icon: "rosette", text: `Fair ${when <= 0 ? "this season" : `in ${seasonLabel(state.fair.nextSeason)}`}: ${FAIR_LABEL[state.fair.category].toLowerCase()}. ${entry ? `${entry} is entered.` : "No entry yet."}` });
  }
  // What the calendar brings next (core/pacing.ts), so nothing arrives out of the blue.
  const soon = nextDated(state);
  if (soon && soon.season - state.season <= 2) out.push({ icon: "calendar", text: `${seasonLabel(soon.season)}: ${COMING[soon.id] ?? "something new comes"}.` });
  if (state.visitingRam && state.visitingRam.season === state.season) {
    const r = state.sheep[state.visitingRam.id];
    if (r) out.push({ icon: "ram", text: `${r.name}, a visiting ram, is here this season only${state.hiredRam === r.id ? " (hired)." : ` (${state.visitingRam.fee} coins to hire).`}` });
  }
  return out;
}

export function boardHtml(state: GameState, _view: View): string {
  const plans = Object.entries(state.plans).map(([e, r]) => {
    const ewe = state.sheep[e], ram = state.sheep[r];
    if (!ewe || !ram) return "";
    let words = "";
    try { words = litterWords(state, crossCached(state, e, r)); } catch { words = ""; }
    return `<li><button class="link pair" data-findmate="${esc(e)}" title="${esc(words)}">${nm(esc(ewe.name))} ${icon("heart", "sm")} ${nm(esc(ram.name))}</button>
      ${iconBtn("close", `Cancel ${ewe.name} × ${ram.name}`, { plan: `${e}:${r}` }, { cls: "tiny" })}</li>`;
  }).join("");
  const accepted = state.orders.filter((o) => o.status === "accepted");
  const orders = accepted.map((o) => {
    let f = { pFill: 0, text: "" };
    try { f = forecastOrderFor(state, o); } catch { /* keep blank */ }
    return `<li><div class="o-line">${orderIcon(o)}<span>${esc(o.text)}</span></div><div class="meta">${icon("calendar", "inl")} ${esc(dueWords(state, o.deadline))}</div><div class="o-forecast">${pips(state, f.pFill, f.text, true)}</div></li>`;
  }).join("");
  const news = upcoming(state);
  let lastSeason = -Infinity;
  const diary = state.log.slice(-10).reverse().map((l) => {
    const head = l.season !== lastSeason ? `<li class="day">${esc(seasonLabel(l.season))}</li>` : "";
    lastSeason = l.season;
    return `${head}<li>${iconize(esc(l.text))}</li>`;
  }).join("");
  const animals = myAnimalsHtml(state);
  return `${head("board", "The shed board", 2)}
  <div class="notes">
    <div class="note goal-note">${goalCard(state)}</div>
    <div class="note">${head("rings", "Planned")}
      ${plans ? `<ul class="plain plans">${plans}</ul>` : `<p class="meta">None yet. Click a sheep, then Find a mate.</p>`}
      <div class="row">${btn("Next season", { kind: "sky", icon: "moon", data: { sleep: "1" } })}</div></div>
    ${has(state, "orders") ? `<div class="note">${head("mail", "Promised")}<div class="rep">${stars(state.reputation)}</div>${orders ? `<ul class="plain">${orders}</ul>` : `<p class="meta">None taken yet.</p>`}
      <div class="row">${btn("Letters", { icon: "mail", data: { open: "orders" } })}</div></div>` : ""}
    ${news.length || animals ? `<div class="note">${head("calendar", "Coming up")}${news.length ? `<ul class="plain news">${news.map((n) => `<li>${icon(n.icon, "inl")}<span>${esc(n.text)}</span></li>`).join("")}</ul>` : ""}
      ${animals}</div>` : ""}
  </div>
  ${more("board-diary", "Diary", `<ul class="diary">${diary}</ul>`)}`;
}

// ---- Orders -----------------------------------------------------------------

function orderIcon(o: Order): string {
  if (o.kind === "wool") return `<span class="o-icon">${icon("yarn", "lg")}</span>`;
  if (o.kind === "horns") return `<span class="o-icon">${icon("ram", "lg")}</span>`;
  return `<span class="o-icon" data-order-colour="${esc(o.colour ?? "")}">${swatch(hex(o.colour ?? "white"), `big ${o.band ?? ""}`)}</span>`;
}

function orderCard(state: GameState, o: Order, mode: "open" | "accepted"): string {
  let f = { pFill: 0, text: "" };
  try { f = forecastOrderFor(state, o); } catch { /* keep blank */ }
  const full = state.acceptedOrders.length >= MAX_ACCEPTED_ORDERS;
  return `<div class="order ${mode}">
    ${orderIcon(o)}
    <div class="o-body">
      <div class="o-text">“${esc(o.text)}”</div>
      <div class="o-tags">${tag(`${o.reward}`, { icon: "coin", tone: "butter", title: "Reward in coins" })}${o.reputation ? tag("★".repeat(o.reputation).replace(/★/g, icon("star", "sm")), { tone: "butter", title: "Reputation" }) : ""}${tag(esc(dueWords(state, o.deadline).replace(/^due by /, "")), { icon: "calendar", tone: "sky", title: "Due by" })}</div>
      <div class="o-forecast"><span class="lbl">Can you fill it?</span>${pips(state, f.pFill, `Chance you can fill it: ${f.text}`, true)}</div>
    </div>
    <div class="o-actions">${mode === "open"
      ? `${btn("Accept", { kind: "primary", icon: "check", data: { accept: o.id }, disabled: full, title: full ? "You can only take two at a time" : "" })}${btn("Decline", { kind: "ghost", data: { decline: o.id } })}`
      : btn("Give up", { kind: "ghost", data: { decline: o.id }, title: "Giving up costs a little reputation" })}</div>
  </div>`;
}

export function ordersHtml(state: GameState, _view: View): string {
  if (!has(state, "orders")) return `${head("mail", "Mailbox", 2)}<p>No letters yet. Once the village hears about your flock, orders will arrive here.</p>`;
  const open = state.orders.filter((o) => o.status === "open");
  const accepted = state.orders.filter((o) => o.status === "accepted");
  const past = state.orderHistory.slice(-4).reverse();
  return `${head("mail", "Letters", 2)}
    ${open.length ? open.map((o) => orderCard(state, o, "open")).join("") : `<p class="meta">No new letters. More arrive with the seasons.</p>`}
    ${accepted.length ? `${head("check", `Promised · ${accepted.length} of ${MAX_ACCEPTED_ORDERS}`)}${accepted.map((o) => orderCard(state, o, "accepted")).join("")}` : ""}
    ${past.length ? more("orders-past", "Past letters", `<ul class="plain past">${past.map((o) => `<li>${tag(esc(o.status), { tone: o.status === "filled" ? "sage" : "rose", cls: o.status === "filled" ? "ok" : "warn" })} ${esc(o.text)}</li>`).join("")}</ul>`) : ""}`;
}
