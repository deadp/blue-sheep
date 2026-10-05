/**
 * Breed value sim (DESIGN-v3 Phase 5 balance): what each market breed's fleece is worth raw and crafted, against its price.
 * For each breed, 30 seeds x 8 adult sheep: raw coins per clean kg, and the best single recipe's coins per kg of wool at its
 * crafted quality (demand 1), over the recipes the player has met by year 4. Run: npx vite-node packages/game/scripts/breedvalue.ts
 */
import { BREEDS, BREED_IDS, createRng } from "@blue-sheep/genetics";
import { BREED_STOCK, RECIPES, buyPrice, itemPrice, lotPrice, makeLot, newGame, qualityBase, qualityFactors, sourceOf } from "../src/core/index.js";
import { sampleFounderSheep } from "../src/core/state.js";

const EARLY = ["socks", "beanie", "mittens", "scarf", "gumbootSocks", "teaCosy", "dryerBalls", "slippers", "babyShawl", "lopapeysa"];
console.log("breed        price x | sheep coins | raw/kg | best craft coins/kg (recipe) | craft/raw | lots 1 kg: socks Q, shawl Q");
const rows: string[] = [];
for (const id of BREED_IDS) {
  let n = 0, raw = 0, craft = 0, price = 0, qs = 0, qh = 0;
  const wins: Record<string, number> = {};
  for (let seed = 1; seed <= 30; seed++) {
    const g = newGame(seed);
    const rng = createRng(seed * 7919 + 13);
    for (let i = 0; i < 8; i++) {
      const s = sampleFounderSheep(g, rng, i % 4 === 3 ? "ram" : "ewe", -10, "market", id);
      const lot = makeLot(g, s, 8);
      g.store = [lot];
      raw += lotPrice(g, lot, 1).coins / Math.max(0.1, lot.clean);
      const mat = sourceOf(g, `lot:${lot.id}`)!.mat;
      let best = 0, bestId = "";
      for (const r of RECIPES.filter((x) => EARLY.includes(x.id))) {
        const q = qualityBase(qualityFactors(mat, r, true));
        const perKg = itemPrice(r.id, q, 1).coins / r.kg;
        if (perKg > best) { best = perKg; bestId = r.id; }
      }
      wins[bestId] = (wins[bestId] ?? 0) + 1;
      craft += best; price += buyPrice(s); n++;
      qs += qualityBase(qualityFactors(mat, RECIPES.find((x) => x.id === "socks")!, true));
      qh += qualityBase(qualityFactors(mat, RECIPES.find((x) => x.id === "babyShawl")!, true));
    }
  }
  const top = Object.entries(wins).sort((a, b) => b[1] - a[1])[0]![0];
  rows.push(`${BREEDS[id].name.padEnd(12)} ${BREED_STOCK[id].price.toFixed(1).padStart(5)}   | ${(price / n).toFixed(0).padStart(6)}      | ${(raw / n).toFixed(1).padStart(6)} | ${(craft / n).toFixed(0).padStart(6)} (${top.padEnd(12)}) | ${(craft / raw).toFixed(1).padStart(6)}x   | ${(qs / n).toFixed(0)}, ${(qh / n).toFixed(0)}`);
}
console.log(rows.join("\n"));
