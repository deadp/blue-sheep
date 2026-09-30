/** Helpers for core tests (not part of the public API). */
import { planMating } from "./breeding.js";
import { candidates } from "./forecast.js";
import { canBreed, flockSheep } from "./state.js";
import type { GameState } from "./types.js";

/** Plan every breedable ewe with the first available flock ram, while there is room. */
export function planAll(g: GameState): number {
  let n = 0;
  for (const e of flockSheep(g).filter((s) => s.sex === "ewe" && canBreed(s, g.season))) {
    const ram = candidates(g, e.id).find((r) => g.flock.includes(r.id));
    if (!ram) continue;
    try { planMating(g, e.id, ram.id); n++; } catch { /* no room / busy ram */ }
  }
  return n;
}

/** Any genotype string, v2 or v3 (w/W, d/D, s/S, p/P, pigment -/+), which must never reach player text. */
export const GENOTYPE_RE = /\b(Aw|a|B|b|D|d|S|s|P|p|W|w)\/(Aw|a|B|b|D|d|S|s|P|p|W|w)\b|[-+]\/[-+]/;
