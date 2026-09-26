// Panels probe (CONTRACTS.md §7 step 5): deep-link every panel from CONTRACTS.md §5 and screenshot it.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";

/**
 * Panel name (the value of ?panel= and of body[data-panel]) and the act to fast-forward to so the
 * panel has content (?act=N). Keep in sync with CONTRACTS.md §5.
 * @type {{ name: string, act?: number }[]}
 */
export const PANELS = [
  { name: "title" },
  { name: "help" },
  { name: "sheep" },
  { name: "forecast" },
  { name: "board" },
  { name: "market" },
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
        ctx.artifact(await g.screenshot(`panel-${p.name}`));
        g.assertNoErrors(`on ${query}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/controller not ready/.test(msg)) throw e;
        failures.push(`${p.name}: ${msg.split("\n")[0]}`);
        ctx.artifact(await g.screenshot(`panel-${p.name}-FAILED`).catch(() => ""));
      } finally {
        await g.close();
      }
    }
    if (failures.length) throw new ProbeError(`${failures.length}/${PANELS.length} panels failed:\n    ${failures.join("\n    ")}`);
  },
};

if (isMain(import.meta.url)) runSteps([panels]);
