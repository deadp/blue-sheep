import { describe, expect, it } from "vitest";
import {
  ACTS, advanceSeason, checkActAdvance, currentAct, enterAct, flockSheep, isEnding, markEndingShown, newGame, registryStatus, setColour,
} from "./index.js";
import type { FairResult } from "./index.js";
import { GENOTYPE_RE, planAll } from "./testkit.js";

const colourLamb = (g: ReturnType<typeof newGame>) => {
  const lamb = Object.values(g.sheep).find((s) => s.dam !== null) ?? Object.values(g.sheep)[0]!;
  lamb.dam ??= "s0";
  setColour(lamb.phenotype, { red: 4, depth: 1 });
  return lamb;
};
const fairPlace = (place: number | null): FairResult => ({
  season: 3, category: "fine", entry: null, entryName: null, place, prize: 0, entryScore: null, field: [], text: "",
});

describe("acts", () => {
  it("act 0 → 1 when the first lambs are born; only the codex arrives with it (one concept at a time)", () => {
    const g = newGame(11);
    expect(currentAct(g).act).toBe(0);
    expect(g.unlocks).toEqual([]);
    planAll(g);
    const r = advanceSeason(g);
    expect(r.actAdvanced?.act).toBe(1);
    expect(r.actAdvanced?.line).toBe(ACTS[1]!.line);
    expect(g.unlocks).toEqual(["cards"]);
    expect(r.unlocked).toBe("cards");
  });

  // Chapter goals (DESIGN-v3 §10.1): each met and not met, then the two stand-ins.

  it("ch0: first lambs", () => {
    const g = newGame(21);
    expect(checkActAdvance(g)).toBeNull();
    g.stats.lambsBorn = 1;
    expect(checkActAdvance(g)?.act).toBe(1);
  });

  it("ch1: a visible colour lamb and three clips sold, both needed", () => {
    const g = newGame(22);
    enterAct(g, 1);
    g.stats.shearingsSold = 3;
    expect(checkActAdvance(g)).toBeNull(); // clips but no colour lamb
    expect(currentAct(g).progressText).toBe("No coloured lamb yet · Three of three shearings sold.");
    colourLamb(g);
    g.stats.shearingsSold = 2;
    expect(checkActAdvance(g)).toBeNull(); // colour but only two clips
    expect(currentAct(g).progress).toBeCloseTo((1 + 2 / 3) / 2);
    g.stats.shearingsSold = 3;
    expect(checkActAdvance(g)?.act).toBe(2);
  });

  it("ch1: a pale colour or a founder does not count as the colour lamb", () => {
    const g = newGame(23);
    enterAct(g, 1);
    g.stats.shearingsSold = 3;
    const lamb = colourLamb(g);
    setColour(lamb.phenotype, { red: 1, pale: true, depth: 0 });
    expect(checkActAdvance(g)).toBeNull();
    setColour(lamb.phenotype, { red: 4, depth: 1 });
    lamb.dam = null;
    for (const s of Object.values(g.sheep)) if (s.dam !== null) s.dam = null;
    expect(checkActAdvance(g)).toBeNull();
  });

  it("ch2: three item types sold and two orders filled, both needed", () => {
    const g = newGame(24);
    enterAct(g, 2);
    g.stats.itemTypesSold = ["a", "b"];
    g.stats.ordersFilled += 2;
    expect(checkActAdvance(g)).toBeNull(); // two kinds
    expect(currentAct(g).progressText).toBe("Two of three kinds sold · Two of two orders filled.");
    g.stats.itemTypesSold.push("c");
    g.stats.ordersFilled = g.actStart.ordersFilled + 1;
    expect(checkActAdvance(g)).toBeNull(); // one order is short
    g.stats.ordersFilled += 1;
    expect(checkActAdvance(g)?.act).toBe(3);
    expect(g.flockCap).toBe(ACTS[3]!.flockCap);
  });

  it("ch2: orders filled before the chapter carry over (at most two), and the HUD shows them at once", () => {
    const g = newGame(25);
    enterAct(g, 1);
    g.stats.ordersFilled = 5;
    enterAct(g, 2);
    expect(currentAct(g).progressText).toMatch(/Two of two orders filled\.$/);
  });

  it("ch3: a true blue and a ribbon, both needed", () => {
    const g = newGame(26);
    enterAct(g, 3);
    g.stats.bluesBorn = 1;
    expect(checkActAdvance(g)).toBeNull(); // no ribbon
    g.fair.history.push(fairPlace(4), fairPlace(null));
    expect(checkActAdvance(g)).toBeNull(); // 4th and no entry are not ribbons
    g.fair.history.push(fairPlace(3));
    g.stats.bluesBorn = 0;
    expect(checkActAdvance(g)).toBeNull(); // ribbon but no blue
    expect(currentAct(g).progress).toBe(0.5);
    g.stats.bluesBorn = 1;
    expect(checkActAdvance(g)?.act).toBe(4);
    expect(g.flockCap).toBe(ACTS[4]!.flockCap);
  });

  it("ch3 stand-in: 1st, 2nd or 3rd at the village fair counts as the A&P ribbon", () => {
    for (const place of [1, 2, 3]) {
      const g = newGame(27);
      enterAct(g, 3);
      g.stats.bluesBorn = 1;
      g.fair.history.push(fairPlace(place));
      expect(checkActAdvance(g)?.act).toBe(4);
    }
  });

  it("ch4: a first fantasy fleece and a 1st, both needed; a 1st before the chapter doesn't count", () => {
    const g = newGame(28);
    g.stats.fairsWon = 1;
    enterAct(g, 4);
    g.stats.firstFantasyFleeceSeason = 7;
    expect(checkActAdvance(g)).toBeNull(); // fleece, but the 1st was before the chapter
    g.stats.fairsWon = 2;
    g.stats.firstFantasyFleeceSeason = null;
    expect(checkActAdvance(g)).toBeNull(); // 1st, no fleece
    expect(currentAct(g).progressText).toBe("No fantasy fleece yet · a first place!");
    g.stats.firstFantasyFleeceSeason = 7;
    expect(checkActAdvance(g)?.act).toBe(5);
    expect(g.flockCap).toBe(ACTS[5]!.flockCap);
  });

  it("a rosette won in the season a chapter begins counts toward that chapter", () => {
    const g = newGame(13);
    enterAct(g, 3);
    g.stats.bluesBorn = 1;
    g.stats.firstFantasyFleeceSeason = 3;
    g.fair.history.push(fairPlace(1));
    const baseline = { ordersFilled: g.stats.ordersFilled, fairsWon: g.stats.fairsWon };
    g.stats.fairsWon += 1;
    expect(checkActAdvance(g, baseline)?.act).toBe(4);
    expect(currentAct(g).progress).toBe(1); // fleece already shorn and the rosette counted
    expect(checkActAdvance(g)?.act).toBe(5);
  });

  it("ch5 stand-in: the v2 registry goal ends the story, once, then endless mode (TODO Golden Fleece)", () => {
    const g = newGame(14);
    enterAct(g, 5);
    expect(registryStatus(g).met).toBe(false);
    expect(currentAct(g).progress).toBeLessThan(1);
    // Make six unrelated fine blue sheep.
    const blue = { blue: 4, depth: 1 };
    for (const s of flockSheep(g)) { setColour(s.phenotype, blue); s.phenotype["fineness"] = 20; }
    const extra = g.market.slice(0, 2);
    for (const id of extra) { g.flock.push(id); setColour(g.sheep[id]!.phenotype, blue); g.sheep[id]!.phenotype["fineness"] = 20; }
    // …and the two long-gone mothers of the starter pair, back on the farm for the photo (unrelated founders).
    for (const s of Object.values(g.sheep).filter((x) => !g.flock.includes(x.id) && !g.market.includes(x.id))) {
      g.flock.push(s.id); s.born = g.season - 4; setColour(s.phenotype, blue); s.phenotype["fineness"] = 20;
    }
    expect(registryStatus(g).met).toBe(true);
    expect(checkActAdvance(g)).toBeNull(); // ch5 is the last chapter
    const r = advanceSeason(g);
    expect(r.endingReached).toBe(true);
    expect(isEnding(g)).toBe(true);
    markEndingShown(g);
    expect(isEnding(g)).toBe(false);
    expect(currentAct(g).endless).toBe(true);
    expect(advanceSeason(g).endingReached).toBe(false);
  });

  it("the registry ending does not fire before ch5", () => {
    const g = newGame(16);
    enterAct(g, 4);
    advanceSeason(g);
    expect(g.ending).toBeNull();
  });

  it("act texts carry no genotype strings", () => {
    const g = newGame(15);
    for (const a of [0, 1, 2, 3, 4, 5] as const) {
      enterAct(g, a);
      const info = currentAct(g);
      for (const t of [info.title, info.line, info.goalText, info.progressText]) expect(t).not.toMatch(GENOTYPE_RE);
    }
  });
});
