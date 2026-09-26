// Step runner: build once, serve once on a fresh port, launch Chrome once, run steps, print a summary, exit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_DIR, OUT_DIR, REPO_DIR } from "./paths.mjs";
import { build, serve } from "./server.mjs";
import { GamePage, launchBrowser } from "./browser.mjs";
import { cleanupAll, isInterrupted } from "./cleanup.mjs";
import { log, LOG_PATH } from "./log.mjs";

/**
 * @typedef {object} StepContext
 * @property {string} baseUrl                         served build, e.g. http://127.0.0.1:41234
 * @property {(opts?: { recordVideoDir?: string }) => Promise<GamePage>} newPage  fresh context + page; closed automatically after the step
 * @property {(file: string) => void} artifact       record an artifact path for the summary
 * @property {(msg: string) => void} note            record a one-line note for the summary
 *
 * @typedef {object} Step
 * @property {string} name
 * @property {(ctx: StepContext) => Promise<void>} run  throw to fail
 */

/** True when `metaUrl` is the script node was started with. @param {string} metaUrl */
export function isMain(metaUrl) {
  return process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

function clearOut() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) fs.rmSync(path.join(OUT_DIR, f), { recursive: true, force: true });
}

const rel = (/** @type {string} */ p) => path.relative(REPO_DIR, p);

/**
 * Run steps in order and exit the process with 0 (all passed) or 1.
 * Env: PROBE_NO_BUILD=1 reuses the last probe build in probe/.build.
 * @param {Step[]} steps
 */
export async function runSteps(steps) {
  clearOut();
  /** @type {{ name: string, status: "pass" | "FAIL" | "skip", ms: number, artifacts: string[], notes: string[], error?: string }[]} */
  const results = [];
  let fatal = null;
  let phase = "build";
  try {
    const tBuild = Date.now();
    if (process.env.PROBE_NO_BUILD === "1") {
      if (!fs.existsSync(path.join(BUILD_DIR, "index.html"))) throw new Error("PROBE_NO_BUILD=1 but no previous probe build exists");
      log("build", "skipped (PROBE_NO_BUILD=1) — reusing " + rel(BUILD_DIR));
    } else {
      await build();
    }
    results.push({ name: "build", status: "pass", ms: Date.now() - tBuild, artifacts: [rel(BUILD_DIR)], notes: [] });
    phase = "serve";
    const server = await serve(BUILD_DIR);
    const browser = await launchBrowser();

    phase = "harness";
    let skipReason = "";
    for (const step of steps) {
      const r = { name: step.name, status: /** @type {"pass"|"FAIL"|"skip"} */ ("pass"), ms: 0, artifacts: /** @type {string[]} */ ([]), notes: /** @type {string[]} */ ([]), error: undefined };
      results.push(r);
      if (skipReason) { r.status = "skip"; r.notes.push(skipReason); log("skip", step.name, "-", skipReason); continue; }
      log("step", `── ${step.name} ──`);
      /** @type {GamePage[]} */
      const pages = [];
      const t = Date.now();
      try {
        await step.run({
          baseUrl: server.url,
          newPage: async (opts) => { const p = await GamePage.open(browser, server.url, opts); pages.push(p); return p; },
          artifact: (f) => r.artifacts.push(rel(f)),
          note: (m) => { r.notes.push(m); log("note", m); },
        });
      } catch (e) {
        if (isInterrupted()) break;
        r.status = "FAIL";
        r.error = e instanceof Error ? e.message : String(e);
        log("FAIL", `${step.name}: ${r.error}`);
        if (/controller not ready/.test(r.error)) skipReason = "controller not ready in an earlier step";
        // Evidence: what was on screen when it failed.
        for (const [i, p] of pages.entries()) {
          const shot = await p.screenshot(`${step.name}-FAILED${pages.length > 1 ? `-${i}` : ""}`).catch(() => null);
          if (shot) r.artifacts.push(rel(shot));
        }
      } finally {
        for (const p of pages) await p.close().catch(() => {});
        r.ms = Date.now() - t;
      }
      if (r.status === "pass") log("pass", step.name);
    }
  } catch (e) {
    fatal = e instanceof Error ? e.message : String(e);
    log("FATAL", fatal);
    results.push({ name: phase, status: "FAIL", ms: 0, artifacts: [], notes: [], error: fatal });
  } finally {
    await cleanupAll();
  }
  if (isInterrupted()) { console.error("probe: interrupted"); process.exit(130); }
  printSummary(results);
  process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}

/** @param {{ name: string, status: string, ms: number, artifacts: string[], notes: string[], error?: string }[]} results */
function printSummary(results) {
  const lines = ["", "PROBE SUMMARY", "─".repeat(78)];
  lines.push(`${"step".padEnd(10)} ${"result".padEnd(6)} ${"time".padStart(7)}  artifacts / notes`);
  for (const r of results) {
    const head = `${r.name.padEnd(10)} ${r.status.padEnd(6)} ${(r.ms / 1000).toFixed(1).padStart(6)}s  `;
    const extra = [...r.artifacts, ...r.notes];
    lines.push(head + (extra[0] ?? ""));
    for (const x of extra.slice(1)) lines.push(" ".repeat(head.length) + x);
    if (r.error) lines.push(" ".repeat(head.length) + "ERROR: " + r.error.replace(/\n\s*/g, " | ").slice(0, 300));
  }
  const failed = results.filter((r) => r.status === "FAIL").length;
  lines.push("─".repeat(78));
  lines.push(failed ? `${failed} step(s) FAILED — full log: ${rel(LOG_PATH)}` : `all passed — look at the screenshots in ${rel(OUT_DIR)}/ before calling it done`);
  const text = lines.join("\n");
  console.log(text);
  fs.appendFileSync(LOG_PATH, text + "\n");
}
