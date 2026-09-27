import { describe, expect, it } from "vitest";
import {
  PACE_WAIT, PACING, acceptOrder, advanceSeason, buyUpgrade, eventPool, grantUnlock, newGame, newTutorialGame, nextUnlock,
  upgradeBlocked, upgradeOffered, vetTest, type GameState, type Unlock,
} from "./index.js";
import { planAll } from "./testkit.js";

/** Sleep through seasons (planning every ewe, coins topped up), recording what arrived in which season. */
function run(g: GameState, seasons: number, each?: (g: GameState) => void): { season: number; id: Unlock }[] {
  const got: { season: number; id: Unlock }[] = [];
  for (let i = 0; i < seasons; i++) {
    g.money = Math.max(g.money, 400);
    each?.(g);
    planAll(g);
    const r = advanceSeason(g);
    if (r.unlocked) got.push({ season: g.season, id: r.unlocked });
  }
  return got;
}

describe("pacing: one new concept at a time", () => {
  it("the ladder order is fixed", () => {
    expect(PACING.map((p) => p.id)).toEqual(["cards", "orders", "vet", "farm", "dogs", "cat", "numbers", "fair", "tree", "visitor"]);
  });

  it("never more than one concept a season, in ladder order, each after its trigger", () => {
    for (const seed of [3, 8, 21]) {
      const g = newGame(seed);
      const got = run(g, 30);
      const seasons = got.map((x) => x.season);
      expect(new Set(seasons).size, `seed ${seed}`).toBe(seasons.length);
      const order = PACING.map((p) => p.id);
      const idx = got.map((x) => order.indexOf(x.id));
      // The early chain comes strictly in ladder order, none skipped; so do the story concepts.
      const cut = order.indexOf("numbers");
      const early = idx.filter((i) => i < cut), story = idx.filter((i) => i >= cut);
      expect(early, `seed ${seed}`).toEqual(early.map((_, k) => k));
      expect(story, `seed ${seed}`).toEqual(story.map((_, k) => cut + k));
      expect(got[0]?.id).toBe("cards");
      expect(got[0]?.season).toBe(1); // the first lambs
    }
  });

  it("cards come with the first lamb; orders not until the tutorial is over", () => {
    const g = newTutorialGame(4);
    const t = g.tutorial!;
    g.tutorial!.step = 6; // "sleep"
    g.plans[t.ewe] = t.ram;
    const r1 = advanceSeason(g);
    expect(r1.unlocked).toBe("cards");
    expect(g.unlocks).toEqual(["cards"]);
    // Still in the tutorial: another season brings nothing new.
    const r2 = advanceSeason(g);
    expect(r2.unlocked).toBeNull();
    g.tutorial!.done = true;
    const r3 = advanceSeason(g);
    expect(r3.unlocked).toBe("orders");
    expect(g.orders.length).toBeLessThanOrEqual(1); // a single letter to start with
  });

  it("each concept waits until the one before has been used, or PACE_WAIT seasons", () => {
    const g = newGame(12);
    g.money = 400;
    planAll(g);
    advanceSeason(g); // cards
    advanceSeason(g); // orders
    expect(g.unlocks).toEqual(["cards", "orders"]);
    // Ignore the letters: the vet comes only after PACE_WAIT seasons.
    let waited = 0;
    while (!g.unlocks.includes("vet")) { advanceSeason(g); waited++; }
    expect(waited).toBe(PACE_WAIT);
    // Use the vet at once: the farm improvements follow the very next season.
    g.money = 400;
    const id = g.flock[0]!;
    vetTest(g, id, "D");
    expect(nextUnlock(g)).toBeNull(); // not in the same season
    expect(advanceSeason(g).unlocked).toBe("farm");
  });

  it("taking an order opens the vet the next season", () => {
    const g = newGame(31);
    g.money = 400;
    grantUnlock(g, "cards");
    g.season = 5;
    grantUnlock(g, "orders");
    g.orders.push({
      id: "o1", kind: "horns", villager: "Mrs Pike", text: "", colour: null, horns: "horned", sex: null, kg: null, microns: null,
      posted: 5, expires: 7, deadline: 9, reward: 10, reputation: 1, status: "open", filledBy: [], resolvedSeason: null,
    });
    g.nextOrderId = 2;
    acceptOrder(g, "o1");
    expect(advanceSeason(g).unlocked).toBe("vet");
  });

  it("the market sells improvements, dogs and the cat only once each has arrived; weather, foxes and mice follow them", () => {
    const g = newGame(40);
    g.money = 1000;
    expect(upgradeOffered(g, "barn")).toBe(false);
    expect(upgradeBlocked(g, "barn")).toMatch(/market/);
    expect(() => buyUpgrade(g, "terrier")).toThrow();
    g.act = 1;
    expect(eventPool(g)).toEqual([]);
    grantUnlock(g, "farm");
    expect(eventPool(g)).toEqual(["hardWinter", "woolBoom"]);
    expect(upgradeOffered(g, "barn")).toBe(true);
    expect(upgradeOffered(g, "collie")).toBe(false);
    grantUnlock(g, "dogs");
    expect(eventPool(g)).toContain("fox");
    expect(upgradeOffered(g, "collie")).toBe(true);
    expect(upgradeOffered(g, "cat")).toBe(false);
    // no mice without the cat concept, however long you wait
    for (let i = 0; i < 12; i++) { g.money = 1000; advanceSeason(g); if (g.unlocks.includes("cat")) break; expect(g.mice ?? null).toBeNull(); }
  });

  it("a story concept jumps ahead of waiting early ones once its act begins", () => {
    const g = newGame(51);
    for (const u of ["cards", "orders", "vet"] as const) grantUnlock(g, u);
    g.season = 20;
    expect(nextUnlock(g)).toBe("farm");
    g.act = 2;
    expect(nextUnlock(g)).toBe("numbers");
  });

  it("numbers and the fair wait for act 2, the tree and visitors for act 3", () => {
    const g = newGame(50);
    for (const u of ["cards", "orders", "vet", "farm", "dogs", "cat"] as const) grantUnlock(g, u);
    g.season = 10;
    expect(nextUnlock(g)).toBeNull();
    g.act = 2;
    expect(nextUnlock(g)).toBe("numbers");
    grantUnlock(g, "numbers");
    g.season = 11;
    expect(nextUnlock(g)).toBe("fair");
    grantUnlock(g, "fair");
    expect(g.fair.nextSeason).toBeGreaterThan(11); // a season's notice before the first fair
    expect(nextUnlock(g)).toBeNull(); // one a season
    g.season = 12;
    expect(nextUnlock(g)).toBeNull(); // the tree needs act 3
    g.act = 3;
    expect(nextUnlock(g)).toBe("tree"); // earned by the act: no wait for the fair to be used
    grantUnlock(g, "tree");
    expect(nextUnlock(g)).toBeNull();
    g.season = 13;
    expect(nextUnlock(g)).toBe("visitor");
  });

  it("old saves keep what they had unlocked", () => {
    const g = newGame(60);
    g.unlocks = ["cards", "vet", "orders"];
    delete g.paced;
    g.season = 3;
    expect(nextUnlock(g)).toBe("farm"); // the missing early concept, straight away
  });
});
