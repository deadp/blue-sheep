// Rare wools probe (DESIGN-v3 Phase 6). From the `?act=4&rare=steel` fixture (a grown steel sheep, its two carrier parents on record
// and one of its fleeces in the store), asserting from game rules:
//  - the fixture has a steel sheep, and the world draws it with a metallic material (`__game.debug.world().fantasy`);
//  - the codex's Rare wools page shows one of six wools filled in (the other five stay "???");
//  - a steel-glove job can be queued from the steel fleece by a real click, and an ordinary fleece cannot make gloves;
//  - the vet's rare-gene screen forecasts the six genes, charges 20 coins, and then reveals them: all six genes are on record for the
//    carrier parent, listed on the panel with the facts the records already held (it carries steel), and the forecast falls to nothing;
//  - the parents' carrier facts are on the sheep card in words (no genotype letters);
//  - a carrier pair soon has a steel lamb: the report names it with Old Tom's line, the lamb is in the flock showing steel, and the
//    codex still says one of six (steel was already seen).
// The looks of all six wools (`rare=all`): materials and lift in `debugStats().fantasy`, the glow-worm fleece brighter at night, pōhutukawa crimson by
// season, and a contact sheet of portraits. Shots: rare-looks.png, rare-glow-night.png, rare-steel-card.png, rare-codex.png, rare-codex-empty.png, rare-gloves.png, rare-vet-before.png,
// rare-vet-after.png, rare-forecast.png, rare-report.png.
import { ProbeError } from "./lib/browser.mjs";
import { flock } from "./lib/game.mjs";

const RARE_LOCI = ["ST", "CL", "GW", "PA", "PO", "SO"];

/** @param {boolean} ok @param {string} msg */
function need(ok, msg) { if (!ok) throw new ProbeError(msg); }

/** @type {import("./lib/harness.mjs").Step} */
export const rare = {
  name: "rare",
  async run(ctx) {
    // ---- the fixture and the world
    const g = await ctx.newPage();
    await g.boot("?seed=7&fresh=1&nomotion=1&act=4&rare=steel");
    let st = await g.state();
    const steel = flock(st).find((s) => s.phenotype.steel === "steel");
    need(!!steel, "the ?rare=steel fixture should put a steel sheep in the flock");
    const dam = st.sheep[steel.dam], sire = st.sheep[steel.sire];
    need(!!dam && !!sire, "the steel sheep should have its parents on record");
    const w = await g.page.evaluate(() => /** @type {any} */ (window).__game.debug.world());
    const mine = (w.fantasy ?? []).find((/** @type {any} */ f) => f.id === steel.id);
    need(!!mine, `the world should draw ${steel.name} as a fantasy sheep (debugStats.fantasy has ${(w.fantasy ?? []).length} entries)`);
    need(mine.wool === "steel", `fantasy wool should be steel, got ${mine.wool}`);
    need(/Standard|Physical/.test(mine.material) && mine.metalness >= 0.5, `steel should be a metallic material (metalness >= 0.5), got ${mine.material} ${mine.metalness}`);
    ctx.note(`${steel.name} is steel: ${mine.material}, metalness ${mine.metalness}`);
    // look at the sheep up close: its card visits it in the world
    await g.act({ type: "open", panel: "sheep", id: steel.id });
    await g.waitPanel("sheep", 40_000);
    await g.page.waitForTimeout(1500);
    ctx.artifact(await g.screenshot("rare-steel-card"));
    const card = await g.page.evaluate(() => ({
      tag: document.querySelector("#overlay .tag.rare-wool")?.textContent?.trim() ?? "",
      line: document.querySelector("#overlay .sc-rare")?.textContent?.trim() ?? "",
    }));
    need(/Steel wool/.test(card.tag), `the card should wear a Steel wool tag, got "${card.tag}"`);
    need(card.line.length > 10, "the card should say what steel wool is");
    await g.act({ type: "close" });

    // ---- the codex: one of six
    await g.act({ type: "open", panel: "codex", tab: "rare" });
    await g.waitPanel("codex", 40_000);
    await g.page.waitForTimeout(200);
    const codex = await g.page.evaluate(() => ({
      cards: document.querySelectorAll("#overlay .rare-card").length,
      found: document.querySelectorAll('#overlay .rare-card[data-found="1"]').length,
      ids: [...document.querySelectorAll('#overlay .rare-card[data-found="1"]')].map((e) => /** @type {HTMLElement} */ (e).dataset.rare),
      lore: document.querySelector('#overlay .rare-card[data-found="1"] .rc-lore')?.textContent ?? "",
      unknown: document.querySelectorAll("#overlay .rare-card.locked h4").length,
      sil: document.querySelectorAll("#overlay .rare-card svg.rare-sil").length,
    }));
    need(codex.cards === 6, `the Rare wools page should have six silhouettes, found ${codex.cards}`);
    need(codex.found === 1 && codex.ids[0] === "steel", `the codex should show 1 of 6 filled (steel), got ${codex.found}: ${codex.ids}`);
    need(codex.unknown === 5, `the five unseen wools should read ???, found ${codex.unknown}`);
    need(codex.sil === 6, `every card should have a silhouette, found ${codex.sil}`);
    need(codex.lore.length > 30, "the steel card should have a line of lore");
    ctx.artifact(await g.screenshot("rare-codex"));
    ctx.note("codex: 1 of 6 filled (steel)");

    // ---- a steel-glove job can be queued; ordinary wool cannot make gloves
    st = await g.state();
    const lots = st.store ?? [];
    const steelLot = lots.find((/** @type {any} */ l) => l.fantasy === "steel");
    need(!!steelLot, "the fixture should hold a steel fleece in the store");
    need(st.patterns.includes("steelGloves"), "the steel-glove pattern should be known once there is steel wool");
    await g.act({ type: "open", panel: "woolshed", tab: "bench" });
    await g.waitPanel("woolshed", 40_000);
    await g.page.click(`#overlay [data-src="lot:${steelLot.id}"]`, { timeout: 90_000 });
    await g.page.waitForTimeout(150);
    const gloves = await g.page.evaluate(() => {
      const b = document.querySelector('#overlay [data-queue="steelGloves"]');
      const card = b?.closest("[data-pattern]");
      return { exists: !!b, disabled: !!(b && /** @type {HTMLButtonElement} */ (b).disabled), text: (card?.textContent ?? "").replace(/\s+/g, " ").trim() };
    });
    need(gloves.exists, "the steel gloves pattern card should be on the workbench");
    need(!gloves.disabled, `the Queue button for steel gloves should be enabled with the steel fleece picked (${gloves.text})`);
    await g.page.evaluate(() => document.querySelector('#overlay [data-queue="steelGloves"]')?.scrollIntoView({ block: "center" }));
    await g.page.waitForTimeout(150);
    ctx.artifact(await g.screenshot("rare-gloves"));
    const other = lots.find((/** @type {any} */ l) => !l.fantasy);
    if (other) {
      await g.page.click(`#overlay [data-src="lot:${other.id}"]`, { timeout: 90_000 });
      await g.page.waitForTimeout(150);
      const off = await g.page.evaluate(() => /** @type {HTMLButtonElement | null} */ (document.querySelector('#overlay [data-queue="steelGloves"]'))?.disabled);
      need(off === true, "gloves should not be queueable from an ordinary fleece");
      await g.page.click(`#overlay [data-src="lot:${steelLot.id}"]`, { timeout: 90_000 });
      await g.page.waitForTimeout(150);
    }
    await g.page.click('#overlay [data-queue="steelGloves"]', { timeout: 90_000 });
    await g.page.waitForTimeout(200);
    st = await g.state();
    const job = (st.jobs ?? []).find((/** @type {any} */ j) => j.item === "steelGloves");
    need(!!job, "queueing should make a steel-glove job");
    need(job.mat.fantasy === "steel", "the job should be made from the steel wool");
    ctx.note(`steel gloves queued: ${job.route.join(" > ")}, ready by ${job.seen.finish}`);
    await g.act({ type: "close" });

    // ---- the vet's rare-gene screen: forecast, then the facts it forecast
    const carrier = dam;
    const before = await g.page.evaluate((id) => /** @type {any} */ (window).__game.forecast.screen(id), carrier.id);
    need(before.gainBits > 0, `the screen forecast should be positive (${before.gainBits})`);
    await g.act({ type: "open", panel: "vet", id: carrier.id });
    await g.waitPanel("vet", 40_000);
    await g.page.waitForTimeout(200);
    await g.page.evaluate(() => document.querySelector('#overlay [data-test-row="rare"]')?.scrollIntoView({ block: "center" }));
    const pre = await g.page.evaluate(() => ({
      forecast: document.querySelector("#overlay [data-screen-forecast]")?.textContent?.trim() ?? "",
      label: document.querySelector('#overlay [data-test-row="rare"] .v-label')?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      facts: document.querySelectorAll("#overlay [data-rare-fact]").length,
      button: document.querySelector("#overlay [data-screen]")?.getAttribute("data-screen") ?? "",
    }));
    need(/six rare wool genes|steel wool/.test(pre.forecast) && pre.forecast === before.text, `the screen should forecast what it settles in words (core: "${before.text}"), got "${pre.forecast}"`);
    need(/Six rare wool genes at once/.test(pre.label), `the row should say it tests six rare wool genes at once, got "${pre.label}"`);
    need(pre.facts === 0, "nothing should be listed before the screen");
    need(pre.button === carrier.id, `the Screen button should be for ${carrier.name}`);
    ctx.artifact(await g.screenshot("rare-vet-before"));
    const money = (await g.state()).money;
    await g.page.click(`#overlay [data-screen="${carrier.id}"]`, { timeout: 90_000 });
    await g.page.waitForTimeout(300);
    st = await g.state();
    need(st.money === money - 20, `the screen should cost 20 coins (${money} -> ${st.money})`);
    for (const l of RARE_LOCI) need(st.sheep[carrier.id].tested[l] !== undefined, `the screen should test ${l}`);
    const after = await g.page.evaluate(() => ({
      rows: [...document.querySelectorAll("#overlay [data-rare-fact]")].map((e) => ({ locus: /** @type {HTMLElement} */ (e).dataset.rareFact, text: (e.textContent ?? "").replace(/\s+/g, " ").trim(), certain: e.classList.contains("certain") })),
      done: !!document.querySelector('#overlay [data-test-row="rare"][data-screened="1"]'),
      expected: document.querySelector("#overlay [data-screen-expected]")?.textContent?.trim() ?? "",
    }));
    need(after.expected === `Before the screen: ${before.text}`, `the screen result should keep the forecast the player saw (core: "${before.text}"), got "${after.expected}"`);
    need(!after.rows.some((r) => /has no .* copy/.test(r.text)), "clear genes should read none, not repeat the wool's name");
    need(after.done, "the vet row should read Screened");
    need(after.rows.length === 6, `the screen should list all six genes, found ${after.rows.length}`);
    need(after.rows.every((r) => r.certain), "every gene should be certain after a screen");
    const stRow = after.rows.find((r) => r.locus === "ST");
    need(/carries a hidden steel wool copy/.test(stRow?.text ?? ""), `the carrier should be told it carries steel, got "${stRow?.text}"`);
    need(!after.rows.some((r) => /[A-Za-z]{1,2}\/[A-Za-z]{1,2}/.test(r.text)), "no genotype letters in the results");
    const gone = await g.page.evaluate((id) => /** @type {any} */ (window).__game.forecast.screen(id), carrier.id);
    need(gone.gainBits === 0, "a screened sheep has nothing left to forecast");
    await g.page.evaluate(() => document.querySelector('#overlay [data-test-row="rare"]')?.scrollIntoView({ block: "center" }));
    ctx.artifact(await g.screenshot("rare-vet-after"));
    ctx.note(`screen: forecast ${before.gainBits.toFixed(2)} bits, 20 coins, six genes revealed (${after.rows.map((r) => r.locus).join(" ")}), ST says "${stRow?.text}"`);
    await g.act({ type: "close" });

    // ---- the parents' carrier facts are on the cards, and the forecast for the pair shows the rare wool in words
    await g.act({ type: "open", panel: "forecast", id: dam.id });
    await g.waitPanel("forecast", 40_000);
    await g.page.evaluate((id) => document.querySelector(`#overlay [data-mate="${id}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true })), sire.id);
    await g.page.waitForTimeout(300);
    const fc = await g.page.evaluate(() => ({
      lines: [...document.querySelectorAll("#overlay .rare-line")].map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()),
      chance: [...document.querySelectorAll("#overlay [data-rare-chance]")].map((e) => /** @type {HTMLElement} */ (e).dataset.rareChance),
    }));
    need(fc.chance.includes("steel"), `the carrier pair's forecast should show a steel chance, got ${JSON.stringify(fc)}`);
    need(fc.lines.some((l) => /steel wool/.test(l) && /one lamb in four/.test(l)), `it should say about one lamb in four could have steel wool, got ${JSON.stringify(fc.lines)}`);
    ctx.artifact(await g.screenshot("rare-forecast"));
    ctx.note(`forecast: ${fc.lines[0]}`);
    await g.act({ type: "close" });

    // ---- a carrier pair soon has a steel lamb: the surprise reveal
    let seen = null;
    for (let i = 0; i < 14 && !seen; i++) {
      st = await g.state();
      if (st.act < 4) break;
      await g.act({ type: "plan", ewe: dam.id, ram: sire.id });
      await g.act({ type: "sleep" });
      await g.waitPanel("report", 40_000);
      const r = await g.page.evaluate(() => ({
        banner: document.querySelector("#overlay .act-banner.rare-lamb")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        wool: document.querySelector("#overlay .act-banner.rare-lamb")?.getAttribute("data-rare-lamb") ?? "",
        reveal: document.querySelectorAll("#overlay .born.rare").length,
      }));
      if (r.banner) { seen = r; break; }
      await g.act({ type: "close" });
    }
    need(!!seen, "a pair of known carriers should have a steel lamb within 14 seasons");
    need(seen.wool === "steel", `the banner should be about steel, got ${seen.wool}`);
    need(/Well, I'll be\. Never seen a fleece do that\./.test(seen.banner) || /another rare fleece/.test(seen.banner), `Old Tom should react, got "${seen.banner}"`);
    need(seen.reveal >= 1, "the lamb's reveal card should sparkle (.born.rare)");
    await g.page.waitForTimeout(2500); // let the card flips and the sparkle play
    ctx.artifact(await g.screenshot("rare-report"));
    st = await g.state();
    const lamb = flock(st).filter((s) => s.dam === dam.id && s.sire === sire.id && s.phenotype.steel === "steel" && s.id !== steel.id && s.born === st.season);
    need(lamb.length >= 1, "the new steel lamb should be in the flock");
    ctx.note(`surprise lamb ${lamb[0].name}: "${seen.banner.slice(0, 120)}"`);
    g.assertNoErrors("in the rare wools probe");
    await g.close();

    // ---- every rare wool's look, driven only by the snapshot (fixture `rare=all`): materials, glow at night, lift, crimson, a contact sheet
    const a = await ctx.newPage();
    await a.boot("?seed=7&fresh=1&nomotion=1&act=4&rare=all");
    const sa = await a.state();
    const by = Object.fromEntries(["steel", "cloud", "glow", "paua", "pohutukawa", "southerly"].map((id) => [id, flock(sa).find((s) => s.phenotype[id] === id)]));
    for (const [id, s] of Object.entries(by)) need(!!s, `the ?rare=all fixture should have a ${id} sheep`);
    const snap = await a.page.evaluate(() => /** @type {any} */ (window).__game.snapshot());
    for (const [id, s] of Object.entries(by)) need(snap.sheep.find((/** @type {any} */ x) => x.id === s.id)?.fantasy === id, `the snapshot should say ${id} for ${s.name}`);
    const stats = async () => /** @type {any[]} */ (await a.page.evaluate(() => /** @type {any} */ (window).__game.debug.world().fantasy));
    const one = (/** @type {any[]} */ list, /** @type {string} */ id) => list.find((f) => f.wool === id);
    let day = await stats();
    need(day.length === 6, `the world should draw six fantasy sheep, got ${day.length}`);
    need(one(day, "steel").metalness >= 0.5, "steel is metallic");
    need(one(day, "paua").material === "MeshPhysicalMaterial" && one(day, "paua").iridescence >= 0.9, "pāua is iridescent");
    need(one(day, "cloud").lift > 0.05, `a cloud sheep floats off the grass (lift ${one(day, "cloud").lift})`);
    for (const f of day) if (f.wool !== "cloud") need(f.lift === 0, `only cloud sheep float (${f.wool} lift ${f.lift})`);
    await a.page.evaluate(() => /** @type {any} */ (window).__game.debug.night(1));
    await a.page.waitForTimeout(600);
    const night = await stats();
    need(one(night, "glow").emissive > one(day, "glow").emissive + 0.4, `the glow-worm fleece glows at night (${one(day, "glow").emissive} -> ${one(night, "glow").emissive})`);
    need(Math.abs(one(night, "steel").emissive - one(day, "steel").emissive) < 0.01, "steel does not glow");
    ctx.note(`glow-worm emissive ${one(day, "glow").emissive} by day, ${one(night, "glow").emissive} at night; cloud lift ${one(day, "cloud").lift}; steel metalness ${one(day, "steel").metalness}; pāua iridescence ${one(day, "paua").iridescence}`);
    await a.act({ type: "open", panel: "sheep", id: by.glow.id });
    await a.waitPanel("sheep", 40_000);
    await a.page.waitForTimeout(1200);
    ctx.artifact(await a.screenshot("rare-glow-night"));
    await a.act({ type: "close" });
    await a.page.evaluate(() => /** @type {any} */ (window).__game.debug.night(0));
    await a.page.waitForTimeout(300);
    // pōhutukawa: crimson in summer, its own colour in winter (the controller blends `wool` by season)
    const po = snap.sheep.find((/** @type {any} */ x) => x.id === by.pohutukawa.id);
    const amt = [0.3, 1, 0.45, 0][sa.season % 4];
    need(amt === 0 ? po.wool.toLowerCase() === by.pohutukawa.phenotype.wool.toLowerCase() : po.wool.toLowerCase() !== by.pohutukawa.phenotype.wool.toLowerCase(), `pōhutukawa wool should be crimson-tinged except in winter (season ${sa.season % 4}, ${po.wool} vs ${by.pohutukawa.phenotype.wool})`);
    ctx.note(`pōhutukawa fleece ${po.wool} in season ${sa.season % 4} (its own colour ${by.pohutukawa.phenotype.wool})`);
    // contact sheet: a plain sheep and the six wools, portraits rendered by the world
    const sheet = await a.page.evaluate(async (wools) => {
      const g = /** @type {any} */ (window).__game;
      const items = [{ label: "plain", w: {} }, ...wools.map((/** @type {any} */ x) => ({ label: x.id, w: { fantasy: x.id, wool: x.wool, fineness: 24, crimp: 6 } }))];
      const imgs = await Promise.all(items.map((it) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = g.debug.portrait({ id: `look-${it.label}`, ...it.w }, 300); })));
      const c = document.createElement("canvas");
      c.width = 300 * 4; c.height = 330 * 2;
      const ctx2 = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
      ctx2.fillStyle = "#f4efe4"; ctx2.fillRect(0, 0, c.width, c.height);
      ctx2.font = "600 22px sans-serif"; ctx2.fillStyle = "#4a3f3d"; ctx2.textAlign = "center";
      imgs.forEach((im, i) => { const x = (i % 4) * 300, y = Math.floor(i / 4) * 330; ctx2.drawImage(/** @type {CanvasImageSource} */ (im), x, y, 300, 300); ctx2.fillText(items[i].label, x + 150, y + 322); });
      return c.toDataURL("image/png");
    }, ["steel", "cloud", "glow", "paua", "pohutukawa", "southerly"].map((id) => ({ id, wool: id === "pohutukawa" ? "#b3122f" : by[id].phenotype.wool })));
    const { default: fs } = await import("node:fs");
    const { default: path } = await import("node:path");
    const { OUT_DIR } = await import("./lib/paths.mjs");
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, "rare-looks.png"), Buffer.from(sheet.split(",")[1], "base64"));
    ctx.artifact(path.join(OUT_DIR, "rare-looks.png"));
    a.assertNoErrors("in the rare looks sheet");
    await a.close();

    // ---- a fresh farm: no rare wool seen yet, the codex page is six ???
    const e = await ctx.newPage();
    await e.boot("?seed=7&fresh=1&nomotion=1&act=3");
    await e.act({ type: "open", panel: "codex", tab: "rare" });
    await e.waitPanel("codex", 40_000);
    await e.page.waitForTimeout(200);
    const empty = await e.page.evaluate(() => document.querySelectorAll('#overlay .rare-card[data-found="1"]').length);
    need(empty === 0, `a farm with no rare wool should show 0 of 6, found ${empty}`);
    ctx.artifact(await e.screenshot("rare-codex-empty"));
    e.assertNoErrors("in the rare wools probe (fresh farm)");
    await e.close();
  },
};

import { isMain, runSteps } from "./lib/harness.mjs";
if (isMain(import.meta.url)) runSteps([rare]);
