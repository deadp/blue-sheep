import { describe, expect, it } from "vitest";
import {
  TUTORIAL_STEPS, advanceSeason, advanceTutorial, buyPrice, buySheep, cheapestMarketEwe, deserialize, forecastCross, knownPunnet,
  newGame, newTutorialGame, planMating, PUNNET_GENES, serialize, skipTutorial, tutorialActive, tutorialInfo, tutorialLambs, tutorialOver,
  tutorialStep, woolOf, OldSaveError, type GameState, type SeasonReport,
} from "./index.js";

/** Plan the tutorial pair and sleep, as the steps ask. */
function breed(g: GameState): SeasonReport {
  const t = g.tutorial!;
  planMating(g, t.ewe, t.ram);
  return advanceSeason(g);
}

/** Play the tutorial the way the controller does, returning the state and the three reports. */
function playThrough(seed: number, money?: number): { g: GameState; reports: SeasonReport[] } {
  const g = newTutorialGame(seed);
  const reports: SeasonReport[] = [];
  for (const id of ["ewe", "ram", "forecast"] as const) expect(advanceTutorial(g, id)).toBe(true);
  planMating(g, g.tutorial!.ewe, g.tutorial!.ram);
  expect(advanceTutorial(g, "plan")).toBe(true);
  reports.push(advanceSeason(g));
  for (const id of ["sleep", "lamb1"] as const) expect(advanceTutorial(g, id)).toBe(true);
  expect(tutorialStep(g)).toBe("again");
  reports.push(breed(g));
  for (const id of ["again", "sleep2", "horns", "punnet"] as const) expect(advanceTutorial(g, id)).toBe(true);
  reports.push(breed(g));
  for (const id of ["again2", "sleep3", "colour"] as const) expect(advanceTutorial(g, id)).toBe(true);
  if (money !== undefined) g.money = money;
  expect(advanceTutorial(g, "why")).toBe(true);
  expect(tutorialStep(g)).toBe("market");
  const ewe = cheapestMarketEwe(g)!;
  buySheep(g, ewe.id);
  expect(advanceTutorial(g, "market")).toBe(true);
  expect(advanceTutorial(g, "goal")).toBe(true);
  expect(tutorialStep(g)).toBe("done");
  expect(advanceTutorial(g, "done")).toBe(true);
  return { g, reports };
}

describe("tutorial", () => {
  it("starts with one white ewe and one white ram; three seasons of steps in order", () => {
    const g = newTutorialGame(7);
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([
      "ewe", "ram", "forecast", "plan", "sleep", "lamb1",
      "again", "sleep2", "horns", "punnet",
      "again2", "sleep3", "colour", "why", "market", "goal", "done",
    ]);
    // The Punnet square comes only after the horned lamb; the colour square right after the coloured lamb.
    const at = (id: string) => TUTORIAL_STEPS.findIndex((s) => s.id === id);
    expect(at("punnet")).toBe(at("horns") + 1);
    expect(at("why")).toBe(at("colour") + 1);
    expect(TUTORIAL_STEPS.filter((s) => s.ack).map((s) => s.id)).toEqual(["punnet", "why", "goal", "done"]);
    expect(tutorialInfo(g)).toEqual({ step: 1, id: "ewe", done: false });
    expect(g.flock).toHaveLength(2);
    const [e, r] = g.flock.map((id) => g.sheep[id]!);
    expect([e!.sex, r!.sex]).toEqual(["ewe", "ram"]);
    expect([e!.phenotype["white"], r!.phenotype["white"]]).toEqual(["white", "white"]);
    expect([e!.phenotype["family"], r!.phenotype["colour"]]).toEqual(["white", "snow-white"]);
  });

  it("the tutorial farm is exactly newGame(seed) plus the mentor (the skip start mirrors it)", () => {
    const g = newTutorialGame(42);
    const n = newGame(42);
    expect(g.flock).toEqual(n.flock);
    expect(g.money).toBe(n.money);
    expect(g.market).toEqual(n.market);
    expect(g.sheep).toEqual(n.sheep);
  });

  it("the pair are polled horn carriers: the forecast shows about one horned lamb in four, and so does the square", () => {
    for (const seed of [1, 7, 42, 99]) {
      const g = newTutorialGame(seed);
      const t = g.tutorial!;
      expect(g.sheep[t.ewe]!.phenotype["horns"]).toBe("polled");
      expect(g.sheep[t.ram]!.phenotype["horns"]).toBe("polled");
      expect(knownPunnet(g, PUNNET_GENES.horns, t.ewe, t.ram)!.counts).toEqual({ polled: 3, horned: 1 });
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
    expect(serialize(playThrough(21).g)).toBe(serialize(playThrough(21).g));
  });

  it("three lambs, one idea each: white and polled; horned (with the first card); a clear red (never true blue)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { g, reports } = playThrough(seed);
      const t = g.tutorial!;
      const [a, b, c] = tutorialLambs(g);
      expect(reports.map((r) => r.lambs.length), `seed ${seed}`).toEqual([1, 1, 1]);
      expect([a!.phenotype["white"], a!.phenotype["horns"]], `seed ${seed}`).toEqual(["white", "polled"]);
      expect([b!.phenotype["white"], b!.phenotype["horns"]], `seed ${seed}`).toEqual(["white", "horned"]);
      // The coloured lamb: red (two red doses from the pair's true-breeding red), polled, never true blue.
      expect(c!.phenotype["white"], `seed ${seed}`).toBe("coloured");
      expect([c!.phenotype["family"], c!.phenotype["colour"], c!.phenotype["horns"]], `seed ${seed}`).toEqual(["red", "red", "polled"]);
      expect(c!.phenotype["red"]).toBe("2");
      expect(c!.phenotype["blue"]).toBe("0");
      expect(woolOf(c!).trueBlue).toBe(false);
      expect(woolOf(c!).intensity, `seed ${seed}`).toBeGreaterThanOrEqual(0.3); // bright or better: clearly visible
      // No card with the plain first lamb (so no codex yet); the horned lamb brings the first card and the codex.
      expect(reports[0]!.discoveries, `seed ${seed}`).toEqual([]);
      expect(reports[0]!.unlocked).toBeNull();
      expect(reports[1]!.discoveries[0]?.sheep, `seed ${seed}`).toBe(b!.id);
      expect(reports[1]!.discoveries[0]?.locus).toBe("P");
      expect(reports[1]!.unlocked).toBe("cards");
      // The coloured lamb shows both parents hide colour under the white.
      const colourCards = reports[2]!.discoveries.filter((d) => (d.loci ?? [d.locus]).includes("W"));
      expect(colourCards.map((d) => d.sheep).sort(), `seed ${seed}`).toEqual([t.ewe, t.ram].sort());
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
      if (r.lambs.some((l) => l.phenotype["white"] === "white")) white++;
    }
    expect(white).toBeGreaterThan(0);
    expect(white).toBeLessThan(20);
  });

  it("no handover: the end flock is the ewe, the ram, their three lambs and the bought ewe", () => {
    for (const seed of [7, 42, 1234]) {
      const { g } = playThrough(seed);
      const t = g.tutorial!;
      expect(tutorialActive(g)).toBe(false);
      expect(t.done).toBe(true);
      const sheep = g.flock.map((id) => g.sheep[id]!);
      expect(sheep.filter((s) => s.origin === "founder").map((s) => s.id).sort()).toEqual([t.ewe, t.ram].sort());
      expect(sheep.filter((s) => s.origin === "bred")).toHaveLength(3);
      expect(sheep.filter((s) => s.origin === "market" && s.sex === "ewe")).toHaveLength(1);
      expect(g.flock).toHaveLength(6);
      const before = new Set(g.flock);
      advanceSeason(g);
      expect(g.flock.filter((id) => !before.has(id))).toEqual([]);
    }
  });

  it("the letters arrive the moment the tutorial ends, in Year 1, with the horns letter and its lesson", () => {
    const { g } = playThrough(8);
    expect(g.season).toBe(3);
    expect(tutorialOver(g)).toBe("orders");
    expect(g.unlocks).toContain("orders");
    expect(g.orders[0]?.kind).toBe("horns");
    expect(g.lesson).toEqual({ id: "orders", step: 1 });
    expect(tutorialOver(g)).toBeNull();
    // Skipping at once also brings them (the same calendar after that).
    const k = newTutorialGame(9);
    skipTutorial(k);
    expect(tutorialOver(k)).toBe("orders");
    expect(k.orders[0]?.kind).toBe("horns");
  });

  it("makes sure a ewe is affordable at the market step", () => {
    const { g } = playThrough(3, 1);
    expect(g.tutorial!.gift).toBeGreaterThan(0);
    expect(g.money).toBeGreaterThanOrEqual(0);
    const h = newTutorialGame(3);
    expect(buyPrice).toBeTypeOf("function");
    expect(h.tutorial!.gift).toBe(0);
  });

  it("skipping ends the tutorial and adds no sheep", () => {
    const g = newTutorialGame(9);
    const flock = [...g.flock];
    skipTutorial(g);
    expect(tutorialInfo(g)!.done).toBe(true);
    expect(g.flock).toEqual(flock);
  });

  it("round-trips through a save; saves without a tutorial load as none; pre-v3 saves are refused (fresh start)", () => {
    const g = newTutorialGame(13);
    advanceTutorial(g, "ewe");
    expect(serialize(deserialize(serialize(g)))).toBe(serialize(g));
    const old = JSON.parse(serialize(newGame(13))) as Record<string, unknown>;
    delete old["tutorial"];
    expect(deserialize(JSON.stringify(old)).tutorial).toBeNull();
    expect(newGame(13).tutorial).toBeNull();
    const v2 = JSON.parse(serialize(newTutorialGame(13))) as Record<string, unknown>;
    v2["version"] = 2;
    expect(() => deserialize(JSON.stringify(v2))).toThrow(OldSaveError);
  });
});
