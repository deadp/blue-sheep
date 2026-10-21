/** Model-free long run of the blind sim (SEEDS, FROM, MAXS as for blind.ts; 30 seeds by default). Not part of `npm test`. */
import { it } from "vitest";
import { runBlind } from "./blind.js";

it("blind sim", async () => {
  await runBlind(Number(process.env["SEEDS"] ?? 30), Number(process.env["FROM"] ?? 1), Number(process.env["MAXS"] ?? 60));
}, 80 * 60 * 1000);
