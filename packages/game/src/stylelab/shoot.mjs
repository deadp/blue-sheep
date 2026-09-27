// Style lab screenshots. Usage (repo root):
//   node packages/game/src/stylelab/shoot.mjs [dirs] [scenes]      e.g.  ... A,B farm,card
//   node packages/game/src/stylelab/shoot.mjs r2 [maps|ui|sheep|<shot names>]   (round 2 → shots/r2/)
//   node packages/game/src/stylelab/shoot.mjs r3 [1,2,3,4] [play,woolshed,expand,mid,motion,faces]   (round 3 → shots/r3/)
// Starts Vite on a free port, shoots style-lab.html?dir=X&scene=Y at 1280×800 in headless Chrome
// (probe launch args), writes shots/{X}-{scene}.png, a 2×3 contact sheet per direction
// ({X}-sheet.png) and all-farms.png, then stops Vite.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { CHROME_ARGS } from "../../probe/lib/browser.mjs";
import { CHROME, GAME_DIR, REPO_DIR } from "../../probe/lib/paths.mjs";
import { onCleanup, cleanupAll } from "../../probe/lib/cleanup.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "shots");
fs.mkdirSync(OUT, { recursive: true });
const ALL_DIRS = ["A", "B", "C", "D"];
const ALL_SCENES = ["farm", "hud", "card", "forecast", "sheep", "label"];
const R2 = process.argv[2] === "r2";
const R3 = process.argv[2] === "r3";
const dirs = !R2 && !R3 && process.argv[2] ? process.argv[2].split(",") : ALL_DIRS;
const scenes = !R2 && !R3 && process.argv[3] ? process.argv[3].split(",") : ALL_SCENES;
const RESERVED = new Set([4173, 4174, 5198]);

async function freePort() {
  for (;;) {
    const port = await new Promise((resolve, reject) => {
      const s = net.createServer();
      s.once("error", reject);
      s.listen(0, "127.0.0.1", () => { const p = /** @type {net.AddressInfo} */ (s.address()).port; s.close(() => resolve(p)); });
    });
    if (!RESERVED.has(port)) return port;
  }
}

async function startVite() {
  const port = await freePort();
  const bin = path.join(REPO_DIR, "node_modules", ".bin", "vite");
  const child = spawn(bin, ["--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: GAME_DIR, stdio: ["ignore", "pipe", "pipe"], detached: false });
  onCleanup(() => { if (child.exitCode === null) child.kill("SIGTERM"); });
  let log = "";
  child.stdout.on("data", (d) => { log += d; });
  child.stderr.on("data", (d) => { log += d; });
  const url = `http://127.0.0.1:${port}`;
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`vite exited:\n${log}`);
    try { const r = await fetch(`${url}/style-lab.html`); if (r.ok) return { url, child }; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite did not start:\n${log}`);
}

const errors = [];
const { url } = await startVite();
console.log("vite at", url);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
onCleanup(() => browser.close());

async function shoot(dir, scene) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${dir}-${scene}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${dir}-${scene}: ${m.text()}`); });
  await page.goto(`${url}/style-lab.html?dir=${dir}&scene=${scene}`);
  await page.waitForSelector('body[data-ready="1"]', { state: "attached", timeout: 120_000 });
  await page.waitForTimeout(250);
  const file = path.join(OUT, `${dir}-${scene}.png`);
  await page.screenshot({ path: file });
  await ctx.close();
  console.log("wrote", path.relative(REPO_DIR, file));
}


// ---------------------------------------------------------------- round 2 (DESIGN-v3 §15 item 20)

const OUT2 = path.join(OUT, "r2");
const CONCEPTS = { a: "a. River valley", b: "b. Rolling downs", c: "c. High-country station", d: "d. Coastal valley" };
const STAGES = ["start", "mid", "late"];
const VARIANTS = { i: "i. Felted wool", ii: "ii. Chunky knit", iii: "iii. Woven tweed" };
const SCREENS = ["hud", "card", "forecast", "woolshed"];

async function shoot2(name, query, size = { width: 1280, height: 800 }) {
  fs.mkdirSync(OUT2, { recursive: true });
  const ctx = await browser.newContext({ viewport: size });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
  await page.goto(`${url}/style-lab-r2.html?${query}`);
  await page.waitForSelector('body[data-ready="1"]', { state: "attached", timeout: 180_000 });
  await page.waitForTimeout(300);
  const file = path.join(OUT2, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();
  console.log("wrote", path.relative(REPO_DIR, file));
  return file;
}

async function round2(what) {
  const want = (group, name) => what.includes(group) || what.includes(name);
  const mapTiles = [];
  for (const c of Object.keys(CONCEPTS)) for (const st of STAGES) {
    const name = `map-${c}-${st}`;
    if (want("maps", name)) await shoot2(name, `scene=map&concept=${c}&stage=${st}`);
    mapTiles.push([path.join(OUT2, `${name}.png`), `${CONCEPTS[c]} · ${st}`]);
  }
  if (what.includes("maps")) await compose(path.join(OUT2, "maps-sheet.png"), mapTiles, 3, "Round 2 map concepts: how the farm grows (start · mid · late)", 1920, true);
  for (const v of Object.keys(VARIANTS)) {
    const tiles = [];
    for (const s of SCREENS) {
      const name = `ui-${v}-${s}`;
      if (want("ui", name)) await shoot2(name, `scene=ui&variant=${v}&screen=${s}`);
      tiles.push([path.join(OUT2, `${name}.png`), s]);
    }
    if (what.includes("ui")) await compose(path.join(OUT2, `ui-sheet-${v}.png`), tiles, 2, `Felt & fibre UI: ${VARIANTS[v]}`);
  }
  if (want("sheep", "sheep-compare")) await shoot2("sheep-compare", "scene=sheep", { width: 1280, height: 900 });
}

const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
async function compose(file, tiles, cols, title, width = 1280, capTop = false) {
  const ctx = await browser.newContext({ viewport: { width, height: 400 } });
  const page = await ctx.newPage();
  const cells = tiles.map(([f, cap]) => `<figure><img src="${fs.existsSync(f) ? b64(f) : ""}"><figcaption>${cap}</figcaption></figure>`).join("");
  await page.setContent(`<style>
    body{margin:0;background:#2b2724;font:600 15px/1.2 sans-serif;color:#f4ecd8}
    h1{margin:0;padding:10px 14px;font-size:20px}
    .g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:0 6px 6px}
    figure{margin:0;position:relative}img{display:block;width:100%}
    figcaption{position:absolute;left:8px;${capTop ? "top:8px" : "bottom:8px"};background:rgba(43,39,36,.8);padding:3px 8px;border-radius:4px}
  </style><h1>${title}</h1><div class="g">${cells}</div>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();
  console.log("wrote", path.relative(REPO_DIR, file));
}


// ---------------------------------------------------------------- round 3 (DESIGN-v3 §15 item 21)

const OUT3 = path.join(OUT, "r3");
const VIEW_NAMES = { 1: "1. Close isometric · pan & zoom", 2: "2. Side-on valley · parallax", 3: "3. Paddock scenes · travel", 4: "4. Farmer's-eye · third person" };
const SHOTS3 = ["play", "woolshed", "expand", "mid"];
const SHOT_CAP = { play: "a. play moment · home paddock", woolshed: "b. woolshed stations", expand: "c. expansion moment", mid: "d. mid-game · 2–3 open areas" };

async function round3(views, what) {
  fs.mkdirSync(path.join(OUT3, "frames"), { recursive: true });
  const want = (s) => what.includes(s);
  for (const v of views) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`view-${v}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`view-${v}: ${m.text()}`); });
    const t0 = Date.now();
    await page.goto(`${url}/style-lab-r3.html?view=${v}&shot=play`);
    await page.waitForSelector('body[data-ready="1"]', { state: "attached", timeout: 300_000 });
    console.log(`view ${v} ready in ${Date.now() - t0} ms`);
    const show = async (shot, frame = 0) => {
      await page.evaluate(([s, f]) => window.__show(s, f), [shot, frame]);
      await page.waitForSelector('body[data-ready="1"]', { state: "attached", timeout: 300_000 });
      await page.waitForTimeout(120);
    };
    for (const shot of SHOTS3) {
      if (!want(shot)) continue;
      await show(shot);
      const file = path.join(OUT3, `view-${v}-${shot}.png`);
      await page.screenshot({ path: file });
      console.log("wrote", path.relative(REPO_DIR, file));
    }
    if (want("motion")) {
      const frames = [];
      for (let f = 0; f < 6; f++) {
        await show("motion", f);
        const file = path.join(OUT3, "frames", `view-${v}-motion-${f}.png`);
        await page.screenshot({ path: file });
        frames.push([file, `frame ${f + 1} · ${f * 250} ms`]);
      }
      await compose(path.join(OUT3, `view-${v}-motion.png`), frames, 3, `${VIEW_NAMES[v]} · camera motion (6 frames, 250 ms apart)`, 1920);
    }
    await ctx.close();
    await compose3(v);
  }
  if (views.length === 4) await compose(path.join(OUT3, "views-compare.png"), [1, 2, 3, 4].map((v) => [path.join(OUT3, `view-${v}-play.png`), VIEW_NAMES[v]]), 2, "Round 3: the same play moment in four camera options", 1920, true);
  if (want("faces")) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 460 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`faces: ${e.message}`));
    await page.goto(`${url}/style-lab-r3.html?scene=faces`);
    await page.waitForSelector('body[data-ready="1"]', { state: "attached", timeout: 120_000 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT3, "sheep-faces.png"), fullPage: true });
    await ctx.close();
    console.log("wrote sheep-faces.png");
  }
}

/** Per-option contact sheet: the four moments 2×2 with the motion strip underneath. */
async function compose3(v) {
  const tiles = SHOTS3.map((s) => [path.join(OUT3, `view-${v}-${s}.png`), SHOT_CAP[s]]);
  const motion = path.join(OUT3, `view-${v}-motion.png`);
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 400 } });
  const page = await ctx.newPage();
  const cells = tiles.map(([f, cap]) => `<figure><img src="${fs.existsSync(f) ? b64(f) : ""}"><figcaption>${cap}</figcaption></figure>`).join("");
  await page.setContent(`<style>
    body{margin:0;background:#2b2724;font:600 17px/1.2 sans-serif;color:#f4ecd8}
    h1{margin:0;padding:12px 16px;font-size:24px}
    .g{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 6px 6px}
    figure{margin:0;position:relative}img{display:block;width:100%}
    figcaption{position:absolute;left:10px;top:10px;background:rgba(43,39,36,.82);padding:4px 10px;border-radius:5px}
    .m{padding:0 6px 6px}
  </style><h1>${VIEW_NAMES[v]}</h1><div class="g">${cells}</div>${fs.existsSync(motion) ? `<div class="m"><img src="${b64(motion)}"></div>` : ""}`);
  await page.waitForTimeout(200);
  const file = path.join(OUT3, `view-${v}-sheet.png`);
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();
  console.log("wrote", path.relative(REPO_DIR, file));
}

if (R3) {
  const views = process.argv[3] ? process.argv[3].split(",").map(Number) : [1, 2, 3, 4];
  await round3(views, process.argv[4] ? process.argv[4].split(",") : [...SHOTS3, "motion", "faces"]);
  await cleanupAll();
  if (errors.length) { console.error("ERRORS:\n" + errors.join("\n")); process.exit(1); }
  process.exit(0);
}

if (R2) {
  await round2(process.argv[3] ? process.argv[3].split(",") : ["maps", "ui", "sheep"]);
  await cleanupAll();
  if (errors.length) { console.error("ERRORS:\n" + errors.join("\n")); process.exit(1); }
  process.exit(0);
}
for (const d of dirs) for (const s of scenes) await shoot(d, s);

const NAMES = { A: "A. Farm Diary", B: "B. Woolshed Woodcut", C: "C. Misty Pastoral", D: "D. Toybox Diorama" };
if (scenes.length === ALL_SCENES.length) {
  for (const d of dirs) {
    await compose(path.join(OUT, `${d}-sheet.png`), ["label", "farm", "hud", "card", "forecast", "sheep"].map((s) => [path.join(OUT, `${d}-${s}.png`), s]), 2, NAMES[d]);
  }
}
if (dirs.length === 4 && scenes.includes("farm")) {
  await compose(path.join(OUT, "all-farms.png"), ALL_DIRS.map((d) => [path.join(OUT, `${d}-farm.png`), NAMES[d]]), 2, "Farm overview: four directions");
}
await cleanupAll();
if (errors.length) { console.error("ERRORS:\n" + errors.join("\n")); process.exit(1); }
process.exit(0);
