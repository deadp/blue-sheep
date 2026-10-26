import { it } from "vitest";
import { runChunk } from "./blind8.ts";

// Long run (seeds 25-30): only collected when the file is named on the vitest command line.
it("blind farmer, seeds 25-30", () => runChunk(25, 30), 90 * 60_000);
