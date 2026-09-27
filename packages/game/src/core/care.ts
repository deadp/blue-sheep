/**
 * Fondness: how fond each animal (sheep, dog, cat) is of you, 0–100. It grows when you greet an animal
 * (opening its card; once a season) or give it a treat (once a season, for a coin), and fades slowly when it
 * is ignored for a while. Bought-in sheep start skittish; farm-born lambs start friendlier, more so when
 * their mother is fond of you. Happy sheep grow better wool (a modest price multiplier), and a dog or cat
 * that loves you works a little harder. Deterministic: plain numbers in `state.care`.
 */
import {
  CAT_CATCH_FLOOR, DOG_FOND_FLOOR, FOND_BRUSH, FOND_DECAY, FOND_GRACE, FOND_GREET, FOND_LAMB_BASE, FOND_LAMB_FROM_DAM,
  FOND_PET_START, FOND_START, FOND_TREAT, FOND_WOOL_FROM, FOND_WOOL_LOW, FOND_WOOL_LOW_FROM, FOND_WOOL_MAX,
  FOND_WORDS, PET_FEED, PET_IDS, PET_NAME, SHEARING_BONUS, TREAT_COST,
} from "./config.js";
import { woolIncome } from "./economy.js";
import { addLog, isAdult } from "./state.js";
import type { CareRecord, GameState, PetId, Sheep } from "./types.js";

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

export function isPetId(id: string): id is PetId {
  return (PET_IDS as string[]).includes(id);
}

/** Owned dogs and cat, in PET_IDS order. */
export function ownedPets(state: GameState): PetId[] {
  const up = state.upgrades ?? [];
  return PET_IDS.filter((p) => (up as string[]).includes(p));
}

/** Coins of food the dogs and cat eat a season, all together. */
export function petFeed(state: GameState): number {
  return ownedPets(state).reduce((t, p) => t + PET_FEED[p], 0);
}

/** Can the player greet or treat this animal (a sheep in the flock, or a dog/cat they own)? */
export function isOwnAnimal(state: GameState, id: string): boolean {
  return isPetId(id) ? ownedPets(state).includes(id) : state.flock.includes(id);
}

/** Fondness an animal has before any record exists: by where it came from. */
export function defaultFondness(state: GameState, id: string): number {
  if (isPetId(id)) return FOND_PET_START;
  const s = state.sheep[id];
  return s ? FOND_START[s.origin] ?? FOND_START.founder : FOND_START.market;
}

export function fondnessOf(state: GameState, id: string): number {
  const r = state.care?.[id];
  return r ? r.level : defaultFondness(state, id);
}

function record(state: GameState, id: string): CareRecord {
  if (!state.care) state.care = {};
  let r = state.care[id];
  if (!r) { r = { level: defaultFondness(state, id), greeted: -1, treated: -1, cared: state.season }; state.care[id] = r; }
  return r;
}

export function greetedThisSeason(state: GameState, id: string): boolean {
  return state.care?.[id]?.greeted === state.season;
}

export function treatedThisSeason(state: GameState, id: string): boolean {
  return state.care?.[id]?.treated === state.season;
}

/** One of FOND_WORDS: Skittish, Wary, Friendly, Fond of you, Devoted. */
export function fondnessWord(level: number): string {
  return FOND_WORDS[Math.max(0, Math.min(FOND_WORDS.length - 1, Math.floor(clamp100(level) / 20)))]!;
}

/** Hearts out of five (halves allowed), for the heart meter. */
export function fondnessHearts(level: number): number {
  return Math.round(clamp100(level) / 10) / 2;
}

/** Wool price multiplier from fondness: up to +15 % when devoted, a little less when skittish. */
export function fondWoolMultiplier(level: number): number {
  const f = clamp100(level);
  if (f >= FOND_WOOL_FROM) return 1 + FOND_WOOL_MAX * (f - FOND_WOOL_FROM) / (100 - FOND_WOOL_FROM);
  if (f < FOND_WOOL_LOW_FROM) return 1 - FOND_WOOL_LOW * (FOND_WOOL_LOW_FROM - f) / FOND_WOOL_LOW_FROM;
  return 1;
}

/** A dog's or cat's work rate from its fondness (DOG_FOND_FLOOR / CAT_CATCH_FLOOR up to 1). */
export function petEffort(state: GameState, id: PetId): number {
  const floor = id === "cat" ? CAT_CATCH_FLOOR : DOG_FOND_FLOOR;
  return floor + (1 - floor) * fondnessOf(state, id) / 100;
}

/**
 * Say hello (the controller calls this when an animal's card opens). Counts once per animal per season.
 * Returns the fondness gained (0 when already greeted this season or not your animal).
 */
export function greetAnimal(state: GameState, id: string): number {
  if (!isOwnAnimal(state, id) || greetedThisSeason(state, id)) return 0;
  const r = record(state, id);
  const before = r.level;
  r.level = clamp100(r.level + FOND_GREET);
  r.greeted = state.season;
  r.cared = state.season;
  return r.level - before;
}

export function brushedThisSeason(state: GameState, id: string): boolean {
  return state.care?.[id]?.brushed === state.season;
}

/**
 * Brush a sheep's fleece on its live portrait (a dog or the cat: a pat). Counts once per animal per season,
 * +FOND_BRUSH. Returns the fondness gained (0 when already brushed this season or not your animal).
 */
export function brushAnimal(state: GameState, id: string): number {
  if (!isOwnAnimal(state, id) || brushedThisSeason(state, id)) return 0;
  const r = record(state, id);
  const before = r.level;
  r.level = clamp100(r.level + FOND_BRUSH);
  r.brushed = state.season;
  r.cared = state.season;
  addLog(state, `${nameOf(state, id)} ${isPetId(id) ? "had a good pat" : "had a good brush"} and leaned into it.`);
  return r.level - before;
}

/** What brushing would do now, in words (fondness before → after), or null when it can't be done. */
export function forecastBrush(state: GameState, id: string): { before: number; after: number; text: string } | null {
  if (!isOwnAnimal(state, id) || brushedThisSeason(state, id)) return null;
  const before = fondnessOf(state, id);
  const after = clamp100(before + FOND_BRUSH);
  const verb = isPetId(id) ? "A pat" : "A brush";
  const text = after === before ? `${verb} would feel lovely, but ${nameOf(state, id)} couldn't be any fonder of you.`
    : fondnessWord(after) !== fondnessWord(before)
      ? `${verb} would take ${nameOf(state, id)} from ${fondnessWord(before).toLowerCase()} to ${fondnessWord(after).toLowerCase()}.`
      : `${verb} would make ${nameOf(state, id)} a little fonder of you.`;
  return { before, after, text };
}

/** Why a treat can't be given now (null when it can). */
export function treatBlocked(state: GameState, id: string): string | null {
  if (!isOwnAnimal(state, id)) return "Only your own animals can have treats.";
  if (treatedThisSeason(state, id)) return `${nameOf(state, id)} has had a treat this season.`;
  if (state.money < TREAT_COST) return `A treat costs ${TREAT_COST} coin — you have ${state.money}.`;
  return null;
}

/** Give a treat: costs TREAT_COST coins, once per animal per season. Returns the fondness gained. */
export function giveTreat(state: GameState, id: string): number {
  const blocked = treatBlocked(state, id);
  if (blocked) throw new Error(blocked);
  const r = record(state, id);
  const before = r.level;
  state.money -= TREAT_COST;
  r.level = clamp100(r.level + FOND_TREAT);
  r.treated = state.season;
  r.cared = state.season;
  addLog(state, `${nameOf(state, id)} had a treat and nuzzled your hand.`);
  return r.level - before;
}

/** Coins one fleece fetches at today's prices, with this fondness (no booms). */
export function fleeceAt(state: GameState, s: Sheep, level: number): number {
  const shed = (state.upgrades ?? []).includes("shearing") ? SHEARING_BONUS : 1;
  return woolIncome(s, null, shed * fondWoolMultiplier(level));
}

export interface TreatForecast {
  before: number;
  after: number;
  /** Coins a shearing at today's fondness and after the treat (sheep only; null for lambs and pets). */
  woolBefore: number | null;
  woolAfter: number | null;
  text: string;
}

/** What a treat would do, before you give it. */
export function forecastTreat(state: GameState, id: string): TreatForecast {
  const before = fondnessOf(state, id);
  const after = clamp100(before + FOND_TREAT);
  const s = state.sheep[id];
  const name = nameOf(state, id);
  let woolBefore: number | null = null, woolAfter: number | null = null;
  let tail: string;
  if (s && !isPetId(id)) {
    if (isAdult(s, state.season)) {
      woolBefore = fleeceAt(state, s, before);
      woolAfter = fleeceAt(state, s, after);
      const d = woolAfter - woolBefore;
      tail = d > 0 ? ` Happier sheep grow better wool: about +${d} coin${d === 1 ? "" : "s"} a shearing.` : " Wool won't change yet — that starts once a sheep is friendly.";
    } else tail = " Lambs raised fond of you grow into happier sheep.";
  } else tail = id === "cat" ? " A cat who loves you catches more mice." : " A dog who loves you guards the lambs a little harder.";
  const word = fondnessWord(after);
  const text = after === before
    ? `${name} couldn't be any fonder of you.`
    : word === fondnessWord(before)
      ? `${name} would grow a little fonder of you.${tail}`
      : `${name} would go from ${fondnessWord(before).toLowerCase()} to ${word.toLowerCase()}.${tail}`;
  return { before, after, woolBefore, woolAfter, text };
}

/** A farm-born lamb's fondness: moderate, higher when its mother is fond of you. */
export function welcomeLamb(state: GameState, lamb: Sheep, damId: string, season: number): void {
  if (!state.care) state.care = {};
  const level = clamp100(Math.round(FOND_LAMB_BASE + FOND_LAMB_FROM_DAM * fondnessOf(state, damId)));
  state.care[lamb.id] = { level, greeted: -1, treated: -1, cared: season };
}

/**
 * End of a season: animals ignored for more than FOND_GRACE seasons lose FOND_DECAY fondness. Records of
 * sheep that have left the farm are dropped. `season` is the season that has just been lived through.
 */
export function seasonCare(state: GameState, season: number): void {
  if (!state.care) state.care = {};
  const own = new Set<string>([...state.flock, ...ownedPets(state)]);
  for (const id of Object.keys(state.care)) if (!own.has(id)) delete state.care[id];
  for (const id of own) {
    const had = !!state.care[id];
    const r = record(state, id);
    if (!had) { r.cared = season; continue; }
    if (season - r.cared >= FOND_GRACE) r.level = clamp100(r.level - FOND_DECAY);
  }
}

function nameOf(state: GameState, id: string): string {
  return isPetId(id) ? PET_NAME[id] : state.sheep[id]?.name ?? "That animal";
}
