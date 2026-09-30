/** The season report: lambs next to the forecast the player saw, money, orders, fair, event, discoveries, act advance. */
import {
  FAIR_LABEL, MICE_ANNOUNCE, PET_NAME, paceStep, seasonLabel, woolOf, type CrossForecast, type GameState, type SeasonReport, type Sheep,
} from "../core/index.js";
import { lambTile, litterLooks } from "./forecast.js";
import { cap, discoveryText, discoveryTitle, esc, portrait, UNLOCK_ICON, UNLOCK_WORDS } from "./util.js";
import { btn, head, icon, iconize, nm, type IconName } from "./felt/index.js";
import type { View } from "./view.js";

const SURPRISE = 0.15;
const MAX_CARDS = 4;

function lambReveal(state: GameState, view: View, l: Sheep, f: CrossForecast | undefined, k: number, inTen: boolean): string {
  const w = woolOf(l);
  // A surprise is a colour the forecast gave little chance to: judged on the colour family (white, red, blue…),
  // not the exact shade, so a lamb a shade off what was expected isn't called a long shot.
  const p = f ? (w.family === "white" ? f.white : f.families[w.family] ?? 0) : 1;
  const surprise = !!f && p < SURPRISE;
  const blue = w.trueBlue;
  const words = `${w.word}${blue ? " (true blue)" : ""}${l.phenotype["pattern"] === "spotted" ? ", spotted" : ""}${l.phenotype["horns"] === "horned" ? ", horned" : ""}`;
  const why = surprise ? (inTen ? "A long shot!" : "Not one of your ten!") : "";
  return `<button class="born flip ${surprise ? "surprise" : ""} ${blue ? "blue" : ""}" data-sheep="${esc(l.id)}" data-family="${esc(w.family)}" data-wool="${esc(w.hex)}" style="--d:${k};--wool:${esc(w.hex)}" aria-label="${esc(`${l.name}, ${words}`)}">
    <span class="flip-inner">
      <span class="f-back" aria-hidden="true">${icon("sheep", "lg")}</span>
      <span class="f-front">
        ${portrait(view, l, "sm")}
        <span class="b-txt"><span class="nm">${esc(l.name)}</span> <span class="meta">${l.sex === "ewe" ? "♀" : "♂"}</span><br>
        <span class="swatch" style="--wool:${esc(w.hex)}"></span>${esc(words)}${blue ? "!" : ""}
        ${surprise ? `<br><span class="surprise-tag">${icon("sparkle", "inl")} ${esc(why)}</span>` : ""}${l.inbreeding >= 0.125 ? `<br><span class="meta">small: close kin</span>` : ""}</span>
      </span>
    </span>
    ${surprise ? `<span class="burst" aria-hidden="true">${icon("sparkle")}${icon("star")}${icon("sparkle")}${icon("star")}${icon("sparkle")}${icon("star")}</span>` : ""}
  </button>`;
}

/** The ten lambs the player saw, with the ones that came true ringed (after their card flips). */
function expectedRow(state: GameState, view: View, f: CrossForecast, lambs: Sheep[]): { html: string; inTen: boolean[] } {
  const looks = litterLooks(f);
  const used = new Set<number>();
  const hit = new Map<number, number>();
  const inTen = lambs.map((l, k) => {
    const c = woolOf(l).key;
    const idx = looks.findIndex((x, i) => !used.has(i) && x.key === c);
    if (idx < 0) return false;
    used.add(idx);
    hit.set(idx, k);
    return true;
  });
  const html = looks.map((l, i) => {
    const k = hit.get(i);
    return k === undefined ? lambTile(view, l, i) : lambTile(view, l, i, "hit", k);
  }).join("");
  return { html: `<div class="litter small">${html}</div>`, inTen };
}

function matingRows(state: GameState, view: View, r: SeasonReport): string {
  const ewes = Object.keys(r.matings);
  if (!ewes.length) return "";
  return ewes.map((e, row) => {
    const ewe = state.sheep[e], ram = state.sheep[r.matings[e]!];
    const f = r.forecastsSeen[e];
    const lambs = r.lambs.filter((l) => l.dam === e);
    const ex = f ? expectedRow(state, view, f, lambs) : { html: "", inTen: lambs.map(() => true) };
    return `<div class="reveal" style="--row:${row}">
      <div class="r-pair">${nm(esc(ewe?.name ?? "?"))} ${icon("heart", "sm")} ${nm(esc(ram?.name ?? "?"))}</div>
      <div class="r-fore"><div class="lbl">You expected</div>${ex.html}</div>
      <div class="r-arrow" aria-hidden="true">${icon("arrow")}</div>
      <div class="r-born"><div class="lbl">Born</div>${lambs.length ? lambs.map((l, k) => lambReveal(state, view, l, f, k, ex.inTen[k] ?? true)).join("") : `<span class="meta">${esc(ewe?.name ?? "She")} was too poorly to lamb.</span>`}</div>
    </div>`;
  }).join("");
}

function latestSummary(state: GameState): string {
  const last = state.log.filter((l) => l.season === state.season).slice(-8);
  return `${head("calendar", esc(seasonLabel(state.season)), 2)}
    ${last.length ? `<ul class="plain">${last.map((l) => `<li>${iconize(esc(l.text))}</li>`).join("")}</ul>` : `<p>Nothing yet this season. Plan some matings, then press Next season.</p>`}
    <div class="row">${btn("Carry on", { kind: "primary", icon: "check", data: { close: "" } })}</div>`;
}

export function reportHtml(state: GameState, view: View): string {
  const r = view.report;
  if (!r) return latestSummary(state);
  const blocks: string[] = [];
  if (r.actAdvanced) {
    const a = r.actAdvanced;
    blocks.push(`<div class="act-banner">${icon("rosette", "xl")}<div><div class="act">Act ${a.act + 1} · ${esc(a.title)}</div><blockquote>“${esc(a.line)}”</blockquote>
      <div><b>New goal:</b> ${esc(a.goalText)}</div></div></div>`);
  }
  // At most one new concept a season (core/pacing.ts): named, with Old Tom's one-line introduction.
  if (r.unlocked) {
    const u = r.unlocked;
    blocks.push(`<div class="act-banner new-thing" data-unlocked="${esc(u)}">${icon(UNLOCK_ICON[u], "xl")}<div><div class="act">New: ${esc(UNLOCK_WORDS[u])}</div>
      <div class="tom-says">${icon("tom", "inl")} “${iconize(esc(paceStep(u)?.intro ?? ""))}”</div></div></div>`);
  }
  const blues = r.lambs.filter((l) => woolOf(l).trueBlue);
  if (blues.length && state.stats.bluesBorn === blues.length) {
    blocks.push(`<div class="act-banner blue">${icon("heart", "xl t-blue")}<div><div class="act">Your first true blue lamb!</div><div>${esc(blues.map((b) => b.name).join(" and "))} ${blues.length > 1 ? "are" : "is"} true blue.</div></div></div>`);
  }
  if (r.endingReached) blocks.push(`<div class="act-banner gold">${icon("rosette", "xl")}<div><div class="act">Your breed is registered!</div><div>The whole village is coming to see.</div></div></div>`);
  const matings = matingRows(state, view, r);
  blocks.push(`${head("sheep", "Lambing")}${matings || `<p class="meta">No matings were planned, so no lambs this time.</p>`}`);
  if (r.discoveries.length) {
    // A big season can turn up a dozen facts; show the first few and send the rest to the codex.
    const shown = r.discoveries.slice(0, MAX_CARDS);
    const more = r.discoveries.length - shown.length;
    blocks.push(`${head("sparkle", "Discoveries")}<div class="dcards">${shown.map((d) =>
      `<div class="dcard sparkle"><div class="d-top">${icon("sparkle", "inl")} ${esc(discoveryTitle(d))}</div><div>${esc(discoveryText(state, d))}</div></div>`).join("")}</div>
      ${more > 0 ? `<p class="meta">…and ${more} more in the ${btn("codex", { kind: "ghost", icon: "book", cls: "inline", data: { open: "codex" } })}</p>` : ""}`);
  }
  const money = (i: IconName, v: string, label: string, cls = "") => `<div class="money ${cls}">${icon(i)}<b>${v}</b><span>${label}</span></div>`;
  const lines: string[] = [];
  const li = (cls: string, i: IconName, html: string) => lines.push(`<li class="${cls}">${icon(i, "inl")}<span>${html}</span></li>`);
  // Fondness: what happy (or skittish) sheep did to this shearing.
  const fond = r.fondBonus ?? 0;
  if (fond > 0) li("good fond", "heart", `Happy sheep: <b>+${fond}</b> coin${fond === 1 ? "" : "s"} of wool.`);
  else if (fond < 0) li("bad fond", "heartBroken", `Skittish sheep: <b>−${-fond}</b> coin${fond === -1 ? "" : "s"}. Say hello, or bring a treat.`);
  if (r.mice) li(`${r.mice.cat ? "good" : "bad"} ev-mice`, "mouse", `${esc(r.mice.text)}${r.mice.wool + r.mice.feed ? ` <b>−${r.mice.wool + r.mice.feed}</b>` : ""}`);
  for (const o of r.orderResults) li(o.outcome === "filled" ? "good" : "bad", o.outcome === "filled" ? "mail" : "heartBroken", `${esc(cap(o.text))}${o.reward ? ` <b>+${o.reward}</b>` : ""}`);
  if (r.fairResult) {
    const fr = r.fairResult;
    li(fr.place === 1 ? "good" : "", "rosette", `${esc(FAIR_LABEL[fr.category])}: ${esc(fr.text)}${fr.prize ? ` <b>+${fr.prize}</b>` : ""}`);
  }
  if (r.event) {
    const k = r.event.kind;
    const i: IconName = k === "fox" ? "fox" : k === "wolf" ? "wolf" : k === "hardWinter" ? "snow" : "coin";
    const pred = k === "fox" || k === "wolf";
    const cls = pred ? (r.event.saved ? "good" : r.event.sheep ? "bad" : "") : "";
    li(`${cls} ev-${k}`, i, `${esc(r.event.text)}${pred && r.event.dog ? ` <span class="tag tone-sage ok">${icon("dog", "inl")}Good dog, ${esc(PET_NAME[r.event.dog])}!</span>` : ""}`);
  }
  for (const d of r.deaths) li("", "dove", `${esc(d.name)} is gone.`);
  for (const a of r.autoSold) li("bad", "store", `The trader took ${esc(a.name)} for ${a.price} coins (${a.reason === "feed" ? "feed money ran short" : "no room"}).`);
  if (r.announced) li("", "megaphone", esc(r.announced.text));
  if (r.miceComing) li("ev-mice", "mouse", esc(MICE_ANNOUNCE));
  if (r.newOrders.length) li("", "mail", `${r.newOrders.length} new letter${r.newOrders.length === 1 ? "" : "s"} in the mailbox.`);
  blocks.push(`${head("coin", "The farm")}<div class="money-row">${money("yarn", `+${r.income}`, r.shedBonus ? `wool (shed +${r.shedBonus})` : "wool", "good")}${money("hay", `−${r.feed}`, "feed", "bad")}${money("coin", String(state.money), "coins now")}</div>
    ${lines.length ? `<ul class="plain events">${lines.join("")}</ul>` : ""}`);
  return `${head("calendar", `${esc(seasonLabel(r.season))}`, 2)}
    ${blocks.join("")}
    <div class="row">${btn("Back to the farm", { kind: "primary", icon: "house", data: { close: "" } })}${r.newOrders.length ? btn("Read the letters", { icon: "mail", data: { open: "orders" } }) : ""}</div>`;
}
