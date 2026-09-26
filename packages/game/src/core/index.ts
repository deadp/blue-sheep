/** Public API of the Blue Sheep game core. Pure TS, no DOM. */
export * from "./types.js";
export * from "./config.js";
export {
  species, seasonLabel, seasonOfYear, yearOf, ageOf, isAdult, isIll, canBreed, flockSheep, pedigreeOf, genomeOf,
  newGame, serialize, deserialize, migrateV1, nextFairSeason, fairCategoryFor, unlocksUpTo, addLog,
} from "./state.js";
export { advanceSeason, renameSheep, twinChance } from "./sim.js";
export { planMating, unplanMating, plannedPairings, ramLoad, ramAvailable, lambRoom, overCap } from "./breeding.js";
export { buySheep, sellSheep, sheepValue, buyPrice, ramPrice, woolIncome, finenessMultiplier } from "./economy.js";
export { vetTest, forecastVet, isTestLocus } from "./vet.js";
export {
  acceptOrder, declineOrder, forecastOrder, forecastOrderFor, sheepMatchesOrder,
} from "./orders.js";
export { enterFair, forecastFair, fairScore, fairOdds, fieldMean } from "./fair.js";
export { hireVisitingRam, forecastVisitor } from "./visitor.js";
export { announceText } from "./events.js";
export {
  forecastCross, candidates, rankCandidates, scoreCross, flockStats, traitRecords, blueText, learnText, GOALS, type Goal,
} from "./forecast.js";
export {
  factsFor, posteriors, updateDiscoveries, marginal, entropyBits, DISCRETE_TRAITS, LOCUS_WORDS, type Fact,
} from "./knowledge.js";
export { familyTree, type FamilyTree, type TreeNode, type AncestorNode, type DescendantNode } from "./tree.js";
export {
  currentAct, actInfo, isEnding, markEndingShown, registryStatus, enterAct, checkActAdvance, checkEnding, type RegistryStatus,
} from "./acts.js";
export { oddsText, oddsLabel, fractionWords } from "./words.js";
export { EWE_NAMES, RAM_NAMES, VILLAGERS } from "./names.js";
