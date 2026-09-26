// Smoke probe (CONTRACTS.md §7 steps 1–3): boot, open the forecast, plan a mating, sleep, see a lamb.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";
import { adultEwes, adultRams } from "./lib/game.mjs";

export const BOOT_QUERY = "?seed=7&fresh=1&nomotion=1";

/** @type {import("./lib/harness.mjs").Step} */
export const smoke = {
  name: "smoke",
  async run(ctx) {
    const g = await ctx.newPage();

    // 1. Boot with a fixed seed.
    await g.boot(BOOT_QUERY);
    g.assertNoErrors("during boot");
    ctx.artifact(await g.screenshot("01-boot"));
    const s0 = await g.state();
    ctx.note(`booted: season ${s0.season}, act ${s0.act}, flock ${s0.flock.length}, money ${s0.money}`);

    // 2. Forecast panel for the first adult ewe.
    const ewe = adultEwes(s0)[0];
    const ram = adultRams(s0)[0];
    if (!ewe || !ram) throw new ProbeError(`seed 7 start needs an adult ewe and ram (ewes ${adultEwes(s0).length}, rams ${adultRams(s0).length})`);
    const opened = await g.act({ type: "open", panel: "forecast", id: ewe.id });
    if (!opened.ok) throw new ProbeError(`act open forecast failed: ${opened.error}`);
    await g.waitPanel("forecast");
    g.assertNoErrors("opening the forecast panel");
    ctx.artifact(await g.screenshot("02-forecast"));

    // 3. Plan a mating, sleep, expect a lamb.
    const planned = await g.act({ type: "plan", ewe: ewe.id, ram: ram.id });
    if (!planned.ok) throw new ProbeError(`act plan ${ewe.id}×${ram.id} failed: ${planned.error}`);
    const s1 = await g.state();
    if (s1.plans?.[ewe.id] !== ram.id) throw new ProbeError(`after plan, state.plans[${ewe.id}] is ${JSON.stringify(s1.plans?.[ewe.id])}, expected "${ram.id}"`);
    await g.act({ type: "close" });

    const slept = await g.act({ type: "sleep" });
    if (!slept.ok) throw new ProbeError(`act sleep failed: ${slept.error}`);
    const s2 = await g.waitState((s) => s.season === s0.season + 1, `season ${s0.season} -> ${s0.season + 1} after sleep`);
    await g.waitPanel("report", 10_000);
    g.assertNoErrors("during sleep / report");
    ctx.artifact(await g.screenshot("03-report"));

    const born = s2.stats?.lambsBorn;
    if (!(born >= 1)) throw new ProbeError(`state().stats.lambsBorn is ${JSON.stringify(born)}, expected >= 1 after a planned mating`);
    const lambs = s2.flock.map((/** @type {string} */ id) => s2.sheep[id]).filter((/** @type {any} */ s) => s.born === s2.season);
    if (lambs.length === 0) throw new ProbeError(`no sheep in the flock with born === ${s2.season} after sleeping with a planned mating`);
    ctx.note(`lambs born: ${lambs.map((/** @type {any} */ l) => `${l.name} (${l.phenotype?.colour})`).join(", ")}`);
  },
};

if (isMain(import.meta.url)) runSteps([smoke]);
