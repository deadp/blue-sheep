import { describe, expect, it } from "vitest";
import {
  ACTS, advanceSeason, checkActAdvance, currentAct, enterAct, flockSheep, isEnding, markEndingShown, newGame, registryStatus,
} from "./index.js";
import { GENOTYPE_RE, planAll } from "./testkit.js";

describe("acts", () => {
  it("act 0 → 1 when the first lambs are born, unlocking cards, vet and orders", () => {
    const g = newGame(11);
    expect(currentAct(g).act).toBe(0);
    expect(g.unlocks).toEqual([]);
    planAll(g);
    const r = advanceSeason(g);
    expect(r.actAdvanced?.act).toBe(1);
    expect(r.actAdvanced?.line).toBe(ACTS[1]!.line);
    expect(g.unlocks).toEqual(expect.arrayContaining(["cards", "vet", "orders"]));
  });

  it("a rosette won in the season an act begins counts toward that act's goal", () => {
    // Season: the fair is judged (a win), then the third order fills and act 2 → 3.
    // The report shows the rosette next to "Win first place at the fair", so it must count.
    const g = newGame(13);
    enterAct(g, 2);
    const baseline = { ordersFilled: g.stats.ordersFilled, fairsWon: g.stats.fairsWon };
    g.stats.fairsWon += 1;
    g.stats.ordersFilled += 3;
    expect(checkActAdvance(g, baseline)?.act).toBe(3);
    expect(currentAct(g).progress).toBe(1);
    expect(checkActAdvance(g)?.act).toBe(4);
  });

  it("without a baseline, progress counts from the moment the act is entered", () => {
    const g = newGame(14);
    enterAct(g, 2);
    g.stats.fairsWon += 1;
    g.stats.ordersFilled += 3;
    expect(checkActAdvance(g)?.act).toBe(3);
    expect(currentAct(g).progress).toBe(0);
  });

  it("goals advance one act at a time with the right unlocks and caps", () => {
    const g = newGame(12);
    g.stats.lambsBorn = 1;
    expect(checkActAdvance(g)?.act).toBe(1);
    expect(checkActAdvance(g)).toBeNull(); // no blue yet
    g.stats.bluesBorn = 1;
    expect(checkActAdvance(g)?.act).toBe(2);
    expect(g.unlocks).toEqual(expect.arrayContaining(["numbers", "fair"]));
    expect(currentAct(g).progress).toBe(0);
    g.stats.ordersFilled += 2;
    expect(currentAct(g).progress).toBeCloseTo(2 / 3);
    expect(checkActAdvance(g)).toBeNull();
    g.stats.ordersFilled += 1;
    expect(checkActAdvance(g)?.act).toBe(3);
    expect(g.flockCap).toBe(16);
    expect(g.unlocks).toEqual(expect.arrayContaining(["tree", "visitor"]));
    g.stats.fairsWon += 1;
    expect(checkActAdvance(g)?.act).toBe(4);
    expect(g.flockCap).toBe(24);
    expect(checkActAdvance(g)).toBeNull(); // act 4 is the last
  });

  it("orders filled before act 2 do not count toward it", () => {
    const g = newGame(13);
    enterAct(g, 1);
    g.stats.ordersFilled = 5;
    enterAct(g, 2);
    expect(currentAct(g).progress).toBe(0);
  });

  it("registry goal triggers the ending once, then endless mode", () => {
    const g = newGame(14);
    enterAct(g, 4);
    expect(registryStatus(g).met).toBe(false);
    expect(currentAct(g).progress).toBeLessThan(1);
    // Make six unrelated fine blue sheep.
    for (const s of flockSheep(g)) { s.phenotype["colour"] = "blue"; s.phenotype["fineness"] = 20; }
    const extra = g.market.slice(0, 1);
    for (const id of extra) { g.flock.push(id); g.sheep[id]!.phenotype["colour"] = "blue"; g.sheep[id]!.phenotype["fineness"] = 20; }
    expect(registryStatus(g).met).toBe(true);
    const r = advanceSeason(g);
    expect(r.endingReached).toBe(true);
    expect(isEnding(g)).toBe(true);
    markEndingShown(g);
    expect(isEnding(g)).toBe(false);
    expect(currentAct(g).endless).toBe(true);
    expect(advanceSeason(g).endingReached).toBe(false);
  });

  it("act texts carry no genotype strings", () => {
    const g = newGame(15);
    for (const a of [0, 1, 2, 3, 4] as const) {
      enterAct(g, a);
      const info = currentAct(g);
      for (const t of [info.title, info.line, info.goalText, info.progressText]) expect(t).not.toMatch(GENOTYPE_RE);
    }
  });
});
