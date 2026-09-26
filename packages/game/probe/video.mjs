// Video probe (CONTRACTS.md §7 step 6): 10 s webm of the idle world with motion on, for temporal bugs
// (flicker, jitter, animation glitches) that screenshots miss. Watch it; the probe only checks errors.
import fs from "node:fs";
import path from "node:path";
import { isMain, runSteps } from "./lib/harness.mjs";
import { OUT_DIR } from "./lib/paths.mjs";

const SECONDS = 10;

/** @type {import("./lib/harness.mjs").Step} */
export const video = {
  name: "video",
  async run(ctx) {
    const tmp = path.join(OUT_DIR, "video-tmp");
    const g = await ctx.newPage({ recordVideoDir: tmp });
    let error;
    try {
      await g.boot("?seed=7&fresh=1");
      await g.act({ type: "close" });
      await g.page.waitForTimeout(SECONDS * 1000);
      g.assertNoErrors(`during ${SECONDS} s idle`);
    } catch (e) {
      error = e;
    }
    // The webm is only finalised when the context closes.
    const vid = g.page.video();
    await g.close();
    if (vid) {
      const dest = path.join(OUT_DIR, "idle.webm");
      await vid.saveAs(dest);
      fs.rmSync(tmp, { recursive: true, force: true });
      ctx.artifact(dest);
    }
    if (error) throw error;
  },
};

if (isMain(import.meta.url)) runSteps([video]);
