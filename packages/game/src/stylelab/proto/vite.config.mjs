// Static build of the movement prototype only:  npx vite build -c packages/game/src/stylelab/proto/vite.config.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const game = path.resolve(here, "../../..");
export default defineConfig({
  root: game,
  base: "./",
  build: {
    target: "es2022",
    outDir: path.join(here, "dist"),
    emptyOutDir: true,
    rollupOptions: { input: path.join(game, "proto-walk.html") },
    chunkSizeWarningLimit: 2000,
  },
});
