/** The season turn: events, shearing, lambing, fair, feed, ageing, orders, discoveries, acts. */
import { mate } from "@blue-sheep/genetics";
import { checkActAdvance, checkEnding } from "./acts.js";
import { isTrueBlue, woolOf } from "./colour.js";
import { plannedPairings } from "./breeding.js";
import { MAX_AGE, SHEARING_BONUS } from "./config.js";
import { cheapestSheep, removeFromFlock, sheepValue, woolIncome } from "./economy.js";
import { fondWoolMultiplier, fondnessOf, petFeed, seasonCare, welcomeLamb } from "./care.js";
import { announceEvent, applyEvent } from "./events.js";
import { announceMice, applyMice } from "./mice.js";
import { judgeFair } from "./fair.js";
import { forecastCross } from "./forecast.js";
import { updateDiscoveries } from "./knowledge.js";
import { generateOrders, settleOrders, shearForOrders } from "./orders.js";
import {
  addLog, addSheep, ageOf, flockSheep, genomeOf, isAdult, isIll, nextFairSeason, fairCategoryFor, pedigreeOf,
  restockMarket, rngOf, saveRng, seasonLabel, seasonOfYear, species,
} from "./state.js";
import type { CrossForecast, GameState, SeasonReport, Sheep } from "./types.js";
import { feedPerHead, hasUpgrade } from "./upgrades.js";
import { departVisitingRam, offerVisitingRam } from "./visitor.js";
import { tutorialHornsCard, tutorialLambGenome, tutorialLambIndex } from "./tutorial.js";
import { checkPacing } from "./pacing.js";

/** Chance of twins for a mating whose lambs would have inbreeding f. */
export function twinChance(f: number): number {
  return Math.max(0.05, 0.25 - f * 0.5);
}

/** Advance one season. Mutates state; deterministic for a given serialized state. */
export function advanceSeason(state: GameState): SeasonReport {
  const t = state.season;
  const rng = rngOf(state);
  const pairings = plannedPairings(state);
  const forecastsSeen: Record<string, CrossForecast> = {};
  const matings: Record<string, string> = {};
  for (const p of pairings) { forecastsSeen[p.ewe] = forecastCross(state, p.ewe, p.ram); matings[p.ewe] = p.ram; }
  const report: SeasonReport = {
    season: t, endedSeason: t, lambs: [], income: 0, shedBonus: 0, fondBonus: 0, mice: null, miceComing: false, feed: 0, deaths: [], autoSold: [], discoveries: [], orderResults: [],
    newOrders: [], fairResult: null, event: null, announced: null, actAdvanced: null, unlocked: null, endingReached: false, messages: [],
    forecastsSeen, matings,
  };
  const say = (m: string) => { report.messages.push(m); };
  const wasIll = flockSheep(state).filter((s) => s.ill);
  const baseline = { ordersFilled: state.stats.ordersFilled, fairsWon: state.stats.fairsWon };

  // 1. Winter event (announced last season).
  const ev = applyEvent(state, rng);
  if (ev) { report.event = ev.record; say(ev.record.text); if (ev.lost) report.deaths.push(state.sheep[ev.lost]!); }

  // 2. Shearing: accepted wool orders first, the rest goes to market.
  const shorn = shearForOrders(state);
  report.orderResults.push(...shorn.results);
  for (const r of shorn.results) say(r.text);
  const shed = hasUpgrade(state, "shearing") ? SHEARING_BONUS : 1;
  for (const s of flockSheep(state)) {
    if (!isAdult(s, t) || shorn.used.has(s.id)) continue;
    const boom = ev?.boomColour ?? null;
    const plain = woolIncome(s, boom);
    const shedOnly = woolIncome(s, boom, shed);
    // Happy sheep grow better wool; skittish ones a little worse.
    const paid = woolIncome(s, boom, shed * fondWoolMultiplier(fondnessOf(state, s.id)));
    report.income += paid;
    report.shedBonus += shedOnly - plain;
    report.fondBonus += paid - shedOnly;
  }
  // Mice (announced last season) spoil some of the clip; the cat catches most of them.
  const eatersNow = state.flock.length;
  report.mice = applyMice(state, report.income, eatersNow);
  if (report.mice) { report.income -= report.mice.wool; say(report.mice.text); }
  state.money += report.income;
  state.stats.coinsEarned += report.income;

  // 3. Lambing. A valid planned mating always gives at least one lamb unless the ewe is ill.
  const tutorialCards: Sheep[] = [];
  const ped = pedigreeOf(state);
  for (const p of pairings) {
    const ewe = state.sheep[p.ewe]!, ram = state.sheep[p.ram]!;
    if (!state.flock.includes(ewe.id)) continue;
    if (isIll(ewe, t)) { say(`${ewe.name} was too poorly to lamb this season.`); continue; }
    const f = ped.offspringInbreeding(ewe.id, ram.id);
    // The tutorial pair's first three matings give one lamb each, with a set look (see core/tutorial.ts).
    const tutIndex = tutorialLambIndex(state, ewe.id, ram.id);
    const tutorialLamb = tutIndex >= 0;
    const litter = tutorialLamb ? 1 : rng.chance(twinChance(f)) ? 2 : 1;
    const born: Sheep[] = [];
    for (let i = 0; i < litter; i++) {
      const draw = () => mate(genomeOf(ewe), genomeOf(ram), species.map, rng);
      const genome = tutorialLamb ? tutorialLambGenome(draw, tutIndex) : draw();
      const lamb = addSheep(state, rng, {
        sex: rng.chance(0.5) ? "ewe" : "ram", born: t + 1, dam: ewe.id, sire: ram.id, genome, inbreeding: f, origin: "bred",
      });
      state.flock.push(lamb.id);
      welcomeLamb(state, lamb, ewe.id, t + 1);
      report.lambs.push(lamb);
      born.push(lamb);
      if (tutIndex === 1) tutorialCards.push(lamb);
      state.stats.lambsBorn += 1;
      if (isTrueBlue(lamb)) {
        state.stats.bluesBorn += 1;
        if (!state.achievements.includes("blue")) {
          state.achievements.push("blue");
          say(`${lamb.name} is TRUE BLUE! The first true blue lamb on the farm.`);
        }
      }
    }
    say(litter === 2
      ? `${ewe.name} had twins by ${ram.name}: ${born.map((b) => b.name).join(" and ")}.`
      : `${ewe.name} had a ${woolOf(born[0]!).word} ${born[0]!.sex} lamb by ${ram.name}: ${born[0]!.name}.`);
    if (f >= 0.125) say(`${born.map((b) => b.name).join(" and ")} ${born.length > 1 ? "are" : "is"} a little small — the parents are close kin.`);
  }

  // 4. The fair.
  if (state.unlocks.includes("fair")) {
    if (t === state.fair.nextSeason) {
      report.fairResult = judgeFair(state, rng);
      say(report.fairResult.text);
    } else if (t > state.fair.nextSeason) {
      state.fair.nextSeason = nextFairSeason(t + 1);
      state.fair.category = fairCategoryFor(state.fair.nextSeason);
      state.fair.entry = null;
    }
  }

  // 5. Feed. Coins never go below zero: the trader takes the cheapest sheep instead.
  const perHead = feedPerHead(t) * (ev?.feedMultiplier ?? 1);
  const newborn = new Set(report.lambs.map((l) => l.id));
  const eaters = () => state.flock.filter((id) => !newborn.has(id)).length;
  // The dogs and the cat eat too; mice (if any came) eat into the hay.
  const extraFeed = (report.mice?.feed ?? 0) + petFeed(state);
  while (state.money < eaters() * perHead + extraFeed) {
    const s = cheapestSheep(state, newborn) ?? cheapestSheep(state);
    if (!s) break;
    const price = sheepValue(s, state.season);
    removeFromFlock(state, s.id);
    state.money += price;
    report.autoSold.push({ id: s.id, name: s.name, price, reason: "feed" });
    say(`There wasn't enough for feed, so the trader took ${s.name} for ${price} coins.`);
  }
  report.feed = Math.min(state.money, eaters() * perHead + extraFeed);
  state.money -= report.feed;

  // 6. Ageing.
  state.season = t + 1;
  report.season = state.season;
  for (const s of flockSheep(state)) {
    if (ageOf(s, state.season) >= MAX_AGE) {
      removeFromFlock(state, s.id);
      report.deaths.push(s);
      say(`${s.name} passed away peacefully of old age.`);
    }
  }

  // 7. Room: the flock may not stay over its cap.
  while (state.flock.length > state.flockCap) {
    const s = cheapestSheep(state)!;
    const price = sheepValue(s, state.season);
    removeFromFlock(state, s.id);
    state.money += price;
    report.autoSold.push({ id: s.id, name: s.name, price, reason: "room" });
    say(`There wasn't room for everyone, so the trader took ${s.name} for ${price} coins.`);
  }

  // 7b. Fondness fades for animals left alone for a while.
  seasonCare(state, t);

  // 8. Plans resolve; last season's invalids are well again.
  state.plans = {};
  for (const s of wasIll) { s.ill = false; if (state.flock.includes(s.id)) say(`${s.name} is feeling better.`); }

  // 9. Orders: hand over matching sheep, fail overdue ones.
  const settled = settleOrders(state);
  report.orderResults.push(...settled);
  for (const r of settled) say(r.text);

  // 10. What did we learn?
  report.discoveries = updateDiscoveries(state);
  for (const l of tutorialCards) { const c = tutorialHornsCard(state, l); if (c) report.discoveries.unshift(c); }

  // 11. Acts and the ending.
  report.actAdvanced = checkActAdvance(state, baseline);
  if (report.actAdvanced) say(`“${report.actAdvanced.line}”`);
  report.endingReached = checkEnding(state);

  // 11b. At most one new concept arrives with the new season (core/pacing.ts).
  report.unlocked = checkPacing(state);

  // 12. Visitors, events, market, new orders for the new season.
  departVisitingRam(state);
  if (state.unlocks.includes("visitor") && seasonOfYear(state.season) === 0) offerVisitingRam(state, rng);
  report.announced = announceEvent(state, rng);
  if (report.announced) say(report.announced.text);
  report.miceComing = announceMice(state, rng);
  restockMarket(state, rng);
  report.newOrders = generateOrders(state, rng);

  saveRng(state, rng);
  addLog(state, `${seasonLabel(state.season)}: ${report.lambs.length} lamb(s), +${report.income} coins from wool, ${report.feed} on feed.`);
  for (const m of report.messages) addLog(state, m);
  return report;
}

export function renameSheep(state: GameState, id: string, name: string): void {
  const s = state.sheep[id];
  if (!s || (!state.flock.includes(id) && !state.market.includes(id))) throw new Error("I can't find that sheep.");
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 24);
  if (!clean) throw new Error("A sheep needs a name.");
  const old = s.name;
  s.name = clean;
  addLog(state, `${old} is now called ${clean}.`);
}
