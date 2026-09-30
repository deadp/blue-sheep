/**
 * Balance oracle: a perfect-knowledge greedy farmer (reads true genomes) plays 30 seeds through every act.
 * Reports the first true blue lamb, seasons per act and the share of seeds that reach the ending within 60
 * seasons. Run: npx vite-node packages/game/scripts/oracle.ts
 */
import { genotypeAt, woolColour } from "@blue-sheep/genetics";
import { dressWool, genomeOf, orderTarget, species, woolMatches, type ColourTarget, type GameState, type Sheep } from "../src/core/index.js";
import { play, summarise, type Brain, type CrossDist } from "./policy.js";

const geno = (s: Sheep, l: string) => genotypeAt(genomeOf(s), species.map, l);
/** Chance a parent passes allele index 1 at a locus. */
const p1 = (s: Sheep, l: string) => geno(s, l).filter((x) => x === 1).length / 2;
/** Distribution of doses a lamb gets for a channel's two loci from both parents. */
function doseDist(e: Sheep, r: Sheep, loci: [string, string]): number[] {
  let dist = [1];
  for (const par of [e, r]) for (const l of loci) {
    const q = p1(par, l);
    const next = Array(dist.length + 1).fill(0) as number[];
    dist.forEach((p, d) => { next[d] += p * (1 - q); next[d + 1] += p * q; });
    dist = next;
  }
  return dist;
}

function crossDist(g: GameState, eweId: string, ramId: string): CrossDist {
  const e = g.sheep[eweId]!, r = g.sheep[ramId]!;
  const pCol = (1 - p1(e, "W")) * (1 - p1(r, "W"));
  const pPale = (1 - p1(e, "Dl")) * (1 - p1(r, "Dl"));
  const R = doseDist(e, r, ["R1", "R2"]), Y = doseDist(e, r, ["Y1", "Y2"]), B = doseDist(e, r, ["U1", "U2"]);
  const depth = [e, r].map((s) => Number(s.phenotype["depth"] ?? 1)).reduce((a, b) => a + b, 0) / 2;
  const combos: { w: ReturnType<typeof dressWool>; p: number }[] = [];
  R.forEach((pr, ri) => Y.forEach((py, yi) => B.forEach((pb, bi) => {
    for (const [pale, pd] of [[true, pPale], [false, 1 - pPale]] as const) {
      const p = pCol * pr * py * pb * pd;
      if (p > 1e-9) combos.push({ w: dressWool(woolColour({ white: false, red: ri, yellow: yi, blue: bi, dilute: pale, depth })), p });
    }
  })));
  const chance = (t: ColourTarget) => (t.colour === "white" ? 1 - pCol : combos.reduce((a, c) => a + (woolMatches(c.w, t) ? c.p : 0), 0));
  const ph = (1 - p1(e, "P")) * (1 - p1(r, "P"));
  return {
    trueBlue: chance({ colour: "true blue", min: null }), blue: chance({ colour: "blue", min: null }),
    pOrder: (o) => chance(orderTarget(o)), horns: { horned: ph, polled: 1 - ph },
  };
}

export const oracle: Brain = {
  name: "oracle",
  cross: crossDist,
  doses(_g, s) {
    const n = (l: string) => geno(s, l).filter((x) => x === 1).length;
    return { blue: n("U1") + n("U2"), w: 2 - n("W"), ry: n("R1") + n("R2") + n("Y1") + n("Y2") };
  },
};

const MAX = 60;
const N = Number(process.env["SEEDS"] ?? 30);
const FROM = Number(process.env["FROM"] ?? 1); // first seed
const results = [];
for (let i = 0; i < N; i++) results.push(await play(FROM + i, oracle, MAX));
summarise("oracle (perfect knowledge)", results, MAX);
