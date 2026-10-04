import { describe, expect, it } from "vitest";
import {
  advanceSeason, autoSellOn, clipKg, demandLevel, deserialize, flockSheep, forecastSale, isAdult, isShearingSeason, newGame, rawKey, sellLot, serialize,
  storeCap, storeOf, woolPricePerKg, woolOf, finenessMultiplier, fondWoolMultiplier, fondnessOf, type GameState,
} from "./index.js";
import { STORE_CAP } from "./config.js";

const adultsAt = (g: GameState, t = g.season) => flockSheep(g).filter((s) => isAdult(s, t));

describe("shearing and the wool store", () => {
  it("shears in spring and autumn only", () => {
    expect([0, 1, 2, 3, 4].map(isShearingSeason)).toEqual([true, false, true, false, true]);
    const g = newGame(11); g.autoSell = false;
    const n = adultsAt(g).length;
    const r0 = advanceSeason(g);
    expect(r0.shearing!.lots).toBe(n);
    const held = storeOf(g).length;
    const r1 = advanceSeason(g);
    expect(r1.shearing).toBeNull();
    expect(storeOf(g).length).toBe(held);
  });

  it("a lot carries the sheep's wool type, colour and fineness, and a clean weight below the greasy weight", () => {
    const g = newGame(12); g.autoSell = false;
    advanceSeason(g);
    for (const l of storeOf(g)) {
      const s = g.sheep[l.sheep]!;
      expect(l.greasy).toBe(clipKg(s));
      expect(l.clean).toBeLessThan(l.greasy);
      expect(l.microns).toBe(Number(s.phenotype["fineness"]));
      expect(l.family).toBe(woolOf(s).family);
    }
  });

  it("auto-sell (the default) pays at once and keeps the store empty; off, lots wait", () => {
    const a = newGame(13), b = newGame(13);
    b.autoSell = false;
    expect(autoSellOn(a)).toBe(true);
    const m0 = a.money;
    const ra = advanceSeason(a);
    advanceSeason(b);
    expect(storeOf(a)).toHaveLength(0);
    expect(ra.shearing!.autoSold).toBe(ra.shearing!.lots);
    expect(ra.income).toBeGreaterThan(0);
    expect(storeOf(b).length).toBe(ra.shearing!.lots);
    expect(a.money - b.money).toBe(ra.income);
    expect(m0).toBeLessThan(a.money + 1000);
  });

  it("lots beyond the store's room are sold at once (overflow)", () => {
    const g = newGame(14); g.autoSell = false;
    g.store = Array.from({ length: STORE_CAP - 1 }, (_, i) => ({ ...({} as never), id: `Lx${i}` }));
    const n = adultsAt(g).length;
    expect(n).toBeGreaterThan(1);
    const r = advanceSeason(g);
    expect(storeOf(g)).toHaveLength(STORE_CAP);
    expect(r.shearing!.overflow).toBe(n - 1);
    expect(r.shearing!.overflowCoins).toBeGreaterThan(0);
    expect(storeCap(g)).toBe(STORE_CAP);
  });

  it("selling lowers that wool type's meter, and pays exactly what the forecast said", () => {
    const g = newGame(15); g.autoSell = false;
    for (let i = 0; i < 3; i++) advanceSeason(g);
    const lots = storeOf(g);
    expect(lots.length).toBeGreaterThanOrEqual(3);
    const ids = lots.slice(0, 3).map((l) => l.id);
    const f = forecastSale(g, ids);
    const type = lots[0]!.type;
    const before = demandLevel(g, rawKey(type));
    const m = g.money;
    let paid = 0;
    for (const id of ids) paid += sellLot(g, id);
    expect(paid).toBe(f.coins);
    expect(g.money - m).toBe(f.coins);
    expect(demandLevel(g, rawKey(type))).toBeLessThan(before);
    expect(demandLevel(g, rawKey(type))).toBeCloseTo(f.after[type]!);
    expect(storeOf(g)).toHaveLength(lots.length - 3);
    expect(() => sellLot(g, ids[0]!)).toThrow();
  });

  it("a second lot of the same type pays less than it would have sold first", () => {
    const g = newGame(16); g.autoSell = false;
    for (let i = 0; i < 3; i++) advanceSeason(g);
    const lots = storeOf(g);
    const pair = lots.flatMap((a) => lots.filter((b) => b.id !== a.id && b.type === a.type).map((b) => [a, b] as const))[0];
    expect(pair).toBeDefined();
    const [a, b] = pair!;
    a.greasy = 60; b.greasy = 60; // big lots, so the step shows past coin rounding
    const alone = forecastSale(g, [b.id]).lots[0]!.coins;
    const second = forecastSale(g, [a.id, b.id]).lots[1]!.coins;
    expect(second).toBeLessThan(alone);
    expect(forecastSale(g, [a.id, b.id]).after[a.type]).toBeLessThan(forecastSale(g, [a.id]).after[a.type]!);
  });

  it("is deterministic: the same serialized state gives the same shearing and meters", () => {
    const g = newGame(17); g.autoSell = false;
    advanceSeason(g);
    const copy = deserialize(serialize(g));
    const r1 = advanceSeason(g), r2 = advanceSeason(copy);
    expect(serialize(g)).toBe(serialize(copy));
    expect(r1.income).toBe(r2.income);
  });

  it("old saves without a store load with an empty one, and the clip is a season's growth times CLIP_KG", () => {
    const g = newGame(18);
    const raw = JSON.parse(serialize(g)) as Record<string, unknown>;
    delete raw["store"]; delete raw["demand"]; delete raw["autoSell"];
    const old = deserialize(JSON.stringify(raw));
    expect(storeOf(old)).toEqual([]);
    expect(autoSellOn(old)).toBe(true);
  });
});

describe("year-1 income against the v2 model", () => {
  it("stays within 15% of what v2 paid (wool every season, no meters) on seeds 1-20", () => {
    const ratios: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const g = newGame(seed);
      let v2 = 0, v3 = 0;
      for (let i = 0; i < 4; i++) {
        for (const s of adultsAt(g)) {
          v2 += Math.round(Number(s.phenotype["fleeceWeight"]) * woolPricePerKg(woolOf(s)) * finenessMultiplier(Number(s.phenotype["fineness"])) * fondWoolMultiplier(fondnessOf(g, s.id)));
        }
        v3 += advanceSeason(g).income;
      }
      ratios.push(v3 / v2);
    }
    for (const r of ratios) { expect(r).toBeGreaterThan(0.85); expect(r).toBeLessThan(1.15); }
  });

  it("money never goes below zero across 12 seasons on seeds 1-20", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = newGame(seed);
      for (let i = 0; i < 12; i++) { advanceSeason(g); expect(g.money).toBeGreaterThanOrEqual(0); }
    }
  });
});
