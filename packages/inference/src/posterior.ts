/**
 * Posterior genotype probabilities for a discrete trait over a pedigree.
 * Gibbs sampling over joint genotypes, restricted to the constraint-propagated
 * support so hard evidence (phenotypes, tests) is always respected. Priors for
 * founders come from the species' founder allele frequencies (HWE). Linkage
 * between loci is ignored (loci transmit independently).
 */
import { createRng, type DiscreteTrait, type GenomeMap, type Rng } from "@blue-sheep/genetics";
import { discreteSupport, jointPhenotype, type Individual, type Joint, type Pair, type Support } from "./constraints.js";

export interface PosteriorOptions {
  samples?: number;
  burnIn?: number;
  seed?: number;
}

export interface DiscretePosterior {
  trait: DiscreteTrait;
  support: Support;
  ids: string[];
  /** samples[s][i] = index into support.all for individual ids[i]. */
  samples: Int16Array[];
  /** id -> locus -> genotype string -> probability. */
  marginals: Record<string, Record<string, Record<string, number>>>;
  /** id -> joint index -> probability (sparse over support). */
  jointMarginals: Record<string, Map<number, number>>;
}

/**
 * Founder allele frequencies are floored at this, so a sheep carrying an allele its prior says is
 * absent (a rare gene from another breed, a sport) still gets a small, finite weight.
 */
export const MIN_ALLELE_FREQ = 1e-4;

function pairPrior(p: Pair, freq: number[]): number {
  const a = Math.max(MIN_ALLELE_FREQ, freq[p[0]] ?? 0), b = Math.max(MIN_ALLELE_FREQ, freq[p[1]] ?? 0);
  return p[0] === p[1] ? a * a : 2 * a * b;
}

function pairTransmission(child: Pair, dam: Pair, sire: Pair): number {
  let n = 0;
  for (const x of dam) for (const y of sire) if ((x === child[0] && y === child[1]) || (x === child[1] && y === child[0])) n++;
  return n / 4;
}

/** HWE prior of a joint genotype, from the map's founder frequencies or `freqOverride` per locus. */
export function jointPrior(j: Joint, support: Support, freqOverride?: Record<string, number[]>): number {
  let p = 1;
  support.loci.forEach((l, i) => { p *= pairPrior(j[i]!, freqOverride?.[l.id] ?? l.freq); });
  return p;
}

export function jointTransmission(child: Joint, dam: Joint, sire: Joint): number {
  let p = 1;
  for (let i = 0; i < child.length && p > 0; i++) p *= pairTransmission(child[i]!, dam[i]!, sire[i]!);
  return p;
}

/** Find one fully consistent assignment over the support (parents before children), with conflict-directed backjumping. */
function initialAssignment(inds: Individual[], support: Support, rng: Rng): number[] {
  const { all, cand } = support;
  const index = new Map(all.map((j, i) => [j, i]));
  const pos = new Map(inds.map((ind, i) => [ind.id, i]));
  const assign: number[] = Array(inds.length).fill(-1);
  const kidsOf = new Map<string, Individual[]>();
  for (const ind of inds) for (const p of [ind.dam, ind.sire]) if (p && pos.has(p)) kidsOf.set(p, [...(kidsOf.get(p) ?? []), ind]);

  /** Positions of already-assigned relatives that rule out joint `j` for individual i (empty = consistent). */
  const conflicts = (i: number, j: Joint): number[] => {
    const ind = inds[i]!;
    const at = (id: string | null): number => (id && pos.has(id) ? pos.get(id)! : -1);
    const J = (p: number): Joint | null => (p < 0 || assign[p]! < 0 ? null : all[assign[p]!]!);
    const dp = at(ind.dam), sp = at(ind.sire);
    const d = J(dp), s = J(sp);
    if (d && s && jointTransmission(j, d, s) === 0) return [dp, sp];
    for (const kid of kidsOf.get(ind.id) ?? []) {
      const kp = at(kid.id), kj = J(kp);
      if (!kj) continue;
      const mp = at(kid.dam === ind.id ? kid.sire : kid.dam), m = J(mp);
      if (!m) continue;
      const ok = kid.dam === ind.id ? jointTransmission(kj, j, m) : jointTransmission(kj, m, j);
      if (ok === 0) return [kp, mp];
    }
    return [];
  };
  // Conflict-directed backjumping: on a dead end, jump straight back to the most recent
  // relative involved, instead of chronological backtracking (exponential on deep pedigrees).
  const conf: Set<number>[] = inds.map(() => new Set<number>());
  const SUCCESS = -1, NONE = -2;
  const rec = (k: number): number => {
    if (k === inds.length) return SUCCESS;
    conf[k] = new Set<number>();
    const options = [...cand.get(inds[k]!.id)!];
    for (let n = options.length - 1; n > 0; n--) { const m = rng.int(n + 1); [options[n], options[m]] = [options[m]!, options[n]!]; }
    for (const j of options) {
      const c = conflicts(k, j);
      if (c.length) { for (const x of c) conf[k]!.add(x); continue; }
      assign[k] = index.get(j)!;
      const r = rec(k + 1);
      if (r === SUCCESS) return SUCCESS;
      assign[k] = -1;
      if (r !== k) return r;
    }
    if (conf[k]!.size === 0) return NONE;
    const h = Math.max(...conf[k]!);
    for (const x of conf[k]!) if (x !== h) conf[h]!.add(x);
    return h;
  };
  if (rec(0) !== SUCCESS) throw new Error("no consistent genotype assignment exists");
  return assign;
}

export function posteriorDiscrete(map: GenomeMap, trait: DiscreteTrait, individuals: Individual[], opts: PosteriorOptions = {}): DiscretePosterior {
  const samplesN = opts.samples ?? 400;
  const burn = opts.burnIn ?? 60;
  const rng = createRng(opts.seed ?? 1234);
  const support = discreteSupport(map, trait, individuals);
  const { all, cand } = support;
  const n = all.length;
  const priors = all.map((j) => jointPrior(j, support));
  // Transmission table T[child][dam][sire] (n ≤ 27 by the per-trait limit, so ≤ 19683 entries).
  const T = new Float64Array(n * n * n);
  for (let c = 0; c < n; c++) for (let d = 0; d < n; d++) for (let m = 0; m < n; m++) T[(c * n + d) * n + m] = jointTransmission(all[c]!, all[d]!, all[m]!);
  // Transmission with an unknown (outside-pedigree) mate: marginalise the mate over the prior.
  const U = new Float64Array(n * n);
  for (let c = 0; c < n; c++) for (let d = 0; d < n; d++) {
    let p = 0;
    for (let m = 0; m < n; m++) p += priors[m]! * T[(c * n + d) * n + m]!;
    U[c * n + d] = p;
  }

  const inds = individuals;
  const pos = new Map(inds.map((ind, i) => [ind.id, i]));
  const jointIndex = new Map(all.map((j, i) => [j, i]));
  const candIdx = inds.map((ind) => cand.get(ind.id)!.map((j) => jointIndex.get(j)!));
  const kids = inds.map(() => [] as { kid: number; mate: number | null; asDam: boolean }[]);
  inds.forEach((ind, k) => {
    for (const [p, isDam] of [[ind.dam, true], [ind.sire, false]] as const) {
      if (!p || !pos.has(p)) continue;
      const mateId = isDam ? ind.sire : ind.dam;
      kids[pos.get(p)!]!.push({ kid: k, mate: mateId && pos.has(mateId) ? pos.get(mateId)! : null, asDam: isDam });
    }
  });
  const parents = inds.map((ind) => ({ dam: ind.dam && pos.has(ind.dam) ? pos.get(ind.dam)! : null, sire: ind.sire && pos.has(ind.sire) ? pos.get(ind.sire)! : null }));
  // Founders with their own (breed) frequencies get their own prior.
  const ownPrior = inds.map((ind, i) => {
    const f = ind.priorFreq;
    if (!f || parents[i]!.dam !== null || parents[i]!.sire !== null || !support.loci.some((l) => f[l.id])) return null;
    return all.map((j) => jointPrior(j, support, f));
  });

  // Interchangeable loci (same alleles and founder frequencies, e.g. R1 and R2): single-sheep Gibbs
  // moves can't swap their labels where the pedigree pins a dose (a sheep with 3 red doses is
  // R1 +/+ R2 -/+ or the mirror image, and its lambs lock whichever it is). A Metropolis move that
  // swaps the two loci for every sheep at once reconnects the mirror images.
  const swaps: Int32Array[] = [];
  const locusSame = (a: number, b: number) => {
    const la = support.loci[a]!, lb = support.loci[b]!;
    const sameFreq = (f?: Record<string, number[]>) => JSON.stringify(f?.[la.id] ?? la.freq) === JSON.stringify(f?.[lb.id] ?? lb.freq);
    return JSON.stringify(la.alleles) === JSON.stringify(lb.alleles) && sameFreq() && inds.every((x) => sameFreq(x.priorFreq));
  };
  for (let a = 0; a < support.loci.length; a++) for (let b = a + 1; b < support.loci.length; b++) {
    if (!locusSame(a, b)) continue;
    const key = (j: Joint) => j.map((p) => p.join(",")).join("|");
    const byKey = new Map(all.map((j, i) => [key(j), i]));
    swaps.push(Int32Array.from(all, (j) => {
      const sw = [...j];
      [sw[a], sw[b]] = [sw[b]!, sw[a]!];
      return byKey.get(key(sw))!;
    }));
  }
  const inCand = candIdx.map((opts) => { const m = new Uint8Array(n); for (const c of opts) m[c] = 1; return m; });
  const logFactor = (i: number, st: ArrayLike<number>): number => {
    const { dam, sire } = parents[i]!;
    const c = st[i]!;
    const f = dam !== null && sire !== null ? T[(c * n + st[dam]!) * n + st[sire]!]!
      : dam !== null ? U[c * n + st[dam]!]! : sire !== null ? U[c * n + st[sire]!]! : (ownPrior[i] ?? priors)[c]!;
    return Math.log(f);
  };
  const swapped = new Int32Array(inds.length);

  const state = initialAssignment(inds, support, rng);
  const samples: Int16Array[] = [];
  const weights = new Float64Array(all.length);

  for (let sweep = 0; sweep < burn + samplesN; sweep++) {
    for (let i = 0; i < inds.length; i++) {
      const options = candIdx[i]!;
      if (options.length === 1) { state[i] = options[0]!; continue; }
      let total = 0;
      const { dam, sire } = parents[i]!;
      const prior = ownPrior[i] ?? priors;
      for (const c of options) {
        let w: number;
        if (dam !== null && sire !== null) w = T[(c * n + state[dam]!) * n + state[sire]!]!;
        else if (dam !== null) w = U[c * n + state[dam]!]!;
        else if (sire !== null) w = U[c * n + state[sire]!]!;
        else w = prior[c]!;
        for (const k of kids[i]!) {
          if (w === 0) break;
          const kj = state[k.kid]!;
          if (k.mate === null) w *= U[kj * n + c]!;
          else w *= k.asDam ? T[(kj * n + c) * n + state[k.mate]!]! : T[(kj * n + state[k.mate]!) * n + c]!;
        }
        weights[c] = w;
        total += w;
      }
      if (total <= 0) continue; // stuck; keep current state
      let u = rng.next() * total;
      for (const c of options) { u -= weights[c]!; if (u <= 0) { state[i] = c; break; } }
    }
    for (const sw of swaps) {
      let ok = true;
      for (let i = 0; i < inds.length && ok; i++) { swapped[i] = sw[state[i]!]!; ok = inCand[i]![swapped[i]!] === 1; }
      if (!ok) continue;
      let logRatio = 0;
      for (let i = 0; i < inds.length; i++) logRatio += logFactor(i, swapped) - logFactor(i, state);
      if (logRatio >= 0 || Math.log(rng.next()) < logRatio) for (let i = 0; i < inds.length; i++) state[i] = swapped[i]!;
    }
    if (sweep >= burn) samples.push(Int16Array.from(state));
  }

  const marginals: DiscretePosterior["marginals"] = {};
  const jointMarginals: DiscretePosterior["jointMarginals"] = {};
  inds.forEach((ind, i) => {
    const jm = new Map<number, number>();
    for (const s of samples) jm.set(s[i]!, (jm.get(s[i]!) ?? 0) + 1 / samples.length);
    jointMarginals[ind.id] = jm;
    const per: Record<string, Record<string, number>> = {};
    support.loci.forEach((l, li) => {
      const m: Record<string, number> = {};
      for (const [jIdx, p] of jm) { const g = support.gstr(l, all[jIdx]![li]!); m[g] = (m[g] ?? 0) + p; }
      per[l.id] = m;
    });
    marginals[ind.id] = per;
  });
  return { trait, support, ids: inds.map((x) => x.id), samples, marginals, jointMarginals };
}

/** Phenotype distribution for a hypothetical lamb of dam × sire, given current knowledge. */
export function lambOutcomes(post: DiscretePosterior, damId: string, sireId: string): Record<string, number> {
  const { all } = post.support;
  const di = post.ids.indexOf(damId), si = post.ids.indexOf(sireId);
  if (di < 0 || si < 0) throw new Error("parent not in posterior");
  const phen = all.map((j) => jointPhenotype(post.trait, post.support.loci, j));
  const out: Record<string, number> = {};
  const n = post.samples.length;
  for (const s of post.samples) {
    const d = all[s[di]!]!, m = all[s[si]!]!;
    for (let c = 0; c < all.length; c++) {
      const p = jointTransmission(all[c]!, d, m);
      if (p > 0) out[phen[c]!] = (out[phen[c]!] ?? 0) + p / n;
    }
  }
  return out;
}

function entropy(ps: Iterable<number>): number {
  let h = 0;
  for (const p of ps) if (p > 0) h -= p * Math.log2(p);
  return h;
}

/**
 * Expected information gain (bits) about the parents' joint genotypes from
 * observing one lamb's phenotype of this cross.
 */
export function informationGain(post: DiscretePosterior, damId: string, sireId: string): number {
  const { all } = post.support;
  const di = post.ids.indexOf(damId), si = post.ids.indexOf(sireId);
  const phen = all.map((j) => jointPhenotype(post.trait, post.support.loci, j));
  const n = post.samples.length;
  const pairP = new Map<number, number>();
  for (const s of post.samples) { const k = s[di]! * all.length + s[si]!; pairP.set(k, (pairP.get(k) ?? 0) + 1 / n); }
  const before = entropy(pairP.values());
  // P(y | pair) for each distinct pair.
  const yGiven = new Map<number, Record<string, number>>();
  for (const k of pairP.keys()) {
    const d = all[Math.floor(k / all.length)]!, m = all[k % all.length]!;
    const dist: Record<string, number> = {};
    for (let c = 0; c < all.length; c++) { const p = jointTransmission(all[c]!, d, m); if (p > 0) dist[phen[c]!] = (dist[phen[c]!] ?? 0) + p; }
    yGiven.set(k, dist);
  }
  const py: Record<string, number> = {};
  for (const [k, p] of pairP) for (const [y, q] of Object.entries(yGiven.get(k)!)) py[y] = (py[y] ?? 0) + p * q;
  let after = 0;
  for (const [y, pyv] of Object.entries(py)) {
    if (pyv <= 0) continue;
    const posterior: number[] = [];
    for (const [k, p] of pairP) posterior.push((p * (yGiven.get(k)![y] ?? 0)) / pyv);
    after += pyv * entropy(posterior);
  }
  return Math.max(0, before - after);
}
