// Tutorial probe: a new player's first ten minutes. Boots ?tutorial=1 and plays every step with real clicks
// (a sheep in the field is clicked where the tutorial's arrow points; __game.act is the fallback only if that
// misses). Rules checked: each step advances exactly on its action; the mentor card never covers the thing it
// points at or the open panel's primary button; the first lamb shows a hidden colour and earns a discovery
// card; the market step buys a ewe; the handover brings exactly the starter flock newGame(seed) would have
// had; skipping works; ?seed without ?tutorial has no tutorial. Screenshots tut-01..tut-10.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";

/** @param {import("./lib/browser.mjs").GamePage} g */
const tut = (g) => g.page.evaluate(() => /** @type {any} */ (window).__game.tutorial());

/** @param {import("./lib/browser.mjs").GamePage} g @param {number} step @param {string} what */
async function waitStep(g, step, what) {
  try {
    await g.page.waitForFunction((n) => /** @type {any} */ (window).__game.tutorial()?.step === n, step, { timeout: 8_000 });
  } catch {
    throw new ProbeError(`${what}: expected tutorial step ${step}, got ${JSON.stringify(await tut(g))}`);
  }
  // let the arrow's animation frame place itself
  await g.page.waitForTimeout(150);
}

/**
 * The mentor card must not cover the ringed target(s), the arrow's tip or the open panel's primary button.
 * @param {import("./lib/browser.mjs").GamePage} g @param {string} where
 */
async function assertLayout(g, where) {
  const bad = await g.page.evaluate(() => {
    const m = document.querySelector("#mentor");
    if (!m || /** @type {HTMLElement} */ (m).hidden) return "mentor card missing";
    const mr = m.getBoundingClientRect();
    const hit = (/** @type {DOMRect} */ r) => r.width > 0 && r.height > 0 && r.left < mr.right && r.right > mr.left && r.top < mr.bottom && r.bottom > mr.top;
    const out = [];
    for (const el of document.querySelectorAll(".tut-ring")) if (hit(el.getBoundingClientRect())) out.push(`ringed ${el.tagName.toLowerCase()}.${el.className}`);
    const primary = document.querySelector("#overlay .panel .row button.primary, #overlay .panel button.primary");
    if (primary && hit(primary.getBoundingClientRect())) out.push(`primary button "${primary.textContent?.trim()}"`);
    const a = /** @type {HTMLElement | null} */ (document.querySelector("#tut-arrow"));
    if (a && !a.hidden) {
      const x = parseFloat(a.style.left), y = parseFloat(a.style.top);
      if (x >= mr.left && x <= mr.right && y >= mr.top && y <= mr.bottom) out.push("the arrow's tip");
    }
    return out.length ? `mentor card covers ${out.join(", ")}` : "";
  });
  if (bad) throw new ProbeError(`${where}: ${bad}`);
}

/** Where the arrow points (client px), or null when it is hidden. @param {import("./lib/browser.mjs").GamePage} g */
const arrowTip = (g) => g.page.evaluate(() => {
  const a = /** @type {HTMLElement | null} */ (document.querySelector("#tut-arrow"));
  if (!a || a.hidden) return null;
  return { x: parseFloat(a.style.left), y: parseFloat(a.style.top), dir: a.dataset.dir ?? "down" };
});

/**
 * Click a sheep in the field where the arrow points (a little below its head); fall back to opening its card.
 * @param {import("./lib/browser.mjs").GamePage} g @param {string} id @param {number} nextStep
 * @returns {Promise<"click" | "act">}
 */
async function clickSheep(g, id, nextStep) {
  const tip = await arrowTip(g);
  if (tip) {
    for (const dy of [22, 34, 12]) {
      await g.page.mouse.click(tip.x, tip.y + dy);
      const ok = await g.page.waitForFunction((n) => /** @type {any} */ (window).__game.tutorial()?.step === n, nextStep, { timeout: 1_200 }).then(() => true, () => false);
      if (ok) return "click";
    }
  }
  const r = await g.act({ type: "open", panel: "sheep", id });
  if (!r.ok) throw new ProbeError(`opening sheep ${id} failed: ${r.error}`);
  return "act";
}

/** @param {import("./lib/browser.mjs").GamePage} g @param {string} sel @param {string} what */
async function click(g, sel, what) {
  const el = g.page.locator(sel).first();
  if (!(await el.count())) throw new ProbeError(`${what}: nothing matches ${sel}`);
  await el.click();
}

/** @type {import("./lib/harness.mjs").Step} */
export const tutorial = {
  name: "tutorial",
  async run(ctx) {
    const g = await ctx.newPage();
    await g.boot("?tutorial=1&fresh=1&nomotion=1");
    const s0 = await g.state();
    const T = s0.tutorial;
    if (!T) throw new ProbeError("?tutorial=1 should start a tutorial game (state.tutorial is null)");
    const t0 = await tut(g);
    if (t0?.step !== 1 || t0.id !== "ewe" || t0.done) throw new ProbeError(`tutorial should start at step 1 "ewe", got ${JSON.stringify(t0)}`);
    const start = s0.flock.map((/** @type {string} */ id) => s0.sheep[id]);
    if (start.length !== 2 || start[0].sex !== "ewe" || start[1].sex !== "ram" || start.some((/** @type {any} */ s) => s.phenotype.colour !== "white")) {
      throw new ProbeError(`the tutorial farm should start with one white ewe and one white ram, got ${start.map((/** @type {any} */ s) => `${s.name} ${s.sex} ${s.phenotype.colour}`).join(", ")}`);
    }
    const shot = async (/** @type {string} */ name) => { await assertLayout(g, name); ctx.artifact(await g.screenshot(name)); };
    const how = [];

    // 1. Meet your ewe.
    await waitStep(g, 1, "boot");
    await shot("tut-01");
    how.push(`ewe:${await clickSheep(g, T.ewe, 2)}`);
    // 2. Meet your ram (the ewe's card is open, explained).
    await waitStep(g, 2, "after clicking the ewe");
    if ((await g.panel()) !== "sheep") throw new ProbeError(`step 2 should show the ewe's card, panel is ${await g.panel()}`);
    await shot("tut-02");
    how.push(`ram:${await clickSheep(g, T.ram, 3)}`);
    // 3. Find a mate.
    await waitStep(g, 3, "after clicking the ram");
    await shot("tut-03");
    await click(g, "#overlay [data-findmate]", "find a mate");
    // 4. Plan the mating (the forecast).
    await waitStep(g, 4, "after Find a mate");
    await g.waitPanel("forecast");
    await shot("tut-04");
    // The same moment on a small laptop screen: the forecast still fits beside the mentor.
    await g.page.setViewportSize({ width: 1024, height: 768 });
    await g.page.waitForTimeout(200);
    await shot("tut-04-1024");
    await g.page.setViewportSize({ width: 1280, height: 800 });
    await g.page.waitForTimeout(200);
    await click(g, "#overlay [data-plan]", "plan");
    // 5. Sleep.
    await waitStep(g, 5, "after planning");
    const s5 = await g.state();
    if (s5.plans[T.ewe] !== T.ram) throw new ProbeError(`the plan should be ${T.ewe}×${T.ram}: ${JSON.stringify(s5.plans)}`);
    await shot("tut-05");
    await click(g, "#hud [data-sleep]", "sleep");
    // 6. The reveal.
    await g.waitPanel("report", 12_000);
    await waitStep(g, 6, "after sleeping");
    const s6 = await g.state();
    const lambs = s6.flock.map((/** @type {string} */ id) => s6.sheep[id]).filter((/** @type {any} */ s) => s.dam === T.ewe && s.sire === T.ram);
    if (lambs.length !== 1) throw new ProbeError(`the tutorial mating should give one lamb, got ${lambs.length}`);
    const lamb = lambs[0];
    if (lamb.phenotype.colour === "white" || lamb.phenotype.colour === "blue") throw new ProbeError(`the tutorial's first lamb should show a hidden colour, it is ${lamb.phenotype.colour}`);
    const cards = s6.discoveries.filter((/** @type {any} */ d) => d.sheep === T.ewe || d.sheep === T.ram);
    if (!cards.length) throw new ProbeError("the surprise lamb should earn a discovery card about its parents");
    if (!(await g.page.locator("#overlay .dcard").count())) throw new ProbeError("the report should show the discovery card");
    if (s6.act !== 1) throw new ProbeError(`the first lamb should move the story to act index 1, act is ${s6.act}`);
    await shot("tut-06");
    ctx.note(`first lamb: ${lamb.name} (${lamb.phenotype.colour}); ${cards.length} discovery card(s)`);
    await click(g, "#overlay .row [data-close].primary", "back to the farm");
    // 7. Lambs need two seasons.
    await waitStep(g, 7, "after closing the report");
    await shot("tut-07");
    how.push(`lamb:${await clickSheep(g, lamb.id, 8)}`);
    // 8. The market.
    await waitStep(g, 8, "after clicking the lamb");
    await click(g, "#hud [data-open=market]", "market");
    await g.waitPanel("market");
    await g.page.waitForTimeout(150);
    await shot("tut-08");
    const money8 = (await g.state()).money;
    await click(g, "#overlay .tut-ring[data-buy]", "buy the ringed ewe");
    // 9. The goal.
    await waitStep(g, 9, "after buying a ewe");
    const s9 = await g.state();
    const bought = s9.flock.map((/** @type {string} */ id) => s9.sheep[id]).filter((/** @type {any} */ s) => s.origin === "market" && s.sex === "ewe");
    if (bought.length !== 1 || !(s9.money < money8)) throw new ProbeError(`the market step should buy one ewe (bought ${bought.length}, coins ${money8} → ${s9.money})`);
    await shot("tut-09");
    await click(g, "#mentor [data-tutorial=ack]", "got it");
    // 10. The flock arrives.
    await waitStep(g, 10, "after the goal");
    await shot("tut-10");
    const s10 = await g.state();

    // The handover is exactly newGame(seed)'s starter flock.
    const n = await ctx.newPage();
    await n.boot(`?seed=${s0.seed}&fresh=1&nomotion=1`);
    const ns = await n.state();
    if ((await tut(n)) !== null) throw new ProbeError("?seed without ?tutorial must not start a tutorial");
    const sig = (/** @type {any} */ s, /** @type {number} */ season) => JSON.stringify({ id: s.id, name: s.name, sex: s.sex, age: season - s.born, genome: s.genome, phenotype: s.phenotype });
    for (const id of ns.flock) {
      const a = s10.sheep[id];
      if (!a || !s10.flock.includes(id)) throw new ProbeError(`starter sheep ${ns.sheep[id].name} (${id}) is missing after the handover`);
      if (sig(a, s10.season) !== sig(ns.sheep[id], ns.season)) throw new ProbeError(`starter sheep ${id} differs from newGame(${s0.seed})'s`);
    }
    const expect = [...ns.flock, T.ewe, T.ram, lamb.id, bought[0].id].sort();
    if (JSON.stringify([...s10.flock].sort()) !== JSON.stringify(expect)) throw new ProbeError(`end flock should be the starter flock plus the tutorial sheep: ${JSON.stringify(s10.flock)} vs ${JSON.stringify(expect)}`);
    await n.close();

    await click(g, "#mentor [data-tutorial=ack]", "let's farm");
    await g.page.waitForFunction(() => /** @type {any} */ (window).__game.tutorial()?.done === true, null, { timeout: 5_000 });
    const hud = await g.page.evaluate(() => ({ mentor: !(/** @type {HTMLElement} */ (document.querySelector("#mentor"))).hidden, goal: document.querySelector("#hud .pill.goal")?.textContent ?? "", arrow: !(/** @type {HTMLElement} */ (document.querySelector("#tut-arrow"))).hidden }));
    if (hud.mentor || hud.arrow) throw new ProbeError(`after the tutorial the mentor and arrow should be gone: ${JSON.stringify(hud)}`);
    if (!/blue lamb/i.test(hud.goal)) throw new ProbeError(`after the tutorial the HUD should show the act goal, shows "${hud.goal}"`);
    ctx.artifact(await g.screenshot("tut-end"));
    g.assertNoErrors("during the tutorial");
    ctx.note(`seed ${s0.seed}: steps 1–10 advanced on their actions (${how.join(", ")}); handover = newGame(${s0.seed}) flock of ${ns.flock.length} + 4 tutorial sheep`);
    await g.close();

    // Skipping: from the mentor card, the flock arrives at once.
    const k = await ctx.newPage();
    await k.boot("?tutorial=1&seed=7&fresh=1&nomotion=1");
    await click(k, "#mentor [data-tutorial=skip]", "skip");
    await k.page.waitForFunction(() => /** @type {any} */ (window).__game.tutorial()?.done === true, null, { timeout: 5_000 });
    const ks = await k.state();
    if (ks.flock.length !== 7) throw new ProbeError(`skipping should hand over the 5 starter sheep (flock ${ks.flock.length}, want 7)`);
    k.assertNoErrors("skipping the tutorial");
    ctx.note("skip hands over the starter flock at once");
    // Settings → Replay the tutorial (behind a confirm) starts a fresh tutorial farm.
    await click(k, "#hud [data-open=settings]", "settings");
    await k.waitPanel("settings");
    await click(k, '#overlay [data-tab="confirm-tutorial"]', "replay…");
    await click(k, '#overlay [data-tutorial="start"]', "yes, replay it");
    await k.page.waitForFunction(() => /** @type {any} */ (window).__game.tutorial()?.step === 1, null, { timeout: 5_000 });
    if ((await k.state()).flock.length !== 2) throw new ProbeError("replaying the tutorial should start a two-sheep farm");
    k.assertNoErrors("replaying the tutorial");
    await k.close();

    // A first visit: the title offers the tutorial first; clicking it keeps the title's farm seed.
    const f = await ctx.newPage();
    await f.boot("?fresh=1&nomotion=1");
    await f.waitPanel("title");
    const seed = (await f.state()).seed;
    const first = await f.page.locator("#overlay .title-actions button").first().textContent();
    if (!/tutorial/i.test(first ?? "")) throw new ProbeError(`the title's first button should start the tutorial, it says "${first}"`);
    await click(f, '#overlay [data-tutorial="start"]', "start with the tutorial");
    await f.page.waitForFunction(() => /** @type {any} */ (window).__game.tutorial()?.step === 1, null, { timeout: 5_000 });
    const fs = await f.state();
    if (fs.seed !== seed || (await f.panel()) !== "") throw new ProbeError(`starting the tutorial from the title should keep seed ${seed} and close the title (seed ${fs.seed}, panel "${await f.panel()}")`);
    f.assertNoErrors("starting the tutorial from the title");
    ctx.note("title → Start with the tutorial, and settings → Replay the tutorial both start step 1");
    await f.close();
  },
};

if (isMain(import.meta.url)) runSteps([tutorial]);
