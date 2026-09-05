/**
 * Genome representation. Diploid: every chromosome is a pair of haplotypes,
 * each haplotype an array of allele indices (one per locus on that chromosome).
 * Allele index 0.. refers into `Locus.alleles`.
 */

export interface LocusSpec {
  id: string;
  /** Position in centimorgans from the start of the chromosome. */
  cM: number;
  /** Allele names. Index order matters: quantitative loci use index as dosage of the "+" allele. */
  alleles: string[];
  /** Founder allele frequencies, same order as `alleles`. Must sum to 1. */
  freq: number[];
}

export interface ChromosomeSpec {
  lengthCM: number;
  loci: LocusSpec[];
}

export interface Locus extends LocusSpec {
  chromosome: number;
  /** Index within the chromosome's locus array (sorted by cM). */
  index: number;
}

export interface GenomeMap {
  chromosomes: { lengthCM: number; loci: Locus[] }[];
  loci: Map<string, Locus>;
}

export function buildMap(specs: ChromosomeSpec[]): GenomeMap {
  const loci = new Map<string, Locus>();
  const chromosomes = specs.map((spec, chromosome) => {
    const sorted = [...spec.loci].sort((a, b) => a.cM - b.cM);
    const built = sorted.map((l, index) => {
      if (l.cM < 0 || l.cM > spec.lengthCM) throw new Error(`locus ${l.id} outside chromosome`);
      if (l.alleles.length !== l.freq.length) throw new Error(`locus ${l.id}: alleles/freq mismatch`);
      const sum = l.freq.reduce((s, f) => s + f, 0);
      if (Math.abs(sum - 1) > 1e-6) throw new Error(`locus ${l.id}: freq sums to ${sum}`);
      if (loci.has(l.id)) throw new Error(`duplicate locus id ${l.id}`);
      const locus: Locus = { ...l, chromosome, index };
      loci.set(l.id, locus);
      return locus;
    });
    return { lengthCM: spec.lengthCM, loci: built };
  });
  return { chromosomes, loci };
}

/** One haplotype per chromosome. */
export type Haplotype = Uint8Array;

export interface Genome {
  /** chromosomes[c] = [haplotype from dam, haplotype from sire] */
  chromosomes: [Haplotype, Haplotype][];
}

export function getLocus(map: GenomeMap, id: string): Locus {
  const l = map.loci.get(id);
  if (!l) throw new Error(`unknown locus ${id}`);
  return l;
}

/** Allele indices at a locus, [maternal, paternal]. */
export function genotypeAt(genome: Genome, map: GenomeMap, locusId: string): [number, number] {
  const l = getLocus(map, locusId);
  const pair = genome.chromosomes[l.chromosome];
  if (!pair) throw new Error(`genome missing chromosome ${l.chromosome}`);
  return [pair[0][l.index] ?? 0, pair[1][l.index] ?? 0];
}

/** Allele names at a locus, [maternal, paternal]. */
export function alleleNamesAt(genome: Genome, map: GenomeMap, locusId: string): [string, string] {
  const l = getLocus(map, locusId);
  const [a, b] = genotypeAt(genome, map, locusId);
  return [l.alleles[a] ?? "?", l.alleles[b] ?? "?"];
}

/** Canonical genotype string, e.g. "B/b" (alleles sorted by index so B/b === b/B). */
export function genotypeString(genome: Genome, map: GenomeMap, locusId: string): string {
  const l = getLocus(map, locusId);
  const [a, b] = genotypeAt(genome, map, locusId);
  const [x, y] = a <= b ? [a, b] : [b, a];
  return `${l.alleles[x]}/${l.alleles[y]}`;
}

export function cloneGenome(g: Genome): Genome {
  return { chromosomes: g.chromosomes.map(([a, b]) => [new Uint8Array(a), new Uint8Array(b)]) };
}

/** Serialise to plain JSON-safe arrays. */
export function genomeToJSON(g: Genome): number[][][] {
  return g.chromosomes.map(([a, b]) => [Array.from(a), Array.from(b)]);
}

export function genomeFromJSON(data: number[][][]): Genome {
  return {
    chromosomes: data.map((pair) => [Uint8Array.from(pair[0] ?? []), Uint8Array.from(pair[1] ?? [])]),
  };
}
