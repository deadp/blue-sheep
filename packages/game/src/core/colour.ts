/**
 * Wool colour in the game (DESIGN-v3 §2.2): what a sheep's pigment looks like, in words a farmer uses.
 * Built on `woolColour` from @blue-sheep/genetics and read from a sheep's *phenotype* only (what anyone can
 * see), so it is safe for forecasts, orders, the fair and the UI.
 *
 * Words: hue colours get an intensity band ("soft pink", "bright red", "vivid blue"); neutrals, slate, olive
 * and gold are just their name; mask-white is "snow-white". The blue milestone is "true blue" (family blue,
 * intensity ≥ 0.6, not pale).
 */
import {
  colourInputFromPhenotype, intensityBand, isHueFamily, woolColour, type ColourFamily, type WoolColour,
} from "@blue-sheep/genetics";
import type { Phenotype, Sheep } from "./types.js";

export type Band = "soft" | "bright" | "vivid";
export const BANDS: Band[] = ["soft", "bright", "vivid"];

export interface Wool extends WoolColour {
  /** Intensity band ("none" for neutrals and white). */
  band: Band | "none";
  /** Display words: "soft pink", "vivid blue", "oatmeal", "slate", "snow-white". */
  word: string;
  /** Class key for forecasts and reveals: the name plus band for hues ("pink:soft"), else the name. */
  key: string;
}

/** Colour names with a hue, full then pale, then the muted cool ones (the Colour goal's chips, orders). */
export const HUE_NAMES = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "peach", "lemon", "mint", "sky", "lilac", "slate", "olive"] as const;

/** Colour names a pastel (pale) sheep can have. */
export const PASTEL_NAMES = ["pink", "peach", "lemon", "mint", "sky", "lilac", "silver", "fawn"] as const;

function bandOf(w: WoolColour): Band | "none" {
  if (!isHueFamily(w.family) || w.name === "slate" || w.name === "olive" || w.name === "gold") return "none";
  const b = intensityBand(w.intensity);
  return b === "none" ? "soft" : b;
}

/** Add the game's words to a woolColour result. */
export function dressWool(w: WoolColour): Wool {
  const band = bandOf(w);
  const word = band === "none" ? w.name : `${band} ${w.name}`;
  return { ...w, band, word, key: band === "none" ? w.name : `${w.name}:${band}` };
}

const cache = new WeakMap<object, { sig: string; w: Wool }>();

/** The wool a phenotype shows. Masked (white) sheep are "snow-white". Cached per phenotype (and its colour inputs). */
export function woolFromPhenotype(ph: Phenotype): Wool {
  const sig = `${ph["white"]}|${ph["red"]}|${ph["yellow"]}|${ph["blue"]}|${ph["dilute"]}|${ph["depth"]}|${ph["pattern"]}|${ph["lustre"]}`;
  const hit = cache.get(ph);
  if (hit && hit.sig === sig) return hit.w;
  const w = dressWool(woolColour(colourInputFromPhenotype(ph)));
  cache.set(ph, { sig, w });
  return w;
}

/**
 * Give a phenotype a colour (tests, debug fixtures): sets the visible colour traits and the derived fields.
 * `white: true` masks everything.
 */
export function setColour(ph: Phenotype, c: { white?: boolean; red?: number; yellow?: number; blue?: number; pale?: boolean; depth?: number }): void {
  if (c.white) {
    ph["white"] = "white";
    for (const k of ["red", "yellow", "blue", "dilute", "pattern"]) delete ph[k];
  } else {
    ph["white"] = "coloured";
    ph["red"] = String(c.red ?? 0); ph["yellow"] = String(c.yellow ?? 0); ph["blue"] = String(c.blue ?? 0);
    ph["dilute"] = c.pale ? "pale" : "full";
    if (ph["pattern"] === undefined) ph["pattern"] = "solid";
  }
  if (c.depth !== undefined) ph["depth"] = c.depth;
  Object.assign(ph, colourFields(ph));
}

export function woolOf(s: Pick<Sheep, "phenotype">): Wool {
  return woolFromPhenotype(s.phenotype);
}

/** Derived colour fields stored on every phenotype at birth (for the world, probes and quick reads). */
export function colourFields(ph: Phenotype): { colour: string; family: ColourFamily; wool: string; intensity: number } {
  const w = dressWool(woolColour(colourInputFromPhenotype(ph)));
  return { colour: w.name, family: w.family, wool: w.hex, intensity: Math.round(w.intensity * 1000) / 1000 };
}

export function isTrueBlue(s: Pick<Sheep, "phenotype">): boolean {
  return woolOf(s).trueBlue;
}

/** Any wool that shows colour (not the white mask). */
export function isColoured(s: Pick<Sheep, "phenotype">): boolean {
  return s.phenotype["white"] !== "white";
}

export function bandRank(b: Band | "none" | null): number {
  return b === "vivid" ? 3 : b === "bright" ? 2 : b === "soft" ? 1 : 0;
}

/**
 * A colour a villager (or a goal tab) asks for: a colour name ("red", "pink", "slate", "true blue") and an
 * optional lowest band. Names match the sheep's display name, so "blue" means full (not pale) blue and
 * "sky" pale blue; "true blue" is the milestone.
 */
export interface ColourTarget { colour: string; min: Band | null }

export function woolMatches(w: Wool, t: ColourTarget): boolean {
  if (t.colour === "true blue") return w.trueBlue;
  if (t.colour === "vivid") return w.band === "vivid";
  if (t.colour === "white" || t.colour === "snow-white") return w.family === "white";
  if (w.name !== t.colour) return false;
  return t.min === null || bandRank(w.band) >= bandRank(t.min);
}

/** "a bright-or-better red", "a slate", "a true blue" — the thing asked for, in words. */
export function targetWords(t: ColourTarget): string {
  if (t.colour === "true blue") return "true blue";
  if (t.colour === "vivid") return "vivid-coloured";
  if (!t.min || t.min === "soft") return t.colour;
  return t.min === "vivid" ? `vivid ${t.colour}` : `${t.colour} (bright or better)`;
}

/** Wool price per kg: white least, natural colours a little more, hues by how vivid they are, true blue best. */
export function woolPricePerKg(w: Wool): number {
  if (w.family === "white") return 0.8;
  if (!isHueFamily(w.family) || w.band === "none") return w.gold ? 2.4 : w.name === "slate" || w.name === "olive" ? 1.3 : 1.1;
  return (1.0 + 1.6 * w.intensity) * (w.trueBlue ? 1.25 : 1);
}

/** Breeding value on the market (added to the base price). */
export function colourValue(w: Wool): number {
  if (w.family === "white") return 0;
  if (!isHueFamily(w.family) || w.band === "none") return w.gold ? 20 : 5;
  return Math.round(4 + 20 * w.intensity + (w.family === "blue" ? 6 : 0) + (w.trueBlue ? 12 : 0));
}

/** How striking a colour is for the fair's colour class, on the fair's common scale. */
export function colourShowScore(w: Wool): number {
  if (w.family === "white") return 0;
  return w.intensity * 3.6 + (w.trueBlue ? 0.6 : 0) + (w.gold ? 0.5 : 0) + (w.spotted ? 0.2 : 0) + (isHueFamily(w.family) ? 0 : 0.3);
}
