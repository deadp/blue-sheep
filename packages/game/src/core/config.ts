/** Every balance number in one place, so the oracle scripts can tune them. */
import type { BreedId } from "@blue-sheep/genetics";
import type { ItemId } from "./wool.js";
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
  farm: { minAct: 0, price: 1.0 }, corriedale: { minAct: 0, price: 1.2 }, romney: { minAct: 1, price: 1.2 },
  perendale: { minAct: 1, price: 1.1 }, merino: { minAct: 2, price: 1.6 }, drysdale: { minAct: 3, price: 1.4 },
  icelandic: { minAct: 4, price: 2.0 },
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
  /** "craft": a woolshed bench or store upgrade, bought in the woolshed rather than at the market. */
  group?: "craft";
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
  // The woolshed (core/craft.ts): bench upgrades and the wool press, bought from the woolshed panel.
  { id: "drumCarder", name: "A drum carder", icon: "🧶", price: 60, minAct: 0, unlock: "craft", requires: null, cap: 0, group: "craft", blurb: "Cards six kilos of wool a season instead of two.", done: "The drum carder is bolted to the bench." },
  { id: "millShare", name: "A share in the carding mill", icon: "🏭", price: 200, minAct: 2, unlock: "craft", requires: "drumCarder", cap: 0, group: "craft", blurb: "The mill cards fifteen kilos a season for you.", done: "The mill will card for you now." },
  { id: "wheel", name: "A spinning wheel", icon: "🎡", price: 80, minAct: 0, unlock: "craft", requires: null, cap: 0, group: "craft", blurb: "Spins three kilos of yarn a season instead of one.", done: "The spinning wheel hums in the corner." },
  { id: "wheel2", name: "A second wheel", icon: "🎡", price: 180, minAct: 2, unlock: "craft", requires: "wheel", cap: 0, group: "craft", blurb: "Spins six kilos a season.", done: "Two wheels, twice the yarn." },
  { id: "circle", name: "A knitting circle", icon: "🧦", price: 40, minAct: 0, unlock: "craft", requires: null, cap: 0, group: "craft", blurb: "Friends to knit alongside: twice the knitting each season.", done: "The knitting circle meets on Thursdays." },
  { id: "knitHall", name: "The village knitting hall", icon: "🏠", price: 150, minAct: 2, unlock: "craft", requires: "circle", cap: 0, group: "craft", blurb: "A whole hall of knitters: three times the knitting.", done: "The hall is full of clicking needles." },
  { id: "tableLoom", name: "A table loom", icon: "🪡", price: 120, minAct: 1, unlock: "craft", requires: null, cap: 0, group: "craft", blurb: "Opens weaving: bush shirts and rugs.", done: "The table loom is warped and ready." },
  { id: "floorLoom", name: "A floor loom", icon: "🪡", price: 300, minAct: 3, unlock: "craft", requires: "tableLoom", cap: 0, group: "craft", blurb: "Weaves more than twice as much a season.", done: "The big floor loom takes up half the shed." },
  { id: "feltTable", name: "A felting table", icon: "🫧", price: 30, minAct: 0, unlock: "craft", requires: null, cap: 0, group: "craft", blurb: "Opens felting: dryer balls and tea cosies.", done: "A wet, soapy table for felting." },
  { id: "feltSink", name: "A felting sink", icon: "🚰", price: 70, minAct: 0, unlock: "craft", requires: "feltTable", cap: 0, group: "craft", blurb: "Twice the felting, and slippers come out better.", done: "The felting sink is plumbed in." },
  { id: "press", name: "A wool press", icon: "📦", price: 160, minAct: 2, unlock: "craft", requires: "shearing", cap: 0, group: "craft", blurb: "Packs forty fleeces in the store instead of twenty-four.", done: "The wool press is bolted down: room for forty fleeces." },
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

// ---- The wool store and the demand meters (DESIGN-v3 §5, §7, §15 item 3) ---------------------------------------
/** Shearing seasons of the year: spring (0) and autumn (2). */
export const SHEAR_SEASONS: readonly number[] = [0, 2];
/** A clip holds the wool grown since the last shearing: a sheep's fleece weight (a season's growth) times this. */
export const CLIP_KG = 2;
/** Clean weight = greasy weight x yield, by wool type (skirted and washed on the way into the store). */
export const WASH_YIELD: Record<string, number> = { fine: 0.65, medium: 0.7, strong: 0.75, crossbred: 0.75, lustre: 0.75, carpet: 0.8, lopi: 0.8 };
/** Raw-wool price factor by wool type (medium = 1), on top of colour and fineness. */
export const RAW_TYPE_FACTOR: Record<string, number> = { fine: 1.15, medium: 1.05, strong: 1, crossbred: 1, lustre: 1.05, carpet: 0.9, lopi: 1.1 };
/** Fleece lots the wool store holds: the start, with the shearing shed. (The wool press holds 40.) */
export const STORE_CAP = 12;
export const STORE_CAP_SHED = 24;
export const STORE_CAP_PRESS = 40;
/** Demand meter range, and the price multiplier m(D) = DEMAND_FLOOR + DEMAND_SLOPE x D (0.4x saturated, 1.0 at rest, 1.3x in a spike). */
export const DEMAND_MAX = 1.5;
export const DEMAND_FLOOR = 0.4;
export const DEMAND_SLOPE = 0.6;
/** Raw wool meters (one per wool type): each greasy kg sold lowers the meter; each season it refills this share of the way to its target. */
export const RAW_STEP = 0.002;
export const RAW_REFILL = 0.5;
/** Item meters (the crafting phases): a unit sold lowers the meter by ITEM_STEP (or its own step); refill up / down per season. */
export const ITEM_STEP = 0.1;
export const ITEM_REFILL_UP = 0.3;
export const ITEM_REFILL_DOWN = 0.25;

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
    goalText: "Breed a true blue lamb.", unlocks: ["cards", "orders", "vet", "craft", "farm", "dogs", "cat"], flockCap: 10,
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
/** How far raw-wool targets swing with the time of year (warm wools up in autumn, fine up in spring). */
export const SEASON_SWING = 0.1;

// ---- The woolshed (DESIGN-v3 §5, §6; core/craft.ts) ---------------------------------------------------------

export type BenchName = "card" | "spin" | "knit" | "weave" | "felt";
/** Capacity per season by tier (index 0 = no bench). Card and spin are kg of fibre; knit, weave and felt are work points. */
export const BENCH_CAP: Record<BenchName, number[]> = {
  card: [2, 2, 6, 15], spin: [1, 1, 3, 6], knit: [4, 4, 8, 14], weave: [0, 4, 10], felt: [0, 4, 8],
};
/** Noise (sd, quality points) at each tier of the bench that finishes the job; each level of hands trims it 8%. */
export const BENCH_SIGMA = [10, 10, 6, 3];
/** Completed jobs needed for each hands level at a bench. */
export const HANDS_AT = [1, 3, 6, 10, 16];
export const HANDS_TRIM = 0.08;
/** Which upgrade lifts which bench to which tier. */
export const BENCH_UPGRADES: { id: UpgradeId; bench: BenchName; tier: number }[] = [
  { id: "drumCarder", bench: "card", tier: 2 }, { id: "millShare", bench: "card", tier: 3 },
  { id: "wheel", bench: "spin", tier: 2 }, { id: "wheel2", bench: "spin", tier: 3 },
  { id: "circle", bench: "knit", tier: 2 }, { id: "knitHall", bench: "knit", tier: 3 },
  { id: "tableLoom", bench: "weave", tier: 1 }, { id: "floorLoom", bench: "weave", tier: 2 },
  { id: "feltTable", bench: "felt", tier: 1 }, { id: "feltSink", bench: "felt", tier: 2 },
];
export const BENCH_LABEL: Record<BenchName, string> = { card: "Carding", spin: "Spinning", knit: "Knitting", weave: "Weaving", felt: "Felting" };
export const MAX_JOBS = 16;
/** Seasons a lot of fibre kg counts as one "batch" for stock jobs. */
export const STOCK_KG = 0.5;
/** Starting gift when the woolshed opens: Old Tom's spare fleece. */
export const GIFT_FLEECE = { kg: 3, microns: 28, staple: 90 };

export interface Recipe {
  id: ItemId;
  name: string;
  /** Clean kg of fibre. */
  kg: number;
  /** The finishing bench and its work points. */
  bench: "knit" | "weave" | "felt";
  work: number;
  /** Ideal fibre diameter (µm): coarser costs quality. */
  micron: number;
  /** Base coins at Q 50 and rest demand (price = base x (0.5 + Q/100) x m(D)). */
  base: number;
  /** Meter drop per item sold. */
  step: number;
  colour: "any" | "natural" | "pastel";
  /** Shortest staple (mm) that is not penalised. */
  minStaple?: number;
  /** Plain line for the pattern card. */
  blurb: string;
}
export const RECIPES: Recipe[] = [
  { id: "socks", name: "Socks", kg: 0.2, bench: "knit", work: 2, micron: 23, base: 38, step: 0.1, colour: "any", blurb: "A warm pair. Soft wool, spun fine." },
  { id: "beanie", name: "Beanie", kg: 0.15, bench: "knit", work: 1, micron: 28, base: 32, step: 0.1, colour: "any", blurb: "Quick to knit, and everyone wants one in winter." },
  { id: "dryerBalls", name: "Dryer balls", kg: 0.2, bench: "felt", work: 0.5, micron: 35, base: 10, step: 0.05, colour: "any", blurb: "Felted balls. Any wool will do." },
  { id: "teaCosy", name: "Tea cosy", kg: 0.2, bench: "felt", work: 1, micron: 30, base: 22, step: 0.12, colour: "any", blurb: "Felted and snug. Sells best in summer, oddly." },
  { id: "gumbootSocks", name: "Gumboot socks", kg: 0.3, bench: "knit", work: 2, micron: 34, base: 24, step: 0.08, colour: "natural", blurb: "Thick and hard-wearing, in natural colours." },
  { id: "mittens", name: "Mittens", kg: 0.15, bench: "knit", work: 1.5, micron: 29, base: 32, step: 0.1, colour: "any", blurb: "A pair for cold hands." },
  { id: "slippers", name: "Felted slippers", kg: 0.35, bench: "felt", work: 2, micron: 28, base: 42, step: 0.12, colour: "any", blurb: "Felted to fit. Takes practice." },
  { id: "scarf", name: "Scarf", kg: 0.3, bench: "knit", work: 2, micron: 25, base: 42, step: 0.1, colour: "any", blurb: "Long and soft." },
  { id: "babyShawl", name: "Baby shawl", kg: 0.4, bench: "knit", work: 4, micron: 19, base: 45, step: 0.2, colour: "pastel", blurb: "Only the finest, palest wool." },
  { id: "lopapeysa", name: "Lopapeysa", kg: 0.8, bench: "knit", work: 8, micron: 30, base: 90, step: 0.25, colour: "any", minStaple: 100, blurb: "The Icelandic yoke jersey. Wants long, double-coated wool." },
  { id: "bushShirt", name: "Bush shirt", kg: 1, bench: "weave", work: 6, micron: 34, base: 80, step: 0.25, colour: "any", blurb: "A tough woven shirt, bush-proof." },
  { id: "rug", name: "Rug", kg: 2.5, bench: "weave", work: 8, micron: 45, base: 105, step: 0.3, colour: "any", minStaple: 120, blurb: "Hearth rug from the coarsest carpet wool." },
];
/** Items seasonal targets: warm things want winter, tea cosies want summer (read by core/demand.ts). */
export const ITEM_WINTER: string[] = ["beanie", "mittens", "gumbootSocks"];
export const ITEM_SWING = 0.2;
