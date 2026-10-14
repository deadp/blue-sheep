/**
 * Rare wools (DESIGN-v3 §4, Phase 6): the six fantasy wools, one biallelic gene each. This file holds their data
 * (names, where they come from, the kiwiana lore for the codex), which wool a sheep shows, the codex's "first seen"
 * record, the pōhutukawa's seasonal colour, and the debug fixture. Forecasts and knowledge live in forecast.ts and
 * knowledge.ts; nothing here reads a genome except `plantRareSheep` (a fixture, like the sim).
 */
import { genomeFromJSON, genomeToJSON, mate } from "@blue-sheep/genetics";
import { ADULT_AGE } from "./config.js";
import { addSheep, computePhenotype, genomeOf, pedigreeOf, rngOf, saveRng, setLocus, species } from "./state.js";
import type { GameState, Phenotype, Sheep } from "./types.js";

export type RareId = "steel" | "cloud" | "glow" | "paua" | "pohutukawa" | "southerly";

export interface RareDef {
  id: RareId;
  /** The gene (locus id). */
  locus: string;
  /** "Steel wool". */
  name: string;
  /** "steel": the word in sentences ("a hidden steel-wool copy"). */
  short: string;
  /** Dominant genes show with one copy (pōhutukawa); the rest need two. */
  dominant: boolean;
  /** One plain line on how it looks. */
  look: string;
  /** What the fibre does (the codex card). */
  fibre: string;
  /** Where the gene comes from, for the codex hint. */
  source: string;
  /** Kiwiana lore (not Māori lore). */
  lore: string;
}

export const RARE: RareDef[] = [
  {
    id: "steel", locus: "ST", name: "Steel wool", short: "steel", dominant: false,
    look: "Gunmetal curls with a metallic sheen, springy and tight.",
    fibre: "Tough as old wire: fencing gloves that Number 8 wire can't get through.",
    source: "Romney, Perendale and Drysdale sheep sometimes carry it.",
    lore: "Gunmetal curls, tight as a spring. Old farmers swear a ram like this once leant on a sagging fence and the Number 8 wire gave up first.",
  },
  {
    id: "cloud", locus: "CL", name: "Cloud wool", short: "cloud", dominant: false,
    look: "So light the sheep floats a finger's width off the grass.",
    fibre: "Weightless: under a third of the fibre for a pair of socks.",
    source: "Merino and Corriedale sheep sometimes carry it.",
    lore: "Shearers say you have to weigh the fleece twice to believe it. Cloud socks are what you want for a long tramp and a short pack.",
  },
  {
    id: "glow", locus: "GW", name: "Glow-worm wool", short: "glow-worm", dominant: false,
    look: "A soft blue-green glow at dusk and through the night.",
    fibre: "It glows: scarves and beanies for the dark.",
    source: "Icelandic and Farm sheep sometimes carry it.",
    lore: "Like the glow-worm caves down the road, only woolly. Handy for finding the right ewe in the paddock at midnight lambing.",
  },
  {
    id: "paua", locus: "PA", name: "Pāua wool", short: "pāua", dominant: false,
    look: "A blue, green and violet shimmer, like the inside of a pāua shell.",
    fibre: "A show-stopper: the judges look twice. It only shows on a glossy fleece.",
    source: "Romney sheep sometimes carry it, but it hides unless the fleece is lustrous.",
    lore: "It shimmers like a pāua shell on a bach windowsill, but only on a glossy fleece. On a dull one it hides, and nobody knows it is there.",
  },
  {
    id: "pohutukawa", locus: "PO", name: "Pōhutukawa wool", short: "pōhutukawa", dominant: true,
    look: "Turns crimson in summer, and back to its own colour in winter.",
    fibre: "Seasonal colour: a Christmas jersey the sheep grew itself.",
    source: "Nobody's. It only turns up as a sport, a brand-new mutation.",
    lore: "It blooms crimson with the pōhutukawa at Christmas and fades by winter. Nobody has ever bred one on purpose. It simply turns up.",
  },
  {
    id: "southerly", locus: "SO", name: "Southerly wool", short: "southerly", dominant: false,
    look: "Swept flat in one direction, as if braced against a gale.",
    fibre: "Windproof: shirts and hats that shrug off a southerly buster.",
    source: "Perendale and Farm sheep sometimes carry it.",
    lore: "Swept one way as if leaning into a southerly off the Southern Ocean. The sheep always look braced, and the wool keeps the wind out.",
  },
];

export const RARE_IDS: RareId[] = RARE.map((r) => r.id);
export const RARE_LOCI: string[] = RARE.map((r) => r.locus);

export const rareDef = (id: string): RareDef | undefined => RARE.find((r) => r.id === id);
export const rareOfLocus = (locus: string): RareDef | undefined => RARE.find((r) => r.locus === locus);
export const isRareLocus = (g: string): boolean => RARE_LOCI.includes(g);

/** Every rare wool a sheep shows (phenotype only: pāua is hidden unless its lustre is 5 or more). */
export function rareWoolsOf(s: { phenotype: Phenotype }): RareId[] {
  return RARE.filter((r) => s.phenotype[r.id] === r.id).map((r) => r.id);
}

/** The first rare wool a sheep shows, or null. */
export function rareWoolOf(s: { phenotype: Phenotype }): RareId | null {
  return rareWoolsOf(s)[0] ?? null;
}

/** Record every rare wool now on the farm or at the market as seen (the codex page fills from this). Returns the new ones. */
export function noteRareWools(state: GameState): RareId[] {
  const fresh: RareId[] = [];
  const seen = (state.rareSeen ??= {});
  for (const s of Object.values(state.sheep)) {
    for (const id of rareWoolsOf(s)) if (seen[id] === undefined) { seen[id] = state.season; fresh.push(id); }
  }
  return fresh;
}

export const rareSeenCount = (state: GameState): number => Object.keys(state.rareSeen ?? {}).length;

// ---- Pōhutukawa: crimson in summer ---------------------------------------------------------------------------------

/** How far a pōhutukawa fleece has turned crimson: summer 1, autumn and spring a little, winter 0. */
export function crimsonAmount(season: number): number {
  return [0.3, 1, 0.45, 0][((season % 4) + 4) % 4]!;
}

const CRIMSON = "#b3122f";

function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const c = (i: number) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, "0");
  return `#${c(0)}${c(1)}${c(2)}`;
}

/** The wool hex the world shows in a season: a pōhutukawa fleece blends toward crimson, every other fleece is its own colour. */
export function seasonalWool(s: { phenotype: Phenotype }, season: number): string {
  const base = String(s.phenotype["wool"] ?? "#FAFAF7");
  return s.phenotype["pohutukawa"] === "pohutukawa" ? mix(base, CRIMSON, crimsonAmount(season)) : base;
}

// ---- Debug fixture (?rare=steel) ---------------------------------------------------------------------------------

/**
 * Give the farm a sheep that shows `wool`, with a believable family: an adult ewe and ram of the flock become hidden
 * carriers (so the farm's records can prove it) and the new adult ewe is their lamb, homozygous for the rare gene.
 * Pōhutukawa has no carriers: the lamb is a sport (a brand-new mutation) and the farm finds that out. Returns the new
 * sheep. For fixtures and tests (reads and writes genomes, as the sim does).
 */
export function plantRareSheep(state: GameState, wool: RareId): Sheep {
  const def = rareDef(wool);
  if (!def) throw new Error(`no such rare wool: ${wool}`);
  const adults = state.flock.map((id) => state.sheep[id]!).filter((s) => state.season - s.born >= ADULT_AGE);
  const ewe = adults.find((s) => s.sex === "ewe"), ram = adults.find((s) => s.sex === "ram");
  if (!ewe || !ram) throw new Error("the fixture needs an adult ewe and an adult ram");
  const [common, mutant] = species.map.loci.get(def.locus)!.alleles as [string, string];
  if (!def.dominant) for (const s of [ewe, ram]) { const g = genomeFromJSON(s.genome); setLocus(g, def.locus, [common, mutant]); s.genome = genomeToJSON(g); }
  const rng = rngOf(state);
  const f = pedigreeOf(state).offspringInbreeding(ewe.id, ram.id);
  let lamb: Sheep | null = null;
  for (let tries = 0; tries < 400 && !lamb; tries++) {
    const g = mate(genomeOf(ewe), genomeOf(ram), species.map, rng);
    setLocus(g, def.locus, def.dominant ? [common, mutant] : [mutant, mutant]);
    // The lamb shows this wool and no other (parents planted for an earlier wool may carry theirs).
    for (const other of RARE) if (other.locus !== def.locus) { const a = species.map.loci.get(other.locus)!.alleles[0]!; setLocus(g, other.locus, [a, a]); }
    // A pāua gene is masked below lustre 5: look at the fleece first, and only keep a lamb that shows the wool.
    const ph = computePhenotype(g, f, rng);
    if (!rareWoolsOf({ phenotype: ph }).includes(def.id)) continue;
    lamb = addSheep(state, rng, { sex: "ewe", born: state.season - ADULT_AGE, dam: ewe.id, sire: ram.id, genome: g, inbreeding: f, origin: "bred" });
    lamb.phenotype = ph;
  }
  if (!lamb) throw new Error("could not plant a rare sheep");
  state.flock.push(lamb.id);
  noteRareWools(state);
  saveRng(state, rng);
  return lamb;
}
