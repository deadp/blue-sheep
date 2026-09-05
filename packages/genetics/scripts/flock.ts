/** Print a random founder flock. Run: npx vite-node packages/genetics/scripts/flock.ts [seed] */
import { createRng, sampleFounder, discretePhenotype, quantitativePhenotype, expectedVariance, genotypeString } from "../src/index.js";
import { sheep } from "../src/sheep.js";

const seed = Number(process.argv[2] ?? 1);
const rng = createRng(seed);
const { map, traits } = sheep;

console.log(`seed ${seed}\n`);
console.log("Expected h² in founders:");
for (const t of traits) if (t.kind === "quantitative") {
  const v = expectedVariance(map, t);
  console.log(`  ${t.label.padEnd(16)} h²=${v.h2.toFixed(2)}  Va=${v.additive.toFixed(2)} Vd=${v.dominance.toFixed(2)} Ve=${v.environmental.toFixed(2)}`);
}
console.log();

const header = ["#", "colour", "pattern", "horns", "A", "B", "D", "S", "P", "fleece", "µm", "crimp", "milk", "size", "bold"];
console.log(header.map((h, i) => h.padEnd(i < 4 ? 8 : 6)).join(""));
for (let i = 0; i < 20; i++) {
  const g = sampleFounder(map, rng);
  const row: string[] = [String(i + 1)];
  for (const t of traits) if (t.kind === "discrete") row.push(discretePhenotype(g, map, t));
  for (const l of ["A", "B", "D", "S", "P"]) row.push(genotypeString(g, map, l));
  for (const t of traits) if (t.kind === "quantitative") row.push(quantitativePhenotype(g, map, t, rng).toFixed(1));
  console.log(row.map((h, i) => h.padEnd(i < 4 ? 8 : 6)).join(""));
}
