// Before/after sheet for the world dressing pass (DESIGN-v3 §15 item 27): the six dressing views side by side,
// with draw calls and triangles under each.
//   node packages/game/probe/dressing-sheet.mjs <beforeDir> [afterDir] [out.png]
// beforeDir holds an older `out/dressing/` (run `DRESS_BEFORE=1 node probe/dressing.mjs` on the old build and copy
// the folder somewhere outside out/, which every probe run clears); afterDir defaults to probe/out/dressing.
// Writes probe/out/dressing-before-after.png.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { CHROME, OUT_DIR } from "./lib/paths.mjs";

const [before, after = path.join(OUT_DIR, "dressing"), out = path.join(OUT_DIR, "dressing-before-after.png")] = process.argv.slice(2);
if (!before) { console.error("usage: dressing-sheet.mjs <beforeDir> [afterDir] [out.png]"); process.exit(2); }
const ROWS = [
  ["Boot · walk view", "1-boot-walk"], ["Home paddock · flock", "2-home-flock"], ["Woolshed", "3-woolshed"],
  ["Creek · bush edge", "4-creek-bush"], ["Winter", "5-winter"], ["Pan · overview", "6-pan-overview"],
];
const perf = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, "perf.json"), "utf8")); } catch { return {}; } };
const pb = perf(before), pa = perf(after);
const img = (dir, n) => `data:image/png;base64,${fs.readFileSync(path.join(dir, `${n}.png`)).toString("base64")}`;
const stat = (p, n) => {
  const f = p[n], l = p[`${n}-lite`];
  const k = (x) => (x ? `${x.calls} calls · ${Math.round(x.tris / 1000)}k tris` : "?");
  return `full ${k(f)} &nbsp;|&nbsp; lite ${k(l)}`;
};
const rows = ROWS.map(([label, n]) => `<tr><th>${label}</th>
  <td><img src="${img(before, n)}"><span>before · ${stat(pb, n)}</span></td>
  <td><img src="${img(after, n)}"><span>after · ${stat(pa, n)}</span></td></tr>`).join("");
const html = `<html><body style="margin:0;background:#2b2826;font:15px system-ui;color:#f3ede4">
<h1 style="margin:0;padding:14px 18px;font-size:22px">World dressing pass: before / after (1280×800, headless software GL; draw calls and triangles include the shadow pass)</h1>
<table style="border-spacing:10px">${rows}</table>
<style>th{width:110px;text-align:left;vertical-align:top;font-size:18px}td{position:relative}img{width:900px;display:block;border-radius:6px}
span{position:absolute;left:10px;bottom:10px;background:#000b;padding:4px 10px;border-radius:6px;font-weight:700;font-size:14px}</style></body></html>`;
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1980, height: 800 } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
