import {
  Pedigree, createRng, discretePhenotype, genomeFromJSON, genomeToJSON, genotypeAt, quantitativePhenotype,
  sampleFounder, type Genome, type Rng, type Species,
} from "@blue-sheep/genetics";
import { sheep as sheepSpecies } from "@blue-sheep/genetics";
import { EWE_NAMES, RAM_NAMES } from "./names.js";

export type Sex = "ewe" | "ram";
export type Phenotype = Record<string, string | number>;

export interface Sheep {
  id: string;
  name: string;
  sex: Sex;
  /** Absolute season index at birth. Founders get negative values (already adult). */
  born: number;
  dam: string | null;
  sire: string | null;
  genome: number[][][];
  inbreeding: number;
  phenotype: Phenotype;
  /** Loci whose genotype has been revealed by a vet test. locus -> "B/b". */
  tested: Record<string, string>;
}

export interface Pairing {
  ewe: string;
  ram: string;
}

/** Player's notebook: sheepId -> locus -> guessed genotype string like "B/b". */
export type Notebook = Record<string, Record<string, string>>;

export interface LogEntry {
  season: number;
  text: string;
}

export interface GameState {
  version: 1;
  seed: number;
  rng: number;
  season: number;
  money: number;
  act: 1 | 2 | 3 | 4;
  flockCap: number;
  sheep: Record<string, Sheep>;
  /** Display order. Dead/sold sheep are removed from here but kept in `sheep` for pedigree. */
  flock: string[];
  /** Sheep for sale this season (unrelated founders). */
  market: string[];
  notebook: Notebook;
  log: LogEntry[];
  nextId: number;
  /** Breeding goals achieved, e.g. "blue". */
  achievements: string[];
  /** Where each sheep lives on the farm: paddock | penA | penB | market. */
  zone: Record<string, string>;
  /** Planned matings for next season: ewe id -> ram id. */
  plans: Record<string, string>;
  /** Facts the player has proven: sheep id -> locus -> genotype string. */
  known: Record<string, Record<string, string>>;
  /** Discovery cards earned, newest last. */
  discoveries: { season: number; sheep: string; text: string }[];
  /** Unlocked notebook features, e.g. "numbers". */
  unlocks: string[];
}

export const SEASONS = ["Spring", "Summer", "Autumn", "Winter"] as const;
export const ADULT_AGE = 2; // seasons
export const MAX_AGE = 24;
export const species: Species = sheepSpecies.sheep;

export function seasonLabel(season: number): string {
  return `Year ${Math.floor(season / 4) + 1}, ${SEASONS[((season % 4) + 4) % 4]}`;
}

export function ageOf(s: Sheep, season: number): number {
  return season - s.born;
}

export function isAdult(s: Sheep, season: number): boolean {
  return ageOf(s, season) >= ADULT_AGE;
}

export function rngOf(state: GameState): Rng {
  return createRng(state.rng);
}

export function saveRng(state: GameState, rng: Rng): void {
  state.rng = rng.state();
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
  opts: { sex: Sex; born: number; dam: string | null; sire: string | null; genome: Genome; inbreeding: number },
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
  };
  state.sheep[id] = s;
  return s;
}

export function genomeOf(s: Sheep): Genome {
  return genomeFromJSON(s.genome);
}

/** Rebuild a Pedigree from the sheep table (insert in id order = birth order). */
export function pedigreeOf(state: GameState): Pedigree {
  const p = new Pedigree();
  const all = Object.values(state.sheep).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  for (const s of all) p.add(s.id, s.dam, s.sire);
  return p;
}

/** A founder that is not already the goal colour, so the player has to breed for it. */
export function sampleFounderSheep(state: GameState, rng: Rng, sex: Sex, born: number): Sheep {
  for (let tries = 0; tries < 50; tries++) {
    const genome = sampleFounder(species.map, rng);
    const colour = discretePhenotype(genome, species.map, sheepSpecies.colour);
    if (colour === "blue") continue;
    return addSheep(state, rng, { sex, born, dam: null, sire: null, genome, inbreeding: 0 });
  }
  throw new Error("could not sample a non-blue founder");
}

export function newGame(seed: number): GameState {
  const rng = createRng(seed);
  const state: GameState = {
    version: 1,
    seed,
    rng: 0,
    season: 0,
    money: 50,
    act: 1,
    flockCap: 8,
    sheep: {},
    flock: [],
    market: [],
    notebook: {},
    log: [],
    nextId: 1,
    achievements: [],
    zone: {},
    plans: {},
    known: {},
    discoveries: [],
    unlocks: [],
  };
  // Starting flock: 4 ewes + 1 ram, all adults. Resample until the goal is
  // reachable: at least two hidden `d` alleles and one black (a/a B/_) sheep.
  for (let attempt = 0; attempt < 200; attempt++) {
    const trial: Sheep[] = [];
    for (let i = 0; i < 4; i++) trial.push(sampleFounderSheep(state, rng, "ewe", -ADULT_AGE - rng.int(4)));
    trial.push(sampleFounderSheep(state, rng, "ram", -ADULT_AGE - rng.int(4)));
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
  state.log.push({ season: 0, text: "Welcome to the farm. Breed a blue sheep!" });
  return state;
}

export function restockMarket(state: GameState, rng: Rng): void {
  state.market = [];
  for (let i = 0; i < 3; i++) {
    const sex: Sex = i === 0 ? "ewe" : "ram";
    state.market.push(sampleFounderSheep(state, rng, sex, state.season - ADULT_AGE).id);
  }
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const s = JSON.parse(json) as GameState;
  if (s.version !== 1) throw new Error(`unsupported save version ${String(s.version)}`);
  s.zone ??= {};
  s.plans ??= {};
  s.known ??= {};
  s.discoveries ??= [];
  s.unlocks ??= [];
  return s;
}
