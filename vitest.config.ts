import { defineConfig } from "vitest/config";

// The long blind sim is only picked up when the command line names it: `npx vitest run packages/game/scripts/blind.long.test.ts`.
const long = process.argv.some((a) => a.endsWith(".long.test.ts"));

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", ...(long ? ["packages/*/scripts/*.long.test.ts"] : [])],
  },
});
