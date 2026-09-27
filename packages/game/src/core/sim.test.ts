import { describe, expect, it } from "vitest";
import {
  advanceSeason, buySheep, deserialize, isAdult, newGame, pedigreeOf, planMating, sellSheep, serialize,
  flockSheep, canBreed, START_MONEY,
} from "./index.js";
import { planAll } from "./testkit.js";

describe("game sim", () => {
  it("new game starts small: one white ewe and one white ram (horn carriers, known), a quiet market, v2 fields", () => {
    const g = newGame(1);
    const flock = g.flock.map((id) => g.sheep[id]!);
    expect(flock.map((s) => s.sex)).toEqual(["ewe", "ram"]);
    expect(flock.map((s) => s.phenotype["colour"])).toEqual(["white", "white"]);
    expect(flock.map((s) => s.phenotype["horns"])).toEqual(["polled", "polled"]);
    // Their horned mothers are on record, so the farm knows each carries one horns copy: no card for that.
    for (const s of flock) expect(g.known[s.id]?.["P"]).toBe("p/P");
    expect(g.market).toHaveLength(2); // one ewe and one ram in the first year
    expect(g.unlocks).toEqual([]);
    expect(flock.every((s) => s.phenotype["colour"] !== "blue")).toBe(true);
    expect(flock.every((s) => isAdult(s, g.season))).toBe(true);
    expect(g.version).toBe(2);
    expect(g.act).toBe(0);
    expect(g.money).toBe(START_MONEY);
    expect(g.stats.lambsBorn).toBe(0);
    expect(g.orders).toEqual([]);
    expect(g.fair.nextSeason % 4).toBe(2);
  });

  it("a season produces lambs with correct parents, born === new season, and wool income", () => {
    const g = newGame(2);
    const ram = g.flock.find((id) => g.sheep[id]!.sex === "ram")!;
    const ewes = g.flock.filter((id) => g.sheep[id]!.sex === "ewe");
    for (const e of ewes) planMating(g, e, ram);
    const before = g.money;
    const r = advanceSeason(g);
    expect(r.income).toBeGreaterThan(0);
    expect(g.money).toBe(before + r.income - r.feed);
    expect(g.season).toBe(1);
    expect(r.lambs.length).toBeGreaterThanOrEqual(ewes.length);
    expect(g.stats.lambsBorn).toBe(r.lambs.length);
    for (const l of r.lambs) {
      expect(l.sire).toBe(ram);
      expect(ewes).toContain(l.dam);
      expect(l.inbreeding).toBe(0);
      expect(l.born).toBe(g.season);
      expect(isAdult(l, g.season)).toBe(false);
    }
    expect(Object.keys(r.forecastsSeen).sort()).toEqual([...ewes].sort());
    expect(g.plans).toEqual({});
  });

  it("is deterministic for a seed over many seasons with every system running", () => {
    const run = () => {
      const g = newGame(5);
      for (let i = 0; i < 14; i++) { planAll(g); advanceSeason(g); }
      return serialize(g);
    };
    expect(run()).toBe(run());
  });

  it("rejects invalid pairings with readable messages", () => {
    const g = newGame(3);
    const ram = g.flock.find((id) => g.sheep[id]!.sex === "ram")!;
    expect(() => planMating(g, ram, ram)).toThrow(/ewe and a ram/);
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
    expect(serialize(copy)).toBe(serialize(g));
    expect(pedigreeOf(copy).ids().length).toBe(Object.keys(g.sheep).length);
  });

  it("full-sib mating yields F = 0.25 lambs", () => {
    const g = newGame(6);
    const ram = g.flock.find((id) => g.sheep[id]!.sex === "ram")!;
    const ewe = g.flock.find((id) => g.sheep[id]!.sex === "ewe")!;
    let sibs: string[] = [];
    for (let i = 0; i < 10 && sibs.length < 2; i++) {
      planMating(g, ewe, ram);
      advanceSeason(g);
      sibs = g.flock.filter((id) => g.sheep[id]!.dam === ewe && g.sheep[id]!.sire === ram);
    }
    const sibEwe = sibs.find((id) => g.sheep[id]!.sex === "ewe");
    const sibRam = sibs.find((id) => g.sheep[id]!.sex === "ram");
    if (!sibEwe || !sibRam) return;
    while (!canBreed(g.sheep[sibEwe]!, g.season) || !canBreed(g.sheep[sibRam]!, g.season)) advanceSeason(g);
    planMating(g, sibEwe, sibRam);
    const r = advanceSeason(g);
    for (const l of r.lambs.filter((x) => x.dam === sibEwe)) expect(l.inbreeding).toBe(0.25);
  });

  it("sheep age, ewes retire from lambing at 20 and die at 24", () => {
    const g = newGame(8);
    const ewe = flockSheep(g).find((s) => s.sex === "ewe")!;
    ewe.born = g.season - 20;
    const ram = g.flock.find((id) => g.sheep[id]!.sex === "ram")!;
    expect(() => planMating(g, ewe.id, ram)).toThrow(/retired/);
    ewe.born = g.season - 23;
    const r = advanceSeason(g);
    expect(r.deaths.map((s) => s.id)).toContain(ewe.id);
    expect(g.flock).not.toContain(ewe.id);
    expect(g.sheep[ewe.id]).toBeDefined(); // kept for the pedigree
  });
});
