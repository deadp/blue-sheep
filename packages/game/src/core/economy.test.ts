import { describe, expect, it } from "vitest";
import { advanceSeason, buySheep, FEED_COST, flockSheep, newGame, sheepValue } from "./index.js";

describe("economy", () => {
  it("charges feed per sheep and never lets coins go below zero (auto-sells the cheapest)", () => {
    const g = newGame(20);
    for (const s of flockSheep(g)) s.phenotype["fleeceWeight"] = 0; // no wool income this season
    g.money = 0;
    const cheapest = [...flockSheep(g)].sort((a, b) => sheepValue(a, g.season) - sheepValue(b, g.season) || a.born - b.born)[0]!;
    const r = advanceSeason(g);
    expect(g.money).toBeGreaterThanOrEqual(0);
    expect(r.autoSold.length).toBeGreaterThan(0);
    expect(r.autoSold[0]!.id).toBe(cheapest.id);
    expect(r.autoSold[0]!.reason).toBe("feed");
    expect(r.feed).toBe(g.flock.length * FEED_COST);
    expect(r.messages.join(" ")).toMatch(/trader took/);
  });

  it("feed is paid normally when coins suffice", () => {
    const g = newGame(21);
    g.money = 100;
    const n = g.flock.length;
    const r = advanceSeason(g);
    expect(r.feed).toBe(n * FEED_COST);
    expect(r.autoSold).toHaveLength(0);
    expect(g.money).toBe(100 + r.income - r.feed);
  });

  it("the flock never stays over its cap after a season", () => {
    const g = newGame(22);
    g.money = 1000;
    g.flockCap = 20;
    for (const id of [...g.market]) buySheep(g, id);
    g.flockCap = 3;
    const r = advanceSeason(g);
    expect(g.flock.length).toBeLessThanOrEqual(3);
    expect(r.autoSold.some((a) => a.reason === "room")).toBe(true);
  });

  it("buying checks coins and room with readable errors", () => {
    const g = newGame(23);
    g.money = 0;
    expect(() => buySheep(g, g.market[0]!)).toThrow(/costs/);
    g.money = 1000;
    g.flockCap = g.flock.length;
    expect(() => buySheep(g, g.market[0]!)).toThrow(/full/);
  });

  it("lambs sell for less than adults", () => {
    const g = newGame(24);
    const s = flockSheep(g)[0]!;
    expect(sheepValue(s, s.born + 1)).toBeLessThan(sheepValue(s, s.born + 4));
  });
});
