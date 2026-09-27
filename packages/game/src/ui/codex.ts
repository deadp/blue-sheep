/** Codex: discovery card collection and concept cards that unlock with the story. */
import { PUNNET_GENES, TUTORIAL_STEPS, punnetSquare, seasonLabel, type GameState } from "../core/index.js";
import { punnetHtml } from "./punnet.js";
import { discoveryText, discoveryTitle, esc, numbersOn, LOCUS_FRIENDLY } from "./util.js";
import type { View } from "./view.js";

export interface Concept {
  id: string; title: string; icon: string; text: string; unlocked: (s: GameState) => boolean; hint: string;
  /** Optional picture under the text (full-width card). */
  figure?: (s: GameState) => string;
}

/** The square for two horn carriers: the tutorial pair's names when they're still about. */
function punnetFigure(s: GameState): string {
  const t = s.tutorial;
  const dam = t && s.sheep[t.ewe] ? s.sheep[t.ewe]!.name : "A ewe";
  const sire = t && s.sheep[t.ram] ? s.sheep[t.ram]!.name : "A ram";
  const g = PUNNET_GENES.horns;
  const sq = punnetSquare(g, [g.dominant, g.recessive], [g.dominant, g.recessive]);
  return punnetHtml({ square: sq, damName: dam, sireName: sire, letters: numbersOn(s), size: "md", id: "codex-horns" });
}

export const CONCEPTS: Concept[] = [
  {
    id: "punnet", title: "Punnet square", icon: "🔲",
    text: "Every sheep has two copies of each gene and gives a lamb one, at random. Put one parent's copies along the top, the other's down the side: the four boxes are four equally likely lambs. Two polled parents that each carry a horns copy: three polled lambs for one horned. It works for hidden colour and dilute too.",
    unlocked: (s) => s.unlocks.includes("cards") || (s.tutorial?.step ?? 0) > TUTORIAL_STEPS.findIndex((t) => t.id === "punnet") + 1, hint: "Old Tom will draw one for you.",
    figure: punnetFigure,
  },
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
    ? `<div class="concept${c.figure ? " wide" : ""}" data-concept="${esc(c.id)}"><span class="c-icon">${c.icon}</span><h4>${esc(c.title)}</h4><p>${esc(c.text)}</p>${c.figure ? `<div class="c-figure">${c.figure(state)}</div>` : ""}</div>`
    : `<div class="concept locked" aria-label="Locked concept"><span class="c-icon">🔒</span><h4>???</h4><p class="meta">${esc(c.hint)}</p></div>`).join("");
  return `<h2>Codex</h2>
    <p class="meta">Every surprise lamb teaches you something. Cards collect here.</p>
    <h3>Ideas</h3>
    <div class="concepts">${concepts}</div>
    <h3>Discoveries (${state.discoveries.length})</h3>
    <div class="slots">${slots}</div>
    ${cards ? `<div class="dcards">${cards}</div>${more > 0 ? `<div class="row"><button class="secondary" data-tab="all-cards">Show all ${recent.length} cards</button></div>` : ""}` : `<p class="meta">No discoveries yet — a lamb that surprises you will earn the first card.</p>`}`;
}
