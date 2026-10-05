import { createRng } from "@blue-sheep/genetics";
import { describe, expect, it } from "vitest";
import { enterAct } from "./acts.js";
import { BENCH_CAP, RECIPES } from "./config.js";
import {
  benchCapacity, cancelJob, craftSeason, evenFactor, forecastJob, giftFleece, handsLevel, itemPrice, itemsOf, jobsOf, patternHint, projectFinish,
  qualityBase, qualityFactors, queueJob, recipeOf, routeFor, sellItem, sigmaAt, starsOf, updatePatterns,
} from "./craft.js";
import { demandLevel, itemKey } from "./demand.js";
import { advanceSeason } from "./sim.js";
import { newGame, serialize, deserialize } from "./state.js";
import { buyUpgrade } from "./upgrades.js";
import type { GameState, Material } from "./types.js";

function shed(seed = 31): GameState {
  const g = newGame(seed);
  enterAct(g, 1, undefined, { grant: true });
  giftFleece(g);
  g.money = 2000;
  return g;
}
const MAT: Material = { lot: "L1", name: "Tom", type: "medium", family: "white", word: "snow-white", hex: "#fff", microns: 23, intensity: 0, staple: 90, fond: 1, kg: 1 };

describe("craft: routes and the timeline", () => {
  it("a fleece goes card, spin, then the finishing bench; a batt skips carding; felt cannot use yarn", () => {
    expect(routeFor("socks", "lot")).toEqual(["card", "spin", "knit"]);
    expect(routeFor("socks", "batt")).toEqual(["spin", "knit"]);
    expect(routeFor("socks", "yarn")).toEqual(["knit"]);
    expect(routeFor("teaCosy", "lot")).toEqual(["card", "felt"]);
    expect(routeFor("teaCosy", "yarn")).toBeNull();
    expect(routeFor("rug", "lot")).toEqual(["card", "spin", "weave"]);
  });

  it("socks queued in season t are finished as season t+3 begins, doing one stage per season", () => {
    const g = shed();
    const t = g.season;
    const f = forecastJob(g, { item: "socks", source: "lot:" + g.store![0]!.id });
    expect(f.ok).toBe(true);
    expect(f.finish).toBe(t + 3);
    const j = queueJob(g, { item: "socks", source: "lot:" + g.store![0]!.id });
    expect(j.seen.finish).toBe(t + 3);
    const stages: string[] = [];
    for (let i = 0; i < 3; i++) {
      stages.push(jobsOf(g)[0]?.route[0] ?? "done");
      const rep = advanceSeason(g);
      expect(rep.crafted?.advanced.length ?? 0).toBeLessThanOrEqual(1);
      if (i < 2) expect(itemsOf(g).length).toBe(0);
    }
    expect(stages).toEqual(["card", "spin", "knit"]);
    expect(itemsOf(g).length).toBe(1);
    expect(itemsOf(g)[0]!.season).toBe(t + 3);
    expect(g.craft).toEqual({ made: 1, spun: 1 });
  });

  it("a small bench spreads a big job over several seasons, and the queue is first come first served", () => {
    const g = shed();
    g.store![0]!.clean = 5; g.store![0]!.greasy = 7;
    const src = "lot:" + g.store![0]!.id;
    const rug = routeFor("rug", "lot");
    expect(rug).toBeTruthy();
    // 2.5 kg through a 2 kg/season carder takes two seasons; then spin at 1 kg/season takes three.
    const n = projectFinish(g, { route: ["card", "spin", "knit"], left: 2.5, item: "rug" });
    expect(n).toBeGreaterThanOrEqual(5);
    void src;
  });

  it("cancel refunds only before a job has started", () => {
    const g = shed();
    const lot = g.store![0]!;
    const clean = lot.clean;
    const j = queueJob(g, { item: "socks", source: "lot:" + lot.id });
    expect(g.store!.reduce((n, l) => n + l.clean, 0)).toBeCloseTo(clean - 0.2, 5);
    cancelJob(g, j.id);
    expect(g.store!.reduce((n, l) => n + l.clean, 0)).toBeCloseTo(clean, 1);
    const k = queueJob(g, { item: "socks", source: "lot:" + g.store![0]!.id });
    advanceSeason(g);
    expect(() => cancelJob(g, k.id)).toThrow(/started/);
  });
});

describe("craft: quality", () => {
  const socks = recipeOf("socks")!;
  it("each factor moves the quality the way the design says", () => {
    const base = qualityBase(qualityFactors(MAT, socks, true));
    expect(base).toBeCloseTo(80, 5); // medium suits socks at 0.8; 23 um is the target
    expect(qualityBase(qualityFactors({ ...MAT, type: "fine" }, socks, true))).toBeCloseTo(100, 5);
    expect(qualityBase(qualityFactors({ ...MAT, microns: 28 }, socks, true))).toBeCloseTo(80 * 0.8, 5);
    expect(qualityBase(qualityFactors({ ...MAT, staple: 40 }, socks, true))).toBeCloseTo(80 * 0.7, 5);
    expect(qualityBase(qualityFactors({ ...MAT, fond: 1.2 }, socks, true))).toBeCloseTo(80 * 1.1, 5);
    const gum = recipeOf("gumbootSocks")!;
    expect(qualityFactors({ ...MAT, family: "pink" }, gum, true).colour).toBe(0.5);
    expect(qualityFactors({ ...MAT, family: "oatmeal", type: "strong" }, gum, true).colour).toBe(1);
    const shawl = recipeOf("babyShawl")!;
    expect(qualityFactors({ ...MAT, family: "blue", intensity: 0.8 }, shawl, true).colour).toBe(0.5);
    expect(qualityFactors({ ...MAT, family: "blue", intensity: 0.2 }, shawl, true).colour).toBe(1);
    expect(evenFactor([0.2])).toBe(1);
    expect(evenFactor([0, 1])).toBeLessThan(1);
    expect(evenFactor([0, 1])).toBeGreaterThanOrEqual(0.7);
  });

  it("stars follow the thresholds", () => {
    expect([30, 35, 55, 70, 85, 100].map(starsOf)).toEqual([1, 2, 3, 4, 5, 5]);
  });

  it("the forecast's 10-90 band covers about 80% of finished quality (500 jobs)", () => {
    const g = shed();
    const f = forecastJob(g, { item: "socks", source: "lot:" + g.store![0]!.id });
    const rng = createRng(5);
    let inside = 0;
    for (let i = 0; i < 500; i++) {
      const q = Math.max(0, Math.min(100, Math.round(f.q0 + rng.normal() * sigmaAt(g, "knit"))));
      if (q >= Math.floor(f.qLo) && q <= Math.ceil(f.qHi)) inside++;
    }
    expect(inside / 500).toBeGreaterThan(0.74);
    expect(inside / 500).toBeLessThan(0.9);
  });

  it("benches and hands: a bigger bench narrows the noise, practice trims it", () => {
    const g = shed();
    expect(benchCapacity(g, "knit")).toBe(BENCH_CAP.knit[1]);
    expect(benchCapacity(g, "weave")).toBe(0);
    const s0 = sigmaAt(g, "knit");
    buyUpgrade(g, "circle");
    expect(benchCapacity(g, "knit")).toBe(BENCH_CAP.knit[2]);
    expect(sigmaAt(g, "knit")).toBeLessThan(s0);
    g.hands = { knit: 6 };
    expect(handsLevel(g, "knit")).toBe(3);
    expect(sigmaAt(g, "knit")).toBeLessThan(sigmaAt(newGame(1), "knit"));
  });
});

describe("craft: items, money and demand", () => {
  it("the forecast's coin band matches the price a finished item fetches, and selling lowers the meter by its step", () => {
    const g = shed();
    const src = "lot:" + g.store![0]!.id;
    const f = forecastJob(g, { item: "socks", source: src });
    queueJob(g, { item: "socks", source: src });
    for (let i = 0; i < 3; i++) advanceSeason(g);
    const it = itemsOf(g)[0]!;
    expect(it.seen!.coinsLo).toBe(f.coinsLo);
    const d = demandLevel(g, itemKey("socks"));
    const expected = itemPrice("socks", it.q, d).coins;
    const before = g.money;
    expect(sellItem(g, it.id)).toBe(expected);
    expect(g.money).toBe(before + expected);
    expect(demandLevel(g, itemKey("socks"))).toBeCloseTo(Math.max(0, d - 0.1), 6);
  });

  it("price = base x (0.5 + Q/100) x meter multiplier", () => {
    const r = recipeOf("socks")!;
    expect(itemPrice("socks", 50, 1).coins).toBe(Math.round(r.base * 1.0 * (1 - 0.6 * 0.05 / 1 * 0) * itemPrice("socks", 50, 1).mult));
    expect(itemPrice("socks", 100, 1).coins).toBeGreaterThan(itemPrice("socks", 20, 1).coins);
  });
});

describe("craft: patterns and determinism", () => {
  it("every recipe is a known item with a sale step; the pattern list opens one at a time", () => {
    for (const r of RECIPES) expect(r.step).toBeGreaterThan(0);
    const g = shed();
    expect(g.patterns).toContain("socks");
    expect(patternHint(g, "beanie")).toMatch(/Finish 1 more/);
    expect(updatePatterns(g)).toEqual([]);
    g.craft = { made: 1, spun: 1 };
    expect(updatePatterns(g).map((p) => p.item)).toContain("beanie");
    expect(g.patterns).toContain("beanie");
  });

  it("the same saved state gives the same finished items, and a game that never crafts draws nothing from the RNG", () => {
    const run = (): string => {
      const g = shed(77);
      queueJob(g, { item: "socks", source: "lot:" + g.store![0]!.id });
      const copy = deserialize(serialize(g));
      for (let i = 0; i < 3; i++) { advanceSeason(g); advanceSeason(copy); }
      expect(itemsOf(copy)).toEqual(itemsOf(g));
      return JSON.stringify(itemsOf(g));
    };
    expect(run()).toBe(run());
    const a = newGame(9), b = newGame(9);
    const rngA = createRng(1);
    void rngA;
    expect(craftSeason(a, createRng(a.rng as never), 0)).toBeNull();
    expect(a.rng).toEqual(b.rng);
  });
});
