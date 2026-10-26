import { defineConfig } from "vitest/config";

// The blind30 and blind8 long runs are collected only when named on the command line, so `npm test` is unchanged.
const longRun = process.argv.some((a) => a.includes("blind30") || a.includes("blind8"));

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", ...(longRun ? ["packages/game/scripts/blind30*.test.ts", "packages/game/scripts/blind8*.test.ts"] : [])],
  },
});
