/**
 * Bridges the inference package and game state: cached posteriors, facts in words, and discovery cards when
 * evidence pins a genotype. Never reads true genomes.
 *
 * v3 colour (DESIGN-v3 §2.3): one small trait per channel. `white` (the W mask), `red`/`yellow`/`blue`
 * (two pigment genes each, 0–4 doses, hidden on white sheep), `dilute` (pale), `pattern` (spots, hidden on
 * white sheep) and `horns`. A fact is about a *gene* (GeneId): a single locus (W, Dl, S, P) or a whole
 * pigment channel (red, yellow, blue), whose two genes are told about together ("passes one red dose to
 * every lamb").
 */
import { breedFreqs, sheep3, type DiscreteTrait } from "@blue-sheep/genetics";
import {
  jointPhenotype, jointTransmission, posteriorDiscrete, type DiscretePosterior, type Individual,
} from "@blue-sheep/inference";
import { species } from "./state.js";
import type { Discovery, GameState, Phenotype } from "./types.js";

/** The discrete traits the game reasons about (the fleece and fantasy traits come in later phases). */
export const DISCRETE_TRAITS: DiscreteTrait[] = [
  sheep3.white, sheep3.red, sheep3.yellow, sheep3.blue, sheep3.dilute, sheep3.pattern, sheep3.horns,
];

export type Channel = "red" | "yellow" | "blue";
export const CHANNELS: Channel[] = ["red", "yellow", "blue"];
/** What a fact (and a vet test) is about: one gene, or a pigment channel's two genes. */
export type GeneId = "W" | Channel | "Dl" | "S" | "P";
export const GENES: GeneId[] = ["W", "red", "yellow", "blue", "Dl", "S", "P"];

export function isChannel(g: string): g is Channel {
  return g === "red" || g === "yellow" || g === "blue";
}

/** The loci behind a gene id (a channel has two). */
export function geneLoci(g: GeneId): string[] {
  return isChannel(g) ? [...sheep3.PIGMENT_LOCI[g]] : [g];
}

/** The trait whose posterior holds a gene. */
export function geneTrait(g: GeneId): string {
  return isChannel(g) ? g : g === "W" ? "white" : g === "Dl" ? "dilute" : g === "S" ? "pattern" : "horns";
}

export interface Posteriors { byTrait: Map<string, DiscretePosterior>; key: string }

const cache = new WeakMap<GameState, Posteriors>();

function individuals(state: GameState): Individual[] {
  // A bought-in sheep's breed is on its tag, so the farmer knows the allele frequencies its breed runs on.
  return Object.values(state.sheep).map((s) => ({
    id: s.id, dam: s.dam, sire: s.sire, phenotype: s.phenotype, tested: s.tested,
    ...(s.breed && s.breed !== "farm" ? { priorFreq: breedFreqs(s.breed) } : {}),
  }));
}

function knowledgeKey(state: GameState): string {
  let tests = 0;
  for (const s of Object.values(state.sheep)) tests += Object.keys(s.tested).length;
  return `${state.seed}:${state.season}:${state.nextId}:${Object.keys(state.sheep).length}:${tests}`;
}

/** Posteriors for every discrete trait, recomputed only when the pedigree or tests change. */
export function posteriors(state: GameState, force = false): Posteriors {
  const key = knowledgeKey(state);
  const hit = cache.get(state);
  if (!force && hit && hit.key === key) return hit;
  const inds = individuals(state);
  const byTrait = new Map<string, DiscretePosterior>();
  for (const t of DISCRETE_TRAITS) {
    byTrait.set(t.id, posteriorDiscrete(species.map, t, inds, { samples: 300, burnIn: 50, seed: state.seed * 31 + state.season }));
  }
  const out = { byTrait, key };
  cache.set(state, out);
  return out;
}

/** Marginal genotype distribution at one locus (genotype string -> p). Internal: never display the keys. */
export function marginal(state: GameState, sheepId: string, locus: string): Record<string, number> {
  const trait = DISCRETE_TRAITS.find((t) => t.loci.includes(locus));
  if (!trait) throw new Error(`unknown locus ${locus}`);
  return posteriors(state).byTrait.get(trait.id)!.marginals[sheepId]?.[locus] ?? {};
}

/**
 * A pigment channel's genotype class for a sheep: "hk" = h genes with two "+" copies and k genes with one.
 * Dose = 2h + k; a lamb gets h + (0..k) doses from this parent. Internal keys: "00" "01" "02" "10" "11" "20".
 */
export type ChannelClass = "00" | "01" | "02" | "10" | "11" | "20";

/** Distribution over a gene's classes: channel classes, or genotype strings for a single locus. Internal. */
export function geneDist(state: GameState, sheepId: string, gene: GeneId): Record<string, number> {
  if (!isChannel(gene)) return marginal(state, sheepId, gene);
  const post = posteriors(state).byTrait.get(gene)!;
  const jm = post.jointMarginals[sheepId];
  const out: Record<string, number> = {};
  if (!jm) return out;
  for (const [j, p] of jm) {
    const joint = post.support.all[j]!;
    let h = 0, k = 0;
    for (const [a, b] of joint) { if (a === 1 && b === 1) h++; else if (a !== b) k++; }
    const key = `${h}${k}`;
    out[key] = (out[key] ?? 0) + p;
  }
  return out;
}

export function entropyBits(ps: Iterable<number>): number {
  let h = 0;
  for (const p of ps) if (p > 1e-12) h -= p * Math.log2(p);
  return Math.max(0, h);
}

/**
 * Per posterior sample, the chance that one lamb of dam × sire shows each phenotype of `traitId`
 * (phenotype -> per-sample probabilities). Sample-aligned, so traits can be combined sample by sample.
 */
export function lambOutcomesBySample(state: GameState, traitId: string, damId: string, sireId: string): Record<string, Float64Array> {
  const post = posteriors(state).byTrait.get(traitId)!;
  const { all, loci } = post.support;
  const di = post.ids.indexOf(damId), si = post.ids.indexOf(sireId);
  const n = post.samples.length;
  const out: Record<string, Float64Array> = {};
  if (di < 0 || si < 0) return out;
  const phen = all.map((j) => jointPhenotype(post.trait, loci, j));
  const memo = new Map<number, Record<string, number>>();
  post.samples.forEach((s, k) => {
    const key = s[di]! * all.length + s[si]!;
    let dist = memo.get(key);
    if (!dist) {
      dist = {};
      const d = all[s[di]!]!, m = all[s[si]!]!;
      for (let c = 0; c < all.length; c++) { const p = jointTransmission(all[c]!, d, m); if (p > 0) dist[phen[c]!] = (dist[phen[c]!] ?? 0) + p; }
      memo.set(key, dist);
    }
    for (const [ph, p] of Object.entries(dist)) (out[ph] ??= new Float64Array(n))[k] = p;
  });
  return out;
}

/** Per posterior sample, the probability that one lamb of dam × sire shows `phenotype` for `traitId`. */
export function lambChanceBySample(state: GameState, traitId: string, damId: string, sireId: string, phenotype: string): Float64Array {
  const n = posteriors(state).byTrait.get(traitId)!.samples.length;
  return lambOutcomesBySample(state, traitId, damId, sireId)[phenotype] ?? new Float64Array(n);
}

export interface Fact {
  /** The gene id (W, red, yellow, blue, Dl, S, P). Kept as `locus` for older callers. */
  locus: GeneId;
  /** Short human label for the hidden thing, e.g. "hidden colour", "red". */
  label: string;
  /** Plain sentence. */
  text: string;
  /** 0..1 confidence in the statement. */
  confidence: number;
  /** True when the genotype is pinned with certainty. */
  certain: boolean;
  /** Internal genotype string (or channel class) when certain. Never display. */
  genotype: string | null;
}

/** How to talk about each single-locus gene: its hidden (recessive) allele and the three cases. */
export const LOCUS_WORDS: Record<"W" | "Dl" | "S" | "P", { label: string; recessive: string; carrier: string; none: string; homo: string }> = {
  W: { label: "hidden colour", recessive: "w", carrier: "hides colour under the white", none: "pure white, no hidden colour", homo: "shows its colour" },
  Dl: { label: "pale", recessive: "d", carrier: "carries a pale copy", none: "no pale copy", homo: "pale (pastel)" },
  S: { label: "spots", recessive: "s", carrier: "carries spots", none: "no spotting copy", homo: "spotted" },
  P: { label: "horns", recessive: "p", carrier: "carries horns", none: "no horn copy", homo: "horned" },
};

/** Short labels per gene (the card's one-line "what you know", discovery headings, vet tests). */
export const GENE_LABEL: Record<GeneId, string> = {
  W: "hidden colour", red: "red", yellow: "yellow", blue: "blue", Dl: "pale", S: "spots", P: "horns",
};

const DOSE_WORD = ["no", "one", "two", "three", "four"];

/** What a pigment class means for the lambs, in words (no numbers beyond "one"/"two"). */
export function channelClassWords(c: Channel, cls: string): string {
  switch (cls) {
    case "00": return `no ${c} paint`;
    case "01": return `passes a ${c} dose to about half its lambs`;
    case "02": return `passes up to two ${c} doses (none, one or two)`;
    case "10": return `passes one ${c} dose to every lamb`;
    case "11": return `passes one or two ${c} doses to every lamb`;
    case "20": return `passes two ${c} doses to every lamb`;
    default: return `${c}: unknown`;
  }
}

function qualifier(p: number, certain: boolean): string {
  return certain ? "" : p > 0.85 ? "almost certainly " : p > 0.6 ? "probably " : "";
}

function channelFact(ph: Phenotype, gene: Channel, dist: Record<string, number>): Fact {
  const best = Object.entries(dist).sort((a, b) => b[1] - a[1])[0] ?? ["00", 0];
  const [cls, p] = best;
  const certain = p > 0.999;
  const label = GENE_LABEL[gene];
  const base = { locus: gene, label, certain, genotype: certain ? cls : null };
  if (p >= 0.6) return { ...base, text: `${qualifier(p, certain)}${channelClassWords(gene, cls)}`, confidence: p };
  const seen = ph[gene];
  if (seen !== undefined) {
    // A coloured sheep: the dose shows, but not how it will pass on (two doses: one each, or both on one gene).
    const d = Number(seen);
    return { ...base, text: `${DOSE_WORD[d] ?? d} ${gene} dose${d === 1 ? "" : "s"}; how they pass on is unknown`, confidence: p };
  }
  const pAny = 1 - (dist["00"] ?? 0);
  if (pAny > 0.85) return { ...base, text: `${qualifier(pAny, false)}hides ${gene} paint under the white`, confidence: pAny };
  return { ...base, text: `${label}: unknown`, confidence: p };
}

function locusFact(gene: "W" | "Dl" | "S" | "P", dist: Record<string, number>): Fact {
  const words = LOCUS_WORDS[gene];
  const l = species.map.loci.get(gene)!;
  const rec = words.recessive;
  const dom = l.alleles.find((a) => a !== rec)!;
  // Genotype strings list the allele with the lower index first (index 0 is the hidden one for all four).
  const het = `${rec}/${dom}`;
  const cases: ["homo" | "carrier" | "none", number, string][] = [
    ["homo", dist[`${rec}/${rec}`] ?? 0, `${rec}/${rec}`], ["carrier", dist[het] ?? dist[`${dom}/${rec}`] ?? 0, het], ["none", dist[`${dom}/${dom}`] ?? 0, `${dom}/${dom}`],
  ];
  const best = cases.sort((a, b) => b[1] - a[1])[0]!;
  const certain = best[1] > 0.999;
  const text = best[1] < 0.6 && !certain ? `${words.label}: unknown` : `${qualifier(best[1], certain)}${words[best[0]]}`;
  return { locus: gene, label: words.label, text, confidence: best[1], certain, genotype: certain ? best[2] : null };
}

export function factsFor(state: GameState, sheepId: string): Fact[] {
  const s = state.sheep[sheepId];
  if (!s) return [];
  const facts: Fact[] = [];
  for (const gene of GENES) {
    const dist = geneDist(state, sheepId, gene);
    if (!Object.keys(dist).length) continue;
    facts.push(isChannel(gene) ? channelFact(s.phenotype, gene, dist) : locusFact(gene, dist));
  }
  return facts;
}

/** Compare current certainties with what the player already knew; mint discovery cards for new ones. */
export function updateDiscoveries(state: GameState): Discovery[] {
  const fresh: Discovery[] = [];
  const ids = Object.keys(state.sheep).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  for (const id of ids) {
    const s = state.sheep[id]!;
    // Everything learned about one sheep at once goes on a single card, so a big season reads as a few
    // cards rather than a dozen.
    const learned: Fact[] = [];
    for (const f of factsFor(state, id)) {
      if (!f.certain || !f.genotype) continue;
      const prev = state.known[id]?.[f.locus];
      if (prev === f.genotype) continue;
      state.known[id] = { ...(state.known[id] ?? {}), [f.locus]: f.genotype };
      // Only celebrate facts that are not obvious from the sheep's own look (i.e. came from relatives or tests).
      if (isObvious(s.phenotype, f.locus, f.genotype)) continue;
      if (state.market.includes(id) && !state.flock.includes(id)) continue;
      learned.push(f);
    }
    if (!learned.length) continue;
    // Lead with the most exciting fact (blue = the road to true blue), so the card's heading fits.
    learned.sort((a, b) => GENE_ORDER.indexOf(a.locus) - GENE_ORDER.indexOf(b.locus));
    const card: Discovery = {
      id: `d${state.discoveries.length + 1}`, season: state.season, sheep: id, locus: learned[0]!.locus,
      loci: learned.map((f) => f.locus),
      text: `${s.name} ${joinAnd(learned.map((f) => withVerb(f.text)))}.`,
    };
    state.discoveries.push(card);
    state.stats.discoveries += 1;
    fresh.push(card);
  }
  return fresh;
}

const GENE_ORDER: GeneId[] = ["blue", "W", "red", "yellow", "Dl", "S", "P"];

/** "no spotting copy" → "has no spotting copy", "horned" → "is horned"; "carries …" stays. */
function withVerb(t: string): string {
  const v = /^(no |two |one |three |four )/.test(t) ? `has ${t}` : /^(pure |horned|spotted|pale)/.test(t) ? `is ${t}` : t;
  return v.replace(", no hidden colour", " with no hidden colour"); // no stray comma inside a joined list
}

function joinAnd(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** A fact anyone could read off the sheep itself (no discovery card for it). */
function isObvious(ph: Record<string, string | number>, gene: GeneId, genotype: string): boolean {
  const coloured = ph["white"] !== "white";
  switch (gene) {
    case "P": return genotype === "p/p";
    case "S": return coloured && genotype === "s/s";
    case "W": return coloured && genotype === "w/w";
    case "Dl": return coloured && genotype === "d/d";
    // A coloured sheep shows its dose; only two doses leave the split (one each, or both on one gene) open.
    case "red": case "yellow": case "blue": return coloured && Number(ph[gene]) !== 2;
    default: return false;
  }
}
