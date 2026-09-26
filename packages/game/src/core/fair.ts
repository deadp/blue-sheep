/** The village fair: one autumn show a year, a rotating category, a field that improves every year. */
import type { Rng } from "@blue-sheep/genetics";
import {
  FAIR_FIELD_BASE, FAIR_FIELD_GROWTH, FAIR_FIELD_MAX, FAIR_FIELD_SD, FAIR_JUDGE_SD, FAIR_LABEL, FAIR_PRIZES, FAIR_RIVALS, RARITY,
} from "./config.js";
import { RIVAL_SHEEP, VILLAGERS } from "./names.js";
import { addLog, fairCategoryFor, isAdult, yearOf } from "./state.js";
import { fractionWords } from "./words.js";
import type { FairCategory, FairResult, FairRival, GameState, Sheep } from "./types.js";

/** Show score on a common scale (roughly: founder average 0, one founder spread = 1). Uses only what the judge can see. */
export function fairScore(s: Sheep, category: FairCategory): number {
  const ph = s.phenotype;
  switch (category) {
    case "fine": return (26 - Number(ph["fineness"])) / 2.5;
    case "heavy": return (Number(ph["fleeceWeight"]) - 4) / 0.8;
    case "big": return (Number(ph["size"]) - 60) / 7;
    case "rare": return (RARITY[String(ph["colour"])] ?? 0) + (ph["pattern"] === "spotted" ? 0.3 : 0);
  }
}

/** Expected quality of the rival field in a given season's fair. */
export function fieldMean(season: number): number {
  return Math.min(FAIR_FIELD_MAX, FAIR_FIELD_BASE + FAIR_FIELD_GROWTH * yearOf(season));
}

// Standard normal helpers (deterministic numeric integration; no randomness).
function erf(x: number): number {
  const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
function Phi(z: number): number { return 0.5 * (1 + erf(z / Math.SQRT2)); }

/** P(1st) and P(top 3) for an entry of known score against the expected field. */
export function fairOdds(score: number, season: number): { pWin: number; pPlace: number } {
  const mu = fieldMean(season);
  const sr = Math.sqrt(FAIR_FIELD_SD ** 2 + FAIR_JUDGE_SD ** 2);
  const K = FAIR_RIVALS;
  const steps = 240, lo = score - 6 * FAIR_JUDGE_SD, hi = score + 6 * FAIR_JUDGE_SD, dx = (hi - lo) / steps;
  let pWin = 0, pPlace = 0, mass = 0;
  for (let i = 0; i <= steps; i++) {
    const x = lo + i * dx;
    const w = Math.exp(-0.5 * ((x - score) / FAIR_JUDGE_SD) ** 2) * (i === 0 || i === steps ? 0.5 : 1);
    const F = Phi((x - mu) / sr);
    // Top 3 = at most two rivals beat you.
    const q = 1 - F;
    const top3 = F ** K + K * q * F ** (K - 1) + (K * (K - 1) / 2) * q * q * F ** (K - 2);
    pWin += w * F ** K; pPlace += w * top3; mass += w;
  }
  return { pWin: pWin / mass, pPlace: pPlace / mass };
}

export function fairText(pWin: number, pPlace: number): string {
  if (pWin >= 0.6) return `A real contender — ${fractionWords(pWin)} to take the rosette.`;
  if (pWin >= 0.3) return `A fair shot at first place, and likely to be placed.`;
  if (pPlace >= 0.5) return "Probably placed, though first would take some luck.";
  if (pPlace >= 0.2) return "A long shot for a ribbon, but it's a nice day out.";
  return "The field looks too strong this year.";
}

export function forecastFair(state: GameState, sheepId: string): { pWin: number; pPlace: number; text: string } {
  const s = state.sheep[sheepId];
  if (!s) throw new Error("I can't find that sheep.");
  const { pWin, pPlace } = fairOdds(fairScore(s, state.fair.category), state.fair.nextSeason);
  return { pWin, pPlace, text: fairText(pWin, pPlace) };
}

/** Choose (or clear, with null) the sheep going to the next fair. */
export function enterFair(state: GameState, sheepId: string | null): void {
  if (!state.unlocks.includes("fair")) throw new Error("The fair isn't open to you yet.");
  if (sheepId === null) { state.fair.entry = null; return; }
  const s = state.sheep[sheepId];
  if (!s || !state.flock.includes(sheepId)) throw new Error("Only sheep from your flock can be shown.");
  if (!isAdult(s, state.fair.nextSeason)) throw new Error(`${s.name} will be too young for the show.`);
  state.fair.entry = sheepId;
  addLog(state, `${s.name} is entered for ${FAIR_LABEL[state.fair.category].toLowerCase()} at the fair.`);
}

/** Judge the fair (called by the sim during the fair season). Uses the game rng for the field. */
export function judgeFair(state: GameState, rng: Rng): FairResult {
  const season = state.season, category = state.fair.category;
  const mu = fieldMean(season);
  const field: FairRival[] = [];
  const owners = [...VILLAGERS], names = [...RIVAL_SHEEP];
  for (let i = 0; i < FAIR_RIVALS; i++) {
    const owner = owners.splice(rng.int(owners.length), 1)[0]!;
    const name = names.splice(rng.int(names.length), 1)[0]!;
    field.push({ name, owner, score: mu + rng.normal() * FAIR_FIELD_SD + rng.normal() * FAIR_JUDGE_SD });
  }
  const entryId = state.fair.entry && state.flock.includes(state.fair.entry) ? state.fair.entry : null;
  const entry = entryId ? state.sheep[entryId]! : null;
  let place: number | null = null, prize = 0, entryScore: number | null = null, text: string;
  const label = FAIR_LABEL[category].toLowerCase();
  if (entry) {
    entryScore = fairScore(entry, category) + rng.normal() * FAIR_JUDGE_SD;
    place = 1 + field.filter((r) => r.score > entryScore!).length;
    prize = FAIR_PRIZES[place - 1] ?? 0;
    if (place === 1) {
      entry.rosettes.push(category);
      state.stats.fairsWon += 1;
      state.reputation += 2;
      text = `${entry.name} won first place for ${label}! A rosette and ${prize} coins.`;
    } else if (prize > 0) {
      state.reputation += 1;
      text = `${entry.name} came ${place === 2 ? "second" : "third"} for ${label} and won ${prize} coins.`;
    } else {
      text = `${entry.name} wasn't placed for ${label} this year. The judge was kind about it.`;
    }
    state.money += prize;
    state.stats.coinsEarned += prize;
  } else {
    text = `The fair came and went — ${field.sort((a, b) => b.score - a.score)[0]!.owner}'s ${field[0]!.name} took ${label}.`;
  }
  field.sort((a, b) => b.score - a.score);
  const result: FairResult = { season, category, entry: entryId, entryName: entry?.name ?? null, place, prize, entryScore, field, text };
  state.fair.history.push(result);
  const next = season + 4;
  state.fair = { nextSeason: next, category: fairCategoryFor(next), entry: null, history: state.fair.history };
  addLog(state, text);
  return result;
}
