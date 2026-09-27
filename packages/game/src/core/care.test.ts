import { describe, expect, it } from "vitest";
import {
  advanceSeason, announceText, buyUpgrade, deserialize, enterAct, flockSheep, fondnessOf, fondWoolMultiplier, forecastTreat,
  forecastUpgrade, giveTreat, greetAnimal, isAdult, newGame, predatorRisk, serialize, treatBlocked, woolIncome,
  FOND_GREET, FOND_TREAT, FOND_START, TREAT_COST, MICE_WOOL, PET_FEED, type GameState,
  grantUnlock, brushAnimal, brushedThisSeason, forecastBrush, FOND_BRUSH,
} from "./index.js";
import { announceEvent } from "./events.js";
import { announceMice } from "./mice.js";
import { createRng } from "@blue-sheep/genetics";
import { GENOTYPE_RE, planAll } from "./testkit.js";

function devoted(g: GameState, id: string, level = 100): void {
  g.care = { ...(g.care ?? {}), [id]: { level, greeted: -1, treated: -1, cared: g.season } };
}

describe("fondness", () => {
  it("grows once per animal per season from a greeting", () => {
    const g = newGame(300);
    const id = g.flock[0]!;
    const start = fondnessOf(g, id);
    expect(start).toBe(FOND_START.founder);
    expect(greetAnimal(g, id)).toBe(FOND_GREET);
    expect(greetAnimal(g, id)).toBe(0); // second hello the same season: nothing more
    expect(fondnessOf(g, id)).toBe(start + FOND_GREET);
    advanceSeason(g);
    expect(greetAnimal(g, id)).toBe(FOND_GREET); // a new season: counts again
    expect(fondnessOf(g, id)).toBe(start + 2 * FOND_GREET);
  });

  it("only your own animals can be greeted", () => {
    const g = newGame(301);
    expect(greetAnimal(g, g.market[0]!)).toBe(0);
    expect(greetAnimal(g, "collie")).toBe(0); // no dog yet
    g.money = 500;
    grantUnlock(g, "dogs");
    buyUpgrade(g, "collie");
    expect(greetAnimal(g, "collie")).toBe(FOND_GREET);
  });

  it("a treat costs one coin, gives a bigger boost and only once a season", () => {
    const g = newGame(302);
    const id = g.flock[1]!;
    const before = g.money, f0 = fondnessOf(g, id);
    const fc = forecastTreat(g, id);
    expect(fc.after).toBe(f0 + FOND_TREAT);
    expect(fc.text).not.toMatch(GENOTYPE_RE);
    expect(giveTreat(g, id)).toBe(FOND_TREAT);
    expect(g.money).toBe(before - TREAT_COST);
    expect(fondnessOf(g, id)).toBe(fc.after);
    expect(treatBlocked(g, id)).toMatch(/already|this season/);
    expect(() => giveTreat(g, id)).toThrow();
    g.money = 0;
    expect(treatBlocked(g, g.flock[0]!)).toMatch(/coin/);
  });

  it("fades slowly when an animal is ignored for a few seasons", () => {
    const g = newGame(303);
    const id = g.flock[0]!;
    devoted(g, id, 60);
    const levels: number[] = [];
    for (let i = 0; i < 6; i++) { advanceSeason(g); levels.push(fondnessOf(g, id)); }
    expect(levels[0]).toBe(60); // a season or two's grace
    expect(levels[levels.length - 1]).toBeLessThan(60);
    expect(60 - levels[levels.length - 1]!).toBeLessThanOrEqual(20); // slowly
    for (let i = 1; i < levels.length; i++) expect(levels[i]!).toBeLessThanOrEqual(levels[i - 1]!);
  });

  it("farm-born lambs start friendlier than bought-in sheep, more so when mum is fond of you", () => {
    const run = (damLevel: number) => {
      const g = newGame(304);
      for (const id of g.flock) devoted(g, id, damLevel);
      planAll(g);
      const r = advanceSeason(g);
      return r.lambs.map((l) => fondnessOf(g, l.id));
    };
    const low = run(0), high = run(100);
    expect(low.length).toBeGreaterThan(0);
    for (const f of low) expect(f).toBeGreaterThan(FOND_START.market);
    expect(Math.min(...high)).toBeGreaterThan(Math.max(...low));
  });

  it("changes the wool price modestly: up to +15 % devoted, a little less skittish", () => {
    expect(fondWoolMultiplier(100)).toBeCloseTo(1.15);
    expect(fondWoolMultiplier(30)).toBe(1);
    expect(fondWoolMultiplier(0)).toBeCloseTo(0.92);
    expect(fondWoolMultiplier(70)).toBeGreaterThan(1);
    expect(fondWoolMultiplier(70)).toBeLessThan(1.15);
  });

  it("happy sheep earn more at shearing, and the report says how much", () => {
    const g = newGame(305);
    const adults = flockSheep(g).filter((s) => isAdult(s, g.season));
    const plain = adults.reduce((t, s) => t + woolIncome(s), 0);
    for (const s of adults) devoted(g, s.id, 100);
    const r = advanceSeason(g);
    expect(r.fondBonus).toBeGreaterThan(0);
    expect(r.income).toBe(plain + r.fondBonus);
    expect(forecastTreat(g, adults[0]!.id).text).toMatch(/couldn't be any fonder/);
  });

  it("round-trips in saves, and older saves load with defaults", () => {
    const g = newGame(306);
    greetAnimal(g, g.flock[0]!);
    expect(serialize(deserialize(serialize(g)))).toBe(serialize(g));
    const raw = JSON.parse(serialize(g)) as Record<string, unknown>;
    delete raw["care"]; delete raw["mice"];
    const old = deserialize(JSON.stringify(raw));
    expect(old.care).toEqual({});
    expect(old.mice).toBeNull();
    expect(fondnessOf(old, old.flock[0]!)).toBe(FOND_START.founder);
  });
});

describe("dogs and predators", () => {
  it("an old save's sheepdog becomes Bess the border collie", () => {
    const g = newGame(310);
    const raw = JSON.parse(serialize(g)) as Record<string, unknown>;
    raw["upgrades"] = ["dog", "barn"];
    const back = deserialize(JSON.stringify(raw));
    expect(back.upgrades).toEqual(["collie", "barn"]);
  });

  it("each tier guards differently against a fox and a wolf", () => {
    const g = newGame(311);
    for (const s of flockSheep(g)) s.phenotype["boldness"] = 2; // no bold guardian
    expect(predatorRisk(g, "fox", [])).toBe(1);
    expect(predatorRisk(g, "wolf", [])).toBe(1);
    for (const d of ["terrier", "collie", "maremma"] as const) devoted(g, d, 100);
    expect(predatorRisk(g, "fox", ["terrier"])).toBeCloseTo(0.5);
    expect(predatorRisk(g, "wolf", ["terrier"])).toBe(1); // useless against wolves
    expect(predatorRisk(g, "fox", ["collie"])).toBeCloseTo(0.1);
    expect(predatorRisk(g, "wolf", ["collie"])).toBeCloseTo(0.7);
    expect(predatorRisk(g, "wolf", ["maremma"])).toBeCloseTo(0.1);
    // dogs keep watch together
    expect(predatorRisk(g, "fox", ["terrier", "collie"])).toBeCloseTo(0.05);
    // a dog that barely knows you guards a little less well
    devoted(g, "collie", 0);
    expect(predatorRisk(g, "fox", ["collie"])).toBeGreaterThan(0.1);
    // a bold sheep sees off a fox, never a wolf
    flockSheep(g)[0]!.phenotype["boldness"] = 9;
    expect(predatorRisk(g, "fox", [])).toBe(0);
    expect(predatorRisk(g, "wolf", [])).toBe(1);
  });

  it("buying a dog changes the predator forecast, shown before buying", () => {
    const g = newGame(312);
    enterAct(g, 2, undefined, { grant: true });
    g.money = 1000;
    for (const s of flockSheep(g)) s.phenotype["boldness"] = 2;
    const t = forecastUpgrade(g, "terrier");
    expect(t.risk!.fox.with).toBeLessThan(t.risk!.fox.now);
    expect(t.risk!.wolf.with).toBe(t.risk!.wolf.now);
    const m = forecastUpgrade(g, "maremma");
    expect(m.risk!.wolf.with).toBeLessThan(0.2);
    expect(m.text).not.toMatch(/undefined|NaN|%/);
    buyUpgrade(g, "collie");
    const t2 = forecastUpgrade(g, "terrier");
    expect(t2.risk!.fox.now).toBeLessThan(1); // the collie already helps
    expect(t2.text).toMatch(/Bess/); // keeps watch with her
  });

  it("the fox's real odds match the forecast over many winters", () => {
    let taken = 0;
    const N = 300;
    let risk = 0;
    for (let i = 0; i < N; i++) {
      const g = newGame(400 + (i % 5));
      enterAct(g, 1, undefined, { grant: true });
      g.money = 500;
      g.rng = 1000 + i;
      buyUpgrade(g, "terrier");
      for (const s of flockSheep(g)) s.phenotype["boldness"] = 2;
      flockSheep(g)[0]!.born = 2; // one lamb
      g.season = 3;
      g.pendingEvent = { kind: "fox", season: 3, colour: null, text: announceText("fox", null) };
      risk = predatorRisk(g, "fox");
      const r = advanceSeason(g);
      if (!r.event!.saved) taken++;
    }
    expect(Math.abs(taken / N - risk)).toBeLessThan(0.1);
  });

  it("a wolf takes a lamb unless a guardian dog stops it, and only comes in later acts", () => {
    const g = newGame(313);
    enterAct(g, 2, undefined, { grant: true });
    g.money = 500;
    for (const s of flockSheep(g)) s.phenotype["boldness"] = 9; // bold sheep don't scare wolves
    const lamb = flockSheep(g)[0]!;
    lamb.born = 2;
    g.season = 3;
    g.pendingEvent = { kind: "wolf", season: 3, colour: null, text: announceText("wolf", null) };
    const r = advanceSeason(g);
    expect(r.event!.kind).toBe("wolf");
    expect(r.event!.saved).toBe(false);
    expect(g.flock).not.toContain(lamb.id);
    // wolves are never announced before WOLF_MIN_ACT
    const early = newGame(314);
    enterAct(early, 1, undefined, { grant: true });
    const rng = createRng(5);
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) { early.season = 2; kinds.add(announceEvent(early, rng)!.kind); }
    expect(kinds.has("wolf")).toBe(false);
    enterAct(early, 2, undefined, { grant: true });
    for (let i = 0; i < 200; i++) { early.season = 2; kinds.add(announceEvent(early, rng)!.kind); }
    expect(kinds.has("wolf")).toBe(true);
  });
});

describe("upkeep", () => {
  it("the dogs and the cat eat too: their food is on the feed bill", () => {
    const run = (pets: string[]) => {
      const g = newGame(330);
      enterAct(g, 2, undefined, { grant: true });
      g.money = 1000;
      for (const p of pets) buyUpgrade(g, p);
      g.mice = null;
      return advanceSeason(g).feed;
    };
    expect(run(["terrier", "maremma", "cat"]) - run([])).toBe(PET_FEED.terrier + PET_FEED.maremma + PET_FEED.cat);
  });
});

describe("mice and the cat", () => {
  it("are announced a season ahead, only from act 1", () => {
    const g = newGame(320);
    const rng = createRng(9);
    for (let i = 0; i < 50; i++) expect(announceMice(g, rng)).toBe(false);
    enterAct(g, 1, undefined, { grant: true });
    let n = 0;
    while (!announceMice(g, rng) && n++ < 100) { /* keep asking */ }
    expect(g.mice).toBe(g.season + 1);
    expect(announceMice(g, rng)).toBe(false); // one at a time
  });

  it("spoil wool and eat hay; the cat catches most of them, and the forecast says so first", () => {
    const setup = (cat: boolean) => {
      const g = newGame(321);
      enterAct(g, 1, undefined, { grant: true });
      g.money = 500;
      if (cat) buyUpgrade(g, "cat");
      g.mice = g.season;
      return g;
    };
    const bare = setup(false);
    const f = forecastUpgrade(bare, "cat");
    expect(f.mice!.with).toBeLessThan(f.mice!.now);
    expect(f.text).toMatch(/Mog/);
    const adults = flockSheep(bare).filter((s) => isAdult(s, bare.season));
    const clip = adults.reduce((t, s) => t + woolIncome(s), 0);
    const r0 = advanceSeason(bare);
    expect(r0.mice).not.toBeNull();
    expect(r0.mice!.wool).toBe(Math.round(clip * MICE_WOOL));
    expect(r0.mice!.feed).toBeGreaterThan(0);
    expect(r0.income).toBe(clip - r0.mice!.wool);
    expect(bare.mice).toBeNull();
    const withCat = setup(true);
    const r1 = advanceSeason(withCat);
    expect(r1.mice!.cat).toBe(true);
    expect(r1.mice!.wool + r1.mice!.feed).toBeLessThan(r0.mice!.wool + r0.mice!.feed);
    expect(r1.mice!.text).toMatch(/Mog/);
    expect(r1.feed).toBeLessThan(r0.feed);
  });
});

describe("brushing", () => {
  it("counts once per animal per season, alongside greeting and a treat", () => {
    const g = newGame(310);
    const id = g.flock[0]!;
    const f0 = fondnessOf(g, id);
    expect(FOND_BRUSH).toBe(6);
    expect(forecastBrush(g, id)!.after).toBe(f0 + FOND_BRUSH);
    expect(brushedThisSeason(g, id)).toBe(false);
    expect(brushAnimal(g, id)).toBe(FOND_BRUSH);
    expect(brushedThisSeason(g, id)).toBe(true);
    expect(forecastBrush(g, id)).toBeNull();
    expect(brushAnimal(g, id)).toBe(0); // again this season: nothing
    expect(greetAnimal(g, id)).toBe(FOND_GREET); // the three ways stack
    giveTreat(g, id);
    expect(fondnessOf(g, id)).toBe(f0 + FOND_BRUSH + FOND_GREET + FOND_TREAT);
    advanceSeason(g);
    expect(brushedThisSeason(g, id)).toBe(false);
    expect(brushAnimal(g, id)).toBe(FOND_BRUSH); // a new season: counts again
  });

  it("only your own animals; a dog or the cat gets a pat the same way", () => {
    const g = newGame(311);
    expect(brushAnimal(g, g.market[0]!)).toBe(0);
    expect(brushAnimal(g, "cat")).toBe(0);
    grantUnlock(g, "cat");
    g.act = 1;
    g.money = 500;
    buyUpgrade(g, "cat");
    expect(brushAnimal(g, "cat")).toBe(FOND_BRUSH);
    expect(forecastBrush(g, g.flock[0]!)!.text).not.toMatch(GENOTYPE_RE);
  });

  it("is deterministic state and loads from saves without it (absent = never brushed)", () => {
    const g = newGame(312);
    const id = g.flock[1]!;
    greetAnimal(g, id);
    const raw = JSON.parse(serialize(g)) as { care: Record<string, Record<string, unknown>> };
    expect("brushed" in raw.care[id]!).toBe(false);
    const back = deserialize(JSON.stringify(raw));
    expect(brushedThisSeason(back, id)).toBe(false);
    expect(brushAnimal(back, id)).toBe(FOND_BRUSH);
    expect(serialize(deserialize(serialize(back)))).toBe(serialize(back));
  });
});
