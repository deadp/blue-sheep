// Wool store probe (DESIGN-v3 Phase 4): after a shearing the store gains one lot per adult (none with auto-sell on);
// selling three lots by real clicks pays exactly the price on each button and lowers that wool type's meter;
// the market's wool buyer and the woolshed render. Screenshots: woolshed.png, market-wool-before.png, market-wool-after.png.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";

/** Shearing seasons are spring and autumn (season % 4 is 0 or 2). */
const shearing = (/** @type {number} */ t) => t % 4 === 0 || t % 4 === 2;

/** @type {import("./lib/harness.mjs").Step} */
export const woolstore = {
  name: "woolstore",
  async run(ctx) {
    // --- auto-sell off: lots gather in the store
    const g = await ctx.newPage();
    await g.boot("?seed=7&fresh=1&nomotion=1&act=3");
    await g.act({ type: "autoSell", on: false });
    let st = await g.state();
    while (!shearing(st.season)) { await g.act({ type: "sleep" }); await g.waitPanel("report", 30_000); await g.act({ type: "close" }); st = await g.state(); }
    const before = (st.store ?? []).length;
    const adults = st.flock.filter((/** @type {string} */ id) => st.season - st.sheep[id].born >= 2).length;
    if (adults < 3) throw new ProbeError(`need at least three adults to shear, the fixture has ${adults}`);
    await g.act({ type: "sleep" });
    await g.waitPanel("report", 30_000);
    await g.act({ type: "close" });
    st = await g.state();
    const gained = (st.store ?? []).length - before;
    // wool orders may take some fleeces first; with none accepted, every adult gives one lot (capped by the store, the rest sold at once)
    const cap = st.upgrades?.includes("shearing") ? 24 : 12;
    const expect = Math.min(adults, Math.max(0, cap - before));
    if (st.acceptedOrders.length === 0 && gained !== expect) throw new ProbeError(`the store should gain ${expect} lots (${adults} adults), it gained ${gained}`);
    ctx.note(`shearing: ${adults} adults, store ${before} -> ${(st.store ?? []).length} lots, no auto-sell`);

    // --- selling three lots by clicking: pays the price on the button, lowers that meter
    await g.act({ type: "open", panel: "woolshed" });
    await g.waitPanel("woolshed");
    ctx.artifact(await g.screenshot("woolshed"));
    await g.act({ type: "open", panel: "market" });
    await g.waitPanel("market");
    await g.page.evaluate(() => { const h = [...document.querySelectorAll("#overlay *")].find((e) => e.children.length < 3 && /^Wool buyer$/.test((e.textContent ?? "").trim())); h?.scrollIntoView({ block: "start" }); });
    await g.page.waitForTimeout(150);
    ctx.artifact(await g.screenshot("market-wool-before"));
    const lots = (st.store ?? []).slice(0, 3);
    if (lots.length < 3) throw new ProbeError("fewer than three lots to sell");
    let total = 0;
    for (const lot of lots) {
      await g.act({ type: "open", panel: "woolshed" });
      await g.waitPanel("woolshed");
      const price = await g.page.evaluate((id) => {
        const b = document.querySelector(`#overlay [data-lot="${id}"] [data-selllot]`);
        return b ? Number((b.textContent ?? "").replace(/\D+/g, " ").trim().split(" ").pop()) : NaN;
      }, lot.id);
      if (!Number.isFinite(price)) throw new ProbeError(`no sell button for lot ${lot.id}`);
      const s0 = await g.state();
      const d0 = s0.demand?.[`raw:${lot.type}`] ?? null;
      await g.page.click(`#overlay [data-lot="${lot.id}"] [data-selllot]`);
      await g.page.waitForTimeout(100);
      const s1 = await g.state();
      if (s1.money - s0.money !== price) throw new ProbeError(`lot ${lot.id}: button said ${price}, money rose by ${s1.money - s0.money}`);
      const d1 = s1.demand?.[`raw:${lot.type}`];
      if (!(d1 < (d0 ?? 10))) throw new ProbeError(`selling a ${lot.type} lot should lower its meter (${d0} -> ${d1})`);
      total += price;
    }
    st = await g.state();
    await g.act({ type: "open", panel: "market" });
    await g.waitPanel("market");
    await g.page.evaluate(() => { const h = [...document.querySelectorAll("#overlay *")].find((e) => e.children.length < 3 && /^Wool buyer$/.test((e.textContent ?? "").trim())); h?.scrollIntoView({ block: "start" }); });
    await g.page.waitForTimeout(150);
    ctx.artifact(await g.screenshot("market-wool-after"));
    ctx.note(`sold three lots for ${total} coins, each exactly as priced, each meter lower`);

    // --- "Sell all of one type" at the buyer: the Reveal shows forecast = paid
    const typed = (st.store ?? [])[0];
    if (typed) {
      const price = await g.page.evaluate((t) => {
        const b = document.querySelector(`#overlay [data-selltype="${t}"]`);
        return b ? Number((b.textContent ?? "").trim().split("·").pop()) : NaN;
      }, typed.type);
      const m0 = (await g.state()).money;
      await g.page.click(`#overlay [data-selltype="${typed.type}"]`);
      await g.page.waitForTimeout(150);
      const m1 = (await g.state()).money;
      const n = (st.store ?? []).filter((/** @type {any} */ l) => l.type === typed.type).length;
      if (m1 - m0 !== price) throw new ProbeError(`sell ${n} ${typed.type} lots: forecast ${price}, paid ${m1 - m0}`);
      const rev = await g.page.evaluate(() => document.querySelector("#overlay [data-sale]")?.textContent ?? "");
      if (!/expected/.test(rev)) throw new ProbeError("no reveal line after selling");
    }
    g.assertNoErrors("in the wool store probe");
    await g.close();

    // --- auto-sell on (the default): the clip is paid at shearing and the store stays empty
    const h = await ctx.newPage();
    await h.boot("?seed=7&fresh=1&nomotion=1&act=3");
    let hs = await h.state();
    while (!shearing(hs.season)) { await h.act({ type: "sleep" }); await h.waitPanel("report", 30_000); await h.act({ type: "close" }); hs = await h.state(); }
    const held = (hs.store ?? []).length;
    await h.act({ type: "sleep" });
    await h.waitPanel("report", 30_000);
    await h.act({ type: "close" });
    hs = await h.state();
    if ((hs.store ?? []).length !== held) throw new ProbeError(`with auto-sell on the store should not grow (${held} -> ${(hs.store ?? []).length})`);
    h.assertNoErrors("in the auto-sell part");
    await h.close();
  },
};

if (isMain(import.meta.url)) await runSteps([woolstore]);
