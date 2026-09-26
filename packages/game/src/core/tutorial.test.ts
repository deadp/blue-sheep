import { describe, expect, it } from "vitest";
import {
  TUTORIAL_STEPS, advanceSeason, advanceTutorial, buyPrice, buySheep, cheapestMarketEwe, deserialize, newGame, newTutorialGame,
  planMating, serialize, skipTutorial, tutorialActive, tutorialInfo, tutorialStep, type GameState, type Sheep,
} from "./index.js";

/** What makes a starter sheep "the same sheep": everything but the season it was born in, which keeps its age. */
function starter(s: Sheep, season: number) {
  return { id: s.id, name: s.name, sex: s.sex, age: season - s.born, genome: s.genome, phenotype: s.phenotype, origin: s.origin };
}

/** Play the tutorial the way the controller does, returning the state at the end. */
function playThrough(seed: number): GameState {
  const g = newTutorialGame(seed);
  const t = g.tutorial!;
  for (const id of ["ewe", "ram", "forecast"] as const) expect(advanceTutorial(g, id)).toBe(true);
  planMating(g, t.ewe, t.ram);
  expect(advanceTutorial(g, "plan")).toBe(true);
  advanceSeason(g);
  for (const id of ["sleep", "reveal", "grow"] as const) expect(advanceTutorial(g, id)).toBe(true);
  expect(tutorialStep(g)).toBe("market");
  const ewe = cheapestMarketEwe(g)!;
  buySheep(g, ewe.id);
  expect(advanceTutorial(g, "market")).toBe(true);
  expect(advanceTutorial(g, "goal")).toBe(true);
  expect(tutorialStep(g)).toBe("done");
  expect(advanceTutorial(g, "done")).toBe(true);
  return g;
}

describe("tutorial", () => {
  it("starts with one white ewe and one white ram, and ten steps", () => {
    const g = newTutorialGame(7);
    expect(TUTORIAL_STEPS).toHaveLength(10);
    expect(tutorialInfo(g)).toEqual({ step: 1, id: "ewe", done: false });
    expect(g.flock).toHaveLength(2);
    const [e, r] = g.flock.map((id) => g.sheep[id]!);
    expect([e!.sex, r!.sex]).toEqual(["ewe", "ram"]);
    expect([e!.phenotype["colour"], r!.phenotype["colour"]]).toEqual(["white", "white"]);
    // The starter flock is held, not on the farm (so it can't shape forecasts yet).
    for (const s of g.tutorial!.held) expect(g.sheep[s.id]).toBeUndefined();
  });

  it("advances only on the current step's action, and is deterministic", () => {
    const g = newTutorialGame(11);
    expect(advanceTutorial(g, "plan")).toBe(false);
    expect(tutorialInfo(g)!.step).toBe(1);
    expect(advanceTutorial(g, "ewe")).toBe(true);
    expect(advanceTutorial(g, "ewe")).toBe(false);
    expect(tutorialInfo(g)).toEqual({ step: 2, id: "ram", done: false });
    expect(serialize(playThrough(21))).toBe(serialize(playThrough(21)));
  });

  it("gives a single coloured (never blue) first lamb, and a hidden-colour discovery, for many seeds", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = newTutorialGame(seed);
      const t = g.tutorial!;
      planMating(g, t.ewe, t.ram);
      const r = advanceSeason(g);
      expect(r.lambs, `seed ${seed}`).toHaveLength(1);
      const c = String(r.lambs[0]!.phenotype["colour"]);
      expect(c === "white" || c === "blue", `seed ${seed}: lamb is ${c}`).toBe(false);
      // Both parents are now known to carry hidden colour.
      const cards = r.discoveries.filter((d) => (d.loci ?? [d.locus]).includes("A"));
      expect(cards.map((d) => d.sheep).sort(), `seed ${seed}`).toEqual([t.ewe, t.ram].sort());
      // The first lamb is act 1's goal, so the story moves on as it would in a normal game.
      expect(g.act).toBe(1);
    }
  });

  it("does not bias matings outside the tutorial", () => {
    const g = newTutorialGame(5);
    skipTutorial(g);
    const t = g.tutorial!;
    // Same pair after skipping: the ordinary rules apply, so a white lamb is possible across seeds.
    let white = 0;
    for (let k = 0; k < 20; k++) {
      const h = deserialize(serialize(g));
      h.rng = (h.rng + k * 7919) >>> 0;
      planMating(h, t.ewe, t.ram);
      const r = advanceSeason(h);
      if (r.lambs.some((l) => l.phenotype["colour"] === "white")) white++;
    }
    expect(white).toBeGreaterThan(0);
  });

  it("hands over exactly the normal starter flock of the seed", () => {
    for (const seed of [7, 42, 1234]) {
      const normal = newGame(seed);
      const g = playThrough(seed);
      expect(tutorialActive(g)).toBe(false);
      expect(g.tutorial!.done).toBe(true);
      expect(g.tutorial!.held).toEqual([]);
      const want = normal.flock.map((id) => starter(normal.sheep[id]!, normal.season));
      const got = normal.flock.map((id) => starter(g.sheep[id]!, g.season));
      expect(got).toEqual(want);
      for (const id of normal.flock) expect(g.flock).toContain(id);
      // Normal flock + tutorial ewe, ram, lamb and the bought ewe; within the cap.
      expect(g.flock).toHaveLength(normal.flock.length + 4);
      expect(g.flock.length).toBeLessThanOrEqual(g.flockCap);
    }
  });

  it("makes sure a ewe is affordable at the market step", () => {
    const g = newTutorialGame(3);
    const t = g.tutorial!;
    for (const id of ["ewe", "ram", "forecast"] as const) advanceTutorial(g, id);
    planMating(g, t.ewe, t.ram);
    advanceTutorial(g, "plan");
    advanceSeason(g);
    g.money = 1;
    for (const id of ["sleep", "reveal", "grow"] as const) advanceTutorial(g, id);
    const ewe = cheapestMarketEwe(g)!;
    expect(g.money).toBeGreaterThanOrEqual(buyPrice(ewe));
    expect(g.tutorial!.gift).toBeGreaterThan(0);
  });

  it("skipping hands over the flock at once", () => {
    const g = newTutorialGame(9);
    const normal = newGame(9);
    skipTutorial(g);
    expect(tutorialInfo(g)!.done).toBe(true);
    expect(g.flock).toEqual([g.tutorial!.ewe, g.tutorial!.ram, ...normal.flock]);
  });

  it("round-trips through a save, and old saves load without a tutorial", () => {
    const g = newTutorialGame(13);
    advanceTutorial(g, "ewe");
    expect(serialize(deserialize(serialize(g)))).toBe(serialize(g));
    const old = JSON.parse(serialize(newGame(13))) as Record<string, unknown>;
    delete old["tutorial"];
    const loaded = deserialize(JSON.stringify(old));
    expect(loaded.tutorial).toBeNull();
    expect(newGame(13).tutorial).toBeNull();
  });
});
