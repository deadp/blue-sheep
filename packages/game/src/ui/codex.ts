/** Codex: discovery card collection and concept cards that unlock with the story. */
import { seasonLabel, type GameState } from "../core/index.js";
import { discoveryText, discoveryTitle, esc, LOCUS_FRIENDLY } from "./util.js";
import type { View } from "./view.js";

export interface Concept { id: string; title: string; icon: string; text: string; unlocked: (s: GameState) => boolean; hint: string }

export const CONCEPTS: Concept[] = [
  {
    id: "hidden", title: "Hidden traits", icon: "🫥",
    text: "Two white sheep can have a black lamb. Each parent passes on one of two copies of every trait, and a white copy can cover up a coloured one. What you see is only half the story — the rest is hiding.",
    unlocked: (s) => s.act >= 1, hint: "Keep breeding and watch for a surprise.",
  },
  {
    id: "carriers", title: "Carriers", icon: "🎁",
    text: "A carrier holds one hidden copy and shows nothing. Pair two carriers and about one lamb in four shows the hidden trait. Blue needs a dark coat plus two dilute copies — so find your carriers.",
    unlocked: (s) => s.act >= 2 || (s.act >= 1 && s.discoveries.length > 0), hint: "A discovery card will reveal this one.",
  },
  {
    id: "continuous", title: "Continuous traits", icon: "📏",
    text: "Wool fineness isn't on or off — it slides. Many small genes and a bit of luck add up. Lambs land near the middle of their parents, so keep choosing the finest, season after season.",
    unlocked: (s) => s.act >= 2, hint: "The wool buyer will explain.",
  },
  {
    id: "inbreeding", title: "Inbreeding", icon: "🌿",
    text: "Close kin share hidden copies, so their lambs get two of the same — including weak ones. Inbred lambs come small. Fresh blood from outside keeps a flock hardy.",
    unlocked: (s) => s.act >= 3, hint: "Something about close kin…",
  },
  {
    id: "breed", title: "Your own breed", icon: "🏅",
    text: "A breed is a flock that breeds true: blue lambs from blue parents, fine wool, and enough unrelated lines to stay healthy. You're keeping many families, not just one.",
    unlocked: (s) => s.act >= 4, hint: "The last chapter.",
  },
];

const SHOW_CARDS = 12;

export function codexHtml(state: GameState, view: View): string {
  const byLocus = new Map<string, number>();
  for (const d of state.discoveries) for (const l of d.loci ?? [d.locus]) byLocus.set(l, (byLocus.get(l) ?? 0) + 1);
  const slots = Object.entries(LOCUS_FRIENDLY).map(([l, name]) => {
    const n = byLocus.get(l) ?? 0;
    return `<div class="slot ${n ? "found" : "locked"}"><div class="s-icon">${n ? "✨" : "?"}</div><div>${esc(n ? name : "???")}</div><div class="meta">${n ? `${n} card${n === 1 ? "" : "s"}` : "not found"}</div></div>`;
  }).join("");
  const all = view.tab === "all-cards";
  const recent = state.discoveries.slice().reverse();
  const shown = all ? recent : recent.slice(0, SHOW_CARDS);
  const more = recent.length - shown.length;
  const cards = shown.map((d) =>
    `<div class="dcard"><div class="d-top">✨ ${esc(discoveryTitle(d))}</div><div>${esc(discoveryText(state, d))}</div><div class="meta">${esc(seasonLabel(d.season))}${state.sheep[d.sheep] ? ` · <button class="link" data-sheep="${esc(d.sheep)}">${esc(state.sheep[d.sheep]!.name)}</button>` : ""}</div></div>`).join("");
  const concepts = CONCEPTS.map((c) => c.unlocked(state)
    ? `<div class="concept"><span class="c-icon">${c.icon}</span><h4>${esc(c.title)}</h4><p>${esc(c.text)}</p></div>`
    : `<div class="concept locked" aria-label="Locked concept"><span class="c-icon">🔒</span><h4>???</h4><p class="meta">${esc(c.hint)}</p></div>`).join("");
  return `<h2>Codex</h2>
    <p class="meta">Every surprise lamb teaches you something. Cards collect here.</p>
    <h3>Ideas</h3>
    <div class="concepts">${concepts}</div>
    <h3>Discoveries (${state.discoveries.length})</h3>
    <div class="slots">${slots}</div>
    ${cards ? `<div class="dcards">${cards}</div>${more > 0 ? `<div class="row"><button class="secondary" data-tab="all-cards">Show all ${recent.length} cards</button></div>` : ""}` : `<p class="meta">No discoveries yet — a lamb that surprises you will earn the first card.</p>`}`;
}
