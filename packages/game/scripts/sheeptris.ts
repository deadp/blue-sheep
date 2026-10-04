// Triangle and build-time cost of one sheep per breed (full and lite detail): npx vite-node packages/game/scripts/sheeptris.ts
import { buildSheepGeos, setSheepDetail } from "../src/world3d/sheepMesh.js";
import type { WorldSheep } from "../src/world3d/types.js";

const mk = (breed: string, extra: Partial<WorldSheep> = {}): WorldSheep => ({
  id: `t-${breed}`, name: breed, sex: "ewe", adult: true, wool: "#FAFAF7", family: "white", pattern: "solid", horns: "polled",
  size: 60, fleeceWeight: 4, fineness: 26, crimp: 5, zone: "paddock", breed, ...extra,
});
for (const detail of ["full", "lite"] as const) {
  setSheepDetail(detail);
  for (const b of ["farm", "merino", "corriedale", "perendale", "romney", "drysdale", "icelandic"]) {
    const t0 = performance.now();
    let tris = 0;
    for (let i = 0; i < 20; i++) { const g = buildSheepGeos(mk(b, { id: `t${i}${b}` })); if (i === 0) tris = (g.body.index?.count ?? 0) / 3 + (g.head.index?.count ?? 0) / 3; g.body.dispose(); g.head.dispose(); }
    console.log(`${detail.padEnd(4)} ${b.padEnd(11)} ${String(Math.round(tris)).padStart(6)} tris  ${((performance.now() - t0) / 20).toFixed(1)} ms/build`);
  }
}
