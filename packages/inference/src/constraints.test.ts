import { describe, expect, it } from "vitest";
import { sheep } from "@blue-sheep/genetics";
import { inferDiscrete, judgeGuess, type Individual } from "./constraints.js";

const { map } = sheep.sheep;
const ind = (id: string, dam: string | null, sire: string | null, ph: Record<string, string>, tested = {}): Individual =>
  ({ id, dam, sire, phenotype: ph, tested });

describe("inference", () => {
  it("horned sheep is known p/p; polled with no kids is open", () => {
    const r = inferDiscrete(map, sheep.horns, [ind("a", null, null, { horns: "horned" }), ind("b", null, null, { horns: "polled" })]);
    expect(r["a"]!["P"]).toEqual(["p/p"]);
    expect(r["b"]!["P"]).toEqual(["P/P", "p/P"]);
  });

  it("two polled parents with a horned lamb are both carriers", () => {
    const r = inferDiscrete(map, sheep.horns, [
      ind("d", null, null, { horns: "polled" }),
      ind("s", null, null, { horns: "polled" }),
      ind("k", "d", "s", { horns: "horned" }),
    ]);
    expect(r["d"]!["P"]).toEqual(["p/P"]);
    expect(r["s"]!["P"]).toEqual(["p/P"]);
  });

  it("polled lamb of a horned parent must be a carrier", () => {
    const r = inferDiscrete(map, sheep.horns, [
      ind("d", null, null, { horns: "horned" }),
      ind("s", null, null, { horns: "polled" }),
      ind("k", "d", "s", { horns: "polled" }),
    ]);
    expect(r["k"]!["P"]).toEqual(["p/P"]);
  });

  it("blue lamb from black parents pins both parents to d/D and a/a", () => {
    const r = inferDiscrete(map, sheep.colour, [
      ind("d", null, null, { colour: "black" }),
      ind("s", null, null, { colour: "black" }),
      ind("k", "d", "s", { colour: "blue" }),
    ]);
    expect(r["d"]!["D"]).toEqual(["d/D"]);
    expect(r["s"]!["D"]).toEqual(["d/D"]);
    expect(r["d"]!["A"]).toEqual(["a/a"]);
    expect(r["k"]!["B"]).toEqual(["B/B", "b/B"]);
  });

  it("white sheep with a brown lamb reveals hidden B and D alleles", () => {
    const r = inferDiscrete(map, sheep.colour, [
      ind("d", null, null, { colour: "white" }),
      ind("s", null, null, { colour: "brown" }),
      ind("k", "d", "s", { colour: "brown" }),
    ]);
    expect(r["d"]!["A"]).toEqual(["a/Aw"]);
    expect(r["d"]!["B"]).toEqual(["b/B", "b/b"]);
    expect(r["s"]!["B"]).toEqual(["b/b"]);
  });

  it("vet test fixes a locus", () => {
    const r = inferDiscrete(map, sheep.horns, [ind("b", null, null, { horns: "polled" }, { P: "P/P" })]);
    expect(r["b"]!["P"]).toEqual(["P/P"]);
  });

  it("judgeGuess", () => {
    expect(judgeGuess(["p/P"], "p/P")).toBe("correct");
    expect(judgeGuess(["P/P", "p/P"], "p/P")).toBe("open");
    expect(judgeGuess(["p/p"], "p/P")).toBe("wrong");
  });
});
