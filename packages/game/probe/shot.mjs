// One-off screenshot of any deep link against a fresh build:
//   node packages/game/probe/shot.mjs "?seed=7&panel=forecast" [name] [--no-ready]
// --no-ready skips waiting for body[data-ready] and waits 3 s instead (for builds without the controller).
import { isMain, runSteps } from "./lib/harness.mjs";
import { pinDetail } from "./lib/browser.mjs";

const args = process.argv.slice(2);
const noReady = args.includes("--no-ready");
const [query = "", name = "shot"] = args.filter((a) => !a.startsWith("--"));

/** @type {import("./lib/harness.mjs").Step} */
const shot = {
  name: "shot",
  async run(ctx) {
    const g = await ctx.newPage();
    if (noReady) {
      await g.page.goto(`${ctx.baseUrl}/${pinDetail(query)}`, { waitUntil: "load" });
      await g.page.waitForTimeout(3000);
    } else {
      await g.boot(query);
    }
    ctx.artifact(await g.screenshot(name));
    if (g.errors.length) ctx.note(`${g.errors.length} console/page error(s): ${g.errors[0]}`);
    g.assertNoErrors(`on ${query}`);
  },
};

if (isMain(import.meta.url)) runSteps([shot]);
