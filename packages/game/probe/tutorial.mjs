// Tutorial probe: a new player's first ten minutes. Boots ?tutorial=1 and plays every step with real clicks
// (a sheep in the field is clicked where the tutorial's arrow points; __game.act is the fallback only if that
// misses). Rules checked: each step advances exactly on its action; the mentor card never covers the thing it
// points at or the open panel's primary button; the Punnet step shows 3 polled : 1 horned for the carrier
// pair with no allele letters (numbers not unlocked), hover and click light the right copies and cells, and it
// fits at 1280×800 and 1024×768; the first lamb shows a hidden colour, earns discovery cards and brings only
// the codex; the colour square follows; the market step buys a ewe; there is no handover (the end flock is the
// four tutorial sheep); the codex keeps the Punnet card; the next season brings the letters alone; skipping
// keeps two sheep; ?seed without ?tutorial has no tutorial. Screenshots tut-01..tut-12, tut-04-hover/-pick/-1024,
// tut-codex, tut-after.
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

/**
 * What the mentor's Punnet square shows: gene, counts, the cells' looks in order, whether any allele letters
 * or genotype-like strings are on screen, and its text.
 * @param {import("./lib/browser.mjs").GamePage} g
 */
const punnetFacts = (g) => g.page.evaluate(() => {
  const p = /** @type {HTMLElement | null} */ (document.querySelector("#mentor .punnet"));
  const m = document.querySelector("#mentor");
  if (!p) return { found: false, gene: "", dom: 0, rec: 0, cells: [], letters: false, genotype: "", text: m?.textContent ?? "" };
  const text = /** @type {HTMLElement} */ (m).innerText;
  const g = text.match(/\b(?:[PpAaBbDdSs]\/[PpAaBbDdSs]|Aw\/a|a\/Aw|Pp|PP|pp)\b/);
  return {
    found: true, gene: p.dataset.gene ?? "", dom: Number(p.dataset.dom), rec: Number(p.dataset.rec),
    cells: [...p.querySelectorAll(".pcell")].map((c) => /** @type {HTMLElement} */ (c).dataset.look ?? ""),
    letters: !!p.querySelector(".p-let"), genotype: g ? g[0] : "", text,
  };
});

/** The mentor card fits on screen without scrolling (its button visible). @param {import("./lib/browser.mjs").GamePage} g @param {string} where */
async function assertMentorFits(g, where) {
  const bad = await g.page.evaluate(() => {
    const m = /** @type {HTMLElement} */ (document.querySelector("#mentor"));
    const b = m.querySelector("[data-tutorial=ack]");
    const r = m.getBoundingClientRect();
    if (m.scrollHeight > m.clientHeight + 2) return `the mentor card scrolls (${m.scrollHeight} > ${m.clientHeight})`;
    if (r.bottom > window.innerHeight || r.top < 0) return `the mentor card is off screen (${Math.round(r.top)}–${Math.round(r.bottom)})`;
    if (b && b.getBoundingClientRect().bottom > window.innerHeight) return "its button is off screen";
    return "";
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
    // 4. The Punnet square (forecast open): 3 polled : 1 horned for two horn carriers, tied to the forecast.
    await waitStep(g, 4, "after Find a mate");
    await g.waitPanel("forecast");
    const pq = await punnetFacts(g);
    if (!pq.found) throw new ProbeError("step 4 should show a Punnet square in the mentor card");
    if (pq.gene !== "horns" || pq.dom !== 3 || pq.rec !== 1 || pq.cells.join(",") !== "polled,polled,polled,horned") {
      throw new ProbeError(`the tutorial pair (both horn carriers) should give 3 polled : 1 horned, the square shows ${JSON.stringify(pq)}`);
    }
    if (pq.letters || pq.genotype) throw new ProbeError(`no allele letters before the numbers unlock, the square shows "${pq.genotype || "letters"}"`);
    if (!/one lamb in four has horns/i.test(pq.text)) throw new ProbeError("step 4 should tie the square to the forecast (one lamb in four has horns)");
    const legend = await g.page.locator("#overlay .legend.extras").first().textContent();
    const hornedTiles = await g.page.locator("#overlay .litter .lb.horn").count();
    if (hornedTiles < 2 || hornedTiles > 3) throw new ProbeError(`about one lamb in four of the ten should wear horns, ${hornedTiles} do`);
    if (!/one in four horned/i.test(legend ?? "")) throw new ProbeError(`the forecast's horn legend should say one in four, it says "${legend}"`);
    const ringed = await g.page.locator("#overlay .legend.extras .xkey.tut-ring").first().textContent().catch(() => "");
    if (!/horned/.test(ringed ?? "")) throw new ProbeError(`step 4 should ring the forecast's horn legend, rings "${ringed}"`);
    await shot("tut-04");
    // Interactive: pointing at the horned lamb lights the two horns copies; clicking a copy lights its column.
    await g.page.locator('#mentor .pcell[data-r="1"][data-c="1"]').hover();
    await g.page.waitForTimeout(250);
    const lit = await g.page.evaluate(() => [...document.querySelectorAll("#mentor .pcopy")].filter((el) => getComputedStyle(el).borderStyle === "solid").map((el) => /** @type {HTMLElement} */ (el).dataset.pick).sort().join(","));
    if (lit !== "d1,s1") throw new ProbeError(`hovering the horned lamb should light the ewe's and ram's horns copies (d1,s1), lit: "${lit}"`);
    ctx.artifact(await g.screenshot("tut-04-hover"));
    await g.page.locator('#mentor .pcopy[data-pick="s1"]').click();
    await g.page.mouse.move(5, 400);
    await g.page.waitForTimeout(250);
    const col = await g.page.evaluate(() => [...document.querySelectorAll("#mentor .pcell")].filter((el) => getComputedStyle(el).boxShadow !== "none").map((el) => `${/** @type {HTMLElement} */ (el).dataset.r}${/** @type {HTMLElement} */ (el).dataset.c}`).sort().join(","));
    if (col !== "01,11") throw new ProbeError(`clicking the ram's horns copy should light the cells it goes to (01,11), lit: "${col}"`);
    ctx.artifact(await g.screenshot("tut-04-pick"));
    // The same moment on a small laptop screen: the square and the forecast still fit beside each other.
    await g.page.setViewportSize({ width: 1024, height: 768 });
    await g.page.waitForTimeout(250);
    await shot("tut-04-1024");
    await assertMentorFits(g, "step 4 at 1024×768");
    await g.page.setViewportSize({ width: 1280, height: 800 });
    await g.page.waitForTimeout(200);
    await assertMentorFits(g, "step 4 at 1280×800");
    await click(g, "#mentor [data-tutorial=ack]", "got it (Punnet square)");
    // 5. Plan the mating.
    await waitStep(g, 5, "after the Punnet square");
    await shot("tut-05");
    await click(g, "#overlay [data-plan]", "plan");
    // 6. Sleep.
    await waitStep(g, 6, "after planning");
    const s5 = await g.state();
    if (s5.plans[T.ewe] !== T.ram) throw new ProbeError(`the plan should be ${T.ewe}×${T.ram}: ${JSON.stringify(s5.plans)}`);
    await shot("tut-06");
    await click(g, "#hud [data-sleep]", "sleep");
    // 7. The reveal.
    await g.waitPanel("report", 12_000);
    await waitStep(g, 7, "after sleeping");
    const s6 = await g.state();
    const lambs = s6.flock.map((/** @type {string} */ id) => s6.sheep[id]).filter((/** @type {any} */ s) => s.dam === T.ewe && s.sire === T.ram);
    if (lambs.length !== 1) throw new ProbeError(`the tutorial mating should give one lamb, got ${lambs.length}`);
    const lamb = lambs[0];
    if (lamb.phenotype.colour === "white" || lamb.phenotype.colour === "blue") throw new ProbeError(`the tutorial's first lamb should show a hidden colour, it is ${lamb.phenotype.colour}`);
    const cards = s6.discoveries.filter((/** @type {any} */ d) => d.sheep === T.ewe || d.sheep === T.ram);
    if (!cards.length) throw new ProbeError("the surprise lamb should earn a discovery card about its parents");
    if (!(await g.page.locator("#overlay .dcard").count())) throw new ProbeError("the report should show the discovery card");
    if (s6.act !== 1) throw new ProbeError(`the first lamb should move the story to act index 1, act is ${s6.act}`);
    // Gentle pacing: only the codex arrives with the first lamb (no orders, vet or dogs yet).
    if (JSON.stringify(s6.unlocks) !== JSON.stringify(["cards"])) throw new ProbeError(`only the codex should arrive with the first lamb, unlocks: ${JSON.stringify(s6.unlocks)}`);
    if ((s6.orders ?? []).length) throw new ProbeError("no orders should arrive during the tutorial");
    await shot("tut-07");
    ctx.note(`first lamb: ${lamb.name} (${lamb.phenotype.colour}); ${cards.length} discovery card(s); unlocks after the reveal: ${s6.unlocks.join(",")}`);
    await click(g, "#overlay .row [data-close].primary", "back to the farm");
    // 8. Why that colour: the same square, hidden colour copy from each parent.
    await waitStep(g, 8, "after closing the report");
    const cq = await punnetFacts(g);
    if (!cq.found || cq.gene !== "colour" || cq.dom !== 3 || cq.rec !== 1) throw new ProbeError(`step 8 should show the colour square (3 white : 1 coloured), got ${JSON.stringify(cq)}`);
    if (cq.letters || cq.genotype) throw new ProbeError("no allele letters in the colour square before the numbers unlock");
    await shot("tut-08");
    await assertMentorFits(g, "step 8");
    await click(g, "#mentor [data-tutorial=ack]", "got it (why that colour)");
    // 9. Lambs need two seasons.
    await waitStep(g, 9, "after the colour square");
    await shot("tut-09");
    how.push(`lamb:${await clickSheep(g, lamb.id, 10)}`);
    // 10. The market.
    await waitStep(g, 10, "after clicking the lamb");
    await click(g, "#hud [data-open=market]", "market");
    await g.waitPanel("market");
    await g.page.waitForTimeout(150);
    await shot("tut-10");
    const money8 = (await g.state()).money;
    await click(g, "#overlay .tut-ring[data-buy]", "buy the ringed ewe");
    // 11. The goal.
    await waitStep(g, 11, "after buying a ewe");
    const s9 = await g.state();
    const bought = s9.flock.map((/** @type {string} */ id) => s9.sheep[id]).filter((/** @type {any} */ s) => s.origin === "market" && s.sex === "ewe");
    if (bought.length !== 1 || !(s9.money < money8)) throw new ProbeError(`the market step should buy one ewe (bought ${bought.length}, coins ${money8} → ${s9.money})`);
    await shot("tut-11");
    await click(g, "#mentor [data-tutorial=ack]", "got it");
    // 12. Your flock: no handover. Exactly the ewe, the ram, their lamb and the bought ewe.
    await waitStep(g, 12, "after the goal");
    await shot("tut-12");
    const s10 = await g.state();
    const expect = [T.ewe, T.ram, lamb.id, bought[0].id].sort();
    if (JSON.stringify([...s10.flock].sort()) !== JSON.stringify(expect)) throw new ProbeError(`end flock should be just the tutorial sheep (no handover): ${JSON.stringify(s10.flock)} vs ${JSON.stringify(expect)}`);
    const mentorText = await g.page.locator("#mentor").textContent();
    if (/Granny Moss|minding the rest/i.test(mentorText ?? "")) throw new ProbeError("the last step should not hand over a neighbour's flock");

    // ?seed without ?tutorial: no tutorial, the same small farm (two founders, a quiet market).
    const n = await ctx.newPage();
    await n.boot(`?seed=${s0.seed}&fresh=1&nomotion=1`);
    const ns = await n.state();
    if ((await tut(n)) !== null) throw new ProbeError("?seed without ?tutorial must not start a tutorial");
    if (JSON.stringify(ns.flock) !== JSON.stringify(s0.flock) || ns.money !== s0.money) throw new ProbeError(`?seed=${s0.seed} should start with the tutorial's two sheep and coins (flock ${JSON.stringify(ns.flock)}, coins ${ns.money})`);
    await n.close();

    await click(g, "#mentor [data-tutorial=ack]", "let's farm");
    await g.page.waitForFunction(() => /** @type {any} */ (window).__game.tutorial()?.done === true, null, { timeout: 5_000 });
    const hud = await g.page.evaluate(() => ({ mentor: !(/** @type {HTMLElement} */ (document.querySelector("#mentor"))).hidden, goal: document.querySelector("#hud .pill.goal")?.textContent ?? "", arrow: !(/** @type {HTMLElement} */ (document.querySelector("#tut-arrow"))).hidden }));
    if (hud.mentor || hud.arrow) throw new ProbeError(`after the tutorial the mentor and arrow should be gone: ${JSON.stringify(hud)}`);
    if (!/blue lamb/i.test(hud.goal)) throw new ProbeError(`after the tutorial the HUD should show the act goal, shows "${hud.goal}"`);
    ctx.artifact(await g.screenshot("tut-end"));
    // The codex keeps the Punnet square as a concept card.
    await click(g, "#hud [data-open=codex]", "codex");
    await g.waitPanel("codex");
    const card = g.page.locator('#overlay [data-concept="punnet"]');
    if (!(await card.count())) throw new ProbeError("the codex should keep the Punnet square as a concept card");
    if (!(await card.locator(".punnet").count())) throw new ProbeError("the codex's Punnet card should draw the square");
    await card.scrollIntoViewIfNeeded();
    await g.page.waitForTimeout(150);
    ctx.artifact(await g.screenshot("tut-codex"));
    // One sleep after the tutorial: the next concept (letters) arrives alone, and still no new sheep.
    await g.act({ type: "close" });
    const beforeFlock = new Set((await g.state()).flock);
    await g.act({ type: "sleep" });
    await g.waitPanel("report", 12_000);
    const s11 = await g.state();
    const arrived = s11.flock.filter((/** @type {string} */ id) => !beforeFlock.has(id));
    if (arrived.length) throw new ProbeError(`no sheep should arrive after the tutorial except bred lambs, got ${arrived.join(",")}`);
    if (JSON.stringify(s11.unlocks) !== JSON.stringify(["cards", "orders"])) throw new ProbeError(`the season after the tutorial should bring the letters alone, unlocks: ${JSON.stringify(s11.unlocks)}`);
    ctx.artifact(await g.screenshot("tut-after"));
    g.assertNoErrors("during the tutorial");
    ctx.note(`seed ${s0.seed}: steps 1–12 advanced on their actions (${how.join(", ")}); Punnet 3:1 (hover and pick work), colour square 3:1; end flock = 4 tutorial sheep, no handover; next season brings only the letters`);
    await g.close();

    // Skipping: from the mentor card, the flock arrives at once.
    const k = await ctx.newPage();
    await k.boot("?tutorial=1&seed=7&fresh=1&nomotion=1");
    await click(k, "#mentor [data-tutorial=skip]", "skip");
    await k.page.waitForFunction(() => /** @type {any} */ (window).__game.tutorial()?.done === true, null, { timeout: 5_000 });
    const ks = await k.state();
    if (ks.flock.length !== 2) throw new ProbeError(`skipping should keep the two starter sheep and add none (flock ${ks.flock.length})`);
    k.assertNoErrors("skipping the tutorial");
    ctx.note("skip keeps the two-sheep farm (no handover)");
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
