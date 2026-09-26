// Shared paths for the probe harness.
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PROBE_DIR = path.resolve(here, "..");
export const GAME_DIR = path.resolve(PROBE_DIR, "..");
export const REPO_DIR = path.resolve(GAME_DIR, "..", "..");
export const OUT_DIR = path.join(PROBE_DIR, "out");
/** Probe builds go here, never into packages/game/dist, so parallel builds and dev servers cannot interfere. */
export const BUILD_DIR = path.join(PROBE_DIR, ".build");
export const CHROME = process.env.PROBE_CHROME ?? "/usr/bin/google-chrome";
