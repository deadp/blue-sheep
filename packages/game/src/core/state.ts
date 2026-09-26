/** Game state: construction, sheep bookkeeping, save/load and v1 migration. */
import {
  Pedigree, createRng, discretePhenotype, genomeFromJSON, genomeToJSON, genotypeAt, quantitativePhenotype,
  sampleFounder, type Genome, type Rng, type Species,
} from "@blue-sheep/genetics";
import { sheep as sheepSpecies } from "@blue-sheep/genetics";
import {
  ACTS, ADULT_AGE, EWE_BREED_MAX_AGE, FAIR_CATEGORIES, FAIR_SEASON, MARKET_SIZE, SEASONS, START_MONEY,
} from "./config.js";
import { EWE_NAMES, RAM_NAMES } from "./names.js";
import type { ActNumber, FairCategory, GameState, Phenotype, Sex, Sheep, SheepOrigin, Unlock } from "./types.js";

export const species: Species = sheepSpecies.sheep;

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

export function computePhenotype(genome: Genome, inbreeding: number, rng: Rng): Phenotype {
  const out: Phenotype = {};
  for (const t of species.traits) {
    out[t.id] = t.kind === "discrete"
      ? discretePhenotype(genome, species.map, t)
      : quantitativePhenotype(genome, species.map, t, rng, inbreeding);
  }
  return out;
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

/** An unrelated adult that is not blue, so the player has to breed for it. */
export function sampleFounderSheep(state: GameState, rng: Rng, sex: Sex, born: number, origin: SheepOrigin): Sheep {
  for (let tries = 0; tries < 50; tries++) {
    const genome = sampleFounder(species.map, rng);
    const colour = discretePhenotype(genome, species.map, sheepSpecies.colour);
    if (colour === "blue") continue;
    return addSheep(state, rng, { sex, born, dam: null, sire: null, genome, inbreeding: 0, origin });
  }
  throw new Error("could not sample a non-blue founder");
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
    version: 2,
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
    achievements: [],
  };
  // Starting flock: 4 ewes + 1 ram, all adults. Resample until blue is reachable:
  // at least two hidden `d` alleles and one black (a/a B/_) sheep.
  for (let attempt = 0; attempt < 200; attempt++) {
    const trial: Sheep[] = [];
    for (let i = 0; i < 4; i++) trial.push(sampleFounderSheep(state, rng, "ewe", -ADULT_AGE - rng.int(4), "founder"));
    trial.push(sampleFounderSheep(state, rng, "ram", -ADULT_AGE - rng.int(4), "founder"));
    const dCount = trial.reduce((n, s) => n + genotypeAt(genomeOf(s), species.map, "D").filter((x) => x === 0).length, 0);
    const hasBlack = trial.some((s) => s.phenotype["colour"] === "black");
    if (dCount >= 2 && hasBlack) {
      state.flock = trial.map((s) => s.id);
      break;
    }
    for (const s of trial) delete state.sheep[s.id];
    state.nextId = 1;
  }
  if (state.flock.length === 0) throw new Error("could not build a solvable starting flock");
  restockMarket(state, rng);
  saveRng(state, rng);
  addLog(state, ACTS[0]!.line);
  return state;
}

/** Replace the market stock. Unsold stock leaves the game entirely (it has no relatives here). */
export function restockMarket(state: GameState, rng: Rng): void {
  for (const id of state.market) {
    if (!state.flock.includes(id) && !hasOffspring(state, id)) { delete state.sheep[id]; delete state.zone[id]; delete state.known[id]; }
  }
  state.market = [];
  for (let i = 0; i < MARKET_SIZE; i++) {
    const sex: Sex = i < MARKET_SIZE - 1 ? "ewe" : "ram";
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

export function deserialize(json: string): GameState {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") throw new Error("That save file is not a Blue Sheep save.");
  if (raw["version"] === 2) {
    const st = raw as unknown as GameState;
    // Saves from before farm improvements have no `upgrades`: treat as none bought.
    if (!Array.isArray(st.upgrades)) st.upgrades = [];
    return st;
  }
  if (raw["version"] === 1) return migrateV1(raw);
  throw new Error(`This save is from an unknown version (${String(raw["version"])}).`);
}

/** Best-effort upgrade of a v1 prototype save. Throws if the save has no usable flock. */
export function migrateV1(v1: Record<string, unknown>): GameState {
  const sheep = v1["sheep"] as Record<string, Partial<Sheep>> | undefined;
  const flock = v1["flock"] as string[] | undefined;
  const season = Number(v1["season"]);
  if (!sheep || !Array.isArray(flock) || !Number.isFinite(season)) throw new Error("This old save is too damaged to load.");
  const outSheep: Record<string, Sheep> = {};
  for (const [id, s] of Object.entries(sheep)) {
    if (!s || !Array.isArray(s.genome) || !s.phenotype) throw new Error("This old save is too damaged to load.");
    outSheep[id] = {
      id, name: String(s.name ?? id), sex: s.sex === "ram" ? "ram" : "ewe", born: Number(s.born ?? 0),
      dam: s.dam ?? null, sire: s.sire ?? null, genome: s.genome, inbreeding: Number(s.inbreeding ?? 0),
      phenotype: s.phenotype, tested: s.tested ?? {}, ill: false, rosettes: [],
      origin: s.dam ? "bred" : (flock.includes(id) ? "founder" : "market"),
    };
  }
  const achievements = (v1["achievements"] as string[] | undefined) ?? [];
  const lambs = Object.values(outSheep).filter((s) => s.dam !== null);
  const blues = lambs.filter((s) => s.phenotype["colour"] === "blue").length;
  const act: ActNumber = achievements.includes("blue") || blues > 0 ? 2 : lambs.length > 0 ? 1 : 0;
  const seed = Number(v1["seed"] ?? 1);
  const fairSeason = nextFairSeason(season);
  const oldDisc = (v1["discoveries"] as { season: number; sheep: string; text: string }[] | undefined) ?? [];
  const state: GameState = {
    version: 2,
    seed,
    rng: Number(v1["rng"] ?? seed),
    season,
    money: Math.max(0, Number(v1["money"] ?? 0)),
    act,
    actStart: { season, ordersFilled: 0, fairsWon: 0 },
    flockCap: Math.max(ACTS[act]!.flockCap, Number(v1["flockCap"] ?? 0)),
    reputation: 0,
    sheep: outSheep,
    flock: flock.filter((id) => outSheep[id]),
    market: ((v1["market"] as string[] | undefined) ?? []).filter((id) => outSheep[id]),
    log: (v1["log"] as GameState["log"] | undefined) ?? [],
    nextId: Number(v1["nextId"] ?? Object.keys(outSheep).length + 1),
    zone: (v1["zone"] as Record<string, string> | undefined) ?? {},
    plans: (v1["plans"] as Record<string, string> | undefined) ?? {},
    known: (v1["known"] as GameState["known"] | undefined) ?? {},
    discoveries: oldDisc.map((d, i) => ({ id: `d${i + 1}`, season: d.season, sheep: d.sheep, locus: "", text: d.text })),
    unlocks: unlocksUpTo(act),
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
    stats: {
      lambsBorn: lambs.length, bluesBorn: blues, coinsEarned: 0, discoveries: oldDisc.length,
      fairsWon: 0, ordersFilled: 0, ordersFailed: 0,
    },
    upgrades: [],
    achievements,
  };
  if (state.flock.length === 0) throw new Error("This old save has no sheep left to farm.");
  addLog(state, "Your farm has been carried over to the new version.");
  return state;
}
