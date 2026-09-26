/** Cross forecasts and mate candidates, computed only from the player's knowledge (posteriors + farm records). */
import { sheep as sheepDefs } from "@blue-sheep/genetics";
import { forecastQuantitative, informationGain, lambOutcomes, type Record_ } from "@blue-sheep/inference";
import { posteriors } from "./knowledge.js";
import { canBreed, isAdult, pedigreeOf } from "./state.js";
import { fractionWords, oddsLabel } from "./words.js";
import type { CrossForecast, GameState, Sheep } from "./types.js";

export type Goal = "blue" | "learn" | "fine" | "heavy";
export const GOALS: { id: Goal; label: string }[] = [
  { id: "blue", label: "Blue lamb" }, { id: "learn", label: "Learn the most" }, { id: "fine", label: "Finer wool" }, { id: "heavy", label: "Heavier fleece" },
];

/** Measured records for a quantitative trait (adults, plus anyone who has left the flock). */
export function traitRecords(state: GameState, traitId: string): Record_[] {
  return Object.values(state.sheep)
    .filter((s) => isAdult(s, state.season) || !state.flock.includes(s.id))
    .map((s) => ({ id: s.id, dam: s.dam, sire: s.sire, value: Number(s.phenotype[traitId]) }));
}

export function flockStats(state: GameState, traitId: string): { mean: number; sd: number } {
  const vals = Object.values(state.sheep).map((s) => Number(s.phenotype[traitId]));
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length - 1)) || 1;
  return { mean, sd };
}

export function blueText(p: number): string {
  if (p <= 0) return "No blue lambs from this pair, as far as you know.";
  if (p < 0.05) return "A very long shot — a blue lamb is possible, but rare.";
  if (p >= 0.95) return "Every lamb should be blue.";
  return `${oddsLabel(p)} — ${fractionWords(p, "lamb")} would be blue.`;
}

export function learnText(bits: number): string {
  if (bits > 1) return "You would learn a lot from this lamb.";
  if (bits > 0.3) return "You would learn something from this lamb.";
  return "This lamb would teach you little new.";
}

export function forecastCross(state: GameState, eweId: string, ramId: string): CrossForecast {
  const post = posteriors(state);
  const colourP = post.byTrait.get("colour")!, hornsP = post.byTrait.get("horns")!, patP = post.byTrait.get("pattern")!;
  const ped = pedigreeOf(state);
  const ewe = state.sheep[eweId], ram = state.sheep[ramId];
  if (!ewe || !ram) throw new Error("Unknown sheep in this pairing.");
  const fin = flockStats(state, "fineness"), fw = flockStats(state, "fleeceWeight");
  const colour = lambOutcomes(colourP, eweId, ramId);
  const learnBits = informationGain(colourP, eweId, ramId) + informationGain(hornsP, eweId, ramId) + informationGain(patP, eweId, ramId);
  return {
    colour,
    horns: lambOutcomes(hornsP, eweId, ramId),
    pattern: lambOutcomes(patP, eweId, ramId),
    learnBits,
    fineness: forecastQuantitative(sheepDefs.fineness, Number(ewe.phenotype["fineness"]), Number(ram.phenotype["fineness"]), traitRecords(state, "fineness"), fin.mean, fin.sd),
    fleeceWeight: forecastQuantitative(sheepDefs.fleeceWeight, Number(ewe.phenotype["fleeceWeight"]), Number(ram.phenotype["fleeceWeight"]), traitRecords(state, "fleeceWeight"), fw.mean, fw.sd),
    relatedness: ped.relatedness(eweId, ramId),
    inbreeding: ped.offspringInbreeding(eweId, ramId),
    blueText: blueText(colour["blue"] ?? 0),
    learnText: learnText(learnBits),
  };
}

/** Higher is better for the chosen goal tab. */
export function scoreCross(f: CrossForecast, goal: Goal): number {
  switch (goal) {
    case "blue": return f.colour["blue"] ?? 0;
    case "learn": return f.learnBits;
    case "fine": return -f.fineness.mean;
    case "heavy": return f.fleeceWeight.mean;
  }
}

/**
 * Possible mates for `forId`: adults of the other sex that can breed this season.
 * For ewes this includes the visiting ram while one is at the farm (hired or not —
 * the forecast helps decide whether to hire him).
 */
export function candidates(state: GameState, forId: string): Sheep[] {
  const me = state.sheep[forId];
  if (!me) return [];
  const out = state.flock.map((id) => state.sheep[id]!)
    .filter((s) => s.id !== forId && s.sex !== me.sex && canBreed(s, state.season));
  const v = state.visitingRam;
  if (v && me.sex === "ewe" && v.season === state.season && state.sheep[v.id] && !out.some((s) => s.id === v.id)) out.push(state.sheep[v.id]!);
  return out;
}

/** Sort candidates for a goal tab, best first. */
export function rankCandidates(state: GameState, forId: string, goal: Goal): { sheep: Sheep; forecast: CrossForecast; score: number }[] {
  const me = state.sheep[forId]!;
  return candidates(state, forId).map((c) => {
    const [eweId, ramId] = me.sex === "ewe" ? [me.id, c.id] : [c.id, me.id];
    const forecast = forecastCross(state, eweId, ramId);
    return { sheep: c, forecast, score: scoreCross(forecast, goal) };
  }).sort((a, b) => b.score - a.score);
}
