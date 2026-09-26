// Panels probe (CONTRACTS.md §7 step 5): deep-link every panel from CONTRACTS.md §5 and screenshot it.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";

/**
 * Panel name (the value of ?panel= and of body[data-panel]) and the act to fast-forward to so the
 * panel has content (?act=N). Keep in sync with CONTRACTS.md §5.
 * `shot` + `scrollTo` (a CSS selector) take an extra screenshot of a lower part of the panel.
 * @type {{ name: string, act?: number, shot?: string, scrollTo?: string }[]}
 */
export const PANELS = [
  { name: "title" },
  { name: "help" },
  { name: "sheep" },
  { name: "forecast" },
  { name: "board" },
  { name: "market" },
  { name: "market", act: 3, shot: "market-upgrades", scrollTo: "#overlay .mcard.upgrade" },
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

if (isMain(import.meta.url)) runSteps([panels]);
