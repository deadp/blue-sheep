// Style lab screenshots. Usage (repo root):
//   node packages/game/src/stylelab/shoot.mjs [dirs] [scenes]      e.g.  ... A,B farm,card
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
const dirs = process.argv[2] ? process.argv[2].split(",") : ALL_DIRS;
const scenes = process.argv[3] ? process.argv[3].split(",") : ALL_SCENES;
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

for (const d of dirs) for (const s of scenes) await shoot(d, s);

const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
async function compose(file, tiles, cols, title) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 400 } });
  const page = await ctx.newPage();
  const cells = tiles.map(([f, cap]) => `<figure><img src="${fs.existsSync(f) ? b64(f) : ""}"><figcaption>${cap}</figcaption></figure>`).join("");
  await page.setContent(`<style>
    body{margin:0;background:#2b2724;font:600 15px/1.2 sans-serif;color:#f4ecd8}
    h1{margin:0;padding:10px 14px;font-size:20px}
    .g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:0 6px 6px}
    figure{margin:0;position:relative}img{display:block;width:100%}
    figcaption{position:absolute;left:8px;bottom:8px;background:rgba(43,39,36,.8);padding:3px 8px;border-radius:4px}
  </style><h1>${title}</h1><div class="g">${cells}</div>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();
  console.log("wrote", path.relative(REPO_DIR, file));
}

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
