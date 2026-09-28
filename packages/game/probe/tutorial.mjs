// Tutorial probe: a new player's first ten minutes, over three lambings (one idea each). Boots ?tutorial=1
// and plays every step with real clicks (a sheep in the field is clicked where the tutorial's arrow points;
// __game.act is the fallback only if that misses). Rules checked: each step advances exactly on its action; the
// mentor card never covers the thing it points at or the open panel's primary button; season 1: meet, forecast
// (no Punnet square yet), plan, sleep → lamb 1 is white and polled, with no card and no codex; season 2: the
// same pair again → lamb 2 is horned (still white) with the first discovery card and the codex, and only then
// the Punnet square shows 3 polled : 1 horned with no allele letters (hover and click light the right copies
// and cells; it fits at 1280×800 and 1024×768); season 3: again → lamb 3 is black, both parents get
// hidden-colour cards and the colour square follows; the market step buys a ewe; no handover (the end flock is
// the pair, their three lambs and the bought ewe); the letters (a horns letter) arrive the moment the tutorial
// ends, with their lesson; the codex keeps the Punnet card; the next season (Year 2 Spring) brings the vet
// alone; skipping keeps two sheep and brings the letters; ?seed without ?tutorial has no tutorial.
// Screenshots tut-01..tut-17, tut-10-hover/-pick/-1024, tut-end (the letters' lesson), tut-codex, tut-after.
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
export async function assertLayout(g, where) {
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
export const arrowTip = (g) => g.page.evaluate(() => {
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
  // Farm places live in the HUD's bag: open its tray first when the button is tucked away.
  if (sel.startsWith("#hud [data-open") && !(await el.isVisible())) await g.page.locator("#hud [data-tray=open]").click();
  await el.click();
}

/** Click a sheep in the field where the arrow points and wait for its card (the step does not move on). */
async function openSheep(/** @type {import("./lib/browser.mjs").GamePage} */ g, /** @type {string} */ id) {
  const tip = await arrowTip(g);
  if (tip) {
    for (const dy of [22, 34, 12]) {
      await g.page.mouse.click(tip.x, tip.y + dy);
      const ok = await g.page.waitForFunction((i) => document.body.dataset.panel === "sheep" && /** @type {any} */ (window).__game.state() && document.querySelector("#overlay [data-findmate]")?.getAttribute("data-findmate") === i, id, { timeout: 1_200 }).then(() => true, () => false);
      if (ok) return "click";
      if ((await g.panel()) !== "") await g.act({ type: "close" });
    }
  }
  const r = await g.act({ type: "open", panel: "sheep", id });
  if (!r.ok) throw new ProbeError(`opening sheep ${id} failed: ${r.error}`);
  return "act";
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
    /** The pair's lambs so far. */
    const lambsOf = (/** @type {any} */ st) => Object.values(st.sheep).filter((/** @type {any} */ s) => s.dam === T.ewe && s.sire === T.ram).sort((/** @type {any} */ a, /** @type {any} */ b) => a.born - b.born);
    /** No Punnet square in the mentor card yet. */
    const noSquare = async (/** @type {string} */ where) => { if (await g.page.locator("#mentor .punnet").count()) throw new ProbeError(`${where}: no Punnet square before the horned lamb`); };
    /** Plan the pair again by clicks: the ewe in the field, Find a mate, Plan this mating. */
    const planAgain = async (/** @type {number} */ next) => {
      how.push(`again:${await openSheep(g, T.ewe)}`);
      await click(g, "#overlay [data-findmate]", "find a mate (again)");
      await g.waitPanel("forecast");
      await click(g, "#overlay [data-plan]", "plan (again)");
      await waitStep(g, next, "after planning again");
      const st = await g.state();
      if (st.plans[T.ewe] !== T.ram) throw new ProbeError(`the plan should be ${T.ewe}×${T.ram}: ${JSON.stringify(st.plans)}`);
    };
    /** Sleep and check the new lamb (index i) and the report. */
    const sleepFor = async (/** @type {number} */ i, /** @type {number} */ revealStep) => {
      await click(g, "#hud [data-sleep]", "sleep");
      await g.waitPanel("report", 12_000);
      await waitStep(g, revealStep, `after sleep ${i + 1}`);
      const st = await g.state();
      const ls = lambsOf(st);
      if (ls.length !== i + 1) throw new ProbeError(`the tutorial pair should have ${i + 1} lamb(s) after sleep ${i + 1}, has ${ls.length}`);
      return { st, lamb: ls[i] };
    };

    // ---- Season 1: meet, forecast, plan, sleep → a plain white lamb.
    await waitStep(g, 1, "boot");
    await shot("tut-01");
    how.push(`ewe:${await clickSheep(g, T.ewe, 2)}`);
    await waitStep(g, 2, "after clicking the ewe");
    if ((await g.panel()) !== "sheep") throw new ProbeError(`step 2 should show the ewe's card, panel is ${await g.panel()}`);
    await shot("tut-02");
    how.push(`ram:${await clickSheep(g, T.ram, 3)}`);
    await waitStep(g, 3, "after clicking the ram");
    await shot("tut-03");
    await click(g, "#overlay [data-findmate]", "find a mate");
    await waitStep(g, 4, "after Find a mate");
    await g.waitPanel("forecast");
    await noSquare("step 4");
    const legend = await g.page.locator("#overlay .legend.extras").first().textContent();
    const hornedTiles = await g.page.locator("#overlay .litter .lb.horn").count();
    if (hornedTiles < 2 || hornedTiles > 3) throw new ProbeError(`about one lamb in four of the ten should wear horns, ${hornedTiles} do`);
    if (!/one in four horned/i.test(legend ?? "")) throw new ProbeError(`the forecast's horn legend should say one in four, it says "${legend}"`);
    if (!/one chance in ten/i.test((await g.page.locator("#mentor").textContent()) ?? "")) throw new ProbeError("step 4 should say one sentence about the ten-lamb forecast");
    await shot("tut-04");
    await click(g, "#overlay [data-plan]", "plan");
    await waitStep(g, 5, "after planning");
    await shot("tut-05");
    const one = await sleepFor(0, 6);
    if (one.lamb.phenotype.colour !== "white" || one.lamb.phenotype.horns !== "polled") throw new ProbeError(`lamb 1 should be white and polled, it is ${one.lamb.phenotype.colour}, ${one.lamb.phenotype.horns}`);
    if (await g.page.locator("#overlay .dcard").count()) throw new ProbeError("the plain first lamb should bring no discovery card");
    if (one.st.unlocks.length) throw new ProbeError(`nothing new should arrive with the first lamb, unlocks: ${JSON.stringify(one.st.unlocks)}`);
    if (one.st.act !== 0) throw new ProbeError(`the story's first act should wait for the black lamb, act is ${one.st.act} after lamb 1`);
    await noSquare("step 6");
    await shot("tut-06");
    await click(g, "#overlay .row [data-close].primary", "back to the farm");

    // ---- Season 2: the same pair again → a horned lamb, the first card, then the Punnet square.
    await waitStep(g, 7, "after closing the first report");
    await noSquare("step 7");
    await shot("tut-07");
    await planAgain(8);
    await shot("tut-08");
    const two = await sleepFor(1, 9);
    if (two.lamb.phenotype.colour !== "white" || two.lamb.phenotype.horns !== "horned") throw new ProbeError(`lamb 2 should be white and horned, it is ${two.lamb.phenotype.colour}, ${two.lamb.phenotype.horns}`);
    if (!(await g.page.locator("#overlay .dcard").count())) throw new ProbeError("the horned lamb should bring the first discovery card");
    if (JSON.stringify(two.st.unlocks) !== JSON.stringify(["cards"])) throw new ProbeError(`only the codex should arrive with the horned lamb, unlocks: ${JSON.stringify(two.st.unlocks)}`);
    if ((two.st.orders ?? []).length) throw new ProbeError("no orders should arrive during the tutorial");
    await noSquare("step 9");
    await shot("tut-09");
    await click(g, "#overlay .row [data-close].primary", "back to the farm");
    await waitStep(g, 10, "after closing the horned lamb's report");
    const pq = await punnetFacts(g);
    if (!pq.found) throw new ProbeError("step 10 should show a Punnet square in the mentor card");
    if (pq.gene !== "horns" || pq.dom !== 3 || pq.rec !== 1 || pq.cells.join(",") !== "polled,polled,polled,horned") {
      throw new ProbeError(`the tutorial pair (both horn carriers) should give 3 polled : 1 horned, the square shows ${JSON.stringify(pq)}`);
    }
    if (pq.letters || pq.genotype) throw new ProbeError(`no allele letters before the numbers unlock, the square shows "${pq.genotype || "letters"}"`);
    if (!/about one lamb in four/i.test(pq.text)) throw new ProbeError("step 10 should tie the square to the forecast (about one lamb in four)");
    await shot("tut-10");
    await g.page.locator('#mentor .pcell[data-r="1"][data-c="1"]').hover();
    await g.page.waitForTimeout(250);
    const lit = await g.page.evaluate(() => [...document.querySelectorAll("#mentor .pcopy")].filter((el) => getComputedStyle(el).borderStyle === "solid").map((el) => /** @type {HTMLElement} */ (el).dataset.pick).sort().join(","));
    if (lit !== "d1,s1") throw new ProbeError(`hovering the horned lamb should light the ewe's and ram's horns copies (d1,s1), lit: "${lit}"`);
    ctx.artifact(await g.screenshot("tut-10-hover"));
    await g.page.locator('#mentor .pcopy[data-pick="s1"]').click();
    await g.page.mouse.move(700, 5);
    await g.page.waitForTimeout(250);
    const col = await g.page.evaluate(() => [...document.querySelectorAll("#mentor .pcell")].filter((el) => getComputedStyle(el).boxShadow !== "none").map((el) => `${/** @type {HTMLElement} */ (el).dataset.r}${/** @type {HTMLElement} */ (el).dataset.c}`).sort().join(","));
    if (col !== "01,11") throw new ProbeError(`clicking the ram's horns copy should light the cells it goes to (01,11), lit: "${col}"`);
    ctx.artifact(await g.screenshot("tut-10-pick"));
    await g.page.setViewportSize({ width: 1024, height: 768 });
    await g.page.waitForTimeout(250);
    await shot("tut-10-1024");
    await assertMentorFits(g, "step 10 at 1024×768");
    await g.page.setViewportSize({ width: 1280, height: 800 });
    await g.page.waitForTimeout(200);
    await assertMentorFits(g, "step 10 at 1280×800");
    await click(g, "#mentor [data-tutorial=ack]", "got it (Punnet square)");

    // ---- Season 3: once more → a black lamb, the colour square, the market, the goal.
    await waitStep(g, 11, "after the Punnet square");
    await shot("tut-11");
    await planAgain(12);
    await shot("tut-12");
    const three = await sleepFor(2, 13);
    if (three.lamb.phenotype.colour !== "black") throw new ProbeError(`lamb 3 should be black, it is ${three.lamb.phenotype.colour}`);
    if (three.st.act !== 1) throw new ProbeError(`the black lamb should start the story's first act (hidden colours), act is ${three.st.act}`);
    const cards = three.st.discoveries.filter((/** @type {any} */ d) => (d.sheep === T.ewe || d.sheep === T.ram) && (d.loci ?? [d.locus]).includes("A"));
    if (cards.length !== 2) throw new ProbeError(`the black lamb should earn a hidden-colour card for each parent, got ${cards.length}`);
    await shot("tut-13");
    await click(g, "#overlay .row [data-close].primary", "back to the farm");
    await waitStep(g, 14, "after closing the black lamb's report");
    const cq = await punnetFacts(g);
    if (!cq.found || cq.gene !== "colour" || cq.dom !== 3 || cq.rec !== 1) throw new ProbeError(`step 14 should show the colour square (3 white : 1 coloured), got ${JSON.stringify(cq)}`);
    if (cq.letters || cq.genotype) throw new ProbeError("no allele letters in the colour square before the numbers unlock");
    await shot("tut-14");
    await assertMentorFits(g, "step 14");
    await click(g, "#mentor [data-tutorial=ack]", "got it (why black)");
    await waitStep(g, 15, "after the colour square");
    await click(g, "#hud [data-open=market]", "market");
    await g.waitPanel("market");
    await g.page.waitForTimeout(150);
    await shot("tut-15");
    const money = (await g.state()).money;
    await click(g, "#overlay .tut-ring[data-buy]", "buy the ringed ewe");
    await waitStep(g, 16, "after buying a ewe");
    const s16 = await g.state();
    const bought = s16.flock.map((/** @type {string} */ id) => s16.sheep[id]).filter((/** @type {any} */ s) => s.origin === "market" && s.sex === "ewe");
    if (bought.length !== 1 || !(s16.money < money)) throw new ProbeError(`the market step should buy one ewe (bought ${bought.length}, coins ${money} → ${s16.money})`);
    await shot("tut-16");
    await click(g, "#mentor [data-tutorial=ack]", "got it");
    await waitStep(g, 17, "after the goal");
    await shot("tut-17");
    const s17 = await g.state();
    const expect = [T.ewe, T.ram, ...lambsOf(s17).map((/** @type {any} */ l) => l.id), bought[0].id].sort();
    if (JSON.stringify([...s17.flock].sort()) !== JSON.stringify(expect)) throw new ProbeError(`end flock should be just the tutorial sheep (no handover): ${JSON.stringify(s17.flock)} vs ${JSON.stringify(expect)}`);
    if (/Granny Moss|minding the rest/i.test((await g.page.locator("#mentor").textContent()) ?? "")) throw new ProbeError("the last step should not hand over a neighbour's flock");

    // ?seed without ?tutorial: no tutorial, the same small farm (two founders, a quiet market).
    const n = await ctx.newPage();
    await n.boot(`?seed=${s0.seed}&fresh=1&nomotion=1`);
    const ns = await n.state();
    if ((await tut(n)) !== null) throw new ProbeError("?seed without ?tutorial must not start a tutorial");
    if (JSON.stringify(ns.flock) !== JSON.stringify(s0.flock) || ns.money !== s0.money) throw new ProbeError(`?seed=${s0.seed} should start with the tutorial's two sheep and coins (flock ${JSON.stringify(ns.flock)}, coins ${ns.money})`);
    await n.close();

    // "Let's farm!": the tutorial ends and the first letter (horns) arrives at once, with Old Tom's lesson.
    await click(g, "#mentor [data-tutorial=ack]", "let's farm");
    await g.page.waitForFunction(() => /** @type {any} */ (window).__game.tutorial()?.done === true, null, { timeout: 5_000 });
    await g.page.waitForFunction(() => /** @type {any} */ (window).__game.lesson().current?.id === "orders", null, { timeout: 5_000 }).catch(() => {});
    const se = await g.state();
    const lz = (await g.page.evaluate(() => /** @type {any} */ (window).__game.lesson())).current;
    if (!se.unlocks.includes("orders") || se.orders[0]?.kind !== "horns") throw new ProbeError(`the letters (a horns letter first) should arrive as the tutorial ends: unlocks ${JSON.stringify(se.unlocks)}, orders ${JSON.stringify(se.orders.map((/** @type {any} */ o) => o.kind))}`);
    if (lz?.id !== "orders" || !lz.shown || se.season !== 3) throw new ProbeError(`the letters' lesson should start at once in Year 1 (lesson ${JSON.stringify(lz)}, season ${se.season})`);
    await g.page.waitForTimeout(200);
    await assertLayout(g, "tut-end");
    ctx.artifact(await g.screenshot("tut-end"));
    await click(g, "#mentor [data-lesson=skip]", "skip the letters' lesson");
    await g.page.waitForTimeout(150);
    const hud = await g.page.evaluate(() => ({ mentor: !(/** @type {HTMLElement} */ (document.querySelector("#mentor"))).hidden, goal: document.querySelector("#hud .pill.goal")?.textContent ?? "", arrow: !(/** @type {HTMLElement} */ (document.querySelector("#tut-arrow"))).hidden }));
    if (hud.mentor || hud.arrow) throw new ProbeError(`after the tutorial and its lesson the mentor and arrow should be gone: ${JSON.stringify(hud)}`);
    if (!/blue lamb/i.test(hud.goal)) throw new ProbeError(`after the tutorial the HUD should show the act goal, shows "${hud.goal}"`);
    // The codex keeps the Punnet square as a concept card.
    await click(g, "#hud [data-open=codex]", "codex");
    await g.waitPanel("codex");
    const card = g.page.locator('#overlay [data-concept="punnet"]');
    if (!(await card.count())) throw new ProbeError("the codex should keep the Punnet square as a concept card");
    if (!(await card.locator(".punnet").count())) throw new ProbeError("the codex's Punnet card should draw the square");
    await card.scrollIntoViewIfNeeded();
    await g.page.waitForTimeout(150);
    ctx.artifact(await g.screenshot("tut-codex"));
    // One sleep after the tutorial: Year 2 Spring brings the vet alone, and still no new sheep.
    await g.act({ type: "close" });
    const beforeFlock = new Set((await g.state()).flock);
    await g.act({ type: "sleep" });
    await g.waitPanel("report", 12_000);
    const sa = await g.state();
    const arrived = sa.flock.filter((/** @type {string} */ id) => !beforeFlock.has(id) && sa.sheep[id].origin !== "bred");
    if (arrived.length) throw new ProbeError(`no sheep should arrive after the tutorial except bred lambs, got ${arrived.join(",")}`);
    if (JSON.stringify(sa.unlocks) !== JSON.stringify(["cards", "orders", "vet"]) || sa.season !== 4) throw new ProbeError(`Year 2 Spring should bring the vet alone, unlocks: ${JSON.stringify(sa.unlocks)} (season ${sa.season})`);
    ctx.artifact(await g.screenshot("tut-after"));
    g.assertNoErrors("during the tutorial");
    ctx.note(`seed ${s0.seed}: steps 1–17 advanced on their actions (${how.join(", ")}); lambs: white polled, horned, black; Punnet 3:1 only after the horned lamb (hover and pick work), colour square 3:1; no handover; letters + lesson at the tutorial's end (Year 1 Winter); Year 2 Spring brings only the vet`);
    await g.close();

    // Skipping: from the mentor card; the two-sheep farm stays and the letters come at once.
    const k = await ctx.newPage();
    await k.boot("?tutorial=1&seed=7&fresh=1&nomotion=1");
    await click(k, "#mentor [data-tutorial=skip]", "skip");
    await k.page.waitForFunction(() => /** @type {any} */ (window).__game.tutorial()?.done === true, null, { timeout: 5_000 });
    const ks = await k.state();
    if (ks.flock.length !== 2) throw new ProbeError(`skipping should keep the two starter sheep and add none (flock ${ks.flock.length})`);
    if (!ks.unlocks.includes("orders")) throw new ProbeError("skipping the tutorial should bring the letters at once");
    k.assertNoErrors("skipping the tutorial");
    ctx.note("skip keeps the two-sheep farm (no handover) and brings the letters");
    await click(k, "#mentor [data-lesson=skip]", "skip the letters' lesson");
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
