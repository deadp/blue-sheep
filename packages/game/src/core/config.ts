/** Every balance number in one place, so the oracle scripts can tune them. */
import type { ActNumber, FairCategory, Unlock } from "./types.js";

export const SEASONS = ["Spring", "Summer", "Autumn", "Winter"] as const;
export const ADULT_AGE = 2; // seasons
export const EWE_BREED_MAX_AGE = 20; // ewes may be mated while younger than this
export const MAX_AGE = 24; // death at this age
export const RAM_CAPACITY = 4; // ewes one ram can serve per season

export const START_MONEY = 50;
export const FEED_COST = 2; // per sheep per season
export const MARKET_SIZE = 3;

/** Wool price per kg by colour; blue is the prize. */
export const WOOL_PRICE: Record<string, number> = { white: 0.8, black: 1.2, brown: 1.2, fawn: 1.8, blue: 2.4 };
/** Breeding value on the market by colour (added to a base price). */
export const COLOUR_VALUE: Record<string, number> = { white: 0, black: 6, brown: 6, fawn: 14, blue: 30 };
export const SHEEP_BASE_PRICE = 12;
/** Lambs (not yet adult) sell for this fraction of an adult's value. */
export const LAMB_PRICE_FACTOR = 0.5;
export const BUY_MARKUP = 1.8;

export const VET_FEE = 12;
export const VISITOR_FEE = 25;
export const TEST_LOCI = ["A", "B", "D", "S", "P"] as const;

// Orders
export const MAX_OPEN_ORDERS = 3; // visible on the board (offered + accepted)
export const MAX_ACCEPTED_ORDERS = 2;
export const ORDER_OFFER_SEASONS = 2; // an offer stays up this long
export const ORDER_MIN_PFILL = 0.3; // only post orders the player could plausibly fill
export const ORDER_FAIL_REPUTATION = 1;

// Fair
export const FAIR_SEASON = 2; // autumn
export const FAIR_CATEGORIES: FairCategory[] = ["fine", "heavy", "rare", "big"];
export const FAIR_LABEL: Record<FairCategory, string> = {
  fine: "Finest wool", heavy: "Heaviest fleece", rare: "Rarest colour", big: "Biggest sheep",
};
export const FAIR_RIVALS = 4;
export const FAIR_JUDGE_SD = 0.5;
export const FAIR_FIELD_SD = 1.0;
export const FAIR_FIELD_BASE = 1.1;
export const FAIR_FIELD_GROWTH = 0.05; // per year
export const FAIR_FIELD_MAX = 1.8;
export const FAIR_PRIZES = [30, 15, 8];
export const RARITY: Record<string, number> = { white: 0, black: 0.8, brown: 1.2, fawn: 2.2, blue: 3.0 };

// Events
export const FOX_GUARD_BOLDNESS = 7;

// Acts
export interface ActDef {
  act: ActNumber;
  title: string;
  line: string;
  goalText: string;
  unlocks: Unlock[];
  flockCap: number;
}

export const ACTS: ActDef[] = [
  {
    act: 0, title: "The old farm", line: "The old farm is yours. Let's see what the flock gives us.",
    goalText: "Plan a mating and sleep to see your first lambs.", unlocks: [], flockCap: 10,
  },
  {
    act: 1, title: "Hidden colours", line: "Hidden colours! Breed me a blue sheep.",
    goalText: "Breed a blue lamb.", unlocks: ["cards", "vet", "orders"], flockCap: 10,
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
    goalText: "Keep six blue sheep with fine wool (flock average 24 µm or finer) that are not too closely related.",
    unlocks: [], flockCap: 24,
  },
];

export const REGISTRY_BLUES = 6;
export const REGISTRY_MICRONS = 24;
export const REGISTRY_MAX_INBREEDING = 0.125;
export const ORDERS_FOR_ACT2 = 3;
