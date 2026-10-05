import { describe, expect, it } from "vitest";
import {
  CALENDAR, ORDERS_BY, PACING, advanceSeason, advanceTutorial, tutorialOver, buyUpgrade, enterAct, eventPool, grantUnlock, newGame, newTutorialGame,
  nextDated, nextUnlock, skipTutorial, upgradeBlocked, upgradeOffered, type GameState, type Unlock,
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

describe("pacing: a calendar, one new concept a season", () => {
  it("the order and the dates are fixed", () => {
    expect(PACING.map((p) => p.id)).toEqual(["cards", "orders", "vet", "craft", "farm", "dogs", "cat", "numbers", "fair", "tree", "visitor"]);
    // Year 2 Spring, Year 2 Autumn, Year 3 Spring, Year 3 Autumn (season 0 = Year 1 Spring).
    expect(CALENDAR).toEqual({ vet: 4, craft: 7, farm: 6, dogs: 8, cat: 10 });
  });

  it("each dated concept arrives exactly on its season, letters in year 1, never two at once", () => {
    for (const seed of [3, 8, 21, 44, 57]) {
      const g = newGame(seed);
      const got = run(g, 14);
      const when = Object.fromEntries(got.map((x) => [x.id, x.season]));
      expect(when["orders"], `seed ${seed}`).toBeLessThanOrEqual(2); // no tutorial: the first free season (Year 1)
      // The codex comes with the first discovery card, whenever that is.
      if (g.discoveries.length) expect(when["cards"], `seed ${seed}`).toBeGreaterThanOrEqual(g.discoveries[0]!.season);
      for (const [id, season] of Object.entries(CALENDAR)) expect(when[id], `seed ${seed} ${id}`).toBe(season);
      const seasons = got.map((x) => x.season);
      expect(new Set(seasons).size, `seed ${seed}`).toBe(seasons.length);
    }
  });

  it("a skipped tutorial follows the same calendar (the letters come at once)", () => {
    const g = newTutorialGame(9);
    skipTutorial(g);
    expect(tutorialOver(g)).toBe("orders");
    expect(g.season).toBe(0);
    const got = run(g, 11);
    expect(got.map((x) => `${x.id}@${x.season}`)).toEqual(expect.arrayContaining(["vet@4", "craft@7", "farm@6", "dogs@8", "cat@10"]));
  });

  it("letters never come during the tutorial; they come when it ends, or by Year 2 Summer if it never does", () => {
    const g = newTutorialGame(4);
    const t = g.tutorial!;
    for (let i = 0; i < 3; i++) { g.plans[t.ewe] = t.ram; advanceSeason(g); }
    expect(g.unlocks).toEqual(["cards"]); // the horned lamb's card brought the codex, nothing else
    g.tutorial!.done = true;
    expect(tutorialOver(g)).toBe("orders");
    expect(g.season).toBe(3); // Year 1 Winter
    expect(g.orders[0]?.kind).toBe("horns");
    expect(g.orders.length).toBe(1);

    const h = newTutorialGame(5);
    const got = run(h, ORDERS_BY + 1);
    expect(got.find((x) => x.id === "orders")?.season).toBe(ORDERS_BY);
    expect(got.find((x) => x.id === "vet")?.season).toBe(4);
  });

  it("the first letter asks for horns in a normal game too", () => {
    for (const seed of [1, 2, 3, 11]) {
      const g = newGame(seed);
      run(g, 2);
      expect(g.unlocks).toContain("orders");
      expect([...g.orders, ...g.orderHistory].sort((a, b) => a.posted - b.posted)[0]?.kind, `seed ${seed}`).toBe("horns");
    }
  });

  it("act concepts queue behind the calendar: never in a dated season, never two at once", () => {
    const g = newGame(51);
    grantUnlock(g, "cards");
    grantUnlock(g, "orders");
    g.season = 3;
    g.act = 2;
    expect(nextUnlock(g)).toBe("numbers"); // season 3 is free
    grantUnlock(g, "numbers");
    expect(nextUnlock(g)).toBeNull(); // one a season
    g.season = 4;
    expect(nextUnlock(g)).toBe("vet"); // the vet's season, not the fair's
    grantUnlock(g, "vet");
    g.season = 5;
    expect(nextUnlock(g)).toBe("fair");
    grantUnlock(g, "fair");
    expect(g.fair.nextSeason).toBeGreaterThan(5); // a season's notice before the first fair
    g.season = 6;
    g.act = 3;
    expect(nextUnlock(g)).toBe("farm");
    grantUnlock(g, "farm");
    g.season = 7;
    expect(nextUnlock(g)).toBe("craft"); // the woolshed's season, not the tree's
    grantUnlock(g, "craft");
    g.season = 8;
    expect(nextUnlock(g)).toBe("dogs");
    grantUnlock(g, "dogs");
    g.season = 9;
    expect(nextUnlock(g)).toBe("tree");
    grantUnlock(g, "tree");
    g.season = 10;
    expect(nextUnlock(g)).toBe("cat");
    grantUnlock(g, "cat");
    g.season = 11;
    expect(nextUnlock(g)).toBe("visitor");
  });

  it("in play, an early blue lamb's concepts still never share a season with the calendar", () => {
    // Force act 2 in Year 1 Autumn and act 3 a season later: the act concepts fill the free seasons.
    const g = newGame(77);
    const got = run(g, 12, (s) => { if (s.season === 2) enterAct(s, 2); if (s.season === 3) enterAct(s, 3); });
    const seasons = got.map((x) => x.season);
    expect(new Set(seasons).size).toBe(seasons.length);
    for (const [id, season] of Object.entries(CALENDAR)) expect(got.find((x) => x.id === id)?.season, id).toBe(season);
    for (const x of got.filter((x) => ["numbers", "fair", "tree", "visitor"].includes(x.id))) {
      expect(Object.values(CALENDAR)).not.toContain(x.season);
    }
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
  });

  it("no fox is ever announced or raids before dogs are on sale, and no mice before the cat", () => {
    for (const seed of [2, 6, 13, 29, 31, 48]) {
      const g = newGame(seed);
      for (let i = 0; i < 16; i++) {
        g.money = Math.max(g.money, 400);
        planAll(g);
        const r = advanceSeason(g);
        const dogs = g.paced?.dogs;
        if (r.announced?.kind === "fox" || r.announced?.kind === "wolf") expect(dogs, `seed ${seed} season ${g.season}`).toBeDefined();
        if (r.event?.kind === "fox" || r.event?.kind === "wolf") expect(dogs! < r.event.season, `seed ${seed}`).toBe(true);
        if (g.season < CALENDAR.dogs!) expect(g.pendingEvent?.kind === "fox").toBe(false);
        if (r.miceComing) expect(g.unlocks).toContain("cat");
      }
    }
  });

  it("the board can say when the next dated concept comes", () => {
    const g = newGame(3);
    expect(nextDated(g)).toEqual({ id: "vet", season: 4 });
    grantUnlock(g, "vet");
    expect(nextDated(g)).toEqual({ id: "farm", season: 6 });
    grantUnlock(g, "farm");
    expect(nextDated(g)).toEqual({ id: "craft", season: 7 });
  });

  it("the fast-forward grants everything up to the act at once, with no lesson", () => {
    const g = newGame(8);
    enterAct(g, 3, undefined, { grant: true });
    for (const u of ["cards", "orders", "vet", "craft", "farm", "dogs", "cat", "numbers", "fair", "tree", "visitor"]) expect(g.unlocks).toContain(u);
    expect(g.lesson ?? null).toBeNull();
    expect(nextUnlock(g)).toBeNull();
  });

  it("old saves keep what they had unlocked, and a missed dated concept comes at once", () => {
    const g = newGame(60);
    g.unlocks = ["cards", "vet", "orders"];
    delete g.paced;
    g.season = 9;
    expect(nextUnlock(g)).toBe("farm");
  });

  it("the tutorial's advance never unlocks anything by itself", () => {
    const g = newTutorialGame(12);
    expect(advanceTutorial(g, "ewe")).toBe(true);
    expect(g.unlocks).toEqual([]);
  });
});
