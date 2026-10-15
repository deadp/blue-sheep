// Steel wool shader comparison (`?fleece=0|a|c|d&steelv=0..3`). For each case "style:variant" (STEEL_CASES, default below): a row of
// portraits (plain, steel, a darker-fleece steel), the steel sheep in the home paddock at play zoom and close up, and its sheep card.
// Shots: steel-row-<style>-v<n>.png, steel-world-<style>-v<n>.png, steel-close-<style>-v<n>.png, steel-card-<style>-v<n>.png, and steel-sheet.png (all rows).
// Run: node probe/run.mjs steel (not part of `npm run probe`; STEEL_CASES="d:1,d:2" STEEL_SHOTS=0 to skip the in-world shots).
import fs from "node:fs";
import path from "node:path";
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";
import { flock } from "./lib/game.mjs";
import { OUT_DIR } from "./lib/paths.mjs";

const CASES = (process.env.STEEL_CASES ?? "0:1,a:0,a:1,a:2,a:3,d:0,d:1,d:2,d:3").split(",").map((s) => s.trim().split(":"));
const SHOTS = process.env.STEEL_SHOTS !== "0";
const LOOKS = [
  ["plain", {}],
  ["steel", { fantasy: "steel", wool: "#8f99a5", crimp: 6 }],
  ["steel crimp 9", { fantasy: "steel", wool: "#8f99a5", crimp: 9, id: "look-steel2" }],
  ["steel merino", { fantasy: "steel", breed: "merino", fineness: 18, crimp: 7, id: "look-steel3" }],
];

/** @type {import("./lib/harness.mjs").Step} */
export const steel = {
  name: "steel",
  async run(ctx) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const rows = [];
    for (const [st, v] of CASES) {
      const tag = `${st}-v${v}`;
      const g = await ctx.newPage();
      await g.boot(`?seed=7&fresh=1&nomotion=1&act=4&rare=steel&fleece=${st}&steelv=${v}`);
      await g.act({ type: "close" });
      const url = await g.page.evaluate(async (looks) => {
        const G = /** @type {any} */ (window).__game;
        const urls = looks.map(([label, w]) => G.debug.portrait({ id: `look-${label}`, ...w }, 300));
        const imgs = await Promise.all(urls.map((u) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = u; })));
        const c = document.createElement("canvas"); c.width = 300 * imgs.length; c.height = 300;
        const x2 = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
        x2.fillStyle = "#f4efe4"; x2.fillRect(0, 0, c.width, c.height);
        imgs.forEach((im, i) => x2.drawImage(/** @type {CanvasImageSource} */ (im), i * 300, 0, 300, 300));
        return c.toDataURL("image/png");
      }, LOOKS);
      const rowFile = path.join(OUT_DIR, `steel-row-${tag}.png`);
      fs.writeFileSync(rowFile, Buffer.from(url.split(",")[1], "base64"));
      rows.push([tag, rowFile]);
      ctx.artifact(rowFile);
      if (SHOTS) {
        const st0 = await g.state();
        const sheep = flock(st0).find((s) => s.phenotype.steel === "steel");
        if (!sheep) throw new ProbeError("no steel sheep in the fixture");
        const w = await g.page.evaluate(() => /** @type {any} */ (window).__game.debug.world());
        const at = w.sheepAt[sheep.id];
        for (const [name, half] of [["world", 9], ["close", 3.2]]) {
          await g.page.evaluate(([x, z, h]) => /** @type {any} */ (window).__game.debug.camera(x, z, h), [at.x, at.z, half]);
          await g.page.waitForTimeout(600);
          ctx.artifact(await g.screenshot(`steel-${name}-${tag}`));
        }
        const s = await g.page.evaluate(() => /** @type {any} */ (window).__game.debug.world());
        ctx.note(`${tag}: frame ${s.calls} calls / ${s.triangles} tris`);
        await g.act({ type: "open", panel: "sheep", id: sheep.id });
        await g.waitPanel("sheep", 40_000);
        await g.page.waitForTimeout(1500);
        ctx.artifact(await g.screenshot(`steel-card-${tag}`));
      }
      g.assertNoErrors(`steel ${tag}`);
      await g.close();
    }
    // all rows on one sheet
    const g = await ctx.newPage();
    await g.boot("?seed=7&fresh=1&nomotion=1");
    const data = rows.map(([t, f]) => [t, fs.readFileSync(/** @type {string} */ (f)).toString("base64")]);
    const sheet = await g.page.evaluate(async (rs) => {
      const imgs = await Promise.all(rs.map(([, b]) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = "data:image/png;base64," + b; })));
      const c = document.createElement("canvas"); c.width = 1200 + 110; c.height = 300 * rs.length;
      const x2 = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
      x2.fillStyle = "#f4efe4"; x2.fillRect(0, 0, c.width, c.height);
      x2.font = "600 22px sans-serif"; x2.fillStyle = "#4a3f3d";
      imgs.forEach((im, i) => { x2.drawImage(/** @type {CanvasImageSource} */ (im), 110, i * 300); x2.fillText(rs[i][0], 8, i * 300 + 150); });
      return c.toDataURL("image/png");
    }, data);
    const f = path.join(OUT_DIR, "steel-sheet.png");
    fs.writeFileSync(f, Buffer.from(sheet.split(",")[1], "base64"));
    ctx.artifact(f);
    await g.close();
  },
};

if (isMain(import.meta.url)) runSteps([steel]);
