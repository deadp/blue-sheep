// Headless Chrome with software WebGL, plus a GamePage wrapper around the window.__game contract.
import fs from "node:fs";
import path from "node:path";
import { chromium, errors as pwErrors } from "playwright";
import { CHROME, OUT_DIR } from "./paths.mjs";
import { onCleanup } from "./cleanup.mjs";
import { log, logFileOnly } from "./log.mjs";

export const CHROME_ARGS = [
  "--no-sandbox",
  "--use-gl=swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  // Chrome >= 137 refuses the automatic SwiftShader WebGL fallback without this.
  "--enable-unsafe-swiftshader",
];
export const VIEWPORT = { width: 1280, height: 800 };
export const READY_TIMEOUT_MS = 20_000;

/** @returns {Promise<import("playwright").Browser>} */
export async function launchBrowser() {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true, args: CHROME_ARGS,
    // Our cleanup handler owns signals, so the run reports "interrupted" instead of bogus step failures.
    handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
  });
  onCleanup(() => browser.close());
  log("browser", `launched ${CHROME} ${browser.version()}`);
  return browser;
}

export class ProbeError extends Error {}

/**
 * Probes pin the world's detail through the URL (`detail=full` unless the query already says `detail=` or
 * `lite=`): the game's default is "auto", which measures frame times and would flip slow software GL to lite
 * mid-run, making screenshots unstable.
 * @param {string} query
 */
export function pinDetail(query) {
  if (/[?&](detail|lite)=/.test(query)) return query;
  const [path, hash = ""] = query.split("#");
  const q = path.includes("?") ? `${path}&detail=full` : `${path}?detail=full`;
  return hash ? `${q}#${hash}` : q;
}

/**
 * One page (in its own context, so no localStorage leaks between probes) pointed at the served build.
 * Collects console errors and page errors; every console line also goes to log.txt.
 */
export class GamePage {
  /**
   * @param {import("playwright").Browser} browser
   * @param {string} baseUrl
   * @param {{ recordVideoDir?: string }} [opts]
   */
  static async open(browser, baseUrl, opts = {}) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      ...(opts.recordVideoDir ? { recordVideo: { dir: opts.recordVideoDir, size: VIEWPORT } } : {}),
    });
    const page = await context.newPage();
    return new GamePage(context, page, baseUrl);
  }

  /** @param {import("playwright").BrowserContext} context @param {import("playwright").Page} page @param {string} baseUrl */
  constructor(context, page, baseUrl) {
    this.context = context;
    this.page = page;
    this.baseUrl = baseUrl;
    /** @type {string[]} */
    this.errors = [];
    page.on("console", (msg) => {
      logFileOnly(`  [console.${msg.type()}] ${msg.text()}`);
      if (msg.type() === "error") this.errors.push(`console.error: ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
      logFileOnly(`  [pageerror] ${err.stack ?? err.message}`);
      this.errors.push(`pageerror: ${err.message}`);
    });
    page.on("requestfailed", (req) => {
      logFileOnly(`  [requestfailed] ${req.url()} ${req.failure()?.errorText ?? ""}`);
    });
  }

  /**
   * Navigate to `query` (e.g. "?seed=7&fresh=1&nomotion=1") and wait for body[data-ready="1"].
   * @param {string} query
   */
  async boot(query) {
    const url = this.baseUrl + "/" + pinDetail(query);
    log("boot", url);
    await this.page.goto(url, { waitUntil: "load" });
    try {
      await this.page.waitForSelector('body[data-ready="1"]', { state: "attached", timeout: READY_TIMEOUT_MS });
    } catch (e) {
      if (!(e instanceof pwErrors.TimeoutError)) throw e;
      const hasGame = await this.page.evaluate(() => typeof (/** @type {any} */ (window).__game) === "object").catch(() => false);
      const errs = this.errors.length ? `\n  console errors so far:\n    ${this.errors.join("\n    ")}` : "";
      throw new ProbeError(
        `controller not ready — is window.__game implemented? ` +
        `(body[data-ready="1"] did not appear within ${READY_TIMEOUT_MS / 1000} s at ${url}; ` +
        `window.__game ${hasGame ? "exists" : "is missing"})${errs}`,
      );
    }
  }

  /** Save a full-viewport PNG to probe/out/<name>.png and return its path. @param {string} name */
  async screenshot(name) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `${name}.png`);
    await this.page.screenshot({ path: file });
    log("shot", path.relative(process.cwd(), file));
    return file;
  }

  async hasGame() {
    return this.page.evaluate(() => typeof (/** @type {any} */ (window).__game) === "object");
  }

  /**
   * Dispatch a controller action. Core actions throw player-readable errors for invalid moves;
   * those are returned (not thrown) so a policy can skip an illegal move.
   * @param {Record<string, unknown>} action
   * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
   */
  async act(action) {
    return this.page.evaluate(async (a) => {
      const g = /** @type {any} */ (window).__game;
      if (!g) throw new Error("window.__game is missing");
      try { await g.act(a); return { ok: true }; } catch (e) { return { ok: false, error: String(e?.message ?? e) }; }
    }, action);
  }

  /** Deep copy of __game.state(). @returns {Promise<any>} */
  async state() {
    return this.page.evaluate(() => JSON.parse(JSON.stringify(/** @type {any} */ (window).__game.state())));
  }

  /** Current body[data-panel] ("" when no panel is open, null if the attribute is absent). */
  async panel() {
    return this.page.evaluate(() => document.body.dataset.panel ?? null);
  }

  /** @param {string} name @param {number} [timeout] */
  async waitPanel(name, timeout = 5_000) {
    try {
      await this.page.waitForFunction((n) => document.body.dataset.panel === n, name, { timeout });
    } catch {
      throw new ProbeError(`expected body[data-panel="${name}"] within ${timeout} ms, got ${JSON.stringify(await this.panel())}`);
    }
  }

  /** Poll until fn(state) is truthy. @param {(s: any) => boolean} fn @param {string} what @param {number} [timeout] */
  async waitState(fn, what, timeout = 15_000) {
    const end = Date.now() + timeout;
    let s;
    while (Date.now() < end) {
      s = await this.state();
      if (fn(s)) return s;
      await this.page.waitForTimeout(100);
    }
    throw new ProbeError(`timed out after ${timeout} ms waiting for ${what}`);
  }

  /** Throw if any console error or page error has been seen. @param {string} where */
  assertNoErrors(where) {
    if (this.errors.length) {
      throw new ProbeError(`${this.errors.length} console/page error(s) ${where}:\n    ${this.errors.slice(0, 8).join("\n    ")}`);
    }
  }

  async close() {
    await this.context.close();
  }
}
