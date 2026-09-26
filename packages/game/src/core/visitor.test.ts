import { describe, expect, it } from "vitest";
import {
  advanceSeason, candidates, enterAct, forecastVisitor, flockSheep, forecastCross, hireVisitingRam, newGame, planMating,
} from "./index.js";

function toSpring(g: ReturnType<typeof newGame>) {
  enterAct(g, 3);
  g.money = 500;
  while (!g.visitingRam) advanceSeason(g);
}

describe("visiting ram", () => {
  it("is offered each spring from act 3 only", () => {
    const g = newGame(50);
    for (let i = 0; i < 5; i++) advanceSeason(g);
    expect(g.visitingRam).toBeNull();
    toSpring(g);
    expect(g.season % 4).toBe(0);
    const v = g.visitingRam!;
    expect(g.sheep[v.id]!.origin).toBe("visitor");
    expect(g.sheep[v.id]!.dam).toBeNull();
    expect(g.flock).not.toContain(v.id);
    expect(v.fee).toBeGreaterThan(0);
  });

  it("appears as a candidate with a forecast before hiring; must be hired to plan", () => {
    const g = newGame(51);
    toSpring(g);
    const v = g.visitingRam!;
    const ewe = flockSheep(g).find((s) => s.sex === "ewe" && g.season - s.born >= 2)!;
    expect(candidates(g, ewe.id).map((s) => s.id)).toContain(v.id);
    const f = forecastCross(g, ewe.id, v.id);
    expect(f.relatedness).toBe(0);
    expect(() => planMating(g, ewe.id, v.id)).toThrow(/Hire/);
    const fv = forecastVisitor(g);
    expect(fv.text).toMatch(/no kin/);
    expect(fv.bestBlue).toBeGreaterThanOrEqual(0);
    const money = g.money;
    hireVisitingRam(g);
    expect(g.money).toBe(money - v.fee);
    expect(g.hiredRam).toBe(v.id);
    expect(() => hireVisitingRam(g)).toThrow(/already/);
    planMating(g, ewe.id, v.id);
    const r = advanceSeason(g);
    const kids = r.lambs.filter((l) => l.sire === v.id);
    expect(kids.length).toBeGreaterThanOrEqual(1);
    // He leaves after his season but stays in the records as the sire.
    expect(g.visitingRam).toBeNull();
    expect(g.hiredRam).toBeNull();
    expect(g.sheep[v.id]).toBeDefined();
  });

  it("an unhired visitor leaves no trace", () => {
    const g = newGame(52);
    toSpring(g);
    const id = g.visitingRam!.id;
    advanceSeason(g);
    expect(g.sheep[id]).toBeUndefined();
  });
});
