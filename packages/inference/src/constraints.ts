/**
 * Genotype inference for discrete traits: what genotypes are still possible for
 * each sheep at each locus, given every phenotype in the pedigree plus any vet
 * tests. Constraint propagation to a fixpoint; ignores linkage.
 */
import type { DiscreteTrait, GenomeMap } from "@blue-sheep/genetics";
import { getLocus } from "@blue-sheep/genetics";

export interface Individual {
  id: string;
  dam: string | null;
  sire: string | null;
  phenotype: Record<string, string | number>;
  tested: Record<string, string>;
}

/** Unordered allele pair, indices with a <= b. */
export type Pair = [number, number];
/** One candidate joint genotype over a trait's loci. */
export type Joint = Pair[];

export function pairsFor(n: number): Pair[] {
  const out: Pair[] = [];
  for (let a = 0; a < n; a++) for (let b = a; b < n; b++) out.push([a, b]);
  return out;
}

export function producible(child: Pair, dam: Pair, sire: Pair): boolean {
  const [c1, c2] = child;
  for (const x of dam) for (const y of sire) if ((x === c1 && y === c2) || (x === c2 && y === c1)) return true;
  return false;
}

export function jointProducible(child: Joint, dam: Joint, sire: Joint): boolean {
  return child.every((p, i) => producible(p, dam[i]!, sire[i]!));
}

export type Possible = Record<string, Record<string, string[]>>; // sheepId -> locus -> genotype strings

export interface Support {
  loci: ReturnType<typeof getLocus>[];
  /** Every joint genotype over the trait's loci. */
  all: Joint[];
  /** Per individual: joint genotypes still consistent with all evidence. */
  cand: Map<string, Joint[]>;
  gstr: (l: ReturnType<typeof getLocus>, p: Pair) => string;
}

export function jointPhenotype(trait: DiscreteTrait, loci: Support["loci"], j: Joint): string {
  const g: Record<string, [string, string]> = {};
  loci.forEach((l, i) => { g[l.id] = [l.alleles[j[i]![0]]!, l.alleles[j[i]![1]]!]; });
  return trait.resolve(g);
}

export function discreteSupport(map: GenomeMap, trait: DiscreteTrait, individuals: Individual[]): Support {
  const loci = trait.loci.map((id) => getLocus(map, id));
  const byId = new Map(individuals.map((i) => [i.id, i]));
  const kids = new Map<string, Individual[]>();
  for (const i of individuals) {
    for (const p of [i.dam, i.sire]) if (p && byId.has(p)) kids.set(p, [...(kids.get(p) ?? []), i]);
  }

  // All joint candidates.
  let all: Joint[] = [[]];
  for (const l of loci) all = all.flatMap((j) => pairsFor(l.alleles.length).map((p) => [...j, p]));

  const gstr = (l: (typeof loci)[number], p: Pair) => `${l.alleles[p[0]]}/${l.alleles[p[1]]}`;

  // Initial filter: own phenotype + tests.
  const cand = new Map<string, Joint[]>();
  for (const ind of individuals) {
    const observed = ind.phenotype[trait.id];
    cand.set(ind.id, all.filter((j) => {
      const g: Record<string, [string, string]> = {};
      loci.forEach((l, i) => { g[l.id] = [l.alleles[j[i]![0]]!, l.alleles[j[i]![1]]!]; });
      if (observed !== undefined && trait.resolve(g) !== observed) return false;
      return loci.every((l, i) => {
        const t = ind.tested[l.id];
        return !t || t === gstr(l, j[i]!);
      });
    }));
  }

  // Propagate family constraints to a fixpoint.
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 100) {
    changed = false;
    for (const ind of individuals) {
      const before = cand.get(ind.id)!;
      let after = before;
      // Must be producible by some pair of parent candidates.
      if (ind.dam && ind.sire && cand.has(ind.dam) && cand.has(ind.sire)) {
        const D = cand.get(ind.dam)!;
        const S = cand.get(ind.sire)!;
        after = after.filter((c) => D.some((d) => S.some((s) => jointProducible(c, d, s))));
      }
      // Must be able to produce every offspring with the corresponding mate.
      for (const kid of kids.get(ind.id) ?? []) {
        const mateId = kid.dam === ind.id ? kid.sire : kid.dam;
        const M = mateId && cand.has(mateId) ? cand.get(mateId)! : all;
        const K = cand.get(kid.id)!;
        const isDam = kid.dam === ind.id;
        after = after.filter((c) => K.some((k) => M.some((m) => (isDam ? jointProducible(k, c, m) : jointProducible(k, m, c)))));
      }
      if (after.length !== before.length) {
        cand.set(ind.id, after);
        changed = true;
      }
    }
  }

  return { loci, all, cand, gstr };
}

export function inferDiscrete(map: GenomeMap, trait: DiscreteTrait, individuals: Individual[]): Possible {
  const { loci, cand, gstr } = discreteSupport(map, trait, individuals);
  const out: Possible = {};
  for (const ind of individuals) {
    const per: Record<string, string[]> = {};
    loci.forEach((l, i) => {
      const set = new Set<string>();
      for (const j of cand.get(ind.id)!) set.add(gstr(l, j[i]!));
      per[l.id] = [...set].sort();
    });
    out[ind.id] = per;
  }
  return out;
}

/** Merge inference across all discrete traits: sheepId -> locus -> possible genotypes. */
export function inferAll(map: GenomeMap, traits: DiscreteTrait[], individuals: Individual[]): Possible {
  const out: Possible = {};
  for (const t of traits) {
    const r = inferDiscrete(map, t, individuals);
    for (const [id, loci] of Object.entries(r)) out[id] = { ...(out[id] ?? {}), ...loci };
  }
  return out;
}

export type GuessVerdict = "correct" | "wrong" | "open";

/** Compare a notebook guess against what the evidence allows. */
export function judgeGuess(possible: string[] | undefined, guess: string): GuessVerdict {
  if (!possible) return "open";
  if (!possible.includes(guess)) return "wrong";
  return possible.length === 1 ? "correct" : "open";
}
