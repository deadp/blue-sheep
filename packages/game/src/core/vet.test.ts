import { describe, expect, it } from "vitest";
import { enterAct, factsFor, forecastVet, marginal, newGame, VET_FEE, vetTest, entropyBits } from "./index.js";
import { GENOTYPE_RE } from "./testkit.js";

describe("vet", () => {
  it("needs the vet unlock, charges the fee and pins the locus", () => {
    const g = newGame(60);
    const white = Object.values(g.sheep).find((s) => g.flock.includes(s.id) && s.phenotype["colour"] === "white")!;
    expect(() => vetTest(g, white.id, "D")).toThrow(/hasn't opened/);
    enterAct(g, 1, undefined, { grant: true });
    const before = forecastVet(g, white.id, "D");
    expect(before.gainBits).toBeGreaterThan(0.3);
    expect(before.gainBits).toBeCloseTo(entropyBits(Object.values(marginal(g, white.id, "D"))), 6);
    expect(before.text).not.toMatch(GENOTYPE_RE);
    const money = g.money;
    vetTest(g, white.id, "D");
    expect(g.money).toBe(money - VET_FEE);
    expect(white.tested["D"]).toBeDefined();
    const after = forecastVet(g, white.id, "D");
    expect(after.gainBits).toBe(0);
    const fact = factsFor(g, white.id).find((f) => f.locus === "D")!;
    expect(fact.certain).toBe(true);
    expect(entropyBits(Object.values(marginal(g, white.id, "D")))).toBeLessThan(0.01);
    expect(() => vetTest(g, white.id, "D")).toThrow(/already/);
    expect(g.log.at(-1)!.text).not.toMatch(GENOTYPE_RE);
  });

  it("says a test is pointless when the answer is already obvious", () => {
    const g = newGame(61);
    enterAct(g, 1, undefined, { grant: true });
    const horned = Object.values(g.sheep).find((s) => s.phenotype["horns"] === "horned");
    if (horned) expect(forecastVet(g, horned.id, "P").gainBits).toBeLessThan(0.02);
    expect(() => forecastVet(g, g.flock[0]!, "Z")).toThrow();
  });

  it("refuses when coins are short", () => {
    const g = newGame(62);
    enterAct(g, 1, undefined, { grant: true });
    g.money = VET_FEE - 1;
    expect(() => vetTest(g, g.flock[0]!, "A")).toThrow(/costs/);
  });
});
