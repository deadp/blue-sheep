// Movement prototype evidence (DESIGN-v3 §15 item 22). Usage (repo root):
//   node packages/game/src/stylelab/proto/shoot.mjs [walk,pan,perf]
// Starts Vite on a free port, drives proto-walk.html in headless Chrome with real clicks, drags, wheel and keys
// (time advances through window.__proto.advance so frames are even despite software WebGL), asserts what should
// have happened, and writes frame strips + contact sheets to src/stylelab/shots/proto/. Fails on console errors.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { CHROME_ARGS } from "../../../probe/lib/browser.mjs";
import { CHROME, GAME_DIR, REPO_DIR } from "../../../probe/lib/paths.mjs";
import { onCleanup, cleanupAll } from "../../../probe/lib/cleanup.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "..", "shots", "proto");
fs.mkdirSync(OUT, { recursive: true });
const RESERVED = new Set([4173, 4174, 5198]);
const what = (process.argv[2] ?? "walk,pan,perf").split(",");
const errors = [];
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails.push(msg); };

async function freePort() {
  for (;;) {
    const port = await new Promise((resolve, reject) => {
      const s = net.createServer();
      s.once("error", reject);
      s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
    });
    if (!RESERVED.has(port)) return port;
  }
}
async function startVite() {
  const port = await freePort();
  const bin = path.join(REPO_DIR, "node_modules", ".bin", "vite");
  const child = spawn(bin, ["--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: GAME_DIR, stdio: ["ignore", "pipe", "pipe"] });
  onCleanup(() => { if (child.exitCode === null) child.kill("SIGTERM"); });
  let log = "";
  child.stdout.on("data", (d) => { log += d; });
  child.stderr.on("data", (d) => { log += d; });
  const url = `http://127.0.0.1:${port}`;
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`vite exited:\n${log}`);
    try { const r = await fetch(`${url}/proto-walk.html`); if (r.ok) return url; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite did not start:\n${log}`);
}

const url = await startVite();
console.log("vite at", url);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
onCleanup(() => browser.close());

async function open(query, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag}: ${m.text()}`); });
  await page.goto(`${url}/proto-walk.html${query}`);
  await page.waitForSelector('body[data-ready="1"]', { state: "attached", timeout: 300_000 });
  return { ctx, page };
}
const st = (page) => page.evaluate(() => window.__proto.state());
const adv = (page, s) => page.evaluate((x) => window.__proto.advance(x), s);
const frames = { walk: [], pan: [], reveal: [] };
async function shot(page, kind, name, cap) {
  const file = path.join(OUT, `${kind}-${name}.png`);
  await page.waitForTimeout(60);
  await page.screenshot({ path: file });
  frames[kind].push([file, cap]);
  console.log("wrote", path.relative(REPO_DIR, file));
}
const dist = (a, b) => Math.hypot(a.u - b.u, a.v - b.v);

// ---------------------------------------------------------------- walk mode
async function walk() {
  const { ctx, page } = await open("?mode=walk&test=1", "walk");
  await adv(page, 0.5);
  await shot(page, "walk", "01-start", "1 · start: farmer in the home paddock");
  let s = await st(page);
  check(s.farmer.visible && s.mode === "walk", "walk mode shows the farmer");

  // click a sheep across the paddock: the farmer walks there, then its card opens
  const target = "Butter";
  const p = await page.evaluate((n) => window.__proto.sheepScreen(n), target);
  await page.mouse.click(p.x, p.y);
  s = await st(page);
  check(s.farmer.path > 0, `tap on ${target} plans a walk (${s.farmer.path} waypoints)`);
  await adv(page, 0.6);
  await shot(page, "walk", "02-tap-sheep", `2 · tapped ${target}: walking over`);
  for (let i = 0; i < 8 && !(await st(page)).card; i++) await adv(page, 0.4);
  s = await st(page);
  check(s.card === target, `arriving opens ${target}'s card (card=${s.card})`);
  await shot(page, "walk", "03-card", `3 · arrived: ${target}'s felt card`);
  await page.click(".fcard .x");
  check((await st(page)).card === null, "card closes with ×");

  // walk up to a sheep: the "Say hello" / "Brush" prompt, then press E
  const pk = (await st(page)).sheep.find((x) => x.name === "Pickle");
  await page.evaluate(() => 0);
  const pp = await page.evaluate(({ u, v }) => window.__proto.screen(u + 1.6, v - 0.8), pk);
  await page.mouse.click(pp.x, pp.y);
  await adv(page, 2.5);
  s = await st(page);
  check(s.prompt.startsWith("sheep:"), `walking up to a sheep shows its prompt (${s.prompt})`);
  await page.keyboard.press("e");
  await adv(page, 0.3);
  await shot(page, "walk", "04-hello", "4 · walked up to a sheep: E say hello");
  // hold F to brush (1.2 s): the ring fills, then a heart
  const who = (await st(page)).prompt.slice(6);
  const h0 = (await st(page)).sheep.find((x) => x.name === who).hearts;
  await page.keyboard.down("f");
  await adv(page, 0.6);
  await shot(page, "walk", "04b-brush", `4b · holding F to brush ${who}: the ring fills`);
  await adv(page, 0.8);
  await page.keyboard.up("f");
  const h1 = (await st(page)).sheep.find((x) => x.name === who).hearts;
  check(h1 === Math.min(5, h0 + 1), `holding F for 1.2 s brushes ${who} (hearts ${h0} → ${h1})`);
  // walk right up to a shy sheep: it steps away
  const shy = (await st(page)).sheep.find((x) => x.name === "Lavender");
  const nearShy = await page.evaluate(({ u, v }) => window.__proto.screen(u + 2.2, v + 1.6), shy);
  await page.mouse.click(nearShy.x, nearShy.y);
  for (let i = 0; i < 10 && (await st(page)).farmer.path > 0; i++) await adv(page, 0.4);
  await adv(page, 1.2);
  const shy2 = (await st(page)).sheep.find((x) => x.name === "Lavender");
  const fz = (await st(page)).farmer;
  check(dist(shy2, shy) > 1.5 && dist(shy2, fz) > 3, `shy Lavender stepped away (moved ${dist(shy2, shy).toFixed(1)}, now ${dist(shy2, fz).toFixed(1)} from the farmer)`);
  await shot(page, "walk", "04c-shy", "4c · walked at shy Lavender: she steps away");

  // tap the woolshed on the minimap: the farmer heads out through the paddock gate, fond sheep trot after
  const mmClick = async (u, v) => {
    const box = await (await page.$(".mm-stack")).boundingBox();
    await page.mouse.click(box.x + ((u + 62) / 162) * box.width, box.y + box.height - ((v + 20) / 64) * box.height);
  };
  await mmClick(4, -8.2);
  s = await st(page);
  check(s.farmer.path > 1, `minimap tap plans a path out of the paddock (${s.farmer.path} waypoints)`);
  await adv(page, 1.4);
  await shot(page, "walk", "05-to-gate", "5 · tapped the woolshed on the minimap: heading for the gate");
  await adv(page, 1.6);
  await shot(page, "walk", "06-gate", "6 · through the gate, fond sheep following");
  for (let i = 0; i < 10 && (await st(page)).farmer.path > 0; i++) await adv(page, 0.5);
  await adv(page, 1.5);
  s = await st(page);
  check(Math.hypot(s.farmer.u - 4, s.farmer.v + 8.2) < 1.2, `farmer reached the woolshed front (${s.farmer.u}, ${s.farmer.v})`);
  check(s.prompt === "woolshed", `woolshed prompt shows (${s.prompt})`);
  const fond = s.sheep.filter((x) => x.temper === "fond");
  const near = fond.filter((x) => dist(x, s.farmer) < 7);
  check(near.length >= 2, `fond sheep followed: ${fond.map((x) => `${x.name} ${dist(x, s.farmer).toFixed(1)}`).join(", ")}`);
  const calm = s.sheep.filter((x) => x.temper !== "fond");
  check(calm.every((x) => x.u < -5), `other sheep stayed in the paddock (${calm.map((x) => x.name + " " + x.u).join(", ")})`);
  await shot(page, "walk", "07-woolshed", "7 · at the woolshed: stations, prompt, followers");
  await page.keyboard.press("e");
  await adv(page, 0.4);

  // WASD: hold D (screen right) along the front of the woolshed, then S
  const w0 = await st(page);
  await page.keyboard.down("d");
  await page.keyboard.down("s");
  await adv(page, 0.7);
  await shot(page, "walk", "08-wasd-a", "8 · holding D+S: walk cycle, dust, camera leads");
  await adv(page, 0.7);
  await shot(page, "walk", "09-wasd-b", "9 · still walking: camera follows with look-ahead");
  await page.keyboard.up("s");
  await adv(page, 0.5);
  await page.keyboard.up("d");
  await adv(page, 0.3);
  const w1 = await st(page);
  check(w1.farmer.u - w0.farmer.u > 4, `WASD moved the farmer east (${w0.farmer.u} → ${w1.farmer.u})`);
  await adv(page, 2.5);
  await shot(page, "walk", "10-idle", "10 · stopped: idle look-around, sheep catch up");

  // walk to the creek flats price tag and open the land
  await page.click("#t-flats .tag");
  for (let i = 0; i < 12 && (await st(page)).farmer.path > 0; i++) await adv(page, 0.5);
  await adv(page, 0.6);
  const btn = await page.$("#t-flats .open");
  check(!!btn, "near the price tag, the Open this land button appears");
  await shot(page, "walk", "11-tag", "11 · walked up to the Creek flats tag");
  await shot(page, "reveal", "00", "0 · before: scrub, rank grass, broken fence, sign");
  await page.click("#t-flats .open");
  for (let i = 1; i <= 8; i++) { await adv(page, i === 1 ? 0.45 : 0.62); await shot(page, "reveal", String(i).padStart(2, "0"), `${i} · ${(0.45 + (i - 1) * 0.62).toFixed(1)} s`); }
  await adv(page, 1);
  s = await st(page);
  check(s.revealed && s.coins === 16, `land opened (revealed=${s.revealed}, coins=${s.coins})`);
  // walk into the new paddock through its gate
  const inside = await page.evaluate(() => window.__proto.screen(30, -3));
  await page.mouse.click(inside.x, inside.y);
  for (let i = 0; i < 14 && (await st(page)).farmer.path > 0; i++) await adv(page, 0.5);
  s = await st(page);
  check(Math.hypot(s.farmer.u - 30, s.farmer.v + 3) < 1.5, `farmer walks into the opened flats via the gate (${s.farmer.u}, ${s.farmer.v})`);
  await adv(page, 1.5);
  await shot(page, "walk", "12-flats", "12 · inside the new paddock with the followers");
  await ctx.close();
}

// ---------------------------------------------------------------- pan mode
async function pan() {
  const { ctx, page } = await open("?mode=pan&test=1", "pan");
  await adv(page, 0.4);
  await shot(page, "pan", "01-start", "1 · pan mode: no farmer, signposts");
  let s = await st(page);
  check(!s.farmer.visible && s.mode === "pan", "pan mode hides the farmer");
  // drag to pan
  const c0 = s.camera;
  await page.mouse.move(900, 450);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(900 - i * 40, 450 - i * 8);
  await adv(page, 0.05);
  await shot(page, "pan", "02-drag", "2 · dragging left: camera moves east");
  await page.mouse.up();
  await adv(page, 0.6);
  s = await st(page);
  check(s.camera.u - c0.u > 8, `drag panned the camera (${c0.u} → ${s.camera.u})`);
  // scroll to zoom out, then in
  await page.mouse.move(640, 400);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 240);
  await adv(page, 0.1);
  s = await st(page);
  check(s.camera.halfW > 22, `scroll zooms out (halfW ${s.camera.halfW})`);
  await shot(page, "pan", "03-zoom-out", "3 · scrolled out (zoom limit 34)");
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -240);
  await adv(page, 0.1);
  // signpost glide to the woolshed
  await page.click('[data-sign="woolshed"]');
  await adv(page, 0.4);
  await shot(page, "pan", "04-glide-a", "4 · Woolshed signpost: glide starts");
  await adv(page, 0.4);
  await shot(page, "pan", "05-glide-b", "5 · glide mid-way (eases, lifts a little)");
  await adv(page, 0.8);
  s = await st(page);
  check(!s.camera.gliding && Math.hypot(s.camera.u - 4, s.camera.v + 5) < 1, `glide lands on the woolshed (${s.camera.u}, ${s.camera.v})`);
  await shot(page, "pan", "06-woolshed", "6 · at the woolshed: station tags");
  // home paddock, tap a sheep: card opens directly
  await page.click('[data-sign="home"]');
  await adv(page, 1.5);
  const p = await page.evaluate(() => window.__proto.sheepScreen("Pikelet"));
  await page.mouse.click(p.x, p.y);
  await adv(page, 0.3);
  s = await st(page);
  check(s.card === "Pikelet", `tapping a sheep in pan mode opens its card directly (${s.card})`);
  await shot(page, "pan", "07-card", "7 · Home paddock signpost, tap Pikelet: card");
  await page.click(".fcard .second");
  await adv(page, 0.3);
  check((await st(page)).sheep.find((x) => x.name === "Pikelet").hearts === 5, "Brush on the card adds a heart");
  await page.click(".fcard .x");
  // minimap click jumps
  const mm = await page.$(".mm-stack");
  const box = await mm.boundingBox();
  const mx = box.x + ((33 + 62) / 162) * box.width, my = box.y + box.height - ((0 + 20) / 64) * box.height;
  await page.mouse.click(mx, my);
  await adv(page, 1.4);
  s = await st(page);
  check(Math.hypot(s.camera.u - 33, s.camera.v) < 3, `minimap click glides to the creek flats (${s.camera.u}, ${s.camera.v})`);
  await shot(page, "pan", "08-minimap", "8 · minimap click → creek flats, price tag");
  await page.click("#t-flats .open");
  await adv(page, 5.5);
  s = await st(page);
  check(s.revealed, "Open this land works in pan mode too");
  await shot(page, "pan", "09-opened", "9 · opened from pan mode");
  // switch to walk with the felt toggle: the farmer drops in
  await page.click('.modesw [data-m="walk"]');
  await adv(page, 1.0);
  s = await st(page);
  check(s.mode === "walk" && s.farmer.visible, "the felt switch flips to walk mode");
  await shot(page, "pan", "10-to-walk", "10 · felt switch → walk: farmer drops in");
  await ctx.close();
}

// ---------------------------------------------------------------- perf (real time, software WebGL)
async function perf() {
  const out = [];
  for (const q of ["?mode=walk", "?mode=walk&lite=1", "?mode=pan"]) {
    const { ctx, page } = await open(q, `perf${q}`);
    await page.waitForTimeout(1500);
    await page.keyboard.down("d");
    await page.waitForTimeout(3000);
    await page.keyboard.up("d");
    const s = await page.evaluate(() => window.__proto.stats());
    out.push(`${q}: ${(1000 / s.frameMs).toFixed(1)} fps (${s.frameMs.toFixed(0)} ms/frame, render ${s.renderMs.toFixed(0)} ms), ${s.calls} draw calls, ${(s.triangles / 1000).toFixed(0)}k triangles`);
    await ctx.close();
  }
  console.log("perf (SwiftShader software GL, not a real GPU):\n  " + out.join("\n  "));
  fs.writeFileSync(path.join(OUT, "perf.txt"), out.join("\n") + "\n");
}

async function sheet(kind, title, cols = 3) {
  const tiles = frames[kind];
  if (!tiles.length) return;
  const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 400 } });
  const page = await ctx.newPage();
  await page.setContent(`<style>
    body{margin:0;background:#2b2724;font:600 16px/1.2 sans-serif;color:#f4ecd8}
    h1{margin:0;padding:12px 16px;font-size:24px}
    .g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:0 6px 6px}
    figure{margin:0;position:relative}img{display:block;width:100%}
    figcaption{position:absolute;left:8px;top:8px;background:rgba(43,39,36,.84);padding:4px 9px;border-radius:5px}
  </style><h1>${title}</h1><div class="g">${tiles.map(([f, c]) => `<figure><img src="${b64(f)}"><figcaption>${c}</figcaption></figure>`).join("")}</div>`);
  await page.waitForTimeout(200);
  const file = path.join(OUT, `${kind}-sheet.png`);
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();
  console.log("wrote", path.relative(REPO_DIR, file));
}

try {
  if (what.includes("walk")) await walk();
  if (what.includes("pan")) await pan();
  if (what.includes("perf")) await perf();
} catch (e) {
  fails.push(String(e?.stack ?? e));
  console.error(e);
}
await sheet("walk", "Walk mode · close iso, walking farmer (tap-to-walk, WASD, fond sheep follow)");
await sheet("pan", "Pan mode · drag, scroll, signposts, minimap, tap a sheep");
await sheet("reveal", "Open this land · scrub clears, grass greens, fence mends (no mist)", 3);
await cleanupAll();
if (errors.length) console.error("CONSOLE ERRORS:\n" + errors.join("\n"));
if (fails.length) console.error(`${fails.length} check(s) failed`);
process.exit(errors.length || fails.length ? 1 : 0);
