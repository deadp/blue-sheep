// Lessons probe: the pacing calendar and Old Tom's mini-lessons, played from a new farm (?seed, no tutorial:
// skip-tutorial games keep the same calendar) through Year 3 Autumn and on into the act concepts.
// Rules checked (DESIGN-v3 §15.13): letters in year 1 (a game without the tutorial: the first free season); the vet exactly at Year 2
// Spring, farm improvements at Year 2 Autumn, dogs at Year 3 Spring, the cat at Year 3 Autumn; never two
// concepts in one season; every concept but the codex arrives with its lesson, shown once the report is
// closed; no fox is announced or raids before dogs are on sale; the first letter asks for horns. The orders,
// vet, farm, dogs and cat lessons are completed by real clicks where the arrow points (the vet's hut in the
// world, HUD buttons, Accept, Test, "Got it", "Maybe later"); a lesson left mid-way resumes after a sleep.
// Act concepts (numbers, fair, tree, visitor) are staged by setting the act and still arrive one a season.
// The forecast keeps all ten lambs on one row and long names clear of the hint at 1280×800 and 1024×768.
// Screenshots: lesson-<id>-1 (each lesson's first step), lesson-vet-2/-3, lesson-dogs-2, lesson-cat-2,
// lesson-farm-resumed, forecast-1280, forecast-1024, forecast-lesson-1280.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";
import { arrowTip, assertLayout } from "./tutorial.mjs";

const CALENDAR = { vet: 4, farm: 6, dogs: 8, cat: 10 };
const LABEL = (/** @type {number} */ s) => `Year ${Math.floor(s / 4) + 1} ${["Spring", "Summer", "Autumn", "Winter"][s % 4]}`;

/** @param {import("./lib/browser.mjs").GamePage} g */
const lesson = (g) => g.page.evaluate(() => /** @type {any} */ (window).__game.lesson());

/** @param {import("./lib/browser.mjs").GamePage} g @param {string} sel @param {string} what */
async function click(g, sel, what) {
  const el = g.page.locator(sel).first();
  if (!(await el.count())) throw new ProbeError(`${what}: nothing matches ${sel}`);
  await el.scrollIntoViewIfNeeded();
  await el.click();
}

/** Wait for the running lesson to be at (id, step), or finished when step is 0. @param {import("./lib/browser.mjs").GamePage} g */
async function waitLesson(g, /** @type {string} */ id, /** @type {number} */ step, /** @type {string} */ what) {
  try {
    await g.page.waitForFunction(([i, n]) => {
      const l = /** @type {any} */ (window).__game.lesson();
      return n === 0 ? !l.current && l.done.includes(i) : l.current?.id === i && l.current.step === n && l.current.shown;
    }, [id, step], { timeout: 6_000 });
  } catch {
    throw new ProbeError(`${what}: expected lesson ${id} ${step ? `step ${step}` : "finished"}, got ${JSON.stringify((await lesson(g)).current)}`);
  }
  await g.page.waitForTimeout(150); // let the arrow place itself
}

/** Sleep, wait for the report, return what arrived and the report's banner. @param {import("./lib/browser.mjs").GamePage} g */
async function sleep(g) {
  const before = await g.state();
  // Plan every grown ewe with the first grown ram (lambs keep the story going).
  const rams = before.flock.map((/** @type {string} */ id) => before.sheep[id]).filter((/** @type {any} */ s) => s.sex === "ram" && before.season - s.born >= 2);
  for (const e of before.flock.map((/** @type {string} */ id) => before.sheep[id]).filter((/** @type {any} */ s) => s.sex === "ewe" && before.season - s.born >= 2 && !s.ill)) {
    for (const r of rams) { const res = await g.act({ type: "plan", ewe: e.id, ram: r.id }); if (res.ok) break; }
  }
  await g.page.evaluate(() => { const s = /** @type {any} */ (window).__game.state(); s.money = Math.max(s.money, 60); });
  const r = await g.act({ type: "sleep" });
  if (!r.ok) throw new ProbeError(`sleep failed: ${r.error}`);
  await g.waitPanel("report", 12_000);
  const after = await g.state();
  const arrived = after.unlocks.filter((/** @type {string} */ u) => !before.unlocks.includes(u));
  const banner = await g.page.evaluate(() => document.querySelector("#overlay [data-unlocked]")?.getAttribute("data-unlocked") ?? null);
  return { before, after, arrived, banner };
}

/** Close the report the way a player does. @param {import("./lib/browser.mjs").GamePage} g */
async function closeReport(g) {
  await click(g, "#overlay .row [data-close].primary", "back to the farm");
  await g.page.waitForFunction(() => document.body.dataset.panel === "", null, { timeout: 5_000 });
  await g.page.waitForTimeout(150);
}

/**
 * Click a place in the world where the lesson's arrow points at it (a hotspot); otherwise its ringed HUD
 * button. Returns how. @param {import("./lib/browser.mjs").GamePage} g
 */
async function clickSpot(g, /** @type {string} */ hud, /** @type {string} */ panel) {
  const tip = await arrowTip(g);
  const onHud = tip ? await g.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y + 20)?.closest("#hud"), [tip.x, tip.y]) : true;
  if (tip && !onHud && tip.dir === "down") {
    for (const dy of [24, 40, 12]) {
      await g.page.mouse.click(tip.x, tip.y + dy);
      const ok = await g.page.waitForFunction((p) => document.body.dataset.panel === p, panel, { timeout: 1_200 }).then(() => true, () => false);
      if (ok) return "world";
    }
  }
  await click(g, `#hud [data-open=${hud}]`, `HUD ${hud}`);
  await g.waitPanel(panel);
  return "hud";
}

/** @type {import("./lib/harness.mjs").Step} */
export const lessons = {
  name: "lessons",
  async run(ctx) {
    const g = await ctx.newPage();
    await g.boot("?seed=11&fresh=1&nomotion=1");
    const shot = async (/** @type {string} */ name) => { await assertLayout(g, name); ctx.artifact(await g.screenshot(name)); };
    /** @type {Record<string, number>} */
    const when = {};
    const how = [];
    const seasonsWithArrival = new Set();

    /** Sleep once; record and check what arrived. */
    const turn = async () => {
      const { after, arrived, banner } = await sleep(g);
      if (arrived.length > 1) throw new ProbeError(`two concepts arrived in ${LABEL(after.season)}: ${arrived.join(", ")}`);
      for (const u of arrived) {
        when[u] = after.season;
        seasonsWithArrival.add(after.season);
        if (banner !== u) throw new ProbeError(`the report should introduce ${u}, its banner says ${banner}`);
      }
      // Foxes never before dogs are on sale; mice never before the cat.
      if ((after.pendingEvent?.kind === "fox" || after.pendingEvent?.kind === "wolf") && !after.unlocks.includes("dogs")) throw new ProbeError(`a ${after.pendingEvent.kind} was announced in ${LABEL(after.season)} before dogs were on sale`);
      if (after.events.some((/** @type {any} */ e) => (e.kind === "fox" || e.kind === "wolf") && !(after.paced?.dogs < e.season))) throw new ProbeError("a predator raided before dogs were on sale");
      if (after.mice !== null && after.mice !== undefined && !after.unlocks.includes("cat")) throw new ProbeError("mice were announced before the cat arrived");
      const l = (await lesson(g)).current;
      if (arrived.length && arrived[0] !== "cards" && l?.id !== arrived[0]) throw new ProbeError(`${arrived[0]} should arrive with its lesson, lesson is ${JSON.stringify(l)}`);
      if (l && l.shown) throw new ProbeError("the lesson card should wait while the season report is up");
      await closeReport(g);
      return { after, arrived };
    };

    /** Play until `id` arrives (at most `max` sleeps); returns the season. */
    const until = async (/** @type {string} */ id, max = 6) => {
      for (let i = 0; i < max && !(id in when); i++) await turn();
      if (!(id in when)) throw new ProbeError(`${id} never arrived (season ${(await g.state()).season})`);
      return when[id];
    };

    // ---- Year 1: the codex with the first lamb, then the letters and the orders lesson (real clicks).
    await until("orders");
    if (when.orders > 3) throw new ProbeError(`letters should come in year 1, came ${LABEL(when.orders)}`);
    const s1 = await g.state();
    const first = s1.orders.find((/** @type {any} */ o) => o.status === "open");
    if (first?.kind !== "horns") throw new ProbeError(`the first letter should ask for horns, it is ${JSON.stringify(first?.kind)}`);
    await waitLesson(g, "orders", 1, "letters arrived");
    await shot("lesson-orders-1");
    how.push(`orders:${await clickSpot(g, "orders", "orders")}`);
    await waitLesson(g, "orders", 2, "mailbox opened");
    const accRing = await g.page.locator("#overlay .order.open [data-accept].tut-ring").count();
    if (!accRing) throw new ProbeError("the orders lesson should ring the letter's Accept button");
    await click(g, "#overlay .order.open [data-accept]", "accept");
    await waitLesson(g, "orders", 3, "letter accepted");
    if (!(await g.state()).acceptedOrders.length) throw new ProbeError("accepting in the lesson should take the order on");
    await click(g, "#mentor [data-lesson=ack]", "got it (orders)");
    await waitLesson(g, "orders", 0, "orders lesson");
    await click(g, "#overlay [data-close]", "close orders").catch(() => {});
    await g.act({ type: "close" });

    // ---- Year 2 Spring: the vet, by real clicks: the hut in the world (or its HUD button), a Test, Got it.
    await until("vet");
    await waitLesson(g, "vet", 1, "the vet arrived");
    await shot("lesson-vet-1");
    how.push(`vet:${await clickSpot(g, "vet", "vet")}`);
    await waitLesson(g, "vet", 2, "vet hut opened");
    const coins = (await g.state()).money;
    await shot("lesson-vet-2");
    await click(g, "#overlay .vet-rows [data-test].tut-ring", "the ringed Test button");
    await waitLesson(g, "vet", 3, "test done");
    const sv = await g.state();
    const tested = Object.values(sv.sheep).filter((/** @type {any} */ s) => Object.keys(s.tested).length).length;
    if (tested !== 1 || !(sv.money < coins)) throw new ProbeError(`the vet lesson's test should test one sheep for the fee (tested ${tested}, coins ${coins} → ${sv.money})`);
    await shot("lesson-vet-3");
    await click(g, "#mentor [data-lesson=ack]", "got it (vet)");
    await waitLesson(g, "vet", 0, "vet lesson");
    await g.act({ type: "close" });

    // ---- Year 2 Autumn: farm improvements. Leave the lesson mid-way over a sleep: it resumes.
    await until("farm");
    await waitLesson(g, "farm", 1, "farm improvements arrived");
    await shot("lesson-farm-1");
    await turn(); // Year 2 Winter: nothing new
    await waitLesson(g, "farm", 1, "after sleeping mid-lesson");
    await shot("lesson-farm-resumed");
    how.push(`farm:${await clickSpot(g, "market", "market")}`);
    await waitLesson(g, "farm", 2, "market opened");
    const fore = await g.page.locator("#overlay [data-upgrade-card=barn] .u-fore.tut-ring").count();
    if (!fore) throw new ProbeError("the farm lesson should ring the barn's forecast");
    await click(g, "#mentor [data-lesson=ack]", "got it (farm)");
    await waitLesson(g, "farm", 0, "farm lesson");
    await g.act({ type: "close" });

    // ---- Year 3 Spring: dogs (fox odds, then Maybe later).
    await until("dogs");
    await waitLesson(g, "dogs", 1, "dogs arrived");
    await shot("lesson-dogs-1");
    how.push(`dogs:${await clickSpot(g, "market", "market")}`);
    await waitLesson(g, "dogs", 2, "market opened (dogs)");
    if (!(await g.page.locator("#overlay .pet-odds.tut-ring").count())) throw new ProbeError("the dogs lesson should ring the fox odds");
    await shot("lesson-dogs-2");
    await click(g, "#mentor [data-lesson=ack]", "got it (fox odds)");
    await waitLesson(g, "dogs", 3, "fox odds read");
    await click(g, "#mentor [data-lesson=ack]", "maybe later (dogs)");
    await waitLesson(g, "dogs", 0, "dogs lesson");
    await g.act({ type: "close" });

    // ---- Year 3 Autumn: the cat (what mice cost, then buy Mog for real).
    await until("cat");
    await waitLesson(g, "cat", 1, "the cat arrived");
    await shot("lesson-cat-1");
    how.push(`cat:${await clickSpot(g, "market", "market")}`);
    await waitLesson(g, "cat", 2, "market opened (cat)");
    await shot("lesson-cat-2");
    await click(g, "#mentor [data-lesson=ack]", "got it (mice)");
    await waitLesson(g, "cat", 3, "mice read");
    await g.page.evaluate(() => { /** @type {any} */ (window).__game.state().money += 60; });
    await click(g, "#overlay [data-upgrade=cat]", "buy Mog");
    await waitLesson(g, "cat", 0, "cat lesson (bought)");
    await g.act({ type: "close" });

    for (const [id, season] of Object.entries(CALENDAR)) {
      if (when[id] !== season) throw new ProbeError(`${id} should arrive in ${LABEL(season)}, arrived ${when[id] === undefined ? "never" : LABEL(when[id])}`);
    }

    // ---- Act concepts, staged: they still come one a season, each with its lesson (first steps screenshotted).
    for (const [id, act] of /** @type {[string, number][]} */ ([["numbers", 2], ["fair", 2], ["tree", 3], ["visitor", 3]])) {
      await g.page.evaluate((a) => { const s = /** @type {any} */ (window).__game.state(); if (s.act < a) s.act = a; }, act);
      const season = await until(id, 3);
      if (Object.values(CALENDAR).includes(season)) throw new ProbeError(`${id} arrived in a calendar season (${LABEL(season)})`);
      await waitLesson(g, id, 1, `${id} arrived`);
      await shot(`lesson-${id}-1`);
      if (id === "numbers") {
        // The forecast with Old Tom's card beside it: still ten lambs on one row.
        const st = await g.state();
        const ewe = st.flock.find((/** @type {string} */ x) => st.sheep[x].sex === "ewe" && st.season - st.sheep[x].born >= 2);
        await g.act({ type: "open", panel: "forecast", id: ewe });
        await g.waitPanel("forecast");
        await waitLesson(g, "numbers", 2, "forecast opened");
        await assertForecastLayout(g, "forecast beside the numbers lesson at 1280×800");
        ctx.artifact(await g.screenshot("forecast-lesson-1280"));
      }
      await click(g, "#mentor [data-lesson=skip], #mentor [data-lesson=ack]", `skip ${id}`);
      await waitLesson(g, id, 0, `${id} skipped`);
      await g.act({ type: "close" });
    }
    const seasons = Object.values(when);
    if (new Set(seasons).size !== seasons.length) throw new ProbeError(`two concepts shared a season: ${JSON.stringify(when)}`);
    g.assertNoErrors("during the lessons");
    ctx.note(`arrivals: ${Object.entries(when).map(([id, s]) => `${id}@${s}`).join(" ")}; lessons by real clicks (${how.join(", ")}); farm lesson resumed after a sleep`);

    // ---- The forecast at 1280×800 and 1024×768 with a long name among the candidates.
    const st = await g.state();
    const ram = st.flock.find((/** @type {string} */ x) => st.sheep[x].sex === "ram");
    const ewe = st.flock.find((/** @type {string} */ x) => st.sheep[x].sex === "ewe" && st.season - st.sheep[x].born >= 2);
    await g.act({ type: "rename", id: ram, name: "Sir Bartholomew Woolsey" });
    await g.act({ type: "open", panel: "forecast", id: ewe });
    await g.waitPanel("forecast");
    await g.page.waitForTimeout(250);
    await assertForecastLayout(g, "forecast at 1280×800");
    ctx.artifact(await g.screenshot("forecast-1280"));
    await g.page.setViewportSize({ width: 1024, height: 768 });
    await g.page.waitForTimeout(300);
    await assertForecastLayout(g, "forecast at 1024×768");
    ctx.artifact(await g.screenshot("forecast-1024"));
    g.assertNoErrors("forecast layout");
    ctx.note("forecast: ten lambs on one row and long names clear of their hints at 1280×800, 1024×768 and beside a lesson card");
    await g.close();
  },
};

/** All ten litter tiles on one row; no candidate's name runs into its hint. @param {import("./lib/browser.mjs").GamePage} g */
async function assertForecastLayout(g, /** @type {string} */ where) {
  const bad = await g.page.evaluate(() => {
    const tiles = [...document.querySelectorAll("#overlay .forecast .litter .lamb-tile")].map((t) => t.getBoundingClientRect());
    const out = [];
    if (tiles.length !== 10) out.push(`${tiles.length} lamb tiles`);
    const tops = new Set(tiles.map((r) => Math.round(r.top)));
    if (tops.size > 1) out.push(`the litter wraps onto ${tops.size} rows`);
    for (const c of document.querySelectorAll("#overlay .cand")) {
      const n = c.querySelector(".cn")?.getBoundingClientRect(), h = c.querySelector(".hint")?.getBoundingClientRect();
      if (n && h && h.width > 0 && n.right > h.left + 1) out.push(`"${c.querySelector(".cn")?.textContent?.trim()}" runs into its hint`);
    }
    return out.join("; ");
  });
  if (bad) throw new ProbeError(`${where}: ${bad}`);
}

if (isMain(import.meta.url)) runSteps([lessons]);
