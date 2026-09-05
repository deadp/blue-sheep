import { describe, expect, it } from "vitest";
import { Pedigree } from "./pedigree.js";

function family(): Pedigree {
  const p = new Pedigree();
  p.add("A", null, null);
  p.add("B", null, null);
  p.add("C", "A", "B"); // full sibs C, D
  p.add("D", "A", "B");
  p.add("E", null, null);
  p.add("F", "A", "E"); // half sib of C via A
  p.add("G", "C", "D"); // full-sib mating
  p.add("H", "C", "B"); // dam × her sire
  p.add("I", "C", "F"); // half-sib mating
  return p;
}

describe("pedigree", () => {
  const p = family();
  it("founders are unrelated and non-inbred", () => {
    expect(p.inbreeding("A")).toBe(0);
    expect(p.relatedness("A", "B")).toBe(0);
    expect(p.relatedness("A", "A")).toBe(1);
  });
  it("parent–offspring and full sibs have relatedness 0.5, half sibs 0.25", () => {
    expect(p.relatedness("A", "C")).toBe(0.5);
    expect(p.relatedness("C", "D")).toBe(0.5);
    expect(p.relatedness("C", "F")).toBe(0.25);
  });
  it("full-sib mating gives F = 0.25", () => {
    expect(p.inbreeding("G")).toBe(0.25);
  });
  it("parent–offspring mating gives F = 0.25", () => {
    expect(p.inbreeding("H")).toBe(0.25);
  });
  it("half-sib mating gives F = 0.125", () => {
    expect(p.inbreeding("I")).toBe(0.125);
  });
  it("predicts offspring inbreeding before mating", () => {
    expect(p.offspringInbreeding("C", "D")).toBe(0.25);
    expect(p.offspringInbreeding("A", "E")).toBe(0);
  });
  it("round-trips through JSON", () => {
    const q = Pedigree.fromJSON(p.toJSON());
    expect(q.inbreeding("I")).toBe(0.125);
  });
});
