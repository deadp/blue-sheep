/**
 * The wool store (DESIGN-v3 §5.1, §15 item 3). In spring and autumn every adult is shorn: wool orders take their
 * fleeces first, and each other fleece becomes a lot (skirted and washed: greasy kg to clean kg, with its type, colour and
 * fineness) held in the store, up to its capacity. With auto-sell on (the default) each lot goes to the wool buyer
 * at once; with it off the lots wait for the player to choose, and any beyond the store's room are sold at once.
 * A sale pays rate x kg x demand multiplier (core/demand.ts) x the shearing-shed bonus x the sheep's fondness, and
 * lowers the meter for that wool type. No RNG here.
 */
import { CLIP_KG, RAW_STEP, SHEARING_BONUS, SHEAR_SEASONS, STORE_CAP, STORE_CAP_PRESS, STORE_CAP_SHED, WASH_YIELD } from "./config.js";
import { demandLevel, lowerDemand, rawKey, sellRun } from "./demand.js";
import { woolOf } from "./colour.js";
import { fondWoolMultiplier, fondnessOf } from "./care.js";
import { fleeceRate } from "./economy.js";
import { addLog, flockSheep, isAdult, seasonOfYear } from "./state.js";
import { hasUpgrade } from "./upgrades.js";
import { woolTypeOf } from "./wool.js";
import type { FleeceLot, GameState, Sheep, ShearingReport } from "./types.js";

export function isShearingSeason(season: number): boolean {
  return SHEAR_SEASONS.includes(seasonOfYear(season));
}

/** Greasy kg in one adult's clip. */
export function clipKg(s: Sheep): number {
  return Math.round(Number(s.phenotype["fleeceWeight"]) * CLIP_KG * 10) / 10;
}

export { fleeceRate };

export function storeCap(state: GameState): number {
  return hasUpgrade(state, "press") ? STORE_CAP_PRESS : hasUpgrade(state, "shearing") ? STORE_CAP_SHED : STORE_CAP;
}
export const storeOf = (state: GameState): FleeceLot[] => state.store ?? [];
export const autoSellOn = (state: GameState): boolean => state.autoSell !== false;

/** The wool boom's colour family while it is announced or running (a live price multiplier of 2 on that colour). */
export function boomColourNow(state: GameState): string | null {
  const ev = state.pendingEvent;
  return ev && ev.kind === "woolBoom" && ev.season - state.season <= 1 ? ev.colour : null;
}

/** Make a lot from a sheep's clip. */
export function makeLot(state: GameState, s: Sheep, t: number): FleeceLot {
  const w = woolOf(s), type = woolTypeOf(s), greasy = clipKg(s);
  const n = state.nextLot ?? 1;
  state.nextLot = n + 1;
  return {
    id: `L${n}`, sheep: s.id, name: s.name, season: t, greasy, clean: Math.round(greasy * (WASH_YIELD[type] ?? 0.7) * 10) / 10,
    type, family: w.family, word: w.word, hex: w.hex, microns: Number(s.phenotype["fineness"]), intensity: w.intensity,
    staple: Number(s.phenotype["staple"] ?? 90),
    rate: fleeceRate(s), fond: fondWoolMultiplier(fondnessOf(state, s.id)),
  };
}

export interface LotPrice { coins: number; mult: number; after: number; boom: boolean }

/** What a lot fetches if sold with its meter at `d`. */
export function lotPrice(state: GameState, lot: FleeceLot, d: number): LotPrice {
  const run = sellRun(d, lot.greasy, RAW_STEP);
  const boom = boomColourNow(state) === lot.family;
  const shed = hasUpgrade(state, "shearing") ? SHEARING_BONUS : 1;
  return { coins: Math.round(lot.greasy * lot.rate * lot.fond * shed * (boom ? 2 : 1) * run.mult), mult: run.mult, after: run.after, boom };
}

/** Sell one lot to the wool buyer now: pays coins, lowers the meter. */
export function sellLotNow(state: GameState, lot: FleeceLot): number {
  const key = rawKey(lot.type);
  const p = lotPrice(state, lot, demandLevel(state, key));
  lowerDemand(state, key, lot.greasy * RAW_STEP);
  state.money += p.coins;
  state.stats.coinsEarned += p.coins;
  return p.coins;
}

/** Player action: sell a stored lot. */
export function sellLot(state: GameState, id: string): number {
  const lot = storeOf(state).find((l) => l.id === id);
  if (!lot) throw new Error("That fleece isn't in the store.");
  state.store = storeOf(state).filter((l) => l.id !== id);
  const coins = sellLotNow(state, lot);
  addLog(state, `Sold ${lot.name}'s ${lot.word} fleece for ${coins} coins.`);
  return coins;
}

export interface SaleForecast {
  coins: number;
  /** Per lot, in the order given. */
  lots: { id: string; coins: number }[];
  /** Meter level per wool type before and after the sale. */
  before: Record<string, number>;
  after: Record<string, number>;
  kg: number;
}

/** "After you sell" for these lots, in order (exactly what `sellLot` run in that order would pay). */
export function forecastSale(state: GameState, ids: string[]): SaleForecast {
  const store = storeOf(state);
  const before: Record<string, number> = {}, after: Record<string, number> = {};
  const lots: { id: string; coins: number }[] = [];
  let coins = 0, kg = 0;
  for (const id of ids) {
    const lot = store.find((l) => l.id === id);
    if (!lot) continue;
    const key = lot.type;
    const d = after[key] ?? demandLevel(state, rawKey(key));
    before[key] ??= d;
    const p = lotPrice(state, lot, d);
    after[key] = p.after;
    lots.push({ id, coins: p.coins });
    coins += p.coins; kg += lot.greasy;
  }
  return { coins, lots, before, after, kg };
}

/** Sell the dearest lots first until `need` coins are in hand (feed is due). Returns the lots sold. */
export function sellStoreForCash(state: GameState, need: number): { sold: number; coins: number } {
  let sold = 0, coins = 0;
  while (state.money < need && storeOf(state).length) {
    const best = [...storeOf(state)].sort((a, b) => lotPrice(state, b, demandLevel(state, rawKey(b.type))).coins - lotPrice(state, a, demandLevel(state, rawKey(a.type))).coins)[0]!;
    state.store = storeOf(state).filter((l) => l.id !== best.id);
    coins += sellLotNow(state, best); sold += 1;
  }
  return { sold, coins };
}

/** The shearing (spring and autumn): every adult not already shorn for an order gives a lot. */
export function shearFlock(state: GameState, t: number, used: Set<string>): ShearingReport | null {
  if (!isShearingSeason(t)) return null;
  const auto = autoSellOn(state);
  const rep: ShearingReport = { lots: 0, kg: 0, autoSold: 0, autoCoins: 0, overflow: 0, overflowCoins: 0, overflowNames: [], shedBonus: 0, fondBonus: 0, held: 0, auto };
  const store = (state.store ??= []);
  const cap = storeCap(state);
  for (const s of flockSheep(state)) {
    if (!isAdult(s, t) || used.has(s.id)) continue;
    const lot = makeLot(state, s, t);
    rep.lots += 1; rep.kg += lot.greasy;
    const sellNow = (): number => {
      const c = sellLotNow(state, lot), shed = hasUpgrade(state, "shearing") ? SHEARING_BONUS : 1;
      rep.shedBonus += Math.round(c / lot.fond - c / lot.fond / shed);
      rep.fondBonus += Math.round(c - c / lot.fond);
      return c;
    };
    if (auto) { rep.autoSold += 1; rep.autoCoins += sellNow(); }
    else if (store.length < cap) store.push(lot);
    else { rep.overflow += 1; rep.overflowCoins += sellNow(); rep.overflowNames.push(lot.name); }
  }
  rep.kg = Math.round(rep.kg * 10) / 10;
  rep.held = store.length;
  return rep;
}
