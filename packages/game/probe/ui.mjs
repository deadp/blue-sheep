// UI probe: every panel, the HUD (and its bag tray) at 1280×800 and 1024×768.
// Rules checked (the felt UI foundation, DESIGN-v3 §15 items 16, 21, 25):
//  - the HUD's pieces never overlap each other at either size (season, coins, flock, goal tag, bag, next season);
//  - every visible button in the HUD, the tray and each panel is at least 36 px in both directions (hit target);
//  - every panel fits the viewport (its frame is on screen; long content scrolls inside it);
//  - no genotype strings and (before the numbers unlock) no "%" in any visible panel text.
// Screenshots: out/ui/<panel>-<w>.png, out/ui/hud-*.png; word counts: out/ui/words.json (visible words only:
// what a player reads before opening any "more").
import fs from "node:fs";
import path from "node:path";
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";
import { OUT_DIR } from "./lib/paths.mjs";
import { PANELS } from "./panels.mjs";

export const SIZES = [{ width: 1280, height: 800 }, { width: 1024, height: 768 }];
const MIN_HIT = 36;
const GENOTYPE = /\b[A-Za-z]{1,2}\/[A-Za-z]{1,2}\b/;

/** Extra views beyond PANELS: the HUD at several points of the story, a mid-game forecast. */
const EXTRA = [
  { name: "forecast", act: 2, shot: "forecast-act2" },
  { name: "sheep", act: 3, shot: "sheep-act3" },
  { name: "report", act: 2, shot: "report-act2" },
];

/** @param {import("playwright").Page} page */
function measure(page) {
  return page.evaluate(([MIN, GENO]) => {
    const vis = (/** @type {Element} */ el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
      // inside a closed <details> (other than its summary) = not visible
      const d = el.closest("details");
      if (d && !d.open && !el.closest("summary")) return false;
      return true;
    };
    const words = (/** @type {Element | null} */ el) => (el && vis(el) ? (/** @type {HTMLElement} */ (el)).innerText.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0);
    const panel = document.querySelector("#overlay .panel");
    const small = [];
    for (const b of document.querySelectorAll("#hud button, #overlay button, #overlay summary, #mentor button")) {
      if (!vis(b)) continue;
      const r = b.getBoundingClientRect();
      // off screen inside a scroller: skip (it is measured when scrolled to)
      if (r.bottom < 0 || r.top > innerHeight) continue;
      if (r.width < MIN - 0.5 || r.height < MIN - 0.5) small.push(`${b.tagName.toLowerCase()}.${String(b.className).trim().replace(/\s+/g, ".")} "${(b.textContent ?? "").trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    const pieces = [...document.querySelectorAll("#hud [data-hud-piece]")].filter(vis).map((el) => ({ name: /** @type {HTMLElement} */ (el).dataset.hudPiece, r: el.getBoundingClientRect() }));
    const overlaps = [];
    for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i].r, b = pieces[j].r;
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps.push(`${pieces[i].name} × ${pieces[j].name}`);
    }
    const pr = panel?.getBoundingClientRect();
    const offscreen = pr ? (pr.left < -1 || pr.top < -1 || pr.right > innerWidth + 1 || pr.bottom > innerHeight + 1) : false;
    const text = panel && vis(panel) ? /** @type {HTMLElement} */ (panel).innerText : "";
    const g = text.match(new RegExp(GENO));
    return {
      panelWords: words(panel), hudWords: words(document.querySelector("#hud")), mentorWords: words(document.querySelector("#mentor")),
      small, overlaps, offscreen, genotype: g ? g[0] : "", percent: text.includes("%"),
      numbers: !!(/** @type {any} */ (window).__game?.state()?.unlocks ?? []).includes?.("numbers"),
    };
  }, [MIN_HIT, GENOTYPE.source]);
}

/** @type {import("./lib/harness.mjs").Step} */
export const ui = {
  name: "ui",
  async run(ctx) {
    const dir = path.join(OUT_DIR, "ui");
    fs.mkdirSync(dir, { recursive: true });
    /** @type {Record<string, any>} */
    const report = {};
    const failures = [];
    const g = await ctx.newPage();
    const shot = async (/** @type {string} */ name) => { const f = path.join(dir, `${name}.png`); await g.page.screenshot({ path: f }); return f; };
    const check = (/** @type {string} */ where, /** @type {any} */ m, hud = false) => {
      if (m.small.length) failures.push(`${where}: hit targets under ${MIN_HIT}px: ${m.small.slice(0, 4).join("; ")}`);
      if (m.offscreen) failures.push(`${where}: the panel runs off screen`);
      if (m.genotype) failures.push(`${where}: genotype-like text "${m.genotype}"`);
      if (m.percent && !m.numbers) failures.push(`${where}: "%" before the numbers unlock`);
      if (hud && m.overlaps.length) failures.push(`${where}: HUD pieces overlap: ${m.overlaps.join(", ")}`);
    };
    for (const size of SIZES) {
      await g.page.setViewportSize(size);
      const w = size.width;
      // ---- the HUD alone, early and late, with the bag tray closed and open
      for (const [label, q] of [["fresh", "?seed=7&fresh=1&nomotion=1"], ["act3", "?seed=7&fresh=1&nomotion=1&act=3"]]) {
        await g.boot(q);
        await g.act({ type: "close" });
        await g.waitPanel("");
        await g.page.waitForTimeout(120);
        let m = await measure(g.page);
        check(`hud-${label}-${w}`, m, true);
        report[`hud-${label}-${w}`] = { hudWords: m.hudWords };
        ctx.artifact(await shot(`hud-${label}-${w}`));
        const bag = g.page.locator("#hud [data-tray]");
        if (await bag.count()) {
          await bag.first().click();
          await g.page.waitForTimeout(250);
          m = await measure(g.page);
          check(`hud-${label}-tray-${w}`, m, true);
          report[`hud-${label}-tray-${w}`] = { hudWords: m.hudWords };
          ctx.artifact(await shot(`hud-${label}-tray-${w}`));
        }
      }
      // ---- every panel
      for (const p of [...PANELS.filter((x) => !x.scrollTo), ...EXTRA]) {
        const name = `${p.shot ?? p.name}-${w}`;
        try {
          await g.boot(`?seed=7&fresh=1&nomotion=1${p.act !== undefined ? `&act=${p.act}` : ""}&panel=${p.name}`);
          await g.waitPanel(p.name);
          await g.page.waitForTimeout(200);
          const m = await measure(g.page);
          check(name, m);
          report[name] = { panelWords: m.panelWords, hudWords: m.hudWords };
          ctx.artifact(await shot(name));
        } catch (e) {
          failures.push(`${name}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
        }
      }
    }
    fs.writeFileSync(path.join(dir, "words.json"), JSON.stringify(report, null, 2));
    const total = Object.entries(report).filter(([k]) => k.endsWith("-1280") && !k.startsWith("hud")).reduce((n, [, v]) => n + (v.panelWords ?? 0), 0);
    ctx.note(`visible panel words at 1280×800 (all panels): ${total}`);
    g.assertNoErrors("ui probe");
    if (process.env.UI_PROBE_LENIENT === "1") { for (const f of failures) ctx.note(`(lenient) ${f}`); return; }
    if (failures.length) throw new ProbeError(`${failures.length} UI rule(s) broken:\n    ${failures.join("\n    ")}`);
  },
};

if (isMain(import.meta.url)) runSteps([ui]);
