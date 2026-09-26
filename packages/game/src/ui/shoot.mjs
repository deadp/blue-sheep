// Screenshot the UI dev preview. Usage: node packages/game/src/ui/shoot.mjs [baseUrl]
// Expects `npx vite --port 5197 packages/game` running. Writes PNGs to src/ui/shots/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "shots");
fs.mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? "http://127.0.0.1:5197";
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;

const SHOTS = [
  ["hud-fresh", "fx=fresh&single=1"],
  ["hud-act3", "fx=act3&single=1"],
  ["title", "fx=fresh&panel=title"],
  ["help", "fx=fresh&panel=help"],
  ["sheep", "fx=afterFirst&panel=sheep&sheep=s3"],
  ["sheep-lamb-act3", "fx=act3&panel=sheep&sheep=young"],
  ["forecast-fresh", "fx=fresh&panel=forecast"],
  ["forecast-act1", "fx=afterFirst&panel=forecast&sheep=s3"],
  ["forecast-act2", "fx=act2&panel=forecast"],
  ["forecast-visitor", "fx=act3&panel=forecast&goal=learn"],
  ["board", "fx=midAct1&panel=board"],
  ["orders", "fx=midAct1&panel=orders"],
  ["market", "fx=act3&panel=market"],
  ["vet", "fx=afterFirst&panel=vet"],
  ["fair", "fx=act2&panel=fair"],
  ["codex", "fx=act4&panel=codex"],
  ["tree", "fx=act3&panel=tree&sheep=young"],
  ["tree-founder", "fx=act3&panel=tree"],
  ["report-first", "fx=afterFirst&panel=report"],
  ["report-act2", "fx=act2&panel=report"],
  ["ending", "fx=act4&panel=ending"],
  ["settings", "fx=fresh&panel=settings&tab=confirm-new"],
];
const SMALL = ["forecast-act2", "report-first", "hud-act3", "hud-fresh", "sheep", "market", "orders"];

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const errors = [];
async function shoot(name, q, viewport) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
  await page.goto(`${base}/ui-dev.html?${q}`);
  await page.waitForSelector("body[data-ready]", { timeout: 60_000 });
  await page.waitForTimeout(150);
  const file = path.join(out, `${name}${viewport.width === 1280 ? "" : `-${viewport.width}`}.png`);
  await page.screenshot({ path: file });
  await ctx.close();
  console.log("wrote", path.relative(process.cwd(), file));
}
for (const [name, q] of SHOTS) if (!only || only.test(name)) await shoot(name, q, { width: 1280, height: 800 });
for (const [name, q] of SHOTS) if (SMALL.includes(name) && (!only || only.test(name))) await shoot(name, q, { width: 1024, height: 640 });
if (!only) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/ui-dev.html?fx=act2`);
  await page.waitForSelector("body[data-ready]", { timeout: 60_000 });
  await page.screenshot({ path: path.join(out, "gallery-act2.png"), fullPage: true });
  await ctx.close();
}
await browser.close();
if (errors.length) { console.error("ERRORS:\n" + errors.join("\n")); process.exit(1); }
