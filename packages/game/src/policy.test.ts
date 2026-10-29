import { describe, expect, it } from "vitest";
import { enterAct, flockSheep, newGame } from "./core/index.js";
import { matingScore, type Brain, type CrossDist } from "../scripts/policy.js";

const brain: Brain = {
  name: "stub",
  cross: (): CrossDist => ({ trueBlue: 0.1, blue: 0.2, pOrder: () => 0, horns: {} }),
  doses: () => ({ blue: 1, w: 1, ry: 0 }),
};

function pair() {
  const g = newGame(7);
  enterAct(g, 2, undefined, { grant: true });
  const ewe = flockSheep(g).find((s) => s.sex === "ewe")!;
  const ram = flockSheep(g).find((s) => s.sex === "ram")!;
  const score = (fineness: number) => {
    ewe.phenotype["fineness"] = fineness; ram.phenotype["fineness"] = fineness;
    return matingScore(g, brain, ewe, ram, new Map());
  };
  return { g, score };
}

describe("farmer's mating score", () => {
  it("ignores fineness while hunting a true blue lamb", () => {
    const { g, score } = pair();
    g.stats.bluesBorn = 0;
    expect(score(16)).toBe(score(30));
  });

  it("counts fineness once a true blue lamb has been born", () => {
    const { g, score } = pair();
    g.stats.bluesBorn = 1;
    expect(score(16)).toBeGreaterThan(score(30));
  });
});
