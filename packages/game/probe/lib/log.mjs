// Logger: everything printed during a probe run is also appended to probe/out/log.txt.
import fs from "node:fs";
import path from "node:path";
import { OUT_DIR } from "./paths.mjs";

const LOG_FILE = path.join(OUT_DIR, "log.txt");
const t0 = Date.now();

/** @param {string} tag @param {...unknown} parts */
export function log(tag, ...parts) {
  const secs = ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
  const line = `[${secs}s] ${tag.padEnd(7)} ${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}`;
  console.log(line);
  logFileOnly(line);
}

/** Write to log.txt without echoing to the terminal (browser console noise, build output). */
export function logFileOnly(text) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, text.endsWith("\n") ? text : text + "\n");
}

export const LOG_PATH = LOG_FILE;
