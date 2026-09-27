import { getLocus, type Genome, type GenomeMap, type Haplotype } from "./genome.js";
import type { Rng } from "./rng.js";

/**
 * Produce one recombinant haplotype for a chromosome.
 * Crossover count ~ Poisson(lengthCM / 100) (no interference), positions uniform.
 */
export function recombine(pair: [Haplotype, Haplotype], lengthCM: number, lociCM: number[], rng: Rng): Haplotype {
  const n = lociCM.length;
  const out = new Uint8Array(n);
  const k = rng.poisson(lengthCM / 100);
  const cuts: number[] = [];
  for (let i = 0; i < k; i++) cuts.push(rng.next() * lengthCM);
  cuts.sort((a, b) => a - b);
  let which = rng.int(2);
  let ci = 0;
  for (let i = 0; i < n; i++) {
    const pos = lociCM[i] ?? 0;
    while (ci < cuts.length && (cuts[ci] ?? Infinity) < pos) {
      which ^= 1;
      ci++;
    }
    out[i] = pair[which]?.[i] ?? 0;
  }
  return out;
}

/** A full gamete: one haplotype per chromosome. */
export function gamete(genome: Genome, map: GenomeMap, rng: Rng): Haplotype[] {
  return map.chromosomes.map((chr, c) => {
    const pair = genome.chromosomes[c];
    if (!pair) throw new Error(`genome missing chromosome ${c}`);
    return recombine(pair, chr.lengthCM, chr.loci.map((l) => l.cM), rng);
  });
}

export interface MutationOptions {
  /** Loci that can mutate (v3: the fantasy loci only). */
  loci: string[];
  /** Chance per lamb per locus that one gamete carries a new mutant allele (v3: 0.001). */
  rate: number;
  /** Allele index a mutation produces (default 1, the rare allele). */
  allele?: number;
}

export interface MateOptions {
  mutation?: MutationOptions;
}

export interface Sport {
  locus: string;
  /** Which parent's gamete mutated. */
  parent: "dam" | "sire";
}

export interface MateResult {
  genome: Genome;
  /** New mutations in this lamb (empty unless `opts.mutation` is set and one fired). */
  sports: Sport[];
}

/**
 * Offspring genome plus any sports (new mutations). Without `opts.mutation` the rng is consumed
 * exactly as by `mate`, so existing saves replay identically. With it, each listed locus draws one
 * `rng.next()` per lamb; on a hit, one gamete (dam or sire, 50/50) gets the mutant allele there.
 * A gamete that already carries the mutant allele is unchanged (still reported as a sport).
 */
export function mateDetailed(dam: Genome, sire: Genome, map: GenomeMap, rng: Rng, opts: MateOptions = {}): MateResult {
  const d = gamete(dam, map, rng);
  const s = gamete(sire, map, rng);
  const sports: Sport[] = [];
  const mu = opts.mutation;
  if (mu && mu.rate > 0) {
    for (const id of mu.loci) {
      if (!rng.chance(mu.rate)) continue;
      const l = getLocus(map, id);
      const parent = rng.chance(0.5) ? "dam" : "sire";
      const hap = (parent === "dam" ? d : s)[l.chromosome]!;
      hap[l.index] = mu.allele ?? 1;
      sports.push({ locus: id, parent });
    }
  }
  return { genome: { chromosomes: d.map((h, i) => [h, s[i] as Haplotype]) }, sports };
}

/** Offspring genome: dam's gamete first, sire's second. `opts.mutation` enables sports (see `mateDetailed`). */
export function mate(dam: Genome, sire: Genome, map: GenomeMap, rng: Rng, opts: MateOptions = {}): Genome {
  return mateDetailed(dam, sire, map, rng, opts).genome;
}
