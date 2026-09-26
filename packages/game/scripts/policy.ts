/**
 * A greedy farmer that plays the whole game through the public core API.
 * The "brain" decides how the farmer knows things: the oracle reads true genomes,
 * the blind brain uses only knowledge-limited forecasts.
 */
/*
 * Diagnostics (env vars): PROF=1 phase timings, MONEY=1 coin sources per season,
 * ORDERS=1 order outcomes per seed, PLANS=1 matings per season, FLOCK=1 final flock with true genotypes,
 * LEDGER=1 median coins by source over the run, PERSEED=1 one line per seed, UPACT=N buy farm improvements
 * only from act N. blind.ts/oracle.ts also take SEEDS=n and FROM=first seed.
 */
import {
  acceptOrder, advanceSeason, buyPrice, buySheep, canBreed, currentAct, enterFair, fairScore, flockSheep,
  forecastOrder, isAdult, isEnding, lambRoom, markEndingShown, newGame, pedigreeOf, planMating, ramAvailable, RAM_CAPACITY,
  sellSheep, hireVisitingRam, ageOf, buyUpgrade, upgradeBlocked, upgradeDef,
  type GameState, type Sheep,
} from "../src/core/index.js";

export interface CrossDist { colour: Record<string, number>; horns: Record<string, number>; learnBits?: number }
export interface Doses { d: number; a: number; B: number }

export interface Brain {
  name: string;
  cross(g: GameState, ewe: string, ram: string): CrossDist;
  /** Expected count (0..2) of the dilute, self-colour and black alleles. */
  doses(g: GameState, s: Sheep): Doses;
  /** Optional: spend on vet tests. */
  vet?(g: GameState): void;
}

export interface RunResult { ledger: Record<string, number>; seed: number; actSeason: number[]; endSeason: number | null; finalAct: number; money: number[]; stuck: string }

const fin = (s: Sheep) => Number(s.phenotype["fineness"]);

function blueValue(d: Doses): number {
  return d.d * 3 + d.a * 2 + Math.min(1, d.B) * 1;
}

/** How much the farmer wants to keep a sheep. */
function keepValue(g: GameState, b: Brain, s: Sheep): number {
  const act = g.act;
  const colour = String(s.phenotype["colour"]);
  let v = blueValue(b.doses(g, s));
  if (colour === "blue") v += 8;
  if (act >= 2) v += (26 - fin(s)) * (act >= 4 ? 1.2 : 0.6);
  if (act >= 4) v -= s.inbreeding * 30;
  if (act === 3 && g.fair.category !== "rare") v += fairScore(s, g.fair.category) * 1.5;
  if (s.rosettes.length) v += 1;
  const age = ageOf(s, g.season);
  if (age >= 18) v -= (age - 17) * 1.5;
  if (!isAdult(s, g.season)) v += 0.5;
  return v;
}

function matingScore(g: GameState, b: Brain, ewe: Sheep, ram: Sheep, cache: Map<string, CrossDist>): number {
  const key = `${ewe.id}|${ram.id}`;
  let c = cache.get(key);
  if (!c) { c = b.cross(g, ewe.id, ram.id); cache.set(key, c); }
  const act = g.act;
  const pBlue = c.colour["blue"] ?? 0;
  const F = pedigreeOf(g).offspringInbreeding(ewe.id, ram.id);
  let v = pBlue * 10 + (blueValue(b.doses(g, ewe)) + blueValue(b.doses(g, ram))) / 2 * 0.5;
  if (act <= 1 && c.learnBits) v += Math.min(2, c.learnBits);
  if (act >= 2) v += (26 - (fin(ewe) + fin(ram)) / 2) * (act >= 4 ? 1.5 : 0.6);
  if (act >= 3) v -= F * (act >= 4 ? 60 : 20);
  for (const id of g.acceptedOrders) {
    const o = g.orders.find((x) => x.id === id);
    if (!o || o.kind === "wool") continue;
    let p = 1;
    if (o.colour) p *= c.colour[o.colour] ?? 0;
    if (o.horns) p *= c.horns[o.horns] ?? 0;
    if (o.sex) p *= 0.5;
    v += p * 12;
  }
  return v;
}

function manageOrders(g: GameState): void {
  if (!g.unlocks.includes("orders")) return;
  for (const o of [...g.orders]) {
    if (o.status !== "open" || g.acceptedOrders.length >= 2) continue;
    if (forecastOrder(g, o.id).pFill >= 0.5) acceptOrder(g, o.id);
  }
}

function manageFair(g: GameState): void {
  if (!g.unlocks.includes("fair") || g.fair.nextSeason !== g.season) return;
  const pool = flockSheep(g).filter((s) => isAdult(s, g.fair.nextSeason));
  const best = pool.sort((a, b) => fairScore(b, g.fair.category) - fairScore(a, g.fair.category))[0];
  if (best) enterFair(g, best.id);
}

function breedingEwes(g: GameState): Sheep[] {
  return flockSheep(g).filter((s) => s.sex === "ewe" && canBreed(s, g.season));
}

/** Sheep whose fleece an accepted wool order is counting on. */
function reservedForOrders(g: GameState): Set<string> {
  const out = new Set<string>();
  for (const id of g.acceptedOrders) {
    const o = g.orders.find((x) => x.id === id);
    if (o?.kind !== "wool") continue;
    for (const s of flockSheep(g)) if (fin(s) <= (o.microns ?? 0)) out.add(s.id);
  }
  return out;
}

function manageFlock(g: GameState, b: Brain): void {
  const reserve = reservedForOrders(g);
  const rams = () => flockSheep(g).filter((s) => s.sex === "ram");
  // Make room: every breeding ewe should be able to lamb.
  let guard = 0;
  while (g.flock.length + Math.min(breedingEwes(g).length, g.flockCap) > g.flockCap && guard++ < 30) {
    const pool = flockSheep(g).filter((s) => !reserve.has(s.id) && !(s.sex === "ram" && rams().length <= 1));
    const worst = pool.sort((x, y) => keepValue(g, b, x) - keepValue(g, b, y))[0];
    if (!worst) break;
    sellSheep(g, worst.id);
  }
  // Too many rams eat without lambing: keep at most two adult rams plus young ones.
  const adultRams = rams().filter((s) => isAdult(s, g.season)).sort((x, y) => keepValue(g, b, y) - keepValue(g, b, x));
  for (const r of adultRams.slice(3)) if (!reserve.has(r.id)) sellSheep(g, r.id);
  // Buy something better than our worst if we can afford it comfortably.
  for (const id of [...g.market]) {
    const m = g.sheep[id]!;
    const price = buyPrice(m);
    const noRam = m.sex === "ram" && rams().filter((r) => canBreed(r, g.season)).length === 0;
    if (noRam && g.money >= price) {
      if (g.flock.length >= g.flockCap) { const w = flockSheep(g).filter((s) => s.sex === "ewe" && !reserve.has(s.id)).sort((x, y) => keepValue(g, b, x) - keepValue(g, b, y))[0]; if (w) sellSheep(g, w.id); }
      if (g.flock.length < g.flockCap) { buySheep(g, id); continue; }
    }
    if (g.money < price + 30) continue;
    const worst = flockSheep(g).filter((s) => !reserve.has(s.id)).sort((x, y) => keepValue(g, b, x) - keepValue(g, b, y))[0];
    const needRam = m.sex === "ram" && rams().filter((r) => canBreed(r, g.season)).length === 0;
    const needEwe = m.sex === "ewe" && flockSheep(g).filter((s) => s.sex === "ewe" && ageOf(s, g.season) < 16).length < 5;
    if (needEwe && g.flock.length < g.flockCap) { buySheep(g, id); continue; }
    const better = worst && keepValue(g, b, m) > keepValue(g, b, worst) + 2;
    if (!needRam && !better) continue;
    if (g.flock.length >= g.flockCap) { if (worst && better) sellSheep(g, worst.id); else continue; }
    buySheep(g, id);
  }
}

/** Buy farm improvements in a sensible order once they're affordable with a little to spare. */
function manageUpgrades(g: GameState): void {
  if (g.act < Number(process.env["UPACT"] ?? 0)) return;
  for (const id of ["paddock", "dog", "barn", "shearing", "meadow"] as const) {
    if (!upgradeBlocked(g, id) && g.money >= upgradeDef(id).price + 40) buyUpgrade(g, id);
  }
}

function manageVisitor(g: GameState, b: Brain, cache: Map<string, CrossDist>): void {
  const v = g.visitingRam;
  if (!v || v.season !== g.season || g.hiredRam || g.money < v.fee + 20) return;
  const vis = g.sheep[v.id]!;
  const ewes = breedingEwes(g);
  let gain = 0;
  for (const e of ewes) {
    const own = flockSheep(g).filter((r) => r.sex === "ram" && ramAvailable(g, r.id)).map((r) => matingScore(g, b, e, r, cache));
    const best = own.length ? Math.max(...own) : -99;
    gain += Math.max(0, matingScore(g, b, e, vis, cache) - best);
  }
  if (gain > 1) hireVisitingRam(g);
}

function planAll(g: GameState, b: Brain, cache: Map<string, CrossDist>): void {
  const rams = flockSheep(g).filter((r) => r.sex === "ram" && ramAvailable(g, r.id));
  if (g.hiredRam && ramAvailable(g, g.hiredRam)) rams.push(g.sheep[g.hiredRam]!);
  const opts: { e: Sheep; r: Sheep; v: number }[] = [];
  for (const e of breedingEwes(g)) for (const r of rams) opts.push({ e, r, v: matingScore(g, b, e, r, cache) });
  opts.sort((x, y) => y.v - x.v);
  const used = new Set<string>(), load = new Map<string, number>();
  for (const o of opts) {
    if (used.has(o.e.id) || (load.get(o.r.id) ?? 0) >= RAM_CAPACITY || lambRoom(g) < 1) continue;
    planMating(g, o.e.id, o.r.id);
    used.add(o.e.id); load.set(o.r.id, (load.get(o.r.id) ?? 0) + 1);
  }
}

export async function play(seed: number, b: Brain, maxSeasons = 60): Promise<RunResult> {
  const g = newGame(seed);
  const actSeason = [0, -1, -1, -1, -1];
  const money: number[] = [];
  let endSeason: number | null = null;
  const ledger: Record<string, number> = {};
  for (let t = 0; t < maxSeasons; t++) {
    const cache = new Map<string, CrossDist>();
    const T = (label: string, f: () => void) => { const t0 = Date.now(), m0 = g.money; f(); ledger[label] = (ledger[label] ?? 0) + g.money - m0; if (process.env["PROF"]) console.error(g.season, label, Date.now() - t0); };
    T("orders", () => manageOrders(g));
    T("fair", () => manageFair(g));
    T("vet", () => b.vet?.(g));
    T("upgrades", () => manageUpgrades(g));
    T("flock", () => manageFlock(g, b));
    T("visitor", () => manageVisitor(g, b, cache));
    T("plan", () => planAll(g, b, cache));
    let r!: ReturnType<typeof advanceSeason>;
    if (process.env["PLANS"]) console.log(g.season, "act", g.act, "flock", g.flock.length, "plans", Object.entries(g.plans).map(([e, ra]) => `${g.sheep[e]!.name}x${g.sheep[ra]!.name}`).join(","), "orders", g.acceptedOrders.length);
    T("advance", () => { r = advanceSeason(g); });
    const add = (k: string, v: number) => { ledger[k] = (ledger[k] ?? 0) + v; };
    add("wool", r.income); add("feed", -r.feed); add("orderPay", r.orderResults.reduce((t, o) => t + o.reward, 0));
    add("fairPay", r.fairResult?.prize ?? 0); add("autoSold", r.autoSold.reduce((t, a) => t + a.price, 0));
    money.push(g.money);
    if (process.env["MONEY"]) console.log(g.season, g.act, "money", g.money, "wool", r.income, "feed", r.feed, "orders", r.orderResults.reduce((t, o) => t + o.reward, 0), "fair", r.fairResult?.prize ?? 0, "auto", r.autoSold.reduce((t, a) => t + a.price, 0), "flock", g.flock.length, "log", g.log.filter((l) => l.season === g.season - 1 && l.text.startsWith("Sold")).map((l) => l.text.match(/(\d+) coins/)?.[1]).join(","));
    if (r.actAdvanced) actSeason[r.actAdvanced.act] = g.season;
    if (isEnding(g)) { endSeason = g.season; markEndingShown(g); break; }
  }
  const a = currentAct(g);
  if (process.env["FLOCK"]) {
    const { genotypeString } = await import("@blue-sheep/genetics");
    const { genomeOf, species } = await import("../src/core/index.js");
    for (const s of flockSheep(g)) console.log(s.name, s.sex, g.season - s.born, s.phenotype["colour"], ["A", "B", "D"].map((l) => genotypeString(genomeOf(s), species.map, l)).join(" "), JSON.stringify(b.doses(g, s)), "F", s.inbreeding.toFixed(2));
    console.log("market", g.market.map((id) => g.sheep[id]!).map((s) => `${s.sex} ${s.phenotype["colour"]} ${["A", "B", "D"].map((l) => genotypeString(genomeOf(s), species.map, l)).join(" ")}`).join(" | "), "money", g.money);
  }
  if (process.env["ORDERS"]) {
    const h = g.orderHistory;
    const by = (st: string) => h.filter((o) => o.status === st);
    console.log(`seed ${seed}: posted ${g.nextOrderId - 1}, filled ${by("filled").length} [${by("filled").map((o) => o.kind + ":" + (o.colour ?? o.horns ?? o.kg)).join(" ")}], failed ${by("failed").length} [${by("failed").map((o) => o.kind + ":" + (o.colour ?? o.horns ?? o.kg + "kg<" + o.microns)).join(" ")}], expired ${by("expired").length} [${by("expired").map((o) => o.kind + ":" + (o.colour ?? o.horns ?? o.kg)).join(" ")}]`);
  }
  return { ledger, seed, actSeason, endSeason, finalAct: g.act, money, stuck: endSeason ? "" : `act ${g.act}: ${a.progressText}` };
}

export function summarise(label: string, results: RunResult[], maxSeasons: number): void {
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : NaN; };
  console.log(`\n== ${label}: ${results.length} seeds, max ${maxSeasons} seasons ==`);
  for (let act = 1; act <= 4; act++) {
    const reached = results.filter((r) => r.actSeason[act]! >= 0);
    const inAct = reached.map((r) => r.actSeason[act]! - r.actSeason[act - 1]!);
    console.log(`act ${act - 1}→${act}: reached ${reached.length}/${results.length}, median arrival season ${med(reached.map((r) => r.actSeason[act]!))}, median seasons spent in act ${act - 1}: ${med(inAct)}`);
  }
  const done = results.filter((r) => r.endSeason !== null);
  const act4 = results.filter((r) => r.endSeason !== null).map((r) => r.endSeason! - r.actSeason[4]!);
  console.log(`ending: ${done.length}/${results.length} (${Math.round((100 * done.length) / results.length)}%), median season ${med(done.map((r) => r.endSeason!))}, median seasons in act 4: ${med(act4)}`);
  const ends = results.map((r) => r.money[r.money.length - 1] ?? 0).sort((x, y) => x - y);
  const pct = (q: number) => ends[Math.min(ends.length - 1, Math.floor(q * ends.length))]!;
  console.log(`median money at end: ${med(ends)} (min ${ends[0]}, p10 ${pct(0.1)}, p90 ${pct(0.9)}), max money seen: ${Math.max(...results.flatMap((r) => r.money))}, min money seen: ${Math.min(...results.flatMap((r) => r.money))}`);
  const at = (t: number) => med(results.filter((r) => r.money.length > t).map((r) => r.money[t]!));
  console.log(`median money after season 8: ${at(7)}, 20 (year 5): ${at(19)}, 40: ${at(39)} (seeds still playing)`);
  if (process.env["PERSEED"]) for (const r of results) console.log(`  seed ${r.seed}: end season ${r.endSeason ?? "-"}, money ${r.money[r.money.length - 1]}, acts at ${r.actSeason.join(",")}`);
  if (process.env["LEDGER"]) {
    const keys = [...new Set(results.flatMap((r) => Object.keys(r.ledger)))];
    console.log("ledger (median over seeds, whole run):", keys.map((k) => `${k} ${med(results.map((r) => r.ledger[k] ?? 0))}`).join(", "));
  }
  for (const r of results.filter((x) => x.endSeason === null)) console.log(`  seed ${r.seed} unfinished — ${r.stuck} (acts at ${r.actSeason.join(",")})`);
}
