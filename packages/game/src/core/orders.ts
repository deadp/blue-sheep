/** Villager orders: generation, knowledge-limited fulfilment forecasts, accepting and resolution. */
import { createRng, type Rng } from "@blue-sheep/genetics";
import { sheep as sheepDefs } from "@blue-sheep/genetics";
import { forecastQuantitative } from "@blue-sheep/inference";
import { plannedPairings, ramAvailable } from "./breeding.js";
import {
  MAX_ACCEPTED_ORDERS, MAX_OPEN_ORDERS, MAX_AGE, ORDER_BOARD_RAMP, ORDER_FAIL_REPUTATION, ORDER_MIN_PFILL, ORDER_REP_BONUS_CAP, ORDER_OFFER_SEASONS, RAM_CAPACITY,
} from "./config.js";
import { removeFromFlock } from "./economy.js";
import { flockStats, traitRecords } from "./forecast.js";
import { lambChanceBySample, posteriors } from "./knowledge.js";
import { VILLAGERS } from "./names.js";
import { addLog, ageOf, canBreed, flockSheep, isAdult, seasonLabel } from "./state.js";
import { oddsText } from "./words.js";
import type { GameState, Order, OrderResult, Pairing, Sheep } from "./types.js";

const TWIN_P = 0.2;

export function sheepMatchesOrder(s: Sheep, o: Order): boolean {
  if (o.kind === "wool") return false;
  // Colour and horns orders are "breed me one": only lambs born after the order was posted count.
  if (s.born <= o.posted) return false;
  if (o.sex && s.sex !== o.sex) return false;
  if (o.colour && s.phenotype["colour"] !== o.colour) return false;
  if (o.horns && s.phenotype["horns"] !== o.horns) return false;
  return true;
}

function findOrder(state: GameState, orderId: string): Order {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) throw new Error("That order is no longer on the board.");
  return o;
}

// ---- Forecasting ------------------------------------------------------------

/** Rams usable this season, as the player sees them. */
function availableRams(state: GameState): string[] {
  const rams = state.flock.filter((id) => state.sheep[id]!.sex === "ram" && ramAvailable(state, id));
  if (state.hiredRam && ramAvailable(state, state.hiredRam)) rams.push(state.hiredRam);
  return rams;
}

function breedableEwes(state: GameState): string[] {
  return state.flock.filter((id) => { const s = state.sheep[id]!; return s.sex === "ewe" && canBreed(s, state.season); });
}

/** Greedy best mating set for a per-mating score (each ewe once, rams capped). */
function bestSet(state: GameState, score: (ewe: string, ram: string) => number): Pairing[] {
  const rams = availableRams(state);
  const options: { ewe: string; ram: string; s: number }[] = [];
  for (const ewe of breedableEwes(state)) for (const ram of rams) options.push({ ewe, ram, s: score(ewe, ram) });
  options.sort((a, b) => b.s - a.s || a.ewe.localeCompare(b.ewe) || a.ram.localeCompare(b.ram));
  const usedEwe = new Set<string>(), load = new Map<string, number>(), out: Pairing[] = [];
  const room = Math.max(0, state.flockCap - state.flock.length);
  for (const o of options) {
    if (out.length >= room) break;
    if (o.s <= 0 || usedEwe.has(o.ewe) || (load.get(o.ram) ?? 0) >= RAM_CAPACITY) continue;
    usedEwe.add(o.ewe); load.set(o.ram, (load.get(o.ram) ?? 0) + 1); out.push({ ewe: o.ewe, ram: o.ram });
  }
  return out;
}

function mean(xs: Float64Array): number {
  let t = 0; for (const x of xs) t += x; return xs.length ? t / xs.length : 0;
}

/** Per-sample chance one lamb of this pair fits a colour/horns order. */
function matchChance(state: GameState, o: Order, ewe: string, ram: string): Float64Array {
  let out: Float64Array | null = null;
  const mul = (a: Float64Array) => { if (!out) out = Float64Array.from(a); else for (let i = 0; i < out.length; i++) out[i]! *= a[i]!; };
  if (o.colour) mul(lambChanceBySample(state, "colour", ewe, ram, o.colour));
  if (o.horns) mul(lambChanceBySample(state, "horns", ewe, ram, o.horns));
  const n = posteriors(state).byTrait.get("colour")!.samples.length;
  const res: Float64Array = out ?? new Float64Array(n).fill(1);
  if (o.sex) for (let i = 0; i < res.length; i++) res[i]! *= 0.5;
  return res;
}

function pFillBreed(state: GameState, o: Order): number {
  if (flockSheep(state).some((s) => sheepMatchesOrder(s, o))) return 1;
  const seasons = o.deadline - state.season;
  if (seasons <= 0) return 0;
  const memo = new Map<string, Float64Array>();
  const chance = (e: string, r: string) => {
    const k = `${e}|${r}`; let v = memo.get(k);
    if (!v) { v = matchChance(state, o, e, r); memo.set(k, v); }
    return v;
  };
  const best = bestSet(state, (e, r) => mean(chance(e, r)));
  const planned = plannedPairings(state);
  const first = planned.length ? planned : best;
  const n = posteriors(state).byTrait.get("colour")!.samples.length;
  let total = 0;
  for (let k = 0; k < n; k++) {
    let none = 1;
    for (let t = 0; t < seasons; t++) {
      // Breeding only helps if the lamb is born before the deadline passes.
      for (const p of t === 0 ? first : best) {
        const q = chance(p.ewe, p.ram)[k]!;
        none *= (1 - TWIN_P) * (1 - q) + TWIN_P * (1 - q) * (1 - q);
      }
    }
    total += 1 - none;
  }
  return total / n;
}

function hashSeed(...xs: number[]): number {
  let h = 2166136261;
  for (const x of xs) { h ^= x >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** kg of qualifying fleece the current flock would give at the shearing in season t. */
function woolAt(state: GameState, o: Order, t: number): number {
  let kg = 0;
  for (const s of flockSheep(state)) {
    if (t - s.born < 2 || ageOf(s, t) >= MAX_AGE) continue;
    if (Number(s.phenotype["fineness"]) <= (o.microns ?? 0)) kg += Number(s.phenotype["fleeceWeight"]);
  }
  return kg;
}

function pFillWool(state: GameState, o: Order): number {
  const need = o.kg ?? 0;
  for (let t = state.season; t < o.deadline; t++) if (woolAt(state, o, t) >= need) return 1;
  // Otherwise lambs from matings now must grow up (adult after 2 seasons) and be shorn before the deadline.
  const lastShear = o.deadline - 1;
  const matingSeasons = lastShear - (state.season + 3) + 1;
  if (matingSeasons <= 0) return 0;
  const fin = flockStats(state, "fineness"), fw = flockStats(state, "fleeceWeight");
  const finRec = traitRecords(state, "fineness"), fwRec = traitRecords(state, "fleeceWeight");
  const fc = new Map<string, { fin: ReturnType<typeof forecastQuantitative>; fw: ReturnType<typeof forecastQuantitative> }>();
  const cross = (e: string, r: string) => {
    const k = `${e}|${r}`; let v = fc.get(k);
    if (!v) {
      const ewe = state.sheep[e]!, ram = state.sheep[r]!;
      v = {
        fin: forecastQuantitative(sheepDefs.fineness, Number(ewe.phenotype["fineness"]), Number(ram.phenotype["fineness"]), finRec, fin.mean, fin.sd),
        fw: forecastQuantitative(sheepDefs.fleeceWeight, Number(ewe.phenotype["fleeceWeight"]), Number(ram.phenotype["fleeceWeight"]), fwRec, fw.mean, fw.sd),
      };
      fc.set(k, v);
    }
    return v;
  };
  const best = bestSet(state, (e, r) => 50 - cross(e, r).fin.mean);
  const planned = plannedPairings(state);
  const first = planned.length ? planned : best;
  const rng = createRng(hashSeed(state.seed, state.season, Number(o.id.slice(1))));
  const trials = 200;
  let ok = 0;
  for (let i = 0; i < trials; i++) {
    const extra = new Map<number, number>(); // shearing season -> extra kg
    for (let t = 0; t < matingSeasons; t++) {
      for (const p of t === 0 ? first : best) {
        const c = cross(p.ewe, p.ram);
        const litter = rng.chance(TWIN_P) ? 2 : 1;
        for (let l = 0; l < litter; l++) {
          const micr = c.fin.mean + rng.normal() * c.fin.sd;
          const kg = Math.max(0.5, c.fw.mean + rng.normal() * c.fw.sd);
          if (micr > (o.microns ?? 0)) continue;
          for (let s = state.season + t + 3; s <= lastShear; s++) extra.set(s, (extra.get(s) ?? 0) + kg);
        }
      }
    }
    let filled = false;
    for (let s = state.season; s <= lastShear && !filled; s++) if (woolAt(state, o, s) + (extra.get(s) ?? 0) >= need) filled = true;
    if (filled) ok++;
  }
  return ok / trials;
}

/** Probability of filling the order in time (knowledge-limited), plus a short sentence. */
export function forecastOrderFor(state: GameState, o: Order): { pFill: number; text: string } {
  if (o.status === "filled") return { pFill: 1, text: "Done — nicely handled." };
  if (o.status === "failed" || o.status === "expired") return { pFill: 0, text: "This one has passed." };
  if (o.kind === "wool") {
    const pFill = pFillWool(state, o);
    const now = woolAt(state, o, state.season) >= (o.kg ?? 0);
    return { pFill, text: now ? "Your flock could fill this at the next shearing." : pFill >= 0.999 ? "Your flock will manage this as it grows up." : oddsText(pFill) };
  }
  const have = flockSheep(state).some((s) => sheepMatchesOrder(s, o));
  if (have) return { pFill: 1, text: "You've already bred one that would do." };
  const pFill = pFillBreed(state, o);
  return { pFill, text: oddsText(pFill) };
}

export function forecastOrder(state: GameState, orderId: string): { pFill: number; text: string } {
  return forecastOrderFor(state, findOrder(state, orderId));
}

// ---- Generation ---------------------------------------------------------------

const COLOUR_REWARD: Record<string, number> = { black: 20, brown: 24, fawn: 36, blue: 60 };

function deadlineWords(deadline: number): string {
  return `by ${seasonLabel(deadline)}`;
}

function orderText(o: Order): string {
  const who = o.villager.charAt(0).toUpperCase() + o.villager.slice(1);
  if (o.kind === "wool") return `${who} wants ${o.kg} kg of fleece finer than ${o.microns} µm from one shearing, ${deadlineWords(o.deadline)}.`;
  const lamb = o.sex ? `${o.sex} lamb` : "lamb";
  if (o.kind === "horns") return `${who} needs a ${o.horns} ${lamb} for the hill flock, ${deadlineWords(o.deadline)}.`;
  return `${who} would love a ${o.colour} ${lamb} bred on your farm, ${deadlineWords(o.deadline)}.`;
}

function blankOrder(state: GameState, rng: Rng): Order {
  return {
    id: `o${state.nextOrderId}`, kind: "colour", villager: VILLAGERS[rng.int(VILLAGERS.length)]!, text: "",
    colour: null, horns: null, sex: null, kg: null, microns: null,
    posted: state.season, expires: state.season + ORDER_OFFER_SEASONS, deadline: state.season + 4,
    reward: 0, reputation: 1, status: "open", filledBy: [], resolvedSeason: null,
  };
}

function proposeOrder(state: GameState, rng: Rng, first = false): Order | null {
  const o = blankOrder(state, rng);
  // The very first letter asks for horns: the Punnet square from the tutorial, put to work.
  const kinds: Order["kind"][] = first ? ["horns"] : state.act >= 2 ? ["colour", "colour", "wool", "wool", "horns"] : ["colour", "colour", "horns"];
  o.kind = kinds[rng.int(kinds.length)]!;
  if (o.kind === "wool") {
    const adults = flockSheep(state).filter((s) => isAdult(s, state.season));
    if (adults.length < 2) return null;
    const fins = adults.map((s) => Number(s.phenotype["fineness"])).sort((a, b) => a - b);
    const target = fins[Math.floor(fins.length * (0.3 + rng.next() * 0.3))]!;
    o.microns = Math.round(target * 2) / 2;
    const have = woolAt(state, { ...o }, state.season);
    o.kg = Math.max(3, Math.min(16, Math.round(have + 3 + rng.next() * 5)));
    o.deadline = state.season + 5 + rng.int(3);
  } else if (o.kind === "horns") {
    o.horns = rng.chance(0.75) ? "horned" : "polled";
    o.sex = rng.chance(0.5) ? "ram" : "ewe";
    o.deadline = state.season + 3 + rng.int(3);
  } else {
    const colours = state.act >= 4 ? ["black", "brown", "fawn"] : ["black", "brown", "fawn", "blue"];
    o.colour = colours[rng.int(colours.length)]!;
    o.sex = rng.chance(0.4) ? (rng.chance(0.5) ? "ewe" : "ram") : null;
    o.deadline = state.season + 3 + rng.int(3);
  }
  if (state.orders.some((x) => x.kind === o.kind && x.colour === o.colour && x.horns === o.horns && x.sex === o.sex)) return null;
  const { pFill } = forecastOrderFor(state, o);
  if (pFill < ORDER_MIN_PFILL) return null;
  const difficulty = 0.8 + 0.8 * (1 - pFill);
  const repBonus = 1 + 0.05 * Math.min(ORDER_REP_BONUS_CAP, Math.max(0, state.reputation));
  const base = o.kind === "wool" ? 10 + 4 * (o.kg ?? 0) : o.kind === "horns" ? 18 : COLOUR_REWARD[o.colour!] ?? 20;
  o.reward = Math.round(base * difficulty * repBonus);
  o.reputation = pFill < 0.5 ? 2 : 1;
  o.text = orderText(o);
  return o;
}

/** Letters the board shows at most right now: a gentle ramp as orders are filled (ORDER_BOARD_RAMP). */
export function orderBoardLimit(state: GameState): number {
  const ramp = ORDER_BOARD_RAMP;
  return Math.min(MAX_OPEN_ORDERS, ramp[Math.min(ramp.length - 1, state.stats.ordersFilled)]!);
}

/** Post new orders up to the board limit. Uses the game rng; forecasts stay knowledge-limited. */
export function generateOrders(state: GameState, rng: Rng): Order[] {
  if (!state.unlocks.includes("orders")) return [];
  const fresh: Order[] = [];
  let tries = 0;
  while (state.orders.length < orderBoardLimit(state) && tries++ < 8) {
    if (fresh.length >= 1) break;
    const o = proposeOrder(state, rng, state.nextOrderId === 1 && tries <= 4);
    if (!o) continue;
    state.nextOrderId++;
    state.orders.push(o);
    fresh.push(o);
    addLog(state, o.text);
  }
  return fresh;
}

// ---- Player actions -------------------------------------------------------------

export function acceptOrder(state: GameState, orderId: string): void {
  if (!state.unlocks.includes("orders")) throw new Error("No one has posted orders yet.");
  const o = findOrder(state, orderId);
  if (o.status !== "open") throw new Error("You've already taken this order.");
  if (state.acceptedOrders.length >= MAX_ACCEPTED_ORDERS) throw new Error(`You can only take ${MAX_ACCEPTED_ORDERS} orders at a time.`);
  if (o.deadline <= state.season) throw new Error("It's too late for this one.");
  o.status = "accepted";
  state.acceptedOrders.push(o.id);
  addLog(state, `You promised ${o.villager}: ${o.text}`);
}

/** Decline an open order, or give up on an accepted one (costs reputation). */
export function declineOrder(state: GameState, orderId: string): void {
  const o = findOrder(state, orderId);
  if (o.status === "accepted") {
    resolve(state, o, "failed");
    state.reputation = Math.max(0, state.reputation - ORDER_FAIL_REPUTATION);
    state.stats.ordersFailed += 1;
    addLog(state, `You let ${o.villager} know you can't manage it after all.`);
    return;
  }
  resolve(state, o, "expired");
  addLog(state, `You passed on ${o.villager}'s order.`);
}

function resolve(state: GameState, o: Order, status: "filled" | "failed" | "expired"): void {
  o.status = status;
  o.resolvedSeason = state.season;
  state.orders = state.orders.filter((x) => x.id !== o.id);
  state.acceptedOrders = state.acceptedOrders.filter((x) => x !== o.id);
  state.orderHistory.push(o);
}

function payOrder(state: GameState, o: Order): OrderResult {
  resolve(state, o, "filled");
  state.money += o.reward;
  state.stats.coinsEarned += o.reward;
  state.stats.ordersFilled += 1;
  state.reputation += o.reputation;
  const names = o.filledBy.map((id) => state.sheep[id]?.name ?? "?").join(" and ");
  const text = o.kind === "wool"
    ? `${o.villager} took the fine fleece from ${names} and paid ${o.reward} coins.`
    : `${names} went to ${o.villager}, who paid ${o.reward} coins. Thank you!`;
  return { order: o, outcome: "filled", reward: o.reward, reputation: o.reputation, text };
}

/**
 * At shearing time: accepted wool orders take qualifying fleeces instead of the market.
 * Returns the order results and the set of sheep whose wool went to an order.
 */
export function shearForOrders(state: GameState): { results: OrderResult[]; used: Set<string> } {
  const used = new Set<string>();
  const results: OrderResult[] = [];
  for (const id of [...state.acceptedOrders]) {
    const o = state.orders.find((x) => x.id === id);
    if (!o || o.kind !== "wool") continue;
    const pool = flockSheep(state)
      .filter((s) => isAdult(s, state.season) && !used.has(s.id) && Number(s.phenotype["fineness"]) <= (o.microns ?? 0))
      .sort((a, b) => Number(b.phenotype["fleeceWeight"]) - Number(a.phenotype["fleeceWeight"]));
    const total = pool.reduce((t, s) => t + Number(s.phenotype["fleeceWeight"]), 0);
    if (total < (o.kg ?? 0)) continue;
    let kg = 0;
    for (const s of pool) { if (kg >= (o.kg ?? 0)) break; used.add(s.id); o.filledBy.push(s.id); kg += Number(s.phenotype["fleeceWeight"]); }
    results.push(payOrder(state, o));
  }
  return { results, used };
}

/** After lambing: hand over matching sheep, fail overdue orders, expire stale offers. */
export function settleOrders(state: GameState): OrderResult[] {
  const results: OrderResult[] = [];
  for (const id of [...state.acceptedOrders]) {
    const o = state.orders.find((x) => x.id === id);
    if (!o) continue;
    if (o.kind !== "wool") {
      const match = flockSheep(state).filter((s) => sheepMatchesOrder(s, o))
        .sort((a, b) => b.born - a.born || Number(b.id.slice(1)) - Number(a.id.slice(1)))[0];
      if (match) {
        o.filledBy.push(match.id);
        removeFromFlock(state, match.id);
        results.push(payOrder(state, o));
        continue;
      }
    }
    if (state.season >= o.deadline) {
      resolve(state, o, "failed");
      state.reputation = Math.max(0, state.reputation - ORDER_FAIL_REPUTATION);
      state.stats.ordersFailed += 1;
      results.push({ order: o, outcome: "failed", reward: 0, reputation: -ORDER_FAIL_REPUTATION, text: `${o.villager} gave up waiting. Maybe next time.` });
    }
  }
  for (const o of [...state.orders]) {
    if (o.status === "open" && state.season >= o.expires) {
      resolve(state, o, "expired");
      results.push({ order: o, outcome: "expired", reward: 0, reputation: 0, text: `${o.villager} found what they needed elsewhere.` });
    }
  }
  return results;
}
