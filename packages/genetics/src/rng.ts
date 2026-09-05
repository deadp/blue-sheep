/** Seeded PRNG (mulberry32). All simulation randomness flows through this. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Standard normal N(0, 1). */
  normal(): number;
  /** Poisson-distributed count with mean lambda. */
  poisson(lambda: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Fork a child rng deterministically. */
  fork(): Rng;
  /** Current internal state (for save/restore). */
  state(): number;
}

/** `seed` may be a previous `rng.state()` value to resume exactly where it left off. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    normal: () => {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      let u = 0;
      let v = 0;
      let s = 0;
      do {
        u = next() * 2 - 1;
        v = next() * 2 - 1;
        s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const m = Math.sqrt((-2 * Math.log(s)) / s);
      spare = v * m;
      return u * m;
    },
    poisson: (lambda) => {
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > L);
      return k - 1;
    },
    chance: (p) => next() < p,
    fork: () => createRng(Math.floor(next() * 4294967296)),
    state: () => a,
  };
  return rng;
}
