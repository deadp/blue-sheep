import { describe, expect, it } from "vitest";
import { newGame, colourText, type LambSwatch } from "../core/index.js";
import { litterLooks, litterRow, litterWords } from "./forecast.js";

const sw = (key: string, word: string, p: number, extra: Partial<LambSwatch> = {}): LambSwatch =>
  ({ key, word, name: word, family: "red", hex: "#C8322F", p, hidden: false, trueBlue: false, band: "bright", intensity: 0.5, ...extra });

describe("forecast panel wording", () => {
  const swatches = [sw("snow-white", "snow-white", 0.6, { hidden: true, family: "white" }), sw("orange:bright", "bright orange", 0.3), sw("purple:soft", "soft purple", 0.07), sw("blue:vivid", "vivid blue", 0.03, { trueBlue: true })];
  const f = { swatches, trueBlue: 0.03, horns: { horned: 0.3 }, pattern: { spotted: 0.3 } } as never;

  it("the caption says long shots sit outside the ten, only when there are some", () => {
    const g = newGame(3);
    expect(litterRow(g, f)).toContain("Each lamb = one chance in ten; long shots sit outside the ten");
    const plain = { swatches: swatches.slice(0, 2).map((s, i) => ({ ...s, p: [0.6, 0.4][i]! })), trueBlue: 0, horns: {}, pattern: {} } as never;
    expect(litterRow(g, plain)).not.toContain("sit outside");
  });

  it("horns are spread over the ten, not packed onto the first tiles", () => {
    const looks = litterLooks(f);
    const horned = looks.flatMap((l, i) => (l.horns === "horned" ? [i] : []));
    expect(horned).toHaveLength(3);
    expect(horned).not.toEqual([0, 1, 2]);
    expect(Math.max(...horned) - Math.min(...horned)).toBeGreaterThanOrEqual(5);
  });

  it("a horn share under 8% is called a long shot", () => {
    const g = newGame(3);
    expect(litterRow(g, { ...(f as object), horns: { horned: 0.06 } } as never)).toContain("a long shot at horned");
  });

  it("names up to four colours, then 'a couple of others'", () => {
    const many = ["a", "b", "c", "d", "e"].map((n, i) => sw(`${n}:bright`, `bright ${n}`, [0.3, 0.2, 0.2, 0.15, 0.15][i]!));
    const t = colourText({ swatches: many, trueBlue: 0 });
    expect(t).toContain("bright d");
    expect(t).not.toContain("bright e");
    expect(t).toContain("a couple of others");
    expect(litterWords(newGame(3), { swatches: many, trueBlue: 0 })).toContain("a couple of others");
  });

  it("no long shot is named at one in a hundred million", () => {
    const t = colourText({ swatches: [sw("snow-white", "snow-white", 1 - 1e-8, { hidden: true, family: "white" }), sw("blue:vivid", "vivid blue", 1e-8, { trueBlue: true })], trueBlue: 1e-8 });
    expect(t).toBe("Every lamb snow-white.");
  });
});
