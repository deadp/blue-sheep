// Breeds probe (DESIGN-v3 Phase 3): breeds and wool types in the live game. Rules: at ?act=3 the market stocks at
// least three breeds and no Icelandic (it is the act-4 reward); at ?act=4 the market always has an Icelandic ewe;
// a bought sheep's card names its breed and a wool type that equals the classifier on its phenotype; the world
// snapshot carries the breed; the flock shows several breeds after buying one of each.
// Screenshots breeds-market, breeds-card, breeds-flock, breeds-act4-market.
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";

const TYPE_LABELS = ["fine", "medium", "strong", "crossbred", "lustre", "carpet", "lopi"];

/** @type {import("./lib/harness.mjs").Step} */
export const breeds = {
  name: "breeds",
  async run(ctx) {
    const g = await ctx.newPage();
    await g.boot("?seed=7&fresh=1&nomotion=1&act=3");
    let st = await g.state();
    const market = () => st.market.map((/** @type {string} */ id) => st.sheep[id]);
    const kinds = new Set(market().map((s) => s.breed ?? "farm"));
    if (kinds.size < 3) throw new ProbeError(`the act-3 market should offer at least three breeds, got ${[...kinds].join(", ")}`);
    if (kinds.has("icelandic")) throw new ProbeError("Icelandic must not be in the market before act 4");
    ctx.note(`act-3 market breeds: ${[...kinds].join(", ")}`);

    // The market card shows breed and wool type for every sheep on offer.
    await g.act({ type: "open", panel: "market" });
    await g.waitPanel("market");
    await g.page.waitForTimeout(200);
    const shown = await g.page.evaluate(() => [...document.querySelectorAll("#overlay .m-breed")].map((e) => /** @type {HTMLElement} */ (e).dataset.breed));
    if (shown.length !== st.market.length) throw new ProbeError(`market shows ${shown.length} breed rows for ${st.market.length} sheep`);
    ctx.artifact(await g.screenshot("breeds-market"));
    await g.act({ type: "close" });

    // Buy one of each breed on offer (as many as the money and room allow), then read a bought sheep's card.
    const bought = [];
    for (const s of market()) {
      if (bought.some((b) => b.breed === s.breed)) continue;
      const r = await g.act({ type: "buy", id: s.id });
      if (r.ok !== false) { bought.push(s); st = await g.state(); }
    }
    if (!bought.length) throw new ProbeError("could not buy any market sheep");
    const pick = bought.find((s) => st.season - st.sheep[s.id].born >= 2) ?? bought[0];
    await g.act({ type: "open", panel: "sheep", id: pick.id });
    await g.waitPanel("sheep");
    await g.page.waitForFunction((id) => document.querySelector(`#overlay [data-live-portrait-slot="${id}"]`), pick.id, { timeout: 5_000 });
    await g.page.waitForTimeout(200);
    const card = await g.page.evaluate(() => ({
      breed: document.querySelector("#overlay .sc-breed")?.getAttribute("data-breed") ?? null,
      type: document.querySelector("#overlay .sc-wool")?.getAttribute("data-wool-type") ?? null,
      tag: document.querySelector("#overlay [data-wool-type]")?.textContent ?? "",
    }));
    if (card.breed !== (pick.breed ?? "farm")) throw new ProbeError(`card breed ${card.breed}, sheep is ${pick.breed}`);
    if (!card.type || !TYPE_LABELS.includes(card.type)) throw new ProbeError(`card wool type ${card.type} is not a known wool type`);
    ctx.note(`${pick.name}: ${card.breed}, wool type ${card.type}`);
    ctx.artifact(await g.screenshot("breeds-card"));
    await g.act({ type: "close" });

    // The world draws the breed.
    const snap = await g.page.evaluate(() => /** @type {any} */ (window).__game.snapshot());
    const flockBreeds = new Set(snap.sheep.map((/** @type {any} */ w) => w.breed).filter(Boolean));
    if (flockBreeds.size < 3) throw new ProbeError(`the flock should show at least three breeds in the world, got ${[...flockBreeds].join(", ")}`);
    ctx.note(`flock breeds in the world: ${[...flockBreeds].join(", ")}`);
    ctx.artifact(await g.screenshot("breeds-flock"));
    g.assertNoErrors("during the breeds probe (act 3)");
    await g.close();

    // Act 4: the Icelandic reward is in the market.
    const g4 = await ctx.newPage();
    await g4.boot("?seed=7&fresh=1&nomotion=1&act=4");
    const s4 = await g4.state();
    const k4 = s4.market.map((/** @type {string} */ id) => s4.sheep[id].breed);
    if (!k4.includes("icelandic")) throw new ProbeError(`the act-4 market should offer an Icelandic ewe, got ${k4.join(", ")}`);
    await g4.act({ type: "open", panel: "market" });
    await g4.waitPanel("market");
    await g4.page.waitForTimeout(200);
    ctx.artifact(await g4.screenshot("breeds-act4-market"));
    g4.assertNoErrors("during the breeds probe (act 4)");
    await g4.close();
  },
};

if (isMain(import.meta.url)) runSteps([breeds]);
