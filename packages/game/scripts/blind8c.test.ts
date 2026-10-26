import { it } from "vitest";
import { runChunk } from "./blind8.ts";

// Long run (seeds 17-24): only collected when the file is named on the vitest command line.
it("blind farmer, seeds 17-24", () => runChunk(17, 24), 90 * 60_000);
