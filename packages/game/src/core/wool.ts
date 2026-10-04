/**
 * Wool types and fleece words (DESIGN-v3 §3.3, §6.1). The classification itself is the pure
 * `woolType` in `@blue-sheep/genetics` (wooltype.ts); this file applies it to a sheep's measured fleece, says
 * the fleece in plain words, and holds the data on which items each wool type suits (used by the woolshed
 * phases; nothing reads it in play yet).
 */
import { WOOL_TYPE_LABEL, coatLayers, fleeceFromPhenotype, woolType, type FleeceMeasures, type WoolType } from "@blue-sheep/genetics";
import type { Sheep } from "./types.js";

export { WOOL_TYPE_LABEL, WOOL_TYPES, type WoolType } from "@blue-sheep/genetics";

/** A sheep's wool type, from its measured fleece (never from its genome). */
export function woolTypeOf(s: Pick<Sheep, "phenotype">): WoolType {
  return woolType(fleeceFromPhenotype(s.phenotype));
}

export function fleeceOf(s: Pick<Sheep, "phenotype">): FleeceMeasures {
  return fleeceFromPhenotype(s.phenotype);
}

/** Fibre diameter in a word (µm bands that line up with the wool types). */
export function finenessWord(um: number): string {
  return um < 20 ? "very fine" : um < 24 ? "fine" : um < 28 ? "medium-fine" : um < 33 ? "strong" : um < 38 ? "coarse" : "very coarse";
}

/** Staple (lock) length in a word. */
export function stapleWord(mm: number): string {
  return mm < 70 ? "short" : mm < 110 ? "medium-length" : mm < 150 ? "long" : "very long";
}

/** Lustre (0–10) in a word. */
export function lustreWord(l: number): string {
  return l < 3 ? "matt" : l < 5 ? "soft sheen" : l < 7 ? "glossy" : "mirror-bright";
}

/** Colour strength (the `depth` multiplier, 0.6–1.4) in a word, and 0–1 for a bar. */
export function strengthWord(depth: number): string {
  return depth < 0.8 ? "soft colour" : depth < 1.0 ? "gentle colour" : depth < 1.2 ? "good colour" : "strong colour";
}
export function strengthFraction(depth: number): number {
  return Math.max(0, Math.min(1, (depth - 0.6) / 0.8));
}

/** One plain line about a type: what it is. */
export const WOOL_TYPE_BLURB: Record<WoolType, string> = {
  lopi: "double-coated: long outer hair over soft down",
  carpet: "hairy and tough, made for rugs",
  fine: "soft enough for next to the skin",
  medium: "all-round wool, good crimp",
  lustre: "shiny, long and hard-wearing",
  strong: "hardy wool for outer knits",
  crossbred: "a bit of everything",
};

export interface FleeceWords {
  type: WoolType;
  label: string;
  /** "fine, long staple, glossy" */
  short: string;
  /** "Medium wool: medium-fine, long staple, glossy." plus numbers when `numbers`. */
  line: string;
  /** Double coat: "outer 30 µm, inner 20 µm" when numbers are on. */
  layers: string | null;
}

/** The fleece in plain words; µm, mm and the lustre score only when `numbers` is true. */
export function fleeceWords(s: Pick<Sheep, "phenotype">, numbers: boolean): FleeceWords {
  const m = fleeceOf(s);
  const type = woolType(m);
  const label = WOOL_TYPE_LABEL[type];
  const short = `${finenessWord(m.fineness)}, ${stapleWord(m.staple)} staple, ${lustreWord(m.lustre)}`;
  const nums = numbers ? ` (${m.fineness.toFixed(1)} µm, ${Math.round(m.staple)} mm, lustre ${m.lustre.toFixed(1)})` : "";
  const layers = numbers && m.doubleCoat ? (() => { const c = coatLayers(m.fineness); return `outer ${c.outer.toFixed(0)} µm, inner ${c.inner.toFixed(0)} µm`; })() : null;
  return { type, label, short, line: `${type === "lustre" ? "Lustre longwool" : label} wool: ${short}${nums}.`, layers };
}

// ---- which items each wool type suits (DESIGN-v3 §6.1; data only until the woolshed phases) ------------------

export type ItemId =
  | "socks" | "babyShawl" | "beanie" | "mittens" | "gumbootSocks" | "scarf" | "lopapeysa" | "bushShirt" | "rug" | "felted" | "dryerBalls";

export const ITEM_IDS: ItemId[] = ["socks", "babyShawl", "beanie", "mittens", "gumbootSocks", "scarf", "lopapeysa", "bushShirt", "rug", "felted", "dryerBalls"];

/** Suitability factors: ideal 1.0, good 0.8, poor 0.55, not allowed 0. */
export const SUIT = { ideal: 1, good: 0.8, poor: 0.55, no: 0 } as const;
const [I, G, P, N] = [SUIT.ideal, SUIT.good, SUIT.poor, SUIT.no];

/** Per item, in the order fine, medium, strong, lustre, carpet, lopi, crossbred. */
const SUIT_ROWS: Record<ItemId, [number, number, number, number, number, number, number]> = {
  socks: [I, G, P, N, N, P, G], babyShawl: [I, P, N, N, N, N, N], beanie: [G, I, G, P, N, G, I], mittens: [G, I, G, P, N, I, G],
  gumbootSocks: [P, G, I, G, N, G, I], scarf: [I, I, P, G, N, G, G], lopapeysa: [N, P, P, P, N, I, P], bushShirt: [N, G, I, G, P, P, G],
  rug: [N, N, G, G, I, P, P], felted: [I, I, G, P, P, G, G], dryerBalls: [G, G, G, G, G, G, G],
};
const ORDER: WoolType[] = ["fine", "medium", "strong", "lustre", "carpet", "lopi", "crossbred"];

/** How well a wool type suits an item (0 = it can't be made from it). */
export function woolSuit(type: WoolType, item: ItemId): number {
  return SUIT_ROWS[item][ORDER.indexOf(type)]!;
}

/** The items a wool type suits best (ideal first, then good), for hints. */
export function itemsSuiting(type: WoolType, min: number = SUIT.good): ItemId[] {
  return ITEM_IDS.filter((i) => woolSuit(type, i) >= min).sort((a, b) => woolSuit(type, b) - woolSuit(type, a));
}
