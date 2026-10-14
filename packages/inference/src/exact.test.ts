import { describe, expect, it } from "vitest";
import { createRng, sheep3 } from "@blue-sheep/genetics";
import { isConsistent, posteriorDiscrete } from "./posterior.js";
import type { Individual } from "./constraints.js";

const map = sheep3.sheep3.map;
const trait = sheep3.steel; // recessive, rare allele (ST/st), founder frequency 0 (floored at 1e-4)
const common = "plain", showing = "steel";

function ind(id: string, dam: string | null, sire: string | null, ph: string, tested: Record<string, string> = {}, priorFreq?: Record<string, number[]>): Individual {
  return { id, dam, sire, phenotype: { steel: ph }, tested, ...(priorFreq ? { priorFreq } : {}) };
}

/** Brute-force posterior over every genotype assignment (3^n), for a pedigree small enough to enumerate. */
function brute(inds: Individual[], q: number): Record<string, number[]> {
  const G = ["ST/ST", "ST/st", "st/st"];
  const prior = [(1 - q) ** 2, 2 * q * (1 - q), q * q];
  const T = (c: number, d: number, m: number): number => {
    const gam = (g: number): [number, number] => (g === 0 ? [1, 0] : g === 1 ? [0.5, 0.5] : [0, 1]); // P(common), P(rare)
    const [d0, d1] = gam(d), [m0, m1] = gam(m);
    return c === 0 ? d0 * m0 : c === 1 ? d0 * m1 + d1 * m0 : d1 * m1;
  };
  const n = inds.length, idx = new Map(inds.map((x, i) => [x.id, i]));
  const total = 3 ** n;
  const marg = inds.map(() => [0, 0, 0]);
  let Z = 0;
  for (let k = 0; k < total; k++) {
    const g: number[] = [];
    let r = k;
    for (let i = 0; i < n; i++) { g.push(r % 3); r = Math.floor(r / 3); }
    let w = 1;
    for (let i = 0; i < n; i++) {
      const x = inds[i]!;
      if (x.phenotype["steel"] === showing && g[i] !== 2) { w = 0; break; }
      if (x.phenotype["steel"] === common && g[i] === 2) { w = 0; break; }
      const t = x.tested["ST"];
      if (t && G[g[i]!] !== t) { w = 0; break; }
      const d = x.dam !== null ? idx.get(x.dam) : undefined, s = x.sire !== null ? idx.get(x.sire) : undefined;
      w *= d !== undefined && s !== undefined ? T(g[i]!, g[d]!, g[s]!) : prior[g[i]!]!;
      if (w === 0) break;
    }
    if (w === 0) continue;
    Z += w;
    for (let i = 0; i < n; i++) marg[i]![g[i]!]! += w;
  }
  return Object.fromEntries(inds.map((x, i) => [x.id, marg[i]!.map((v) => v / Z)]));
}

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol);

describe("exact sampling of a rare gene", () => {
  it("matches brute-force enumeration on a small pedigree with a steel lamb, plain siblings and an unknown mate", () => {
    const q = 0.1; // a large allele frequency so the numbers are well away from 0 and 1
    const f = { ST: [1 - q, q] };
    const inds = [
      ind("A", null, null, common, {}, f), ind("B", null, null, common, {}, f), ind("C", null, null, common, {}, f),
      ind("K1", "A", "B", common), ind("K2", "A", "B", showing), ind("K3", "A", "B", common), ind("K4", "K1", "C", common),
      ind("K5", "K3", "C", common), ind("K6", "K4", "K5", common),
    ];
    const truth = brute(inds, q);
    // the same founder prior for everyone (the map's own frequency is 0, so set it through priorFreq on the founders only)
    const post = posteriorDiscrete(map, trait, inds, { samples: 4000, seed: 3, exact: true });
    for (const x of inds) {
      const m = post.marginals[x.id]!["ST"]!;
      const [a, b, c] = truth[x.id]!;
      near(m["ST/ST"] ?? 0, a!, 0.04); near(m["ST/st"] ?? 0, b!, 0.04); near(m["st/st"] ?? 0, c!, 0.04);
    }
    // the steel lamb's parents are certain carriers, whatever the prior
    expect(post.marginals["A"]!["ST"]!["ST/st"]).toBeCloseTo(1, 6);
    expect(post.marginals["B"]!["ST"]!["ST/st"]).toBeCloseTo(1, 6);
  });

  it("a carrier parent with ten plain lambs is not stuck as a carrier (the Gibbs chain's trap): the posterior is the prior's", () => {
    const f = { ST: [0.98, 0.02] }; // carrier chance 3.9 %
    const inds: Individual[] = [ind("D", null, null, common, {}, f), ind("S", null, null, common, {}, f)];
    for (let i = 0; i < 10; i++) inds.push(ind(`k${i}`, "D", "S", common));
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const post = posteriorDiscrete(map, trait, inds, { samples: 1000, seed, exact: true });
      const carrier = (post.marginals["D"]!["ST"]!["ST/st"] ?? 0);
      expect(carrier, `seed ${seed}`).toBeGreaterThan(0.02);
      expect(carrier, `seed ${seed}`).toBeLessThan(0.06);
    }
  });

  it("throws on impossible evidence (a clear parent pair and a carrier lamb), and isConsistent agrees", () => {
    const inds = [
      ind("D", null, null, common, { ST: "ST/ST" }), ind("S", null, null, common, { ST: "ST/ST" }),
      ind("K", "D", "S", common, { ST: "ST/st" }),
    ];
    expect(isConsistent(map, trait, inds)).toBe(false);
    expect(() => posteriorDiscrete(map, trait, inds, { samples: 50, exact: true })).toThrow(/no consistent/);
    expect(isConsistent(map, trait, inds.slice(0, 2))).toBe(true);
  });

  it("falls back to the chain when the pedigree is too wide, and the answer is a distribution either way", () => {
    // a dense, repeatedly inbred pedigree: still answered (exact where narrow enough, the chain otherwise)
    const rng = createRng(9);
    const inds: Individual[] = [ind("f0", null, null, common), ind("f1", null, null, common)];
    for (let i = 2; i < 40; i++) {
      const a = inds[rng.int(inds.length)]!.id, b = inds[rng.int(inds.length)]!.id;
      inds.push(ind(`s${i}`, a === b ? "f0" : a, a === b ? "f1" : b, common));
    }
    const post = posteriorDiscrete(map, trait, inds, { samples: 100, burnIn: 20, seed: 4, exact: true, initByPrior: true });
    for (const x of inds) {
      const m = post.marginals[x.id]!["ST"]!;
      expect(Object.values(m).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
  });
});

describe("the chain fallback for a pedigree too wide to eliminate", () => {
  it("a carrier with ten plain lambs is never left a (near) certain carrier when the table limit forces the chain", () => {
    const f = { ST: [0.98, 0.02] }; // the exact answer is about 3 %
    const inds: Individual[] = [ind("D", null, null, common, {}, f), ind("S", null, null, common, {}, f)];
    for (let i = 0; i < 10; i++) inds.push(ind(`k${i}`, "D", "S", common));
    const exact = posteriorDiscrete(map, trait, inds, { samples: 2000, seed: 1, exact: true }).marginals["D"]!["ST"]!["ST/st"] ?? 0;
    expect(exact).toBeGreaterThan(0.02);
    expect(exact).toBeLessThan(0.05);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const forced = posteriorDiscrete(map, trait, inds, { samples: 1000, seed, exact: true, initByPrior: true, maxTable: 4 });
      const carrier = forced.marginals["D"]!["ST"]!["ST/st"] ?? 0;
      expect(carrier, `seed ${seed}`).toBeLessThan(0.15);
      expect(Object.values(forced.marginals["D"]!["ST"]!).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
  });

  it("a wide late-game-sized pedigree (300 sheep, each from the last 12) is answered in good time", () => {
    // a deep, heavily cross-linked pedigree: 300 sheep, each from two earlier ones in the last 12
    const rng = createRng(31);
    const inds: Individual[] = [ind("f0", null, null, common), ind("f1", null, null, common), ind("f2", null, null, common), ind("f3", null, null, common)];
    for (let i = 4; i < 300; i++) {
      const pool = inds.slice(Math.max(0, inds.length - 12));
      const a = pool[rng.int(pool.length)]!.id;
      let b = pool[rng.int(pool.length)]!.id;
      if (b === a) b = pool[(pool.findIndex((x) => x.id === a) + 1) % pool.length]!.id;
      inds.push(ind(`s${i}`, a, b, common));
    }
    const t0 = Date.now();
    const post = posteriorDiscrete(map, trait, inds, { samples: 200, seed: 2, exact: true, initByPrior: true });
    for (const x of inds.slice(-20)) expect(Object.values(post.marginals[x.id]!["ST"]!).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(Date.now() - t0).toBeLessThan(20_000);
  });
});
