/** Codex: discovery card collection and concept cards that unlock with the story. */
import { PUNNET_GENES, TUTORIAL_STEPS, punnetSquare, seasonLabel, type GameState } from "../core/index.js";
import { punnetHtml } from "./punnet.js";
import { discoveryText, discoveryTitle, esc, numbersOn, LOCUS_FRIENDLY } from "./util.js";
import { btn, head, icon, more, type IconName } from "./felt/index.js";
import type { View } from "./view.js";

export interface Concept {
  id: string; title: string; icon: IconName; text: string; unlocked: (s: GameState) => boolean; hint: string;
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
    id: "punnet", title: "Punnet square", icon: "dice",
    text: "Every sheep has two copies of each gene and gives a lamb one, at random. Put one parent's copies along the top, the other's down the side: the four boxes are four equally likely lambs. Two polled parents that each carry a horns copy: three polled lambs for one horned. It works for hidden colour and pale too.",
    unlocked: (s) => s.unlocks.includes("cards") || (s.tutorial?.step ?? 0) > TUTORIAL_STEPS.findIndex((t) => t.id === "punnet") + 1, hint: "Old Tom will draw one for you.",
    figure: punnetFigure,
  },
  {
    id: "hidden", title: "Hidden traits", icon: "eye",
    text: "Two white sheep can have a coloured lamb. Each parent passes on one of two copies of every gene, and a white copy covers up the colour underneath. What you see is only half the story — the rest is hiding.",
    unlocked: (s) => s.act >= 1, hint: "Keep breeding and watch for a surprise.",
  },
  {
    id: "carriers", title: "Carriers", icon: "box",
    text: "A carrier holds one hidden copy and shows nothing. Pair two carriers and about one lamb in four shows the hidden trait. True blue needs lots of blue paint and no white on top — so find the sheep hiding blue doses.",
    unlocked: (s) => s.act >= 2 || (s.act >= 1 && s.discoveries.length > 0), hint: "A discovery card will reveal this one.",
  },
  {
    id: "pigment", title: "Paint in the wool", icon: "spots",
    text: "Wool colour is paint. Two genes each for red, yellow and blue add up to 0–4 doses of each: red and yellow make orange, yellow and blue green, red and blue purple, all three brown or charcoal. A pale pair of copies makes pastels, and colour strength slides like fineness. True blue: lots of blue, little else, full strength.",
    unlocked: (s) => s.act >= 1, hint: "Look closely at a coloured lamb.",
  },
  {
    id: "continuous", title: "Continuous traits", icon: "ruler",
    text: "Wool fineness isn't on or off — it slides. Many small genes and a bit of luck add up. Lambs land near the middle of their parents, so keep choosing the finest, season after season.",
    unlocked: (s) => s.act >= 2, hint: "The wool buyer will explain.",
  },
  {
    id: "inbreeding", title: "Inbreeding", icon: "family",
    text: "Close kin share hidden copies, so their lambs get two of the same — including weak ones. Inbred lambs come small. Fresh blood from outside keeps a flock hardy.",
    unlocked: (s) => s.act >= 3, hint: "Something about close kin…",
  },
  {
    id: "breed", title: "Your own breed", icon: "rosette",
    text: "A breed is a flock that breeds true: blue lambs from blue parents, fine wool, and enough unrelated lines to stay healthy. You're keeping many families, not just one.",
    unlocked: (s) => s.act >= 4, hint: "The last chapter.",
  },
];

const SHOW_CARDS = 12;

/** First sentence of a concept (shown), and the rest (behind "more"). */
function split(text: string): [string, string] {
  const m = text.match(/^(.+?[.!?])\s+(.+)$/);
  return m ? [m[1]!, m[2]!] : [text, ""];
}

export function codexHtml(state: GameState, view: View): string {
  const byLocus = new Map<string, number>();
  for (const d of state.discoveries) for (const l of d.loci ?? [d.locus]) byLocus.set(l, (byLocus.get(l) ?? 0) + 1);
  const slots = Object.entries(LOCUS_FRIENDLY).map(([l, name]) => {
    const n = byLocus.get(l) ?? 0;
    return `<div class="slot ${n ? "found" : "locked"}" title="${n ? `${n} card${n === 1 ? "" : "s"}` : "not found yet"}"><div class="s-icon">${icon(n ? "sparkle" : "lock", "lg")}</div><div>${esc(n ? name : "???")}</div>${n ? `<div class="meta">×${n}</div>` : ""}</div>`;
  }).join("");
  const all = view.tab === "all-cards";
  const recent = state.discoveries.slice().reverse();
  const shown = all ? recent : recent.slice(0, SHOW_CARDS);
  const moreN = recent.length - shown.length;
  const cards = shown.map((d) =>
    `<div class="dcard"><div class="d-top">${icon("sparkle", "inl")} ${esc(discoveryTitle(d))}</div><div>${esc(discoveryText(state, d))}</div><div class="meta">${esc(seasonLabel(d.season))}${state.sheep[d.sheep] ? ` · <button class="link" data-sheep="${esc(d.sheep)}">${esc(state.sheep[d.sheep]!.name)}</button>` : ""}</div></div>`).join("");
  const concepts = CONCEPTS.map((c) => {
    if (!c.unlocked(state)) return `<div class="concept locked" aria-label="Locked concept"><span class="c-icon">${icon("lock", "lg")}</span><h4>???</h4><p class="meta">${esc(c.hint)}</p></div>`;
    const [first, rest] = split(c.text);
    return `<div class="concept${c.figure ? " wide" : ""}" data-concept="${esc(c.id)}"><span class="c-icon">${icon(c.icon, "lg")}</span><h4>${esc(c.title)}</h4><p>${esc(first)}</p>${c.figure ? `<div class="c-figure">${c.figure(state)}</div>` : ""}${rest ? more(`concept-${c.id}`, "Read more", `<p>${esc(rest)}</p>`, { cls: "mini" }) : ""}</div>`;
  }).join("");
  return `${head("book", "Codex", 2)}
    ${head("sparkle", "Ideas")}
    <div class="concepts">${concepts}</div>
    ${head("lens", `Discoveries · ${state.discoveries.length}`)}
    <div class="slots">${slots}</div>
    ${cards ? more("codex-cards", `The cards (${recent.length})`, `<div class="dcards">${cards}</div>${moreN > 0 ? `<div class="row">${btn(`Show all ${recent.length} cards`, { data: { tab: "all-cards" } })}</div>` : ""}`, { open: all }) : `<p class="meta">No discoveries yet. A lamb that surprises you earns the first card.</p>`}`;
}
