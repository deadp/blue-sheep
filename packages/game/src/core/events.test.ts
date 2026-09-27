import { describe, expect, it } from "vitest";
import { advanceSeason, announceText, enterAct, FEED_COST, flockSheep, newGame, woolIncome, isAdult, type EventKind, type GameState } from "./index.js";

function atWinter(seed: number, kind: EventKind, colour: string | null = null): GameState {
  const g = newGame(seed);
  enterAct(g, 1, undefined, { grant: true });
  g.money = 500;
  g.season = 3;
  g.pendingEvent = { kind, season: 3, colour, text: announceText(kind, colour) };
  return g;
}

describe("winter events", () => {
  it("are announced in autumn, a season ahead, from act 1", () => {
    const g = newGame(70);
    enterAct(g, 1, undefined, { grant: true });
    g.money = 500;
    advanceSeason(g); advanceSeason(g); // → autumn (season 2)
    expect(g.pendingEvent).not.toBeNull();
    expect(g.pendingEvent!.season).toBe(3);
    expect(g.log.some((l) => l.text === g.pendingEvent!.text)).toBe(true);
    expect(advanceSeason(g).event).toBeNull(); // autumn passes: time to prepare
    const r = advanceSeason(g); // winter: it happens
    expect(r.event?.kind).toBe(g.events[0]!.kind);
    expect(g.pendingEvent).toBeNull();
  });

  it("no events before act 1", () => {
    const g = newGame(71);
    g.money = 500;
    for (let i = 0; i < 8; i++) advanceSeason(g);
    expect(g.events).toHaveLength(0);
  });

  it("hard winter doubles feed and makes a small sheep ill (named in the record)", () => {
    const g = atWinter(72, "hardWinter");
    const n = g.flock.length;
    const r = advanceSeason(g);
    expect(r.feed).toBe(n * FEED_COST * 2);
    const ill = g.sheep[r.event!.sheep!]!;
    expect(ill.ill).toBe(true);
    const smallest3 = flockSheep(g).filter((s) => isAdult(s, 3)).map((s) => Number(s.phenotype["size"])).sort((a, b) => a - b).slice(0, 3);
    expect(Number(ill.phenotype["size"])).toBeLessThanOrEqual(smallest3[smallest3.length - 1]!);
    expect(r.event!.text).toContain(ill.name);
    advanceSeason(g); // spring: rests
    expect(ill.ill).toBe(false);
  });

  it("fox takes a lamb unless a bold adult guards the flock", () => {
    const g = atWinter(73, "fox");
    for (const s of flockSheep(g)) s.phenotype["boldness"] = 3;
    const lamb = flockSheep(g)[0]!;
    lamb.born = 2; // make one lamb
    const r = advanceSeason(g);
    expect(r.event!.saved).toBe(false);
    expect(r.event!.sheep).toBe(lamb.id);
    expect(g.flock).not.toContain(lamb.id);
    expect(r.deaths.map((d) => d.id)).toContain(lamb.id);

    const h = atWinter(73, "fox");
    const lamb2 = flockSheep(h)[0]!;
    lamb2.born = 2;
    for (const s of flockSheep(h)) s.phenotype["boldness"] = 3;
    flockSheep(h)[1]!.phenotype["boldness"] = 8;
    const r2 = advanceSeason(h);
    expect(r2.event!.saved).toBe(true);
    expect(h.flock).toContain(lamb2.id);
  });

  it("wool boom doubles that colour's wool", () => {
    const g = atWinter(74, "woolBoom", "white");
    const whites = flockSheep(g).filter((s) => s.phenotype["colour"] === "white" && isAdult(s, 3));
    const others = flockSheep(g).filter((s) => s.phenotype["colour"] !== "white" && isAdult(s, 3));
    const expected = whites.reduce((t, s) => t + woolIncome(s, "white"), 0) + others.reduce((t, s) => t + woolIncome(s), 0);
    const r = advanceSeason(g);
    expect(r.income).toBe(expected);
    for (const s of whites) expect(woolIncome(s, "white")).toBeGreaterThanOrEqual(2 * woolIncome(s) - 1);
  });
});
