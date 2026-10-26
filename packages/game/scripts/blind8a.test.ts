import { it } from "vitest";
import { runChunk } from "./blind8.ts";

// Long run (seeds 1-8): only collected when the file is named on the vitest command line.
it("blind farmer, seeds 1-8", () => runChunk(1, 8), 90 * 60_000);
