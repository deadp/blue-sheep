import { buildMap, type ChromosomeSpec, type Genome, type GenomeMap } from "./genome.js";
import type { Rng } from "./rng.js";
import { discretePhenotype, isMasked, quantitativePhenotype, type Trait } from "./traits.js";

/** A theme-agnostic species: a genome map plus the traits read from it. */
export interface Species {
  name: string;
  map: GenomeMap;
  traits: Trait[];
}

export function defineSpecies(name: string, chromosomes: ChromosomeSpec[], traits: Trait[]): Species {
  const map = buildMap(chromosomes);
  for (const t of traits) {
    const ids = t.kind === "discrete" ? t.loci : t.qtls.map((q) => q.locus);
    for (const id of ids) if (!map.loci.has(id)) throw new Error(`trait ${t.id} references unknown locus ${id}`);
  }
  return { name, map, traits };
}

/**
 * Every phenotype a farmer can see: quantitative values (environment drawn from `rng`, in trait
 * order) and discrete labels, with masked discrete traits left out (see `DiscreteTrait.maskedBy`).
 */
export function observePhenotypes(genome: Genome, species: Species, rng: Rng, inbreeding = 0): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const t of species.traits) if (t.kind === "quantitative") out[t.id] = quantitativePhenotype(genome, species.map, t, rng, inbreeding);
  for (const t of species.traits) if (t.kind === "discrete") out[t.id] = discretePhenotype(genome, species.map, t);
  for (const t of species.traits) if (t.kind === "discrete" && isMasked(t, out)) delete out[t.id];
  return out;
}
