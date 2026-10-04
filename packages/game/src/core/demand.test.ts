import { describe, expect, it } from "vitest";
import { DEMAND_FLOOR, DEMAND_MAX, RAW_REFILL, SEASON_SWING } from "./config.js";
import { demandLevel, demandMult, demandTarget, demandWord, lowerDemand, rawKey, refillDemand, sellRun } from "./demand.js";
import { newGame } from "./index.js";

describe("demand meters", () => {
  it("price multiplier: 0.4 at the floor, 1.0 at rest, capped at the top of the range", () => {
    expect(demandMult(0)).toBeCloseTo(DEMAND_FLOOR);
    expect(demandMult(1)).toBeCloseTo(1);
    expect(demandMult(DEMAND_MAX)).toBeCloseTo(1.3);
    expect(demandMult(9)).toBeCloseTo(1.3);
    expect(demandMult(-1)).toBeCloseTo(DEMAND_FLOOR);
  });

  it("a sale steps the meter down, never below zero, and pays on the straight-line average", () => {
    const run = sellRun(1, 10, 0.02);
    expect(run.after).toBeCloseTo(0.8);
    expect(run.mult).toBeCloseTo(demandMult(0.9));
    expect(sellRun(0.1, 10, 0.05).after).toBe(0);
    const g = newGame(1);
    const k = rawKey("fine");
    lowerDemand(g, k, 5);
    expect(demandLevel(g, k)).toBe(0);
    expect(demandMult(demandLevel(g, k))).toBeGreaterThan(0);
  });

  it("refills part of the way to the seasonal target each season, and drops the key once it is back", () => {
    const g = newGame(2);
    const k = rawKey("medium");
    g.demand = { [k]: 0.2 };
    refillDemand(g, 1);
    expect(g.demand![k]).toBeCloseTo(0.2 + 0.8 * RAW_REFILL);
    for (let i = 0; i < 12; i++) refillDemand(g, 1);
    expect(g.demand![k]).toBeUndefined();
    expect(demandLevel(g, k)).toBe(demandTarget(k, g.season));
  });

  it("targets swing with the time of year: warm wool up in autumn, fine up in spring; items sit at rest", () => {
    expect(demandTarget(rawKey("strong"), 2)).toBeCloseTo(1 + SEASON_SWING);
    expect(demandTarget(rawKey("strong"), 0)).toBeCloseTo(1 - SEASON_SWING);
    expect(demandTarget(rawKey("fine"), 0)).toBeCloseTo(1 + SEASON_SWING);
    expect(demandTarget(rawKey("fine"), 3)).toBe(1);
    expect(demandTarget("item:socks", 2)).toBe(1);
  });

  it("an over-supplied meter refills down toward a lower target at the item rate", () => {
    const g = newGame(3);
    g.demand = { "item:socks": 1.4 };
    refillDemand(g, 1);
    expect(g.demand["item:socks"]).toBeLessThan(1.4);
    expect(g.demand["item:socks"]).toBeGreaterThan(1);
  });

  it("words run from glutted to begging for it", () => {
    expect([0.1, 0.5, 0.8, 1, 1.3].map(demandWord)).toEqual(["glutted", "slow", "steady", "keen", "begging for it"]);
  });
});
