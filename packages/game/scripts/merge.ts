/** Merge sharded runs: OUT=file.json blind.ts per shard (in parallel), then npx vite-node scripts/merge.ts "label" a.json b.json ... */
import { readFileSync } from "node:fs";
import { summarise, type RunResult } from "./policy.js";

const [label, ...files] = process.argv.slice(2);
const results = files.flatMap((f) => JSON.parse(readFileSync(f, "utf8")) as RunResult[]).sort((a, b) => a.seed - b.seed);
summarise(label ?? "merged", results, Number(process.env["MAXS"] ?? 60));
