/** Deterministic game states at different points of the story, for UI tests and the dev preview. Uses only core actions. */
import {
  ACTS, advanceSeason, acceptOrder, buyPrice, buySheep, canBreed, deserialize, enterAct, grantUnlock, greetAnimal, lambRoom, newGame, ownedPets, planMating, rankCandidates, sellSheep,
  seasonOfYear, serialize, sheepValue, hireVisitingRam, enterFair, isAdult,
  type GameState, type SeasonReport,
} from "../core/index.js";

/**
 * One greedy season: say hello to everyone, buy a coloured sheep from the market when there's room and coins to
 * spare (so fixtures show a flock of several colours), make room, plan every ewe with its best "true blue" mate,
 * take an order, sleep.
 */
export function greedySeason(s: GameState): SeasonReport {
  for (const id of [...s.flock, ...ownedPets(s)]) greetAnimal(s, id);
  const coloured = s.market.map((id) => s.sheep[id]!).filter((m) => m.phenotype["white"] !== "white" && buyPrice(m) + 5 <= s.money)
    .sort((a, b) => Number(b.phenotype["intensity"] ?? 0) - Number(a.phenotype["intensity"] ?? 0))[0];
  if (coloured && s.flock.length < s.flockCap - 3) { try { buySheep(s, coloured.id); } catch { /* not for sale */ } }
  while (lambRoom(s) < 3 && s.flock.length > 6) {
    const cheapest = s.flock.map((id) => s.sheep[id]!).sort((a, b) => sheepValue(a, s.season) - sheepValue(b, s.season))[0]!;
    sellSheep(s, cheapest.id);
  }
  for (const id of s.flock) {
    const e = s.sheep[id]!;
    if (e.sex !== "ewe" || !canBreed(e, s.season) || lambRoom(s) < 1) continue;
    const best = rankCandidates(s, id, "trueblue").find((c) => c.sheep.origin !== "visitor" || s.hiredRam === c.sheep.id);
    if (best) { try { planMating(s, id, best.sheep.id); } catch { /* busy ram etc. */ } }
  }
  const open = s.orders.find((o) => o.status === "open");
  if (open && s.acceptedOrders.length < 1) { try { acceptOrder(s, open.id); } catch { /* full */ } }
  return advanceSeason(s);
}

function clone(s: GameState): GameState { return deserialize(serialize(s)); }

/** Enter act `a` (if not there yet) with every concept up to it open, as the debug fast-forward does. */
function toAct(s: GameState, a: 1 | 2 | 3 | 4): void {
  if (s.act < a) enterAct(s, a, undefined, { grant: true });
  else for (const x of ACTS) if (x.act <= a) for (const u of x.unlocks) grantUnlock(s, u);
}

export interface Fixture { name: string; state: GameState; report: SeasonReport | null }

/** fresh (act 0), afterFirst (act 1 + report), midAct1, act2 (numbers), act3 (visitor, tree), act4 ending. */
export function fixtures(seed = 7): Fixture[] {
  const out: Fixture[] = [];
  const fresh = newGame(seed);
  out.push({ name: "fresh", state: fresh, report: null });

  const a1 = clone(fresh);
  const r1 = greedySeason(a1);
  out.push({ name: "afterFirst", state: clone(a1), report: r1 });

  let r: SeasonReport = r1;
  for (let i = 0; i < 4; i++) r = greedySeason(a1);
  out.push({ name: "midAct1", state: clone(a1), report: r });

  const a2 = clone(a1);
  toAct(a2, 2);
  let r2 = greedySeason(a2);
  r2 = greedySeason(a2);
  const eligible = a2.flock.find((id) => isAdult(a2.sheep[id]!, a2.fair.nextSeason));
  if (eligible) enterFair(a2, eligible);
  out.push({ name: "act2", state: clone(a2), report: r2 });

  const a3 = clone(a2);
  toAct(a3, 3);
  let r3 = greedySeason(a3);
  for (let i = 0; i < 4 && seasonOfYear(a3.season) !== 0; i++) r3 = greedySeason(a3);
  if (a3.visitingRam && a3.money >= a3.visitingRam.fee) { try { hireVisitingRam(a3); } catch { /* ignore */ } }
  out.push({ name: "act3", state: clone(a3), report: r3 });

  const a4 = clone(a3);
  toAct(a4, 4);
  const r4 = greedySeason(a4);
  a4.ending = { shown: false, season: a4.season };
  out.push({ name: "act4", state: a4, report: r4 });
  return out;
}
