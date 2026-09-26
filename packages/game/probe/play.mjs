// Play probe (CONTRACTS.md §7 step 4): 12 seasons of a simple greedy policy through __game.act only,
// asserting game invariants after every sleep.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";
import { adultEwes, adultRams, capOf, fairScore, flock, isAdult, roughValue } from "./lib/game.mjs";
import { BOOT_QUERY } from "./smoke.mjs";

const SEASONS = 12;

/**
 * Optional forecast hook. If the controller exposes `__game.forecast = { cross(ewe, ram), order(id), fair(id) }`
 * (returning the core forecastCross / forecastOrder / forecastFair results), the policy uses it.
 * Otherwise it falls back to naive choices and says so in the summary.
 * @param {import("./lib/browser.mjs").GamePage} g @param {"cross"|"order"|"fair"} kind @param {...string} args
 * @returns {Promise<any | undefined>}
 */
async function forecast(g, kind, ...args) {
  return g.page.evaluate(([k, a]) => {
    const f = /** @type {any} */ (window).__game.forecast;
    if (!f || typeof f[k] !== "function") return undefined;
    return JSON.parse(JSON.stringify(f[k](...a)));
  }, /** @type {const} */ ([kind, args]));
}

/** @type {import("./lib/harness.mjs").Step} */
export const play = {
  name: "play",
  async run(ctx) {
    const g = await ctx.newPage();
    await g.boot(BOOT_QUERY);
    g.assertNoErrors("during boot");
    let st = await g.state();
    let prevAct = st.act;
    const tally = { plans: 0, accepted: 0, fairs: 0, sold: 0, lambs: 0, rejected: 0 };
    let usedForecast = false;
    let fallbackNoted = false;

    for (let i = 0; i < SEASONS; i++) {
      st = await g.state();
      const season = st.season;
      await g.act({ type: "close" });

      // Keep headroom: sell the lowest-value lambs (then any non-planned sheep) while near the cap.
      const cap = capOf(st);
      while (st.flock.length > cap - 2) {
        const pool = flock(st).filter((s) => !isAdult(s, st.season)).sort((a, b) => roughValue(a) - roughValue(b));
        const victim = pool[0] ?? flock(st).sort((a, b) => roughValue(a) - roughValue(b))[0];
        if (!victim) break;
        const r = await g.act({ type: "sell", id: victim.id });
        if (!r.ok) { ctx.note(`S${season}: sell ${victim.id} refused: ${r.error}`); break; }
        tally.sold++;
        st = await g.state();
      }

      // Orders: accept any whose forecast pFill >= 0.5 (max 2 accepted).
      for (const o of st.orders ?? []) {
        if ((st.acceptedOrders ?? []).includes(o.id) || (st.acceptedOrders ?? []).length >= 2) continue;
        const f = await forecast(g, "order", o.id);
        if (f === undefined) continue;
        usedForecast = true;
        if (f.pFill >= 0.5) {
          const r = await g.act({ type: "accept", id: o.id });
          if (r.ok) tally.accepted++; else tally.rejected++;
          st = await g.state();
        }
      }

      // Fair: enter the best adult for this year's category.
      if (st.fair && st.fair.nextSeason === st.season && !st.fair.entry && (st.unlocks ?? []).includes("fair")) {
        const best = flock(st).filter((s) => isAdult(s, st.season)).sort((a, b) => fairScore(st.fair.category, b) - fairScore(st.fair.category, a))[0];
        if (best) {
          const r = await g.act({ type: "enter", id: best.id });
          if (r.ok) tally.fairs++; else ctx.note(`S${season}: fair entry refused: ${r.error}`);
          st = await g.state();
        }
      }

      // Matings: each adult ewe with the ram maximising P(blue), or round-robin rams without the hook.
      const rams = adultRams(st);
      let budget = Math.max(1, Math.floor((cap - st.flock.length) / 2));
      let rr = 0;
      for (const ewe of adultEwes(st)) {
        if (budget <= 0 || rams.length === 0) break;
        if (st.plans?.[ewe.id]) { budget--; continue; }
        let ram = rams[rr++ % rams.length];
        let bestP = -1;
        for (const cand of rams) {
          const f = await forecast(g, "cross", ewe.id, cand.id);
          if (f === undefined) break;
          usedForecast = true;
          const p = f.colour?.blue ?? 0;
          if (p > bestP) { bestP = p; ram = cand; }
        }
        const r = await g.act({ type: "plan", ewe: ewe.id, ram: ram.id });
        if (r.ok) { tally.plans++; budget--; } else tally.rejected++;
        st = await g.state();
      }
      if (!usedForecast && !fallbackNoted) { ctx.note("no __game.forecast hook: naive ram choice, no orders accepted"); fallbackNoted = true; }

      // Sleep.
      const before = await g.state();
      const plannedEwes = Object.keys(before.plans ?? {});
      const lambsBefore = before.stats?.lambsBorn ?? 0;
      const slept = await g.act({ type: "sleep" });
      if (!slept.ok) throw new ProbeError(`S${season}: act sleep failed: ${slept.error}`);
      st = await g.waitState((s) => s.season === season + 1, `season ${season} -> ${season + 1}`);
      await g.waitPanel("report", 10_000);
      await g.act({ type: "close" });
      st = await g.state();

      // Invariants.
      const where = `after sleep ${i + 1} (season ${season} -> ${st.season})`;
      g.assertNoErrors(where);
      if (!(st.money >= 0)) throw new ProbeError(`${where}: money is ${st.money}`);
      if (st.flock.length > capOf(st)) throw new ProbeError(`${where}: flock ${st.flock.length} > cap ${capOf(st)}`);
      if (st.act < prevAct) throw new ProbeError(`${where}: act went backwards ${prevAct} -> ${st.act}`);
      prevAct = st.act;
      for (const id of st.acceptedOrders ?? []) {
        const o = (st.orders ?? []).find((x) => x.id === id);
        if (o && typeof o.deadline === "number" && o.deadline < st.season) {
          throw new ProbeError(`${where}: accepted order ${id} still open past its deadline (season ${o.deadline})`);
        }
      }
      const born = (st.stats?.lambsBorn ?? 0) - lambsBefore;
      tally.lambs += born;
      if (plannedEwes.length > 0 && born < 1 && !illnessReported(st, season, plannedEwes)) {
        throw new ProbeError(`${where}: ${plannedEwes.length} mating(s) planned, no illness reported, but stats.lambsBorn did not increase ("no lamb" bug)`);
      }
    }

    ctx.artifact(await g.screenshot("04-play-end"));
    ctx.note(`12 seasons: act ${st.act}, money ${st.money}, flock ${st.flock.length}/${capOf(st)}, lambs ${tally.lambs}, plans ${tally.plans}, sold ${tally.sold}, orders accepted ${tally.accepted}, fair entries ${tally.fairs}, refused actions ${tally.rejected}`);
  },
};

/**
 * Did the season that just ran report an illness or loss that excuses a missing lamb?
 * Looks at: an `ill`/`sick` flag on a planned ewe, a planned ewe no longer in the flock,
 * a hardWinter/illness event record for that season, or a log line mentioning illness.
 * @param {any} st @param {number} season @param {string[]} plannedEwes
 */
function illnessReported(st, season, plannedEwes) {
  for (const id of plannedEwes) {
    const s = st.sheep[id];
    if (!s || !st.flock.includes(id) || s.ill || s.sick) return true;
  }
  const ev = (st.events ?? []).filter((e) => (e.season ?? -1) >= season);
  if (ev.some((e) => /hardWinter|ill|sick/i.test(JSON.stringify(e)))) return true;
  return (st.log ?? []).some((l) => l.season >= season && /\bill\b|sick/i.test(l.text));
}

if (isMain(import.meta.url)) runSteps([play]);
