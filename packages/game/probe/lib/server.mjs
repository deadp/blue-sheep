// Build the game into probe/.build and serve it with a tiny static server on a fresh port.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { BUILD_DIR, REPO_DIR } from "./paths.mjs";
import { onCleanup } from "./cleanup.mjs";
import { log, logFileOnly } from "./log.mjs";

/**
 * Run the real production build (`tsc -b && vite build`) with vite's output redirected to `outDir`.
 * Throws with the tail of the build output on failure.
 * @param {string} [outDir]
 */
export async function build(outDir = BUILD_DIR) {
  log("build", `npm run build -> ${path.relative(REPO_DIR, outDir)}`);
  const args = ["run", "build", "-w", "@blue-sheep/game", "--", "--outDir", outDir, "--emptyOutDir"];
  const child = spawn("npm", args, { cwd: REPO_DIR, stdio: ["ignore", "pipe", "pipe"] });
  const unregister = onCleanup(() => { child.kill("SIGTERM"); });
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });
  const code = await new Promise((resolve) => child.on("close", resolve));
  unregister();
  logFileOnly(output);
  if (code !== 0) {
    const tail = output.trim().split("\n").filter((l) => !l.startsWith("npm error") && !l.startsWith(">") && l.trim()).slice(-20).join("\n");
    throw new Error(`build failed (exit ${code}):\n${tail}`);
  }
  if (!fs.existsSync(path.join(outDir, "index.html"))) throw new Error(`build produced no index.html in ${outDir}`);
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".wasm": "application/wasm", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".map": "application/json",
};

/**
 * Serve `root` statically. Port 0 = pick a free port. Unknown paths fall back to index.html.
 * The server is registered for cleanup and closed on exit.
 * @param {string} root
 * @param {{ host?: string, port?: number }} [opts]
 * @returns {Promise<{ url: string, port: number, close: () => Promise<void> }>}
 */
export async function serve(root, { host = "127.0.0.1", port = 0 } = {}) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let file = path.join(root, urlPath);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const idx = path.join(file, "index.html");
      file = fs.existsSync(idx) ? idx : path.join(root, "index.html");
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  });
  const sockets = new Set();
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  const addr = /** @type {import("node:net").AddressInfo} */ (server.address());
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    for (const s of sockets) s.destroy();
    await new Promise((resolve) => server.close(() => resolve(undefined)));
    log("server", `stopped :${addr.port}`);
  };
  onCleanup(close);
  const url = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${addr.port}`;
  log("server", `serving ${root} at ${url}`);
  return { url, port: addr.port, close };
}
