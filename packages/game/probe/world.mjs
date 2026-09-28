// World probe (DESIGN-v3 §15 items 22–24): the close-iso valley, the walking farmer and the pan option, and
// land opening through the existing farm improvement.
// Rules checked:
//  - walk is the default: the farmer is in the world and the camera follows him;
//  - clicking a sheep far from the farmer walks him there (a path round the fences) and then opens its card,
//    with the farmer beside the sheep; the world visits the sheep (attend);
//  - the felt switch turns on pan mode: no farmer, a minimap and signposts, a drag moves the camera, a signpost
//    glides it; the choice is kept after a reload (a setting, not game state); Tab switches back to walk;
//  - "Open this land" on the creek flats' felt price tag opens the market at "Open the far paddock"; buying it
//    closes the market and plays the reveal (scrub clears, grass greens, fence mends) with the flock cap up by
//    exactly the improvement's four; afterwards the flats are open land the farmer can walk into;
//  - performance: draw calls, triangles and frame rate for the normal and ?lite=1 builds (noted, not asserted,
//    apart from lite having no shadows and fewer triangles).
// Screenshots: world-walk-*.png, world-pan-*.png, world-reveal-*.png, world-lite.png, world-1024.png.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";

/** @param {import("./lib/browser.mjs").GamePage} g */
const W = (g) => g.page.evaluate(() => /** @type {any} */ (window).__game.debug.world());
/** @param {import("./lib/browser.mjs").GamePage} g @param {string} id */
const pt = (g, id) => g.page.evaluate((i) => /** @type {any} */ (window).__game.debug.petPoint(i), id);

/** @param {import("./lib/browser.mjs").GamePage} g */
async function fps(g, ms = 2500) {
  return g.page.evaluate((dur) => new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < dur) requestAnimationFrame(tick); else res((n / (performance.now() - t0)) * 1000); };
    requestAnimationFrame(tick);
  }), ms);
}

/** @type {import("./lib/harness.mjs").Step} */
export const world = {
  name: "world",
  async run(ctx) {
    const g = await ctx.newPage();
    // Act 2 (index 1): the farm improvements are on offer and the creek flats are still locked.
    await g.boot("?seed=7&fresh=1&act=1");
    await g.page.waitForTimeout(800);
    let w = await W(g);
    if (w.mode !== "walk" || !w.farmer.visible) throw new ProbeError(`walk should be the default with the farmer showing: ${JSON.stringify({ mode: w.mode, farmer: w.farmer })}`);
    if (w.land.flats !== "locked") throw new ProbeError(`the creek flats should start locked at act 2, are ${w.land.flats}`);
    ctx.artifact(await g.screenshot("world-walk-1-start"));

    // ---- 1. click a far sheep: the farmer walks over, then its card opens
    await g.page.mouse.move(640, 400);
    for (let i = 0; i < 6; i++) { await g.page.mouse.wheel(0, 300); await g.page.waitForTimeout(80); }
    await g.page.waitForTimeout(500);
    w = await W(g);
    const home = Object.entries(w.sheepAt).filter(([, p]) => /** @type {any} */ (p).zone === "paddock");
    let pick = null, best = 0;
    for (const [id, p] of home) {
      const d = Math.hypot(/** @type {any} */ (p).x - w.farmer.x, /** @type {any} */ (p).z - w.farmer.z);
      const sp = await pt(g, id);
      if (sp?.inView && sp.y > 90 && sp.y < 700 && d > best) { best = d; pick = id; }
    }
    if (!pick) throw new ProbeError("no sheep in the home paddock is on screen to click");
    if (best < 9) {
      // walk away from it first (WASD), so the click is a real walk
      const p = /** @type {any} */ (w.sheepAt[pick]);
      const key = p.x < w.farmer.x ? "d" : "a";
      await g.page.keyboard.down(key);
      await g.page.waitForTimeout(1600);
      await g.page.keyboard.up(key);
      await g.page.waitForTimeout(400);
      w = await W(g);
    }
    const from = { ...w.farmer };
    const sp = await pt(g, pick);
    if (!sp?.inView) throw new ProbeError(`sheep ${pick} went off screen before the click`);
    const dist0 = Math.hypot(/** @type {any} */ (w.sheepAt[pick]).x - from.x, /** @type {any} */ (w.sheepAt[pick]).z - from.z);
    await g.page.mouse.click(sp.x, sp.y + 26);
    await g.page.waitForTimeout(300);
    const mid = await W(g);
    const walking = mid.farmer.path > 0 || mid.farmer.moving;
    if (dist0 >= 9 && (await g.panel()) === "sheep") throw new ProbeError("a far sheep's card should wait until the farmer has walked over");
    ctx.artifact(await g.screenshot("world-walk-2-walking"));
    await g.waitPanel("sheep", 40_000);
    const at = await W(g);
    const sheepNow = /** @type {any} */ (at.sheepAt[pick]);
    const gap = Math.hypot(sheepNow.x - at.farmer.x, sheepNow.z - at.farmer.z);
    const moved = Math.hypot(at.farmer.x - from.x, at.farmer.z - from.z);
    const cardId = await g.page.evaluate(() => document.querySelector("#overlay [data-live-portrait-slot]")?.getAttribute("data-live-portrait-slot"));
    if (cardId !== pick) throw new ProbeError(`the card should be ${pick}'s, is ${cardId}`);
    if (dist0 >= 9 && (!walking || moved < 3 || gap > 3.4)) throw new ProbeError(`the farmer should have walked to ${pick} before the card opened: ${JSON.stringify({ dist0, walking, moved, gap })}`);
    if (at.attended !== pick) throw new ProbeError(`the world should visit ${pick}, visits ${at.attended}`);
    await g.page.waitForTimeout(900);
    ctx.artifact(await g.screenshot("world-walk-3-card"));
    ctx.note(`clicked ${pick} ${dist0.toFixed(1)} units away: the farmer walked ${moved.toFixed(1)} and stopped ${gap.toFixed(1)} from it, then the card opened`);
    await g.page.keyboard.press("Escape");
    await g.waitPanel("");

    // ---- 2. pan mode: the felt switch, drag, a signpost, the minimap; kept after a reload; Tab back to walk
    await g.page.locator(".w3d-switch [data-move=pan]").click();
    await g.page.waitForTimeout(600);
    w = await W(g);
    const saved = await g.page.evaluate(() => localStorage.getItem("blue-sheep-move-mode"));
    const chrome = await g.page.evaluate(() => ({
      mm: !!document.querySelector(".w3d-mm") && getComputedStyle(/** @type {Element} */ (document.querySelector(".w3d-mm"))).display !== "none",
      signs: document.querySelectorAll(".w3d-signs .sign").length,
    }));
    if (w.mode !== "pan" || w.farmer.visible || saved !== "pan" || !chrome.mm || chrome.signs < 4) throw new ProbeError(`pan mode should hide the farmer, show the minimap and signposts, and be saved: ${JSON.stringify({ mode: w.mode, farmer: w.farmer.visible, saved, chrome })}`);
    const c0 = w.camera;
    await g.page.mouse.move(700, 420);
    await g.page.mouse.down();
    for (let i = 1; i <= 8; i++) { await g.page.mouse.move(700 - i * 40, 420 + i * 6); await g.page.waitForTimeout(30); }
    await g.page.mouse.up();
    await g.page.waitForTimeout(200);
    const c1 = (await W(g)).camera;
    if (Math.hypot(c1.x - c0.x, c1.z - c0.z) < 3) throw new ProbeError(`dragging should move the camera: ${JSON.stringify({ c0, c1 })}`);
    ctx.artifact(await g.screenshot("world-pan-1-drag"));
    await g.page.locator('.w3d-signs [data-sign="shed"]').click();
    await g.page.waitForTimeout(1800);
    const c2 = (await W(g)).camera;
    if (Math.hypot(c2.x - 4, c2.z + 1.5) > 6) throw new ProbeError(`the Woolshed signpost should glide the camera to the woolshed, it is at ${JSON.stringify(c2)}`);
    ctx.artifact(await g.screenshot("world-pan-2-woolshed"));
    await g.boot("?seed=7&act=1");
    await g.page.waitForTimeout(600);
    w = await W(g);
    if (w.mode !== "pan") throw new ProbeError(`pan mode should be remembered after a reload, got ${w.mode}`);
    await g.page.keyboard.press("Tab");
    await g.page.waitForTimeout(400);
    w = await W(g);
    if (w.mode !== "walk" || !w.farmer.visible) throw new ProbeError(`Tab should switch back to walking: ${JSON.stringify({ mode: w.mode, farmer: w.farmer.visible })}`);

    // ---- 3. open the creek flats through the existing improvement, with the reveal
    let st = await g.state();
    if (st.money < 150) {
      // probe fixture: enough coins to buy the improvement (the act-2 fixture is often short)
      await g.page.evaluate(() => { /** @type {any} */ (window).__game.state().money = 200; });
      await g.act({ type: "close" }); // re-render with the new purse
      st = await g.state();
    }
    const cap0 = st.flockCap;
    await g.page.locator(".w3d-switch [data-move=pan]").click();
    await g.page.locator('.w3d-signs [data-sign="flats"]').click();
    await g.page.waitForTimeout(1800);
    ctx.artifact(await g.screenshot("world-reveal-0-tag"));
    const open = g.page.locator('.w3d-ptag [data-open-area="flats"]');
    if (!(await open.count())) throw new ProbeError(`the creek flats' price tag should offer "Open this land": ${await g.page.evaluate(() => document.querySelector('.w3d-ptag[data-area="flats"]')?.textContent ?? "no tag")}`);
    await open.click();
    await g.waitPanel("market");
    const card = await g.page.evaluate(() => { const c = document.querySelector('#overlay [data-upgrade-card="paddock"]'); if (!c) return null; const r = c.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: window.innerHeight }; });
    if (!card || card.top < 0 || card.bottom > card.h) throw new ProbeError(`the tag should open the market at "Open the far paddock", in view: ${JSON.stringify(card)}`);
    await g.page.locator('#overlay [data-upgrade-card="paddock"] button[data-upgrade="paddock"]').click();
    await g.waitPanel("", 5_000);
    await g.page.waitForFunction(() => document.querySelector("#world")?.getAttribute("data-reveal") === "running", null, { timeout: 5_000 }).catch(() => { throw new ProbeError("buying the far paddock should play the reveal (#world[data-reveal=running])"); });
    for (let i = 1; i <= 5; i++) { await g.page.waitForTimeout(700); ctx.artifact(await g.screenshot(`world-reveal-${i}`)); }
    await g.page.waitForFunction(() => document.querySelector("#world")?.getAttribute("data-reveal") === "done", null, { timeout: 30_000 });
    await g.page.waitForTimeout(600);
    ctx.artifact(await g.screenshot("world-reveal-6-open"));
    w = await W(g);
    st = await g.state();
    if (w.land.flats !== "open" || !w.reveal.done.includes("flats")) throw new ProbeError(`the flats should be open after the reveal: ${JSON.stringify({ land: w.land, reveal: w.reveal })}`);
    if (st.flockCap !== cap0 + 4) throw new ProbeError(`opening the far paddock should add exactly four to the flock cap: ${cap0} → ${st.flockCap}`);
    ctx.note(`creek flats opened through "Open the far paddock": reveal played, flock cap ${cap0} → ${st.flockCap}`);
    // the flats are walkable now: from the Creek flats signpost, walking drops the farmer in the new paddock
    await g.page.locator('.w3d-signs [data-sign="flats"]').click();
    await g.page.waitForTimeout(1500);
    await g.page.locator(".w3d-switch [data-move=walk]").click();
    await g.page.waitForTimeout(1200);
    w = await W(g);
    const fu = w.farmer.x, fv = -w.farmer.z;
    if (!(fu > 24 && fu < 50 && fv > -9 && fv < 9)) throw new ProbeError(`the farmer should be able to stand in the open creek flats, is at u ${fu}, v ${fv}`);
    ctx.artifact(await g.screenshot("world-walk-4-flats"));
    g.assertNoErrors("in the world probe");
    await g.close();

    // ---- 4. performance: normal vs lite, and the 1024×768 view
    /** @type {Record<string, any>} */
    const perf = {};
    for (const [name, q] of [["normal", "?seed=7&fresh=1&act=3"], ["lite", "?seed=7&fresh=1&act=3&lite=1"]]) {
      const p = await ctx.newPage();
      await p.boot(q);
      await p.page.waitForTimeout(1200);
      const f = await fps(p);
      const s = await W(p);
      perf[name] = { fps: +f.toFixed(1), calls: s.calls, tris: s.triangles, shadows: s.shadows, sheep: s.sheep };
      if (name === "lite") ctx.artifact(await p.screenshot("world-lite"));
      if (name === "normal") {
        await p.page.setViewportSize({ width: 1024, height: 768 });
        await p.page.waitForTimeout(800);
        ctx.artifact(await p.screenshot("world-1024"));
        // night falls for the sleep: the valley under the stars, windows lit
        void p.page.evaluate(() => /** @type {any} */ (window).__game.act({ type: "sleep" }));
        await p.page.waitForTimeout(700);
        ctx.artifact(await p.screenshot("world-night"));
        await p.waitPanel("report", 30_000);
      }
      p.assertNoErrors(`on ${q}`);
      await p.close();
    }
    if (perf.lite.shadows || !(perf.lite.tris < perf.normal.tris)) throw new ProbeError(`?lite=1 should drop shadows and triangles: ${JSON.stringify(perf)}`);
    ctx.note(`perf (swiftshader, walk view, act 3): normal ${perf.normal.fps} fps, ${perf.normal.calls} draw calls, ${perf.normal.tris} tris; lite ${perf.lite.fps} fps, ${perf.lite.calls} calls, ${perf.lite.tris} tris`);
  },
};

if (isMain(import.meta.url)) runSteps([world]);
