import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { median, type Reported } from "../src/simstats.js";

/** Runs blind.ts for seeds from..to and prints one compact summary block (the last lines of stdout). */
export async function runChunk(from: number, to: number): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "blind8-"));
  const out = join(dir, "results.json");
  process.env["FROM"] = String(from);
  process.env["SEEDS"] = String(to - from + 1);
  process.env["OUT"] = out; // blind.ts writes the raw results here
  try {
    await import("./blind.ts"); // runs the sim and prints the full stats block
    const results = JSON.parse(readFileSync(out, "utf8")) as Reported[];
    const ch3 = results.map((r) => r.actSeason[3] ?? -1);
    const reached = ch3.filter((x) => x >= 0);
    const rare = results.filter((r) => r.firstFantasy !== null && r.firstFantasy <= 27).length;
    const ended = results.filter((r) => r.endSeason !== null && r.endSeason >= 0).length;
    console.log(`=== blind8 summary, seeds ${from}-${to} ===`);
    console.log(`seeds run: ${results.length}`);
    console.log(`rare fleece by season 27: ${rare} of ${results.length}`);
    console.log(`chapter 3 season: median ${median(reached)}, min ${reached.length ? Math.min(...reached) : "never"}, max ${reached.length ? Math.max(...reached) : "never"} (${reached.length} of ${results.length} reached)`);
    console.log(`reached the ending: ${ended} of ${results.length}`);
    console.log(`chapter 3 season per seed (${from}-${to}, -1 = never): ${ch3.join(" ")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
