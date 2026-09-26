import { describe, expect, it } from "vitest";
import { FOX_GUARD_BOLDNESS, flavoursOf, newGame, personalityFromBoldness, personalityLine, personalityOf, PERSONALITY_WORD } from "./index.js";

const sheep = (id: string, ph: Record<string, number | string>) => ({ id, phenotype: ph });

describe("personality", () => {
  it("maps boldness to four temperaments, bold exactly where the fox guard starts", () => {
    expect(personalityFromBoldness(0)).toBe("shy");
    expect(personalityFromBoldness(3.49)).toBe("shy");
    expect(personalityFromBoldness(3.5)).toBe("calm");
    expect(personalityFromBoldness(5.2)).toBe("calm");
    expect(personalityFromBoldness(5.25)).toBe("curious");
    expect(personalityFromBoldness(FOX_GUARD_BOLDNESS - 0.01)).toBe("curious");
    expect(personalityFromBoldness(FOX_GUARD_BOLDNESS)).toBe("bold");
    expect(personalityFromBoldness(10)).toBe("bold");
    expect(personalityFromBoldness(Number.NaN)).toBe("calm");
  });

  it("is deterministic and survives a rename", () => {
    const a = sheep("s12", { boldness: 6.1 });
    expect(personalityOf(a)).toBe("curious");
    const line = personalityLine(a);
    expect(line).toMatch(/^Curious — [a-z].+\.$/);
    expect(personalityLine({ ...a })).toBe(line);
  });

  it("gives every sheep in a new flock a one-line description without genetics words", () => {
    const s = newGame(7);
    const seen = new Set<string>();
    for (const id of [...s.flock, ...s.market]) {
      const x = s.sheep[id]!;
      const p = personalityOf(x);
      seen.add(p);
      const line = personalityLine(x);
      expect(line.startsWith(`${PERSONALITY_WORD[p]} — `)).toBe(true);
      expect(line).not.toMatch(/[A-Za-z]\/[A-Za-z]|allele|gene|carrier|%|\d/);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("describes looks from what you can see", () => {
    expect(flavoursOf(sheep("a", { fleeceWeight: 5.5, size: 75, crimp: 5, fineness: 25 }))).toEqual(["fluffy", "stocky"]);
    expect(flavoursOf(sheep("b", { fleeceWeight: 3, size: 44, crimp: 7, fineness: 19 }))).toEqual(["dainty", "curly"]);
    expect(flavoursOf(sheep("c", { fleeceWeight: 4, size: 60, crimp: 5, fineness: 26 }))).toEqual([]);
  });
});
