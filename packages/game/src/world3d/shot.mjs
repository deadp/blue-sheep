// Screenshot evidence for the 3D world.
// Usage (from repo root): node packages/game/src/world3d/shot.mjs
// Starts Vite on :5199, opens /world-dev.html in headless Chrome (swiftshader),
// captures console errors, writes PNGs into packages/game/src/world3d/shots/.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const out = resolve(here, "shots");
mkdirSync(out, { recursive: true });
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/world-dev.html`;

const server = spawn("npx", ["vite", "--host", "--port", String(PORT), "--strictPort", "packages/game"], {
  cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true,
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const kill = () => { try { process.kill(-server.pid, "SIGTERM"); } catch { /* gone */ } };
process.on("exit", kill);

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("vite did not start:\n" + serverLog);
}

const errors = [];
let failed = false;
try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

  const shoot = async (name, params, after) => {
    await page.goto(`${BASE}?${params}`);
    await page.waitForSelector("body[data-ready='1']", { timeout: 30000 });
    if (after) await after();
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(out, `${name}.png`) });
    console.log("shot", name);
  };

  const names = ["spring", "summer", "autumn", "winter"];
  for (let s = 0; s < 4; s++) await shoot(`season-${s}-${names[s]}`, `season=${s}&nomotion=1`);
  await shoot("night", "season=1&nomotion=1&night=1&noui=1");
  await shoot("closed-meadow-nofair", "season=0&nomotion=1&p2=0&fair=0&visitor=0&noui=1");
  await shoot("zoom-paddock", "season=0&nomotion=1&noui=1", async () => {
    await page.mouse.move(700, 380);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -200);
  });
  await shoot("zoom-market", "season=2&nomotion=1&noui=1", async () => {
    await page.evaluate(() => window.__world.focus("market"));
    await page.mouse.move(640, 400);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -200);
  });
  await shoot("hover-house", "season=0&nomotion=1", async () => {
    await page.mouse.move(575, 175);
    await page.waitForTimeout(150);
    const label = await page.evaluate(() => { const l = document.querySelector(".w3d-label"); return l && l.style.display !== "none" ? l.textContent : null; });
    if (label !== "Farmhouse · sleep") throw new Error("house hover label missing, got " + label);
    await page.mouse.down(); await page.mouse.up();
    const info = await page.textContent("#info");
    if (!info?.includes("clicked hotspot house")) throw new Error("house click not delivered: " + info);
  });
  // interaction smoke test with motion on: add/remove sheep, season cycle, sleep/dawn resolve
  await page.goto(`${BASE}?season=0`);
  await page.waitForSelector("body[data-ready='1']");
  for (const b of ["Add lamb", "Add lamb", "Remove one", "Season ▸", "Paddock 2", "Fair day", "Visitor", "Celebrate"]) {
    await page.click(`#bar button:text-is("${b}")`);
    await page.waitForTimeout(120);
  }
  const t0 = Date.now();
  await page.evaluate(() => window.__world.sleepTransition());
  const tSleep = Date.now() - t0;
  await page.screenshot({ path: resolve(out, "sleep-dark.png") });
  await page.evaluate(() => window.__world.dawn());
  console.log(`sleepTransition resolved after ${tSleep} ms`);
  // perf with 40 sheep, animated
  await page.goto(`${BASE}?season=1&n=25&noui=0`);
  await page.waitForSelector("body[data-ready='1']");
  await page.waitForTimeout(500);
  const perf = await page.evaluate(async () => {
    let frames = 0;
    const t0 = performance.now();
    await new Promise((res) => { const f = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return { fps: frames / ((performance.now() - t0) / 1000), stats: window.__world.debugStats(), portraitMs: window.__portraitMs };
  });
  await page.evaluate(() => window.__world.celebrate("s4"));
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(out, "animated-40-celebrate.png") });
  console.log("perf (swiftshader, not representative of a GPU):", JSON.stringify(perf));
  await browser.close();
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  kill();
}
console.log(errors.length ? `console errors/warnings (${errors.length}):\n${errors.join("\n")}` : "no console errors");
process.exit(failed || errors.some((e) => !e.startsWith("[warning]")) ? 1 : 0);
