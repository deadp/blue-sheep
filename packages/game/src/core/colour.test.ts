import { describe, expect, it } from "vitest";
import { lambOutcomes } from "@blue-sheep/inference";
import {
  advanceSeason, enterAct, factsFor, forecastCross, forecastVet, geneDist, litterOf, newGame, newTutorialGame, planMating, posteriors,
  scoreCross, setColour, vetTest, woolMatches, woolOf, entropyBits, GENE_LABEL, VET_FEE, type GameState,
} from "./index.js";
import { GENOTYPE_RE, planAll } from "./testkit.js";

/** A few seasons of a normal game so the pedigree has coloured and white lambs. */
function grown(seed: number, seasons = 6): GameState {
  const g = newGame(seed);
  for (let t = 0; t < seasons; t++) { planAll(g); advanceSeason(g); }
  return g;
}

describe("wool colour words", () => {
  it("every sheep gets a family, a hex and words; white is snow-white, hues carry a band", () => {
    const g = grown(3);
    for (const s of Object.values(g.sheep)) {
      const w = woolOf(s);
      expect(s.phenotype["family"]).toBe(w.family);
      expect(s.phenotype["wool"]).toBe(w.hex);
      expect(w.hex).toMatch(/^#[0-9A-F]{6}$/);
      if (s.phenotype["white"] === "white") expect(w.word).toBe("snow-white");
      else if (w.band !== "none") expect(w.word).toMatch(/^(soft|bright|vivid) /);
    }
  });

  it("slate and olive are usable colour names; true blue is the milestone", () => {
    const ph: Record<string, string | number> = { depth: 1 };
    setColour(ph, { red: 2, yellow: 2, blue: 4 });
    expect(woolOf({ phenotype: ph })).toMatchObject({ family: "blue", name: "slate", band: "none", word: "slate" });
    expect(woolMatches(woolOf({ phenotype: ph }), { colour: "slate", min: null })).toBe(true);
    setColour(ph, { blue: 4 });
    expect(woolOf({ phenotype: ph }).trueBlue).toBe(true);
    expect(woolMatches(woolOf({ phenotype: ph }), { colour: "true blue", min: null })).toBe(true);
    expect(woolMatches(woolOf({ phenotype: ph }), { colour: "blue", min: "vivid" })).toBe(true);
    setColour(ph, { blue: 4, pale: true });
    expect(woolOf({ phenotype: ph })).toMatchObject({ name: "sky", trueBlue: false });
  });
});

describe("colour facts in words", () => {
  it("a white founder's hidden paint starts unknown; facts never show genotype strings", () => {
    const g = grown(5);
    for (const id of Object.keys(g.sheep)) for (const f of factsFor(g, id)) {
      expect(f.text, f.text).not.toMatch(GENOTYPE_RE);
      expect(f.text).not.toMatch(/\d/); // doses are words and dots, never digits
      expect(f.label).toBe(GENE_LABEL[f.locus]);
    }
    const white = g.market.map((id) => g.sheep[id]!).find((s) => s.phenotype["white"] === "white");
    if (white) for (const gene of ["red", "yellow", "blue"] as const) expect(factsFor(g, white.id).find((f) => f.locus === gene)!.certain).toBe(false);
  });

  it("the tutorial pair's red lamb teaches that both hide colour, and that both probably carry red", () => {
    const g = newTutorialGame(4);
    const t = g.tutorial!;
    let red = null;
    for (let i = 0; i < 3; i++) { planMating(g, t.ewe, t.ram); const r = advanceSeason(g); red ??= r.lambs.find((l) => l.phenotype["family"] === "red") ?? null; }
    expect(red).not.toBeNull();
    for (const id of [t.ewe, t.ram]) {
      const facts = factsFor(g, id);
      expect(facts.find((f) => f.locus === "W")).toMatchObject({ certain: true, text: "hides colour under the white" });
      // Two red doses in the lamb, most likely one from each: each parent probably carries red.
      const redFact = facts.find((f) => f.locus === "red")!;
      expect(1 - (geneDist(g, id, "red")["00"] ?? 0)).toBeGreaterThan(0.6);
      expect(redFact.text).toMatch(/red/);
    }
  });
});

describe("forecast swatches", () => {
  it("ten swatches, class chances sum to one, and white matches the white posterior's lamb outcome", () => {
    const g = grown(7);
    const ewes = g.flock.filter((id) => g.sheep[id]!.sex === "ewe").slice(0, 3);
    const rams = g.flock.filter((id) => g.sheep[id]!.sex === "ram").slice(0, 2);
    let checked = 0;
    for (const e of ewes) for (const r of rams) {
      const f = forecastCross(g, e, r);
      const ten = litterOf(f.swatches);
      expect(ten).toHaveLength(10);
      for (const w of ten) expect(w.hex).toMatch(/^#[0-9A-F]{6}$/);
      const total = f.swatches.reduce((a, w) => a + w.p, 0);
      expect(total).toBeCloseTo(1, 5);
      const white = lambOutcomes(posteriors(g).byTrait.get("white")!, e, r);
      expect(f.white).toBeCloseTo(white["white"] ?? 0, 9);
      expect(f.swatches.find((w) => w.hidden)?.p ?? 0).toBeCloseTo(white["white"] ?? 0, 9);
      // Each class is at least as likely as its share of the ten (largest remainder): no class gets more than
      // one lamb above its expected count.
      for (const w of f.swatches) expect(ten.filter((x) => x.key === w.key).length).toBeLessThanOrEqual(Math.ceil(w.p * 10 + 1e-9));
      // Families add up to the same total, and the goal scores read off the classes.
      expect(Object.values(f.families).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
      expect(scoreCross(f, "trueblue")).toBeCloseTo(f.trueBlue, 12);
      expect(f.colourText).not.toMatch(GENOTYPE_RE);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("after the red lamb, the pair's coloured lambs are forecast mostly red, true blue a sliver at most", () => {
    const g = newTutorialGame(9);
    const t = g.tutorial!;
    for (let i = 0; i < 3; i++) { planMating(g, t.ewe, t.ram); advanceSeason(g); }
    const f = forecastCross(g, t.ewe, t.ram);
    expect(f.trueBlue).toBeLessThan(0.01); // only a sliver: nothing rules out hidden blue paint yet
    const coloured = f.swatches.filter((w) => !w.hidden);
    expect(coloured.length).toBeGreaterThan(0);
    expect(coloured[0]!.family).toBe("red");
    expect(f.white).toBeGreaterThan(0.6);
  });
});

describe("vet pigment tests", () => {
  it("a pigment test pins both genes of that colour and removes the uncertainty it forecast", () => {
    const g = grown(11, 4);
    enterAct(g, 1, undefined, { grant: true });
    g.money = 200;
    const white = g.flock.map((id) => g.sheep[id]!).find((s) => s.phenotype["white"] === "white")!;
    for (const gene of ["red", "yellow", "blue"] as const) {
      const before = forecastVet(g, white.id, gene);
      const h0 = entropyBits(Object.values(geneDist(g, white.id, gene)));
      expect(before.gainBits).toBeCloseTo(h0, 9);
      expect(before.text).not.toMatch(GENOTYPE_RE);
      const money = g.money;
      vetTest(g, white.id, gene);
      expect(g.money).toBe(money - VET_FEE);
      const loci = { red: ["R1", "R2"], yellow: ["Y1", "Y2"], blue: ["U1", "U2"] }[gene];
      for (const l of loci) expect(white.tested[l]).toBeDefined();
      expect(entropyBits(Object.values(geneDist(g, white.id, gene)))).toBeLessThan(0.01);
      expect(factsFor(g, white.id).find((f) => f.locus === gene)!.certain).toBe(true);
      expect(forecastVet(g, white.id, gene).gainBits).toBe(0);
      expect(() => vetTest(g, white.id, gene)).toThrow(/already/);
    }
    // A hidden-colour test on a coloured sheep would teach nothing.
    const col = Object.values(g.sheep).find((s) => g.flock.includes(s.id) && s.phenotype["white"] === "coloured");
    if (col) expect(forecastVet(g, col.id, "W").gainBits).toBeLessThan(0.02);
    for (const l of g.log) expect(l.text).not.toMatch(GENOTYPE_RE);
  });
});
