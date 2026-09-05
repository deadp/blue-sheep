import { describe, expect, it } from "vitest";
import { factsFor, updateDiscoveries } from "./knowledge.js";
import { advanceSeason, plannedPairings, RAM_CAPACITY } from "./sim.js";
import { newGame } from "./state.js";

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
    for (const e of g.flock.filter((id) => g.sheep[id]!.sex === "ewe")) g.plans[e] = ram;
    const r = advanceSeason(g, plannedPairings(g));
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
    const white = Object.values(g.sheep).find((s) => s.phenotype["colour"] === "white" && !s.dam);
    if (white) {
      const f = factsFor(g, white.id).find((x) => x.locus === "D")!;
      expect(f.certain).toBe(false);
    }
  });

  it("does not mint discovery cards for obvious facts, but does for revealed carriers", () => {
    const g = newGame(5);
    expect(updateDiscoveries(g).length).toBe(0);
    // Breed until some lamb reveals a hidden allele in a parent.
    let cards = 0;
    for (let t = 0; t < 8 && cards === 0; t++) {
      const flock = g.flock.map((id) => g.sheep[id]!);
      const ram = flock.find((s) => s.sex === "ram" && g.season - s.born >= 2)!;
      advanceSeason(g, flock.filter((s) => s.sex === "ewe" && g.season - s.born >= 2).map((e) => ({ ewe: e.id, ram: ram.id })));
      cards += updateDiscoveries(g).length;
    }
    expect(g.discoveries.length).toBe(cards);
    expect(cards).toBeGreaterThan(0);
  });
});
