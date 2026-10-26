/** Story acts: goals, progress, unlocks and the ending. */
import {
  ACTS, ITEM_TYPES_FOR_CH2, ORDERS_CARRIED, ORDERS_FOR_CH2, REGISTRY_BLUES, REGISTRY_MAX_INBREEDING, REGISTRY_MICRONS,
} from "./config.js";
import { addLog, flockSheep } from "./state.js";
import { woolOf } from "./colour.js";
import { grantUnlock } from "./pacing.js";
import { TUTORIAL_LAMBS, tutorialActive, tutorialLambs } from "./tutorial.js";
import { upgradeCapBonus } from "./upgrades.js";
import type { ActInfo, ActNumber, GameState, Sheep } from "./types.js";
import { numberWord } from "./words.js";

export interface RegistryStatus {
  blues: Sheep[];
  /** The six least-inbred blue sheep (or fewer). */
  best: Sheep[];
  meanFineness: number;
  meanInbreeding: number;
  met: boolean;
}

export function registryStatus(state: GameState): RegistryStatus {
  const flock = flockSheep(state);
  // Blue for the registry: full (not pale) blue wool of any strength; slate and sky don't count.
  const blues = flock.filter((s) => woolOf(s).name === "blue");
  const best = [...blues].sort((a, b) => a.inbreeding - b.inbreeding || Number(a.id.slice(1)) - Number(b.id.slice(1))).slice(0, REGISTRY_BLUES);
  const meanFineness = flock.length ? flock.reduce((t, s) => t + Number(s.phenotype["fineness"]), 0) / flock.length : 99;
  const meanInbreeding = best.length ? best.reduce((t, s) => t + s.inbreeding, 0) / best.length : 0;
  const met = best.length >= REGISTRY_BLUES && meanFineness <= REGISTRY_MICRONS && meanInbreeding < REGISTRY_MAX_INBREEDING;
  return { blues, best, meanFineness, meanInbreeding, met };
}

/**
 * Orders counted toward act 2: up to ORDERS_CARRIED filled before it began (so act-1 orders aren't wasted),
 * plus every order filled since. At least one has to be filled in act 2 itself.
 */
export function act2Orders(state: GameState): number {
  const before = Math.min(ORDERS_CARRIED, state.actStart.ordersFilled);
  return before + state.stats.ordersFilled - state.actStart.ordersFilled;
}

/** Shearings that must be sold for chapter 1. */
const SHEARINGS_FOR_CH1 = 3;
/** Intensity at which a lamb's colour counts as visible (DESIGN-v3 §10.1 ch1). */
const VISIBLE_COLOUR_INTENSITY = 0.3;
/** Show placings that count as a ribbon. */
const RIBBON_PLACE = 3;

/** A bred lamb (not a founder or a bought-in sheep) whose wool shows colour at I >= 0.3. */
function colourLambBred(state: GameState): boolean {
  return Object.values(state.sheep).some((s) => s.dam !== null && s.phenotype["white"] !== "white" && woolOf(s).intensity >= VISIBLE_COLOUR_INTENSITY);
}

/**
 * A ribbon (1st to 3rd) at the show.
 * TODO(Phase 7 part 2, A&P show): stands in for the A&P show; today it is any top-three placing at the village fair.
 */
function ribbonWon(state: GameState): boolean {
  return state.fair.history.some((r) => r.place !== null && r.place <= RIBBON_PLACE);
}

function firstWon(state: GameState): boolean {
  return state.stats.fairsWon - state.actStart.fairsWon >= 1;
}

function fantasyFleeceShorn(state: GameState): boolean {
  return state.stats.firstFantasyFleeceSeason !== null;
}

function goalMet(state: GameState, act: ActNumber): boolean {
  switch (act) {
    // In the tutorial the story's first act waits for the coloured lamb (hidden colours!), the third lambing.
    case 0: return state.stats.lambsBorn >= 1 && !(tutorialActive(state) && tutorialLambs(state).length < TUTORIAL_LAMBS.length);
    case 1: return colourLambBred(state) && state.stats.shearingsSold >= SHEARINGS_FOR_CH1;
    case 2: return state.stats.itemTypesSold.length >= ITEM_TYPES_FOR_CH2 && act2Orders(state) >= ORDERS_FOR_CH2;
    case 3: return state.stats.bluesBorn >= 1 && ribbonWon(state);
    case 4: return fantasyFleeceShorn(state) && firstWon(state);
    // TODO(Phase 7 part 2, Golden Fleece): the Golden Fleece class of DESIGN-v3 §10.2; until then the v2 registry goal ends the story.
    case 5: return registryStatus(state).met;
  }
}

/** "Two of three <what>" with a capitalised number word. */
function ofText(n: number, of: number, what: string): string {
  return `${numberWord(n)} of ${numberWord(of)} ${what}`.replace(/^./, (c) => c.toUpperCase());
}

function progressOf(state: GameState, act: ActNumber): { text: string; progress: number } {
  switch (act) {
    case 0: return state.stats.lambsBorn ? { text: "Lambs born!", progress: 1 } : { text: "No lambs yet.", progress: 0 };
    case 1: {
      const colour = colourLambBred(state), clips = Math.min(SHEARINGS_FOR_CH1, state.stats.shearingsSold);
      const text = `${colour ? "A coloured lamb" : "No coloured lamb yet"} · ${ofText(clips, SHEARINGS_FOR_CH1, "shearings sold.")}`;
      return { text, progress: ((colour ? 1 : 0) + clips / SHEARINGS_FOR_CH1) / 2 };
    }
    case 2: {
      const kinds = Math.min(ITEM_TYPES_FOR_CH2, state.stats.itemTypesSold.length), orders = Math.min(ORDERS_FOR_CH2, act2Orders(state));
      const text = `${ofText(kinds, ITEM_TYPES_FOR_CH2, "kinds sold")} · ${ofText(orders, ORDERS_FOR_CH2, "orders filled.")}`;
      return { text, progress: (kinds / ITEM_TYPES_FOR_CH2 + orders / ORDERS_FOR_CH2) / 2 };
    }
    case 3: {
      const blue = state.stats.bluesBorn > 0, ribbon = ribbonWon(state);
      const text = `${blue ? "A true blue sheep" : "No true blue sheep yet"} · ${ribbon ? "a ribbon!" : "no ribbon yet."}`;
      return { text, progress: ((blue ? 1 : 0) + (ribbon ? 1 : 0)) / 2 };
    }
    case 4: {
      const fleece = fantasyFleeceShorn(state), first = firstWon(state);
      const text = `${fleece ? "A fantasy fleece" : "No fantasy fleece yet"} · ${first ? "a first place!" : "no first place yet."}`;
      return { text, progress: ((fleece ? 1 : 0) + (first ? 1 : 0)) / 2 };
    }
    case 5: {
      // TODO(Phase 7 part 2, Golden Fleece): replace with the Golden Fleece checklist; this is the v2 registry progress.
      const r = registryStatus(state);
      const pBlue = Math.min(1, r.best.length / REGISTRY_BLUES);
      const pFine = Math.max(0, Math.min(1, (REGISTRY_MICRONS + 4 - r.meanFineness) / 4));
      const pInb = r.best.length === 0 ? 0 : r.meanInbreeding < REGISTRY_MAX_INBREEDING ? 1 : Math.max(0, 1 - (r.meanInbreeding - REGISTRY_MAX_INBREEDING) / 0.25);
      const kin = r.best.length === 0 ? "" : r.meanInbreeding < REGISTRY_MAX_INBREEDING ? " · bloodlines healthy" : " · bloodlines too close";
      const text = `${r.best.length} of ${REGISTRY_BLUES} blue sheep · flock wool ${r.meanFineness.toFixed(1)} µm (need ${REGISTRY_MICRONS})${kin}`;
      return { text, progress: (pBlue + pFine + pInb) / 3 };
    }
  }
}

export function actInfo(state: GameState, act: ActNumber): ActInfo {
  const def = ACTS[act]!;
  const endless = act === 5 && state.ending !== null;
  const p = endless ? { text: "Your breed is registered. Keep breeding for the joy of it.", progress: 1 } : progressOf(state, act);
  return {
    act, title: endless ? "Endless pastures" : def.title, line: def.line,
    goalText: endless ? "Keep your breed healthy — and see what else turns up." : def.goalText,
    progressText: p.text, progress: p.progress, unlocks: def.unlocks, flockCap: def.flockCap, endless,
  };
}

export function currentAct(state: GameState): ActInfo {
  return actInfo(state, state.act);
}

/** Counters an act's progress is measured from. */
export type ActBaseline = Pick<GameState["stats"], "ordersFilled" | "fairsWon">;

/**
 * Enter the next act if the current goal is met (at most one per season). Returns the new act's info.
 * `baseline` is the stats at the start of the season just played: orders filled and fairs won during the
 * season in which the new act begins count toward its goal (the report shows them next to the new goal).
 */
export function checkActAdvance(state: GameState, baseline?: ActBaseline): ActInfo | null {
  // The v2 registry ending still closes the story, now in ch5 (see goalMet).
  if (state.act >= 5 || !goalMet(state, state.act)) return null;
  const next = (state.act + 1) as ActNumber;
  enterAct(state, next, baseline);
  return currentAct(state);
}

/**
 * Set the act (also used by debug fast-forward). Progress counts from `baseline` (default: now). In play the
 * act's concepts arrive later, one at a time (core/pacing.ts); `grant` (debug fast-forward only) opens every
 * concept up to this act at once.
 */
export function enterAct(state: GameState, act: ActNumber, baseline?: ActBaseline, opts: { grant?: boolean } = {}): void {
  state.act = act;
  const b = baseline ?? state.stats;
  state.actStart = { season: state.season, ordersFilled: b.ordersFilled, fairsWon: b.fairsWon };
  const def = ACTS[act]!;
  if (opts.grant) {
    // The woolshed's arrival turns auto-sell off in play; a fast-forward fixture keeps the setting it had.
    const auto = state.autoSell;
    for (const a of ACTS) if (a.act <= act) for (const u of a.unlocks) grantUnlock(state, u, { fixture: true });
    if (auto === undefined) delete state.autoSell; else state.autoSell = auto;
  }
  state.flockCap = Math.max(state.flockCap, def.flockCap + upgradeCapBonus(state));
  addLog(state, `“${def.line}”`);
}

/** Checks the ch5 registry goal (stand-in for the Golden Fleece); sets `state.ending` the first time. Returns true if reached now. */
export function checkEnding(state: GameState): boolean {
  if (state.act !== 5 || state.ending) return false;
  if (!registryStatus(state).met) return false;
  state.ending = { shown: false, season: state.season };
  addLog(state, "Your blue sheep are registered as a breed of their own. The whole village comes to see.");
  return true;
}

/** Final goal reached and the ending screen not yet shown. */
export function isEnding(state: GameState): boolean {
  return state.ending !== null && !state.ending.shown;
}

export function markEndingShown(state: GameState): void {
  if (state.ending) state.ending.shown = true;
}
