// Life probe: the sheep card makes its sheep feel present.
// Rules checked: opening a sheep card mounts exactly one live portrait canvas in the card and the world
// visits that sheep; closing the card (or opening another panel) unmounts it and releases the sheep;
// body[data-panel] keeps tracking the open panel. The sheepdog is in the world exactly when the "dog"
// improvement is owned. With motion on it also saves frame sequences (life-sheep-*.png, life-world-*.png,
// life-report-*.png) and notes draw calls and frame rate, for a human or agent to look at.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";

const FRAMES = 6;
const GAP_MS = 300;

/** @param {import("./lib/browser.mjs").GamePage} g */
const world = (g) => g.page.evaluate(() => /** @type {any} */ (window).__game.debug?.world?.() ?? null);
/** @param {import("./lib/browser.mjs").GamePage} g */
const canvases = (g) => g.page.evaluate(() => ({
  inCard: document.querySelectorAll("#overlay [data-live-portrait-slot] canvas[data-live-portrait]").length,
  anywhere: document.querySelectorAll("canvas[data-live-portrait]").length,
}));

/** @type {import("./lib/harness.mjs").Step} */
export const life = {
  name: "life",
  async run(ctx) {
    // ---- 1. live portrait lifecycle (reduced motion: deterministic)
    {
      const g = await ctx.newPage();
      await g.boot("?seed=7&fresh=1&nomotion=1");
      const s = await g.state();
      const [a, b] = s.flock;
      const opened = await g.act({ type: "open", panel: "sheep", id: a });
      if (!opened.ok) throw new ProbeError(`open sheep failed: ${opened.error}`);
      await g.waitPanel("sheep");
      let c = await canvases(g);
      if (c.inCard !== 1 || c.anywhere !== 1) throw new ProbeError(`sheep card should hold exactly one live portrait canvas, found ${JSON.stringify(c)}`);
      let w = await world(g);
      if (!w?.portrait?.mounted || w.portrait.id !== a) throw new ProbeError(`live portrait should be mounted for ${a}: ${JSON.stringify(w?.portrait)}`);
      if (w.attended !== a) throw new ProbeError(`world should be visiting ${a}, is visiting ${w.attended}`);
      if (!w.bubble) throw new ProbeError("the visited sheep should say hello (speech bubble)");
      // A re-render (another sheep's card) swaps the portrait, still only one.
      await g.act({ type: "open", panel: "sheep", id: b });
      c = await canvases(g);
      w = await world(g);
      if (c.anywhere !== 1 || w.portrait.id !== b || w.attended !== b) throw new ProbeError(`switching cards should move the one portrait to ${b}: ${JSON.stringify({ c, p: w.portrait, att: w.attended })}`);
      await g.act({ type: "close" });
      await g.waitPanel("");
      c = await canvases(g);
      w = await world(g);
      if (c.anywhere !== 0) throw new ProbeError(`closing the card should remove the live portrait canvas, found ${c.anywhere}`);
      if (w.portrait.mounted || w.attended !== null) throw new ProbeError(`closing the card should stop the portrait and release the sheep: ${JSON.stringify({ p: w.portrait, att: w.attended })}`);
      // Escape closes too.
      await g.act({ type: "open", panel: "sheep", id: a });
      await g.waitPanel("sheep");
      await g.page.keyboard.press("Escape");
      await g.waitPanel("");
      if ((await canvases(g)).anywhere !== 0 || (await world(g)).portrait.mounted) throw new ProbeError("Escape should unmount the live portrait");
      // Another panel never has one.
      await g.act({ type: "open", panel: "forecast" });
      await g.waitPanel("forecast");
      if ((await canvases(g)).anywhere !== 0) throw new ProbeError("the forecast panel must not mount a live portrait");
      g.assertNoErrors("during the portrait lifecycle");
      ctx.note("live portrait mounts on the sheep card, swaps between cards, unmounts on close/Escape");
      await g.close();
    }

    // ---- 2. the sheepdog appears exactly when owned
    {
      const g = await ctx.newPage();
      await g.boot("?seed=7&fresh=1&nomotion=1&act=3");
      const st = await g.state();
      const owned = (st.upgrades ?? []).includes("dog");
      let w = await world(g);
      if (w.dog !== owned) throw new ProbeError(`dog in world (${w.dog}) should match the dog upgrade (${owned})`);
      if (!owned) {
        const r = await g.act({ type: "upgrade", id: "dog" });
        if (!r.ok) throw new ProbeError(`could not buy the dog at act 3: ${r.error}`);
        const snap = await g.page.evaluate(() => /** @type {any} */ (window).__game.snapshot());
        if (!snap.upgrades?.includes("dog")) throw new ProbeError(`snapshot().upgrades should list the dog: ${JSON.stringify(snap.upgrades)}`);
        w = await world(g);
        if (!w.dog) throw new ProbeError("the sheepdog should be in the world once bought");
      }
      ctx.artifact(await g.screenshot("life-dog"));
      g.assertNoErrors("with the dog");
      ctx.note("sheepdog appears in the world when the dog improvement is owned");
      await g.close();
    }

    // ---- 3. motion on: frame sequences and performance
    {
      const g = await ctx.newPage();
      await g.boot("?seed=7&fresh=1&act=3");
      await g.act({ type: "upgrade", id: "dog" });
      await g.act({ type: "close" });
      await g.page.waitForTimeout(1500);
      for (let i = 0; i < FRAMES; i++) { ctx.artifact(await g.screenshot(`life-world-${i}`)); await g.page.waitForTimeout(GAP_MS); }
      // up close on the paddock, to judge walking, grazing and the dog
      await g.page.mouse.move(560, 360);
      for (let i = 0; i < 6; i++) { await g.page.mouse.wheel(0, -160); await g.page.waitForTimeout(60); }
      await g.page.waitForTimeout(600);
      for (let i = 0; i < FRAMES; i++) { ctx.artifact(await g.screenshot(`life-close-${i}`)); await g.page.waitForTimeout(GAP_MS); }
      const st = await g.state();
      const who = st.flock.find((/** @type {string} */ id) => st.sheep[id].born < st.season - 1) ?? st.flock[0];
      await g.act({ type: "open", panel: "sheep", id: who });
      await g.waitPanel("sheep");
      for (let i = 0; i < FRAMES; i++) { ctx.artifact(await g.screenshot(`life-sheep-${i}`)); await g.page.waitForTimeout(GAP_MS); }
      // click the portrait: it bleats
      await g.page.click("#overlay canvas[data-live-portrait]");
      await g.page.waitForTimeout(250);
      ctx.artifact(await g.screenshot("life-sheep-bleat"));
      const perf = await g.page.evaluate(async () => {
        const t0 = performance.now();
        let n = 0;
        await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(null); }; requestAnimationFrame(f); });
        const w = /** @type {any} */ (window).__game.debug.world();
        return { fps: (n / (performance.now() - t0)) * 1000, calls: w.calls, tris: w.triangles, sheep: w.sheep, portraitCalls: w.portrait.calls };
      });
      ctx.note(`perf with card open (swiftshader, software GL): ~${perf.fps.toFixed(0)} fps, world ${perf.calls} draw calls / ${perf.tris} tris for ${perf.sheep} sheep + dog, live portrait ${perf.portraitCalls} calls`);
      await g.act({ type: "close" });
      const perf2 = await g.page.evaluate(async () => {
        await new Promise((r) => setTimeout(r, 800));
        const t0 = performance.now();
        let n = 0;
        await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(null); }; requestAnimationFrame(f); });
        const w = /** @type {any} */ (window).__game.debug.world();
        return { fps: (n / (performance.now() - t0)) * 1000, calls: w.calls, mounted: w.portrait.mounted };
      });
      if (perf2.mounted) throw new ProbeError("portrait still mounted after closing the card (motion on)");
      ctx.note(`perf with card closed: ~${perf2.fps.toFixed(0)} fps, ${perf2.calls} draw calls`);
      g.assertNoErrors("with motion on");
      await g.close();
    }

    // ---- 4. a sleep with motion: sheep lie down at night, then the report flips its lambs
    {
      const g = await ctx.newPage();
      await g.boot("?seed=7&fresh=1");
      const st = await g.state();
      const adults = st.flock.map((/** @type {string} */ id) => st.sheep[id]).filter((/** @type {any} */ x) => st.season - x.born >= 2);
      const ewes = adults.filter((/** @type {any} */ x) => x.sex === "ewe");
      const ram = adults.find((/** @type {any} */ x) => x.sex === "ram");
      for (const e of ewes.slice(0, 2)) if (ram) await g.act({ type: "plan", ewe: e.id, ram: ram.id });
      const sleeping = g.act({ type: "sleep" });
      await g.page.waitForTimeout(1300);
      ctx.artifact(await g.screenshot("life-night"));
      await sleeping;
      await g.waitPanel("report", 10_000);
      for (let i = 0; i < FRAMES; i++) { ctx.artifact(await g.screenshot(`life-report-${i}`)); await g.page.waitForTimeout(GAP_MS + 100); }
      g.assertNoErrors("sleeping with motion on");
      await g.close();
    }
  },
};

if (isMain(import.meta.url)) runSteps([life]);
