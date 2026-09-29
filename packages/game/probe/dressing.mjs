// Dressing probe (DESIGN-v3 §15 item 27): six fixed play views of the valley at 1280×800 for the world
// dressing before/after sheet, with draw calls and triangles for each (normal and lite), and the auto-lite rule.
// Views: boot walk view, home paddock with the flock, woolshed area, creek/bush edge, winter, pan overview.
// Detail is pinned through the URL (`detail=full` / `detail=lite`) so software GL never flips a shot to lite.
// Rules checked:
//  - `?detail=lite` (and `?lite=1`) render with no shadows and fewer triangles than full, in every view;
//  - full detail does not draw ambient life in lite; lite has no ambient life;
//  - auto-lite: with every frame slowed to ~55 ms, `detail=auto` measures ~5 s (median > 40 ms), switches to lite and
//    toasts once;
//    the Detail setting stays "Auto"; a reload does not toast again; `detail=full` never switches.
// Screenshots: out/dressing/<view>.png (+ <view>-lite.png), perf in out/dressing/perf.json.
import fs from "node:fs";
import path from "node:path";
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";
import { OUT_DIR } from "./lib/paths.mjs";

const DIR = path.join(OUT_DIR, "dressing");

/** name, boot query, camera (world x, z, halfW) or null for the boot view, winter? */
export const VIEWS = /** @type {const} */ ([
  ["1-boot-walk", "?seed=7&fresh=1", null, false],
  ["2-home-flock", "?seed=7&fresh=1&act=3", [-19, 1.5, 11], false],
  ["3-woolshed", "?seed=7&fresh=1&act=3", [5, 4.5, 11], false],
  ["4-creek-bush", "?seed=7&fresh=1&act=3", [24, -9.5, 11], false],
  ["5-winter", "?seed=7&fresh=1&act=3", [-24, 2, 11], true],
  ["6-pan-overview", "?seed=7&fresh=1&act=3&move=pan", [-6, 0, 30], false],
]);

/** Init script: every toast shown goes into window.__toasts (the #toast element is reused and fades). */
const TOAST_LOG = `window.__toasts = []; window.installToastLog = () => {
  new MutationObserver((recs) => {
    const el = document.querySelector("#toast");
    if (el && recs.some((r) => r.type === "childList" && r.target === el)) window.__toasts.push(el.textContent || "");
  }).observe(document, { subtree: true, childList: true });
};`;

/** @param {import("./lib/browser.mjs").GamePage} g */
const W = (g) => g.page.evaluate(() => /** @type {any} */ (window).__game.debug.world());

/** @param {import("./lib/browser.mjs").GamePage} g @param {string} q @param {any} cam @param {boolean} winter */
async function frameView(g, q, cam, winter) {
  await g.boot(q);
  if (winter) {
    await g.page.evaluate(() => { const s = /** @type {any} */ (window).__game.state(); s.season += (3 - (s.season % 4) + 4) % 4; });
    await g.act({ type: "close" });
  }
  if (cam) await g.page.evaluate((c) => /** @type {any} */ (window).__game.debug.camera(c[0], c[1], c[2]), cam);
  await g.page.waitForTimeout(1500);
  return W(g);
}

/** @type {import("./lib/harness.mjs").Step} */
export const dressing = {
  name: "dressing",
  async run(ctx) {
    fs.mkdirSync(DIR, { recursive: true });
    /** @type {Record<string, any>} */
    const perf = {};
    for (const [name, q, cam, winter] of VIEWS) {
      for (const lite of [false, true]) {
        const g = await ctx.newPage();
        // (the pre-dressing build only knows ?lite=1)
        const w = await frameView(g, `${q}&${lite ? (process.env.DRESS_BEFORE === "1" ? "lite=1" : "detail=lite") : "detail=full"}`, cam, winter);
        const file = path.join(DIR, `${name}${lite ? "-lite" : ""}.png`);
        await g.page.screenshot({ path: file });
        if (!lite) ctx.artifact(file);
        const breakdown = await g.page.evaluate(() => /** @type {any} */ (window).__game.debug.breakdown?.() ?? null);
        perf[`${name}${lite ? "-lite" : ""}`] = { calls: w.calls, tris: w.triangles, shadows: w.shadows, lite: w.lite, ambient: w.ambient ?? null, breakdown };
        g.assertNoErrors(`on ${name}`);
        await g.close();
      }
      const n = perf[name], l = perf[`${name}-lite`];
      if (l.shadows || !l.lite || !(l.tris < n.tris)) throw new ProbeError(`${name}: lite should have no shadows and fewer triangles than full: ${JSON.stringify({ n, l })}`);
      if (n.lite) throw new ProbeError(`${name}: detail=full must not be lite (a pinned probe view flipped)`);
      if (l.ambient && l.ambient.on) throw new ProbeError(`${name}: lite should drop the ambient life: ${JSON.stringify(l.ambient)}`);
    }
    fs.writeFileSync(path.join(DIR, "perf.json"), JSON.stringify(perf, null, 2));
    const sum = (k) => Object.entries(perf).filter(([n]) => (k === "lite") === n.endsWith("-lite")).map(([n, p]) => `${n.replace(/-lite$/, "")} ${p.calls}/${Math.round(p.tris / 1000)}k`).join(", ");
    ctx.note(`full (calls/tris): ${sum("full")}`);
    ctx.note(`lite (calls/tris): ${sum("lite")}`);
    if (process.env.DRESS_BEFORE === "1") return; // the old build has no auto-lite

    // ---- auto-lite: slow every frame past 40 ms; auto switches to lite once and toasts once; full never switches
    for (const [mode, expect] of [["auto", true], ["full", false]]) {
      const g = await ctx.newPage();
      await g.page.addInitScript(TOAST_LOG);
      await g.page.addInitScript(() => {
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) => raf((t) => { const end = performance.now() + 55; while (performance.now() < end) { /* a slow machine */ } cb(t); });
        /** @type {any} */ (window).installToastLog();
      });
      await g.boot(`?seed=7&fresh=1&detail=${mode}`);
      await g.page.waitForTimeout(8000);
      const w = await W(g);
      if (w.detail !== mode) throw new ProbeError(`the world should run with detail=${mode}, runs ${w.detail}`);
      if (mode === "auto" && !(w.autoLite?.done && w.autoLite.samples >= 5)) throw new ProbeError(`auto detail should have measured the first seconds: ${JSON.stringify(w.autoLite)}`);
      const toasts = await g.page.evaluate(() => /** @type {any} */ (window).__toasts ?? []);
      const lighter = toasts.filter((/** @type {string} */ t) => /lighter look/i.test(t)).length;
      if (!!w.lite !== expect) throw new ProbeError(`detail=${mode} with ~55 ms frames should ${expect ? "" : "not "}switch to lite: ${JSON.stringify(w.autoLite)}`);
      if (expect && lighter !== 1) throw new ProbeError(`auto-lite should toast exactly once, toasted ${lighter} times: ${JSON.stringify(toasts)}`);
      if (!expect && lighter) throw new ProbeError(`detail=full should never toast about a lighter look`);
      if (expect) {
        if (w.shadows || w.ambient?.on) throw new ProbeError(`after auto-lite: no shadows, no ambient life: ${JSON.stringify({ shadows: w.shadows, ambient: w.ambient })}`);
        ctx.note(`auto-lite: median frame ${w.autoLite?.median} ms over ${w.autoLite?.samples} frames → lite, one toast`);
        const pref = await g.page.evaluate(() => localStorage.getItem("blue-sheep-detail"));
        if (pref && pref !== "auto") throw new ProbeError(`auto-lite must not change the Detail setting (is ${pref})`);
        await g.act({ type: "open", panel: "settings" });
        const label = await g.page.evaluate(() => document.querySelector('#overlay [data-detail].on')?.getAttribute("data-detail") ?? null);
        if (label !== "auto") throw new ProbeError(`Settings should still show Detail: Auto after the switch, shows ${label}`);
        ctx.artifact(await g.screenshot("dressing-settings-detail"));
        // a reload measures again but does not toast a second time
        await g.boot(`?seed=7&detail=auto`);
        await g.page.waitForTimeout(8000);
        const again = await g.page.evaluate(() => (/** @type {any} */ (window).__toasts ?? []).filter((/** @type {string} */ t) => /lighter look/i.test(t)).length);
        const w2 = await W(g);
        if (!w2.lite || again) throw new ProbeError(`after a reload auto-lite should switch again, silently: ${JSON.stringify({ lite: w2.lite, again })}`);
      }
      g.assertNoErrors(`auto-lite ${mode}`);
      await g.close();
    }
  },
};

if (isMain(import.meta.url)) runSteps([dressing]);
