/** How many seasons to a blue lamb with a perfect-knowledge greedy breeder? */
import { genotypeAt } from "@blue-sheep/genetics";
import { advanceSeason, buySheep, ramPrice, sellSheep } from "../src/sim.js";
import { genomeOf, isAdult, newGame, species, type GameState, type Sheep } from "../src/state.js";

function blueScore(s: Sheep): number {
  const g = genomeOf(s);
  const dose = (l: string, want: number) => genotypeAt(g, species.map, l).filter((x) => x === want).length;
  return dose("D", 0) * 3 + dose("A", 0) * 2 + dose("B", 1);
}

function play(seed: number, maxSeasons = 30): number {
  const g: GameState = newGame(seed);
  for (let t = 0; t < maxSeasons; t++) {
    if (g.achievements.includes("blue")) return g.season;
    const flock = () => g.flock.map((id) => g.sheep[id]!);
    // Sell lowest-scoring sheep until under cap - 2 (room for lambs).
    while (g.flock.length > g.flockCap - 3) {
      const worst = [...flock()].sort((a, b) => blueScore(a) - blueScore(b))[0]!;
      sellSheep(g, worst.id);
    }
    // Buy the best market sheep if it beats our worst and we can afford it.
    const best = g.market.map((id) => g.sheep[id]!).sort((a, b) => blueScore(b) - blueScore(a))[0];
    const worst = [...flock()].sort((a, b) => blueScore(a) - blueScore(b))[0];
    if (best && worst && blueScore(best) > blueScore(worst) + 1 && g.money >= ramPrice(best) && g.flock.length < g.flockCap) buySheep(g, best.id);
    const rams = flock().filter((s) => s.sex === "ram" && isAdult(s, g.season)).sort((a, b) => blueScore(b) - blueScore(a));
    const ram = rams[0];
    const ewes = flock().filter((s) => s.sex === "ewe" && isAdult(s, g.season));
    advanceSeason(g, ram ? ewes.map((e) => ({ ewe: e.id, ram: ram.id })) : []);
  }
  return -1;
}

const results = Array.from({ length: 30 }, (_, i) => play(i + 1));
const ok = results.filter((r) => r > 0);
console.log("seasons to blue per seed:", results.join(" "));
console.log(`reached: ${ok.length}/30, median ${ok.sort((a, b) => a - b)[Math.floor(ok.length / 2)]}, max ${Math.max(...ok)}`);
