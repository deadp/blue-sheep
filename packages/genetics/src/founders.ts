import type { Genome, GenomeMap, Haplotype } from "./genome.js";
import type { Rng } from "./rng.js";

function sampleAllele(freq: number[], rng: Rng): number {
  let u = rng.next();
  for (let i = 0; i < freq.length; i++) {
    u -= freq[i] ?? 0;
    if (u < 0) return i;
  }
  return freq.length - 1;
}

/** Sample an unrelated founder in Hardy–Weinberg equilibrium at every locus. */
export function sampleFounder(map: GenomeMap, rng: Rng): Genome {
  return {
    chromosomes: map.chromosomes.map((chr) => {
      const mk = (): Haplotype => Uint8Array.from(chr.loci.map((l) => sampleAllele(l.freq, rng)));
      return [mk(), mk()];
    }),
  };
}
