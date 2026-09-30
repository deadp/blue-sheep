import { describe, expect, it } from "vitest";
import { advanceSeason, factsFor, newGame, plannedPairings, planMating, RAM_CAPACITY, updateDiscoveries } from "./index.js";
import { planAll } from "./testkit.js";

describe("planned pairings", () => {
  it("drops stale plans and caps ewes per ram", () => {
    const g = newGame(2);
    const ram = g.flock.find((id) => g.sheep[id]!.sex === "ram")!;
    const ewes = g.flock.filter((id) => g.sheep[id]!.sex === "ewe");
    for (const e of ewes) g.plans[e] = ram;
    g.plans["ghost"] = ram;
    const p = plannedPairings(g);
    expect(p.length).toBe(Math.min(ewes.length, RAM_CAPACITY));
    expect(p.every((x) => x.ram === ram)).toBe(true);
  });

  it("planned matings produce lambs", () => {
    const g = newGame(3);
    const ram = g.flock.find((id) => g.sheep[id]!.sex === "ram")!;
    for (const e of g.flock.filter((id) => g.sheep[id]!.sex === "ewe")) planMating(g, e, ram);
    const r = advanceSeason(g);
    expect(r.lambs.length).toBeGreaterThan(0);
  });
});

describe("facts and discoveries", () => {
  it("horned sheep is certainly horned; white sheep's hidden colour is unknown at first", () => {
    const g = newGame(4);
    const horned = Object.values(g.sheep).find((s) => s.phenotype["horns"] === "horned");
    if (horned) {
      const f = factsFor(g, horned.id).find((x) => x.locus === "P")!;
      expect(f.certain).toBe(true);
      expect(f.genotype).toBe("p/p");
    }
    const white = Object.values(g.sheep).find((s) => s.phenotype["white"] === "white" && !s.dam && g.market.includes(s.id));
    if (white) {
      for (const gene of ["W", "red", "yellow", "blue", "Dl"] as const) {
        const f = factsFor(g, white.id).find((x) => x.locus === gene)!;
        expect(f.certain, gene).toBe(false);
      }
    }
  });

  it("does not mint discovery cards for obvious facts, but does for revealed carriers", () => {
    const g = newGame(5);
    expect(updateDiscoveries(g).length).toBe(0);
    let cards = 0;
    for (let t = 0; t < 10 && cards === 0; t++) {
      planAll(g);
      cards += advanceSeason(g).discoveries.length;
    }
    expect(g.discoveries.length).toBe(cards);
    expect(g.stats.discoveries).toBe(cards);
    expect(cards).toBeGreaterThan(0);
    expect(g.discoveries.every((d) => d.id && d.locus && !/\//.test(d.text))).toBe(true);
  });
});
