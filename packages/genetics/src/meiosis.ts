import type { Genome, GenomeMap, Haplotype } from "./genome.js";
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

/** Offspring genome: dam's gamete first, sire's second. */
export function mate(dam: Genome, sire: Genome, map: GenomeMap, rng: Rng): Genome {
  const d = gamete(dam, map, rng);
  const s = gamete(sire, map, rng);
  return { chromosomes: d.map((h, i) => [h, s[i] as Haplotype]) };
}
