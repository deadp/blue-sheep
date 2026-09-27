/**
 * Gentle pacing: new concepts open up one at a time, in a fixed order, each only once the one before has been
 * used (or, so nobody gets stuck, PACE_WAIT seasons after it arrived). At most one concept arrives per season,
 * always at the start of a season (checked at the end of `advanceSeason`), and the season report introduces it.
 *
 * The ladder:
 *   1. cards    the codex and discovery cards: once the first lamb is born (the tutorial's surprise lamb).
 *   2. orders   letters in the mailbox: once the tutorial is over, the season after the cards.
 *   3. vet      the vet's tests: once an order has been taken.
 *   4. farm     farm improvements at the market, and winter weather (hard winters, wool booms).
 *   5. dogs     dogs at the market, and foxes in winter.
 *   6. cat      the farm cat, and mice in the barn.
 *   7. numbers  percentages and ranges: from act 2 (the first blue lamb).
 *   8. fair     the village fair: act 2, after the numbers.
 *   9. tree     the family tree: act 3.
 *  10. visitor  visiting rams: act 3, after the tree.
 * Numbers, fair, tree and visitor are story concepts: once their act has begun they jump ahead of any early
 * concept still waiting (farm, dogs, cat), because that act's goal needs them, and they don't wait for the one
 * before to be used (the new act has earned them); they still arrive one a season.
 * Acts still set goals; the debug fast-forward (`?act=N`, `enterAct(…, { grant: true })`) grants everything
 * up to that act at once.
 */
import { PACE_WAIT } from "./config.js";
import { addLog, fairCategoryFor, nextFairSeason } from "./state.js";
import { tutorialActive } from "./tutorial.js";
import type { GameState, Unlock, UpgradeId } from "./types.js";

export interface PaceStep {
  id: Unlock;
  /** Its own trigger (besides the one-at-a-time rule). */
  ready: (s: GameState) => boolean;
  /** Has the player used it? Until then the next concept waits (at most PACE_WAIT seasons). */
  used: (s: GameState) => boolean;
  /** Old Tom's one-line introduction, shown in the season report when it arrives. */
  intro: string;
  /**
   * Story concepts belong to an act (its goal needs them): once that act has begun they go to the front of
   * the queue, ahead of any early concept still waiting. Still one a season, after the last one was used.
   */
  act?: number;
}

const owns = (s: GameState, ids: UpgradeId[]) => (s.upgrades ?? []).some((u) => ids.includes(u));

export const PACING: readonly PaceStep[] = [
  {
    id: "cards", ready: (s) => s.stats.lambsBorn > 0 || s.discoveries.length > 0, used: () => true,
    intro: "Every clue your lambs give you becomes a discovery card. Open the codex (📖) to look back at them.",
  },
  {
    id: "orders", ready: (s) => !tutorialActive(s),
    used: (s) => s.acceptedOrders.length > 0 || s.stats.ordersFilled > 0 || s.stats.ordersFailed > 0 || s.orderHistory.some((o) => o.status !== "expired"),
    intro: "Word of your flock is getting round the village. Letters with orders will turn up in the mailbox (📮) — take one on if you think your flock can manage it.",
  },
  {
    id: "vet", ready: () => true, used: (s) => Object.values(s.sheep).some((x) => Object.keys(x.tested).length > 0),
    intro: "The vet's hut is open. For a fee the vet can test one sheep for one hidden copy — handy when you only suspect it.",
  },
  {
    id: "farm", ready: () => true, used: (s) => owns(s, ["paddock", "barn", "shearing", "meadow"]),
    intro: "Winter's never far off. The market now sells farm improvements: a snug barn, a mended paddock and more. The old folk will warn you a season ahead when the weather turns.",
  },
  {
    id: "dogs", ready: () => true, used: (s) => owns(s, ["terrier", "collie", "maremma"]),
    intro: "Foxes have been seen in the valley. A good dog keeps them off the lambs — you'll find dogs at the market now.",
  },
  {
    id: "cat", ready: () => true, used: (s) => owns(s, ["cat"]),
    intro: "Mice have found the barn. A farm cat keeps them out of the wool and the hay — Mog is waiting at the market.",
  },
  {
    id: "numbers", act: 2, ready: (s) => s.act >= 2, used: () => true,
    intro: "You've a head for this now: forecasts show real percentages and ranges from here on.",
  },
  {
    id: "fair", act: 2, ready: (s) => s.act >= 2, used: (s) => s.fair.history.some((f) => f.entry !== null) || s.fair.entry !== null,
    intro: "The village fair comes round every autumn. Enter your best sheep for a prize — the board says what this year's judges want.",
  },
  {
    id: "tree", act: 3, ready: (s) => s.act >= 3, used: () => true,
    intro: "I found the old family book in the attic: open any sheep's family tree to see who's kin to whom.",
  },
  {
    id: "visitor", act: 3, ready: (s) => s.act >= 3, used: () => true,
    intro: "Each spring a ram from over the hills can be hired for a season: fresh blood, but nothing known about him.",
  },
];

export function paceStep(id: Unlock): PaceStep | undefined {
  return PACING.find((p) => p.id === id);
}

/** The season a concept arrived (-99 for concepts unlocked before pacing existed), or null if not yet. */
export function unlockedAt(state: GameState, id: Unlock): number | null {
  if (!state.unlocks.includes(id)) return null;
  return state.paced?.[id] ?? -99;
}

/** The most recently arrived paced concept and its season, or null before the first. */
export function latestUnlock(state: GameState): { id: Unlock; season: number } | null {
  let best: { id: Unlock; season: number } | null = null;
  for (const p of PACING) {
    const at = unlockedAt(state, p.id);
    if (at !== null && (!best || at >= best.season)) best = { id: p.id, season: at };
  }
  return best;
}

/** The concept that would arrive next if its turn came now, or null (nothing is due). */
export function nextUnlock(state: GameState): Unlock | null {
  // In ladder order: the first concept not yet arrived, once its own trigger holds; a story concept whose act
  // has begun goes first (the act's goal needs it).
  const pending = PACING.filter((p) => !state.unlocks.includes(p.id));
  const story = pending.find((p) => p.act !== undefined && state.act >= p.act);
  const next = story ?? pending[0];
  if (!next || !next.ready(state)) return null;
  const last = latestUnlock(state);
  if (last) {
    if (last.season >= state.season) return null; // one a season
    // Each waits for the one before to be used (or PACE_WAIT seasons) — except a story concept, which the new
    // act itself has earned: it only keeps to one a season.
    const step = paceStep(last.id)!;
    if (!story && !step.used(state) && state.season - last.season < PACE_WAIT) return null;
  }
  return next.id;
}

/** Open a concept now (records the season; the fair gets its first date). */
export function grantUnlock(state: GameState, id: Unlock): void {
  if (state.unlocks.includes(id)) return;
  state.unlocks.push(id);
  state.paced = { ...(state.paced ?? {}), [id]: state.season };
  if (id === "fair") {
    // A season's notice: the first fair is the next autumn after this season.
    state.fair.nextSeason = nextFairSeason(state.season + 1);
    state.fair.category = fairCategoryFor(state.fair.nextSeason);
    state.fair.entry = null;
  }
}

/** Called once as each season begins: at most one concept arrives. Returns it, or null. */
export function checkPacing(state: GameState): Unlock | null {
  const id = nextUnlock(state);
  if (!id) return null;
  grantUnlock(state, id);
  addLog(state, `Old Tom: “${paceStep(id)!.intro}”`);
  return id;
}
