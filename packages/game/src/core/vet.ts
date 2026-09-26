/** The vet: pay to test one sheep at one locus. The forecast says how much the test would tell you. */
import { genotypeString } from "@blue-sheep/genetics";
import { TEST_LOCI, VET_FEE } from "./config.js";
import { entropyBits, factsFor, LOCUS_WORDS, marginal, updateDiscoveries } from "./knowledge.js";
import { addLog, genomeOf, species } from "./state.js";
import type { Discovery, GameState } from "./types.js";

export function isTestLocus(locus: string): locus is (typeof TEST_LOCI)[number] {
  return (TEST_LOCI as readonly string[]).includes(locus);
}

function vetSubject(state: GameState, sheepId: string) {
  const s = state.sheep[sheepId];
  const visitor = state.visitingRam?.id === sheepId && state.visitingRam.season === state.season;
  if (!s || (!state.flock.includes(sheepId) && !visitor)) throw new Error("The vet can only see sheep on your farm.");
  return s;
}

/** How much a test would narrow what you know (bits of uncertainty it removes) and a plain sentence. */
export function forecastVet(state: GameState, sheepId: string, locus: string): { gainBits: number; text: string } {
  if (!isTestLocus(locus)) throw new Error("The vet doesn't test for that.");
  const s = state.sheep[sheepId];
  if (!s) throw new Error("I can't find that sheep.");
  const label = LOCUS_WORDS[locus]!.label;
  if (s.tested[locus]) return { gainBits: 0, text: `Already tested — you know ${s.name}'s ${label} for sure.` };
  const gainBits = entropyBits(Object.values(marginal(state, sheepId, locus)));
  let text: string;
  if (gainBits < 0.02) text = `You already know this for certain; a test would tell you nothing new.`;
  else if (gainBits < 0.4) text = `You're fairly sure already; a test would only confirm it.`;
  else if (gainBits < 0.9) text = `A test would settle a real question about ${s.name}'s ${label}.`;
  else text = `${s.name}'s ${label} is anyone's guess — a test would tell you a lot.`;
  return { gainBits, text };
}

/** Run a test. Reads the true genome (the vet is part of the sim). Returns any discovery cards it earned. */
export function vetTest(state: GameState, sheepId: string, locus: string): Discovery[] {
  if (!state.unlocks.includes("vet")) throw new Error("The vet hasn't opened yet.");
  if (!isTestLocus(locus)) throw new Error("The vet doesn't test for that.");
  const s = vetSubject(state, sheepId);
  if (s.tested[locus]) throw new Error(`${s.name} has already been tested for that.`);
  if (state.money < VET_FEE) throw new Error(`The test costs ${VET_FEE} coins — you have ${state.money}.`);
  state.money -= VET_FEE;
  s.tested[locus] = genotypeString(genomeOf(s), species.map, locus);
  const fact = factsFor(state, sheepId).find((f) => f.locus === locus);
  addLog(state, `The vet's results are in: ${s.name} ${fact ? fact.text : "has been tested"}.`);
  return updateDiscoveries(state);
}
