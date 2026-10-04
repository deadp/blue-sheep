import { woolType, type FleeceMeasures } from "@blue-sheep/genetics";
import { describe, expect, it } from "vitest";
import { fleeceWords, finenessWord, ITEM_IDS, itemsSuiting, lustreWord, stapleWord, strengthWord, WOOL_TYPES, woolSuit, woolTypeOf } from "./index.js";
import { newGame } from "./state.js";

const m = (o: Partial<FleeceMeasures>): FleeceMeasures => ({ fineness: 30, staple: 90, lustre: 4, doubleCoat: false, hairy: false, ...o });

describe("wool type classification (DESIGN-v3 §3.3)", () => {
  it("one case per row, in rule order", () => {
    expect(woolType(m({ doubleCoat: true, staple: 140, fineness: 27 }))).toBe("lopi");
    expect(woolType(m({ hairy: true, fineness: 30 }))).toBe("carpet");
    expect(woolType(m({ fineness: 40, staple: 190 }))).toBe("carpet");
    expect(woolType(m({ fineness: 19, staple: 75 }))).toBe("fine");
    expect(woolType(m({ fineness: 26, staple: 100 }))).toBe("medium");
    expect(woolType(m({ fineness: 34, lustre: 7, staple: 150 }))).toBe("lustre");
    expect(woolType(m({ fineness: 30, staple: 120 }))).toBe("strong");
    expect(woolType(m({ fineness: 30, staple: 90 }))).toBe("crossbred");
  });
  it("boundaries", () => {
    expect(woolType(m({ doubleCoat: true, staple: 109.9 }))).not.toBe("lopi");
    expect(woolType(m({ doubleCoat: true, staple: 110 }))).toBe("lopi");
    expect(woolType(m({ fineness: 21.5 }))).toBe("fine");
    expect(woolType(m({ fineness: 21.6 }))).toBe("medium");
    expect(woolType(m({ fineness: 27 }))).toBe("medium");
    expect(woolType(m({ fineness: 36.9, lustre: 0, staple: 50 }))).toBe("crossbred");
    expect(woolType(m({ fineness: 37 }))).toBe("carpet");
    expect(woolType(m({ fineness: 31.5, lustre: 6, staple: 130 }))).toBe("lustre");
    expect(woolType(m({ fineness: 31.5, lustre: 5.9, staple: 130 }))).toBe("strong");
    expect(woolType(m({ fineness: 33, staple: 100 }))).toBe("strong");
    expect(woolType(m({ fineness: 33.1, staple: 129, lustre: 3 }))).toBe("crossbred");
  });
});

describe("the card's fleece words", () => {
  const s = newGame(3);
  const sheep = s.sheep[s.flock[0]!]!;
  it("woolTypeOf is the classification of the measured phenotype", () => {
    for (const x of Object.values(s.sheep)) {
      expect(woolTypeOf(x)).toBe(woolType({ fineness: Number(x.phenotype["fineness"]), staple: Number(x.phenotype["staple"]), lustre: Number(x.phenotype["lustre"]), doubleCoat: x.phenotype["coat"] === "double", hairy: x.phenotype["hair"] === "hairy" }));
    }
  });
  it("shows numbers only when asked", () => {
    const plain = fleeceWords(sheep, false), nums = fleeceWords(sheep, true);
    expect(plain.line).not.toMatch(/\d/);
    expect(nums.line).toMatch(/µm/);
    expect(nums.line).toMatch(/mm/);
    expect(plain.label).toBe(nums.label);
  });
  it("words are monotone", () => {
    expect(finenessWord(18)).toBe("very fine");
    expect(finenessWord(41)).toBe("very coarse");
    expect(stapleWord(60)).toBe("short");
    expect(stapleWord(170)).toBe("very long");
    expect(lustreWord(1)).toBe("matt");
    expect(lustreWord(8)).toBe("mirror-bright");
    expect(strengthWord(0.7)).toBe("soft colour");
    expect(strengthWord(1.35)).toBe("strong colour");
  });
});

describe("which items each wool type suits (data for the woolshed)", () => {
  it("matches the §6.1 pairings the user asked for", () => {
    expect(woolSuit("fine", "socks")).toBe(1);
    expect(woolSuit("fine", "babyShawl")).toBe(1);
    expect(woolSuit("lopi", "lopapeysa")).toBe(1);
    expect(woolSuit("carpet", "rug")).toBe(1);
    expect(woolSuit("carpet", "socks")).toBe(0);
    expect(woolSuit("strong", "bushShirt")).toBe(1);
    expect(itemsSuiting("lopi", 1)).toContain("lopapeysa");
    for (const t of WOOL_TYPES) for (const i of ITEM_IDS) expect([0, 0.55, 0.8, 1]).toContain(woolSuit(t, i));
    for (const t of WOOL_TYPES) expect(woolSuit(t, "dryerBalls")).toBe(0.8);
  });
});
