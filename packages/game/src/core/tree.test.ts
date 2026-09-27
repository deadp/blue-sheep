import { describe, expect, it } from "vitest";
import { advanceSeason, familyTree, newGame } from "./index.js";
import { planAll } from "./testkit.js";

describe("family tree", () => {
  it("links lambs to parents and parents to children", () => {
    const g = newGame(80);
    planAll(g);
    const r = advanceSeason(g);
    const lamb = r.lambs[0]!;
    const t = familyTree(g, lamb.id);
    expect(t.self.id).toBe(lamb.id);
    expect(t.ancestors.dam?.id).toBe(lamb.dam);
    expect(t.ancestors.sire?.id).toBe(lamb.sire);
    // The starter pair's mothers are on record (horned; see addStarterPair), their parents are not.
    expect(t.ancestors.dam?.dam?.id).toBe(g.sheep[lamb.dam!]!.dam);
    const up = familyTree(g, lamb.sire!);
    expect(up.descendants.map((d) => d.id)).toContain(lamb.id);
    expect(up.descendants.find((d) => d.id === lamb.id)!.mate?.id).toBe(lamb.dam);
    expect(() => familyTree(g, "nope")).toThrow();
  });
});
