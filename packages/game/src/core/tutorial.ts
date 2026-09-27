/**
 * The tutorial: a new farm that starts with one white ewe and one white ram, both secretly carrying colour and
 * horns (the same pair every farm starts with; state.ts `addStarterPair`). A mentor walks the player through
 * one idea per step; the controller decides when a step's action has happened (ui/tutorial.ts) and calls
 * `advanceTutorial`. There is no handover: the player keeps the tutorial flock (ewe, ram, their lamb and the
 * ewe bought at the market) and grows it themselves. New systems arrive later, one at a time (core/pacing.ts).
 *
 * Acts are not held: the tutorial is act 0. Its planned mating gives the first lamb (act 0's goal), so the
 * sleep enters act 1 ("Hidden colours") as in a normal game.
 */
import { discretePhenotype, sheep as sheepDefs, type Genome } from "@blue-sheep/genetics";
import { buyPrice } from "./economy.js";
import { addLog, newGame, species } from "./state.js";
import type { GameState, Sheep } from "./types.js";

export type TutorialStepId =
  | "ewe" | "ram" | "forecast" | "punnet" | "plan" | "sleep" | "reveal" | "why" | "grow" | "market" | "goal" | "done";

export interface TutorialStepDef {
  id: TutorialStepId;
  title: string;
  /** Purely informational: the mentor shows a "Got it" button instead of waiting for an action. */
  ack: boolean;
}

/** Step n (1-based) is TUTORIAL_STEPS[n - 1]. */
export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  { id: "ewe", title: "Meet your ewe", ack: false },
  { id: "ram", title: "Meet your ram", ack: false },
  { id: "forecast", title: "Find a mate", ack: false },
  { id: "punnet", title: "Two copies of everything", ack: true },
  { id: "plan", title: "Plan the mating", ack: false },
  { id: "sleep", title: "Sleep", ack: false },
  { id: "reveal", title: "The reveal", ack: false },
  { id: "why", title: "Why that colour?", ack: true },
  { id: "grow", title: "Lambs grow up", ack: false },
  { id: "market", title: "The market", ack: false },
  { id: "goal", title: "The goal", ack: true },
  { id: "done", title: "Your flock", ack: true },
];

/** The mentor (from core/names VILLAGERS). */
export const MENTOR = { name: "Old Tom", icon: "👴" } as const;

export interface TutorialInfo { step: number; id: TutorialStepId; done: boolean }

export function tutorialInfo(state: GameState): TutorialInfo | null {
  const t = state.tutorial;
  if (!t) return null;
  const def = TUTORIAL_STEPS[Math.min(TUTORIAL_STEPS.length, Math.max(1, t.step)) - 1]!;
  return { step: t.step, id: def.id, done: t.done };
}

/** The tutorial is running (not skipped, not finished). */
export function tutorialActive(state: GameState): boolean {
  return !!state.tutorial && !state.tutorial.done;
}

/** The current step's id while the tutorial runs, else null. */
export function tutorialStep(state: GameState): TutorialStepId | null {
  return tutorialActive(state) ? tutorialInfo(state)!.id : null;
}

/** A new game that starts in the tutorial: `newGame(seed)` (the starter pair) with the mentor at step 1. */
export function newTutorialGame(seed: number): GameState {
  const state = newGame(seed);
  const [ewe, ram] = state.flock;
  state.tutorial = { step: 1, done: false, ewe: ewe!, ram: ram!, gift: 0 };
  addLog(state, `${MENTOR.name} leans on the gate: “Two sheep to start with. Let's get to know them.”`);
  return state;
}

/**
 * The player did the thing step `id` asks for: move on (no-op unless `id` is the current step).
 * Entering the market step makes sure a ewe is affordable. Returns true if the step advanced.
 */
export function advanceTutorial(state: GameState, id: TutorialStepId): boolean {
  const t = state.tutorial;
  if (!t || t.done || tutorialStep(state) !== id) return false;
  if (t.step >= TUTORIAL_STEPS.length) { t.done = true; addLog(state, `${MENTOR.name} waves from the lane. The farm is yours.`); return true; }
  t.step += 1;
  const now = TUTORIAL_STEPS[t.step - 1]!.id;
  if (now === "market") ensureAffordableEwe(state);
  return true;
}

/** Skip the rest: the tutorial is over and the farm stays as it is (no sheep arrive). */
export function skipTutorial(state: GameState): void {
  const t = state.tutorial;
  if (!t || t.done) return;
  t.step = TUTORIAL_STEPS.length;
  t.done = true;
}

/** Cheapest ewe on the market, or null. */
export function cheapestMarketEwe(state: GameState): Sheep | null {
  const ewes = state.market.map((id) => state.sheep[id]!).filter((s) => s && s.sex === "ewe");
  return ewes.sort((a, b) => buyPrice(a) - buyPrice(b))[0] ?? null;
}

/** The market step must be possible: if the cheapest ewe costs more than the farm has, the mentor chips in. */
function ensureAffordableEwe(state: GameState): void {
  const t = state.tutorial!;
  const ewe = cheapestMarketEwe(state);
  if (!ewe) return;
  const short = buyPrice(ewe) - state.money;
  if (short <= 0) return;
  state.money += short;
  t.gift += short;
  addLog(state, `${MENTOR.name} presses ${short} coins into your hand: “For your first ewe.”`);
}

/**
 * The tutorial's first lamb is a single, coloured (never blue) lamb, so the first reveal is a sure surprise.
 * Applies only to the tutorial pair's first mating while the tutorial runs. Rerolls meiosis with the game RNG
 * (deterministic) until the lamb shows colour.
 */
export function isTutorialFirstMating(state: GameState, eweId: string, ramId: string): boolean {
  const t = state.tutorial;
  return !!t && !t.done && state.stats.lambsBorn === 0 && t.ewe === eweId && t.ram === ramId;
}

export function colourOf(g: Genome): string {
  return discretePhenotype(g, species.map, sheepDefs.colour);
}

/** Draw a tutorial first lamb: coloured, not blue. `draw` is one meiosis with the game RNG. */
export function tutorialLambGenome(draw: () => Genome): Genome {
  let g = draw();
  for (let i = 0; i < 400; i++) {
    const c = colourOf(g);
    if (c !== "white" && c !== "blue") return g;
    g = draw();
  }
  return g;
}
