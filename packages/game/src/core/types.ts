/** Shared data shapes for the game core. Everything here is plain JSON-serialisable data. */
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
}

export interface Pairing { ewe: string; ram: string }

export interface LogEntry { season: number; text: string }

export type Unlock = "numbers" | "vet" | "orders" | "fair" | "tree" | "visitor" | "cards";

export type Locus = "A" | "B" | "D" | "S" | "P";

export interface Discovery {
  id: string;
  season: number;
  sheep: string;
  locus: string;
  /** Plain sentence, e.g. "Clover carries the dilute (blue!) allele." */
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
  /** colour orders: wanted colour. */
  colour: string | null;
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

export type EventKind = "hardWinter" | "fox" | "woolBoom";

export interface PendingEvent {
  kind: EventKind;
  /** The season in which it happens. */
  season: number;
  /** woolBoom: which colour's wool doubles in price. */
  colour: string | null;
  /** Announcement sentence. */
  text: string;
}

export interface EventRecord {
  kind: EventKind;
  season: number;
  colour: string | null;
  /** Sheep affected (ill sheep for hardWinter, lost lamb for fox). */
  sheep: string | null;
  /** fox: true when a guardian scared it off. */
  saved: boolean;
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
  bluesBorn: number;
  coinsEarned: number;
  discoveries: number;
  fairsWon: number;
  ordersFilled: number;
  ordersFailed: number;
}

export interface ActStart { season: number; ordersFilled: number; fairsWon: number }

export interface GameState {
  version: 2;
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
  /** Facts the player has proven: sheep id -> locus -> genotype string (internal; never display). */
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
  /** Legacy v1 notebook/achievements, kept for old saves. */
  achievements: string[];
}

// ---- Forecasts ------------------------------------------------------------

export interface CrossForecast {
  colour: Record<string, number>;
  horns: Record<string, number>;
  pattern: Record<string, number>;
  learnBits: number;
  fineness: QuantForecast;
  fleeceWeight: QuantForecast;
  relatedness: number;
  inbreeding: number;
  /** Short warm sentence about the chance of a blue lamb. */
  blueText: string;
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
  actAdvanced: ActInfo | null;
  /** True if the act-4 registry goal was reached this season. */
  endingReached: boolean;
  messages: string[];
  /** What the player saw before sleeping, keyed by ewe id. */
  forecastsSeen: Record<string, CrossForecast>;
  /** Mating actually resolved, keyed by ewe id -> ram id. */
  matings: Record<string, string>;
}
