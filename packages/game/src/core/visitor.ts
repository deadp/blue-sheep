/** The visiting ram: fresh blood for one season, no pedigree, nothing known. */
import { discretePhenotype, genotypeAt, sampleFounder, sheep as sheepDefs, type Rng } from "@blue-sheep/genetics";
import { VISITOR_FEE } from "./config.js";
import { forecastCross, candidates } from "./forecast.js";
import { addLog, addSheep, hasOffspring, sampleFounderSheep, species } from "./state.js";
import { oddsLabel } from "./words.js";
import type { GameState } from "./types.js";

/** Called by the sim at the start of each spring once the visitor is unlocked. */
export function offerVisitingRam(state: GameState, rng: Rng): void {
  // Rams from over the hills are self-coloured and usually carry the dilute allele (the sim may read genomes).
  const born = state.season - 4 - rng.int(8);
  let ram = null;
  for (let tries = 0; tries < 200 && !ram; tries++) {
    const genome = sampleFounder(species.map, rng);
    const self = genotypeAt(genome, species.map, "A").every((x) => x === 0);
    const dilute = genotypeAt(genome, species.map, "D").some((x) => x === 0);
    if (!self || !dilute || discretePhenotype(genome, species.map, sheepDefs.colour) === "blue") continue;
    ram = addSheep(state, rng, { sex: "ram", born, dam: null, sire: null, genome, inbreeding: 0, origin: "visitor" });
  }
  ram ??= sampleFounderSheep(state, rng, "ram", born, "visitor");
  state.visitingRam = { id: ram.id, fee: VISITOR_FEE, season: state.season };
  state.hiredRam = null;
  addLog(state, `A travelling drover has brought ${ram.name}, a ram from over the hills, where the sheep run dark and soft-coloured. He's for hire this season only.`);
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
    const p = forecastCross(state, e.id, v.id).colour["blue"] ?? 0;
    if (p > bestBlue || ewe === null) { bestBlue = p; ewe = e.id; }
  }
  const name = state.sheep[v.id]!.name;
  const odds = bestBlue > 0 ? ` Best blue chance${ewe ? ` with ${state.sheep[ewe]!.name}` : ""}: ${oddsLabel(bestBlue).toLowerCase()}.` : "";
  return { bestBlue, ewe, text: `${name} is no kin to your flock — fresh blood, but nobody knows what he carries.${odds}` };
}
