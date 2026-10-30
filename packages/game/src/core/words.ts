/** Plain-language helpers for forecasts. No numbers, no genotype strings. */

const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const FRACTIONS: [number, number][] = [[1, 10], [1, 5], [1, 4], [1, 3], [1, 2], [2, 3], [3, 4], [4, 5], [9, 10]];

/** "about one in four" / "about two lambs in three". */
export function fractionWords(p: number, noun?: string): string {
  let best = FRACTIONS[0]!;
  for (const f of FRACTIONS) if (Math.abs(f[0] / f[1] - p) < Math.abs(best[0] / best[1] - p)) best = f;
  const [a, b] = best;
  if (!noun) return `about ${NUM[a]} in ${NUM[b]}`;
  return `about ${NUM[a]} ${a === 1 ? noun : `${noun}s`} in ${NUM[b]}`;
}

/**
 * Below this chance an outcome is a "long shot" everywhere: the headline, the hint, the forecast words and the
 * litter (a faded marker swatch instead of one of the ten). One source so the wording always agrees.
 */
export const LONG_SHOT = 0.08;
/** True when a chance is a long shot (above zero, under `LONG_SHOT`). */
export const isLongShot = (p: number): boolean => p > 0 && p < LONG_SHOT;

/** Below this chance an outcome is not mentioned at all (no "long shot" at one in a million). */
export const MENTION_MIN = 0.005;
/** From here a chance reads "almost certain"; from `CERTAIN` it reads "certain, as far as you know". */
export const ALMOST = 0.95;
export const CERTAIN = 0.995;

/**
 * The one cut-off table for odds words: the headline label and the short hint chip. The cut-offs between "about
 * even", "good odds" and "very likely" sit at the midpoints of the fractions `fractionWords` uses, so a label never
 * clashes with the fraction next to it.
 */
const ODDS_BANDS: { min: number; label: string; hint: string }[] = [
  { min: CERTAIN, label: "Certain, as far as you know", hint: "certain" },
  { min: ALMOST, label: "Almost certain", hint: "almost certain" },
  { min: 0.775, label: "Very likely", hint: "very likely" },
  { min: 7 / 12, label: "Good odds", hint: "good odds" },
  { min: 5 / 12, label: "About even", hint: "about even" },
  { min: 7 / 24, label: "Fair odds", hint: "fair odds" },
  { min: 0.15, label: "Possible, but don't count on it", hint: "possible" },
  { min: LONG_SHOT, label: "Unlikely, but it happens", hint: "unlikely" },
  { min: MENTION_MIN, label: "A long shot", hint: "long shot" },
];
const bandOf = (p: number) => ODDS_BANDS.find((b) => p >= b.min);

/** Headline odds word for a probability. */
export function oddsLabel(p: number): string {
  if (p <= 0) return "No chance";
  return bandOf(p)?.label ?? "Next to no chance";
}

/** The short odds word for a hint chip ("good odds", "long shot"); "no" under `MENTION_MIN`. */
export function oddsHint(p: number): string {
  return bandOf(p)?.hint ?? "no";
}

/** "<1%" and ">99%" rather than a flat 0% or 100% that sounds surer than the odds. */
export function percentText(p: number): string {
  const r = Math.round(p * 100);
  return p < 0.01 ? "<1%" : p > 0.99 ? ">99%" : `${r}%`;
}

/** How much of the litter one colour is, in words (null under 60%): `kind` "lamb" for "most lambs", "all" for the aria text. */
export function shareWord(p: number, kind: "lamb" | "all"): string | null {
  const lamb = kind === "lamb";
  if (p >= CERTAIN) return lamb ? "every lamb" : "all";
  if (p >= ALMOST) return lamb ? "almost every lamb" : "almost all";
  if (p >= 0.85) return lamb ? "nearly all lambs" : "nearly all";
  if (p >= 0.6) return lamb ? "most lambs" : "mostly";
  return null;
}

/** The one cut-off table for "how much would this teach you" (bits): the meter word, the hint chip and the sentence. */
const LEARN_BANDS: { min: number; word: string; hint: string; text: string }[] = [
  { min: 1.05, word: "loads", hint: "loads", text: "You would learn a lot from this lamb." },
  { min: 0.7, word: "a lot", hint: "a lot", text: "You would learn something from this lamb." },
  { min: 0.3, word: "a fair bit", hint: "a fair bit", text: "You would learn something from this lamb." },
  { min: 0.025, word: "a little", hint: "a little", text: "This lamb would teach you little new." },
  { min: -Infinity, word: "nothing new", hint: "—", text: "This lamb would teach you little new." },
];
export const learnBand = (bits: number) => LEARN_BANDS.find((b) => bits >= b.min - 1e-9)!;

/** A short warm sentence for a yes/no outcome, e.g. "Good odds — about two in three." */
export function oddsText(p: number, noun?: string): string {
  const label = oddsLabel(p);
  if (p <= 0) return "No chance, as far as you know.";
  if (p < MENTION_MIN) return "Next to no chance, as far as you know.";
  if (p >= CERTAIN) return `${label}.`;
  if (p >= ALMOST) return "Almost certain.";
  if (p < LONG_SHOT) return `${label}.`;
  return `${label} — ${fractionWords(p, noun)}.`;
}

export function plural(n: number, word: string): string {
  return `${NUM[n] ?? n} ${n === 1 ? word : `${word}s`}`;
}

export function numberWord(n: number): string {
  return NUM[n] ?? String(n);
}
