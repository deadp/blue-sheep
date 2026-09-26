/** Public API of the Blue Sheep game core. Pure TS, no DOM. */
export * from "./types.js";
export * from "./config.js";
export {
  species, seasonLabel, seasonOfYear, yearOf, ageOf, isAdult, isIll, canBreed, flockSheep, pedigreeOf, genomeOf,
  newGame, serialize, deserialize, migrateV1, nextFairSeason, fairCategoryFor, unlocksUpTo, addLog,
} from "./state.js";
export { advanceSeason, renameSheep, twinChance } from "./sim.js";
export { planMating, unplanMating, plannedPairings, ramLoad, ramAvailable, lambRoom, overCap, growingLambs } from "./breeding.js";
export { buySheep, sellSheep, sheepValue, buyPrice, ramPrice, woolIncome, finenessMultiplier } from "./economy.js";
export { vetTest, forecastVet, isTestLocus } from "./vet.js";
export {
  buyUpgrade, forecastUpgrade, upgradeBlocked, upgradeDef, hasUpgrade, upgradeCapBonus, feedPerHead, chanceWords, type UpgradeForecast,
} from "./upgrades.js";
export {
  fondnessOf, defaultFondness, fondnessWord, fondnessHearts, fondWoolMultiplier, greetAnimal, giveTreat, treatBlocked,
  forecastTreat, greetedThisSeason, treatedThisSeason, isPetId, isOwnAnimal, ownedPets, petEffort, fleeceAt, seasonCare,
  type TreatForecast,
} from "./care.js";
export { hasCat, catCatch, miceCost, miceNow, miceComingText, MICE_ANNOUNCE } from "./mice.js";
export {
  acceptOrder, declineOrder, forecastOrder, forecastOrderFor, sheepMatchesOrder,
} from "./orders.js";
export { enterFair, forecastFair, fairScore, fairOdds, fieldMean } from "./fair.js";
export { hireVisitingRam, forecastVisitor } from "./visitor.js";
export { announceText, ownedDogs, predatorRisk, dogGuardChance, foxGuard, type Predator } from "./events.js";
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
export {
  personalityOf, personalityFromBoldness, personalityLine, flavoursOf, PERSONALITY_WORD, PERSONALITY_ICON,
  type Personality, type Flavour,
} from "./personality.js";
export { EWE_NAMES, RAM_NAMES, VILLAGERS } from "./names.js";
export {
  TUTORIAL_STEPS, MENTOR, NEIGHBOUR, newTutorialGame, advanceTutorial, skipTutorial, tutorialInfo, tutorialActive, tutorialStep,
  cheapestMarketEwe, isTutorialFirstMating, colourOf, type TutorialStepId, type TutorialStepDef, type TutorialInfo,
} from "./tutorial.js";
