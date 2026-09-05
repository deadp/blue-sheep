import { alleleNamesAt, genotypeAt, getLocus, type Genome, type GenomeMap } from "./genome.js";
import type { Rng } from "./rng.js";

/** A discrete trait resolved from one or more loci (Mendelian, with epistasis allowed). */
export interface DiscreteTrait {
  kind: "discrete";
  id: string;
  label: string;
  loci: string[];
  /** Map from locus id -> [alleleA, alleleB] (names) to a phenotype label. */
  resolve: (genotypes: Record<string, [string, string]>) => string;
}

export interface Qtl {
  locus: string;
  /** Additive effect: +a for two "+" alleles (index 1), -a for none. */
  a: number;
  /** Dominance deviation for the heterozygote. */
  d: number;
}

export interface QuantitativeTrait {
  kind: "quantitative";
  id: string;
  label: string;
  unit: string;
  mean: number;
  qtls: Qtl[];
  /** SD of environmental (non-genetic) noise. */
  envSd: number;
  /** Trait reduction at F = 1 (inbreeding depression). Positive lowers the value. */
  inbreedingDepression: number;
  /** Optional hard floor/ceiling for the displayed phenotype. */
  min?: number;
  max?: number;
}

export type Trait = DiscreteTrait | QuantitativeTrait;

export function discretePhenotype(genome: Genome, map: GenomeMap, trait: DiscreteTrait): string {
  const g: Record<string, [string, string]> = {};
  for (const id of trait.loci) g[id] = alleleNamesAt(genome, map, id);
  return trait.resolve(g);
}

/** Genotypic value (no environment, no inbreeding). */
export function geneticValue(genome: Genome, map: GenomeMap, trait: QuantitativeTrait): number {
  let v = trait.mean;
  for (const q of trait.qtls) {
    const [x, y] = genotypeAt(genome, map, q.locus);
    const dose = (x === 1 ? 1 : 0) + (y === 1 ? 1 : 0);
    v += dose === 2 ? q.a : dose === 1 ? q.d : -q.a;
  }
  return v;
}

export function quantitativePhenotype(
  genome: Genome,
  map: GenomeMap,
  trait: QuantitativeTrait,
  rng: Rng,
  inbreeding = 0,
): number {
  let v = geneticValue(genome, map, trait) + rng.normal() * trait.envSd - inbreeding * trait.inbreedingDepression;
  if (trait.min !== undefined) v = Math.max(trait.min, v);
  if (trait.max !== undefined) v = Math.min(trait.max, v);
  return v;
}

export interface VarianceComponents {
  additive: number;
  dominance: number;
  environmental: number;
  /** Narrow-sense heritability Va / (Va + Vd + Ve). */
  h2: number;
}

/** Expected variance components in a founder population at HWE, from allele frequencies. */
export function expectedVariance(map: GenomeMap, trait: QuantitativeTrait): VarianceComponents {
  let additive = 0;
  let dominance = 0;
  for (const q of trait.qtls) {
    const l = getLocus(map, q.locus);
    if (l.alleles.length !== 2) throw new Error(`QTL ${q.locus} must be biallelic`);
    const p = l.freq[1] ?? 0;
    const qf = 1 - p;
    const alpha = q.a + q.d * (qf - p);
    additive += 2 * p * qf * alpha * alpha;
    dominance += (2 * p * qf * q.d) ** 2;
  }
  const environmental = trait.envSd ** 2;
  return { additive, dominance, environmental, h2: additive / (additive + dominance + environmental) };
}
