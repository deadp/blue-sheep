/** The shed board: planning matings. */
import { RAM_CAPACITY } from "./config.js";
import { addLog, ageOf, canBreed, isAdult, isIll } from "./state.js";
import { ADULT_AGE, EWE_BREED_MAX_AGE } from "./config.js";
import type { GameState, Pairing, Sex } from "./types.js";

export { RAM_CAPACITY };

/** Is `ramId` usable as a sire this season (in the flock, or the hired visitor)? */
export function ramAvailable(state: GameState, ramId: string): boolean {
  const r = state.sheep[ramId];
  if (!r || r.sex !== "ram") return false;
  if (state.flock.includes(ramId)) return canBreed(r, state.season);
  return state.hiredRam === ramId && state.visitingRam?.id === ramId && state.visitingRam.season === state.season;
}

export function ramLoad(state: GameState, ramId: string): number {
  return Object.values(state.plans).filter((r) => r === ramId).length;
}

/** Turn the plan board into valid pairings, dropping stale or over-capacity entries. */
export function plannedPairings(state: GameState): Pairing[] {
  const load = new Map<string, number>();
  const out: Pairing[] = [];
  for (const [ewe, ram] of Object.entries(state.plans)) {
    const e = state.sheep[ewe];
    if (!e || e.sex !== "ewe" || !state.flock.includes(ewe) || !isAdult(e, state.season)) continue;
    if (ageOf(e, state.season) >= EWE_BREED_MAX_AGE) continue;
    if (!ramAvailable(state, ram)) continue;
    if ((load.get(ram) ?? 0) >= RAM_CAPACITY) continue;
    load.set(ram, (load.get(ram) ?? 0) + 1);
    out.push({ ewe, ram });
  }
  return out;
}

/** Room left for planned lambs (one per planned mating). */
export function lambRoom(state: GameState): number {
  return state.flockCap - state.flock.length - Object.keys(state.plans).length;
}

/** Toggle a planned mating. Throws a player-readable message when it can't be planned. */
export function planMating(state: GameState, eweId: string, ramId: string): void {
  if (state.plans[eweId] === ramId) { unplanMating(state, eweId); return; }
  const ewe = state.sheep[eweId], ram = state.sheep[ramId];
  if (!ewe || !ram) throw new Error("I can't find that sheep.");
  if (ewe.sex !== "ewe" || ram.sex !== "ram") throw new Error("A mating needs a ewe and a ram.");
  if (!state.flock.includes(eweId)) throw new Error(`${ewe.name} isn't in your flock.`);
  if (!isAdult(ewe, state.season)) throw new Error(`${ewe.name} is too young to breed yet.`);
  if (isIll(ewe, state.season)) throw new Error(`${ewe.name} is poorly this season and needs rest.`);
  if (ageOf(ewe, state.season) >= EWE_BREED_MAX_AGE) throw new Error(`${ewe.name} has retired from lambing.`);
  const isVisitor = state.visitingRam?.id === ramId;
  if (isVisitor && state.hiredRam !== ramId) throw new Error(`Hire ${ram.name} first.`);
  if (!isVisitor && !state.flock.includes(ramId)) throw new Error(`${ram.name} isn't in your flock.`);
  if (!isVisitor && !isAdult(ram, state.season)) throw new Error(`${ram.name} is too young to breed yet.`);
  if (!isVisitor && isIll(ram, state.season)) throw new Error(`${ram.name} is poorly this season and needs rest.`);
  if (!ramAvailable(state, ramId)) throw new Error(`${ram.name} can't breed this season.`);
  if (ramLoad(state, ramId) >= RAM_CAPACITY) throw new Error(`${ram.name} already has ${RAM_CAPACITY} ewes this season.`);
  const replacing = state.plans[eweId] !== undefined;
  if (!replacing && lambRoom(state) < 1) throw new Error("No room for more lambs — sell a sheep first.");
  state.plans[eweId] = ramId;
  addLog(state, `Planned ${ewe.name} × ${ram.name}.`);
}

export function unplanMating(state: GameState, eweId: string): void {
  if (state.plans[eweId] === undefined) return;
  const ewe = state.sheep[eweId], ram = state.sheep[state.plans[eweId]!];
  delete state.plans[eweId];
  if (ewe && ram) addLog(state, `Cancelled ${ewe.name} × ${ram.name}.`);
}

/**
 * Lambs in the flock that are too young to breed (optionally of one sex), and the first season one of them
 * can breed. Lambs take ADULT_AGE seasons to grow up.
 */
export function growingLambs(state: GameState, sex?: Sex): { count: number; readySeason: number | null } {
  const lambs = state.flock.map((id) => state.sheep[id]!).filter((s) => !isAdult(s, state.season) && (!sex || s.sex === sex));
  if (!lambs.length) return { count: 0, readySeason: null };
  return { count: lambs.length, readySeason: Math.min(...lambs.map((s) => s.born + ADULT_AGE)) };
}

/** How many sheep over the cap the flock is (0 normally; the sim sells the excess at sleep). */
export function overCap(state: GameState): number {
  return Math.max(0, state.flock.length - state.flockCap);
}
