import { describe, expect, it } from "vitest";
import {
  advanceSeason, announceText, buyUpgrade, deserialize, enterAct, feedPerHead, flockSheep, forecastUpgrade, hasUpgrade,
  isAdult, newGame, serialize, updateDiscoveries, upgradeBlocked, UPGRADES, woolIncome, type EventKind, type GameState,
} from "./index.js";
import { GENOTYPE_RE, planAll } from "./testkit.js";

function atWinter(seed: number, kind: EventKind, upgrade: "collie" | "maremma" | "barn"): GameState {
  const g = newGame(seed);
  enterAct(g, upgrade === "maremma" ? 2 : 1);
  g.money = 500;
  buyUpgrade(g, upgrade);
  g.season = 3;
  g.pendingEvent = { kind, season: 3, colour: null, text: announceText(kind, null) };
  return g;
}

describe("farm improvements", () => {
  it("cost their price once, are remembered, and can't be bought twice", () => {
    const g = newGame(200);
    g.money = 1000;
    buyUpgrade(g, "collie");
    expect(g.money).toBe(1000 - UPGRADES.find((u) => u.id === "collie")!.price);
    expect(hasUpgrade(g, "collie")).toBe(true);
    expect(() => buyUpgrade(g, "collie")).toThrow(/already/);
    expect(deserialize(serialize(g)).upgrades).toEqual(["collie"]);
  });

  it("refuse without enough coins, before their act, or without the prerequisite", () => {
    const g = newGame(201);
    g.money = 10;
    expect(() => buyUpgrade(g, "paddock")).toThrow(/coins/);
    g.money = 1000;
    expect(upgradeBlocked(g, "shearing")).toMatch(/Act 2/);
    enterAct(g, 3);
    expect(upgradeBlocked(g, "meadow")).toMatch(/paddock/);
    buyUpgrade(g, "paddock");
    expect(upgradeBlocked(g, "meadow")).toBeNull();
  });

  it("old saves without upgrades load with none", () => {
    const g = newGame(202);
    const raw = JSON.parse(serialize(g)) as Record<string, unknown>;
    delete raw["upgrades"];
    const back = deserialize(JSON.stringify(raw));
    expect(back.upgrades).toEqual([]);
    expect(hasUpgrade(back, "barn")).toBe(false);
  });

  it("the far paddock adds room now and keeps it through later acts", () => {
    const g = newGame(203);
    g.money = 500;
    const cap = g.flockCap;
    expect(forecastUpgrade(g, "paddock").text).toContain(`${cap + 4}`);
    buyUpgrade(g, "paddock");
    expect(g.flockCap).toBe(cap + 4);
    enterAct(g, 3);
    expect(g.flockCap).toBe(16 + 4);
  });

  it("a devoted Maremma sees the fox off", () => {
    const g = atWinter(204, "fox", "maremma");
    g.care = { maremma: { level: 100, greeted: -1, treated: -1, cared: 99 } };
    planAll(g); advanceSeason(g); // lambs in the field
    const lambs = flockSheep(g).filter((s) => !isAdult(s, g.season)).length;
    expect(lambs).toBeGreaterThan(0);
    g.pendingEvent = { kind: "fox", season: g.season, colour: null, text: announceText("fox", null) };
    for (const s of flockSheep(g)) s.phenotype["boldness"] = 1; // no bold guardian
    const before = g.flock.length;
    const r = advanceSeason(g);
    expect(r.event?.saved).toBe(true);
    expect(r.event?.dog).toBe("maremma");
    expect(r.event?.text).toMatch(/Samson/);
    expect(r.deaths).toHaveLength(0);
    expect(g.flock.length).toBeGreaterThanOrEqual(before);
  });

  it("the barn keeps everyone well in a hard winter", () => {
    const g = atWinter(205, "hardWinter", "barn");
    const r = advanceSeason(g);
    expect(r.event?.kind).toBe("hardWinter");
    expect(r.event?.sheep).toBeNull();
    expect(flockSheep(g).some((s) => s.ill)).toBe(false);
  });

  it("the shearing shed raises wool income, and the report says by how much", () => {
    const g = newGame(206);
    enterAct(g, 1);
    g.money = 500;
    const plain = flockSheep(g).filter((s) => isAdult(s, g.season)).reduce((t, s) => t + woolIncome(s), 0);
    expect(forecastUpgrade(g, "shearing").text).toMatch(/pays for itself/);
    buyUpgrade(g, "shearing");
    const r = advanceSeason(g);
    expect(r.shedBonus).toBeGreaterThan(0);
    expect(r.income).toBeGreaterThan(plain);
  });

  it("forecast texts are plain sentences", () => {
    const g = newGame(207);
    enterAct(g, 3);
    for (const u of UPGRADES) {
      const t = forecastUpgrade(g, u.id).text;
      expect(t).not.toMatch(GENOTYPE_RE);
      expect(t).not.toMatch(/undefined|NaN/);
    }
  });

  it("feed gets dearer with the years but starts at the old price", () => {
    expect(feedPerHead(0)).toBe(2);
    expect(feedPerHead(3)).toBe(2);
    expect(feedPerHead(8 * 4)).toBeGreaterThan(feedPerHead(0));
  });
});

describe("discovery cards", () => {
  it("batch everything learned about one sheep in one go into a single card", () => {
    const g = newGame(208);
    enterAct(g, 1);
    g.money = 1000;
    for (let i = 0; i < 6; i++) { planAll(g); advanceSeason(g); }
    const perSheepSeason = new Map<string, number>();
    for (const d of g.discoveries) {
      const k = `${d.sheep}@${d.season}`;
      perSheepSeason.set(k, (perSheepSeason.get(k) ?? 0) + 1);
    }
    expect(g.discoveries.length).toBeGreaterThan(0);
    for (const n of perSheepSeason.values()) expect(n).toBe(1);
    expect(updateDiscoveries(g)).toHaveLength(0); // nothing new without new evidence
    for (const d of g.discoveries) expect(d.text).not.toMatch(GENOTYPE_RE);
  });
});
