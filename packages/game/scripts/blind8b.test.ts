import { it } from "vitest";
import { runChunk } from "./blind8.ts";

// Long run (seeds 9-16): only collected when the file is named on the vitest command line.
it("blind farmer, seeds 9-16", () => runChunk(9, 16), 90 * 60_000);
