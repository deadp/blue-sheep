// Life probe: the sheep card makes its sheep feel present.
// Rules checked: opening a sheep card mounts exactly one live portrait canvas in the card and the world
// visits that sheep; closing the card (or opening another panel) unmounts it and releases the sheep;
// body[data-panel] keeps tracking the open panel.
// Care: the dogs and the cat are in the world exactly when owned; buying a dog changes the predator forecast;
// greeting (opening a card) raises fondness once a season; a treat costs a coin; each animal has its own voice;
// the report shows the happy-sheep wool line. With motion on it also saves frame sequences (life-sheep-*.png, life-world-*.png,
// life-report-*.png) and notes draw calls and frame rate, for a human or agent to look at. Voices: a lamb, a ewe
// and a ram bleat in three different voices, lamb > ewe > ram in pitch; shy is softer and smoother than bold.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";

const FRAMES = 6;
const GAP_MS = 300;

/** @param {import("./lib/browser.mjs").GamePage} g */
const world = (g) => g.page.evaluate(() => /** @type {any} */ (window).__game.debug?.world?.() ?? null);
/** @param {import("./lib/browser.mjs").GamePage} g */
const last = (g) => g.page.evaluate(() => /** @type {any} */ (window).__game.debug.lastSound());
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

    // ---- 2. the dogs and the cat: forecasts change when you buy one, they appear in the world, each has its own voice
    // Rules: buying a dog changes the predator forecast (the Maremma card's "a wolf gets a lamb now" drops once
    // the collie keeps watch); an owned dog/cat is in the snapshot and in the world exactly when owned; opening its
    // card greets it once per season and it barks (or mews) in its own voice.
    {
      const g = await ctx.newPage();
      await g.boot("?seed=7&fresh=1&nomotion=1&act=3");
      const st = await g.state();
      const owned = (st.upgrades ?? []).filter((/** @type {string} */ u) => ["terrier", "collie", "maremma", "cat"].includes(u));
      let w = await world(g);
      if (w.dogs.length !== owned.filter((/** @type {string} */ u) => u !== "cat").length || w.cat !== owned.includes("cat")) throw new ProbeError(`world animals ${JSON.stringify({ dogs: w.dogs, cat: w.cat })} should match the owned ones ${JSON.stringify(owned)}`);
      // coins for all four (a probe-only top-up, so every card can be bought)
      await g.page.evaluate(() => { /** @type {any} */ (window).__game.state().money = 2000; });
      await g.act({ type: "open", panel: "market" });
      await g.waitPanel("market");
      const fore = (/** @type {string} */ id) => g.page.evaluate((u) => JSON.parse(JSON.stringify(/** @type {any} */ (window).__game.forecast.upgrade(u))), id);
      /** The "now" wolf meter on the Maremma's market card (0–10 segments). */
      const wolfNowMeter = () => g.page.evaluate(() => {
        const m = document.querySelector('#overlay [data-upgrade-card="maremma"] .p-cell.now.wolf .meter2');
        return m ? Number(m.getAttribute("aria-valuenow")) : -1;
      });
      const m0 = await fore("maremma");
      const meter0 = await wolfNowMeter();
      if (!(m0.risk.wolf.with < m0.risk.wolf.now)) throw new ProbeError(`the Maremma should make a wolf less likely to get a lamb: ${JSON.stringify(m0.risk)}`);
      if (meter0 !== Math.round(m0.risk.wolf.now * 10)) throw new ProbeError(`the Maremma card's "now" wolf meter (${meter0}) should show the forecast (${m0.risk.wolf.now})`);
      await g.page.click('#overlay [data-upgrade="collie"]');
      const m1 = await fore("maremma");
      const meter1 = await wolfNowMeter();
      if (!(m1.risk.wolf.now < m0.risk.wolf.now)) throw new ProbeError(`buying the collie should lower the wolf risk shown on the Maremma card: ${m0.risk.wolf.now} -> ${m1.risk.wolf.now}`);
      if (!(meter1 < meter0)) throw new ProbeError(`the Maremma card's wolf meter should drop after buying the collie: ${meter0} -> ${meter1}`);
      ctx.note(`dog forecast: a wolf gets a lamb ${m0.risk.wolf.now.toFixed(2)} -> ${m1.risk.wolf.now.toFixed(2)} with the collie (meter ${meter0} -> ${meter1}); Maremma would make it ${m1.risk.wolf.with.toFixed(2)}`);
      const cat0 = await fore("cat");
      if (!(cat0.mice.with < cat0.mice.now)) throw new ProbeError(`the cat card should forecast cheaper mouse seasons: ${JSON.stringify(cat0.mice)}`);
      for (const id of ["terrier", "maremma", "cat"]) {
        await g.page.click(`#overlay [data-upgrade="${id}"]`);
      }
      const after = await g.state();
      for (const id of ["terrier", "collie", "maremma", "cat"]) if (!after.upgrades.includes(id)) throw new ProbeError(`${id} should be owned after clicking Buy`);
      const snap = await g.page.evaluate(() => /** @type {any} */ (window).__game.snapshot());
      for (const id of ["terrier", "collie", "maremma", "cat"]) if (!snap.upgrades?.includes(id) || !snap.pets?.some((/** @type {any} */ p) => p.id === id)) throw new ProbeError(`snapshot should list ${id}: ${JSON.stringify({ up: snap.upgrades, pets: snap.pets })}`);
      w = await world(g);
      if (w.dogs.length !== 3 || !w.cat) throw new ProbeError(`all three dogs and the cat should be in the world: ${JSON.stringify({ dogs: w.dogs, cat: w.cat })}`);
      await g.page.evaluate(() => document.querySelector('#overlay [data-upgrade-card="terrier"]')?.scrollIntoView({ block: "start" }));
      ctx.artifact(await g.screenshot("care-market-pets"));
      // each animal's card: greets it once per season, and it speaks in its own voice
      /** @type {Record<string, number>} */
      const pitches = {};
      for (const id of ["terrier", "collie", "maremma", "cat"]) {
        const f0 = await g.page.evaluate((p) => /** @type {any} */ (window).__game.debug.fondness(p), id);
        const r = await g.act({ type: "open", panel: "animal", id });
        if (!r.ok) throw new ProbeError(`open the ${id}'s card: ${r.error}`);
        await g.waitPanel("animal");
        const f1 = await g.page.evaluate((p) => /** @type {any} */ (window).__game.debug.fondness(p), id);
        if (!(f1 > f0)) throw new ProbeError(`opening the ${id}'s card should greet it (fondness ${f0} -> ${f1})`);
        const snd = await last(g);
        if (snd?.id !== `pet:${id}`) throw new ProbeError(`opening the ${id}'s card should make it speak, last sound was ${snd?.id}`);
        pitches[id] = snd.pitch;
        const card = await g.page.evaluate((p) => document.querySelector(`#overlay [data-pet="${p}"]`) !== null && document.querySelector(`#overlay [data-treat="${p}"]`) !== null, id);
        if (!card) throw new ProbeError(`the ${id}'s card should show it with a treat button`);
        ctx.artifact(await g.screenshot(`care-animal-${id}`));
      }
      if (!(pitches.terrier > pitches.collie && pitches.collie > pitches.maremma)) throw new ProbeError(`barks should go terrier > collie > Maremma in pitch: ${JSON.stringify(pitches)}`);
      ctx.note(`animals: terrier ${pitches.terrier} Hz yap, collie ${pitches.collie} Hz, Maremma ${pitches.maremma} Hz, cat ${pitches.cat} Hz mew; all four greeted on their cards`);
      g.assertNoErrors("with the dogs and the cat");
      await g.close();
    }

    // ---- 2a. fondness: greeting counts once a season, a treat costs a coin; hearts in the field; the report's wool line
    // Rules: opening an own sheep's card raises its fondness by the greeting amount once per season (a second
    // greeting the same season does not); a treat costs exactly 1 coin, raises fondness more, and only once a
    // season; greeting floats hearts in the world; after a sleep the report shows what happy sheep added.
    {
      const g = await ctx.newPage();
      await g.boot("?seed=7&fresh=1&nomotion=1");
      const st = await g.state();
      const a = st.flock[0];
      const fond = () => g.page.evaluate((id) => /** @type {any} */ (window).__game.debug.fondness(id), a);
      const f0 = await fond();
      await g.act({ type: "open", panel: "sheep", id: a });
      await g.waitPanel("sheep");
      const f1 = await fond();
      if (!(f1 > f0)) throw new ProbeError(`greeting ${a} (opening its card) should raise its fondness: ${f0} -> ${f1}`);
      const hearts = (await world(g)).hearts;
      if (!(hearts > 0)) throw new ProbeError(`greeting should float hearts above ${a} in the world (hearts ${hearts})`);
      const said = await g.page.evaluate(() => document.querySelector("#overlay .care .c-said")?.textContent ?? "");
      if (!/said hello/.test(said)) throw new ProbeError(`the card should say you've said hello this season, got "${said}"`);
      ctx.artifact(await g.screenshot("care-sheep-card"));
      await g.act({ type: "close" });
      await g.act({ type: "open", panel: "sheep", id: a });
      const f2 = await fond();
      if (f2 !== f1) throw new ProbeError(`a second greeting the same season should not count: ${f1} -> ${f2}`);
      // a treat: exactly one coin, more fondness, once a season
      const m0 = (await g.state()).money;
      await g.page.click(`#overlay [data-treat="${a}"]`);
      const s1 = await g.state();
      const f3 = await fond();
      if (m0 - s1.money !== 1) throw new ProbeError(`a treat should cost 1 coin: ${m0} -> ${s1.money}`);
      if (!(f3 - f2 > f1 - f0)) throw new ProbeError(`a treat should give a bigger boost than a greeting: +${f3 - f2} vs +${f1 - f0}`);
      const again = await g.act({ type: "treat", id: a });
      if (again.ok) throw new ProbeError("a second treat the same season should be refused");
      if ((await g.state()).money !== s1.money) throw new ProbeError("a refused treat should not cost anything");
      ctx.artifact(await g.screenshot("care-sheep-treat"));
      // next season: greeting counts again
      await g.act({ type: "close" });
      await g.act({ type: "sleep" });
      await g.waitPanel("report", 10_000);
      await g.act({ type: "close" });
      const f4 = await fond();
      await g.act({ type: "open", panel: "sheep", id: a });
      const f5 = await fond();
      if (!(f5 > f4)) throw new ProbeError(`a new season's greeting should count again: ${f4} -> ${f5}`);
      ctx.note(`fondness: ${f0} -> greet ${f1} -> greet again ${f2} -> treat ${f3} (1 coin) -> next season ${f4} -> greet ${f5}`);
      g.assertNoErrors("greeting and treats");
      await g.close();
    }

    // ---- 2c. the report: happy sheep's wool, mice with the cat, a wolf seen off by the Maremma (staged for review)
    {
      const g = await ctx.newPage();
      await g.boot("?seed=7&fresh=1&nomotion=1&act=3");
      await g.page.evaluate(() => {
        const s = /** @type {any} */ (window).__game.state();
        s.money = 2000;
        for (const id of s.flock) s.care[id] = { level: 100, greeted: -1, treated: -1, cared: s.season };
      });
      for (const id of ["maremma", "cat"]) await g.act({ type: "upgrade", id });
      await g.page.evaluate(() => {
        const s = /** @type {any} */ (window).__game.state();
        s.care.maremma = { level: 100, greeted: -1, treated: -1, cared: s.season };
        s.pendingEvent = { kind: "wolf", season: s.season, colour: null, text: "A wolf is coming." };
        s.mice = s.season;
        for (const id of s.flock) s.sheep[id].phenotype.boldness = 2;
      });
      await g.act({ type: "sleep" });
      await g.waitPanel("report", 10_000);
      const r = await g.page.evaluate(() => ({
        fond: document.querySelector("#overlay li.fond")?.textContent ?? "",
        wolf: [...document.querySelectorAll("#overlay li")].map((l) => l.textContent ?? "").find((t) => t.includes("🐺")) ?? "",
        mice: [...document.querySelectorAll("#overlay li")].map((l) => l.textContent ?? "").find((t) => t.includes("🐭")) ?? "",
      }));
      if (!/Happy sheep: \+\d+/.test(r.fond)) throw new ProbeError(`the report should show what happy sheep added: "${r.fond}"`);
      if (!r.wolf || !r.mice) throw new ProbeError(`the report should show the wolf and the mice: ${JSON.stringify(r)}`);
      await g.page.evaluate(() => document.querySelector("#overlay li.fond")?.scrollIntoView({ block: "center" }));
      ctx.artifact(await g.screenshot("care-report"));
      ctx.note(`report: "${r.fond.trim()}" · "${r.wolf.trim()}" · "${r.mice.trim()}"`);
      g.assertNoErrors("report with care lines");
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
      await g.page.evaluate(() => { /** @type {any} */ (window).__game.state().money = 2000; });
      for (const id of ["terrier", "collie", "maremma", "cat"]) await g.act({ type: "upgrade", id });
      await g.act({ type: "close" });
      await g.page.waitForTimeout(1500);
      for (let i = 0; i < FRAMES; i++) { ctx.artifact(await g.screenshot(`life-world-${i}`)); await g.page.waitForTimeout(GAP_MS); }
      // up close on the paddock, to judge walking, grazing and the dog
      await g.page.mouse.move(560, 360);
      for (let i = 0; i < 6; i++) { await g.page.mouse.wheel(0, -160); await g.page.waitForTimeout(60); }
      await g.page.waitForTimeout(600);
      for (let i = 0; i < FRAMES; i++) { ctx.artifact(await g.screenshot(`life-close-${i}`)); await g.page.waitForTimeout(GAP_MS); }
      // close-ups of each dog and the cat (their card glides the camera over; zoom in, card closed)
      for (const id of ["terrier", "collie", "maremma", "cat"]) {
        await g.act({ type: "open", panel: "animal", id });
        await g.act({ type: "close" });
        await g.page.waitForTimeout(700);
        const p = await g.page.evaluate((pid) => /** @type {any} */ (window).__game.debug.petPoint?.(pid) ?? null, id);
        if (p) { await g.page.mouse.move(p.x, p.y); for (let k = 0; k < 8; k++) { await g.page.mouse.wheel(0, -200); await g.page.waitForTimeout(40); } }
        await g.page.waitForTimeout(500);
        for (let k = 0; k < 3; k++) { ctx.artifact(await g.screenshot(`care-close-${id}-${k}`)); await g.page.waitForTimeout(700); }
        for (let k = 0; k < 8; k++) { await g.page.mouse.wheel(0, 300); await g.page.waitForTimeout(30); }
      }
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
