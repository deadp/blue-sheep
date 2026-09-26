import { describe, expect, it } from "vitest";
import { createRng } from "@blue-sheep/genetics";
import { advanceSeason, enterAct, enterFair, fairOdds, flockSheep, forecastFair, newGame } from "./index.js";
import { judgeFair } from "./fair.js";
import { GENOTYPE_RE } from "./testkit.js";

describe("fair", () => {
  it("forecast is monotone in entry quality and the field gets tougher each year", () => {
    let prev = { pWin: -1, pPlace: -1 };
    for (let s = -1; s <= 4; s += 0.25) {
      const o = fairOdds(s, 10);
      expect(o.pWin).toBeGreaterThanOrEqual(prev.pWin);
      expect(o.pPlace).toBeGreaterThanOrEqual(prev.pPlace);
      expect(o.pPlace).toBeGreaterThanOrEqual(o.pWin);
      prev = o;
    }
    expect(fairOdds(2, 2).pWin).toBeGreaterThan(fairOdds(2, 30).pWin);
  });

  it("finer wool gives better odds in the finest-wool class", () => {
    const g = newGame(40);
    enterAct(g, 2);
    g.fair.category = "fine";
    const [a, b] = flockSheep(g);
    a!.phenotype["fineness"] = 19; b!.phenotype["fineness"] = 27;
    const fa = forecastFair(g, a!.id), fb = forecastFair(g, b!.id);
    expect(fa.pWin).toBeGreaterThan(fb.pWin);
    expect(fa.text).not.toMatch(GENOTYPE_RE);
  });

  it("is only open from act 2 and judges in autumn, paying prizes and rosettes", () => {
    const g = newGame(41);
    expect(() => enterFair(g, g.flock[0]!)).toThrow(/isn't open/);
    enterAct(g, 2);
    expect(g.fair.nextSeason).toBe(2);
    const star = flockSheep(g)[0]!;
    star.phenotype["fineness"] = 5; star.phenotype["fleeceWeight"] = 20; star.phenotype["size"] = 200; star.phenotype["colour"] = "blue";
    enterFair(g, star.id);
    let res = null;
    while (!res) res = advanceSeason(g).fairResult;
    expect(res.season).toBe(2);
    expect(res.place).toBe(1);
    expect(res.prize).toBeGreaterThan(0);
    expect(star.rosettes).toHaveLength(1);
    expect(g.stats.fairsWon).toBe(1);
    expect(g.fair.nextSeason).toBe(6);
    expect(g.fair.entry).toBeNull();
    expect(res.field.length).toBe(4);
  });

  it("a poor entry is usually unplaced; no entry still records the fair", () => {
    const g = newGame(42);
    enterAct(g, 2);
    const res = judgeFair(g, createRng(1));
    expect(res.entry).toBeNull();
    expect(res.place).toBeNull();
    expect(g.fair.history).toHaveLength(1);
  });
});
