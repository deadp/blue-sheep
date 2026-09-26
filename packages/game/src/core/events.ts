/** Winter events: announced a season ahead (so they are decisions), resolved in winter. */
import type { Rng } from "@blue-sheep/genetics";
import { FOX_GUARD_BOLDNESS } from "./config.js";
import { removeFromFlock } from "./economy.js";
import { addLog, flockSheep, isAdult, seasonOfYear } from "./state.js";
import type { EventKind, EventRecord, GameState, PendingEvent } from "./types.js";

const KINDS: EventKind[] = ["hardWinter", "fox", "woolBoom"];

export function announceText(kind: EventKind, colour: string | null): string {
  switch (kind) {
    case "hardWinter": return "The old folk say a hard winter is coming. Feed will cost double, and the smallest sheep may fall ill.";
    case "fox": return "A fox has been seen near the village. A bold sheep in the flock would keep the lambs safe.";
    case "woolBoom": return `The weavers are crying out for ${colour} wool — it will fetch double this winter.`;
  }
}

/** Pick next winter's event (called when autumn begins, act 1+). */
export function announceEvent(state: GameState, rng: Rng): PendingEvent | null {
  if (state.act < 1 || seasonOfYear(state.season + 1) !== 3) return null;
  const kind = KINDS[rng.int(KINDS.length)]!;
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
    if (pool.length) {
      const ill = pool[rng.int(pool.length)]!;
      ill.ill = true;
      rec.sheep = ill.id;
      rec.text = `A hard winter. Feed cost double, and little ${ill.name} fell ill — she'll need to rest through spring.`.replace(" she'll", ill.sex === "ram" ? " he'll" : " she'll");
    } else rec.text = "A hard winter. Feed cost double.";
  } else if (ev.kind === "fox") {
    const guard = flockSheep(state).find((s) => isAdult(s, state.season) && Number(s.phenotype["boldness"]) >= FOX_GUARD_BOLDNESS);
    const lambs = flockSheep(state).filter((s) => !isAdult(s, state.season)).sort((a, b) => b.born - a.born || Number(b.id.slice(1)) - Number(a.id.slice(1)));
    if (guard) {
      rec.saved = true; rec.sheep = guard.id;
      rec.text = `The fox came by night, but bold ${guard.name} stood her ground and saw it off.`.replace("stood her", guard.sex === "ram" ? "stood his" : "stood her");
    } else if (lambs.length) {
      const victim = lambs[rng.int(lambs.length)]!;
      rec.sheep = victim.id; lost = victim.id;
      removeFromFlock(state, victim.id);
      rec.text = `The fox came by night and took little ${victim.name}. A bolder sheep might have kept watch.`;
    } else {
      rec.text = "The fox prowled around, but there were no lambs to take.";
    }
  } else {
    boomColour = ev.colour;
    rec.text = `${ev.colour!.charAt(0).toUpperCase()}${ev.colour!.slice(1)} wool fetched double this winter.`;
  }
  state.events.push(rec);
  addLog(state, rec.text);
  return { record: rec, feedMultiplier, boomColour, lost };
}
