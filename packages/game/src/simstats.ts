/** Helpers for the blind sim's closing report (scripts/blind.ts). */

/** Median of the numbers (upper middle for an even count); NaN when empty. */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
}

/** Share (0..1) of the values that are a number at or under `limit`; null (never) and negative (not reached) count as misses. Empty gives 0. */
export function shareWithin(xs: (number | null)[], limit: number): number {
  if (!xs.length) return 0;
  return xs.filter((x) => x !== null && x >= 0 && x <= limit).length / xs.length;
}

export interface Reported {
  /** Season each chapter began (index = chapter, -1 = never). */
  actSeason: number[];
  endSeason: number | null;
  firstFantasy: number | null;
}

/** The closing block: a CSV header and one row per statistic. Medians are over the seeds that got there. */
export function statsBlock(results: Reported[], maxSeasons: number): string[] {
  const n = results.length;
  const fmt = (x: number) => (Number.isFinite(x) ? String(x) : "never");
  const rows: string[] = ["stat,median_season,seeds_reached,seeds_total"];
  for (let ch = 1; ch <= 5; ch++) {
    const xs = results.map((r) => r.actSeason[ch] ?? -1).filter((x) => x >= 0);
    rows.push(`chapter_${ch},${fmt(median(xs))},${xs.length},${n}`);
  }
  const rare = results.map((r) => r.firstFantasy).filter((x): x is number => x !== null);
  rows.push(`first_rare_fleece,${fmt(median(rare))},${rare.length},${n}`);
  rows.push("stat,share,seeds_hit,seeds_total");
  const share = (name: string, xs: (number | null)[], limit: number) => {
    const hit = xs.filter((x) => x !== null && x >= 0 && x <= limit).length;
    rows.push(`${name},${shareWithin(xs, limit).toFixed(2)},${hit},${n}`);
  };
  share(`ending_within_${maxSeasons}`, results.map((r) => r.endSeason), maxSeasons);
  share("rare_fleece_by_27", results.map((r) => r.firstFantasy), 27);
  return rows;
}
