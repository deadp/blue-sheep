// Life probe: the sheep card makes its sheep feel present.
// Rules checked: opening a sheep card mounts exactly one live portrait canvas in the card and the world
// visits that sheep; closing the card (or opening another panel) unmounts it and releases the sheep;
// body[data-panel] keeps tracking the open panel. The sheepdog is in the world exactly when the "dog"
// improvement is owned. With motion on it also saves frame sequences (life-sheep-*.png, life-world-*.png,
// life-report-*.png) and notes draw calls and frame rate, for a human or agent to look at. Voices: a lamb, a ewe
// and a ram bleat in three different voices, lamb > ewe > ram in pitch; shy is softer and smoother than bold.
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

    // ---- 2b. voices: every sheep says hello in its own voice
    // Rules: opening a card or clicking the live portrait makes that sheep bleat; lambs are higher than ewes,
    // ewes higher than rams; a shy sheep is softer and smoother than a bold one; with voices off, nothing plays.
    {
      const g = await ctx.newPage();
      // seed 2 at act 3 has lambs, ewes, rams and both a shy and a bold adult
      await g.boot("?seed=2&fresh=1&nomotion=1&act=3");
      const st = await g.state();
      /** @type {Record<string, any>} */
      const voices = await g.page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, /** @type {any} */ (window).__game.debug.voiceOf(id)])), st.flock);
      const pick = (/** @type {(v: any) => boolean} */ f) => st.flock.find((/** @type {string} */ id) => f(voices[id]));
      const lamb = pick((v) => v.age === "lamb");
      const ewe = pick((v) => v.age !== "lamb" && v.sex === "ewe");
      const ram = pick((v) => v.age !== "lamb" && v.sex === "ram");
      if (!lamb || !ewe || !ram) throw new ProbeError(`act-3 flock should have a lamb, a ewe and a ram: ${JSON.stringify({ lamb, ewe, ram })}`);
      const last = () => g.page.evaluate(() => /** @type {any} */ (window).__game.debug.lastSound());
      /** Open the card (it bleats hello), then click the live portrait (it bleats again). */
      const hello = async (/** @type {string} */ id) => {
        await g.act({ type: "open", panel: "sheep", id });
        await g.waitPanel("sheep");
        const opened = await last();
        if (opened?.id !== id) throw new ProbeError(`opening ${id}'s card should make it bleat, last sound was ${opened?.id}`);
        await g.page.waitForTimeout(400); // past the debounce
        await g.page.click("#overlay canvas[data-live-portrait]");
        const clicked = await last();
        if (clicked?.id !== id) throw new ProbeError(`clicking ${id}'s portrait should make it bleat, last sound was ${clicked?.id}`);
        return clicked;
      };
      const [L, E, R] = [await hello(lamb), await hello(ewe), await hello(ram)];
      const key = (/** @type {any} */ v) => JSON.stringify([v.pitch, v.formants, v.duration, v.vibratoRate]);
      if (new Set([key(L), key(E), key(R)]).size !== 3) throw new ProbeError("lamb, ewe and ram should have three different voices");
      if (!(L.pitch > E.pitch && E.pitch > R.pitch)) throw new ProbeError(`pitch should go lamb > ewe > ram: ${L.pitch} / ${E.pitch} / ${R.pitch}`);
      if (!(L.duration < R.duration)) throw new ProbeError(`a lamb's bleat should be shorter than a ram's: ${L.duration} vs ${R.duration}`);
      for (const v of [L, E, R]) if (key(v) !== key(voices[v.id])) throw new ProbeError(`${v.id} should always sound the same (stable voice)`);
      ctx.note(`voices: lamb ${L.pitch} Hz/${L.duration}s, ewe ${E.pitch} Hz/${E.duration}s, ram ${R.pitch} Hz/${R.duration}s (played: ${L.played}${L.reason ? `, ${L.reason}` : ""})`);
      // temperaments: look through the flock and the market (market sheep have cards too)
      const pool = [...st.flock, ...st.market.filter((/** @type {string} */ id) => !st.flock.includes(id))];
      Object.assign(voices, await g.page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, /** @type {any} */ (window).__game.debug.voiceOf(id)])), pool));
      const byTemper = (/** @type {string} */ p) => pool.find((/** @type {string} */ id) => voices[id].personality === p && voices[id].age !== "lamb");
      const shy = byTemper("shy");
      const bold = byTemper("bold");
      if (!shy || !bold) throw new ProbeError(`need a shy and a bold adult in seed 2's act-3 flock or market to compare voices (shy ${shy}, bold ${bold})`);
      {
        const S = await hello(shy), B = await hello(bold);
        if (!(S.loudness < B.loudness && S.roughness < B.roughness)) throw new ProbeError(`a shy sheep should bleat softer and smoother than a bold one: ${JSON.stringify({ shy: [S.loudness, S.roughness], bold: [B.loudness, B.roughness] })}`);
        if (!(S.length < B.length)) throw new ProbeError(`a shy bleat should be shorter than a bold one: ${S.length} vs ${B.length}`);
        ctx.note(`voices: shy ${shy} loudness ${S.loudness} rough ${S.roughness} (${S.steps.length} bleat) vs bold ${bold} loudness ${B.loudness} rough ${B.roughness} (${B.steps.length} bleats)`);
      }
      // Voices off (settings toggle): a click is still recorded, but plays nothing.
      await g.act({ type: "open", panel: "settings" });
      await g.waitPanel("settings");
      await g.page.click("#overlay [data-toggle=sound]");
      const off = await g.page.evaluate(() => localStorage.getItem("blue-sheep-sound"));
      if (off !== "0") throw new ProbeError(`the sound toggle should save "0" in localStorage, got ${off}`);
      await g.page.waitForTimeout(400);
      await hello(ewe);
      const muted = await last();
      if (muted.played || muted.reason !== "muted") throw new ProbeError(`with voices off nothing should play: ${JSON.stringify({ played: muted.played, reason: muted.reason })}`);
      await g.page.evaluate(() => localStorage.removeItem("blue-sheep-sound"));
      g.assertNoErrors("with sheep voices");
      ctx.note("voices: card + portrait clicks bleat; lamb > ewe > ram; stable per sheep; the settings toggle mutes");
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
