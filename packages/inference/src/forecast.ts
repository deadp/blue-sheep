/**
 * Quantitative-trait forecasts from the player's own records. Heritability is
 * *estimated* from parent–offspring pairs on the farm, so forecasts start vague
 * and sharpen as the pedigree grows.
 */
import type { QuantitativeTrait } from "@blue-sheep/genetics";

export interface Record_ { id: string; dam: string | null; sire: string | null; value: number }

export interface H2Estimate {
  h2: number;
  /** Standard error of the estimate; large when few records. */
  se: number;
  pairs: number;
}

const PRIOR_H2 = 0.3;
const PRIOR_SE = 0.3;

/** Midparent–offspring regression pooled with a vague prior. */
export function estimateH2(records: Record_[]): H2Estimate {
  const byId = new Map(records.map((r) => [r.id, r.value]));
  const xs: number[] = [], ys: number[] = [];
  for (const r of records) {
    const d = r.dam ? byId.get(r.dam) : undefined, s = r.sire ? byId.get(r.sire) : undefined;
    if (d === undefined || s === undefined) continue;
    xs.push((d + s) / 2); ys.push(r.value);
  }
  const n = xs.length;
  if (n < 4) return { h2: PRIOR_H2, se: PRIOR_SE, pairs: n };
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i]! - mx, dy = ys[i]! - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx <= 0) return { h2: PRIOR_H2, se: PRIOR_SE, pairs: n };
  const slope = sxy / sxx;
  const resid = Math.max(0, syy - slope * sxy) / Math.max(1, n - 2);
  const se = Math.sqrt(resid / sxx);
  // Precision-weighted pooling with the prior, clamped to [0, 1].
  const wP = 1 / (PRIOR_SE * PRIOR_SE), wD = 1 / Math.max(1e-6, se * se);
  const h2 = Math.min(1, Math.max(0, (PRIOR_H2 * wP + slope * wD) / (wP + wD)));
  return { h2, se: Math.sqrt(1 / (wP + wD)), pairs: n };
}

export interface QuantForecast {
  mean: number;
  /** Spread of lamb values around the mean (Mendelian sampling + environment + h² uncertainty). */
  sd: number;
  h2: H2Estimate;
}

/** Forecast a lamb's value from parent phenotypes and the estimated h². */
export function forecastQuantitative(trait: QuantitativeTrait, damValue: number, sireValue: number, records: Record_[], flockMean: number, flockSd: number): QuantForecast {
  const h2 = estimateH2(records);
  const midDev = (damValue + sireValue) / 2 - flockMean;
  const mean = flockMean + h2.h2 * midDev;
  // Within-family variance ≈ (1 - h2/2) * Vp, plus uncertainty in the slope applied to the deviation.
  const vp = flockSd * flockSd;
  const sd = Math.sqrt(Math.max(0, (1 - h2.h2 / 2) * vp) + (h2.se * midDev) ** 2);
  return { mean, sd, h2 };
}
