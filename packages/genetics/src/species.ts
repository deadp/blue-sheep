import { buildMap, type ChromosomeSpec, type GenomeMap } from "./genome.js";
import type { Trait } from "./traits.js";

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
