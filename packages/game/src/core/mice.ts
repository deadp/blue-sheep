/**
 * Mice in the barn: once the cat concept has arrived (core/pacing.ts), some seasons are announced a season ahead as mouse seasons. When they come,
 * mice spoil part of the wool clip (MICE_WOOL) and eat hay (MICE_FEED coins a head). The farm cat catches
 * most of them (CAT_CATCH_FLOOR, rising to all of them when the cat is devoted to you).
 */
import type { Rng } from "@blue-sheep/genetics";
import { MICE_CHANCE, MICE_FEED, MICE_WOOL, PET_NAME } from "./config.js";
import { ownedPets, petEffort } from "./care.js";
import { addLog, seasonLabel } from "./state.js";
import type { GameState, MiceReport } from "./types.js";

export const MICE_ANNOUNCE = "Mice have moved into the barn. Next season they'll nibble the stored wool and the hay — unless a cat is about.";

export function hasCat(state: GameState): boolean {
  return ownedPets(state).includes("cat");
}

/** Share of the mice the cat catches (0 without a cat). */
export function catCatch(state: GameState, withCat = hasCat(state)): number {
  return withCat ? petEffort(state, "cat") : 0;
}

/** Are mice due this season? */
export function miceNow(state: GameState): boolean {
  return state.mice === state.season;
}

/** Called as a new season begins: maybe announce mice for the season after. Returns true if announced. */
export function announceMice(state: GameState, rng: Rng): boolean {
  if (state.mice !== undefined && state.mice !== null && state.mice < state.season) state.mice = null;
  if (state.act < 1 || !state.unlocks.includes("cat") || (state.mice ?? null) !== null) return false;
  if (!rng.chance(MICE_CHANCE)) return false;
  state.mice = state.season + 1;
  addLog(state, MICE_ANNOUNCE);
  return true;
}

/** What a mouse season costs: wool spoiled out of `clip` coins and extra hay for `eaters` sheep. */
export function miceCost(state: GameState, clip: number, eaters: number, withCat = hasCat(state)): { wool: number; feed: number } {
  const left = 1 - catCatch(state, withCat);
  return { wool: Math.round(clip * MICE_WOOL * left), feed: Math.round(eaters * MICE_FEED * left) };
}

/** Resolve this season's mice (if due): returns the report; the caller takes the coins. */
export function applyMice(state: GameState, clip: number, eaters: number): MiceReport | null {
  if (!miceNow(state)) return null;
  state.mice = null;
  const cat = hasCat(state);
  const cost = miceCost(state, clip, eaters, cat);
  const bare = miceCost(state, clip, eaters, false);
  const lost = cost.wool + cost.feed;
  const text = !cat
    ? `Mice got into the barn: they spoiled ${cost.wool} coins of wool and ate ${cost.feed} coins of hay. A cat would have caught most of them.`
    : lost === 0
      ? `Mice got into the barn, but ${PET_NAME.cat} caught every one of them.`
      : `Mice got into the barn. ${PET_NAME.cat} caught most of them — only ${lost} coin${lost === 1 ? "" : "s"} of wool and hay lost instead of about ${bare.wool + bare.feed}.`;
  addLog(state, text);
  return { wool: cost.wool, feed: cost.feed, without: bare.wool + bare.feed, cat, text };
}

/** Sentence for the board's "coming up" list. */
export function miceComingText(state: GameState): string | null {
  if (state.mice === null || state.mice === undefined || state.mice < state.season) return null;
  const when = state.mice === state.season ? "this season" : `in ${seasonLabel(state.mice)}`;
  return `Mice are in the barn ${when}.${hasCat(state) ? ` ${PET_NAME.cat} is on the prowl.` : " A cat would catch most of them."}`;
}
