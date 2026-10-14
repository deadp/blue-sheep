/** Codex: discovery card collection and concept cards that unlock with the story. */
import { PUNNET_GENES, RARE, TUTORIAL_STEPS, punnetSquare, rareSeenCount, seasonLabel, type GameState, type RareId } from "../core/index.js";
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

/**
 * A sheep silhouette for each rare wool (the codex's Rare wools page): the same woolly body with the wool's own mark on
 * it. Unfound wools are a flat dark shape. Inline SVG, drawn in a 120 x 80 box.
 */
export function rareSilhouette(id: RareId, found: boolean): string {
  const body = (extra = "", lift = 0) =>
    `<g transform="translate(0 ${-lift})"><ellipse class="rs-wool" cx="56" cy="40" rx="30" ry="19"/>` +
    `<circle class="rs-wool" cx="36" cy="33" r="11"/><circle class="rs-wool" cx="50" cy="26" r="12"/><circle class="rs-wool" cx="68" cy="27" r="12"/><circle class="rs-wool" cx="80" cy="36" r="10"/>` +
    `<ellipse class="rs-head" cx="92" cy="40" rx="9" ry="8"/><path class="rs-head" d="M88 33l-3-8 7 4z"/>` +
    `<rect class="rs-leg" x="40" y="54" width="4" height="${16 + lift}" rx="2"/><rect class="rs-leg" x="50" y="54" width="4" height="${16 + lift}" rx="2"/>` +
    `<rect class="rs-leg" x="68" y="54" width="4" height="${16 + lift}" rx="2"/><rect class="rs-leg" x="78" y="54" width="4" height="${16 + lift}" rx="2"/>${extra}</g>`;
  const marks: Record<RareId, string> = {
    steel: body(`<path class="rs-mark" d="M32 36c2-6 8-6 8 0s-6 6-8 0M46 30c2-6 8-6 8 0s-6 6-8 0M60 34c2-6 8-6 8 0s-6 6-8 0"/>`),
    cloud: body(`<g class="rs-mark"><circle cx="46" cy="76" r="4"/><circle cx="54" cy="74" r="5"/><circle cx="62" cy="76" r="4"/><circle cx="70" cy="75" r="4"/></g>`, 5),
    glow: body(`<g class="rs-mark"><circle cx="44" cy="38" r="2.4"/><circle cx="58" cy="30" r="2.4"/><circle cx="66" cy="42" r="2.4"/><circle cx="52" cy="46" r="2.4"/><circle cx="76" cy="32" r="2.4"/></g>`),
    paua: body(`<path class="rs-mark" d="M36 44c8-12 16-14 26-10s14 8 16 4"/><path class="rs-mark b" d="M40 48c8-8 16-10 24-6s12 6 14 3"/>`),
    pohutukawa: body(`<g class="rs-mark"><path d="M52 26l-5-9M56 24v-11M60 26l5-9M64 28l8-7M48 28l-8-6"/><circle cx="56" cy="26" r="2.6"/></g>`),
    southerly: body(`<path class="rs-mark" d="M24 30h-12M26 38h-16M26 46h-12M30 24h-10"/><path class="rs-mark b" d="M64 26l-14 10"/>`),
  };
  return `<svg class="rare-sil ${found ? "found" : "unfound"} rs-${id}" viewBox="0 0 120 80" aria-hidden="true" focusable="false">${marks[id]}</svg>`;
}

/** The Rare wools page: six silhouettes that fill in when the wool is first seen, each with a line of kiwiana lore. */
export function rareWoolsHtml(state: GameState): string {
  const seen = state.rareSeen ?? {};
  const cards = RARE.map((r) => {
    const at = seen[r.id];
    const found = at !== undefined;
    if (!found) {
      const hint = r.dominant ? "Nobody has ever bred one on purpose. If it exists, it will simply turn up." : r.source;
      return `<div class="rare-card locked" data-rare="${r.id}" data-found="0" aria-label="A rare wool you haven't seen yet">
        <div class="rc-sil">${rareSilhouette(r.id, false)}</div>
        <h4>???</h4><p class="meta">${esc(hint)}</p></div>`;
    }
    return `<div class="rare-card" data-rare="${r.id}" data-found="1">
      <div class="rc-sil">${rareSilhouette(r.id, true)}</div>
      <h4>${esc(r.name)}</h4>
      <p>${esc(r.look)}</p>
      <p class="rc-lore">${esc(r.lore)}</p>
      ${more(`rare-${r.id}`, "What it is good for", `<p>${esc(r.fibre)}</p><p class="meta">${esc(r.source)} First seen ${esc(seasonLabel(at))}.</p>`, { cls: "mini" })}</div>`;
  }).join("");
  const n = rareSeenCount(state);
  return `<p class="meta">Six wools that nobody expects. Each one is a gene that hides in a carrier until two of them meet. ${n} of ${RARE.length} found.</p>
    <div class="rare-cards">${cards}</div>`;
}

/** First sentence of a concept (shown), and the rest (behind "more"). */
function split(text: string): [string, string] {
  const m = text.match(/^(.+?[.!?])\s+(.+)$/);
  return m ? [m[1]!, m[2]!] : [text, ""];
}

export function codexHtml(state: GameState, view: View): string {
  const rareOn = view.tab === "rare";
  const tabs = `<div class="tabs" role="tablist" aria-label="Codex pages">
    <button class="tab ${rareOn ? "" : "on"}" role="tab" aria-selected="${!rareOn}" data-tab="">${icon("book")}<span>Ideas and cards</span></button>
    <button class="tab ${rareOn ? "on" : ""}" role="tab" aria-selected="${rareOn}" data-tab="rare">${icon("sparkle")}<span>Rare wools · ${rareSeenCount(state)} of ${RARE.length}</span></button></div>`;
  if (rareOn) return `${head("book", "Codex", 2)}${tabs}${head("sparkle", `Rare wools · ${rareSeenCount(state)} of ${RARE.length}`)}${rareWoolsHtml(state)}`;
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
  return `${head("book", "Codex", 2)}${tabs}
    ${head("sparkle", "Ideas")}
    <div class="concepts">${concepts}</div>
    ${head("lens", `Discoveries · ${state.discoveries.length}`)}
    <div class="slots">${slots}</div>
    ${cards ? more("codex-cards", `The cards (${recent.length})`, `<div class="dcards">${cards}</div>${moreN > 0 ? `<div class="row">${btn(`Show all ${recent.length} cards`, { data: { tab: "all-cards" } })}</div>` : ""}`, { open: all }) : `<p class="meta">No discoveries yet. A lamb that surprises you earns the first card.</p>`}`;
}
