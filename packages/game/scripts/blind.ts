/**
 * Knowledge-limited farmer: plays through the whole game using only what the
 * player can know — forecasts, posteriors ("facts") and visible traits. Never
 * reads a genome. Target: >= 80% of seeds reach the ending within 60 seasons.
 * Run: npx vite-node packages/game/scripts/blind.ts
 */
import {
  VET_FEE, canBreed, flockSheep, forecastCross, forecastVet, marginal, vetTest, type GameState, type Sheep,
} from "../src/core/index.js";
import { play, summarise, type Brain } from "./policy.js";

const dose = (g: GameState, s: Sheep, locus: string, allele: string): number => {
  let e = 0;
  for (const [k, p] of Object.entries(marginal(g, s.id, locus))) e += p * k.split("/").filter((x) => x === allele).length;
  return e;
};

export const blind: Brain = {
  name: "blind",
  cross(g, ewe, ram) {
    const f = forecastCross(g, ewe, ram);
    return { colour: f.colour, horns: f.horns, learnBits: f.learnBits };
  },
  doses(g, s) {
    return { d: dose(g, s, "D", "d"), a: dose(g, s, "A", "a"), B: dose(g, s, "B", "B") };
  },
  vet(g) {
    if (!g.unlocks.includes("vet") || g.money < VET_FEE + 40) return;
    const pool = flockSheep(g).filter((s) => canBreed(s, g.season));
    if (g.visitingRam?.season === g.season) pool.push(g.sheep[g.visitingRam.id]!);
    let best: { id: string; locus: string; v: number } | null = null;
    for (const s of pool) for (const [locus, w] of [["D", 1.5], ["A", 1], ["B", 0.6]] as const) {
      const v = forecastVet(g, s.id, locus).gainBits * w;
      if (!best || v > best.v) best = { id: s.id, locus, v };
    }
    if (best && best.v >= 0.6) vetTest(g, best.id, best.locus);
  },
};

const MAX = 60;
const N = Number(process.env["SEEDS"] ?? 30);
const FROM = Number(process.env["FROM"] ?? 1); // first seed
const results = [];
for (let i = 0; i < N; i++) results.push(await play(FROM + i, blind, MAX));
summarise("blind (knowledge-limited)", results, MAX);
