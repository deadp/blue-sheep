// Panels probe (CONTRACTS.md §7 step 5): deep-link every panel from CONTRACTS.md §5 and screenshot it.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";

/**
 * Panel name (the value of ?panel= and of body[data-panel]) and the act to fast-forward to so the
 * panel has content (?act=N). Keep in sync with CONTRACTS.md §5.
 * `shot` + `scrollTo` (a CSS selector) take an extra screenshot of a lower part of the panel.
 * `noUi` keeps an entry out of ui.mjs's layout sweep (the same panel is already swept; keeps that step short).
 * @type {{ name: string, act?: number, shot?: string, scrollTo?: string, noUi?: boolean }[]}
 */
export const PANELS = [
  { name: "title" },
  { name: "help" },
  { name: "sheep" },
  { name: "forecast" },
  { name: "forecast", act: 3, shot: "forecast-colour", noUi: true },
  { name: "sheep", act: 3, shot: "sheep-colour", noUi: true },
  { name: "board" },
  { name: "market" },
  { name: "market", act: 3, shot: "market-upgrades", scrollTo: "#overlay .mcard.upgrade" },
  { name: "market", act: 3, shot: "market-improvements", scrollTo: '#overlay [data-upgrade-card="paddock"]' },
  { name: "animal" },
  { name: "settings" },
  { name: "report" },
  { name: "orders", act: 1 },
  { name: "vet", act: 1 },
  { name: "codex", act: 1 },
  { name: "fair", act: 2 },
  { name: "tree", act: 3 },
  { name: "ending", act: 4 },
];

/** @type {import("./lib/harness.mjs").Step} */
export const panels = {
  name: "panels",
  async run(ctx) {
    /** @type {string[]} */
    const failures = [];
    for (const p of PANELS) {
      const g = await ctx.newPage();
      const query = `?seed=7&fresh=1&nomotion=1${p.act !== undefined ? `&act=${p.act}` : ""}&panel=${p.name}`;
      try {
        await g.boot(query);
        await g.waitPanel(p.name);
        await g.page.waitForTimeout(150); // let panel images (portraits) decode
        if (p.scrollTo) {
          const sel = p.scrollTo;
          const found = await g.page.evaluate((q) => { const el = document.querySelector(q); el?.scrollIntoView({ block: "start" }); return !!el; }, sel);
          if (!found) throw new ProbeError(`${sel} not found`);
          await g.page.waitForTimeout(100);
        }
        if (p.name === "forecast") await assertSwatches(g, query);
        ctx.artifact(await g.screenshot(`panel-${p.shot ?? p.name}`));
        g.assertNoErrors(`on ${query}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/controller not ready/.test(msg)) throw e;
        failures.push(`${p.shot ?? p.name}: ${msg.split("\n")[0]}`);
        ctx.artifact(await g.screenshot(`panel-${p.shot ?? p.name}-FAILED`).catch(() => ""));
      } finally {
        await g.close();
      }
    }
    if (failures.length) throw new ProbeError(`${failures.length}/${PANELS.length} panels failed:\n    ${failures.join("\n    ")}`);
  },
};

/**
 * Rule (DESIGN-v3 §2.3): the forecast shows exactly ten lamb swatches, each tinted with a valid wool hex, and
 * they are the forecast's own classes: the ten are the core's largest-remainder litter of the pair's colour
 * classes (compared by class key and count), so the picture matches the numbers behind it.
 * @param {import("./lib/browser.mjs").GamePage} g @param {string} where
 */
export async function assertSwatches(g, where) {
  const bad = await g.page.evaluate(() => {
    const tiles = [...document.querySelectorAll("#overlay .forecast .litter .lamb-tile")].map((t) => /** @type {HTMLElement} */ (t).dataset);
    const out = [];
    if (tiles.length !== 10) out.push(`${tiles.length} swatches, not 10`);
    const badHex = tiles.filter((d) => !/^#[0-9A-F]{6}$/i.test(d.wool ?? ""));
    if (badHex.length) out.push(`${badHex.length} swatch(es) without a valid hex`);
    const plan = document.querySelector("#overlay [data-plan]")?.getAttribute("data-plan") ?? "";
    const [ewe, ram] = plan.split(":");
    if (ewe && ram) {
      const f = /** @type {any} */ (window).__game.forecast.cross(ewe, ram);
      const sw = [...f.swatches].filter((w) => w.p > 0);
      // largest remainder, as core litterOf
      const counts = sw.map((w) => ({ w, n: Math.floor(w.p * 10 + 1e-9), frac: w.p * 10 - Math.floor(w.p * 10 + 1e-9) }));
      let left = 10 - counts.reduce((a, b) => a + b.n, 0);
      for (const e of [...counts].sort((a, b) => b.frac - a.frac || b.w.p - a.w.p)) { if (left <= 0) break; e.n++; left--; }
      const want = counts.filter((c) => c.n > 0).map((c) => `${c.w.key}×${c.n}`).sort().join(",");
      const got = new Map();
      for (const d of tiles) got.set(d.key, (got.get(d.key) ?? 0) + 1);
      const have = [...got].map(([k, n]) => `${k}×${n}`).sort().join(",");
      if (want !== have) out.push(`swatches ${have} don't match the forecast's litter ${want}`);
      const sum = sw.reduce((a, w) => a + w.p, 0);
      if (Math.abs(sum - 1) > 1e-4) out.push(`class chances sum to ${sum}`);
    }
    return out.join("; ");
  });
  if (bad) throw new ProbeError(`${where}: ${bad}`);
}

if (isMain(import.meta.url)) runSteps([panels]);
