/** Public API of the Blue Sheep game core. Pure TS, no DOM. */
export * from "./types.js";
export * from "./config.js";
export {
  species, seasonLabel, seasonOfYear, yearOf, ageOf, isAdult, isIll, canBreed, flockSheep, pedigreeOf, genomeOf,
  newGame, serialize, deserialize, OldSaveError, nextFairSeason, fairCategoryFor, unlocksUpTo, addLog, marketSize,
} from "./state.js";
export { advanceSeason, renameSheep, twinChance } from "./sim.js";
export { planMating, unplanMating, plannedPairings, ramLoad, ramAvailable, lambRoom, overCap, growingLambs } from "./breeding.js";
export { buySheep, sellSheep, sheepValue, buyPrice, ramPrice, woolIncome, finenessMultiplier } from "./economy.js";
export { vetTest, forecastVet, isTestLocus, wasTested } from "./vet.js";
export {
  woolOf, woolFromPhenotype, dressWool, colourFields, setColour, isTrueBlue, isColoured, bandRank, woolMatches, targetWords, woolPricePerKg,
  colourValue, colourShowScore, BANDS, PASTEL_NAMES, HUE_NAMES, type Wool, type Band, type ColourTarget,
} from "./colour.js";
export {
  buyUpgrade, forecastUpgrade, upgradeBlocked, upgradeOffered, upgradeDef, hasUpgrade, upgradeCapBonus, feedPerHead, chanceWords, type UpgradeForecast,
} from "./upgrades.js";
export {
  fondnessOf, defaultFondness, fondnessWord, fondnessHearts, fondWoolMultiplier, greetAnimal, giveTreat, treatBlocked,
  brushAnimal, brushedThisSeason, forecastBrush,
  forecastTreat, greetedThisSeason, treatedThisSeason, isPetId, isOwnAnimal, ownedPets, petEffort, fleeceAt, seasonCare,
  type TreatForecast,
} from "./care.js";
export { hasCat, catCatch, miceCost, miceNow, miceComingText, MICE_ANNOUNCE } from "./mice.js";
export {
  acceptOrder, declineOrder, forecastOrder, forecastOrderFor, sheepMatchesOrder, orderBoardLimit, orderTarget, colourChanceBySample,
} from "./orders.js";
export { enterFair, forecastFair, fairScore, fairOdds, fieldMean } from "./fair.js";
export { hireVisitingRam, forecastVisitor } from "./visitor.js";
export { announceText, eventPool, ownedDogs, predatorRisk, dogGuardChance, foxGuard, type Predator } from "./events.js";
export {
  forecastCross, candidates, rankCandidates, scoreCross, flockStats, traitRecords, blueText, learnText, colourText, colourClasses,
  litterOf, NAMED_MIN, pColour, goalColour, GOALS, type Goal,
} from "./forecast.js";
export {
  factsFor, posteriors, updateDiscoveries, marginal, geneDist, geneLoci, entropyBits, channelClassWords, isChannel,
  DISCRETE_TRAITS, LOCUS_WORDS, GENE_LABEL, GENES, CHANNELS, type Fact, type GeneId, type Channel,
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
  PACING, CALENDAR, ORDERS_BY, paceStep, unlockedAt, latestUnlock, nextUnlock, nextDated, grantUnlock, checkPacing, tutorialOver, type PaceStep,
} from "./pacing.js";
export {
  LESSONS, lessonDef, lessonInfo, lessonActive, startLesson, lessonStepMet, advanceLesson, ackLesson, skipLesson, lessonSpeech,
  type LessonDef, type LessonStep, type LessonPoint, type LessonView, type LessonInfo,
} from "./lessons.js";
export {
  PUNNET_GENES, punnetSquare, punnetLook, knownCopies, knownPunnet, type PunnetGene, type PunnetSquare, type PunnetCell,
} from "./punnet.js";
export {
  TUTORIAL_STEPS, MENTOR, newTutorialGame, advanceTutorial, skipTutorial, tutorialInfo, tutorialActive, tutorialStep,
  cheapestMarketEwe, isTutorialFirstMating, tutorialLambIndex, tutorialLambs, TUTORIAL_LAMBS, TUTORIAL_VERSION, colourOf, hornsOf, type TutorialStepId, type TutorialStepDef, type TutorialInfo,
} from "./tutorial.js";
export {
  marketBreeds, icelandicUnlocked, breedOf, breedFractions, breedShares, breedLine, mainBreed, type BreedFractions,
} from "./breeds.js";
export {
  woolTypeOf, fleeceOf, fleeceWords, finenessWord, stapleWord, lustreWord, strengthWord, strengthFraction, woolSuit, itemsSuiting,
  WOOL_TYPE_LABEL, WOOL_TYPES, WOOL_TYPE_BLURB, ITEM_IDS, SUIT, type WoolType, type FleeceWords, type ItemId,
} from "./wool.js";
