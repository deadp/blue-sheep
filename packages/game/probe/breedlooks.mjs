// Breed looks probe (DESIGN-v3 §15 item 30): one portrait per breed plus a crossbred lamb, written to out/breedlooks/,
// and the breed-blend rules: a bred lamb's world snapshot carries its blend (shares sum to 1, the parents' breeds),
// and a forecast with a long-shot outcome renders one marker swatch outside the ten.
// If BREEDLOOKS_BEFORE=<dir> is set, writes out/breed-looks-before-after.png comparing that older run to this one.
import fs from "node:fs";
import path from "node:path";
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";
import { OUT_DIR } from "./lib/paths.mjs";

const BREEDS = ["farm", "merino", "corriedale", "perendale", "romney", "drysdale", "icelandic"];

/** @type {import("./lib/harness.mjs").Step} */
export const breedlooks = {
  name: "breedlooks",
  async run(ctx) {
    const g = await ctx.newPage();
    await g.boot("?seed=7&fresh=1&nomotion=1&act=3");
    const dir = path.join(OUT_DIR, "breedlooks");
    fs.mkdirSync(dir, { recursive: true });
    /** @type {Record<string, any>} */
    const looks = {};
    for (const b of BREEDS) looks[b] = { breed: b };
    // coloured, horned and lamb variants show the face/horn work; the crossbred lamb blends Merino and Romney
    looks["ram-horned"] = { breed: "drysdale", sex: "ram", horns: "horned", wool: "#8a7566", family: "taupe" };
    looks["merino-lamb"] = { breed: "merino", adult: false };
    looks["cross-lamb"] = { breed: "farm", adult: false, breedMix: [{ breed: "merino", share: 0.5 }, { breed: "romney", share: 0.5 }] };
    looks["cross-adult"] = { breed: "farm", breedMix: [{ breed: "icelandic", share: 0.5 }, { breed: "merino", share: 0.5 }] };
    const urls = await g.page.evaluate((l) => Object.fromEntries(Object.entries(l).map(([k, w]) => [k, /** @type {any} */ (window).__game.debug.portrait(w, 300)])), looks);
    for (const [k, u] of Object.entries(urls)) {
      if (!/^data:image\/png;base64,/.test(u)) throw new ProbeError(`no portrait for ${k}`);
      fs.writeFileSync(path.join(dir, `${k}.png`), Buffer.from(u.split(",")[1], "base64"));
    }
    ctx.note(`wrote ${Object.keys(urls).length} breed portraits to out/breedlooks/`);

    // Rule: a lamb of two breeds carries both in the snapshot (shares sum to 1, one entry per parent breed).
    let st = await g.state();
    // buy a market sheep of another breed and pair it with a Farm sheep of the other sex
    const other = st.market.map((/** @type {string} */ id) => st.sheep[id]).find((/** @type {any} */ x) => x.breed && x.breed !== "farm");
    if (!other) throw new ProbeError("the act-3 market has no non-Farm sheep");
    const r = await g.act({ type: "buy", id: other.id });
    if (r.ok === false) throw new ProbeError(`could not buy ${other.id}`);
    st = await g.state();
    const mate = Object.values(st.sheep).find((/** @type {any} */ x) => st.flock.includes(x.id) && x.sex !== other.sex && !x.breed && x.born <= st.season - 2);
    if (!mate) throw new ProbeError("no adult Farm mate in the flock");
    const [ewe, ram] = other.sex === "ewe" ? [other, mate] : [mate, other];
    await g.act({ type: "plan", ewe: ewe.id, ram: ram.id });
    await g.act({ type: "sleep" });
    await g.waitPanel("report", 30_000);
    await g.act({ type: "close" });
    const after = await g.state();
    const lamb = Object.values(after.sheep).find((s) => s.dam === ewe.id && s.sire === ram.id);
    if (!lamb) throw new ProbeError("the planned mating produced no lamb");
    const snap = await g.page.evaluate(() => /** @type {any} */ (window).__game.snapshot());
    const w = snap.sheep.find((/** @type {any} */ x) => x.id === lamb.id);
    if (!w) throw new ProbeError("the lamb is missing from the world snapshot");
    const want = new Set([ewe.breed ?? "farm", ram.breed ?? "farm"]);
    if (want.size > 1) {
      const mix = w.breedMix ?? [];
      const sum = mix.reduce((/** @type {number} */ a, /** @type {any} */ m) => a + m.share, 0);
      if (Math.abs(sum - 1) > 1e-6 || !mix.every((/** @type {any} */ m) => want.has(m.breed)) || mix.length !== want.size) throw new ProbeError(`lamb of ${[...want].join(" × ")} has breedMix ${JSON.stringify(mix)}`);
      ctx.note(`lamb of ${[...want].join(" × ")}: breedMix ${JSON.stringify(mix)}`);
    } else ctx.note(`parents share breed ${[...want][0]}; blend rule not exercised`);
    g.assertNoErrors("during the breedlooks probe");
    await g.close();

    // Rule: a forecast whose colour classes include a long shot (under 8%) renders exactly ten tiles plus one marker.
    const g2 = await ctx.newPage();
    await g2.boot("?seed=7&fresh=1&nomotion=1&act=3");
    const s2 = await g2.state();
    const fl = Object.values(s2.sheep).filter((s) => s2.flock.includes(s.id));
    let found = null;
    for (const e of fl.filter((s) => s.sex === "ewe")) for (const r of fl.filter((s) => s.sex === "ram")) {
      if (found) break;
      const f = await g2.page.evaluate(([a, b]) => /** @type {any} */ (window).__game.forecast.cross(a, b), [e.id, r.id]);
      const ps = f.swatches.map((/** @type {any} */ x) => x.p);
      if (ps.some((/** @type {number} */ p) => p >= 0.08) && ps.some((/** @type {number} */ p) => p > 0.005 && p < 0.08)) found = [e.id, r.id];
    }
    if (!found) throw new ProbeError("no pair in the act-3 flock has a long-shot colour to test");
    await g2.act({ type: "open", panel: "forecast", id: found[0] });
    await g2.waitPanel("forecast");
    await g2.page.click(`#overlay [data-mate="${found[1]}"]`);
    await g2.page.waitForTimeout(500);
    const n = await g2.page.evaluate(() => ({
      ten: document.querySelectorAll("#overlay .forecast .litter .lamb-tile").length,
      marker: document.querySelectorAll("#overlay .forecast .litter-long .lamb-tile.long").length,
      legend: document.querySelectorAll("#overlay .forecast .key.long").length,
    }));
    if (n.ten !== 10 || n.marker !== 1 || n.legend !== 1) throw new ProbeError(`long-shot forecast should show ten tiles, one marker and one legend entry, got ${JSON.stringify(n)}`);
    ctx.artifact(await g2.screenshot("forecast-longshot"));
    g2.assertNoErrors("during the long-shot forecast");
    await g2.close();

    const before = process.env["BREEDLOOKS_BEFORE"];
    if (before) await sheet(before, dir);
  },
};

/** @param {string} beforeDir @param {string} afterDir */
async function sheet(beforeDir, afterDir) {
  const { chromium } = await import("playwright");
  const { CHROME } = await import("./lib/paths.mjs");
  const names = [...BREEDS, "ram-horned", "merino-lamb", "cross-lamb", "cross-adult"];
  const img = (/** @type {string} */ d, /** @type {string} */ n) => { try { return `data:image/png;base64,${fs.readFileSync(path.join(d, `${n}.png`)).toString("base64")}`; } catch { return ""; } };
  const cells = names.map((n) => `<div class="c"><b>${n}</b><img src="${img(beforeDir, n)}"><img src="${img(afterDir, n)}"></div>`).join("");
  const html = `<body style="margin:0;background:#8fb27a;font:14px system-ui"><div style="padding:8px 12px;font:700 18px system-ui">Breed looks: before (left) and after (right) of each pair; farm unchanged by design</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px">${cells}</div>
<style>.c{background:#dfe9d0;border-radius:8px;padding:4px;text-align:center}.c img{width:48%}.c b{display:block}</style></body>`;
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await page.setContent(html);
  await page.screenshot({ path: path.join(OUT_DIR, "breed-looks-before-after.png"), fullPage: true });
  await browser.close();
}

if (isMain(import.meta.url)) runSteps([breedlooks]);
