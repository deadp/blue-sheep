/** Every balance number in one place, so the oracle scripts can tune them. */
import type { BreedId } from "@blue-sheep/genetics";
import type { ActNumber, DogId, FairCategory, PetId, SheepOrigin, Unlock, UpgradeId } from "./types.js";

export const SEASONS = ["Spring", "Summer", "Autumn", "Winter"] as const;
export const ADULT_AGE = 2; // seasons
export const EWE_BREED_MAX_AGE = 20; // ewes may be mated while younger than this
export const MAX_AGE = 24; // death at this age
export const RAM_CAPACITY = 4; // ewes one ram can serve per season

export const START_MONEY = 50;
export const FEED_COST = 2; // per sheep per season in year 1
/** Hay gets dearer from year 2: +FEED_GROWTH coins a head per year after the first, up to FEED_MAX. */
export const FEED_GROWTH = 0.5;
export const FEED_MAX = 6;
export const MARKET_SIZE = 3;
/** In the first year the market is quieter: one ewe and one ram, so a new farmer isn't flooded. */
export const MARKET_SIZE_YEAR1 = 2;

/* Wool price per kg and breeding value by colour: core/colour.ts (`woolPricePerKg`, `colourValue`). */
export const SHEEP_BASE_PRICE = 12;
/**
 * Blue "+" frequency at both blue genes for Farm sheep at the market (the breed's own is 0.10). A small tilt
 * so a farm that buys in can find blue paint; tuned with scripts/blind.ts (DESIGN-v3 §15 item 19).
 */
export const MARKET_BLUE_FREQ = 0.15;
/**
 * Market stock by breed (DESIGN-v3 §3.2, §15 item 19): the first act each breed can be offered, and its price
 * multiplier. Farm and Corriedale from the start, Romney and Perendale from act 1, Merino from act 2, Drysdale
 * from act 3. Icelandic is a reward: it only arrives once the first fair is won (act 4, "Your own breed"),
 * after the player has learned colour breeding, and then one Icelandic ewe is always among the stock.
 */
export const BREED_STOCK: Record<BreedId, { minAct: number; price: number }> = {
  farm: { minAct: 0, price: 1.0 }, corriedale: { minAct: 0, price: 1.2 }, romney: { minAct: 1, price: 1.3 },
  perendale: { minAct: 1, price: 1.2 }, merino: { minAct: 2, price: 1.5 }, drysdale: { minAct: 3, price: 1.6 },
  icelandic: { minAct: 4, price: 1.8 },
};
/** The act whose start brings Icelandic sheep to the market (the reward for winning the first fair). */
export const ICELANDIC_ACT = 4;

/** The Farm breed's average fibre diameter (µm): prices, the fair and words are measured from here. */
export const FINE_REF = 30;
/** Lambs (not yet adult) sell for this fraction of an adult's value. */
export const LAMB_PRICE_FACTOR = 0.5;
/** The trader pays this share of a sheep's market worth in year 1, a little less each year after, down to the minimum… */
export const SELL_FACTOR = 1;
export const SELL_DECAY = 0.08;
export const SELL_FACTOR_MIN = 0.5;
/** …and asks this multiple of it. */
export const BUY_MARKUP = 1.8;

export const VET_FEE = 12;
export const VISITOR_FEE = 25;
/** Vet tests: hidden colour, one pigment colour (both its genes), pale, spots, horns. */
export const TEST_LOCI = ["W", "red", "yellow", "blue", "Dl", "S", "P"] as const;

// Farm improvements: one-time purchases at the market.
export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  price: number;
  /** Earliest act (core index) it can be bought in. */
  minAct: number;
  /** The paced concept (core/pacing.ts) that brings it to the market. */
  unlock: Unlock;
  /** Must own this one first. */
  requires: UpgradeId | null;
  /** Flock cap added on purchase. */
  cap: number;
  /** One plain sentence: what it does. */
  blurb: string;
  /** Said when it is bought. */
  done: string;
}
export const UPGRADES: UpgradeDef[] = [
  { id: "paddock", name: "Open the far paddock", icon: "🌿", price: 120, minAct: 0, unlock: "farm", requires: null, cap: 4, blurb: "Mend the fence on the second paddock: room for four more sheep.", done: "The far paddock is open — room for four more sheep." },
  { id: "terrier", name: "Pip, a yappy terrier", icon: "🐕", price: 40, minAct: 0, unlock: "dogs", requires: null, cap: 0, blurb: "Small, scruffy and very loud. Her barking scares a fox off some of the time, but a wolf just laughs.", done: "Pip the terrier has arrived. Yap yap yap!" },
  { id: "collie", name: "Bess, a border collie", icon: "🐕", price: 90, minAct: 0, unlock: "dogs", requires: null, cap: 0, blurb: "Herds the lambs in close at night. Good against foxes, a little help against a wolf.", done: "Meet Bess, your border collie. Foxes, beware!" },
  { id: "maremma", name: "Samson, a Maremma guardian dog", icon: "🐕‍🦺", price: 180, minAct: 2, unlock: "dogs", requires: null, cap: 0, blurb: "A big white guardian who lives with the flock. Stands up to foxes and wolves alike.", done: "Samson the Maremma has moved in with the flock. Nothing gets past him." },
  { id: "cat", name: "Mog, a farm cat", icon: "🐈", price: 45, minAct: 1, unlock: "cat", requires: null, cap: 0, blurb: "Naps on the barn roof and catches mice, so they can't spoil the wool or eat the hay.", done: "Mog the cat has taken up residence on the barn roof." },
  { id: "barn", name: "A snug barn", icon: "🛖", price: 110, minAct: 0, unlock: "farm", requires: null, cap: 0, blurb: "Draught-proof the barn, so no sheep falls ill in a hard winter.", done: "The barn is snug and ready for winter." },
  { id: "shearing", name: "A shearing shed", icon: "✂️", price: 220, minAct: 1, unlock: "farm", requires: null, cap: 0, blurb: "Cleaner, better-sorted fleeces: all wool fetches a quarter more.", done: "The shearing shed is built. Your wool will fetch more." },
  { id: "meadow", name: "Rent the long meadow", icon: "🌾", price: 300, minAct: 3, unlock: "farm", requires: "paddock", cap: 6, blurb: "Graze the meadow by the river: room for six more sheep.", done: "The long meadow is yours to graze — room for six more sheep." },
];

// ---- Farm animals: dogs and the cat ----------------------------------------

export const PET_IDS: PetId[] = ["terrier", "collie", "maremma", "cat"];
export const DOG_IDS: DogId[] = ["terrier", "collie", "maremma"];
/** Short names used in sentences. */
export const PET_NAME: Record<PetId, string> = { terrier: "Pip", collie: "Bess", maremma: "Samson", cat: "Mog" };
export const PET_KIND: Record<PetId, string> = { terrier: "terrier", collie: "border collie", maremma: "Maremma", cat: "farm cat" };
export const PET_SEX: Record<PetId, "she" | "he"> = { terrier: "she", collie: "she", maremma: "he", cat: "he" };

/**
 * Chance each dog sees a predator off before it reaches the lambs (at full fondness; see DOG_FOND_FLOOR).
 * Several dogs keep watch together: the lambs are safe unless every dog misses.
 */
export const DOG_GUARD: Record<DogId, { fox: number; wolf: number }> = {
  terrier: { fox: 0.5, wolf: 0 },
  collie: { fox: 0.9, wolf: 0.3 },
  maremma: { fox: 0.95, wolf: 0.9 },
};
/** Coins of food each farm animal eats a season (added to the feed bill). */
export const PET_FEED: Record<PetId, number> = { terrier: 1, collie: 2, maremma: 3, cat: 1 };
/** A dog guards at this share of its best when it barely knows you, rising to 1 when devoted. */
export const DOG_FOND_FLOOR = 0.9;
/** Wolves come down from the hills in winters from this act (core index) on. */
export const WOLF_MIN_ACT = 2;

// ---- Mice ------------------------------------------------------------------

/** Chance, each season from act 1, that mice are announced for the next season (not while some are due). */
export const MICE_CHANCE = 0.25;
/** Share of the season's wool clip mice spoil. */
export const MICE_WOOL = 0.2;
/** Extra coins of hay a head mice eat. */
export const MICE_FEED = 1;
/** Share of the mice the cat catches when it barely knows you, rising to 1 when devoted. */
export const CAT_CATCH_FLOOR = 0.75;

// ---- Fondness ----------------------------------------------------------------

/** Fondness an animal starts with, by where it came from. Farm-born lambs: FOND_LAMB_BASE + a share of the dam's. */
export const FOND_START: Record<SheepOrigin, number> = { founder: 30, market: 10, visitor: 10, bred: 40 };
export const FOND_LAMB_BASE = 40;
export const FOND_LAMB_FROM_DAM = 0.3;
/** A new dog or cat. */
export const FOND_PET_START = 20;
/** Greeting (opening its card), once a season. */
export const FOND_GREET = 8;
/** Brushing (press and hold the live portrait; a pat for a dog or the cat), once a season. */
export const FOND_BRUSH = 6;
/** A treat, once a season, for TREAT_COST coins. */
export const FOND_TREAT = 15;
export const TREAT_COST = 1;
/** Ignored for more than FOND_GRACE seasons: loses FOND_DECAY a season. */
export const FOND_GRACE = 2;
export const FOND_DECAY = 4;
/** Wool: from FOND_WOOL_FROM up to 100 the fleece fetches up to FOND_WOOL_MAX more (+15 %); below FOND_WOOL_LOW_FROM, up to FOND_WOOL_LOW less. */
export const FOND_WOOL_FROM = 40;
export const FOND_WOOL_MAX = 0.15;
export const FOND_WOOL_LOW_FROM = 20;
export const FOND_WOOL_LOW = 0.08;
/** Words for fondness, lowest first; each covers 20 points. */
export const FOND_WORDS = ["Skittish", "Wary", "Friendly", "Fond of you", "Devoted"] as const;
/** Wool price multiplier with the shearing shed. */
export const SHEARING_BONUS = 1.25;

// Orders
export const MAX_OPEN_ORDERS = 3; // visible on the board (offered + accepted)
export const MAX_ACCEPTED_ORDERS = 2;
/**
 * Gentle start: the board shows at most ORDER_BOARD_RAMP[n] letters once n orders have been filled
 * (1 until the first is filled, 2 until the third, then MAX_OPEN_ORDERS).
 */
export const ORDER_BOARD_RAMP = [1, 2, 2, 3] as const;
export const ORDER_OFFER_SEASONS = 2; // an offer stays up this long
export const ORDER_MIN_PFILL = 0.3; // only post orders the player could plausibly fill
export const ORDER_FAIL_REPUTATION = 1;
/** Rewards grow 5% per reputation point, up to this many points. */
export const ORDER_REP_BONUS_CAP = 6;

// Fair
export const FAIR_SEASON = 2; // autumn
export const FAIR_CATEGORIES: FairCategory[] = ["fine", "heavy", "rare", "big"];
export const FAIR_LABEL: Record<FairCategory, string> = {
  fine: "Finest wool", heavy: "Heaviest fleece", rare: "Most vivid colour", big: "Biggest sheep",
};
export const FAIR_RIVALS = 4;
export const FAIR_JUDGE_SD = 0.5;
export const FAIR_FIELD_SD = 1.0;
export const FAIR_FIELD_BASE = 1.1;
export const FAIR_FIELD_GROWTH = 0.05; // per year
export const FAIR_FIELD_MAX = 1.8;
export const FAIR_PRIZES = [30, 15, 8];

// Events
export const FOX_GUARD_BOLDNESS = 7;

// Acts
export interface ActDef {
  act: ActNumber;
  title: string;
  line: string;
  goalText: string;
  /**
   * Concepts that become available during this act. In play they arrive one at a time on the pacing
   * calendar (core/pacing.ts); only the debug fast-forward (`?act=N`) grants them all at once.
   */
  unlocks: Unlock[];
  flockCap: number;
}

export const ACTS: ActDef[] = [
  {
    act: 0, title: "The old farm", line: "The old farm is yours. Let's see what the flock gives us.",
    goalText: "Plan a mating, then see your first lambs next season.", unlocks: [], flockCap: 10,
  },
  {
    act: 1, title: "Hidden colours", line: "Hidden colours! Breed me a true blue sheep.",
    goalText: "Breed a true blue lamb.", unlocks: ["cards", "orders", "vet", "farm", "dogs", "cat"], flockCap: 10,
  },
  {
    act: 2, title: "The wool buyer", line: "I pay for fineness.",
    goalText: "Fill three villager orders.", unlocks: ["numbers", "fair"], flockCap: 12,
  },
  {
    act: 3, title: "Fresh blood", line: "Blood too close. Bring in fresh rams.",
    goalText: "Win first place at the village fair.", unlocks: ["tree", "visitor"], flockCap: 16,
  },
  {
    act: 4, title: "Your own breed", line: "Found your own breed.",
    goalText: "Keep six blue sheep with fine wool (flock average 28 µm or finer) that are not too closely related.",
    unlocks: [], flockCap: 24,
  },
];

export const REGISTRY_BLUES = 6;
export const REGISTRY_MICRONS = 28;
export const REGISTRY_MAX_INBREEDING = 0.125;
export const ORDERS_FOR_ACT2 = 3;
/** Orders filled before act 2 that count toward it (at most). */
export const ORDERS_CARRIED = 2;
