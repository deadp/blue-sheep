/**
 * Balance oracle: a perfect-knowledge greedy farmer (reads true genomes) plays
 * 30 seeds through every act. Reports seasons per act and the share of seeds
 * that reach the ending within 60 seasons. Run: npx vite-node packages/game/scripts/oracle.ts
 */
import { genotypeAt } from "@blue-sheep/genetics";
import { genomeOf, species, type GameState, type Sheep } from "../src/core/index.js";
import { play, summarise, type Brain, type CrossDist } from "./policy.js";

const geno = (s: Sheep, l: string) => genotypeAt(genomeOf(s), species.map, l);
/** Chance a parent passes the recessive (index 0) allele. */
const pRec = (s: Sheep, l: string) => geno(s, l).filter((x) => x === 0).length / 2;

export const oracle: Brain = {
  name: "oracle",
  cross(g: GameState, eweId: string, ramId: string): CrossDist {
    const e = g.sheep[eweId]!, r = g.sheep[ramId]!;
    const aa = pRec(e, "A") * pRec(r, "A");
    const bb = pRec(e, "B") * pRec(r, "B");
    const dd = pRec(e, "D") * pRec(r, "D");
    const pp = pRec(e, "P") * pRec(r, "P");
    return {
      colour: { white: 1 - aa, black: aa * (1 - bb) * (1 - dd), blue: aa * (1 - bb) * dd, brown: aa * bb * (1 - dd), fawn: aa * bb * dd },
      horns: { horned: pp, polled: 1 - pp },
    };
  },
  doses(_g, s) {
    return { d: pRec(s, "D") * 2, a: pRec(s, "A") * 2, B: 2 - pRec(s, "B") * 2 };
  },
};

const MAX = 60;
const N = Number(process.env["SEEDS"] ?? 30);
const FROM = Number(process.env["FROM"] ?? 1); // first seed
const results = [];
for (let i = 0; i < N; i++) results.push(await play(FROM + i, oracle, MAX));
summarise("oracle (perfect knowledge)", results, MAX);
