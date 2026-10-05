/**
 * Demand meters (DESIGN-v3 §7). Every thing the player can sell has a meter D in [0, DEMAND_MAX]: raw wool has one
 * per wool type (`raw:fine`), and the crafting phases add one per item (`item:socks`). A sale lowers the meter; each
 * season it refills part of the way to its target (which swings a little with the time of year). The price paid is
 * the rest price times m(D) = DEMAND_FLOOR + DEMAND_SLOPE x D, so a sold-out market pays 0.4x, never nothing. Events
 * spike a meter's price (the wool boom) without moving the meter. The meters live in `state.demand`; a key that isn't
 * there sits at its seasonal target. Pure of RNG: nothing here draws.
 */
import { DEMAND_FLOOR, DEMAND_MAX, DEMAND_SLOPE, ITEM_REFILL_DOWN, ITEM_REFILL_UP, ITEM_SWING, ITEM_WINTER, RAW_REFILL, SEASON_SWING } from "./config.js";
import { seasonOfYear } from "./state.js";
import type { GameState } from "./types.js";

export const rawKey = (type: string): string => `raw:${type}`;
export const itemKey = (item: string): string => `item:${item}`;

/** Price multiplier at meter level D. */
export function demandMult(d: number): number {
  return DEMAND_FLOOR + DEMAND_SLOPE * Math.max(0, Math.min(DEMAND_MAX, d));
}

/** Where a meter settles by itself in a given season: 1 (rest), with raw wool leaning warm in autumn and fine in spring. */
export function demandTarget(key: string, season: number): number {
  if (key.startsWith("item:")) {
    const item = key.slice(5), y = seasonOfYear(season);
    if (ITEM_WINTER.includes(item)) return y === 3 ? 1 + ITEM_SWING : y === 1 ? 1 - ITEM_SWING : 1;
    if (item === "teaCosy") return y === 1 ? 1.3 : 1;
    return 1;
  }
  if (!key.startsWith("raw:")) return 1;
  const type = key.slice(4), y = seasonOfYear(season);
  const warm = type === "strong" || type === "lopi" || type === "carpet" || type === "crossbred";
  if (y === 2) return 1 + (warm ? SEASON_SWING : -SEASON_SWING);
  if (y === 0) return 1 + (warm ? -SEASON_SWING : SEASON_SWING);
  return 1;
}

/** A meter's level now. */
export function demandLevel(state: GameState, key: string): number {
  return state.demand?.[key] ?? demandTarget(key, state.season);
}

/** Lower a meter by `amount`, to the floor of 0. */
export function lowerDemand(state: GameState, key: string, amount: number): void {
  const d = Math.max(0, demandLevel(state, key) - amount);
  (state.demand ??= {})[key] = d;
}

/** Season turn: each meter moves toward the target of the season that begins (up and down at their own rates). */
export function refillDemand(state: GameState, newSeason: number): void {
  if (!state.demand) return;
  for (const key of Object.keys(state.demand)) {
    const d = state.demand[key]!, target = demandTarget(key, newSeason);
    const rate = key.startsWith("raw:") ? RAW_REFILL : d < target ? ITEM_REFILL_UP : ITEM_REFILL_DOWN;
    const next = d + (target - d) * rate;
    if (Math.abs(next - target) < 0.01) delete state.demand[key]; else state.demand[key] = next;
  }
}

/** The meter in words (always shown), keen to glutted. */
export function demandWord(d: number): string {
  return d >= 1.2 ? "begging for it" : d >= 0.9 ? "keen" : d >= 0.65 ? "steady" : d >= 0.4 ? "slow" : "glutted";
}

/** A bar fraction 0-1 for a meter (full at the top of the range). */
export function demandFraction(d: number): number {
  return Math.max(0, Math.min(1, d / DEMAND_MAX));
}

/**
 * Selling `units` of a thing whose meter is at `d`, each unit lowering it by `step`: the average multiplier paid and the
 * meter afterwards. (Straight-line over the sale, so selling one big lot or many small ones pays the same.)
 */
export function sellRun(d: number, units: number, step: number): { mult: number; after: number } {
  const after = Math.max(0, d - units * step);
  return { mult: demandMult((d + after) / 2), after };
}

/**
 * A meter's projected level when season `to` begins, if `drop` is sold off it now (before the refills). Used by the
 * woolshed's forecast of what an item will fetch the season it is finished.
 */
export function projectDemand(state: GameState, key: string, to: number, drop: number): number {
  let d = Math.max(0, demandLevel(state, key) - drop);
  for (let s = state.season + 1; s <= to; s++) {
    const target = demandTarget(key, s);
    d += (target - d) * (key.startsWith("raw:") ? RAW_REFILL : d < target ? ITEM_REFILL_UP : ITEM_REFILL_DOWN);
  }
  return d;
}
