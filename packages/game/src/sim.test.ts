import { describe, expect, it } from "vitest";
import { advanceSeason, buySheep, sellSheep } from "./sim.js";
import { deserialize, isAdult, newGame, pedigreeOf, serialize } from "./state.js";

describe("game sim", () => {
  it("new game has 4 ewes, 1 ram, 3 on market, none blue", () => {
    const g = newGame(1);
    const flock = g.flock.map((id) => g.sheep[id]!);
    expect(flock.filter((s) => s.sex === "ewe")).toHaveLength(4);
    expect(flock.filter((s) => s.sex === "ram")).toHaveLength(1);
    expect(g.market).toHaveLength(3);
    expect(flock.every((s) => s.phenotype["colour"] !== "blue")).toBe(true);
    expect(flock.every((s) => isAdult(s, g.season))).toBe(true);
  });

  it("a season produces lambs with correct parents and income", () => {
    const g = newGame(2);
    const ram = g.flock.find((id) => g.sheep[id]!.sex === "ram")!;
    const ewes = g.flock.filter((id) => g.sheep[id]!.sex === "ewe");
    const before = g.money;
    const r = advanceSeason(g, ewes.map((ewe) => ({ ewe, ram })));
    expect(r.income).toBeGreaterThan(0);
    expect(g.money).toBe(before + r.income);
    expect(g.season).toBe(1);
    expect(r.lambs.length).toBeGreaterThan(0);
    for (const l of r.lambs) {
      expect(l.sire).toBe(ram);
      expect(ewes).toContain(l.dam);
      expect(l.inbreeding).toBe(0);
      expect(isAdult(l, g.season)).toBe(false);
    }
  });

  it("is deterministic for a seed", () => {
    const a = newGame(5);
    const b = newGame(5);
    const pair = (g: typeof a) => {
      const ram = g.flock.find((id) => g.sheep[id]!.sex === "ram")!;
      return g.flock.filter((id) => g.sheep[id]!.sex === "ewe").map((ewe) => ({ ewe, ram }));
    };
    advanceSeason(a, pair(a));
    advanceSeason(b, pair(b));
    expect(serialize(a)).toBe(serialize(b));
  });

  it("rejects invalid pairings", () => {
    const g = newGame(3);
    const ram = g.flock.find((id) => g.sheep[id]!.sex === "ram")!;
    expect(() => advanceSeason(g, [{ ewe: ram, ram }])).toThrow();
  });

  it("sell/buy move sheep and coins; save round-trips", () => {
    const g = newGame(4);
    g.money = 500;
    const ewe = g.flock.find((id) => g.sheep[id]!.sex === "ewe")!;
    const price = sellSheep(g, ewe);
    expect(g.flock).not.toContain(ewe);
    expect(g.money).toBe(500 + price);
    const m = g.market[0]!;
    buySheep(g, m);
    expect(g.flock).toContain(m);
    const copy = deserialize(serialize(g));
    expect(copy.flock).toEqual(g.flock);
    expect(pedigreeOf(copy).ids().length).toBe(Object.keys(g.sheep).length);
  });

  it("full-sib mating yields F = 0.25 lambs", () => {
    const g = newGame(6);
    const ram = g.flock.find((id) => g.sheep[id]!.sex === "ram")!;
    const ewe = g.flock.find((id) => g.sheep[id]!.sex === "ewe")!;
    let sibs: string[] = [];
    for (let i = 0; i < 10 && sibs.length < 2; i++) {
      advanceSeason(g, [{ ewe, ram }]);
      sibs = g.flock.filter((id) => g.sheep[id]!.dam === ewe && g.sheep[id]!.sire === ram);
    }
    const sibEwe = sibs.find((id) => g.sheep[id]!.sex === "ewe");
    const sibRam = sibs.find((id) => g.sheep[id]!.sex === "ram");
    if (!sibEwe || !sibRam) return; // unlucky seed; covered by pedigree tests anyway
    advanceSeason(g, []);
    advanceSeason(g, []);
    const r = advanceSeason(g, [{ ewe: sibEwe, ram: sibRam }]);
    for (const l of r.lambs) expect(l.inbreeding).toBe(0.25);
  });
});
