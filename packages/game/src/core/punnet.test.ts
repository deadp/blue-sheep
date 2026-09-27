import { describe, expect, it } from "vitest";
import { createRng, discretePhenotype, mate, sheep as defs } from "@blue-sheep/genetics";
import { genomeOf, knownCopies, newGame, PUNNET_GENES, punnetLook, punnetSquare, species } from "./index.js";

const H = PUNNET_GENES.horns;
const C = PUNNET_GENES.colour;

describe("Punnet square", () => {
  it("two carriers: 3 dominant looks to 1 hidden, every cell one copy from each parent", () => {
    const sq = punnetSquare(H, ["P", "p"], ["P", "p"]);
    expect(sq.counts).toEqual({ polled: 3, horned: 1 });
    expect(sq.recessiveShare).toBe(0.25);
    expect(sq.cells.map((c) => `${c.fromDam}${c.fromSire}:${c.look}`)).toEqual(["PP:polled", "Pp:polled", "pP:polled", "pp:horned"]);
    for (const c of sq.cells) expect([sq.dam[c.r], sq.sire[c.c]]).toEqual([c.fromDam, c.fromSire]);
  });

  it("gives the textbook ratios for every pairing", () => {
    const share = (d: [string, string], s: [string, string]) => punnetSquare(H, d, s).recessiveShare;
    expect(share(["P", "P"], ["p", "p"])).toBe(0); // all polled, all carriers
    expect(share(["P", "p"], ["p", "p"])).toBe(0.5); // carrier × horned: half and half
    expect(share(["p", "p"], ["p", "p"])).toBe(1);
    expect(share(["P", "P"], ["P", "P"])).toBe(0);
    expect(punnetSquare(C, ["Aw", "a"], ["Aw", "a"]).counts).toEqual({ white: 3, coloured: 1 });
    expect(punnetLook(C, "a", "a")).toBe("coloured");
  });

  it("matches real meiosis: two horn carriers have about one horned lamb in four", () => {
    const g = newGame(5);
    const [e, r] = g.flock.map((id) => genomeOf(g.sheep[id]!));
    const rng = createRng(77);
    let horned = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (discretePhenotype(mate(e!, r!, species.map, rng), species.map, defs.horns) === "horned") horned++;
    expect(Math.abs(horned / n - punnetSquare(H, ["P", "p"], ["P", "p"]).recessiveShare)).toBeLessThan(0.025);
  });

  it("reads parents' copies from what the farm knows, never from genomes", () => {
    const g = newGame(6);
    const [e] = g.flock;
    expect(knownCopies(g, e!, H)).toEqual(["P", "p"]);
    expect(knownCopies(g, e!, C)).toBeNull(); // hidden colour isn't proven yet
    g.known[e!] = { ...g.known[e!], A: "a/Aw" };
    expect(knownCopies(g, e!, C)).toEqual(["Aw", "a"]);
  });
});
