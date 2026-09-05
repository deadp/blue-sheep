/**
 * Pedigree bookkeeping: inbreeding coefficients and relatedness via
 * recursive kinship (coefficient of coancestry).
 */
export type Id = string;

interface Entry {
  dam: Id | null;
  sire: Id | null;
  generation: number;
}

export class Pedigree {
  private entries = new Map<Id, Entry>();
  private kinshipCache = new Map<string, number>();

  add(id: Id, dam: Id | null, sire: Id | null): void {
    if (this.entries.has(id)) throw new Error(`pedigree already has ${id}`);
    const gd = dam ? this.gen(dam) : -1;
    const gs = sire ? this.gen(sire) : -1;
    this.entries.set(id, { dam, sire, generation: Math.max(gd, gs) + 1 });
  }

  has(id: Id): boolean {
    return this.entries.has(id);
  }

  parents(id: Id): { dam: Id | null; sire: Id | null } {
    const e = this.entries.get(id);
    if (!e) throw new Error(`unknown individual ${id}`);
    return { dam: e.dam, sire: e.sire };
  }

  gen(id: Id): number {
    const e = this.entries.get(id);
    if (!e) throw new Error(`unknown individual ${id}`);
    return e.generation;
  }

  /** Coefficient of coancestry (kinship) between two individuals. */
  kinship(a: Id, b: Id): number {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const cached = this.kinshipCache.get(key);
    if (cached !== undefined) return cached;
    let value: number;
    if (a === b) {
      const { dam, sire } = this.parents(a);
      const f = dam && sire ? this.kinship(dam, sire) : 0;
      value = 0.5 * (1 + f);
    } else {
      // Recurse on the younger individual (higher generation) so we terminate.
      const [young, old] = this.gen(a) >= this.gen(b) ? [a, b] : [b, a];
      const { dam, sire } = this.parents(young);
      value = 0.5 * ((dam ? this.kinship(dam, old) : 0) + (sire ? this.kinship(sire, old) : 0));
    }
    this.kinshipCache.set(key, value);
    return value;
  }

  /** Wright's inbreeding coefficient F. */
  inbreeding(id: Id): number {
    const { dam, sire } = this.parents(id);
    return dam && sire ? this.kinship(dam, sire) : 0;
  }

  /** Numerator relationship (2 × kinship). 1 for self (if non-inbred), 0.5 parent–offspring, 0.5 full sibs. */
  relatedness(a: Id, b: Id): number {
    return 2 * this.kinship(a, b);
  }

  /** Expected inbreeding of a hypothetical offspring of these two. */
  offspringInbreeding(dam: Id, sire: Id): number {
    return this.kinship(dam, sire);
  }

  /** All ancestors up to `depth` generations back (excluding self). */
  ancestors(id: Id, depth = Infinity): Set<Id> {
    const out = new Set<Id>();
    const walk = (x: Id, d: number) => {
      if (d === 0) return;
      const { dam, sire } = this.parents(x);
      for (const p of [dam, sire]) {
        if (p && !out.has(p)) {
          out.add(p);
          walk(p, d - 1);
        }
      }
    };
    walk(id, depth);
    return out;
  }

  ids(): Id[] {
    return [...this.entries.keys()];
  }

  toJSON(): { id: Id; dam: Id | null; sire: Id | null }[] {
    return [...this.entries.entries()].map(([id, e]) => ({ id, dam: e.dam, sire: e.sire }));
  }

  static fromJSON(rows: { id: Id; dam: Id | null; sire: Id | null }[]): Pedigree {
    const p = new Pedigree();
    for (const r of rows) p.add(r.id, r.dam, r.sire);
    return p;
  }
}
