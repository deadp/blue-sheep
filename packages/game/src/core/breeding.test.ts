import { describe, expect, it } from "vitest";
import { advanceSeason, canBreed, flockSheep, lambRoom, newGame, planMating, unplanMating } from "./index.js";
import { planAll } from "./testkit.js";

describe("litter rule", () => {
  it("every valid planned mating yields at least one lamb (40 seeds × 3 seasons)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = newGame(seed);
      for (let t = 0; t < 3; t++) {
        planAll(g);
        const planned = Object.keys(g.plans).filter((e) => !g.sheep[e]!.ill);
        const r = advanceSeason(g);
        for (const ewe of planned) expect(r.lambs.filter((l) => l.dam === ewe).length, `seed ${seed} ewe ${ewe}`).toBeGreaterThanOrEqual(1);
        for (const ewe of planned) expect(r.lambs.filter((l) => l.dam === ewe).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("an ill ewe cannot be planned, and a ewe that falls ill before lambing has no lamb", () => {
    const g = newGame(9);
    const ewe = flockSheep(g).find((s) => s.sex === "ewe")!;
    const ram = flockSheep(g).find((s) => s.sex === "ram")!;
    ewe.ill = true;
    expect(canBreed(ewe, g.season)).toBe(false);
    expect(() => planMating(g, ewe.id, ram.id)).toThrow(/poorly/);
    ewe.ill = false;
    planMating(g, ewe.id, ram.id);
    ewe.ill = true; // e.g. a hard winter strikes before lambing
    const r = advanceSeason(g);
    expect(r.lambs.filter((l) => l.dam === ewe.id)).toHaveLength(0);
    expect(r.messages.join(" ")).toMatch(/too poorly/);
    expect(g.sheep[ewe.id]!.ill).toBe(false); // well again after a season
  });

  it("planMating toggles, respects ram capacity and room for lambs", () => {
    const g = newGame(10);
    const ewe = flockSheep(g).find((s) => s.sex === "ewe")!;
    const ram = flockSheep(g).find((s) => s.sex === "ram")!;
    planMating(g, ewe.id, ram.id);
    expect(g.plans[ewe.id]).toBe(ram.id);
    planMating(g, ewe.id, ram.id);
    expect(g.plans[ewe.id]).toBeUndefined();
    planMating(g, ewe.id, ram.id);
    unplanMating(g, ewe.id);
    expect(g.plans).toEqual({});
    g.flockCap = g.flock.length; // full
    expect(lambRoom(g)).toBe(0);
    expect(() => planMating(g, ewe.id, ram.id)).toThrow(/No room/);
  });
});
