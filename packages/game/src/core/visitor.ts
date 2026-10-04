/** The visiting ram: fresh blood for one season, no pedigree, nothing known. */
import { genotypeAt, sampleFounder, type Rng } from "@blue-sheep/genetics";
import { VISITOR_FEE } from "./config.js";
import { forecastCross, candidates } from "./forecast.js";
import { addLog, addSheep, blueCopies, hasOffspring, marketFreqs, sampleFounderSheep, species } from "./state.js";
import { marketBreeds } from "./breeds.js";
import { woolOf } from "./colour.js";
import { oddsLabel } from "./words.js";
import type { GameState } from "./types.js";

/** Called by the sim at the start of each spring once the visitor is unlocked. */
export function offerVisitingRam(state: GameState, rng: Rng): void {
  // Rams from over the hills come from breed stock (so their look matches their genetics), show their colour and
  // carry blue paint, but are never true blue themselves (the sim may read genomes). A breed that rarely shows
  // colour hands over to the next after 60 tries.
  const born = state.season - 4 - rng.int(8);
  const pool = marketBreeds(state);
  const first = rng.int(pool.length);
  let ram = null;
  let breed = pool[first]!;
  for (let tries = 0; tries < 240 && !ram; tries++) {
    breed = pool[(first + Math.floor(tries / 60)) % pool.length]!;
    const genome = sampleFounder(species.map, rng, marketFreqs(breed));
    const coloured = genotypeAt(genome, species.map, "W").every((x) => x === 0);
    if (!coloured || blueCopies(genome) < 1) continue;
    const s = addSheep(state, rng, { sex: "ram", born, dam: null, sire: null, genome, inbreeding: 0, origin: "visitor", breed });
    if (woolOf(s).trueBlue) { delete state.sheep[s.id]; continue; }
    ram = s;
  }
  ram ??= sampleFounderSheep(state, rng, "ram", born, "visitor", pool[first]);
  state.visitingRam = { id: ram.id, fee: VISITOR_FEE, season: state.season };
  state.hiredRam = null;
  addLog(state, `A travelling drover has brought ${ram.name}, a ram from over the hills, where the sheep run every colour and blue paint is common. He's for hire this season only.`);
}

/** Pay the fee so the visiting ram can be planned for matings this season. */
export function hireVisitingRam(state: GameState): void {
  const v = state.visitingRam;
  if (!state.unlocks.includes("visitor")) throw new Error("No visiting rams yet.");
  if (!v || v.season !== state.season) throw new Error("There's no visiting ram this season.");
  if (state.hiredRam === v.id) throw new Error("You've already hired him.");
  if (state.money < v.fee) throw new Error(`Hiring him costs ${v.fee} coins — you have ${state.money}.`);
  state.money -= v.fee;
  state.hiredRam = v.id;
  addLog(state, `Hired ${state.sheep[v.id]!.name} for the season.`);
}

/** The visitor leaves at the end of his season. Without lambs he leaves no trace. */
export function departVisitingRam(state: GameState): void {
  const v = state.visitingRam;
  if (!v) return;
  if (!hasOffspring(state, v.id) && !state.discoveries.some((d) => d.sheep === v.id)) {
    delete state.sheep[v.id]; delete state.zone[v.id]; delete state.known[v.id];
  }
  state.visitingRam = null;
  state.hiredRam = null;
}

/**
 * Forecast for the hire decision: his best cross with your ewes (knowledge-limited).
 * Nothing is known about his hidden colours, so bands are wide by construction.
 */
export function forecastVisitor(state: GameState): { bestBlue: number; ewe: string | null; text: string } {
  const v = state.visitingRam;
  if (!v || !state.sheep[v.id]) return { bestBlue: 0, ewe: null, text: "There's no visiting ram this season." };
  let bestBlue = 0, ewe: string | null = null;
  for (const e of candidates(state, v.id)) {
    const p = forecastCross(state, e.id, v.id).trueBlue;
    if (p > bestBlue || ewe === null) { bestBlue = p; ewe = e.id; }
  }
  const name = state.sheep[v.id]!.name;
  const odds = bestBlue > 0 ? ` Best true blue chance${ewe ? ` with ${state.sheep[ewe]!.name}` : ""}: ${oddsLabel(bestBlue).toLowerCase()}.` : "";
  return { bestBlue, ewe, text: `${name} is no kin to your flock — fresh blood, but nobody knows what he carries.${odds}` };
}
