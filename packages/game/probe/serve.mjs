// Build and serve the production game for a human on another machine: binds 0.0.0.0, prints the LAN URL.
//   npm run serve [-- --port 4173]    (PROBE_NO_BUILD=1 to skip the build)
import os from "node:os";
import { build, serve } from "./lib/server.mjs";
import { BUILD_DIR } from "./lib/paths.mjs";

const i = process.argv.indexOf("--port");
const port = i > 0 ? Number(process.argv[i + 1]) : Number(process.env.PORT ?? 4173);
if (process.env.PROBE_NO_BUILD !== "1") await build();
const s = await serve(BUILD_DIR, { host: "0.0.0.0", port });
const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal)?.address ?? "127.0.0.1";
console.log(`\nBlue Sheep (production build) at http://${lan}:${s.port}/  — Ctrl+C to stop`);
