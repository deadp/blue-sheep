import { describe, expect, it } from "vitest";
import { BREED_IDS, BREEDS, breedFreqs, expectedTraitMean, sampleBreedFounder, type BreedId } from "./breeds.js";
import { colourInputFromPhenotype, woolColour } from "./colour.js";
import { mate } from "./meiosis.js";
import { createRng } from "./rng.js";
import { fineness, sheep3, staple } from "./sheep3.js";
import { observePhenotypes } from "./species.js";
import { coatLayers, fleeceFromPhenotype, woolType, type WoolType } from "./wooltype.js";

const N = 2000;
type Ph = Record<string, string | number>;
const cache = new Map<BreedId, Ph[]>();
function founders(id: BreedId): Ph[] {
  let list = cache.get(id);
  if (!list) {
    const rng = createRng(100 + BREED_IDS.indexOf(id));
    list = Array.from({ length: N }, () => observePhenotypes(sampleBreedFounder(id, rng), sheep3, rng));
    cache.set(id, list);
  }
  return list;
}
const mean = (list: Ph[], k: string) => list.reduce((s, p) => s + (p[k] as number), 0) / list.length;
const typeShares = (list: Ph[]) => {
  const out: Partial<Record<WoolType, number>> = {};
  for (const p of list) { const t = woolType(fleeceFromPhenotype(p)); out[t] = (out[t] ?? 0) + 1 / list.length; }
  return out;
};

describe("breeds: founder means within tolerance (2000 founders)", () => {
  for (const id of BREED_IDS) {
    it(BREEDS[id].name, () => {
      const list = founders(id);
      const t = BREEDS[id].targets;
      expect(Math.abs(mean(list, "fineness") - t.fineness)).toBeLessThan(1);
      expect(Math.abs(mean(list, "staple") - t.staple)).toBeLessThan(5);
      expect(Math.abs(mean(list, "crimp") - t.crimp)).toBeLessThan(1);
      expect(Math.abs(mean(list, "lustre") - t.lustre)).toBeLessThan(1);
      expect(Math.abs(mean(list, "fleeceWeight") - t.fleeceWeight)).toBeLessThan(1);
      expect(Math.abs(mean(list, "size") - t.size)).toBeLessThan(1.5);
    });
  }

  it("calibration hits the expected means exactly (before environment and clamps)", () => {
    for (const id of BREED_IDS) {
      expect(expectedTraitMean(fineness, breedFreqs(id))).toBeCloseTo(BREEDS[id].targets.fineness, 1);
      expect(expectedTraitMean(staple, breedFreqs(id))).toBeCloseTo(BREEDS[id].targets.staple, 0);
    }
  });
});

describe("breeds: colour and special genes", () => {
  it("coloured share is about w² per breed", () => {
    for (const id of BREED_IDS) {
      const w = BREEDS[id].colouredFreq;
      const share = founders(id).filter((p) => p["white"] === "coloured").length / N;
      expect(Math.abs(share - w * w), id).toBeLessThan(0.035);
    }
  });

  it("Drysdale is always hairy and horned; Icelandic always double-coated", () => {
    expect(founders("drysdale").every((p) => p["hair"] === "hairy" && p["horns"] === "horned")).toBe(true);
    expect(founders("icelandic").every((p) => p["coat"] === "double")).toBe(true);
    expect(founders("merino").some((p) => p["hair"] === "hairy" || p["coat"] === "double")).toBe(false);
  });

  it("pōhutukawa is sport-only: no breed carries it", () => {
    for (const id of BREED_IDS) expect(breedFreqs(id)["PO"]).toEqual([1, 0]);
  });

  it("true blue is well under 1 % of Farm founders", () => {
    const rng = createRng(8);
    let tb = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const ph = observePhenotypes(sampleBreedFounder("farm", rng), sheep3, rng);
      if (woolColour(colourInputFromPhenotype(ph)).trueBlue) tb++;
    }
    expect(tb / n).toBeLessThan(0.005);
  });
});

describe("wool types", () => {
  it("each breed's founders mostly classify as its wool type", () => {
    for (const id of BREED_IDS) {
      const shares = typeShares(founders(id));
      const mine = shares[BREEDS[id].woolType] ?? 0;
      expect(mine, `${id}: ${JSON.stringify(shares)}`).toBeGreaterThan(0.5);
      for (const [t, s] of Object.entries(shares)) if (t !== BREEDS[id].woolType) expect(s).toBeLessThan(mine);
    }
  });

  it("Merino × Romney lands in between: about 26.5 µm, 113 mm, mostly Medium", () => {
    const rng = createRng(3);
    const kids = Array.from({ length: N }, () =>
      observePhenotypes(mate(sampleBreedFounder("merino", rng), sampleBreedFounder("romney", rng), sheep3.map, rng), sheep3, rng));
    const um = mean(kids, "fineness"), mm = mean(kids, "staple");
    expect(um).toBeGreaterThan(mean(founders("merino"), "fineness") + 3);
    expect(um).toBeLessThan(mean(founders("romney"), "fineness") - 3);
    expect(Math.abs(um - 26.5)).toBeLessThan(1);
    expect(Math.abs(mm - 112)).toBeLessThan(6);
    const shares = typeShares(kids);
    expect(shares.medium ?? 0).toBeGreaterThan(0.45);
    expect(shares.fine ?? 0).toBeLessThan(0.1);
    expect(shares.lustre ?? 0).toBeLessThan(0.05);
  });

  it("rule order (§3.3)", () => {
    const m = (fineness: number, staple: number, lustre = 4, doubleCoat = false, hairy = false) => woolType({ fineness, staple, lustre, doubleCoat, hairy });
    expect(m(20, 120, 4, true)).toBe("lopi");
    expect(m(20, 100, 4, true)).toBe("fine");
    expect(m(25, 150, 4, false, true)).toBe("carpet");
    expect(m(37, 150)).toBe("carpet");
    expect(m(21.5, 80)).toBe("fine");
    expect(m(27, 80)).toBe("medium");
    expect(m(32, 130, 6)).toBe("lustre");
    expect(m(32, 129, 6)).toBe("strong");
    expect(m(33, 100)).toBe("strong");
    expect(m(30, 99)).toBe("crossbred");
    expect(m(35, 140, 5)).toBe("crossbred");
    expect(coatLayers(26)).toEqual({ outer: 30, inner: 20 });
  });
});
