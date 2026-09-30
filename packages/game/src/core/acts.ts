/** Story acts: goals, progress, unlocks and the ending. */
import {
  ACTS, ORDERS_CARRIED, ORDERS_FOR_ACT2, REGISTRY_BLUES, REGISTRY_MAX_INBREEDING, REGISTRY_MICRONS,
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

function goalMet(state: GameState, act: ActNumber): boolean {
  switch (act) {
    // In the tutorial the story's first act waits for the coloured lamb (hidden colours!), the third lambing.
    case 0: return state.stats.lambsBorn >= 1 && !(tutorialActive(state) && tutorialLambs(state).length < TUTORIAL_LAMBS.length);
    case 1: return state.stats.bluesBorn >= 1;
    case 2: return act2Orders(state) >= ORDERS_FOR_ACT2;
    case 3: return state.stats.fairsWon - state.actStart.fairsWon >= 1;
    case 4: return registryStatus(state).met;
  }
}

function progressOf(state: GameState, act: ActNumber): { text: string; progress: number } {
  switch (act) {
    case 0: return state.stats.lambsBorn ? { text: "Lambs born!", progress: 1 } : { text: "No lambs yet.", progress: 0 };
    case 1: return state.stats.bluesBorn ? { text: "A true blue lamb!", progress: 1 } : { text: "No true blue lamb yet.", progress: 0 };
    case 2: {
      const n = Math.min(ORDERS_FOR_ACT2, act2Orders(state));
      return { text: `${numberWord(n)} of ${numberWord(ORDERS_FOR_ACT2)} orders filled.`.replace(/^./, (c) => c.toUpperCase()), progress: n / ORDERS_FOR_ACT2 };
    }
    case 3: {
      const won = state.stats.fairsWon - state.actStart.fairsWon > 0;
      return won ? { text: "A rosette!", progress: 1 } : { text: "No rosette yet.", progress: 0 };
    }
    case 4: {
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
  const endless = act === 4 && state.ending !== null;
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
  if (state.act >= 4 || !goalMet(state, state.act)) return null;
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
  if (opts.grant) for (const a of ACTS) if (a.act <= act) for (const u of a.unlocks) grantUnlock(state, u);
  state.flockCap = Math.max(state.flockCap, def.flockCap + upgradeCapBonus(state));
  addLog(state, `“${def.line}”`);
}

/** Checks the act-4 registry goal; sets `state.ending` the first time. Returns true if reached now. */
export function checkEnding(state: GameState): boolean {
  if (state.act !== 4 || state.ending) return false;
  if (!registryStatus(state).met) return false;
  state.ending = { shown: false, season: state.season };
  addLog(state, "Your blue sheep are registered as a breed of their own. The whole village comes to see.");
  return true;
}

/** Act 4 goal reached and the ending screen not yet shown. */
export function isEnding(state: GameState): boolean {
  return state.ending !== null && !state.ending.shown;
}

export function markEndingShown(state: GameState): void {
  if (state.ending) state.ending.shown = true;
}
