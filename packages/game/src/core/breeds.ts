/**
 * Breeds in the game (DESIGN-v3 §3.2): what the market stocks, and each sheep's breed mix, which is always
 * knowable from the farm's records (a bought sheep's breed is on its tag; lambs take their parents' mix).
 */
import { BREEDS, BREED_IDS, type BreedId } from "@blue-sheep/genetics";
import { BREED_STOCK, ICELANDIC_ACT } from "./config.js";
import type { GameState, Sheep } from "./types.js";

export type BreedFractions = Partial<Record<BreedId, number>>;

/** The breeds the market can offer now, in stock order. Icelandic only once the reward has arrived. */
export function marketBreeds(state: Pick<GameState, "act">): BreedId[] {
  return BREED_IDS.filter((b) => BREED_STOCK[b].minAct <= state.act && (b !== "icelandic" || state.act >= ICELANDIC_ACT));
}

/** Has the Icelandic reward arrived (the first fair won)? */
export function icelandicUnlocked(state: Pick<GameState, "act">): boolean {
  return state.act >= ICELANDIC_ACT;
}

/** A sheep's own founder breed (the Farm breed when it has none recorded). */
export function breedOf(s: Pick<Sheep, "breed">): BreedId {
  return s.breed ?? "farm";
}

/** Founder-breed fractions through the pedigree (the same recursion as relatedness): a lamb is the mean of its parents. */
export function breedFractions(state: Pick<GameState, "sheep">, id: string): BreedFractions {
  const memo = new Map<string, BreedFractions>();
  const walk = (sid: string, depth: number): BreedFractions => {
    const hit = memo.get(sid);
    if (hit) return hit;
    const s = state.sheep[sid];
    let out: BreedFractions;
    if (!s) out = { farm: 1 };
    else if ((s.dam === null && s.sire === null) || depth > 40) out = { [breedOf(s)]: 1 };
    else {
      const a = s.dam ? walk(s.dam, depth + 1) : { farm: 1 }, b = s.sire ? walk(s.sire, depth + 1) : { farm: 1 };
      out = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<BreedId>) out[k] = ((a[k] ?? 0) + (b[k] ?? 0)) / 2;
    }
    memo.set(sid, out);
    return out;
  };
  return walk(id, 0);
}

/** Breed fractions, biggest first. */
export function breedShares(f: BreedFractions): { breed: BreedId; share: number }[] {
  return (Object.entries(f) as [BreedId, number][]).filter(([, v]) => v > 1e-9).map(([breed, share]) => ({ breed, share })).sort((a, b) => b.share - a.share);
}

/** The breed line on a card: "Romney", "Merino × Romney", "¾ Corriedale", "mostly Farm", or "mixed breed". */
export function breedLine(f: BreedFractions): string {
  const [a, b] = breedShares(f);
  if (!a) return "Farm";
  const name = (x: BreedId) => BREEDS[x].name;
  if (a.share >= 0.97) return name(a.breed);
  if (b && b.share >= 0.4 && a.share <= 0.6) return `${name(a.breed)} × ${name(b.breed)}`;
  if (a.share >= 0.9) return `mostly ${name(a.breed)}`;
  if (a.share >= 0.6) return Math.abs(a.share - 0.75) < 0.07 ? `¾ ${name(a.breed)}` : `mostly ${name(a.breed)}`;
  return "mixed breed";
}

/** The breed a sheep looks like in the world: its biggest share when that is at least 60 %, otherwise the plain Farm look. */
export function mainBreed(f: BreedFractions): BreedId {
  const a = breedShares(f)[0];
  return a && a.share >= 0.6 ? a.breed : "farm";
}
