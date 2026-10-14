// Throwaway perf check for the fleece experiments: triangles and vertices of each sheep's merged geometries per style.
// Run: npx vite-node packages/game/scripts/fleece-tris.ts [style...]
import { buildSheepGeos, setSheepDetail } from "../src/world3d/sheepMesh.js";
import { setFleeceStyle, type FleeceStyle } from "../src/world3d/fleece.js";
import type { WorldSheep } from "../src/world3d/types.js";

const base: WorldSheep = { id: "s1", name: "x", sex: "ewe", adult: true, wool: "#FAFAF7", family: "white", pattern: "solid", horns: "polled", size: 60, fleeceWeight: 4, fineness: 26, crimp: 5, zone: "paddock" };
const cases: [string, Partial<WorldSheep>][] = [
  ["plain", {}], ["brown", { wool: "#6b4a3a", family: "brown", pattern: "spotted" }], ["merino", { breed: "merino" }], ["romney", { breed: "romney" }],
  ["drysdale", { breed: "drysdale" }], ["icelandic", { breed: "icelandic" }], ["steel", { fantasy: "steel", wool: "#9aa3ad" }], ["cloud", { fantasy: "cloud" }],
  ["glow", { fantasy: "glow" }], ["paua", { fantasy: "paua", wool: "#2a3f7a" }], ["pohutukawa", { fantasy: "pohutukawa", wool: "#b3122f" }], ["southerly", { fantasy: "southerly" }],
];
const tri = (g: { index: { count: number } | null; getAttribute(n: string): { count: number } }) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;
const styles = (process.argv.slice(2).length ? process.argv.slice(2) : ["0", "a", "b", "c", "d"]) as FleeceStyle[];
for (const detail of ["full", "lite"] as const) {
  setSheepDetail(detail);
  console.log(`\n${detail}: body tris (+glow dots) / head tris, ms to build`);
  console.log(["style", ...cases.map((c) => c[0])].join("\t"));
  for (const st of styles) {
    setFleeceStyle(st);
    const row = [st];
    let sum = 0;
    for (const [, o] of cases) {
      const t0 = performance.now();
      const g = buildSheepGeos({ ...base, ...o });
      const ms = performance.now() - t0;
      const b = tri(g.body), gl = g.glow ? tri(g.glow.a) + tri(g.glow.b) : 0;
      sum += b;
      row.push(`${b}${gl ? "+" + gl : ""}/${tri(g.head)} ${ms.toFixed(0)}ms`);
    }
    row.push(`avg ${Math.round(sum / cases.length)}`);
    console.log(row.join("\t"));
  }
}
