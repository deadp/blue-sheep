// Before/after sheet for the felt UI foundation: pairs of screenshots side by side, one row each.
//   node packages/game/probe/ui-sheet.mjs <beforeDir> [afterDir] [out.png]
// beforeDir holds the old `out/ui/*.png` (from `UI_PROBE_LENIENT=1 node probe/run.mjs ui` on the old
// build); afterDir defaults to probe/out/ui. Writes probe/out/ui-before-after.png.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { CHROME, OUT_DIR } from "./lib/paths.mjs";

const [before, after = path.join(OUT_DIR, "ui"), out = path.join(OUT_DIR, "ui-before-after.png")] = process.argv.slice(2);
if (!before) { console.error("usage: ui-sheet.mjs <beforeDir> [afterDir] [out.png]"); process.exit(2); }
const ROWS = [["HUD", "hud-act3-1024"], ["Sheep card", "sheep-1280"], ["Forecast", "forecast-act2-1280"], ["Report", "report-act2-1280"], ["Market", "market-1280"], ["Vet", "vet-1280"]];
const words = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, "words.json"), "utf8")); } catch { return {}; } };
const wb = words(before), wa = words(after);
const img = (dir, n) => `data:image/png;base64,${fs.readFileSync(path.join(dir, `${n}.png`)).toString("base64")}`;
const count = (w, n) => (n.startsWith("hud") ? w[n]?.hudWords : w[n]?.panelWords) ?? "?";
const rows = ROWS.map(([label, n]) => `<tr><th>${label}<small>${n}</small></th>
  <td><img src="${img(before, n)}"><span>before · ${count(wb, n)} words</span></td>
  <td><img src="${img(after, n)}"><span>after · ${count(wa, n)} words</span></td></tr>`).join("");
const html = `<html><body style="margin:0;background:#2b2826;font:15px system-ui;color:#f3ede4">
<h1 style="margin:0;padding:14px 18px;font-size:22px">Felt UI foundation: before / after (visible words, closed "more" folds not counted)</h1>
<table style="border-spacing:10px">${rows}</table>
<style>th{width:120px;text-align:left;vertical-align:top;font-size:18px}th small{display:block;opacity:.6;font-size:11px}td{position:relative}img{width:900px;display:block;border-radius:6px}
span{position:absolute;left:10px;bottom:10px;background:#000a;padding:4px 10px;border-radius:6px;font-weight:700}</style></body></html>`;
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1980, height: 800 } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
