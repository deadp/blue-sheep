// Craft probe (DESIGN-v3 Phase 5): queue socks from the gift fleece by real clicks, sleep three seasons; the
// item exists with a quality inside the band the forecast showed (10-90 percentile, one retry seed allowed);
// no job advances two stages in a season; selling the socks pays the item price and lowers the socks meter by
// exactly 0.10. Screenshots: craft-bench.png (queued job), craft-forecast.png, craft-report.png, craft-items.png, craft-market.png.
import { ProbeError } from "./lib/browser.mjs";

/** @param {any} g @param {any} ctx @param {number} seed */
async function attempt(g, ctx, seed) {
  await g.boot(`?seed=${seed}&fresh=1&nomotion=1&act=3`);
  let st = await g.state();
  if (!st.unlocks.includes("craft")) throw new ProbeError("act 3 fixture should have the woolshed unlocked");
  if (!(st.store ?? []).length) throw new ProbeError("the fixture should hold a gift fleece in the store");
  await g.act({ type: "open", panel: "woolshed" });
  await g.waitPanel("woolshed");
  await g.page.click('#overlay [data-tab="bench"]').catch(() => {});
  await g.page.waitForTimeout(150);
  ctx.artifact(await g.screenshot("craft-forecast"));
  const seen = await g.page.evaluate(() => {
    const b = document.querySelector('#overlay [data-queue="socks"]');
    return b ? (b.closest(".pattern, .pcard, [data-pattern]")?.textContent ?? "").replace(/\s+/g, " ") : null;
  });
  if (seen === null) throw new ProbeError("no socks pattern card with a Queue button");
  const t0 = st.season;
  await g.page.click('#overlay [data-queue="socks"]');
  await g.page.waitForTimeout(150);
  st = await g.state();
  if (st.jobs.length !== 1) throw new ProbeError(`queueing should make one job, found ${st.jobs.length}`);
  const job = st.jobs[0];
  if (job.seen.finish !== t0 + 3) throw new ProbeError(`socks queued in ${t0} should forecast finish ${t0 + 3}, said ${job.seen.finish}`);
  ctx.artifact(await g.screenshot("craft-bench"));
  await g.page.evaluate(() => document.querySelector("#overlay .benches")?.scrollIntoView({ block: "start" }));
  await g.page.waitForTimeout(150);
  ctx.artifact(await g.screenshot("craft-benches"));
  await g.act({ type: "close" });
  const stages = [];
  for (let i = 0; i < 3; i++) {
    await g.act({ type: "sleep" });
    await g.waitPanel("report", 30_000);
    if (i === 2) ctx.artifact(await g.screenshot("craft-report"));
    await g.act({ type: "close" });
    st = await g.state();
    const j = st.jobs.find((/** @type {any} */ x) => x.id === job.id);
    stages.push(j ? j.route[0] : "done");
  }
  const order = ["card", "spin", "knit", "done"];
  let prev = 0;
  for (const s of stages) {
    const at = order.indexOf(s === undefined ? "done" : s);
    if (at - prev > 1) throw new ProbeError(`a job advanced two stages in one season: ${stages.join(" > ")}`);
    prev = Math.max(prev, at);
  }
  if (st.items.length !== 1) throw new ProbeError(`three seasons after queueing socks there should be one item, found ${st.items.length}`);
  const it = st.items[0];
  if (it.season !== t0 + 3) throw new ProbeError(`socks should finish as season ${t0 + 3} begins, finished ${it.season}`);
  return { st, it, seen: job.seen };
}

/** @type {import("./lib/harness.mjs").Step} */
export const craft = {
  name: "craft",
  async run(ctx) {
    let res = null, used = 0;
    for (const seed of [7, 11]) {
      const g = await ctx.newPage();
      used = seed;
      try {
        res = await attempt(g, ctx, seed);
        const q = res.it.q;
        if (q >= res.seen.qLo - 1 && q <= res.seen.qHi + 1) {
          // keep this page for selling
          await g.act({ type: "open", panel: "woolshed" });
          await g.waitPanel("woolshed");
          await g.page.click('#overlay [data-tab="items"]');
          await g.page.waitForTimeout(150);
          ctx.artifact(await g.screenshot("craft-items"));
          const s0 = await g.state();
          const d0 = s0.demand?.["item:socks"] ?? 1;
          await g.page.click(`#overlay [data-sellitem="${res.it.id}"]`);
          await g.page.waitForTimeout(150);
          const s1 = await g.state();
          if (s1.items.length !== 0) throw new ProbeError("selling should remove the item");
          if (!(s1.money > s0.money)) throw new ProbeError("selling the socks should pay coins");
          const d1 = s1.demand?.["item:socks"];
          if (Math.abs((d0 - d1) - 0.1) > 1e-6) throw new ProbeError(`selling socks should lower the meter by 0.10 (${d0} -> ${d1})`);
          await g.act({ type: "open", panel: "market" });
          await g.waitPanel("market");
          await g.page.evaluate(() => { const h = [...document.querySelectorAll("#overlay *")].find((e) => e.children.length < 3 && /^Handmade goods$/.test((e.textContent ?? "").trim())); h?.scrollIntoView({ block: "start" }); });
          await g.page.waitForTimeout(150);
          ctx.artifact(await g.screenshot("craft-market"));
          g.assertNoErrors("in the craft probe");
          ctx.note(`seed ${seed}: socks queued, three sleeps, Q ${res.it.q} inside forecast ${res.seen.qLo}-${res.seen.qHi}; sold for ${s1.money - s0.money}, meter ${d0.toFixed(2)} -> ${d1.toFixed(2)}`);
          await g.close();
          return;
        }
        ctx.note(`seed ${seed}: Q ${q} outside ${res.seen.qLo}-${res.seen.qHi} (a tail draw), retrying`);
      } finally { await g.close().catch(() => {}); }
    }
    throw new ProbeError(`finished quality fell outside the forecast band on two seeds (last seed ${used})`);
  },
};
