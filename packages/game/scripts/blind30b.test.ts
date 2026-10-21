import { it } from "vitest";

// Long run (seeds 16-30): only collected when the file is named on the vitest command line.
const FROM = 16, TO = 30;

it("blind farmer, seeds 16-30", async () => {
  process.env["FROM"] = String(FROM);
  process.env["SEEDS"] = String(TO - FROM + 1);
  await import("./blind.ts"); // runs the sim and prints the stats block
}, 45 * 60_000);
