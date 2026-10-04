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

/** Headline odds word for a probability. */
export function oddsLabel(p: number): string {
  if (p <= 0) return "No chance";
  if (p < 0.05) return "A very long shot";
  if (p < LONG_SHOT) return "A long shot";
  if (p < 0.15) return "Unlikely, but it happens";
  if (p < 0.3) return "Possible, but don't count on it";
  if (p < 0.45) return "Fair odds";
  if (p < 0.6) return "About even";
  if (p < 0.8) return "Good odds";
  if (p < 0.95) return "Very likely";
  return "As good as certain";
}

/** A short warm sentence for a yes/no outcome, e.g. "Good odds — about two in three." */
export function oddsText(p: number, noun?: string): string {
  const label = oddsLabel(p);
  if (p <= 0) return "No chance, as far as you know.";
  if (p >= 0.95) return "As good as certain.";
  if (p < LONG_SHOT) return `${label}.`;
  return `${label} — ${fractionWords(p, noun)}.`;
}

export function plural(n: number, word: string): string {
  return `${NUM[n] ?? n} ${n === 1 ? word : `${word}s`}`;
}

export function numberWord(n: number): string {
  return NUM[n] ?? String(n);
}
