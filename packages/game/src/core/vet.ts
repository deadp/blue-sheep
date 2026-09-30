/**
 * The vet: pay to test one sheep for one gene. v3 tests (DESIGN-v3 §2.3): hidden colour (W), a pigment test
 * per colour (red, yellow or blue: pins both genes of that colour, so it tells how the doses pass on), pale
 * (Dl), spots (S) and horns (P). The forecast says how much a test would tell you, in words.
 */
import { genotypeString } from "@blue-sheep/genetics";
import { TEST_LOCI, VET_FEE } from "./config.js";
import { entropyBits, factsFor, GENE_LABEL, geneDist, geneLoci, isChannel, updateDiscoveries, type GeneId } from "./knowledge.js";
import { addLog, genomeOf, species } from "./state.js";
import type { Discovery, GameState, Sheep } from "./types.js";

export function isTestLocus(locus: string): locus is (typeof TEST_LOCI)[number] {
  return (TEST_LOCI as readonly string[]).includes(locus);
}

/** Has this sheep had this test (every gene of it on record)? */
export function wasTested(s: Sheep, gene: GeneId): boolean {
  return geneLoci(gene).every((l) => s.tested[l] !== undefined);
}

function vetSubject(state: GameState, sheepId: string) {
  const s = state.sheep[sheepId];
  const visitor = state.visitingRam?.id === sheepId && state.visitingRam.season === state.season;
  if (!s || (!state.flock.includes(sheepId) && !visitor)) throw new Error("The vet can only see sheep on your farm.");
  return s;
}

/** What the test would settle for this sheep, as a question in words. */
function question(s: Sheep, gene: GeneId): string {
  const her = s.sex === "ram" ? "his" : "her";
  const white = s.phenotype["white"] === "white";
  if (gene === "W") return white ? `whether ${s.name} hides colour under the white` : `${s.name}'s colour already shows`;
  if (isChannel(gene)) {
    if (white) return `what ${gene} paint ${s.name} hides under the white, and how it passes on`;
    const d = Number(s.phenotype[gene] ?? 0);
    return d === 2 ? `whether ${her} two ${gene} doses pass on one each, or none-to-two` : `how ${her} ${gene} doses pass on to lambs`;
  }
  if (gene === "Dl") return white ? `whether ${s.name} carries pale under the white` : `whether ${s.name} carries a pale copy`;
  if (gene === "S") return `whether ${s.name} carries spots`;
  return `whether ${s.name} carries horns`;
}

/** How much a test would narrow what you know (bits of uncertainty it removes) and a plain sentence. */
export function forecastVet(state: GameState, sheepId: string, locus: string): { gainBits: number; text: string } {
  if (!isTestLocus(locus)) throw new Error("The vet doesn't test for that.");
  const s = state.sheep[sheepId];
  if (!s) throw new Error("I can't find that sheep.");
  const gene = locus as GeneId;
  const label = GENE_LABEL[gene];
  if (wasTested(s, gene)) return { gainBits: 0, text: `Already tested — you know ${s.name}'s ${label} for sure.` };
  const gainBits = entropyBits(Object.values(geneDist(state, sheepId, gene)));
  const q = question(s, gene);
  let text: string;
  if (gainBits < 0.02) text = `You already know this for certain; a test would tell you nothing new.`;
  else if (gainBits < 0.4) text = `You're fairly sure already; a test would only confirm ${q}.`;
  else if (gainBits < 0.9) text = `A test would settle ${q}.`;
  else text = `Anyone's guess — a test would show ${q}.`;
  return { gainBits, text };
}

/** Run a test. Reads the true genome (the vet is part of the sim). Returns any discovery cards it earned. */
export function vetTest(state: GameState, sheepId: string, locus: string): Discovery[] {
  if (!state.unlocks.includes("vet")) throw new Error("The vet hasn't opened yet.");
  if (!isTestLocus(locus)) throw new Error("The vet doesn't test for that.");
  const s = vetSubject(state, sheepId);
  const gene = locus as GeneId;
  if (wasTested(s, gene)) throw new Error(`${s.name} has already been tested for that.`);
  if (state.money < VET_FEE) throw new Error(`The test costs ${VET_FEE} coins — you have ${state.money}.`);
  state.money -= VET_FEE;
  const g = genomeOf(s);
  for (const l of geneLoci(gene)) s.tested[l] = genotypeString(g, species.map, l);
  const fact = factsFor(state, sheepId).find((f) => f.locus === gene);
  addLog(state, `The vet's results are in: ${s.name} ${fact ? fact.text : "has been tested"}.`);
  return updateDiscoveries(state);
}
