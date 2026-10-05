/**
 * The woolshed queue (DESIGN-v3 §5, §6, §13 Phase 5): card, spin, then knit, weave or felt, over several seasons.
 *
 * - A job takes wool from one fleece lot (or from stock: a batt or a ball of yarn made ahead) and goes through the
 *   stages of its route. Each season (inside `advanceSeason`) every job does ONE stage's work at most, in queue order,
 *   against what is left of that bench's capacity; a stage can take several seasons when the bench is small. So a pair
 *   of socks queued in season t from a fleece (card, spin, knit) is finished as season t+3 begins.
 * - Quality Q (0-100) = 100 x fit x fineness x staple x colour x (1 + care) + noise. The noise is drawn from the game
 *   RNG once, when the job finishes, with an sd set by the finishing bench's tier and the player's hands there.
 *   A game that never crafts draws nothing, so it replays exactly as before.
 * - `forecastJob` gives the player the star band, the coin band and the finish season BEFORE they commit; the finished
 *   item keeps that forecast (`seen`) so the season report can flip it next to the result.
 * - Items sell on their own demand meters (`item:<id>`, core/demand.ts).
 * - Birds as station workers (Phase 9) plug in at `benchBonus`: extra capacity per bench, 0 for now.
 */
import type { Rng } from "@blue-sheep/genetics";
import {
  BENCH_CAP, BENCH_SIGMA, BENCH_UPGRADES, GIFT_FLEECE, HANDS_AT, HANDS_TRIM, MAX_JOBS, RECIPES, STOCK_KG,
  type BenchName, type Recipe,
} from "./config.js";
import { demandLevel, demandMult, itemKey, lowerDemand, projectDemand, sellRun } from "./demand.js";
import { storeOf } from "./woolstore.js";
import { addLog, flockSheep, isAdult } from "./state.js";
import { hasUpgrade } from "./upgrades.js";
import { woolSuit, woolTypeOf, type ItemId } from "./wool.js";
import type { CraftReport, CraftStage, Fibre, GameState, Item, Job, Material, SeenForecast } from "./types.js";
import type { WoolType } from "@blue-sheep/genetics";

export const STOCK_KINDS = ["batt", "yarn"] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

export const recipeOf = (id: string): Recipe | undefined => RECIPES.find((r) => r.id === id);
export const itemName = (id: string): string => (id === "batt" ? "Batt" : id === "yarn" ? "Yarn" : recipeOf(id)?.name ?? id);
export const craftOn = (state: GameState): boolean => state.unlocks.includes("craft");
export const jobsOf = (state: GameState): Job[] => state.jobs ?? [];
export const itemsOf = (state: GameState): Item[] => state.items ?? [];
export const fibreOf = (state: GameState): Fibre[] => state.fibre ?? [];
export const patternsOf = (state: GameState): string[] => state.patterns ?? [];

// ---- Benches ----------------------------------------------------------------------------------------------------

/** Phase 9 hook: extra capacity a bench gets from the birds working it. */
export function benchBonus(_state: GameState, _bench: BenchName): number {
  return 0;
}

/** Tier of a bench: 0 = none (weaving, felting), 1 = the bare bench, up. */
export function benchTier(state: GameState, bench: BenchName): number {
  let t = bench === "weave" || bench === "felt" ? 0 : 1;
  for (const u of BENCH_UPGRADES) if (u.bench === bench && hasUpgrade(state, u.id)) t = Math.max(t, u.tier);
  return t;
}
export const benchCapacity = (state: GameState, bench: BenchName): number =>
  benchTier(state, bench) === 0 && (bench === "weave" || bench === "felt") ? 0 : (BENCH_CAP[bench][benchTier(state, bench)] ?? 0) + benchBonus(state, bench);
export const benchOwned = (state: GameState, bench: BenchName): boolean => benchCapacity(state, bench) > 0;

export function handsLevel(state: GameState, bench: BenchName): number {
  const n = state.hands?.[bench] ?? 0;
  return HANDS_AT.filter((x) => n >= x).length;
}
export function handsWord(level: number): string {
  return ["new to it", "getting the knack", "steady hands", "practised", "skilled", "a master"][Math.min(5, level)]!;
}
export const sigmaAt = (state: GameState, bench: BenchName): number =>
  (BENCH_SIGMA[benchTier(state, bench)] ?? 10) * (1 - HANDS_TRIM * handsLevel(state, bench));

// ---- Routes and materials -----------------------------------------------------------------------------------------

/** The stages from a source: a fleece lot, a batt or a ball of yarn. */
export function routeFor(item: string, from: "lot" | "batt" | "yarn"): CraftStage[] | null {
  if (item === "batt") return from === "lot" ? ["card"] : null;
  if (item === "yarn") return from === "lot" ? ["card", "spin"] : from === "batt" ? ["spin"] : null;
  const r = recipeOf(item);
  if (!r) return null;
  if (r.bench === "felt") return from === "yarn" ? null : from === "lot" ? ["card", "felt"] : ["felt"];
  return from === "lot" ? ["card", "spin", r.bench] : from === "batt" ? ["spin", r.bench] : [r.bench];
}

/** Kg of fibre a job uses. */
export function jobKg(item: string): number {
  return item === "batt" || item === "yarn" ? STOCK_KG : recipeOf(item)?.kg ?? 0;
}
/** Work units of one stage. */
export function stageUnits(item: string, stage: CraftStage): number {
  if (stage === "card" || stage === "spin") return jobKg(item);
  return recipeOf(item)?.work ?? 0;
}

export type SourceKey = string; // "lot:L3" | "fibre:F2"

export interface Source { key: SourceKey; from: "lot" | "batt" | "yarn"; mat: Material; label: string }

export function sourceOf(state: GameState, key: string): Source | null {
  const [k, id] = key.split(":");
  if (k === "lot") {
    const l = storeOf(state).find((x) => x.id === id);
    if (!l) return null;
    return { key, from: "lot", label: `${l.name}'s ${l.word} fleece`, mat: { lot: l.id, name: l.name, type: l.type, family: l.family, word: l.word, hex: l.hex, microns: l.microns, intensity: l.intensity, staple: l.staple ?? 90, fond: l.fond, kg: l.clean } };
  }
  if (k === "fibre") {
    const f = fibreOf(state).find((x) => x.id === id);
    if (!f) return null;
    return { key, from: f.form, label: `${f.form === "batt" ? "Batt" : "Yarn"} of ${f.name}'s ${f.word} wool`, mat: f };
  }
  return null;
}
export function allSources(state: GameState): Source[] {
  return [...storeOf(state).map((l) => `lot:${l.id}`), ...fibreOf(state).map((f) => `fibre:${f.id}`)].map((k) => sourceOf(state, k)!).filter(Boolean);
}

// ---- Quality ----------------------------------------------------------------------------------------------------

const NEUTRAL = ["white", "oatmeal", "taupe", "charcoal", "brown"];

export interface QFactors { fit: number; fine: number; staple: number; colour: number; care: number }

export function qualityFactors(mat: Material, r: Recipe, spins: boolean): QFactors {
  const fit = woolSuit(mat.type as WoolType, r.id);
  const fine = Math.max(0.4, 1 - 0.04 * Math.max(0, mat.microns - r.micron));
  const need = Math.max(spins ? 50 : 0, r.minStaple ?? 0);
  const staple = mat.staple < need ? 0.7 : 1;
  const colour = r.colour === "any" ? 1
    : r.colour === "natural" ? (NEUTRAL.includes(mat.family) ? 1 : 0.5)
    : mat.family === "white" || mat.intensity < 0.3 ? 1 : 0.5;
  const care = Math.max(-0.05, Math.min(0.1, mat.fond - 1));
  return { fit, fine, staple, colour, care };
}
export const qualityBase = (f: QFactors): number => Math.max(0, Math.min(100, 100 * f.fit * f.fine * f.staple * f.colour * (1 + f.care)));

/** Mixed fleece evenness (future blending): 1 for one fleece, falling with the spread of colour strength. */
export function evenFactor(intensities: number[]): number {
  if (intensities.length < 2) return 1;
  const m = intensities.reduce((a, b) => a + b, 0) / intensities.length;
  const sd = Math.sqrt(intensities.reduce((a, b) => a + (b - m) ** 2, 0) / intensities.length);
  return Math.max(0.7, 1 - 0.5 * sd);
}

export function starsOf(q: number): number {
  return q >= 85 ? 5 : q >= 70 ? 4 : q >= 55 ? 3 : q >= 35 ? 2 : 1;
}
export const starsWord = (n: number): string => "★".repeat(n);
export function qualityWord(stars: number): string {
  return ["", "poor", "plain", "good", "fine", "superb"][stars]!;
}

/** Coins an item of quality q fetches with its meter at d (one unit). */
export function itemPrice(kind: string, q: number, d: number): { coins: number; after: number; mult: number } {
  const r = recipeOf(kind)!;
  const run = sellRun(d, 1, r.step);
  return { coins: Math.max(1, Math.round(r.base * (0.5 + q / 100) * run.mult)), after: run.after, mult: run.mult };
}

// ---- Patterns -----------------------------------------------------------------------------------------------------

export interface PatternState { item: ItemId; known: boolean; hint: string }

function ownedTypes(state: GameState): { types: Set<string>; minMicrons: number } {
  const types = new Set<string>();
  let minMicrons = 99;
  for (const l of storeOf(state)) { types.add(l.type); minMicrons = Math.min(minMicrons, l.microns); }
  for (const f of fibreOf(state)) { types.add(f.type); minMicrons = Math.min(minMicrons, f.microns); }
  for (const s of flockSheep(state)) if (isAdult(s, state.season)) { types.add(woolTypeOf(s)); minMicrons = Math.min(minMicrons, Number(s.phenotype["fineness"])); }
  return { types, minMicrons };
}

/** Why a pattern isn't known yet, in plain words, or null when its conditions hold. */
export function patternHint(state: GameState, item: ItemId): string | null {
  const made = state.craft?.made ?? 0, spun = state.craft?.spun ?? 0, own = ownedTypes(state);
  const need = (n: number, what = "item"): string | null => (made >= n ? null : `Finish ${n - made} more ${what}${n - made === 1 ? "" : "s"}.`);
  switch (item) {
    case "socks": return null;
    case "beanie": return need(1);
    case "dryerBalls": case "teaCosy": return hasUpgrade(state, "feltTable") ? null : "Get a felting table.";
    case "gumbootSocks": return need(2) ?? (own.types.has("strong") || own.types.has("crossbred") ? null : "Needs a strong or crossbred fleece.");
    case "mittens": return made < 1 ? need(1) : spun >= 1 ? null : "Spin some yarn first.";
    case "slippers": return handsLevel(state, "felt") >= 3 ? null : "Practise felting.";
    case "scarf": return spun < 3 ? `Spin ${3 - spun} more batch${3 - spun === 1 ? "" : "es"} of yarn.` : need(3);
    case "babyShawl": return need(4) ?? (own.minMicrons <= 19 ? null : "Needs a very fine fleece.");
    case "lopapeysa": return need(4) ?? (own.types.has("lopi") ? null : "Needs a double-coated sheep.");
    case "bushShirt": return need(5) ?? (!hasUpgrade(state, "tableLoom") ? "Get a table loom." : own.types.has("strong") ? null : "Needs a strong fleece.");
    case "rug": return need(5) ?? (!hasUpgrade(state, "tableLoom") ? "Get a table loom." : own.types.has("carpet") ? null : "Needs a carpet-wool fleece.");
  }
}

/** Learn any patterns whose conditions now hold. Returns the new ones with the reason. */
export function updatePatterns(state: GameState): { item: string; why: string }[] {
  if (!craftOn(state)) return [];
  const known = (state.patterns ??= []);
  const fresh: { item: string; why: string }[] = [];
  const WHY: Record<string, string> = {
    socks: "Old Tom's first pattern.", beanie: "You have knitted your first item.", dryerBalls: "The felting table.", teaCosy: "The felting table.",
    gumbootSocks: "A strong fleece in the shed.", mittens: "You can spin and knit.", slippers: "Your felting hands have grown steady.",
    scarf: "Plenty of yarn spun.", babyShawl: "A very fine fleece to knit.", lopapeysa: "A double-coated sheep to work with.",
    bushShirt: "A loom and a strong fleece.", rug: "A loom and a carpet fleece.",
  };
  for (const r of RECIPES) {
    if (known.includes(r.id) || patternHint(state, r.id) !== null) continue;
    known.push(r.id);
    if (r.id !== "socks") fresh.push({ item: r.id, why: WHY[r.id]! });
  }
  return fresh;
}

export function patternList(state: GameState): PatternState[] {
  return RECIPES.map((r) => ({ item: r.id, known: patternsOf(state).includes(r.id), hint: patternHint(state, r.id) ?? "" }));
}

/** The woolshed opens: Old Tom's spare fleece, the first pattern, and the wool waits in the store until sold. */
export function onCraftArrives(state: GameState, play = true): void {
  state.patterns = [...new Set([...(state.patterns ?? []), "socks"])];
  state.craft ??= { made: 0, spun: 0 };
  if (play) { state.autoSell = false; giftFleece(state); }
}

/** Old Tom's spare fleece (a fixed, plain medium wool), put in the store. */
export function giftFleece(state: GameState): void {
  const n = state.nextLot ?? 1;
  state.nextLot = n + 1;
  (state.store ??= []).push({
    id: `L${n}`, sheep: "tom", name: "Old Tom", season: state.season, greasy: 1.4, clean: GIFT_FLEECE.kg, type: "medium", family: "white",
    word: "snow-white", hex: "#f3efe6", microns: GIFT_FLEECE.microns, intensity: 0, rate: 5, fond: 1, staple: GIFT_FLEECE.staple,
  });
}

// ---- Forecast -----------------------------------------------------------------------------------------------------

export interface JobPlan { item: string; source: string }

export interface JobForecast {
  ok: boolean;
  why: string;
  route: CraftStage[];
  /** The season (state.season after its sleep) it will be done. */
  finish: number;
  seasons: number;
  kg: number;
  /** Quality band (P10-P90) and expected, star band, coin band. */
  q0: number; qLo: number; qHi: number;
  starsLo: number; starsHi: number;
  coinsLo: number; coinsHi: number;
  /** Plain reasons the quality is not higher. */
  notes: string[];
  /** The meter at finish (projected). */
  demand: number;
  stock: boolean;
}

const Z90 = 1.2816;

interface Sim { route: CraftStage[]; left: number }

/** Advances (sleeps) until each job in the queue plus an extra one is finished, using today's benches. Returns the extra's count. */
export function projectFinish(state: GameState, extra: { route: CraftStage[]; left: number; item: string }): number {
  const jobs: (Sim & { item: string; seasons: number })[] = [
    ...jobsOf(state).map((j) => ({ route: [...j.route], left: j.left, item: j.item, seasons: 0 })), { ...extra, route: [...extra.route], seasons: 0 },
  ];
  const mine = jobs[jobs.length - 1]!;
  for (let n = 1; n <= 60; n++) {
    const cap: Record<string, number> = {};
    for (const j of jobs) {
      if (!j.route.length) continue;
      const st = j.route[0]!;
      cap[st] ??= benchCapacity(state, st);
      const use = Math.min(cap[st]!, j.left);
      cap[st]! -= use; j.left -= use;
      if (j.left <= 1e-9) { j.route.shift(); j.left = j.route.length ? stageUnits(j.item, j.route[0]!) : 0; }
    }
    if (!mine.route.length) return n;
  }
  return 60;
}

export function forecastJob(state: GameState, plan: JobPlan): JobForecast {
  const bad = (why: string): JobForecast => ({ ok: false, why, route: [], finish: 0, seasons: 0, kg: 0, q0: 0, qLo: 0, qHi: 0, starsLo: 0, starsHi: 0, coinsLo: 0, coinsHi: 0, notes: [], demand: 1, stock: false });
  const src = sourceOf(state, plan.source);
  if (!craftOn(state)) return bad("The woolshed isn't open yet.");
  if (!src) return bad("Pick some wool first.");
  const stock = plan.item === "batt" || plan.item === "yarn";
  if (!stock && !patternsOf(state).includes(plan.item)) return bad("You don't know that pattern yet.");
  const r = recipeOf(plan.item);
  if (!stock && !r) return bad("There's no such pattern.");
  const route = routeFor(plan.item, src.from);
  if (!route) return bad(src.from === "yarn" && r?.bench === "felt" ? "Felt needs fleece or a batt, not yarn." : "That wool is already past this step.");
  for (const st of route) if (!benchOwned(state, st)) return bad(`You need a ${st === "weave" ? "loom" : "felting table"} for that.`);
  if (jobsOf(state).length >= MAX_JOBS) return bad("The queue is full.");
  const kg = jobKg(plan.item);
  if (src.mat.kg + 1e-9 < kg) return bad(`Not enough wool: ${plan.item === "batt" || plan.item === "yarn" ? "a batch" : r!.name.toLowerCase()} needs ${kg} kg and this has ${src.mat.kg.toFixed(1)}.`);
  if (r && woolSuit(src.mat.type as WoolType, r.id) === 0) return bad("This wool can't be made into that.");
  const seasons = projectFinish(state, { route, left: stageUnits(plan.item, route[0]!), item: plan.item });
  const finish = state.season + seasons;
  if (stock) {
    return { ok: true, why: "", route, finish, seasons, kg, q0: 0, qLo: 0, qHi: 0, starsLo: 0, starsHi: 0, coinsLo: 0, coinsHi: 0, notes: [], demand: 1, stock: true };
  }
  const f = qualityFactors(src.mat, r!, route.includes("spin") || src.from === "yarn");
  const q0 = qualityBase(f);
  const fin = route[route.length - 1]! as BenchName;
  const sd = sigmaAt(state, fin);
  const qLo = Math.max(0, q0 - Z90 * sd), qHi = Math.min(100, q0 + Z90 * sd);
  const d = projectDemand(state, itemKey(plan.item), finish, jobsOf(state).filter((j) => j.item === plan.item).length * r!.step + itemsOf(state).filter((i) => i.kind === plan.item).length * r!.step);
  const m = demandMult(d);
  const notes: string[] = [];
  if (f.fit < 1) notes.push(`${src.mat.word.includes("fleece") ? "This" : "This"} wool ${f.fit >= 0.8 ? "suits it well" : "only just suits it"}.`);
  if (f.fine < 0.95) notes.push("A little coarse for it.");
  if (f.staple < 1) notes.push("The fibres are on the short side.");
  if (f.colour < 1) notes.push(r!.colour === "natural" ? "Only natural colours are wanted." : "Only pale wool will do.");
  return {
    ok: true, why: "", route, finish, seasons, kg, q0, qLo, qHi, starsLo: starsOf(qLo), starsHi: starsOf(qHi),
    coinsLo: Math.max(1, Math.round(r!.base * (0.5 + qLo / 100) * m)), coinsHi: Math.max(1, Math.round(r!.base * (0.5 + qHi / 100) * m)), notes, demand: d, stock: false,
  };
}

// ---- Actions ----------------------------------------------------------------------------------------------------

/** Queue a job: takes the wool from the lot or the stock at once. */
export function queueJob(state: GameState, plan: JobPlan): Job {
  const fc = forecastJob(state, plan);
  if (!fc.ok) throw new Error(fc.why);
  const src = sourceOf(state, plan.source)!;
  const kg = fc.kg;
  const mat: Material = { ...src.mat, kg };
  if (src.key.startsWith("lot:")) {
    const lot = storeOf(state).find((l) => l.id === src.mat.lot)!;
    const frac = kg / lot.clean;
    lot.greasy = Math.round(lot.greasy * (1 - frac) * 100) / 100;
    lot.clean = Math.round((lot.clean - kg) * 100) / 100;
    if (lot.clean < 0.05) state.store = storeOf(state).filter((l) => l.id !== lot.id);
  } else {
    const f = fibreOf(state).find((x) => x.id === src.key.split(":")[1])!;
    f.kg = Math.round((f.kg - kg) * 100) / 100;
    if (f.kg < 0.05) state.fibre = fibreOf(state).filter((x) => x.id !== f.id);
  }
  const id = state.nextJob ?? 1;
  state.nextJob = id + 1;
  const job: Job = {
    id, item: plan.item, route: fc.route, left: stageUnits(plan.item, fc.route[0]!), started: false, from: src.from, spins: src.from === "yarn" || fc.route.includes("spin"), queued: state.season, mat,
    seen: { starsLo: fc.starsLo, starsHi: fc.starsHi, coinsLo: fc.coinsLo, coinsHi: fc.coinsHi, qLo: Math.round(fc.qLo), qHi: Math.round(fc.qHi), finish: fc.finish },
  };
  (state.jobs ??= []).push(job);
  addLog(state, `Woolshed: ${itemName(plan.item).toLowerCase()} from ${src.label}, ready in about ${fc.seasons} seasons.`);
  return job;
}

/** Cancel a job that has not begun: the wool goes back as stock fibre (a lot's wool returns to the store as a small lot). */
export function cancelJob(state: GameState, id: number): void {
  const j = jobsOf(state).find((x) => x.id === id);
  if (!j) throw new Error("That job isn't in the queue.");
  if (j.started) throw new Error("It's already been started — it can't be cancelled now.");
  state.jobs = jobsOf(state).filter((x) => x.id !== id);
  const n = state.nextLot ?? 1;
  state.nextLot = n + 1;
  const m = j.mat;
  if (j.from === "lot") {
    // Nothing has been done to it: the wool goes back to the store as a lot.
    (state.store ??= []).push({ id: `L${n}`, sheep: "", name: m.name, season: state.season, greasy: Math.round((m.kg / 0.7) * 100) / 100, clean: m.kg, type: m.type, family: m.family, word: m.word, hex: m.hex, microns: m.microns, intensity: m.intensity, rate: 5, fond: m.fond, staple: m.staple });
  } else {
    const fid = state.nextFibre ?? 1;
    state.nextFibre = fid + 1;
    (state.fibre ??= []).push({ ...m, id: `F${fid}`, form: j.from });
  }
}

/** Sell one finished item. Returns the coins. */
export function sellItem(state: GameState, id: number): number {
  const it = itemsOf(state).find((x) => x.id === id);
  if (!it) throw new Error("That isn't in the shed.");
  const key = itemKey(it.kind);
  const p = itemPrice(it.kind, it.q, demandLevel(state, key));
  state.items = itemsOf(state).filter((x) => x.id !== id);
  lowerDemand(state, key, recipeOf(it.kind)!.step);
  state.money += p.coins;
  state.stats.coinsEarned += p.coins;
  addLog(state, `Sold ${itemName(it.kind).toLowerCase()} for ${p.coins} coins.`);
  return p.coins;
}

/** Sell every item of a kind, best first. */
export function sellItems(state: GameState, kind: string): { n: number; coins: number } {
  const all = itemsOf(state).filter((i) => i.kind === kind).sort((a, b) => b.q - a.q);
  let coins = 0;
  for (const it of all) coins += sellItem(state, it.id);
  return { n: all.length, coins };
}

export interface ItemSaleForecast { coins: number; before: number; after: number; n: number }
/** "After you sell" for n items of a kind (best first). */
export function forecastItemSale(state: GameState, kind: string, n?: number): ItemSaleForecast {
  const all = itemsOf(state).filter((i) => i.kind === kind).sort((a, b) => b.q - a.q).slice(0, n ?? 999);
  const before = demandLevel(state, itemKey(kind));
  let d = before, coins = 0;
  for (const it of all) { const p = itemPrice(kind, it.q, d); coins += p.coins; d = p.after; }
  return { coins, before, after: d, n: all.length };
}

// ---- The season turn --------------------------------------------------------------------------------------------

/** Run the woolshed for one season. Draws from `rng` only when a job finishes. */
export function craftSeason(state: GameState, rng: Rng, t: number): CraftReport | null {
  if (!craftOn(state) || !jobsOf(state).length) {
    return null;
  }
  const rep: CraftReport = { done: [], stock: [], advanced: [], newPatterns: [] };
  const cap: Record<string, number> = {};
  const keep: Job[] = [];
  for (const j of jobsOf(state)) {
    const st = j.route[0]!;
    cap[st] ??= benchCapacity(state, st);
    const use = Math.min(cap[st]!, j.left);
    cap[st]! -= use;
    if (use > 0) j.started = true;
    j.left = Math.round((j.left - use) * 1000) / 1000;
    if (j.left > 1e-9) { keep.push(j); continue; }
    if (st === "spin") state.craft = { made: state.craft?.made ?? 0, spun: (state.craft?.spun ?? 0) + 1 };
    j.route.shift();
    if (j.route.length) {
      j.left = stageUnits(j.item, j.route[0]!);
      rep.advanced.push({ job: j.id, name: itemName(j.item), stage: st });
      keep.push(j);
      continue;
    }
    // Finished.
    state.hands = { ...(state.hands ?? {}), [st]: (state.hands?.[st] ?? 0) + 1 };
    if (j.item === "batt" || j.item === "yarn") {
      const fid = state.nextFibre ?? 1;
      state.nextFibre = fid + 1;
      (state.fibre ??= []).push({ ...j.mat, id: `F${fid}`, form: j.item, kg: j.mat.kg });
      rep.stock.push({ form: j.item, kg: j.mat.kg, word: j.mat.word });
      continue;
    }
    const r = recipeOf(j.item)!;
    const f = qualityFactors(j.mat, r, j.spins);
    const q = Math.max(0, Math.min(100, Math.round(qualityBase(f) + rng.normal() * sigmaAt(state, st as BenchName))));
    const id = state.nextItem ?? 1;
    state.nextItem = id + 1;
    const item: Item = { id, kind: j.item, q, stars: starsOf(q), season: t + 1, hex: j.mat.hex, family: j.mat.family, word: j.mat.word, type: j.mat.type, seen: j.seen };
    (state.items ??= []).push(item);
    state.craft = { made: (state.craft?.made ?? 0) + 1, spun: state.craft?.spun ?? 0 };
    rep.done.push({ item, name: r.name });
    addLog(state, `Woolshed: ${r.name.toLowerCase()} finished, ${starsWord(item.stars)}.`);
  }
  state.jobs = keep;
  return rep;
}

/** At the end of the turn: new patterns (called after the woolshed ran and acts changed). */
export function craftPatterns(state: GameState, rep: CraftReport | null): CraftReport | null {
  const fresh = updatePatterns(state);
  if (!fresh.length) return rep;
  const r = rep ?? { done: [], stock: [], advanced: [], newPatterns: [] };
  r.newPatterns = fresh;
  return r;
}

export type { SeenForecast };
