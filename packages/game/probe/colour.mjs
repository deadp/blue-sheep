// Colour probe (DESIGN-v3 Phase 2): pigment colours in the live game. On the act-3 fixture farm (a flock of
// several colours): the world draws every sheep in its own wool colour from the colour model (the snapshot's wool
// hex and family equal the sheep's phenotype); a coloured sheep's card shows its pigment dots (lit dots = its
// doses) and its colour in words; the vet offers a pigment test per colour, and running one pins both genes of that
// colour; a forecast shows ten valid swatches; a coloured lamb's report card wears the lamb's own wool.
// Screenshots colour-valley, colour-card, colour-card-white, colour-vet, colour-forecast, colour-report.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";
import { HEX_RE } from "./lib/game.mjs";
import { assertSwatches } from "./panels.mjs";

/** @type {import("./lib/harness.mjs").Step} */
export const colour = {
  name: "colour",
  async run(ctx) {
    const g = await ctx.newPage();
    await g.boot("?seed=7&fresh=1&nomotion=1&act=3");
    let st = await g.state();
    const flock = st.flock.map((/** @type {string} */ id) => st.sheep[id]);

    // Rule: the world gets wool hex + family from the colour model, for every sheep it draws.
    const snap = await g.page.evaluate(() => /** @type {any} */ (window).__game.snapshot());
    for (const ws of snap.sheep) {
      const s = st.sheep[ws.id];
      if (!s) continue;
      if (!HEX_RE.test(ws.wool)) throw new ProbeError(`world sheep ${ws.name} has no valid wool hex (${ws.wool})`);
      if (ws.wool.toUpperCase() !== String(s.phenotype.wool).toUpperCase() || ws.family !== s.phenotype.family) {
        throw new ProbeError(`world sheep ${ws.name} is drawn ${ws.wool}/${ws.family} but its phenotype is ${s.phenotype.wool}/${s.phenotype.family}`);
      }
    }
    const families = [...new Set(flock.map((/** @type {any} */ s) => s.phenotype.family))];
    ctx.note(`act-3 flock families: ${families.join(", ")}`);
    ctx.artifact(await g.screenshot("colour-valley"));

    // Rule: a coloured sheep's card shows its colour in words and one lit dot per dose, per colour.
    const col = flock.filter((/** @type {any} */ s) => s.phenotype.white === "coloured")
      .sort((/** @type {any} */ a, /** @type {any} */ b) => (b.phenotype.intensity ?? 0) - (a.phenotype.intensity ?? 0))[0];
    if (!col) throw new ProbeError("the act-3 fixture should have a coloured sheep");
    await g.act({ type: "open", panel: "sheep", id: col.id });
    await g.waitPanel("sheep");
    await g.page.waitForTimeout(200);
    const dots = await g.page.evaluate(() => Object.fromEntries(["red", "yellow", "blue"].map((c) => [c, document.querySelectorAll(`#overlay .sc-colour .pig-row.${c} i.on`).length])));
    for (const c of ["red", "yellow", "blue"]) {
      if (dots[c] !== Number(col.phenotype[c])) throw new ProbeError(`${col.name}'s card lights ${dots[c]} ${c} dot(s), its dose is ${col.phenotype[c]}`);
    }
    const words = (await g.page.locator("#overlay .facts-row").first().textContent()) ?? "";
    if (!words.includes(col.phenotype.colour)) throw new ProbeError(`${col.name}'s card should name its colour (${col.phenotype.colour}): "${words}"`);
    ctx.artifact(await g.screenshot("colour-card"));
    const white = flock.find((/** @type {any} */ s) => s.phenotype.white === "white");
    if (white) {
      await g.act({ type: "open", panel: "sheep", id: white.id });
      await g.waitPanel("sheep");
      await g.page.waitForFunction((id) => document.querySelector(`#overlay [data-live-portrait-slot="${id}"]`), white.id, { timeout: 5_000 });
      await g.page.waitForTimeout(150);
      if (await g.page.locator("#overlay .sc-colour").count()) throw new ProbeError("a white sheep's card should not show pigment dots (its colour is hidden)");
      ctx.artifact(await g.screenshot("colour-card-white"));
    }

    // Rule: the vet has a pigment test per colour; a test pins both genes of that colour and costs the fee.
    const subject = white ?? col;
    await g.act({ type: "open", panel: "vet", id: subject.id });
    await g.waitPanel("vet");
    await g.page.click(`#overlay .chips [data-tab="${subject.id}"]`).catch(() => {});
    await g.page.waitForTimeout(150);
    for (const c of ["red", "yellow", "blue"]) {
      if (!(await g.page.locator(`#overlay [data-test="${subject.id}:${c}"]`).count())) throw new ProbeError(`the vet should offer a ${c} pigment test for ${subject.name}`);
    }
    ctx.artifact(await g.screenshot("colour-vet"));
    const money = (await g.state()).money;
    await g.page.click(`#overlay [data-test="${subject.id}:blue"]`);
    st = await g.state();
    const tested = st.sheep[subject.id].tested;
    if (!tested.U1 || !tested.U2) throw new ProbeError(`a blue pigment test should pin both blue genes, tested: ${JSON.stringify(Object.keys(tested))}`);
    if (money - st.money !== 12) throw new ProbeError(`the blue test should cost the fee (coins ${money} → ${st.money})`);

    // Rule: the forecast shows ten swatches with valid hexes, matching the forecast's own classes.
    const ewe = st.flock.map((/** @type {string} */ id) => st.sheep[id]).find((/** @type {any} */ s) => s.sex === "ewe" && st.season - s.born >= 2 && !s.ill);
    await g.act({ type: "open", panel: "forecast", id: ewe.id });
    await g.waitPanel("forecast");
    await g.page.waitForTimeout(250);
    await assertSwatches(g, "colour forecast");
    ctx.artifact(await g.screenshot("colour-forecast"));

    // Rule: a coloured lamb's report card wears the lamb's own wool colour. Plan the coloured ewes with the
    // coloured rams (best chance of a coloured lamb), sleep, and read the report.
    await g.act({ type: "close" });
    st = await g.state();
    // Make room for lambs: sell white sheep (never the coloured ones) until four lambs fit.
    for (const s of st.flock.map((/** @type {string} */ id) => st.sheep[id]).filter((/** @type {any} */ x) => x.phenotype.white === "white")) {
      if (st.flock.length <= st.flockCap - 4) break;
      await g.act({ type: "sell", id: s.id });
      st = await g.state();
    }
    const adults = st.flock.map((/** @type {string} */ id) => st.sheep[id]).filter((/** @type {any} */ s) => st.season - s.born >= 2 && !s.ill);
    const rams = adults.filter((/** @type {any} */ s) => s.sex === "ram").sort((/** @type {any} */ a, /** @type {any} */ b) => (a.phenotype.white === "coloured" ? -1 : 1) - (b.phenotype.white === "coloured" ? -1 : 1));
    for (const e of adults.filter((/** @type {any} */ s) => s.sex === "ewe")) for (const r of rams) { if ((await g.act({ type: "plan", ewe: e.id, ram: r.id })).ok) break; }
    await g.act({ type: "sleep" });
    await g.waitPanel("report", 15_000);
    await g.page.waitForTimeout(1200); // cards flip
    st = await g.state();
    const cards = await g.page.evaluate(() => [...document.querySelectorAll("#overlay .born.flip")].map((b) => ({ id: /** @type {HTMLElement} */ (b).dataset.sheep, wool: /** @type {HTMLElement} */ (b).dataset.wool, family: /** @type {HTMLElement} */ (b).dataset.family })));
    if (!cards.length) throw new ProbeError("the report should show the born lambs");
    for (const c of cards) {
      const l = st.sheep[c.id ?? ""];
      if (!l || String(c.wool).toUpperCase() !== String(l.phenotype.wool).toUpperCase() || c.family !== l.phenotype.family) throw new ProbeError(`lamb card ${c.id} shows ${c.wool}/${c.family}, the lamb is ${l?.phenotype.wool}/${l?.phenotype.family}`);
    }
    ctx.note(`report: ${cards.length} lamb(s): ${cards.map((c) => `${st.sheep[c.id ?? ""]?.phenotype.colour}`).join(", ")}`);
    ctx.artifact(await g.screenshot("colour-report"));
    g.assertNoErrors("during the colour probe");
    await g.close();
  },
};

if (isMain(import.meta.url)) runSteps([colour]);
