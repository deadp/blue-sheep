/**
 * Dev palette sheet for the v3 colour model. Writes packages/genetics/out/palette.html (and
 * palette.png with --png, via the probe's headless Chrome) and prints the breed table and the
 * colour-family distributions to stdout.
 *
 *   npx vite-node packages/genetics/scripts/palette.ts [--png] [--seed N]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BREED_IDS, BREEDS, colourInputFromPhenotype, createRng, fleeceFromPhenotype, HUE_FAMILIES, intensityBand,
  mate, observePhenotypes, sampleBreedFounder, sheep3 as S3, woolColour, woolType, WOOL_TYPE_LABEL,
  type BreedId, type ColourFamily, type Genome, type Rng, type WoolColour,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "..", "out");
const args = process.argv.slice(2);
const seedArg = args.indexOf("--seed");
const SEED = seedArg >= 0 ? Number(args[seedArg + 1]) : 1;
const species = S3.sheep3;

interface Sheep { g: Genome; ph: Record<string, string | number>; c: WoolColour }
const make = (g: Genome, rng: Rng): Sheep => {
  const ph = observePhenotypes(g, species, rng);
  // The farmer can't see a white sheep's pigment, but the palette is about the colour it shows.
  return { g, ph, c: woolColour(colourInputFromPhenotype(ph)) };
};

const FAMILY_ORDER: ColourFamily[] = ["white", "oatmeal", "taupe", "charcoal", "brown", ...HUE_FAMILIES];
const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const textOn = (c: WoolColour) => (c.hsl[2] > 0.6 ? "#222" : "#fff");

function swatch(c: WoolColour, label: string, size = 64): string {
  const spot = c.spotted ? `background-image:radial-gradient(circle at 30% 35%, #FAFAF7 0 18%, transparent 19%),radial-gradient(circle at 72% 70%, #FAFAF7 0 13%, transparent 14%);` : "";
  return `<div class="sw" style="width:${size}px;height:${size}px;background-color:${c.hex};${spot}color:${textOn(c)}" title="${esc(c.hex)}">${label}</div>`;
}

function familyCounts(list: WoolColour[], vividOnly = false): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of list) {
    const key = c.dilute && c.family !== "white" ? `${c.family}*` : c.family;
    if (vividOnly && c.intensity < 0.6) continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function distLine(list: WoolColour[]): string {
  const n = list.length;
  const fam: Record<string, number> = {};
  for (const c of list) fam[c.family] = (fam[c.family] ?? 0) + 1;
  const vivid = list.filter((c) => c.intensity >= 0.6 && c.family !== "white").length;
  const bright = list.filter((c) => c.intensity >= 0.3).length;
  const tb = list.filter((c) => c.trueBlue).length;
  return FAMILY_ORDER.filter((f) => fam[f]).map((f) => `${f} ${pct(fam[f]!, n)}`).join(", ")
    + ` | bright+ ${pct(bright, n)}, vivid ${pct(vivid, n)}, true blue ${pct(tb, n)}`;
}

let html = "";
const section = (title: string, body: string, note = "") =>
  (html += `<section><h2>${title}</h2>${note ? `<p class="note">${note}</p>` : ""}${body}</section>`);

// 1. The full dose cube, full and dilute, at average strength.
{
  let body = "";
  for (const dil of [false, true]) {
    body += `<h3>${dil ? "Dilute (d/d)" : "Full"} — strength 1.0; rows red 0→4, columns yellow 0→4, one block per blue dose</h3><div class="blocks">`;
    for (let b = 0; b <= 4; b++) {
      body += `<div class="block"><div class="bl">blue ${b}</div><div class="grid5">`;
      for (let r = 0; r <= 4; r++) for (let y = 0; y <= 4; y++) {
        const c = woolColour({ white: false, red: r, yellow: y, blue: b, dilute: dil, depth: 1 });
        body += swatch(c, `<b>${c.name}</b><br>${c.intensity.toFixed(2)}`, 58);
      }
      body += `</div></div>`;
    }
    body += `</div>`;
  }
  section("All 125 × 2 pigment mixes", body, "Label: family name (pastel name when dilute) and intensity. Mask-white shown for reference: " + swatch(woolColour({ white: true, red: 0, yellow: 0, blue: 0, dilute: false, depth: 1 }), "white", 40));
}

// 2. Strength ramps for the six hues.
{
  const ramps: [string, number, number, number][] = [
    ["red 3", 3, 0, 0], ["orange 2+2", 2, 2, 0], ["yellow 3", 0, 3, 0], ["green 2+2", 0, 2, 2], ["blue 3", 0, 0, 3], ["purple 2+2", 2, 0, 2], ["brown 3,3,2", 3, 3, 2],
  ];
  let body = `<table class="ramp"><tr><th></th>${[0.6, 0.8, 1.0, 1.2, 1.4].map((d) => `<th>×${d}</th>`).join("")}</tr>`;
  for (const [name, r, y, b] of ramps) {
    body += `<tr><th>${name}</th>`;
    for (const d of [0.6, 0.8, 1.0, 1.2, 1.4]) {
      const c = woolColour({ white: false, red: r, yellow: y, blue: b, dilute: false, depth: d });
      body += `<td>${swatch(c, `${c.name}<br>${c.intensity.toFixed(2)}`, 58)}</td>`;
    }
    body += `</tr>`;
  }
  section("Colour strength ramps", body + "</table>");
}

// 3. Founders per breed.
const rng = createRng(SEED);
const report: string[] = [];
{
  let body = `<table class="breeds"><tr><th>Breed</th><th>µm</th><th>staple</th><th>crimp</th><th>lustre</th><th>fleece</th><th>body</th><th>wool types</th><th>coloured</th></tr>`;
  const founderRows: string[] = [];
  report.push("Breed table (2000 founders each; target in brackets)");
  for (const id of BREED_IDS) {
    const b = BREEDS[id];
    const n = 2000;
    const flock = Array.from({ length: n }, () => make(sampleBreedFounder(id, rng), rng));
    const mean = (k: string) => flock.reduce((s, x) => s + (x.ph[k] as number), 0) / n;
    const types: Record<string, number> = {};
    for (const x of flock) { const t = woolType(fleeceFromPhenotype(x.ph)); types[t] = (types[t] ?? 0) + 1; }
    const typeStr = Object.entries(types).sort((a, c) => c[1] - a[1]).slice(0, 3).map(([t, k]) => `${WOOL_TYPE_LABEL[t as keyof typeof WOOL_TYPE_LABEL]} ${pct(k, n)}`).join(", ");
    const coloured = flock.filter((x) => x.c.family !== "white").length;
    const t = b.targets;
    const cells = [
      [mean("fineness"), t.fineness], [mean("staple"), t.staple], [mean("crimp"), t.crimp], [mean("lustre"), t.lustre],
      [mean("fleeceWeight"), t.fleeceWeight], [mean("size"), t.size],
    ] as const;
    body += `<tr><th>${b.name}</th>${cells.map(([v, tg]) => `<td>${v.toFixed(1)} <span class="t">(${tg})</span></td>`).join("")}<td>${typeStr}</td><td>${pct(coloured, n)}</td></tr>`;
    report.push(`  ${b.name.padEnd(11)} ${cells.map(([v, tg]) => `${v.toFixed(1)}(${tg})`.padEnd(12)).join("")} ${typeStr}; coloured ${pct(coloured, n)}`);
    report.push(`  ${"".padEnd(11)} families: ${distLine(flock.map((x) => x.c))}`);
    // Swatches: up to 120 coloured founders, sorted by family then intensity.
    const col = flock.filter((x) => x.c.family !== "white")
      .sort((a, c) => FAMILY_ORDER.indexOf(a.c.family) - FAMILY_ORDER.indexOf(c.c.family) || c.c.intensity - a.c.intensity)
      .slice(0, 400);
    const step = Math.max(1, Math.floor(col.length / 120));
    const shown = col.filter((_, i) => i % step === 0).slice(0, 120);
    founderRows.push(`<h3>${b.name}: ${pct(coloured, n)} coloured; ${shown.length} of ${coloured} coloured founders shown, by family then intensity</h3><div class="row">${shown.map((x) => swatch(x.c, "", 26)).join("")}</div>`);
  }
  section("Breeds: 2000 founders each", body + "</table>" + founderRows.join(""));
}

// 4. Selective breeding: how fast vivid colour arrives.
interface SimResult { gens: WoolColour[][] }
function selectionSim(breed: BreedId, score: (c: WoolColour) => number, runs: number, gens: number, simRng: Rng): SimResult {
  const out: WoolColour[][] = Array.from({ length: gens + 1 }, () => []);
  for (let run = 0; run < runs; run++) {
    // Starter rule (§2.2): ≥ 3 blue "+" alleles and ≥ 1 coloured sheep, no true blue yet.
    let flock: Sheep[];
    for (;;) {
      flock = Array.from({ length: 12 }, () => make(sampleBreedFounder(breed, simRng), simRng));
      const bluePlus = flock.reduce((n, x) => n + S3.pigmentDoses(x.g).blue, 0);
      if (bluePlus >= 3 && flock.some((x) => x.c.family !== "white") && !flock.some((x) => x.c.trueBlue)) break;
    }
    out[0]!.push(...flock.map((x) => x.c));
    for (let g = 1; g <= gens; g++) {
      // Keep the 8 best by what the farmer sees (whites score 0, random tie-break), breed 16 lambs.
      const ranked = flock.map((x) => ({ x, s: score(x.c) + simRng.next() * 1e-3 })).sort((a, b) => b.s - a.s).map((r) => r.x);
      const parents = ranked.slice(0, 8);
      const lambs: Sheep[] = [];
      for (let k = 0; k < 16; k++) {
        const d = parents[simRng.int(parents.length)]!;
        let s = parents[simRng.int(parents.length)]!;
        while (s === d) s = parents[simRng.int(parents.length)]!;
        lambs.push(make(mate(d.g, s.g, species.map, simRng, S3.SPORTS), simRng));
      }
      out[g]!.push(...lambs.map((x) => x.c));
      flock = [...parents, ...lambs];
    }
  }
  return { gens: out };
}
{
  const simRng = createRng(SEED + 99);
  const GENS = 5;
  const strategies: [string, (c: WoolColour) => number][] = [
    ["any vivid colour (select on intensity)", (c) => c.intensity],
    ["blue (select on blue minus the other two)", (c) => (c.family === "white" ? 0 : 1 + c.amounts.blue - Math.max(c.amounts.red, c.amounts.yellow) - (c.dilute ? 0.5 : 0))],
    ["red (select on red minus the other two)", (c) => (c.family === "white" ? 0 : 1 + c.amounts.red - Math.max(c.amounts.blue, c.amounts.yellow) - (c.dilute ? 0.5 : 0))],
  ];
  let body = "";
  report.push("", "Selective breeding, Farm flock of 12 (starter rule), keep best 8, 16 lambs a generation, 200 runs");
  for (const [name, score] of strategies) {
    const r = selectionSim("farm", score, 200, GENS, simRng);
    report.push(`  ${name}`);
    body += `<h3>${name}</h3><table class="sim"><tr><th>gen</th><th>families (lambs)</th><th>sample</th></tr>`;
    r.gens.forEach((list, g) => {
      report.push(`    gen ${g}: ${distLine(list)}`);
      const sample = list.filter((_, i) => i % Math.max(1, Math.floor(list.length / 48)) === 0).slice(0, 48)
        .sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) || b.intensity - a.intensity);
      body += `<tr><th>${g === 0 ? "founders" : g}</th><td class="d">${esc(distLine(list))}</td><td><div class="row">${sample.map((c) => swatch(c, "", 18)).join("")}</div></td></tr>`;
    });
    body += `</table>`;
  }
  section("Selective breeding sim", body, "Each generation keeps the 8 highest-scoring sheep by visible colour and breeds 16 lambs from them (mutation on). Distribution is over lambs of that generation (founders for gen 0).");
}

// 5. Family gallery: the best each family can look.
{
  let body = `<div class="blocks">`;
  for (const fam of FAMILY_ORDER) {
    const list: WoolColour[] = [];
    for (let r = 0; r <= 4; r++) for (let y = 0; y <= 4; y++) for (let b = 0; b <= 4; b++) for (const dil of [false, true]) for (const d of [0.8, 1.0, 1.2]) {
      const c = woolColour({ white: fam === "white", red: r, yellow: y, blue: b, dilute: dil, depth: d });
      if (c.family === fam && !list.some((x) => x.hex === c.hex)) list.push(c);
    }
    list.sort((a, b) => Number(a.dilute) - Number(b.dilute) || b.intensity - a.intensity);
    body += `<div class="block"><div class="bl">${fam} (${list.length})</div><div class="row" style="width:300px">${list.slice(0, 40).map((c) => swatch(c, intensityBand(c.intensity)[0]!.toUpperCase(), 28)).join("")}</div></div>`;
  }
  section("Every family (full then dilute, most intense first)", body + "</div>", "Letters: S soft, B bright, V vivid, N none.");
}

fs.mkdirSync(OUT, { recursive: true });
const page = `<!doctype html><meta charset="utf-8"><title>Blue Sheep v3 palette</title>
<style>
body{font:13px system-ui,sans-serif;background:#f3efe6;color:#222;margin:16px;width:1560px}
h2{margin:18px 0 6px;font-size:18px} h3{font-size:13px;margin:10px 0 4px;font-weight:600}
.note{color:#555;margin:2px 0 6px}
.sw{display:inline-flex;align-items:center;justify-content:center;text-align:center;font-size:10px;line-height:1.15;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);vertical-align:middle}
.blocks{display:flex;flex-wrap:wrap;gap:14px}.block{background:#fff;padding:6px;border-radius:8px}.bl{font-weight:600;margin-bottom:4px}
.grid5{display:grid;grid-template-columns:repeat(5,58px);gap:3px}
.row{display:flex;flex-wrap:wrap;gap:3px}
table{border-collapse:collapse;background:#fff}td,th{padding:3px 6px;text-align:left;vertical-align:middle}
.t{color:#999;font-size:11px}.d{font-size:11px;width:560px}
</style>
<h1>Blue Sheep v3 palette (seed ${SEED})</h1>${html}`;
const htmlPath = path.join(OUT, "palette.html");
fs.writeFileSync(htmlPath, page);
console.log(report.join("\n"));
console.log(`\nwrote ${htmlPath}`);

if (args.includes("--png")) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ executablePath: process.env.PROBE_CHROME ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  try {
    const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await p.goto(`file://${htmlPath}`);
    const pngPath = path.join(OUT, "palette.png");
    await p.screenshot({ path: pngPath, fullPage: true });
    // Also the cube alone, for a closer look.
    const first = await p.$("section");
    if (first) await first.screenshot({ path: path.join(OUT, "palette-cube.png") });
    console.log(`wrote ${pngPath}`);
  } finally {
    await browser.close();
  }
}
