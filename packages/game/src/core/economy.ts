/** Prices, wool income, buying and selling, and the money floor. */
import { BREED_STOCK, BUY_MARKUP, FINE_REF, LAMB_PRICE_FACTOR, SELL_DECAY, SELL_FACTOR, SELL_FACTOR_MIN, SHEEP_BASE_PRICE } from "./config.js";
import { breedOf } from "./breeds.js";
import { colourValue, woolOf, woolPricePerKg } from "./colour.js";
import { addLog, flockSheep, isAdult } from "./state.js";
import type { GameState, Sheep } from "./types.js";

/** A grown sheep's worth on the market, before the trader's cut. */
function marketWorth(s: Sheep): number {
  const fine = Math.max(0, FINE_REF - Number(s.phenotype["fineness"])) * 2;
  const heavy = Math.max(0, Number(s.phenotype["fleeceWeight"]) - 4) * 3;
  return SHEEP_BASE_PRICE + colourValue(woolOf(s)) + fine + heavy + s.rosettes.length * 10;
}

/** Share of a sheep's worth the trader pays in a given season: sheep get cheaper as the valley fills up. */
export function sellFactor(season: number): number {
  return Math.max(SELL_FACTOR_MIN, SELL_FACTOR - SELL_DECAY * Math.floor(Math.max(0, season) / 4));
}

/**
 * What the trader pays for a sheep. Pass the current season to value lambs at their lower price and apply that
 * year's trader's cut (without a season: the year-1 price).
 */
export function sheepValue(s: Sheep, season?: number): number {
  const lamb = season !== undefined && !isAdult(s, season) ? LAMB_PRICE_FACTOR : 1;
  const cut = season !== undefined ? sellFactor(season) : SELL_FACTOR;
  return Math.max(4, Math.round(marketWorth(s) * cut * lamb));
}

/** What the trader asks for a sheep on the market: its worth, times the breed's price (config `BREED_STOCK`). */
export function buyPrice(s: Sheep): number {
  return Math.round(marketWorth(s) * BUY_MARKUP * BREED_STOCK[breedOf(s)].price) + (s.sex === "ram" ? 10 : 0);
}

/** @deprecated v1 name; use buyPrice. */
export const ramPrice = buyPrice;

/** Fibre-diameter multiplier on wool price: 4 µm finer than the Farm average → 1.8×, 4 µm coarser → 1×. */
export function finenessMultiplier(microns: number): number {
  return Math.max(0.5, Math.min(2, (FINE_REF + 4 - microns) / 10 + 1));
}

/** Coins from one adult's fleece this season. `boomColour` is a colour family whose wool fetches double. */
export function woolIncome(s: Sheep, boomColour: string | null = null, bonus = 1): number {
  const w = woolOf(s);
  const kg = Number(s.phenotype["fleeceWeight"]);
  const boom = boomColour !== null && w.family === boomColour ? 2 : 1;
  return Math.round(kg * woolPricePerKg(w) * finenessMultiplier(Number(s.phenotype["fineness"])) * boom * bonus);
}

/** Remove a sheep from the flock and every plan / entry that mentions it. */
export function removeFromFlock(state: GameState, id: string): void {
  state.flock = state.flock.filter((x) => x !== id);
  for (const [ewe, ram] of Object.entries(state.plans)) if (ewe === id || ram === id) delete state.plans[ewe];
  if (state.fair.entry === id) state.fair.entry = null;
}

export function sellSheep(state: GameState, id: string): number {
  const s = state.sheep[id];
  if (!s || !state.flock.includes(id)) throw new Error("That sheep isn't in your flock.");
  const price = sheepValue(s, state.season);
  removeFromFlock(state, id);
  state.money += price;
  addLog(state, `Sold ${s.name} for ${price} coins.`);
  return price;
}

export function buySheep(state: GameState, id: string): void {
  const s = state.sheep[id];
  if (!s || !state.market.includes(id)) throw new Error("That sheep isn't for sale any more.");
  const price = buyPrice(s);
  if (state.money < price) throw new Error(`${s.name} costs ${price} coins — you have ${state.money}.`);
  if (state.flock.length >= state.flockCap) throw new Error("Your fields are full. Sell a sheep first.");
  state.money -= price;
  state.market = state.market.filter((x) => x !== id);
  state.flock.push(id);
  addLog(state, `Bought ${s.name} for ${price} coins.`);
}

/** The sheep the trader takes first when coins or room run out: lowest value, then oldest. */
export function cheapestSheep(state: GameState, exclude: Set<string> = new Set()): Sheep | null {
  const pool = flockSheep(state).filter((s) => !exclude.has(s.id));
  if (!pool.length) return null;
  return pool.sort((a, b) => sheepValue(a, state.season) - sheepValue(b, state.season) || a.born - b.born || Number(a.id.slice(1)) - Number(b.id.slice(1)))[0]!;
}
