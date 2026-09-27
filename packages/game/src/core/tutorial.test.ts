import { describe, expect, it } from "vitest";
import {
  TUTORIAL_STEPS, advanceSeason, advanceTutorial, buyPrice, buySheep, cheapestMarketEwe, deserialize, forecastCross, knownPunnet,
  newGame, newTutorialGame, planMating, PUNNET_GENES, serialize, skipTutorial, tutorialActive, tutorialInfo, tutorialStep,
  type GameState,
} from "./index.js";

/** Play the tutorial the way the controller does, returning the state at the end. */
function playThrough(seed: number): GameState {
  const g = newTutorialGame(seed);
  const t = g.tutorial!;
  for (const id of ["ewe", "ram", "forecast", "punnet"] as const) expect(advanceTutorial(g, id)).toBe(true);
  planMating(g, t.ewe, t.ram);
  expect(advanceTutorial(g, "plan")).toBe(true);
  advanceSeason(g);
  for (const id of ["sleep", "reveal", "why", "grow"] as const) expect(advanceTutorial(g, id)).toBe(true);
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
  it("starts with one white ewe and one white ram, and twelve steps in order", () => {
    const g = newTutorialGame(7);
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual(["ewe", "ram", "forecast", "punnet", "plan", "sleep", "reveal", "why", "grow", "market", "goal", "done"]);
    // The Punnet square comes after opening the forecast and before planning; the colour square right after the reveal.
    const at = (id: string) => TUTORIAL_STEPS.findIndex((s) => s.id === id);
    expect(at("forecast") < at("punnet") && at("punnet") < at("plan")).toBe(true);
    expect(at("why")).toBe(at("reveal") + 1);
    expect(TUTORIAL_STEPS.filter((s) => s.ack).map((s) => s.id)).toEqual(["punnet", "why", "goal", "done"]);
    expect(tutorialInfo(g)).toEqual({ step: 1, id: "ewe", done: false });
    expect(g.flock).toHaveLength(2);
    const [e, r] = g.flock.map((id) => g.sheep[id]!);
    expect([e!.sex, r!.sex]).toEqual(["ewe", "ram"]);
    expect([e!.phenotype["colour"], r!.phenotype["colour"]]).toEqual(["white", "white"]);
  });

  it("the tutorial farm is exactly newGame(seed) plus the mentor (the skip start mirrors it)", () => {
    const g = newTutorialGame(42);
    const n = newGame(42);
    expect(g.flock).toEqual(n.flock);
    expect(g.money).toBe(n.money);
    expect(g.market).toEqual(n.market);
    expect(g.sheep).toEqual(n.sheep);
  });

  it("the pair are polled horn carriers: the Punnet square shows 3 polled : 1 horned, and so does the forecast", () => {
    for (const seed of [1, 7, 42, 99]) {
      const g = newTutorialGame(seed);
      const t = g.tutorial!;
      expect(g.sheep[t.ewe]!.phenotype["horns"]).toBe("polled");
      expect(g.sheep[t.ram]!.phenotype["horns"]).toBe("polled");
      const sq = knownPunnet(g, PUNNET_GENES.horns, t.ewe, t.ram)!;
      expect(sq.counts).toEqual({ polled: 3, horned: 1 });
      expect(forecastCross(g, t.ewe, t.ram).horns["horned"]).toBeCloseTo(0.25, 5);
    }
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

  it("gives a single coloured (never blue) first lamb, and hidden-colour cards whose square shows 3 white : 1 coloured", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = newTutorialGame(seed);
      const t = g.tutorial!;
      planMating(g, t.ewe, t.ram);
      const r = advanceSeason(g);
      expect(r.lambs, `seed ${seed}`).toHaveLength(1);
      const c = String(r.lambs[0]!.phenotype["colour"]);
      expect(c === "white" || c === "blue", `seed ${seed}: lamb is ${c}`).toBe(false);
      // Both parents are now known to carry hidden colour (and no new horn card: that was known from the start).
      const cards = r.discoveries.filter((d) => (d.loci ?? [d.locus]).includes("A"));
      expect(cards.map((d) => d.sheep).sort(), `seed ${seed}`).toEqual([t.ewe, t.ram].sort());
      expect(r.discoveries.some((d) => (d.loci ?? [d.locus]).includes("P") && (d.sheep === t.ewe || d.sheep === t.ram))).toBe(false);
      expect(knownPunnet(g, PUNNET_GENES.colour, t.ewe, t.ram)!.counts).toEqual({ white: 3, coloured: 1 });
      expect(g.act).toBe(1);
    }
  });

  it("does not bias matings outside the tutorial", () => {
    const g = newTutorialGame(5);
    skipTutorial(g);
    const t = g.tutorial!;
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

  it("no handover: the end flock is the ewe, the ram, their lamb and the bought ewe", () => {
    for (const seed of [7, 42, 1234]) {
      const g = playThrough(seed);
      const t = g.tutorial!;
      expect(tutorialActive(g)).toBe(false);
      expect(t.done).toBe(true);
      expect(g.flock).toHaveLength(4);
      const sheep = g.flock.map((id) => g.sheep[id]!);
      expect(sheep.filter((s) => s.origin === "founder").map((s) => s.id).sort()).toEqual([t.ewe, t.ram].sort());
      expect(sheep.filter((s) => s.origin === "bred")).toHaveLength(1);
      expect(sheep.filter((s) => s.origin === "market" && s.sex === "ewe")).toHaveLength(1);
      // After the tutorial nothing else arrives with the next seasons either (only lambs the player breeds).
      const before = new Set(g.flock);
      advanceSeason(g);
      expect(g.flock.filter((id) => !before.has(id))).toEqual([]);
    }
  });

  it("makes sure a ewe is affordable at the market step", () => {
    const g = newTutorialGame(3);
    const t = g.tutorial!;
    for (const id of ["ewe", "ram", "forecast", "punnet"] as const) advanceTutorial(g, id);
    planMating(g, t.ewe, t.ram);
    advanceTutorial(g, "plan");
    advanceSeason(g);
    g.money = 1;
    for (const id of ["sleep", "reveal", "why", "grow"] as const) advanceTutorial(g, id);
    const ewe = cheapestMarketEwe(g)!;
    expect(g.money).toBeGreaterThanOrEqual(buyPrice(ewe));
    expect(g.tutorial!.gift).toBeGreaterThan(0);
  });

  it("the starting coins buy the market step's ewe without help, for many seeds", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = newTutorialGame(seed);
      const t = g.tutorial!;
      for (const id of ["ewe", "ram", "forecast", "punnet"] as const) advanceTutorial(g, id);
      planMating(g, t.ewe, t.ram);
      advanceTutorial(g, "plan");
      advanceSeason(g);
      for (const id of ["sleep", "reveal", "why", "grow"] as const) advanceTutorial(g, id);
      expect(g.tutorial!.gift, `seed ${seed}`).toBe(0);
    }
  });

  it("skipping ends the tutorial and adds no sheep", () => {
    const g = newTutorialGame(9);
    const flock = [...g.flock];
    skipTutorial(g);
    expect(tutorialInfo(g)!.done).toBe(true);
    expect(g.flock).toEqual(flock);
  });

  it("round-trips through a save; old saves load without a tutorial, and old tutorials drop the neighbour's flock", () => {
    const g = newTutorialGame(13);
    advanceTutorial(g, "ewe");
    expect(serialize(deserialize(serialize(g)))).toBe(serialize(g));
    const old = JSON.parse(serialize(newGame(13))) as Record<string, unknown>;
    delete old["tutorial"];
    const loaded = deserialize(JSON.stringify(old));
    expect(loaded.tutorial).toBeNull();
    expect(newGame(13).tutorial).toBeNull();
    // A tutorial saved at the old step 4 ("plan") with a held flock resumes at "plan", with no held sheep.
    const mid = JSON.parse(serialize(newTutorialGame(13))) as { tutorial: Record<string, unknown> };
    mid.tutorial["step"] = 4;
    mid.tutorial["held"] = [];
    const back = deserialize(JSON.stringify(mid));
    expect(tutorialStep(back)).toBe("plan");
    expect("held" in back.tutorial!).toBe(false);
  });
});
