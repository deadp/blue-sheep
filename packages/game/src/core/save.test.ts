import { describe, expect, it } from "vitest";
import { advanceSeason, deserialize, newGame, serialize } from "./index.js";
import { planAll } from "./testkit.js";

/** Build a v1-shaped save from a v2 game (fields the prototype had). */
function v1Save(seed: number, seasons: number): string {
  const g = newGame(seed);
  for (let i = 0; i < seasons; i++) { planAll(g); advanceSeason(g); }
  const sheep = Object.fromEntries(Object.entries(g.sheep).map(([id, s]) => [id, {
    id, name: s.name, sex: s.sex, born: s.born, dam: s.dam, sire: s.sire, genome: s.genome, inbreeding: s.inbreeding,
    phenotype: s.phenotype, tested: s.tested,
  }]));
  return JSON.stringify({
    version: 1, seed, rng: g.rng, season: g.season, money: g.money, act: 1, flockCap: 8, sheep, flock: g.flock, market: g.market,
    notebook: {}, log: [{ season: 0, text: "Welcome" }], nextId: g.nextId, achievements: g.stats.bluesBorn ? ["blue"] : [],
    zone: {}, plans: {}, known: {}, discoveries: [{ season: 1, sheep: g.flock[0], text: "Old card." }], unlocks: [],
  });
}

describe("saves", () => {
  it("v2 round-trips exactly", () => {
    const g = newGame(90);
    planAll(g); advanceSeason(g);
    expect(serialize(deserialize(serialize(g)))).toBe(serialize(g));
  });

  it("migrates a v1 save to a playable v2 state", () => {
    const g = deserialize(v1Save(91, 3));
    expect(g.version).toBe(2);
    expect(g.act).toBeGreaterThanOrEqual(1); // it had lambs
    expect(g.unlocks).toEqual(expect.arrayContaining(["orders", "vet", "cards"]));
    expect(g.stats.lambsBorn).toBeGreaterThan(0);
    expect(g.discoveries[0]!.id).toBe("d1");
    expect(Object.values(g.sheep).every((s) => s.ill === false && Array.isArray(s.rosettes))).toBe(true);
    for (let i = 0; i < 3; i++) { planAll(g); advanceSeason(g); }
    expect(g.season).toBeGreaterThan(3);
  });

  it("migration is deterministic", () => {
    const s = v1Save(92, 2);
    const a = deserialize(s), b = deserialize(s);
    planAll(a); planAll(b); advanceSeason(a); advanceSeason(b);
    expect(serialize(a)).toBe(serialize(b));
  });

  it("throws on hopeless saves", () => {
    expect(() => deserialize(JSON.stringify({ version: 7 }))).toThrow(/unknown version/);
    expect(() => deserialize(JSON.stringify({ version: 1, season: 3 }))).toThrow(/damaged/);
    expect(() => deserialize(JSON.stringify({ version: 1, season: 3, sheep: {}, flock: [] }))).toThrow(/no sheep/);
  });
});
