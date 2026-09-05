import { mate } from "@blue-sheep/genetics";
import {
  MAX_AGE, addSheep, ageOf, genomeOf, isAdult, pedigreeOf, restockMarket, rngOf, saveRng, seasonLabel, species,
  type GameState, type Pairing, type Sheep,
} from "./state.js";

/** Wool price per kg by colour; blue is the prize. */
export const WOOL_PRICE: Record<string, number> = { white: 4, black: 7, brown: 7, fawn: 14, blue: 40 };

export function sheepValue(s: Sheep): number {
  const colour = String(s.phenotype["colour"]);
  const base = 20 + (WOOL_PRICE[colour] ?? 4) * 2;
  return Math.round(base);
}

export function ramPrice(s: Sheep): number {
  return sheepValue(s) + 30;
}

function woolIncome(s: Sheep): number {
  const colour = String(s.phenotype["colour"]);
  const kg = Number(s.phenotype["fleeceWeight"]);
  const microns = Number(s.phenotype["fineness"]);
  const finenessMul = Math.max(0.5, Math.min(2, (30 - microns) / 10 + 1)); // 20µm → 2×, 30µm → 1×
  return Math.round(kg * (WOOL_PRICE[colour] ?? 4) * finenessMul);
}

export interface SeasonReport {
  lambs: Sheep[];
  income: number;
  deaths: Sheep[];
  messages: string[];
}

export function validatePairings(state: GameState, pairings: Pairing[]): string | null {
  const seenEwes = new Set<string>();
  for (const p of pairings) {
    const ewe = state.sheep[p.ewe];
    const ram = state.sheep[p.ram];
    if (!ewe || !ram) return "unknown sheep in pairing";
    if (ewe.sex !== "ewe" || ram.sex !== "ram") return `${ewe.name} × ${ram.name}: need a ewe and a ram`;
    if (!state.flock.includes(ewe.id) || !state.flock.includes(ram.id)) return "sheep not in flock";
    if (!isAdult(ewe, state.season) || !isAdult(ram, state.season)) return `${ewe.name} or ${ram.name} is too young`;
    if (seenEwes.has(ewe.id)) return `${ewe.name} paired twice`;
    seenEwes.add(ewe.id);
  }
  return null;
}

/** Advance one season: breed, harvest, age, restock market. Mutates state. */
export function advanceSeason(state: GameState, pairings: Pairing[]): SeasonReport {
  const err = validatePairings(state, pairings);
  if (err) throw new Error(err);
  const rng = rngOf(state);
  const pedigree = pedigreeOf(state);
  const report: SeasonReport = { lambs: [], income: 0, deaths: [], messages: [] };

  // Harvest (shearing) happens first, for adults.
  for (const id of state.flock) {
    const s = state.sheep[id]!;
    if (isAdult(s, state.season)) report.income += woolIncome(s);
  }
  state.money += report.income;

  // Breeding.
  for (const p of pairings) {
    const ewe = state.sheep[p.ewe]!;
    const ram = state.sheep[p.ram]!;
    const f = pedigree.offspringInbreeding(ewe.id, ram.id);
    const litter = rng.chance(0.25 - f * 0.5) ? 2 : rng.chance(0.05 + f) ? 0 : 1;
    for (let i = 0; i < litter; i++) {
      const genome = mate(genomeOf(ewe), genomeOf(ram), species.map, rng);
      const lamb = addSheep(state, rng, {
        sex: rng.chance(0.5) ? "ewe" : "ram", born: state.season + 1, dam: ewe.id, sire: ram.id, genome, inbreeding: f,
      });
      state.flock.push(lamb.id);
      report.lambs.push(lamb);
      if (lamb.phenotype["colour"] === "blue" && !state.achievements.includes("blue")) {
        state.achievements.push("blue");
        report.messages.push(`🎉 ${lamb.name} is BLUE! You did it.`);
      }
    }
    if (litter === 0) report.messages.push(`${ewe.name} did not lamb this season.`);
  }

  // Ageing and old age.
  state.season += 1;
  for (const id of [...state.flock]) {
    const s = state.sheep[id]!;
    if (ageOf(s, state.season) >= MAX_AGE) {
      report.deaths.push(s);
      state.flock = state.flock.filter((x) => x !== id);
      report.messages.push(`${s.name} passed away peacefully of old age.`);
    }
  }

  restockMarket(state, rng);
  saveRng(state, rng);
  state.log.push({
    season: state.season,
    text: `${seasonLabel(state.season)}: ${report.lambs.length} lamb(s), +${report.income} coins from wool.`,
  });
  for (const m of report.messages) state.log.push({ season: state.season, text: m });
  return report;
}

export function sellSheep(state: GameState, id: string): number {
  const s = state.sheep[id];
  if (!s || !state.flock.includes(id)) throw new Error("not in flock");
  const price = sheepValue(s);
  state.flock = state.flock.filter((x) => x !== id);
  state.money += price;
  state.log.push({ season: state.season, text: `Sold ${s.name} for ${price} coins.` });
  return price;
}

export function buySheep(state: GameState, id: string): void {
  const s = state.sheep[id];
  if (!s || !state.market.includes(id)) throw new Error("not on market");
  const price = ramPrice(s);
  if (state.money < price) throw new Error("not enough coins");
  if (state.flock.length >= state.flockCap) throw new Error("flock is full");
  state.money -= price;
  state.market = state.market.filter((x) => x !== id);
  state.flock.push(id);
  state.log.push({ season: state.season, text: `Bought ${s.name} for ${price} coins.` });
}

/** Max ewes one ram can serve in a season. */
export const RAM_CAPACITY = 4;

/** Turn the plan board into pairings, dropping stale or over-capacity entries. */
export function plannedPairings(state: GameState): Pairing[] {
  const load = new Map<string, number>();
  const out: Pairing[] = [];
  for (const [ewe, ram] of Object.entries(state.plans)) {
    const e = state.sheep[ewe], r = state.sheep[ram];
    if (!e || !r || !state.flock.includes(ewe) || !state.flock.includes(ram)) continue;
    if (!isAdult(e, state.season) || !isAdult(r, state.season)) continue;
    if ((load.get(ram) ?? 0) >= RAM_CAPACITY) continue;
    load.set(ram, (load.get(ram) ?? 0) + 1);
    out.push({ ewe, ram });
  }
  return out;
}

export function overCap(state: GameState): number {
  return Math.max(0, state.flock.length - state.flockCap);
}
