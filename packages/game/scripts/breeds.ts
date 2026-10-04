/**
 * Breed sim (DESIGN-v3 §13 phase 3): fineness (and staple, lustre) distribution by breed as the market sells
 * them, over 30 seeds, plus each breed's wool-type shares and how its market price compares.
 * Run: npx vite-node packages/game/scripts/breeds.ts
 */
import { BREEDS, BREED_IDS } from "@blue-sheep/genetics";
import { createRng } from "@blue-sheep/genetics";
import { buyPrice, newGame, woolTypeOf, WOOL_TYPES } from "../src/core/index.js";
import { sampleFounderSheep } from "../src/core/state.js";

const SEEDS = 30, PER_SEED = 8;
const stat = (xs: number[]) => {
  const n = xs.length, mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const s = [...xs].sort((a, b) => a - b);
  return { mean, sd, p10: s[Math.floor(n * 0.1)]!, p90: s[Math.floor(n * 0.9)]!, min: s[0]!, max: s[n - 1]! };
};

console.log(`Market sheep by breed, ${SEEDS} seeds x ${PER_SEED} sheep (adult, one measured fleece each)\n`);
console.log("breed        target µm | µm mean  sd   p10-p90      | staple mean (target) | lustre | wool types (share)");
for (const id of BREED_IDS) {
  const fin: number[] = [], stp: number[] = [], lus: number[] = [], price: number[] = [];
  const types: Record<string, number> = {};
  for (let seed = 1; seed <= SEEDS; seed++) {
    const g = newGame(seed);
    const rng = createRng(seed * 7919 + 13);
    for (let i = 0; i < PER_SEED; i++) {
      const s = sampleFounderSheep(g, rng, i % 4 === 3 ? "ram" : "ewe", -10, "market", id);
      fin.push(Number(s.phenotype["fineness"])); stp.push(Number(s.phenotype["staple"])); lus.push(Number(s.phenotype["lustre"]));
      price.push(buyPrice(s));
      const t = woolTypeOf(s); types[t] = (types[t] ?? 0) + 1;
    }
  }
  const f = stat(fin), st = stat(stp), l = stat(lus);
  const share = WOOL_TYPES.filter((t) => types[t]).map((t) => `${t} ${Math.round((100 * types[t]!) / fin.length)}%`).join(", ");
  console.log(`${BREEDS[id].name.padEnd(12)} ${String(BREEDS[id].targets.fineness).padStart(6)}    | ${f.mean.toFixed(1).padStart(6)} ${f.sd.toFixed(1).padStart(4)}  ${f.p10.toFixed(1)}-${f.p90.toFixed(1)}`.padEnd(58) +
    `| ${st.mean.toFixed(0).padStart(5)} (${BREEDS[id].targets.staple}) | ${l.mean.toFixed(1)} | ${share} | price ${Math.round(price.reduce((a, b) => a + b, 0) / price.length)}`);
}

