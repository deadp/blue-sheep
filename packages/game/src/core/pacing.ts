/**
 * Gentle pacing on a calendar: new concepts open up one at a time, each "the tutorial way" (a short Old Tom
 * lesson, core/lessons.ts). At most one concept arrives per season, always as a season begins (checked at the
 * end of `advanceSeason`), and the season report introduces it.
 *
 * The calendar (DESIGN-v3 §15.13):
 *   cards    the codex and discovery cards: with the first discovery (the tutorial's horned lamb).
 *   orders   letters in the mailbox: the moment the tutorial ends or is skipped (`tutorialOver`; Year 1),
 *            or with the first season of a game without one (Year 2 Summer at the latest).
 *   vet      the vet's tests:                         Year 2, Spring (season 4).
 *   farm     farm improvements and winter weather:     Year 2, Autumn (season 6).
 *   dogs     dogs at the market, and foxes in winter:  Year 3, Spring (season 8).
 *   cat      the farm cat, and mice in the barn:       Year 3, Autumn (season 10).
 *   numbers  percentages and ranges: from act 2 (the first blue lamb).
 *   fair     the village fair: act 2, after the numbers.
 *   tree     the family tree: act 3.
 *   visitor  visiting rams: act 3, after the tree.
 * A dated concept always takes its own season. The others (cards, orders and the act concepts) arrive in the
 * first free season once they are ready: never in a season a dated concept is due, never two at once; when
 * several wait, they go in the order above. Foxes need the dogs concept (core/events.ts), so no fox ever
 * comes before dogs are on sale. Skip-tutorial games keep the same calendar. The debug fast-forward
 * (`?act=N`, `enterAct(…, { grant: true })`) grants everything up to that act at once, without lessons.
 */
import { generateOrders } from "./orders.js";
import { addLog, fairCategoryFor, nextFairSeason, rngOf, saveRng } from "./state.js";
import { startLesson } from "./lessons.js";
import { tutorialActive } from "./tutorial.js";
import type { GameState, Unlock } from "./types.js";

/** Seasons (0 = Year 1 Spring) the dated concepts arrive. */
export const CALENDAR: Readonly<Partial<Record<Unlock, number>>> = { vet: 4, farm: 6, dogs: 8, cat: 10 };
/** Orders come once the tutorial is over, and by this season at the latest even if it never is (Year 2 Summer). */
export const ORDERS_BY = 5;

export interface PaceStep {
  id: Unlock;
  /** A dated concept: arrives as this season begins (0 = Year 1 Spring). */
  at?: number;
  /** An act concept: ready once this act has begun. */
  act?: number;
  /** Other concepts: ready when this holds. */
  ready?: (s: GameState) => boolean;
  /** Old Tom's one-line introduction, shown in the season report when it arrives. */
  intro: string;
}

export const PACING: readonly PaceStep[] = [
  {
    id: "cards", ready: (s) => s.discoveries.length > 0,
    intro: "Every clue your lambs give you becomes a discovery card. Open the codex (📖) to look back at them.",
  },
  {
    id: "orders", ready: (s) => !tutorialActive(s) || s.season >= ORDERS_BY,
    intro: "Word of your flock is getting round the village. Letters with orders will turn up in the mailbox (📮) — take one on if you think your flock can manage it.",
  },
  {
    id: "vet", at: CALENDAR.vet!,
    intro: "The vet's hut is open. For a fee the vet can test one sheep for one hidden copy — handy when you only suspect it.",
  },
  {
    id: "farm", at: CALENDAR.farm!,
    intro: "Winter's never far off. The market now sells farm improvements: a snug barn, a mended paddock and more. The old folk will warn you a season ahead when the weather turns.",
  },
  {
    id: "dogs", at: CALENDAR.dogs!,
    intro: "Foxes have been seen in the valley. A good dog keeps them off the lambs — you'll find dogs at the market now.",
  },
  {
    id: "cat", at: CALENDAR.cat!,
    intro: "Mice have found the barn. A farm cat keeps them out of the wool and the hay — Mog is waiting at the market.",
  },
  { id: "numbers", act: 2, intro: "You've a head for this now: forecasts show real percentages and ranges from here on." },
  { id: "fair", act: 2, intro: "The village fair comes round every autumn. Enter your best sheep for a prize — the board says what this year's judges want." },
  { id: "tree", act: 3, intro: "I found the old family book in the attic: open any sheep's family tree to see who's kin to whom." },
  { id: "visitor", act: 3, intro: "Each spring a ram from over the hills can be hired for a season: fresh blood, but nothing known about him." },
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

/** Is this (undated) concept's own trigger met? */
function ready(state: GameState, p: PaceStep): boolean {
  if (p.at !== undefined) return state.season >= p.at;
  if (p.act !== undefined) return state.act >= p.act;
  return p.ready ? p.ready(state) : true;
}

/** The concept that would arrive if the season began now, or null (nothing is due). */
export function nextUnlock(state: GameState): Unlock | null {
  const last = latestUnlock(state);
  if (last && last.season >= state.season) return null; // one a season
  const pending = PACING.filter((p) => !state.unlocks.includes(p.id));
  // A dated concept takes its own season (the earliest due, if one was ever held up).
  const dated = pending.filter((p) => p.at !== undefined && state.season >= p.at).sort((a, b) => a.at! - b.at!)[0];
  if (dated) return dated.id;
  // Otherwise the first undated concept that is ready, in calendar order.
  return pending.find((p) => p.at === undefined && ready(state, p))?.id ?? null;
}

/** The next dated concept still to come and its season, for the board ("Coming up"), or null. */
export function nextDated(state: GameState): { id: Unlock; season: number } | null {
  const p = PACING.filter((x) => x.at !== undefined && !state.unlocks.includes(x.id)).sort((a, b) => a.at! - b.at!)[0];
  return p ? { id: p.id, season: Math.max(p.at!, state.season + 1) } : null;
}

/** Open a concept now (records the season; the fair gets its first date). No lesson (see `checkPacing`). */
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

/** Called once as each season begins: at most one concept arrives, with its lesson. Returns it, or null. */
export function checkPacing(state: GameState): Unlock | null {
  const id = nextUnlock(state);
  if (!id) return null;
  grantUnlock(state, id);
  addLog(state, `Old Tom: “${paceStep(id)!.intro}”`);
  startLesson(state, id);
  return id;
}


/**
 * The tutorial has just ended (finished or skipped): the letters arrive at once, mid-season, with the first
 * letter (it asks for horns) and their lesson, unless another concept already arrived this season (then they
 * come as the next season begins). Deterministic: the letter uses the game RNG. Returns what arrived, or null.
 */
export function tutorialOver(state: GameState): Unlock | null {
  if (tutorialActive(state) || nextUnlock(state) !== "orders") return null;
  const id = checkPacing(state);
  const rng = rngOf(state);
  generateOrders(state, rng);
  saveRng(state, rng);
  return id;
}
