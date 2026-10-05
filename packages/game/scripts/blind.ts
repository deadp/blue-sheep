/**
 * Knowledge-limited farmer: plays through the whole game using only what the player can know — forecasts,
 * posteriors ("facts") and visible traits. Never reads a genome. Targets (DESIGN-v3 Phase 2): first true blue
 * lamb at a median of 8–16 seasons, ≥ 90 % of seeds reach the ending within 60 seasons, median end money
 * 300–900. Run: npx vite-node packages/game/scripts/blind.ts
 */
import {
  VET_FEE, canBreed, flockSheep, forecastCross, forecastVet, geneDist, marginal, orderTarget, pColour, vetTest,
  type GameState, type Sheep,
} from "../src/core/index.js";
import { feedReserve, play, summarise, type Brain } from "./policy.js";

/** Expected "+" copies of a pigment channel (0..4) from its class distribution ("hk": h double, k single). */
const paint = (g: GameState, s: Sheep, gene: "red" | "yellow" | "blue"): number => {
  let e = 0;
  for (const [k, p] of Object.entries(geneDist(g, s.id, gene))) e += p * (2 * Number(k[0]) + Number(k[1]));
  return e;
};
/** Expected copies of the colour (non-white) allele w. */
const wCopies = (g: GameState, s: Sheep): number => {
  let e = 0;
  for (const [k, p] of Object.entries(marginal(g, s.id, "W"))) e += p * k.split("/").filter((x) => x === "w").length;
  return e;
};

export const blind: Brain = {
  name: "blind",
  cross(g, ewe, ram) {
    const f = forecastCross(g, ewe, ram);
    return {
      trueBlue: f.trueBlue, blue: pColour(f, "blue"), horns: f.horns, learnBits: f.learnBits,
      pOrder: (o) => { const t = orderTarget(o); return pColour(f, t.colour, t.min); },
    };
  },
  doses(g, s) {
    return { blue: paint(g, s, "blue"), w: wCopies(g, s), ry: paint(g, s, "red") + paint(g, s, "yellow") };
  },
  vet(g) {
    if (!g.unlocks.includes("vet") || g.money < VET_FEE + 40 + feedReserve(g)) return;
    const pool = flockSheep(g).filter((s) => canBreed(s, g.season));
    if (g.visitingRam?.season === g.season) pool.push(g.sheep[g.visitingRam.id]!);
    let best: { id: string; locus: string; v: number } | null = null;
    for (const s of pool) for (const [locus, w] of [["blue", 1.5], ["W", 1], ["red", 0.4], ["yellow", 0.4]] as const) {
      const v = forecastVet(g, s.id, locus).gainBits * w;
      if (!best || v > best.v) best = { id: s.id, locus, v };
    }
    if (best && best.v >= 0.6) vetTest(g, best.id, best.locus);
  },
};

const MAX = Number(process.env["MAXS"] ?? 60);
const N = Number(process.env["SEEDS"] ?? 30);
const FROM = Number(process.env["FROM"] ?? 1); // first seed
const results = [];
for (let i = 0; i < N; i++) results.push(await play(FROM + i, blind, MAX));
if (process.env["OUT"]) (await import("node:fs")).writeFileSync(process.env["OUT"], JSON.stringify(results));
summarise("blind (knowledge-limited)", results, MAX);
