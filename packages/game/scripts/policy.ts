/**
 * A greedy farmer that plays the whole game through the public core API.
 * The "brain" decides how the farmer knows things: the oracle reads true genomes,
 * the blind brain uses only knowledge-limited forecasts.
 */
/*
 * Diagnostics (env vars): PROF=1 phase timings, MONEY=1 coin sources per season,
 * ORDERS=1 order outcomes per seed, PLANS=1 matings per season, FLOCK=1 final flock with true genotypes,
 * LEDGER=1 median coins by source over the run, PERSEED=1 one line per seed, UPACT=N buy farm improvements
 * only from act N, NOCARE=1 never greet or treat, NODOGS=1 never buy dogs or the cat. blind.ts/oracle.ts also take
 * SEEDS=n and FROM=first seed.
 */
import {
  acceptOrder, advanceSeason, buyPrice, buySheep, canBreed, currentAct, enterFair, fairScore, flockSheep,
  forecastOrder, isAdult, isEnding, lambRoom, markEndingShown, newGame, pedigreeOf, planMating, ramAvailable, RAM_CAPACITY,
  sellSheep, hireVisitingRam, ageOf, buyUpgrade, upgradeBlocked, upgradeDef, greetAnimal, giveTreat, treatBlocked,
  ownedPets, fondnessOf, hasUpgrade, brushAnimal, woolOf, FINE_REF, feedPerHead, isShearingSeason,
  allSources, craftOn, demandLevel, forecastJob, itemKey, itemPrice, itemsOf, jobsOf, lotPrice, patternsOf, queueJob, rawKey, sellItem, sellLot, storeCap, storeOf,
  type GameState, type Order, type Sheep, type UpgradeId,
} from "../src/core/index.js";

/** Coins to keep back in a non-shearing season: feed is due every season but wool only pays in shearing seasons. */
export function feedReserve(g: GameState): number {
  return isShearingSeason(g.season) ? 0 : Math.ceil(feedPerHead(g.season) * g.flock.length);
}

export interface CrossDist {
  /** Chance a lamb is true blue, and full (not pale) blue of any strength (the registry's blue). */
  trueBlue: number;
  blue: number;
  /** Chance a lamb fits a colour order's colour. */
  pOrder(o: Order): number;
  horns: Record<string, number>;
  learnBits?: number;
}
/** Expected copies (as the brain knows them): blue "+" (0..4), colour "w" (0..2), red + yellow "+" (0..8). */
export interface Doses { blue: number; w: number; ry: number }

export interface Brain {
  name: string;
  cross(g: GameState, ewe: string, ram: string): CrossDist;
  /** Expected copies of blue paint, hidden colour and red/yellow paint. */
  doses(g: GameState, s: Sheep): Doses;
  /** Optional: spend on vet tests. */
  vet?(g: GameState): void;
}

/** Revenue by source in year 3 (seasons 8 to 11): "raw", "orders", "fair" and one entry per item kind. */
export type Revenue = Record<string, number>;
export interface RunResult { y3?: Revenue; y34?: Revenue; ledger: Record<string, number>; seed: number; actSeason: number[]; endSeason: number | null; finalAct: number; money: number[]; stuck: string; firstTrueBlue: number | null }

const fin = (s: Sheep) => Number(s.phenotype["fineness"]);
/** Act 4's registry wants the flock mean at or under 28 µm, so only wool coarser than this costs anything: finer is no use. */
const FINE_ENOUGH = 24;
const coarse = (x: number) => Math.max(0, x - FINE_ENOUGH);

/** How much a sheep's genes help towards true blue: blue paint and hidden colour help; red and yellow paint muddy it. */
function blueValue(d: Doses): number {
  return d.blue * 2 + d.w * 1.2 - d.ry * 1.2;
}

/** True when no sheep in the flock carries blue paint, as far as the farmer knows: bring a blue carrier in. */
function flockLacksBlue(g: GameState, b: Brain): boolean {
  return g.act <= 1 && flockSheep(g).every((x) => b.doses(g, x).blue < 0.3);
}

/** How much the farmer wants to keep a sheep. */
function keepValue(g: GameState, b: Brain, s: Sheep): number {
  const act = g.act;
  const w = woolOf(s);
  const d = b.doses(g, s);
  let v = blueValue(d);
  if (d.blue >= 0.3 && flockLacksBlue(g, b)) v += 6;
  if (w.name === "blue") v += 6;
  if (w.trueBlue) v += 4;
  if (act >= 2) v += act >= 4 ? -coarse(fin(s)) * 1.2 : (FINE_REF - fin(s)) * 0.6;
  if (act >= 4 && w.name === "blue") v += 8; // the registry counts blue sheep: never trade them for finer non-blues
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
  const F = pedigreeOf(g).offspringInbreeding(ewe.id, ram.id);
  let v = (act <= 1 ? c.trueBlue * 10 : c.blue * 6 + c.trueBlue * 4) + (blueValue(b.doses(g, ewe)) + blueValue(b.doses(g, ram))) / 2 * 0.5;
  if (act <= 1 && c.learnBits) v += Math.min(2, c.learnBits);
  if (act >= 2) v += act >= 4 ? -coarse((fin(ewe) + fin(ram)) / 2) * 1.5 : (FINE_REF - (fin(ewe) + fin(ram)) / 2) * 0.6;
  if (act >= 3) v -= F * (act >= 4 ? 60 : 20);
  for (const id of g.acceptedOrders) {
    const o = g.orders.find((x) => x.id === id);
    if (!o || o.kind === "wool") continue;
    let p = 1;
    if (o.colour) p *= c.pOrder(o);
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

/** Best true-blue chance of crossing `x` with an opposite-sex breeder we own, as the farmer's forecast sees it. */
function bestTrueBlue(g: GameState, b: Brain, x: Sheep): number {
  let best = 0;
  for (const o of flockSheep(g)) {
    if (o.sex === x.sex || !canBreed(o, g.season)) continue;
    const [e, r] = x.sex === "ewe" ? [x, o] : [o, x];
    best = Math.max(best, b.cross(g, e.id, r.id).trueBlue);
  }
  return best;
}

/** How much better a market sheep's best cross is than the flock's own best (0 when it isn't worth buying). */
function complementGain(g: GameState, b: Brain, m: Sheep): number {
  const own = flockSheep(g).filter((x) => x.sex === "ewe" && canBreed(x, g.season)).flatMap((e) => flockSheep(g).filter((r) => r.sex === "ram" && canBreed(r, g.season)).map((r) => b.cross(g, e.id, r.id).trueBlue));
  const base = own.length ? Math.max(...own) : 0;
  const cand = bestTrueBlue(g, b, m);
  return cand > base * 1.5 + 0.03 ? cand - base : 0;
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
    // Act 1 dead end: a flock fixed on red or short of blue can't make a true blue lamb however it mates. Bring in
    // a sheep that, crossed with someone we own, forecasts a clearly better chance of one.
    if (g.act <= 1 && g.money >= price + 15 + feedReserve(g) && complementGain(g, b, m) > 0) {
      const w = flockSheep(g).filter((s) => !reserve.has(s.id) && s.sex === m.sex).sort((x, y) => keepValue(g, b, x) - keepValue(g, b, y))[0];
      if (g.flock.length >= g.flockCap && w) sellSheep(g, w.id);
      if (g.flock.length < g.flockCap) { buySheep(g, id); continue; }
    }
    if (g.money < price + 30 + feedReserve(g)) continue;
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

/**
 * Buy farm improvements in a sensible order once they're affordable with a little to spare. Dogs: the cheap
 * terrier as a stop-gap when a fox is announced early on; from act 2 the collie, then the Maremma (wolves
 * roam from act 2; bought at once when one is announced). The cat from act 2, once there is wool worth guarding.
 */
function manageUpgrades(g: GameState): void {
  if (g.act < Number(process.env["UPACT"] ?? 0)) return;
  const buy = (id: UpgradeId, spare = 40) => { if (!upgradeBlocked(g, id) && g.money >= upgradeDef(id).price + spare + feedReserve(g)) buyUpgrade(g, id); };
  const ev = g.pendingEvent?.kind;
  const dogs = () => ["terrier", "collie", "maremma"].filter((d) => hasUpgrade(g, d as UpgradeId)).length;
  if (process.env["NODOGS"]) {
    for (const id of ["paddock", "barn", "shearing", "meadow"] as const) buy(id);
    return;
  }
  // Early on, coins go to breeding and the vet: only a cheap terrier as a stop-gap when a fox is announced.
  if (ev === "fox" && !dogs()) buy("terrier", 20);
  if (ev === "wolf") buy("maremma", 10);
  if (g.act < 2) { for (const id of ["paddock", "barn"] as const) buy(id); return; }
  for (const id of ["paddock", "collie", "cat", "barn", "maremma", "shearing", "meadow"] as const) buy(id);
}


/** Bench upgrades in order of what they unlock per coin: the wheel and circle first (the spinning wheel is the bottleneck). */
const BENCH_BUY: UpgradeId[] = ["wheel", "circle", "drumCarder", "feltTable", "knitHall", "wheel2", "tableLoom", "millShare", "floorLoom", "feltSink"];

/**
 * Crafting policy (DESIGN-v3 Phase 5): auto-sell is off once crafting arrives, wool goes through the benches, finished items
 * are sold while their meter is healthy (or when cash is short), spare fleece goes raw, bench upgrades are bought with spare coins.
 * `sale(cat, coins)` books revenue by source.
 */
function manageCraft(g: GameState, sale: (cat: string, coins: number) => void): void {
  if (!craftOn(g)) return;
  const reserve = feedReserve(g);
  // The cheap knitting circle at once; the rest with a cushion (more of one while the blue hunt in act 1 needs coins).
  for (const id of BENCH_BUY) {
    const spare = id === "circle" ? 60 : g.act <= 1 ? 100 : 40;
    if (!upgradeBlocked(g, id) && g.money >= upgradeDef(id).price + spare + reserve) { buyUpgrade(g, id); break; }
  }
  // Sell finished items: while the meter is healthy, when cash is short, or when they have sat for three seasons.
  for (const it of [...itemsOf(g)].sort((a, b) => b.q - a.q)) {
    const d = demandLevel(g, itemKey(it.kind));
    const stale = g.season - it.season >= 3;
    if (d >= 0.2 || stale || g.money < reserve + 20) sale(it.kind, sellItem(g, it.id));
  }
  // Queue the best-paying jobs while the benches aren't backed up.
  for (let guard = 0; guard < 12; guard++) {
    if (jobsOf(g).length >= 14) break;
    let best: { key: string; item: string; v: number } | null = null;
    for (const item of patternsOf(g)) {
      for (const src of allSources(g)) {
        const f = forecastJob(g, { item, source: src.key });
        if (!f.ok || f.stock || f.seasons > 5) continue;
        const v = (f.coinsLo + f.coinsHi) / 2;
        if (v >= 7 && (!best || v > best.v)) best = { key: src.key, item, v };
      }
    }
    if (!best) break;
    queueJob(g, { item: best.item, source: best.key });
  }
  // Spare fleece goes raw: keep a few lots for the benches, sell the rest while their meters are decent.
  const keep = 2;
  const lots = [...storeOf(g)].sort((a, b) => lotPrice(g, b, demandLevel(g, rawKey(b.type))).coins - lotPrice(g, a, demandLevel(g, rawKey(a.type))).coins);
  for (const lot of lots.slice(0, Math.max(0, lots.length - keep))) sale("raw", sellLot(g, lot.id));
  if (process.env["CRAFTLOG"]) console.log(g.season, "money", g.money, "jobs", jobsOf(g).map((j) => j.item + ":" + j.route.join(">")).join(","), "items", itemsOf(g).length, "lots", storeOf(g).length, "pat", patternsOf(g).join(","), "hands", JSON.stringify(g.hands), "ups", (g.upgrades ?? []).join(","));
  if (storeOf(g).length >= storeCap(g) - 1) { const l = [...storeOf(g)][0]; if (l) sale("raw", sellLot(g, l.id)); }
}

/** Say hello to and brush (pat) every animal each season (free); give treats when coins are plentiful. */
function manageCare(g: GameState): void {
  if (process.env["NOCARE"]) return;
  const ids = [...g.flock, ...ownedPets(g)];
  for (const id of ids) { greetAnimal(g, id); brushAnimal(g, id); }
  if (g.money < 150 + feedReserve(g)) return;
  for (const id of ids) if (fondnessOf(g, id) < 100 && !treatBlocked(g, id)) giveTreat(g, id);
}

function manageVisitor(g: GameState, b: Brain, cache: Map<string, CrossDist>): void {
  const v = g.visitingRam;
  if (!v || v.season !== g.season || g.hiredRam || g.money < v.fee + 20 + feedReserve(g)) return;
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
    if (process.env["PLANS"]) console.log("  plan", o.e.name, "x", o.r.name, "score", o.v.toFixed(2), "trueBlue", cache.get(`${o.e.id}|${o.r.id}`)!.trueBlue.toFixed(3), "F", pedigreeOf(g).offspringInbreeding(o.e.id, o.r.id).toFixed(2));
    used.add(o.e.id); load.set(o.r.id, (load.get(o.r.id) ?? 0) + 1);
  }
}

export async function play(seed: number, b: Brain, maxSeasons = 60): Promise<RunResult> {
  const g = newGame(seed);
  const actSeason = [0, -1, -1, -1, -1];
  const money: number[] = [];
  let endSeason: number | null = null;
  let firstTrueBlue: number | null = null;
  const ledger: Record<string, number> = {};
  const rev: Revenue = {};
  const rev2: Revenue = {};
  for (let t = 0; t < maxSeasons; t++) {
    const cache = new Map<string, CrossDist>();
    const T = (label: string, f: () => void) => { const t0 = Date.now(), m0 = g.money; f(); ledger[label] = (ledger[label] ?? 0) + g.money - m0; if (process.env["PROF"]) console.error(g.season, label, Date.now() - t0); };
    T("orders", () => manageOrders(g));
    T("fair", () => manageFair(g));
    T("vet", () => b.vet?.(g));
    const y3 = g.season >= 8 && g.season <= 11;
    const sale = (cat: string, coins: number) => { if (y3) rev[cat] = (rev[cat] ?? 0) + coins; if (g.season >= 8 && g.season <= 15) rev2[cat] = (rev2[cat] ?? 0) + coins; };
    T("upgrades", () => manageUpgrades(g));
    T("craft", () => manageCraft(g, sale));
    T("care", () => manageCare(g));
    T("flock", () => manageFlock(g, b));
    T("visitor", () => manageVisitor(g, b, cache));
    T("plan", () => planAll(g, b, cache));
    let r!: ReturnType<typeof advanceSeason>;
    if (process.env["PLANS"]) console.log(g.season, "act", g.act, "flock", g.flock.length, "plans", Object.entries(g.plans).map(([e, ra]) => `${g.sheep[e]!.name}x${g.sheep[ra]!.name}`).join(","), "orders", g.acceptedOrders.length);
    T("advance", () => { r = advanceSeason(g); });
    const add = (k: string, v: number) => { ledger[k] = (ledger[k] ?? 0) + v; };
    add("wool", r.income);
    if (g.season - 1 >= 8 && g.season - 1 <= 15) rev2["raw"] = (rev2["raw"] ?? 0) + r.income;
    if (g.season - 1 >= 8 && g.season - 1 <= 11) { rev["raw"] = (rev["raw"] ?? 0) + r.income; rev["orders"] = (rev["orders"] ?? 0) + r.orderResults.reduce((t, o) => t + o.reward, 0); rev["fair"] = (rev["fair"] ?? 0) + (r.fairResult?.prize ?? 0); } add("feed", -r.feed); add("fondWool", r.fondBonus); add("miceLoss", -((r.mice?.wool ?? 0) + (r.mice?.feed ?? 0)));
    add("foxWolfLambs", r.event && (r.event.kind === "fox" || r.event.kind === "wolf") && !r.event.saved && r.event.sheep ? -1 : 0); add("orderPay", r.orderResults.reduce((t, o) => t + o.reward, 0));
    add("fairPay", r.fairResult?.prize ?? 0); add("autoSold", r.autoSold.reduce((t, a) => t + a.price, 0));
    money.push(g.money);
    if (process.env["MONEY"]) console.log(g.season, g.act, "money", g.money, "wool", r.income, "feed", r.feed, "orders", r.orderResults.reduce((t, o) => t + o.reward, 0), "fair", r.fairResult?.prize ?? 0, "auto", r.autoSold.reduce((t, a) => t + a.price, 0), "flock", g.flock.length, "log", g.log.filter((l) => l.season === g.season - 1 && l.text.startsWith("Sold")).map((l) => l.text.match(/(\d+) coins/)?.[1]).join(","));
    if (r.actAdvanced) actSeason[r.actAdvanced.act] = g.season;
    if (firstTrueBlue === null && r.lambs.some((l) => woolOf(l).trueBlue)) firstTrueBlue = g.season;
    if (isEnding(g)) { endSeason = g.season; markEndingShown(g); break; }
  }
  const a = currentAct(g);
  if (process.env["FLOCK"]) {
    const { genotypeString } = await import("@blue-sheep/genetics");
    const { genomeOf, species } = await import("../src/core/index.js");
    const LOCI = ["W", "U1", "U2", "R1", "R2", "Y1", "Y2", "Dl"];
    for (const s of flockSheep(g)) console.log(s.name, s.sex, g.season - s.born, woolOf(s).word, LOCI.map((l) => genotypeString(genomeOf(s), species.map, l)).join(" "), JSON.stringify(b.doses(g, s)), "F", s.inbreeding.toFixed(2));
    console.log("market", g.market.map((id) => g.sheep[id]!).map((s) => `${s.sex} ${woolOf(s).word} ${LOCI.map((l) => genotypeString(genomeOf(s), species.map, l)).join(" ")}`).join(" | "), "money", g.money);
  }
  if (process.env["ORDERS"]) {
    const h = g.orderHistory;
    const by = (st: string) => h.filter((o) => o.status === st);
    console.log(`seed ${seed}: posted ${g.nextOrderId - 1}, filled ${by("filled").length} [${by("filled").map((o) => o.kind + ":" + (o.colour ?? o.horns ?? o.kg)).join(" ")}], failed ${by("failed").length} [${by("failed").map((o) => o.kind + ":" + (o.colour ?? o.horns ?? o.kg + "kg<" + o.microns)).join(" ")}], expired ${by("expired").length} [${by("expired").map((o) => o.kind + ":" + (o.colour ?? o.horns ?? o.kg)).join(" ")}]`);
  }
  return { y3: rev, y34: rev2, ledger, seed, actSeason, endSeason, finalAct: g.act, money, stuck: endSeason ? "" : `act ${g.act}: ${a.progressText}`, firstTrueBlue };
}

export function summarise(label: string, results: RunResult[], maxSeasons: number): void {
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : NaN; };
  console.log(`\n== ${label}: ${results.length} seeds, max ${maxSeasons} seasons ==`);
  for (let act = 1; act <= 4; act++) {
    const reached = results.filter((r) => r.actSeason[act]! >= 0);
    const inAct = reached.map((r) => r.actSeason[act]! - r.actSeason[act - 1]!);
    console.log(`act ${act - 1}→${act}: reached ${reached.length}/${results.length}, median arrival season ${med(reached.map((r) => r.actSeason[act]!))}, median seasons spent in act ${act - 1}: ${med(inAct)}`);
  }
  const tb = results.filter((r) => r.firstTrueBlue !== null).map((r) => r.firstTrueBlue!);
  console.log(`first true blue lamb: ${tb.length}/${results.length} seeds, median season ${med(tb)} (p25 ${[...tb].sort((a, b) => a - b)[Math.floor(tb.length / 4)]}, p75 ${[...tb].sort((a, b) => a - b)[Math.floor((3 * tb.length) / 4)]})`);
  const done = results.filter((r) => r.endSeason !== null);
  const act4 = results.filter((r) => r.endSeason !== null).map((r) => r.endSeason! - r.actSeason[4]!);
  console.log(`ending: ${done.length}/${results.length} (${Math.round((100 * done.length) / results.length)}%), median season ${med(done.map((r) => r.endSeason!))}, median seasons in act 4: ${med(act4)}`);
  const ends = results.map((r) => r.money[r.money.length - 1] ?? 0).sort((x, y) => x - y);
  const pct = (q: number) => ends[Math.min(ends.length - 1, Math.floor(q * ends.length))]!;
  console.log(`median money at end: ${med(ends)} (min ${ends[0]}, p10 ${pct(0.1)}, p90 ${pct(0.9)}), max money seen: ${Math.max(...results.flatMap((r) => r.money))}, min money seen: ${Math.min(...results.flatMap((r) => r.money))}`);
  const at = (t: number) => med(results.filter((r) => r.money.length > t).map((r) => r.money[t]!));
  console.log(`median money after season 8: ${at(7)}, 20 (year 5): ${at(19)}, 40: ${at(39)} (seeds still playing)`);
  if (process.env["PERSEED"]) for (const r of results) console.log(`  seed ${r.seed}: first true blue ${r.firstTrueBlue ?? "-"}, end season ${r.endSeason ?? "-"}, money ${r.money[r.money.length - 1]}, acts at ${r.actSeason.join(",")}`);
  if (process.env["LEDGER"]) {
    const keys = [...new Set(results.flatMap((r) => Object.keys(r.ledger)))];
    console.log("ledger (median over seeds, whole run):", keys.map((k) => `${k} ${med(results.map((r) => r.ledger[k] ?? 0))}`).join(", "));
  }
  const y3 = results.filter((r) => r.y3 && Object.keys(r.y3).length);
  if (y3.length) {
    const tot = (r: RunResult) => Object.values(r.y3!).reduce((a, b) => a + b, 0);
    const craftSum = (r: RunResult) => Object.entries(r.y3!).filter(([k]) => !["raw", "orders", "fair"].includes(k)).reduce((a, [, v]) => a + v, 0);
    const hhiOf = (keys: (k: string) => boolean) => (r: RunResult) => { const parts = Object.entries(r.y34 ?? r.y3!).filter(([k]) => keys(k)); const s2 = parts.reduce((a, [, v]) => a + v, 0) || 1; return parts.reduce((a, [, v]) => a + (v / s2) ** 2, 0); };
    const hhi = hhiOf((k) => k !== "orders" && k !== "fair"), hhiItems = hhiOf((k) => !["raw", "orders", "fair"].includes(k));
    console.log(`year 3 (seasons 8-11): crafted share of income median ${med(y3.map((r) => craftSum(r) / (tot(r) || 1))).toFixed(2)}, wool+item sales HHI (years 3-4) median ${med(y3.map(hhi)).toFixed(2)}, item-only HHI (years 3-4) ${med(y3.map(hhiItems)).toFixed(2)}, median income ${med(y3.map(tot))}, median crafted ${med(y3.map(craftSum))}`);
  }
  for (const r of results.filter((x) => x.endSeason === null)) console.log(`  seed ${r.seed} unfinished — ${r.stuck} (acts at ${r.actSeason.join(",")})`);
}
