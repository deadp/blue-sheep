// Fleece style comparison (`?fleece=e|0|a|b|c|d`; e is the default, "0" is the old lock-bubble fleece).
// For each style: a contact sheet of portraits (plain white, a coloured spotted sheep, Merino, Romney, Drysdale, Icelandic, a crossbred,
// and the six rare wools), the home paddock flock at play zoom by day, a glow-worm close-up at night, and the paddock in lite mode.
// Rule checked: every style draws every sheep (a portrait for each look) and the world still draws the six rare wools with their
// materials (steel metallic, pāua iridescent, glow-worm brighter at night), so a style can be swapped in without breaking the rare probe.
// Shots: fleece-<style>.png, fleece-<style>-world.png, fleece-<style>-night.png, fleece-<style>-lite.png.
// Styles to render: FLEECE_STYLES="0,a,b,c,d,e" (default e and the old 0). Run: node probe/run.mjs fleece (not part of `npm run probe`).
import fs from "node:fs";
import path from "node:path";
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";
import { OUT_DIR } from "./lib/paths.mjs";

const STYLES = (process.env.FLEECE_STYLES ?? "e,0,a,b,c,d").split(",").map((s) => s.trim()).filter(Boolean);
const ALL_LOOKS = [
  ["plain", {}],
  ["coloured", { wool: "#7a5440", family: "brown", pattern: "spotted", id: "look-col" }],
  ["merino", { breed: "merino", fineness: 18, crimp: 7 }],
  ["romney", { breed: "romney", fineness: 33, crimp: 3 }],
  ["drysdale", { breed: "drysdale", fineness: 36, crimp: 2, horns: "horned", sex: "ram" }],
  ["icelandic", { breed: "icelandic", wool: "#d8d0c4", family: "oatmeal" }],
  ["cross", { breedMix: [{ breed: "merino", share: 0.5 }, { breed: "romney", share: 0.5 }] }],
  ["steel", { fantasy: "steel", wool: "#8f99a5", crimp: 6 }],
  ["cloud", { fantasy: "cloud", crimp: 6 }],
  ["glow", { fantasy: "glow", crimp: 6 }],
  ["paua", { fantasy: "paua", wool: "#2a3f7a", crimp: 6, fineness: 24 }],
  ["pohutukawa", { fantasy: "pohutukawa", wool: "#b3122f", crimp: 6 }],
  ["southerly", { fantasy: "southerly", crimp: 6 }],
];

// FLEECE_LOOKS="merino,romney" limits the contact sheet; FLEECE_PX=600 renders each portrait larger (for a closer look at the fleece)
const ONLY = (process.env.FLEECE_LOOKS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const LOOKS = ONLY.length ? ALL_LOOKS.filter(([l]) => ONLY.includes(l)) : ALL_LOOKS;
const PX = Number(process.env.FLEECE_PX ?? 300);

/** @param {boolean} ok @param {string} msg */
function need(ok, msg) { if (!ok) throw new ProbeError(msg); }

/** @param {import("./lib/browser.mjs").GamePage} g @param {string} file */
async function sheet(g, file) {
  const url = await g.page.evaluate(async ([looks, px]) => {
    const G = /** @type {any} */ (window).__game;
    const urls = looks.map(([label, w]) => G.debug.portrait({ id: `look-${label}`, ...w }, px));
    if (urls.some((u) => !/^data:image\/png/.test(u))) return null;
    const imgs = await Promise.all(urls.map((u) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = u; })));
    const cols = Math.min(5, looks.length), c = document.createElement("canvas");
    c.width = px * cols; c.height = (px + 30) * Math.ceil(imgs.length / cols);
    const x2 = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
    x2.fillStyle = "#f4efe4"; x2.fillRect(0, 0, c.width, c.height);
    x2.font = "600 22px sans-serif"; x2.fillStyle = "#4a3f3d"; x2.textAlign = "center";
    imgs.forEach((im, i) => { const x = (i % cols) * px, y = Math.floor(i / cols) * (px + 30); x2.drawImage(/** @type {CanvasImageSource} */ (im), x, y, px, px); x2.fillText(looks[i][0], x + px / 2, y + px + 22); });
    return c.toDataURL("image/png");
  }, [LOOKS, PX]);
  need(!!url, `every look should render a portrait (${file})`);
  fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(/** @type {string} */ (url).split(",")[1], "base64"));
  return path.join(OUT_DIR, file);
}

/** @param {import("./lib/browser.mjs").GamePage} g */
async function paddock(g) {
  return g.page.evaluate(() => {
    const w = /** @type {any} */ (window).__game.debug.world();
    const home = Object.values(w.sheepAt).filter((/** @type {any} */ p) => p.zone === "paddock");
    const x = home.reduce((a, /** @type {any} */ p) => a + p.x, 0) / home.length, z = home.reduce((a, /** @type {any} */ p) => a + p.z, 0) / home.length;
    return { x, z, n: home.length, fantasy: w.fantasy, sheepAt: w.sheepAt, tris: w.triangles, calls: w.calls };
  });
}

/** @type {import("./lib/harness.mjs").Step} */
export const fleece = {
  name: "fleece",
  async run(ctx) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const st of STYLES) {
      const g = await ctx.newPage();
      await g.boot(`?seed=7&fresh=1&nomotion=1&act=4&rare=all&fleece=${st}`);
      await g.act({ type: "close" });
      ctx.artifact(await sheet(g, `fleece-${st}.png`));
      if (process.env.FLEECE_SHEET_ONLY) { await g.close(); continue; } // FLEECE_SHEET_ONLY=1: just the contact sheet (quick iteration)
      // the home paddock at play zoom, by day
      let p = await paddock(g);
      need(p.fantasy.length === 6, `style ${st}: the world should draw six rare wools, got ${p.fantasy.length}`);
      const f = (/** @type {string} */ id) => p.fantasy.find((/** @type {any} */ x) => x.wool === id);
      need(f("steel").metalness >= 0.5 && f("paua").iridescence >= 0.9, `style ${st}: steel metallic and pāua iridescent`);
      await g.page.evaluate(([x, z]) => /** @type {any} */ (window).__game.debug.camera(x, z, 11), [p.x, p.z]);
      await g.page.waitForTimeout(700);
      ctx.artifact(await g.screenshot(`fleece-${st}-world`));
      const fps = await g.page.evaluate(() => new Promise((res) => {
        let n = 0; const t0 = performance.now();
        const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res((n / (performance.now() - t0)) * 1000); };
        requestAnimationFrame(tick);
      }));
      p = await paddock(g);
      const day = f("glow").emissive;
      // the glow-worm sheep up close at night
      const glowAt = p.sheepAt[f("glow").id];
      await g.page.evaluate(() => /** @type {any} */ (window).__game.debug.night(1));
      await g.page.evaluate(([x, z]) => /** @type {any} */ (window).__game.debug.camera(x, z, 4.5), [glowAt.x, glowAt.z]);
      await g.page.waitForTimeout(700);
      ctx.artifact(await g.screenshot(`fleece-${st}-night`));
      const night = (await paddock(g)).fantasy.find((/** @type {any} */ x) => x.wool === "glow").emissive;
      need(night > day + 0.4, `style ${st}: the glow-worm fleece glows at night (${day} -> ${night})`);
      ctx.note(`style ${st}: paddock ${p.n} sheep, frame ${p.calls} calls / ${p.tris} tris, ${/** @type {number} */ (fps).toFixed(1)} fps (headless software GL)`);
      g.assertNoErrors(`style ${st}`);
      await g.close();
      // lite mode: the same paddock
      const l = await ctx.newPage();
      await l.boot(`?seed=7&fresh=1&nomotion=1&act=4&rare=all&lite=1&fleece=${st}`);
      await l.act({ type: "close" });
      const pl = await paddock(l);
      await l.page.evaluate(([x, z]) => /** @type {any} */ (window).__game.debug.camera(x, z, 7), [pl.x, pl.z]);
      await l.page.waitForTimeout(700);
      ctx.artifact(await l.screenshot(`fleece-${st}-lite`));
      l.assertNoErrors(`style ${st} lite`);
      await l.close();
    }
  },
};

if (isMain(import.meta.url)) runSteps([fleece]);
