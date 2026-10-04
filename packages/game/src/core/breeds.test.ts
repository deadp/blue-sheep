import { BREEDS } from "@blue-sheep/genetics";
import { describe, expect, it } from "vitest";
import { advanceSeason, breedFractions, breedLine, buyPrice, deserialize, enterAct, icelandicUnlocked, mainBreed, marketBreeds, newGame, planMating, serialize } from "./index.js";
import { restockMarket, rngOf, saveRng } from "./state.js";
import { BREED_STOCK } from "./config.js";
import type { ActNumber, GameState } from "./types.js";

function atAct(seed: number, act: ActNumber): GameState {
  const s = newGame(seed);
  s.season = 5; // a later year, so the market is full size
  enterAct(s, act);
  const rng = rngOf(s);
  restockMarket(s, rng);
  saveRng(s, rng);
  return s;
}

describe("market stock by breed", () => {
  it("each act opens the breeds in config, and Icelandic only as the act-4 reward", () => {
    expect(marketBreeds({ act: 0 })).toEqual(["farm", "corriedale"]);
    expect(marketBreeds({ act: 1 })).toEqual(["farm", "corriedale", "perendale", "romney"]);
    expect(marketBreeds({ act: 2 })).toContain("merino");
    expect(marketBreeds({ act: 2 })).not.toContain("drysdale");
    expect(marketBreeds({ act: 3 })).toContain("drysdale");
    expect(marketBreeds({ act: 3 })).not.toContain("icelandic");
    expect(marketBreeds({ act: 4 })).toContain("icelandic");
    expect(icelandicUnlocked({ act: 3 })).toBe(false);
    expect(icelandicUnlocked({ act: 4 })).toBe(true);
  });

  it("from act 1 the market offers three different breeds; Icelandic never before act 4, always one after", () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const act of [1, 2, 3] as const) {
        const s = atAct(seed, act);
        const breeds = s.market.map((id) => s.sheep[id]!.breed);
        expect(new Set(breeds).size, `seed ${seed} act ${act}`).toBeGreaterThanOrEqual(3);
        expect(breeds).not.toContain("icelandic");
        for (const b of breeds) expect(BREED_STOCK[b!].minAct).toBeLessThanOrEqual(act);
      }
      const s4 = atAct(seed, 4);
      expect(s4.market.map((id) => s4.sheep[id]!.breed)).toContain("icelandic");
    }
  });

  it("market sheep are adults of their breed and never true blue", () => {
    const s = atAct(3, 3);
    for (const id of s.market) {
      const x = s.sheep[id]!;
      expect(x.origin).toBe("market");
      expect(Object.keys(BREEDS)).toContain(x.breed);
      expect(x.phenotype["colour"]).not.toBe("true blue");
    }
  });

  it("breed price multipliers apply: the same fleece costs more as Merino than as Farm", () => {
    const s = atAct(2, 3);
    const x = s.sheep[s.market[0]!]!;
    const farm = buyPrice({ ...x, breed: "farm" }), merino = buyPrice({ ...x, breed: "merino" }), ice = buyPrice({ ...x, breed: "icelandic" });
    expect(merino).toBeGreaterThan(farm);
    expect(ice).toBeGreaterThan(merino);
  });

  it("the market is deterministic for a saved state (RNG is in state)", () => {
    const s = atAct(5, 2);
    const a = deserialize(serialize(s)), b = deserialize(serialize(s));
    for (const g of [a, b]) { const rng = rngOf(g); restockMarket(g, rng); saveRng(g, rng); }
    expect(a.market.map((id) => a.sheep[id]!.breed)).toEqual(b.market.map((id) => b.sheep[id]!.breed));
    expect(a.market.map((id) => a.sheep[id]!.phenotype["fineness"])).toEqual(b.market.map((id) => b.sheep[id]!.phenotype["fineness"]));
  });
});

describe("breed fractions and the breed line", () => {
  it("founders are whole breeds; lambs take the mean of their parents, through the pedigree", () => {
    const s = atAct(4, 3);
    const rom = s.sheep[s.market.find((id) => s.sheep[id]!.breed !== "farm")!]!;
    const farmRam = s.sheep[s.flock.find((id) => s.sheep[id]!.sex === "ram")!]!;
    expect(breedFractions(s, farmRam.id)).toEqual({ farm: 1 });
    expect(breedFractions(s, rom.id)).toEqual({ [rom.breed!]: 1 });
    // a made-up lamb of the bought ewe and the farm ram, then a grand-lamb back to the farm ram
    const mk = (id: string, dam: string, sire: string) => { s.sheep[id] = { ...farmRam, id, dam, sire }; };
    mk("x1", rom.id, farmRam.id);
    mk("x2", "x1", farmRam.id);
    expect(breedFractions(s, "x1")[rom.breed!]).toBeCloseTo(0.5, 9);
    expect(breedFractions(s, "x2")[rom.breed!]).toBeCloseTo(0.25, 9);
    expect(breedFractions(s, "x2")["farm"]).toBeCloseTo(0.75, 9);
    expect(Object.values(breedFractions(s, "x2")).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it("describes mixes in plain words", () => {
    expect(breedLine({ romney: 1 })).toBe("Romney");
    expect(breedLine({ merino: 0.5, romney: 0.5 })).toBe("Merino × Romney");
    expect(breedLine({ corriedale: 0.75, farm: 0.25 })).toBe("¾ Corriedale");
    expect(breedLine({ farm: 0.95, romney: 0.05 })).toBe("mostly Farm");
    expect(breedLine({ farm: 0.34, romney: 0.33, merino: 0.33 })).toBe("mixed breed");
    expect(mainBreed({ romney: 0.75, farm: 0.25 })).toBe("romney");
    expect(mainBreed({ merino: 0.5, romney: 0.5 })).toBe("farm");
  });
});

describe("a bred lamb of a bought breed", () => {
  it("is half that breed on the card's line", () => {
    const s = atAct(6, 3);
    const eweId = s.flock.find((id) => s.sheep[id]!.sex === "ewe")!;
    const ramId = s.flock.find((id) => s.sheep[id]!.sex === "ram")!;
    s.flock.forEach((id) => { s.sheep[id]!.born = -10; });
    s.sheep[eweId]!.breed = "romney"; s.sheep[eweId]!.dam = null; s.sheep[eweId]!.sire = null; // a bought-in ewe: no records
    planMating(s, eweId, ramId);
    advanceSeason(s);
    const lamb = Object.values(s.sheep).find((x) => x.dam === eweId && x.sire === ramId);
    expect(lamb).toBeTruthy();
    expect(breedLine(breedFractions(s, lamb!.id))).toBe("Romney × Farm");
  });
});
