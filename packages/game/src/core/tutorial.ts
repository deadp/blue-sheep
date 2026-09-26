/**
 * The tutorial: a new farm that starts with one white ewe and one white ram, both secretly carrying colour.
 * A mentor walks the player through one idea per step; the controller decides when a step's action has
 * happened (ui/tutorial.ts) and calls `advanceTutorial`. At the last step a neighbour brings the rest of
 * the normal starter flock: exactly the sheep `newGame(seed)` would have started with.
 *
 * Acts are not held: the tutorial is act 0. Its planned mating gives the first lamb (act 0's goal), so the
 * sleep in step 5 enters act 1 ("Hidden colours") as in a normal game, and the handover happens in act 1.
 */
import { createRng, discretePhenotype, getLocus, sampleFounder, sheep as sheepDefs, type Genome, type Rng } from "@blue-sheep/genetics";
import { ADULT_AGE } from "./config.js";
import { buyPrice } from "./economy.js";
import { addLog, addSheep, newGame, species } from "./state.js";
import type { GameState, Sheep } from "./types.js";

export type TutorialStepId = "ewe" | "ram" | "forecast" | "plan" | "sleep" | "reveal" | "grow" | "market" | "goal" | "done";

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
  { id: "plan", title: "Plan the mating", ack: false },
  { id: "sleep", title: "Sleep", ack: false },
  { id: "reveal", title: "The reveal", ack: false },
  { id: "grow", title: "Lambs grow up", ack: false },
  { id: "market", title: "The market", ack: false },
  { id: "goal", title: "The goal", ack: true },
  { id: "done", title: "Your flock", ack: true },
];

/** The mentor and the neighbour who minds the starter flock (both from core/names VILLAGERS). */
export const MENTOR = { name: "Old Tom", icon: "👴" } as const;
export const NEIGHBOUR = { name: "Granny Moss", icon: "👵" } as const;

/** Mixed into the seed for the tutorial's own sheep, so the game's main RNG stays exactly newGame(seed)'s. */
const TUTORIAL_SALT = 0x7a11;

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

/** Set alleles at a locus: [maternal, paternal] allele names. */
function setLocus(g: Genome, locus: string, alleles: [string, string]): void {
  const l = getLocus(species.map, locus);
  const pair = g.chromosomes[l.chromosome]!;
  pair[0][l.index] = l.alleles.indexOf(alleles[0]);
  pair[1][l.index] = l.alleles.indexOf(alleles[1]);
}

/**
 * The tutorial pair. Both white, both carry hidden colour (one white copy, one coloured copy) and are black
 * underneath, so a lamb that shows its colour is black. The ewe also carries one dilute copy, the ram none,
 * so no tutorial lamb can be blue (that stays the goal of the game). Everything else is an ordinary founder.
 */
function tutorialGenome(rng: Rng, sex: "ewe" | "ram"): Genome {
  const g = sampleFounder(species.map, rng);
  setLocus(g, "A", ["a", "Aw"]);
  setLocus(g, "B", ["B", "B"]);
  setLocus(g, "D", sex === "ewe" ? ["d", "D"] : ["D", "D"]);
  return g;
}

/**
 * A new game that starts in the tutorial. Built from `newGame(seed)`: the same market, money and main RNG,
 * but its starter flock waits with a neighbour (`tutorial.held`) until the last step, and the farm starts
 * with the tutorial's ewe and ram instead.
 */
export function newTutorialGame(seed: number): GameState {
  const state = newGame(seed);
  const trng = createRng((seed ^ TUTORIAL_SALT) >>> 0 || 1);
  // Name the pair while the starter flock is still on the books, so no name is shared with it.
  const ewe = addSheep(state, trng, { sex: "ewe", born: -ADULT_AGE - 1, dam: null, sire: null, genome: tutorialGenome(trng, "ewe"), inbreeding: 0, origin: "founder" });
  const ram = addSheep(state, trng, { sex: "ram", born: -ADULT_AGE - 2, dam: null, sire: null, genome: tutorialGenome(trng, "ram"), inbreeding: 0, origin: "founder" });
  const held = state.flock.map((id) => state.sheep[id]!);
  for (const s of held) delete state.sheep[s.id];
  state.flock = [ewe.id, ram.id];
  state.tutorial = { step: 1, done: false, ewe: ewe.id, ram: ram.id, held, gift: 0 };
  addLog(state, `${MENTOR.name} leans on the gate: “Two sheep to start with. Let's get to know them.”`);
  return state;
}

/**
 * The player did the thing step `id` asks for: move on (no-op unless `id` is the current step).
 * Entering the market step makes sure a ewe is affordable; entering the last step hands over the flock.
 * Returns true if the step advanced.
 */
export function advanceTutorial(state: GameState, id: TutorialStepId): boolean {
  const t = state.tutorial;
  if (!t || t.done || tutorialStep(state) !== id) return false;
  if (t.step >= TUTORIAL_STEPS.length) { t.done = true; addLog(state, `${MENTOR.name} waves from the lane. The farm is yours.`); return true; }
  t.step += 1;
  const now = TUTORIAL_STEPS[t.step - 1]!.id;
  if (now === "market") ensureAffordableEwe(state);
  if (now === "done") handOver(state);
  return true;
}

/** Skip the rest: the flock arrives now and the tutorial is over. */
export function skipTutorial(state: GameState): void {
  const t = state.tutorial;
  if (!t || t.done) return;
  handOver(state);
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
 * The neighbour brings the starter flock. Their ages are kept as they were at the start (birth seasons
 * move forward by the seasons the tutorial took), so the farm gets the very sheep newGame(seed) begins with.
 */
function handOver(state: GameState): void {
  const t = state.tutorial!;
  if (!t.held.length) return;
  for (const s of t.held) {
    const sheep: Sheep = { ...s, born: s.born + state.season };
    state.sheep[sheep.id] = sheep;
    state.flock.push(sheep.id);
  }
  addLog(state, `${NEIGHBOUR.name} brings the rest of the old farm's flock: ${t.held.map((s) => s.name).join(", ")}.`);
  t.held = [];
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
