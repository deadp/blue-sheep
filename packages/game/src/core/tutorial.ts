/**
 * The tutorial: a new farm that starts with one white ewe and one white ram, both secretly carrying colour and
 * horns (the same pair every farm starts with; state.ts `addStarterPair`). Nothing is thrown at the player at
 * once: the same pair is mated three seasons running, and each lamb brings one idea (DESIGN-v3 §15, user
 * 2026-09-27):
 *   1. a plain white, polled lamb — what breeding is (meet, forecast, plan, sleep);
 *   2. a horned lamb from two polled parents — the one-in-four outcome, explained with the Punnet square;
 *   3. a black lamb from two white parents — the same square for hidden colour; then the market and the goal.
 * The lambs are drawn with the game RNG (rerolled until they show that look, so it is deterministic). The
 * controller decides when a step's action has happened (ui/tutorial.ts) and calls `advanceTutorial`. There is
 * no handover: the player keeps the tutorial flock and grows it themselves. New systems arrive later, one at a
 * time (core/pacing.ts); the letters come the moment the tutorial ends (`tutorialOver`).
 *
 * The tutorial is act 0, and the story's first act ("Hidden colours! Breed me a blue sheep") waits for the
 * black lamb, the third lambing (core/acts.ts); in a normal game it begins with the first lamb.
 */
import { discretePhenotype, sheep as sheepDefs, type Genome } from "@blue-sheep/genetics";
import { buyPrice } from "./economy.js";
import { addLog, newGame, species } from "./state.js";
import type { Discovery, GameState, Sheep } from "./types.js";

export type TutorialStepId =
  | "ewe" | "ram" | "forecast" | "plan" | "sleep" | "lamb1"
  | "again" | "sleep2" | "horns" | "punnet"
  | "again2" | "sleep3" | "black" | "why" | "market" | "goal" | "done";

export interface TutorialStepDef {
  id: TutorialStepId;
  title: string;
  /** Purely informational: the mentor shows a "Got it" button instead of waiting for an action. */
  ack: boolean;
}

/** Step n (1-based) is TUTORIAL_STEPS[n - 1]. Three seasons, one lamb (and one idea) each. */
export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  { id: "ewe", title: "Meet your ewe", ack: false },
  { id: "ram", title: "Meet your ram", ack: false },
  { id: "forecast", title: "Find a mate", ack: false },
  { id: "plan", title: "Plan the mating", ack: false },
  { id: "sleep", title: "Next season", ack: false },
  { id: "lamb1", title: "Your first lamb", ack: false },
  { id: "again", title: "The same pair again", ack: false },
  { id: "sleep2", title: "Next season", ack: false },
  { id: "horns", title: "A horned lamb", ack: false },
  { id: "punnet", title: "Two copies of everything", ack: true },
  { id: "again2", title: "Once more", ack: false },
  { id: "sleep3", title: "Next season", ack: false },
  { id: "black", title: "A black lamb", ack: false },
  { id: "why", title: "Why black?", ack: true },
  { id: "market", title: "The market", ack: false },
  { id: "goal", title: "The goal", ack: true },
  { id: "done", title: "Your flock", ack: true },
];

/** Tutorial states saved before the three-lamb tutorial have no version (they end on load). */
export const TUTORIAL_VERSION = 3;

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
  state.tutorial = { step: 1, done: false, ewe: ewe!, ram: ram!, gift: 0, ver: TUTORIAL_VERSION };
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

/** The three looks, in order: white and polled; white and horned; black. */
export const TUTORIAL_LAMBS = ["white polled", "horned", "black"] as const;

/** The tutorial pair's lambs so far (born on the farm, in order). */
export function tutorialLambs(state: GameState): Sheep[] {
  const t = state.tutorial;
  if (!t) return [];
  return Object.values(state.sheep).filter((s) => s.dam === t.ewe && s.sire === t.ram).sort((a, b) => a.born - b.born || Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/**
 * Which tutorial lamb a mating of this pair gives (0, 1 or 2), or -1 when it is not one: only the tutorial
 * pair's first three matings while the tutorial runs.
 */
export function tutorialLambIndex(state: GameState, eweId: string, ramId: string): number {
  const t = state.tutorial;
  if (!t || t.done || t.ewe !== eweId || t.ram !== ramId) return -1;
  const n = tutorialLambs(state).length;
  return n < TUTORIAL_LAMBS.length ? n : -1;
}

/** Kept for callers of the one-lamb tutorial: is this the tutorial pair's first mating? */
export function isTutorialFirstMating(state: GameState, eweId: string, ramId: string): boolean {
  return tutorialLambIndex(state, eweId, ramId) === 0;
}

export function colourOf(g: Genome): string {
  return discretePhenotype(g, species.map, sheepDefs.colour);
}

export function hornsOf(g: Genome): string {
  return discretePhenotype(g, species.map, sheepDefs.horns);
}

/**
 * Draw tutorial lamb `index` (see TUTORIAL_LAMBS). `draw` is one meiosis with the game RNG; rerolled until the
 * lamb has its look (the pair can always give it). The black lamb is polled if it can be, so it brings one
 * idea only.
 */
export function tutorialLambGenome(draw: () => Genome, index = 2): Genome {
  const ok = [
    (g: Genome) => colourOf(g) === "white" && hornsOf(g) === "polled",
    (g: Genome) => colourOf(g) === "white" && hornsOf(g) === "horned",
    (g: Genome) => colourOf(g) === "black" && hornsOf(g) === "polled",
  ][Math.max(0, Math.min(2, index))]!;
  const fallback = (g: Genome) => (index === 2 ? colourOf(g) !== "white" && colourOf(g) !== "blue" : ok(g));
  let g = draw();
  let best: Genome | null = null;
  for (let i = 0; i < 400; i++) {
    if (ok(g)) return g;
    if (!best && fallback(g)) best = g;
    g = draw();
  }
  return best ?? g;
}

/**
 * The horned lamb's discovery card. The pair's horns copies are already on record (their mothers were horned),
 * so the lamb teaches nothing new about the pair; the card celebrates what the surprise shows instead.
 */
export function tutorialHornsCard(state: GameState, lamb: Sheep): Discovery | null {
  const t = state.tutorial;
  if (!t || lamb.phenotype["horns"] !== "horned") return null;
  const E = state.sheep[t.ewe]?.name ?? "the ewe", R = state.sheep[t.ram]?.name ?? "the ram";
  const card: Discovery = {
    id: `d${state.discoveries.length + 1}`, season: state.season, sheep: lamb.id, locus: "P", loci: ["P"],
    text: `${lamb.name} is horned, though ${E} and ${R} are not: each passed on a hidden horns copy.`,
  };
  state.discoveries.push(card);
  state.stats.discoveries += 1;
  return card;
}
