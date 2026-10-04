// Probe entry point. `node probe/run.mjs [step...]` — no args = smoke, play, panels, colour, breeds, breedlooks, ui, life, world, dressing, voices, tutorial, lessons, video.
// Builds once (unless PROBE_NO_BUILD=1), serves on a fresh port, prints a summary, exits non-zero on failure.
import { runSteps } from "./lib/harness.mjs";
import { smoke } from "./smoke.mjs";
import { play } from "./play.mjs";
import { panels } from "./panels.mjs";
import { video } from "./video.mjs";
import { life } from "./life.mjs";
import { tutorial } from "./tutorial.mjs";
import { lessons } from "./lessons.mjs";
import { voices } from "./voices.mjs";
import { ui } from "./ui.mjs";
import { world } from "./world.mjs";
import { dressing } from "./dressing.mjs";
import { colour } from "./colour.mjs";
import { breeds } from "./breeds.mjs";
import { breedlooks } from "./breedlooks.mjs";

const ALL = { smoke, play, panels, colour, breeds, breedlooks, ui, life, world, dressing, voices, tutorial, lessons, video };
const names = process.argv.slice(2);
const unknown = names.filter((n) => !(n in ALL));
if (unknown.length) {
  console.error(`unknown step(s): ${unknown.join(", ")}. Known: ${Object.keys(ALL).join(", ")}`);
  process.exit(2);
}
await runSteps((names.length ? names : Object.keys(ALL)).map((n) => ALL[/** @type {keyof typeof ALL} */ (n)]));
