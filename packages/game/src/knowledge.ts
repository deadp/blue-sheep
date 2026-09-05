/**
 * Bridges the inference package and game state: cached posteriors per season,
 * facts in words, and discovery cards when evidence pins a genotype.
 */
import { sheep as sheepDefs, type DiscreteTrait } from "@blue-sheep/genetics";
import { posteriorDiscrete, type DiscretePosterior, type Individual } from "@blue-sheep/inference";
import { species, type GameState } from "./state.js";

export const DISCRETE_TRAITS: DiscreteTrait[] = [sheepDefs.colour, sheepDefs.pattern, sheepDefs.horns];

export interface Posteriors { byTrait: Map<string, DiscretePosterior>; key: string }

let cache: Posteriors | null = null;

function individuals(state: GameState): Individual[] {
  return Object.values(state.sheep).map((s) => ({ id: s.id, dam: s.dam, sire: s.sire, phenotype: s.phenotype, tested: s.tested }));
}

/** Posteriors for every discrete trait, recomputed only when the pedigree or tests change. */
export function posteriors(state: GameState, force = false): Posteriors {
  const key = `${state.seed}:${state.season}:${Object.keys(state.sheep).join(",")}:${Object.values(state.sheep).reduce((n, s) => n + Object.keys(s.tested).length, 0)}`;
  if (!force && cache && cache.key === key) return cache;
  const inds = individuals(state);
  const byTrait = new Map<string, DiscretePosterior>();
  for (const t of DISCRETE_TRAITS) byTrait.set(t.id, posteriorDiscrete(species.map, t, inds, { samples: 300, burnIn: 50, seed: state.seed + state.season }));
  cache = { byTrait, key };
  return cache;
}

export interface Fact {
  locus: string;
  /** Short human label for the hidden thing, e.g. "hidden dilute". */
  label: string;
  /** Plain sentence. */
  text: string;
  /** 0..1 confidence in the statement. */
  confidence: number;
  /** True when the genotype is pinned with certainty. */
  certain: boolean;
  genotype: string | null;
}

/** Which allele is the "hidden" (recessive) one and how to talk about it. */
const LOCUS_WORDS: Record<string, { label: string; recessive: string; carrier: string; none: string; homo: string }> = {
  A: { label: "hidden colour", recessive: "a", carrier: "carries hidden colour under the white", none: "pure white, no hidden colour", homo: "shows its true colour" },
  B: { label: "brown", recessive: "b", carrier: "carries brown", none: "no brown", homo: "brown-based" },
  D: { label: "dilute", recessive: "d", carrier: "carries the dilute (blue!) allele", none: "no dilute allele", homo: "two dilute alleles" },
  S: { label: "spotting", recessive: "s", carrier: "carries spotting", none: "no spotting allele", homo: "spotted" },
  P: { label: "horns", recessive: "p", carrier: "carries horns", none: "no horn allele", homo: "horned" },
};

export function factsFor(state: GameState, sheepId: string): Fact[] {
  const post = posteriors(state);
  const facts: Fact[] = [];
  for (const t of DISCRETE_TRAITS) {
    const p = post.byTrait.get(t.id)!;
    const m = p.marginals[sheepId];
    if (!m) continue;
    for (const locus of t.loci) {
      const dist = m[locus] ?? {};
      const words = LOCUS_WORDS[locus]!;
      const l = species.map.loci.get(locus)!;
      const rec = words.recessive;
      const dom = l.alleles.find((a) => a !== rec)!;
      const pHomoRec = dist[`${rec}/${rec}`] ?? 0;
      const pCarrier = dist[`${rec}/${dom}`] ?? 0;
      const pNone = dist[`${dom}/${dom}`] ?? 0;
      const best = [["homo", pHomoRec], ["carrier", pCarrier], ["none", pNone]].sort((a, b) => (b[1] as number) - (a[1] as number))[0] as [keyof typeof words, number];
      const certain = best[1] > 0.999;
      const genotype = certain ? (best[0] === "homo" ? `${rec}/${rec}` : best[0] === "carrier" ? `${rec}/${dom}` : `${dom}/${dom}`) : null;
      const qualifier = certain ? "" : best[1] > 0.85 ? "almost certainly " : best[1] > 0.6 ? "probably " : "";
      const text = best[1] < 0.6 && !certain ? `${words.label}: unknown` : `${qualifier}${words[best[0]]}`;
      facts.push({ locus, label: words.label, text, confidence: best[1], certain, genotype });
    }
  }
  return facts;
}

/** Compare current certainties with what the player already knew; mint discovery cards for new ones. */
export function updateDiscoveries(state: GameState): { season: number; sheep: string; text: string }[] {
  const fresh: { season: number; sheep: string; text: string }[] = [];
  for (const id of Object.keys(state.sheep)) {
    for (const f of factsFor(state, id)) {
      if (!f.certain || !f.genotype) continue;
      const prev = state.known[id]?.[f.locus];
      if (prev === f.genotype) continue;
      state.known[id] = { ...(state.known[id] ?? {}), [f.locus]: f.genotype };
      // Only celebrate facts that are not obvious from the sheep's own look (i.e. came from relatives or tests).
      const s = state.sheep[id]!;
      const obvious = isObvious(s.phenotype, f.locus, f.genotype);
      if (obvious) continue;
      const card = { season: state.season, sheep: id, text: `${s.name} ${f.text}.` };
      state.discoveries.push(card);
      fresh.push(card);
    }
  }
  return fresh;
}

function isObvious(ph: Record<string, string | number>, locus: string, genotype: string): boolean {
  const colour = String(ph["colour"]);
  switch (locus) {
    case "P": return genotype === "p/p";
    case "S": return genotype === "s/s";
    case "A": return genotype === "a/a" && colour !== "white";
    case "B": return colour !== "white" && (genotype === "b/b");
    case "D": return colour !== "white" && genotype === "d/d";
    default: return false;
  }
}
