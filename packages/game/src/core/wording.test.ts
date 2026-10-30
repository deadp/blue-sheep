import { describe, expect, it } from "vitest";
import {
  ALMOST, CERTAIN, LONG_SHOT, MENTION_MIN, blueText, fractionWords, learnBand, learnText, oddsHint, oddsLabel, oddsText, percentText, shareWord,
} from "./index.js";

const EPS = 1e-6;

describe("forecast wording is tied to its odds range", () => {
  // [cut-off, label just under it, label at and over it]
  const cuts: [number, string, string][] = [
    [CERTAIN, "Almost certain", "Certain, as far as you know"],
    [ALMOST, "Very likely", "Almost certain"],
    [0.775, "Good odds", "Very likely"],
    [7 / 12,"About even", "Good odds"],
    [5 / 12,"Fair odds", "About even"],
    [7 / 24,"Possible, but don't count on it", "Fair odds"],
    [0.15, "Unlikely, but it happens", "Possible, but don't count on it"],
    [LONG_SHOT, "A long shot", "Unlikely, but it happens"],
    [MENTION_MIN, "Next to no chance", "A long shot"],
  ];

  it("each label changes exactly at its cut-off", () => {
    for (const [cut, under, over] of cuts) {
      expect(oddsLabel(cut - EPS), `just under ${cut}`).toBe(under);
      expect(oddsLabel(cut), `at ${cut}`).toBe(over);
    }
    expect(oddsLabel(0)).toBe("No chance");
  });

  it("the label never clashes with the fraction beside it", () => {
    for (let p = 0.01; p < 0.95; p += 0.001) {
      const f = fractionWords(p);
      const l = oddsLabel(p);
      if (f === "about four in five") expect(l, `${p}`).toBe("Very likely");
      if (f === "about one in two") expect(l, `${p}`).toBe("About even");
      if (f === "about two in three") expect(l, `${p}`).toBe("Good odds");
    }
  });

  it("nothing sounds certain below 99.5% and nothing is mentioned below 0.5%", () => {
    expect(oddsText(0.96)).toBe("Almost certain.");
    expect(oddsText(0.994)).toBe("Almost certain.");
    expect(oddsText(0.995)).toBe("Certain, as far as you know.");
    expect(blueText(0.96)).toBe("Almost every lamb should be true blue.");
    expect(blueText(0.994)).toBe("Almost every lamb should be true blue.");
    expect(blueText(0.995)).toBe("Every lamb should be true blue.");
    expect(blueText(0.0049)).toMatch(/^No true blue/);
    expect(oddsText(1e-8)).toBe("Next to no chance, as far as you know.");
    for (let p = 0; p < 1; p += 0.0005) expect(oddsLabel(p)).not.toMatch(/very long shot|As good as/);
  });

  it("one long-shot name under 8%", () => {
    for (const p of [0.005, 0.02, 0.049, 0.05, 0.079]) {
      expect(oddsLabel(p)).toBe("A long shot");
      expect(oddsHint(p)).toBe("long shot");
    }
    expect(oddsHint(0.0049)).toBe("no");
  });

  it("share words split most / nearly all / almost every / every", () => {
    expect(shareWord(0.59, "lamb")).toBeNull();
    expect(shareWord(0.6, "lamb")).toBe("most lambs");
    expect(shareWord(0.849, "lamb")).toBe("most lambs");
    expect(shareWord(0.85, "lamb")).toBe("nearly all lambs");
    expect(shareWord(0.949, "lamb")).toBe("nearly all lambs");
    expect(shareWord(0.95, "lamb")).toBe("almost every lamb");
    expect(shareWord(0.994, "lamb")).toBe("almost every lamb");
    expect(shareWord(0.995, "lamb")).toBe("every lamb");
    expect(shareWord(0.994, "all")).toBe("almost all");
    expect(shareWord(0.995, "all")).toBe("all");
  });

  it("number hints say <1% and >99% rather than 0% or 100%", () => {
    expect(percentText(0.004)).toBe("<1%");
    expect(percentText(0.01)).toBe("1%");
    expect(percentText(0.99)).toBe("99%");
    expect(percentText(0.991)).toBe(">99%");
    expect(percentText(1)).toBe(">99%");
  });

  it("learn word, hint and sentence share one table", () => {
    const at = (bits: number) => [learnBand(bits).word, learnBand(bits).hint, learnText(bits)];
    expect(at(0.024)).toEqual(["nothing new", "—", "This lamb would teach you little new."]);
    expect(at(0.025)[0]).toBe("a little");
    expect(at(0.299)[0]).toBe("a little");
    expect(at(0.3)).toEqual(["a fair bit", "a fair bit", "You would learn something from this lamb."]);
    expect(at(0.699)[0]).toBe("a fair bit");
    expect(at(0.7)[0]).toBe("a lot");
    expect(at(1.049)[2]).toBe("You would learn something from this lamb.");
    expect(at(1.05)).toEqual(["loads", "loads", "You would learn a lot from this lamb."]);
  });
});
