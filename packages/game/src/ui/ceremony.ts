/** Lambing ceremony choices that are pure: how big a lamb's moment is, and whether it matched the forecast. */
import { woolOf, type SeasonReport, type Sheep } from "../core/index.js";

/** "first": the first of its kind on the farm (first true blue, first of a rare wool); otherwise the quiet arrival. */
export type LambTier = "ordinary" | "first";

/**
 * The tier of one lamb in a report, derived from the report and the stats alone (no save fields):
 * a rare lamb is "first" when the report says so; the first true blue is the earliest blue lamb in this report
 * when every blue the farm has ever bred is in it (stats.bluesBorn already counts them).
 */
export function lambTier(report: SeasonReport, bluesBorn: number, lamb: Sheep): LambTier {
  if (report.rareLambs?.some((x) => x.id === lamb.id && x.first)) return "first";
  const blues = report.lambs.filter((l) => woolOf(l).trueBlue);
  if (woolOf(lamb).trueBlue && blues[0]?.id === lamb.id && bluesBorn <= blues.length) return "first";
  return "ordinary";
}

/** Plain words for the forecast against the result (no numbers): a tick where the lamb was one of the ten, a soft marker where not. */
export function forecastMark(matched: boolean): { mark: string; words: string } {
  return matched ? { mark: "✓", words: "as forecast" } : { mark: "~", words: "not on the forecast" };
}
