/** Winter events: announced a season ahead (so they are decisions), resolved in winter. */
import type { Rng } from "@blue-sheep/genetics";
import { DOG_GUARD, DOG_IDS, FOX_GUARD_BOLDNESS, PET_NAME, WOLF_MIN_ACT } from "./config.js";
import { ownedPets, petEffort } from "./care.js";
import { removeFromFlock } from "./economy.js";
import { addLog, flockSheep, isAdult, seasonOfYear } from "./state.js";
import { hasUpgrade } from "./upgrades.js";
import type { DogId, EventKind, EventRecord, GameState, PendingEvent, Sheep } from "./types.js";

/**
 * Winter weather comes with the `farm` concept (core/pacing.ts); foxes only once `dogs` has arrived (so the
 * market sells an answer), and from WOLF_MIN_ACT a wolf can come down from the hills instead.
 */
export function eventPool(state: GameState): EventKind[] {
  if (!state.unlocks.includes("farm")) return [];
  const pool: EventKind[] = ["hardWinter", "woolBoom"];
  if (state.unlocks.includes("dogs")) pool.splice(1, 0, "fox");
  if (state.unlocks.includes("dogs") && state.act >= WOLF_MIN_ACT) pool.push("wolf");
  return pool;
}

export type Predator = "fox" | "wolf";

/** Your dogs, strongest guard first. */
export function ownedDogs(state: GameState): DogId[] {
  const pets = ownedPets(state);
  return [...DOG_IDS].reverse().filter((d) => pets.includes(d));
}

/** A grown sheep bold enough to see a fox off (never a wolf). Boldness is visible, so this is fair to show. */
export function foxGuard(state: GameState): Sheep | undefined {
  return flockSheep(state).find((s) => isAdult(s, state.season) && Number(s.phenotype["boldness"]) >= FOX_GUARD_BOLDNESS);
}

/** Chance one dog sees this predator off, with its fondness. */
export function dogGuardChance(state: GameState, dog: DogId, kind: Predator): number {
  return DOG_GUARD[dog][kind] * petEffort(state, dog);
}

/**
 * Chance the predator takes a lamb if it comes and there are lambs in the field, with these dogs keeping
 * watch (default: the dogs you own). A bold grown sheep always sees a fox off.
 */
export function predatorRisk(state: GameState, kind: Predator, dogs: DogId[] = ownedDogs(state)): number {
  if (kind === "fox" && foxGuard(state)) return 0;
  return dogs.reduce((miss, d) => miss * (1 - dogGuardChance(state, d, kind)), 1);
}

export function announceText(kind: EventKind, colour: string | null): string {
  switch (kind) {
    case "hardWinter": return "The old folk say a hard winter is coming. Feed will cost double, and the smallest sheep may fall ill unless the barn is snug.";
    case "fox": return "A fox has been seen near the village. A bold sheep in the flock, or a good dog, would keep the lambs safe.";
    case "woolBoom": return `The weavers are crying out for ${colour} wool — it will fetch double this winter.`;
    case "wolf": return "Wolves have come down from the high hills. One will prowl this winter — only a big guardian dog really stands up to a wolf.";
  }
}

/** Pick next winter's event (called when autumn begins, act 1+, once winter weather has arrived). */
export function announceEvent(state: GameState, rng: Rng): PendingEvent | null {
  if (state.act < 1 || seasonOfYear(state.season + 1) !== 3) return null;
  const pool = eventPool(state);
  if (!pool.length) return null;
  const kind = pool[rng.int(pool.length)]!;
  let colour: string | null = null;
  if (kind === "woolBoom") {
    const have = [...new Set(flockSheep(state).map((s) => String(s.phenotype["colour"])))].filter((c) => c !== "white");
    const pool = have.length ? have : ["black", "brown"];
    colour = pool[rng.int(pool.length)]!;
  }
  const ev: PendingEvent = { kind, season: state.season + 1, colour, text: announceText(kind, colour) };
  state.pendingEvent = ev;
  addLog(state, ev.text);
  return ev;
}

export interface AppliedEvent { record: EventRecord; feedMultiplier: number; boomColour: string | null; lost: string | null }

/** Resolve the pending event for this season, before shearing and lambing. */
export function applyEvent(state: GameState, rng: Rng): AppliedEvent | null {
  const ev = state.pendingEvent;
  if (!ev || ev.season !== state.season) return null;
  state.pendingEvent = null;
  const rec: EventRecord = { kind: ev.kind, season: state.season, colour: ev.colour, sheep: null, saved: false, text: "" };
  let feedMultiplier = 1, boomColour: string | null = null, lost: string | null = null;
  if (ev.kind === "hardWinter") {
    feedMultiplier = 2;
    const adults = flockSheep(state).filter((s) => isAdult(s, state.season))
      .sort((a, b) => Number(a.phenotype["size"]) - Number(b.phenotype["size"]) || Number(a.id.slice(1)) - Number(b.id.slice(1)));
    const pool = adults.slice(0, 3);
    if (hasUpgrade(state, "barn")) {
      rec.saved = true;
      rec.text = "A hard winter. Feed cost double, but the snug barn kept everyone warm — nobody fell ill.";
    } else if (pool.length) {
      const ill = pool[rng.int(pool.length)]!;
      ill.ill = true;
      rec.sheep = ill.id;
      rec.text = `A hard winter. Feed cost double, and little ${ill.name} fell ill — she'll need to rest through spring.`.replace(" she'll", ill.sex === "ram" ? " he'll" : " she'll");
    } else rec.text = "A hard winter. Feed cost double.";
  } else if (ev.kind === "fox" || ev.kind === "wolf") {
    lost = predator(state, rng, ev.kind, rec);
  } else {
    boomColour = ev.colour;
    rec.text = `${ev.colour!.charAt(0).toUpperCase()}${ev.colour!.slice(1)} wool fetched double this winter.`;
  }
  state.events.push(rec);
  addLog(state, rec.text);
  return { record: rec, feedMultiplier, boomColour, lost };
}

/** A fox or a wolf comes by night: a bold sheep (fox only) or a dog may see it off; otherwise it takes a lamb. */
function predator(state: GameState, rng: Rng, kind: Predator, rec: EventRecord): string | null {
  const lambs = flockSheep(state).filter((s) => !isAdult(s, state.season)).sort((a, b) => b.born - a.born || Number(b.id.slice(1)) - Number(a.id.slice(1)));
  const guard = kind === "fox" ? foxGuard(state) : undefined;
  const a = kind === "fox" ? "The fox" : "The wolf";
  rec.dog = null;
  if (guard) {
    rec.saved = true; rec.sheep = guard.id;
    rec.text = `${a} came by night, but bold ${guard.name} stood her ground and saw it off.`.replace("stood her", guard.sex === "ram" ? "stood his" : "stood her");
    return null;
  }
  // Every dog keeps watch; the strongest tries first.
  for (const d of ownedDogs(state)) {
    if (!rng.chance(dogGuardChance(state, d, kind))) continue;
    rec.saved = true; rec.dog = d;
    const name = PET_NAME[d];
    rec.text = d === "terrier"
      ? `${a} came by night, but ${name} yapped so loudly it thought better of it.`
      : d === "collie"
        ? `${a} came by night, but ${name} had herded the lambs in close and barked it off.`
        : `${a} came by night, but ${name} the Maremma stood over the flock and ${kind === "wolf" ? "the wolf slunk back to the hills" : "it fled"}.`;
    if (!lambs.length) rec.text = `${a} prowled around, but ${name} chased it away.`;
    return null;
  }
  const dogs = ownedDogs(state);
  if (!lambs.length) {
    rec.text = kind === "fox" ? "The fox prowled around, but there were no lambs to take." : "The wolf howled on the hill, but there were no lambs to take.";
    return null;
  }
  const victim = lambs[rng.int(lambs.length)]!;
  rec.sheep = victim.id;
  removeFromFlock(state, victim.id);
  const tried = dogs.length ? ` ${dogs.map((d) => PET_NAME[d]).join(" and ")} couldn't stop it.` : kind === "fox" ? " A bolder sheep or a dog might have kept watch." : " A guardian dog might have stood up to it.";
  rec.text = `${a} came by night and took little ${victim.name}.${tried}`;
  return victim.id;
}
