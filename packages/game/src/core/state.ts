/** Game state: construction, sheep bookkeeping, save/load (v3 saves only: DESIGN-v3 §15 item 5). */
import {
  Pedigree, createRng, genomeFromJSON, genomeToJSON, getLocus, observePhenotypes,
  sampleFounder, type Genome, type Rng, type Species,
} from "@blue-sheep/genetics";
import { colourInputFromPhenotype, sheep3, woolColour } from "@blue-sheep/genetics";
import { colourFields } from "./colour.js";
import {
  ACTS, ADULT_AGE, EWE_BREED_MAX_AGE, FAIR_CATEGORIES, FAIR_SEASON, MARKET_BLUE_FREQ, MARKET_SIZE, MARKET_SIZE_YEAR1, SEASONS, START_MONEY,
} from "./config.js";
import { EWE_NAMES, RAM_NAMES } from "./names.js";
import type { ActNumber, FairCategory, GameState, Phenotype, Sex, Sheep, SheepOrigin, Unlock } from "./types.js";

/** The v3 species: pigment colour (W mask, red/yellow/blue doses, pale), spots, horns, fleece traits. */
export const species: Species = sheep3.sheep3;

export function seasonLabel(season: number): string {
  return `Year ${Math.floor(season / 4) + 1}, ${SEASONS[((season % 4) + 4) % 4]}`;
}

/** 0 spring, 1 summer, 2 autumn, 3 winter. */
export function seasonOfYear(season: number): number {
  return ((season % 4) + 4) % 4;
}

export function yearOf(season: number): number {
  return Math.floor(season / 4);
}

export function ageOf(s: Sheep, season: number): number {
  return season - s.born;
}

export function isAdult(s: Sheep, season: number): boolean {
  return ageOf(s, season) >= ADULT_AGE;
}

export function isIll(s: Sheep, _season?: number): boolean {
  return s.ill === true;
}

/** Can this sheep be mated this season (ignoring plans and capacity)? */
export function canBreed(s: Sheep, season: number): boolean {
  if (!isAdult(s, season) || isIll(s, season)) return false;
  return s.sex === "ram" || ageOf(s, season) < EWE_BREED_MAX_AGE;
}

export function rngOf(state: GameState): Rng {
  return createRng(state.rng);
}

export function saveRng(state: GameState, rng: Rng): void {
  state.rng = rng.state();
}

export function flockSheep(state: GameState): Sheep[] {
  return state.flock.map((id) => state.sheep[id]!);
}

export function addLog(state: GameState, text: string): void {
  state.log.push({ season: state.season, text });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
}

/**
 * What anyone can see of a sheep: every quantitative trait (with its environment drawn from `rng`) and every
 * discrete trait that isn't hidden (a white sheep's pigment doses, pale and spots are masked and left out).
 * Plus the derived colour fields (core/colour.ts `colourFields`): `colour` (the colour's name), `family`,
 * `wool` (hex) and `intensity`.
 */
export function computePhenotype(genome: Genome, inbreeding: number, rng: Rng): Phenotype {
  const out: Phenotype = observePhenotypes(genome, species, rng, inbreeding);
  return Object.assign(out, colourFields(out));
}

function pickName(state: GameState, sex: Sex, rng: Rng): string {
  const pool = sex === "ewe" ? EWE_NAMES : RAM_NAMES;
  const used = new Set(Object.values(state.sheep).map((s) => s.name));
  const free = pool.filter((n) => !used.has(n));
  const base = (free.length ? free : pool)[rng.int(free.length ? free.length : pool.length)]!;
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function addSheep(
  state: GameState,
  rng: Rng,
  opts: { sex: Sex; born: number; dam: string | null; sire: string | null; genome: Genome; inbreeding: number; origin: SheepOrigin },
): Sheep {
  const id = `s${state.nextId++}`;
  const s: Sheep = {
    id,
    name: pickName(state, opts.sex, rng),
    sex: opts.sex,
    born: opts.born,
    dam: opts.dam,
    sire: opts.sire,
    genome: genomeToJSON(opts.genome),
    inbreeding: opts.inbreeding,
    phenotype: computePhenotype(opts.genome, opts.inbreeding, rng),
    tested: {},
    ill: false,
    rosettes: [],
    origin: opts.origin,
  };
  state.sheep[id] = s;
  return s;
}

/** The true genome. Only the sim (mating, phenotypes, vet) and oracle scripts may call this. */
export function genomeOf(s: Sheep): Genome {
  return genomeFromJSON(s.genome);
}

const pedCache = new WeakMap<GameState, { key: string; ped: Pedigree }>();

/** Rebuild a Pedigree from the sheep table (insert in id order = birth order). Cached per state object. */
export function pedigreeOf(state: GameState): Pedigree {
  const n = Object.keys(state.sheep).length;
  const key = `${n}:${state.nextId}`;
  const hit = pedCache.get(state);
  if (hit && hit.key === key) return hit.ped;
  const p = new Pedigree();
  const all = Object.values(state.sheep).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  for (const s of all) p.add(s.id, s.dam && state.sheep[s.dam] ? s.dam : null, s.sire && state.sheep[s.sire] ? s.sire : null);
  pedCache.set(state, { key, ped: p });
  return p;
}

/** Blue "+" copies in a genome (U1 + U2, 0–4). The sim may read genomes; forecasts never do. */
export function blueCopies(g: Genome): number {
  let n = 0;
  for (const id of ["U1", "U2"]) { const l = getLocus(species.map, id); n += g.chromosomes[l.chromosome]![0][l.index]! + g.chromosomes[l.chromosome]![1][l.index]!; }
  return n;
}

/** True blue, from the genome at average colour strength: the market never sells the goal itself. */
function wouldBeTrueBlue(g: Genome): boolean {
  const ph = observePhenotypes(g, species, createRng(1));
  return woolColour(colourInputFromPhenotype({ ...ph, depth: 1.4 })).trueBlue;
}

const MARKET_FREQ = { U1: [1 - MARKET_BLUE_FREQ, MARKET_BLUE_FREQ], U2: [1 - MARKET_BLUE_FREQ, MARKET_BLUE_FREQ] };

/** An unrelated adult Farm sheep that can't already be true blue, so the player has to breed for it. */
export function sampleFounderSheep(state: GameState, rng: Rng, sex: Sex, born: number, origin: SheepOrigin): Sheep {
  for (let tries = 0; tries < 50; tries++) {
    const genome = sampleFounder(species.map, rng, origin === "market" ? MARKET_FREQ : undefined);
    if (wouldBeTrueBlue(genome)) continue;
    return addSheep(state, rng, { sex, born, dam: null, sire: null, genome, inbreeding: 0, origin });
  }
  throw new Error("could not sample a founder that isn't true blue");
}

export function fairCategoryFor(season: number): FairCategory {
  return FAIR_CATEGORIES[yearOf(season) % FAIR_CATEGORIES.length]!;
}

/** First autumn at or after `season`. */
export function nextFairSeason(season: number): number {
  const s = season - seasonOfYear(season) + FAIR_SEASON;
  return s >= season ? s : s + 4;
}

export function unlocksUpTo(act: ActNumber): Unlock[] {
  const out: Unlock[] = [];
  for (const a of ACTS) if (a.act <= act) for (const u of a.unlocks) if (!out.includes(u)) out.push(u);
  return out;
}

export function newGame(seed: number): GameState {
  const rng = createRng(seed);
  const fairSeason = nextFairSeason(0);
  const state: GameState = {
    version: 3,
    seed,
    rng: 0,
    season: 0,
    money: START_MONEY,
    act: 0,
    actStart: { season: 0, ordersFilled: 0, fairsWon: 0 },
    flockCap: ACTS[0]!.flockCap,
    reputation: 0,
    sheep: {},
    flock: [],
    market: [],
    log: [],
    nextId: 1,
    zone: {},
    plans: {},
    known: {},
    discoveries: [],
    unlocks: unlocksUpTo(0),
    orders: [],
    acceptedOrders: [],
    orderHistory: [],
    nextOrderId: 1,
    fair: { nextSeason: fairSeason, category: fairCategoryFor(fairSeason), entry: null, history: [] },
    visitingRam: null,
    hiredRam: null,
    events: [],
    pendingEvent: null,
    ending: null,
    stats: { lambsBorn: 0, bluesBorn: 0, coinsEarned: 0, discoveries: 0, fairsWon: 0, ordersFilled: 0, ordersFailed: 0 },
    upgrades: [],
    care: {},
    mice: null,
    achievements: [],
    tutorial: null,
    lesson: null,
    lessonsDone: [],
  };
  // Starting flock: one white ewe and one white ram (the tutorial pair; see addStarterPair).
  addStarterPair(state, rng);
  restockMarket(state, rng);
  saveRng(state, rng);
  addLog(state, ACTS[0]!.line);
  return state;
}

/** Set alleles at a locus: [maternal, paternal] allele names. */
export function setLocus(g: Genome, locus: string, alleles: [string, string]): void {
  const l = getLocus(species.map, locus);
  const pair = g.chromosomes[l.chromosome]!;
  pair[0][l.index] = l.alleles.indexOf(alleles[0]);
  pair[1][l.index] = l.alleles.indexOf(alleles[1]);
}

/**
 * The starter pair's colour genes. Both white, both carry hidden colour (one white copy, one colour copy), and
 * underneath both carry red paint that passes one dose to every lamb (the ewe on one red gene, the ram on the
 * other), so a lamb that shows its colour has two red doses — but its own red copies are single, so later
 * generations can breed the red out again. No yellow. Each also carries one blue copy on each blue gene, so
 * blue can start here, but no lamb of the pair can be true blue (its two red doses always muddy the blue).
 * The ewe carries one pale copy, the ram none, so no lamb of the pair is pale. Both are polled carriers of
 * horns (the tutorial's Punnet square) and solid with no hidden spotting (one idea at a time). Everything else
 * is an ordinary Farm founder.
 */
function setStarterColour(g: Genome, sex: Sex, horns: [string, string]): void {
  setLocus(g, "W", ["w", "W"]);
  setLocus(g, "R1", sex === "ewe" ? ["+", "+"] : ["-", "-"]);
  setLocus(g, "R2", sex === "ewe" ? ["-", "-"] : ["+", "+"]);
  setLocus(g, "Y1", ["-", "-"]);
  setLocus(g, "Y2", ["-", "-"]);
  setLocus(g, "U1", ["-", "+"]);
  setLocus(g, "U2", ["-", "+"]);
  setLocus(g, "Dl", sex === "ewe" ? ["d", "D"] : ["D", "D"]);
  setLocus(g, "P", horns);
  setLocus(g, "S", ["S", "S"]);
}

function starterGenome(rng: Rng, sex: Sex): Genome {
  const g = sampleFounder(species.map, rng);
  setStarterColour(g, sex, ["p", "P"]);
  return g;
}

/** The pair's mothers, long gone: white and horned (so the farm's records prove each child carries horns). */
function starterMotherGenome(rng: Rng, forSex: Sex): Genome {
  const g = sampleFounder(species.map, rng);
  setStarterColour(g, forSex, ["p", "p"]);
  return g;
}

/**
 * Every farm starts small: one white ewe and one white ram, both adult, both secretly carrying colour and
 * horns. Their mothers (horned, no longer on the farm) are on record, so the player can know from day one
 * that each carries one horns copy, and the first forecast shows about one horned lamb in four. Those facts
 * start as known (no discovery card for them). Returns the pair, now in the flock.
 */
export function addStarterPair(state: GameState, rng: Rng): { ewe: Sheep; ram: Sheep } {
  const damE = addSheep(state, rng, { sex: "ewe", born: -ADULT_AGE - 9, dam: null, sire: null, genome: starterMotherGenome(rng, "ewe"), inbreeding: 0, origin: "founder" });
  const damR = addSheep(state, rng, { sex: "ewe", born: -ADULT_AGE - 10, dam: null, sire: null, genome: starterMotherGenome(rng, "ram"), inbreeding: 0, origin: "founder" });
  const ewe = addSheep(state, rng, { sex: "ewe", born: -ADULT_AGE - 1, dam: damE.id, sire: null, genome: starterGenome(rng, "ewe"), inbreeding: 0, origin: "founder" });
  const ram = addSheep(state, rng, { sex: "ram", born: -ADULT_AGE - 2, dam: damR.id, sire: null, genome: starterGenome(rng, "ram"), inbreeding: 0, origin: "founder" });
  state.flock = [ewe.id, ram.id];
  state.known[damE.id] = { P: "p/p" };
  state.known[damR.id] = { P: "p/p" };
  state.known[ewe.id] = { P: "p/P" };
  state.known[ram.id] = { P: "p/P" };
  return { ewe, ram };
}

/** How many sheep the market offers this season (fewer in the first year). */
export function marketSize(season: number): number {
  return yearOf(season) === 0 ? MARKET_SIZE_YEAR1 : MARKET_SIZE;
}

/** Replace the market stock. Unsold stock leaves the game entirely (it has no relatives here). */
export function restockMarket(state: GameState, rng: Rng): void {
  for (const id of state.market) {
    if (!state.flock.includes(id) && !hasOffspring(state, id)) { delete state.sheep[id]; delete state.zone[id]; delete state.known[id]; }
  }
  state.market = [];
  const n = marketSize(state.season);
  for (let i = 0; i < n; i++) {
    const sex: Sex = i < n - 1 ? "ewe" : "ram";
    state.market.push(sampleFounderSheep(state, rng, sex, state.season - ADULT_AGE - rng.int(6), "market").id);
  }
}

export function hasOffspring(state: GameState, id: string): boolean {
  for (const s of Object.values(state.sheep)) if (s.dam === id || s.sire === id) return true;
  return false;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Thrown for a save from before v3 (pigment colours): the game starts a fresh farm instead (no migration). */
export class OldSaveError extends Error {
  constructor(version: unknown) {
    super(`This save is from an older version of the game (${String(version)}); Kōwhai Creek starts afresh.`);
    this.name = "OldSaveError";
  }
}

export function deserialize(json: string): GameState {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") throw new Error("That save file is not a Blue Sheep save.");
  if (raw["version"] === 3) {
    const st = raw as unknown as GameState;
    if (!Array.isArray(st.upgrades)) st.upgrades = [];
    if (!st.care || typeof st.care !== "object") st.care = {};
    if (st.mice === undefined) st.mice = null;
    if (st.tutorial === undefined) st.tutorial = null;
    if (st.lesson === undefined) st.lesson = null;
    if (!Array.isArray(st.lessonsDone)) st.lessonsDone = [];
    return st;
  }
  if (raw["version"] === 1 || raw["version"] === 2) throw new OldSaveError(raw["version"]);
  throw new Error(`This save is from an unknown version (${String(raw["version"])}).`);
}
