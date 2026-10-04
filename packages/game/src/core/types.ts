/** Shared data shapes for the game core. Everything here is plain JSON-serialisable data. */
import type { BreedId } from "@blue-sheep/genetics";
import type { QuantForecast } from "@blue-sheep/inference";

export type Sex = "ewe" | "ram";
export type Phenotype = Record<string, string | number>;
export type SheepOrigin = "founder" | "bred" | "market" | "visitor";

export interface Sheep {
  id: string;
  name: string;
  sex: Sex;
  /** Absolute season index at birth. Founders get negative values (already adult). */
  born: number;
  dam: string | null;
  sire: string | null;
  genome: number[][][];
  inbreeding: number;
  phenotype: Phenotype;
  /** Loci whose genotype has been revealed by a vet test. locus -> genotype string. Never show these strings to the player. */
  tested: Record<string, string>;
  /** Ill: misses breeding. Set by a hard winter; clears after the following season. */
  ill: boolean;
  /** Fair categories this sheep has won 1st place in (one entry per rosette). */
  rosettes: FairCategory[];
  origin: SheepOrigin;
  /** Founder breed of a bought-in sheep (core/breeds.ts). Absent: the Farm breed (starter flock, visitors, bred lambs take their parents' mix). */
  breed?: BreedId;
}

export interface Pairing { ewe: string; ram: string }

export interface LogEntry { season: number; text: string }

/** Farm improvements (definitions and prices in config.ts). The three dogs and the cat are animals too (PetId). */
export type UpgradeId = "terrier" | "collie" | "maremma" | "cat" | "barn" | "paddock" | "shearing" | "meadow";

/** Farm animals that are not sheep: bought as improvements, each with its own fondness. */
export type PetId = "terrier" | "collie" | "maremma" | "cat";
export type DogId = "terrier" | "collie" | "maremma";

/**
 * Fondness: how fond an animal is of you, 0–100. Grows when you greet it (once a season) or give it a treat
 * (once a season, 1 coin); fades slowly when it is ignored for a while. Keyed by sheep id or PetId.
 */
export interface CareRecord {
  level: number;
  /** Season it was last greeted (-1: never). */
  greeted: number;
  /** Season it last had a treat (-1: never). */
  treated: number;
  /** Season of the last greeting, treat or brushing (decay starts a while after this). */
  cared: number;
  /** Season it was last brushed (a dog or the cat: patted). Absent: never. */
  brushed?: number;
}

/**
 * Concepts that open up over the game, one at a time (core/pacing.ts): `farm` = farm improvements and winter
 * weather, `dogs` = dogs at the market and foxes, `cat` = the cat and mice.
 */
export type Unlock = "numbers" | "vet" | "orders" | "fair" | "tree" | "visitor" | "cards" | "farm" | "dogs" | "cat";

/** Genes the vet can test and facts can be about: W (hidden colour), a pigment channel, Dl (pale), S, P. */
export type Locus = "W" | "red" | "yellow" | "blue" | "Dl" | "S" | "P";

export interface Discovery {
  id: string;
  season: number;
  sheep: string;
  locus: string;
  /** Every locus on this card (one card batches all that was learned about a sheep in one go). Absent in old saves. */
  loci?: string[];
  /** Plain sentence, e.g. "Clover passes one red dose to every lamb." */
  text: string;
}

// ---- Orders ---------------------------------------------------------------

export type OrderKind = "colour" | "wool" | "horns";
export type OrderStatus = "open" | "accepted" | "filled" | "failed" | "expired";

export interface Order {
  id: string;
  kind: OrderKind;
  villager: string;
  /** Plain sentence shown on the board. */
  text: string;
  /** colour orders: the wanted colour name ("red", "pink", "slate", "true blue"; core/colour.ts `woolMatches`). */
  colour: string | null;
  /** colour orders: the lowest intensity band accepted ("soft" | "bright" | "vivid"), or null for any. */
  band: "soft" | "bright" | "vivid" | null;
  /** horns orders: "horned" | "polled". */
  horns: string | null;
  /** Optional sex requirement (colour/horns orders). */
  sex: Sex | null;
  /** wool orders: kg wanted in one shearing, and the coarsest fibre accepted (µm). */
  kg: number | null;
  microns: number | null;
  posted: number;
  /** An open (not accepted) order disappears when the season reaches this. */
  expires: number;
  /** Must be filled before the season reaches this (lambs born into this season still count). */
  deadline: number;
  reward: number;
  reputation: number;
  status: OrderStatus;
  /** Sheep handed over (colour/horns) or whose fleece was sent (wool). */
  filledBy: string[];
  resolvedSeason: number | null;
}

export interface OrderResult {
  order: Order;
  outcome: "filled" | "failed" | "expired";
  reward: number;
  reputation: number;
  text: string;
}

// ---- Fair -----------------------------------------------------------------

export type FairCategory = "fine" | "heavy" | "rare" | "big";

export interface FairRival { name: string; owner: string; score: number }

export interface FairResult {
  season: number;
  category: FairCategory;
  entry: string | null;
  entryName: string | null;
  /** 1-based placing, null if no entry. */
  place: number | null;
  prize: number;
  entryScore: number | null;
  field: FairRival[];
  text: string;
}

export interface FairState {
  /** Absolute season of the next fair (always an autumn). */
  nextSeason: number;
  category: FairCategory;
  entry: string | null;
  history: FairResult[];
}

// ---- Events ---------------------------------------------------------------

export type EventKind = "hardWinter" | "fox" | "woolBoom" | "wolf";

export interface PendingEvent {
  kind: EventKind;
  /** The season in which it happens. */
  season: number;
  /** woolBoom: which colour family's wool doubles in price. */
  colour: string | null;
  /** Announcement sentence. */
  text: string;
}

export interface EventRecord {
  kind: EventKind;
  season: number;
  colour: string | null;
  /** Sheep affected (ill sheep for hardWinter, lost lamb for fox/wolf). */
  sheep: string | null;
  /** fox/wolf: true when a guardian sheep or a dog saw it off; hardWinter: true when the barn kept everyone well. */
  saved: boolean;
  text: string;
  /** fox/wolf: the dog that saw it off, if one did (absent in older saves). */
  dog?: DogId | null;
}

/** Mice in the barn: announced a season ahead, they spoil some wool and eat some hay. The cat catches most. */
export interface MiceReport {
  /** Coins of wool spoiled. */
  wool: number;
  /** Extra coins of hay eaten. */
  feed: number;
  /** What it would have cost without the cat (equal to wool + feed when there is no cat). */
  without: number;
  cat: boolean;
  text: string;
}

export interface VisitingRam { id: string; fee: number; season: number }

// ---- Progression ----------------------------------------------------------

export type ActNumber = 0 | 1 | 2 | 3 | 4;

export interface ActInfo {
  act: ActNumber;
  title: string;
  /** Villager hook line spoken on entry. */
  line: string;
  goalText: string;
  progressText: string;
  /** 0..1 */
  progress: number;
  /** Unlock strings granted on entering this act. */
  unlocks: Unlock[];
  flockCap: number;
  /** True once the story is over (endless mode). */
  endless: boolean;
}

export interface Stats {
  lambsBorn: number;
  /** True blue lambs born (family blue, vivid, not pale). */
  bluesBorn: number;
  coinsEarned: number;
  discoveries: number;
  fairsWon: number;
  ordersFilled: number;
  ordersFailed: number;
}

export interface ActStart { season: number; ordersFilled: number; fairsWon: number }

/**
 * The tutorial (core/tutorial.ts). `null` for games started without it (skipped, deep links, old saves).
 * Steps are 1-based (TUTORIAL_STEPS); `done` once the player has finished or skipped it.
 */
export interface TutorialState {
  step: number;
  done: boolean;
  /** The tutorial's white ewe and ram (both carry hidden colour and horns). */
  ewe: string;
  ram: string;
  /** Coins the mentor chipped in at the market step (0 if none were needed). */
  gift: number;
  /** The tutorial's version (3: three lambs). Absent in older saves: an unfinished old tutorial ends on load. */
  ver?: number;
}

export interface GameState {
  version: 3;
  seed: number;
  rng: number;
  season: number;
  money: number;
  act: ActNumber;
  actStart: ActStart;
  flockCap: number;
  reputation: number;
  sheep: Record<string, Sheep>;
  /** Display order. Dead/sold sheep are removed from here but kept in `sheep` for pedigree. */
  flock: string[];
  /** Sheep for sale this season. */
  market: string[];
  log: LogEntry[];
  nextId: number;
  /** Where each sheep lives on the farm (free-form, owned by the UI/controller). */
  zone: Record<string, string>;
  /** Planned matings for this season: ewe id -> ram id. Cleared when the season resolves. */
  plans: Record<string, string>;
  /** Facts the player has proven: sheep id -> gene (W, red, yellow, blue, Dl, S, P) -> genotype string or pigment class (internal; never display). */
  known: Record<string, Record<string, string>>;
  discoveries: Discovery[];
  unlocks: Unlock[];
  orders: Order[];
  acceptedOrders: string[];
  orderHistory: Order[];
  nextOrderId: number;
  fair: FairState;
  visitingRam: VisitingRam | null;
  hiredRam: string | null;
  events: EventRecord[];
  pendingEvent: PendingEvent | null;
  ending: { shown: boolean; season: number } | null;
  stats: Stats;
  /** Farm improvements bought (absent in older saves: treat as none). */
  upgrades?: UpgradeId[];
  /** Fondness per animal (sheep id or PetId). Missing records use a default by origin (core/care.ts). */
  care?: Record<string, CareRecord>;
  /** The season mice are expected in the barn, announced a season ahead (null: none coming). */
  mice?: number | null;
  /** Legacy v1 notebook/achievements, kept for old saves. */
  achievements: string[];
  /**
   * The season each paced concept arrived (core/pacing.ts). Absent in older saves: whatever is already in
   * `unlocks` counts as long since arrived.
   */
  paced?: Partial<Record<Unlock, number>>;
  /** Tutorial progress; null when there is no tutorial (absent in older saves: loaded as null). */
  tutorial: TutorialState | null;
  /**
   * The mini-lesson running for a newly arrived concept (core/lessons.ts): its id and 1-based step, or null.
   * Absent in older saves: no lesson running.
   */
  lesson?: { id: Unlock; step: number } | null;
  /** Lessons finished or skipped (absent in older saves: none). */
  lessonsDone?: string[];
}

// ---- Forecasts ------------------------------------------------------------

/** One colour class of a lamb forecast (core/forecast.ts): a colour name at an intensity band, or white. */
export interface LambSwatch {
  /** Class key: "snow-white", "pink:soft", "oatmeal". */
  key: string;
  /** Display words: "soft pink", "snow-white". */
  word: string;
  /** Colour name (family, pastel name, slate, olive, gold or snow-white). */
  name: string;
  family: string;
  /** The class's shade, from its most likely member. */
  hex: string;
  /** Chance one lamb is in this class. */
  p: number;
  /** White on top: the colour underneath is unknown. */
  hidden: boolean;
  trueBlue: boolean;
  /** "soft" | "bright" | "vivid" | "none". */
  band: string;
  intensity: number;
}

export interface CrossForecast {
  /** Chance per colour class key (see `swatches`). */
  colour: Record<string, number>;
  /** Colour classes, most likely first (the swatch litter is `litterOf(swatches)`). */
  swatches: LambSwatch[];
  /** Chance per colour family ("white", "red", "blue", "oatmeal"…). */
  families: Record<string, number>;
  /** Chance a lamb is white (colour hidden underneath). */
  white: number;
  /** Chance a lamb is true blue (family blue, vivid, not pale). */
  trueBlue: number;
  /** Chance a lamb is any vivid colour. */
  vivid: number;
  /** Colour strength forecast (from sheep that show colour). */
  depth: QuantForecast;
  horns: Record<string, number>;
  /** Spots show only on coloured lambs: `spotted` is the chance a lamb shows spots. */
  pattern: Record<string, number>;
  learnBits: number;
  fineness: QuantForecast;
  fleeceWeight: QuantForecast;
  relatedness: number;
  inbreeding: number;
  /** Short warm sentence about the chance of a true blue lamb. */
  blueText: string;
  /** The litter's colours in words ("Most lambs snow-white, about one in five bright red."). */
  colourText: string;
  /** Short sentence about what the cross would teach. */
  learnText: string;
}

export interface SeasonReport {
  /** The season that has just begun (state.season after the advance). */
  season: number;
  /** The season that was lived through. */
  endedSeason: number;
  lambs: Sheep[];
  income: number;
  /** Part of `income` that came from the shearing shed. */
  shedBonus: number;
  /** Part of `income` that came from happy (or was lost to skittish) sheep: fondness. Can be negative. */
  fondBonus: number;
  /** Mice in the barn this season (null when none came). */
  mice: MiceReport | null;
  feed: number;
  deaths: Sheep[];
  /** Sheep the trader took because feed could not be paid or the flock was over its cap. */
  autoSold: { id: string; name: string; price: number; reason: "feed" | "room" }[];
  discoveries: Discovery[];
  orderResults: OrderResult[];
  newOrders: Order[];
  fairResult: FairResult | null;
  event: EventRecord | null;
  /** Newly announced event for the coming season, if any. */
  announced: PendingEvent | null;
  /** True when mice were announced for the coming season. */
  miceComing: boolean;
  actAdvanced: ActInfo | null;
  /** The concept that opened up this season (at most one; core/pacing.ts), or null. Absent in old reports. */
  unlocked?: Unlock | null;
  /** True if the act-4 registry goal was reached this season. */
  endingReached: boolean;
  messages: string[];
  /** What the player saw before sleeping, keyed by ewe id. */
  forecastsSeen: Record<string, CrossForecast>;
  /** Mating actually resolved, keyed by ewe id -> ram id. */
  matings: Record<string, string>;
}
