/**
 * Cross forecasts and mate candidates, computed only from the player's knowledge (posteriors + farm records).
 *
 * Lamb colour (DESIGN-v3 §2.3): P(white) from the `white` posterior; given a coloured lamb, the three pigment
 * dose distributions, pale and colour strength combine as a product (the genes are unlinked in the model).
 * The 5 × 5 × 5 × 2 classes are collapsed by colour name and intensity band ("soft pink", "vivid blue"),
 * and colour strength is integrated over three points of its forecast (mean − sd, mean, mean + sd).
 */
import { MASK_WHITE, sheep3, woolColour } from "@blue-sheep/genetics";
import {
  forecastQuantitative, informationGain, lambOutcomes, type QuantForecast, type Record_,
} from "@blue-sheep/inference";
import { bandRank, dressWool, type Band } from "./colour.js";
import { posteriors } from "./knowledge.js";
import { canBreed, isAdult, pedigreeOf } from "./state.js";
import { fractionWords, LONG_SHOT, oddsLabel } from "./words.js";
import type { CrossForecast, GameState, LambSwatch, Sheep } from "./types.js";

/**
 * Goal tabs: true blue, a colour ("colour:vivid" for any vivid colour, or "colour:<name>" for a colour name
 * at bright or better), learn the most, finer wool, heavier fleece.
 */
export type Goal = "trueblue" | "learn" | "fine" | "heavy" | `colour:${string}`;
export const GOALS: { id: Goal; label: string }[] = [
  { id: "trueblue", label: "True blue lamb" }, { id: "colour:vivid", label: "A colour" }, { id: "learn", label: "Learn the most" },
  { id: "fine", label: "Finer wool" }, { id: "heavy", label: "Heavier fleece" },
];

/** The colour a "colour:…" goal asks for ("vivid" or a colour name), or null for other goals. */
export function goalColour(goal: Goal): string | null {
  return goal.startsWith("colour:") ? goal.slice(7) : null;
}

/** Measured records for a quantitative trait (adults, plus anyone who has left the flock). */
export function traitRecords(state: GameState, traitId: string): Record_[] {
  return Object.values(state.sheep)
    .filter((s) => isAdult(s, state.season) || !state.flock.includes(s.id))
    .filter((s) => traitId !== "depth" || s.phenotype["white"] !== "white")
    .map((s) => ({ id: s.id, dam: s.dam, sire: s.sire, value: Number(s.phenotype[traitId]) }));
}

/** Flock mean and spread of a measured trait. Colour strength only counts sheep that show colour. */
export function flockStats(state: GameState, traitId: string): { mean: number; sd: number } {
  const pool = Object.values(state.sheep).filter((s) => traitId !== "depth" || s.phenotype["white"] !== "white");
  const vals = pool.map((s) => Number(s.phenotype[traitId]));
  if (traitId === "depth" && vals.length < 2) return { mean: 1, sd: 0.12 };
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length - 1)) || (traitId === "depth" ? 0.12 : 1);
  return { mean, sd };
}

/** A parent's colour strength as the farmer knows it: measured when it shows colour, else the flock's. */
function knownDepth(state: GameState, s: Sheep, flockMean: number): number {
  return s.phenotype["white"] === "white" ? flockMean : Number(s.phenotype["depth"] ?? flockMean);
}

export function blueText(p: number): string {
  if (p <= 0) return "No true blue lambs from this pair, as far as you know.";
  if (p < LONG_SHOT) return `${oddsLabel(p)} — a true blue lamb is possible, but rare.`;
  if (p >= 0.95) return "Every lamb should be true blue.";
  return `${oddsLabel(p)} — ${fractionWords(p, "lamb")} would be true blue.`;
}

export function learnText(bits: number): string {
  if (bits > 1) return "You would learn a lot from this lamb.";
  if (bits > 0.3) return "You would learn something from this lamb.";
  return "This lamb would teach you little new.";
}

/**
 * "Most lambs snow-white, about one in ten bright red, a long shot at true blue." Classes at `NAMED_MIN` or better
 * are named with odds (and have a swatch in `litterOf`); rarer ones are only ever "a long shot".
 */
export function colourText(f: Pick<CrossForecast, "swatches" | "trueBlue">): string {
  const live = f.swatches.filter((w) => w.p > 0.005);
  if (!live.length) return "Nobody can say yet what colour the lambs will be.";
  const named = live.filter((w) => w.p >= NAMED_MIN).slice(0, 3);
  const w = (s: LambSwatch) => s.p >= 0.95 ? `every lamb ${s.word}` : s.p >= 0.6 ? `most lambs ${s.word}` : `${fractionWords(s.p)} ${s.word}`;
  const parts = named.map(w);
  const longShots = live.filter((s) => s.p < NAMED_MIN && !s.trueBlue);
  if (longShots.length && named.length < 3) parts.push(`a long shot at ${longShots[0]!.word}`);
  const tbClass = Math.max(0, ...f.swatches.filter((s) => s.trueBlue).map((s) => s.p));
  if (f.trueBlue > 0 && !named.some((s) => s.trueBlue)) parts.push(tbClass < NAMED_MIN ? "a long shot at true blue" : `${fractionWords(f.trueBlue)} true blue`);
  const t = parts.join(", ");
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
}

const DEPTH_POINTS: [number, number][] = [[-1, 0.25], [0, 0.5], [1, 0.25]];

/**
 * The lamb colour classes of a cross, from per-trait lamb outcomes: white (hidden colour underneath), then
 * every pigment mix at three colour strengths, collapsed by colour name and band.
 */
export function colourClasses(
  white: Record<string, number>, red: Record<string, number>, yellow: Record<string, number>, blue: Record<string, number>,
  dilute: Record<string, number>, depth: { mean: number; sd: number },
): LambSwatch[] {
  const out = new Map<string, LambSwatch & { best: number }>();
  const pWhite = white["white"] ?? 0;
  if (pWhite > 0) {
    out.set("snow-white", { key: "snow-white", word: "snow-white", name: "snow-white", family: "white", hex: MASK_WHITE, p: pWhite, hidden: true, trueBlue: false, band: "none", intensity: 0, best: pWhite });
  }
  const pCol = 1 - pWhite;
  if (pCol > 1e-9) {
    const pale = { pale: dilute["pale"] ?? 0, full: dilute["full"] ?? 0 };
    const tot = pale.pale + pale.full || 1;
    for (const [r, pr] of Object.entries(red)) for (const [y, py] of Object.entries(yellow)) for (const [b, pb] of Object.entries(blue)) {
      for (const [dl, pd] of Object.entries(pale)) {
        const base = pCol * pr * py * pb * (pd / tot);
        if (base < 1e-7) continue;
        for (const [z, wz] of DEPTH_POINTS) {
          const d = Math.max(0.6, Math.min(1.4, depth.mean + z * depth.sd));
          const w = dressWool(woolColour({ white: false, red: Number(r), yellow: Number(y), blue: Number(b), dilute: dl === "pale", depth: d }));
          const p = base * wz;
          const cur = out.get(w.key);
          if (!cur) out.set(w.key, { key: w.key, word: w.word, name: w.name, family: w.family, hex: w.hex, p, hidden: false, trueBlue: w.trueBlue, band: w.band, intensity: w.intensity, best: p });
          else {
            cur.p += p;
            // The class shows its most likely member's shade (at the forecast's mean strength when it can).
            if (p > cur.best || (z === 0 && p >= cur.best * 0.999)) { cur.best = p; cur.hex = w.hex; cur.intensity = w.intensity; }
            if (w.trueBlue) cur.trueBlue = true;
          }
        }
      }
    }
  }
  return [...out.values()].map(({ best: _b, ...s }) => s).sort((a, b) => b.p - a.p || a.key.localeCompare(b.key));
}

/** A colour at or above this chance is named with odds ("about one in ten") in the hint and always gets a swatch. */
export const NAMED_MIN = LONG_SHOT;

/**
 * Ten lambs by largest remainder over the classes (most likely first): the swatch litter. Always exactly ten
 * when there is any forecast at all. Any class at `NAMED_MIN` or better gets at least one swatch (taken from
 * the class with the most to spare), so the hint's "about one in ten orange" is never ten white lambs.
 */
export function litterOf(swatches: LambSwatch[]): LambSwatch[] {
  // Long shots (under NAMED_MIN) are not one of the ten: they show as the extra marker swatch (`longShotsOf`).
  const live = swatches.filter((s) => s.p > 0);
  const entries = (live.some((s) => s.p >= NAMED_MIN) ? live.filter((s) => s.p >= NAMED_MIN) : live).sort((a, b) => b.p - a.p);
  const total = entries.reduce((a, b) => a + b.p, 0) || 1;
  const counts = entries.map((s) => { const x = (s.p / total) * 10; return { s, n: Math.floor(x + 1e-9), frac: x - Math.floor(x + 1e-9), x }; });
  let left = 10 - counts.reduce((a, b) => a + b.n, 0);
  for (const e of [...counts].sort((a, b) => b.frac - a.frac || b.s.p - a.s.p)) { if (left <= 0) break; e.n++; left--; }
  for (const e of counts) {
    if (e.n > 0 || e.s.p < NAMED_MIN) continue;
    const donor = counts.filter((d) => d.n > 1).sort((a, b) => (b.n - b.x) - (a.n - a.x) || b.n - a.n)[0];
    if (!donor) break;
    donor.n--; e.n++;
  }
  const out: LambSwatch[] = [];
  for (const e of counts) for (let i = 0; i < e.n; i++) out.push(e.s);
  return out.slice(0, 10);
}

/**
 * The long-shot classes of a forecast: real chances (over half a percent) under `NAMED_MIN`, which get no tile in the
 * ten and show as one faded marker swatch with a sparkle. True blue first, then most likely. Empty when no class
 * reaches `NAMED_MIN` (a diffuse forecast keeps all its tiles).
 */
export function longShotsOf(swatches: LambSwatch[]): LambSwatch[] {
  if (!swatches.some((s) => s.p >= NAMED_MIN)) return [];
  return swatches.filter((s) => s.p > 0.005 && s.p < NAMED_MIN).sort((a, b) => Number(b.trueBlue) - Number(a.trueBlue) || b.p - a.p);
}

/** P(one lamb has a colour name at `min` band or better); "vivid" = any vivid colour; "true blue". */
export function pColour(f: Pick<CrossForecast, "swatches">, colour: string, min: Band | null = null): number {
  let p = 0;
  for (const s of f.swatches) {
    const ok = colour === "true blue" ? s.trueBlue : colour === "vivid" ? s.band === "vivid" : s.name === colour && (min === null || bandRank(s.band as Band) >= bandRank(min));
    if (ok) p += s.p;
  }
  return p;
}

export function forecastCross(state: GameState, eweId: string, ramId: string): CrossForecast {
  const post = posteriors(state);
  const P = (t: string) => post.byTrait.get(t)!;
  const ped = pedigreeOf(state);
  const ewe = state.sheep[eweId], ram = state.sheep[ramId];
  if (!ewe || !ram) throw new Error("Unknown sheep in this pairing.");
  const fin = flockStats(state, "fineness"), fw = flockStats(state, "fleeceWeight"), dep = flockStats(state, "depth");
  const white = lambOutcomes(P("white"), eweId, ramId);
  const red = lambOutcomes(P("red"), eweId, ramId), yellow = lambOutcomes(P("yellow"), eweId, ramId), blue = lambOutcomes(P("blue"), eweId, ramId);
  const dilute = lambOutcomes(P("dilute"), eweId, ramId);
  const depth = forecastQuantitative(sheep3.depth, knownDepth(state, ewe, dep.mean), knownDepth(state, ram, dep.mean), traitRecords(state, "depth"), dep.mean, dep.sd);
  const swatches = colourClasses(white, red, yellow, blue, dilute, { mean: depth.mean, sd: Math.min(0.2, depth.sd) });
  const pWhite = white["white"] ?? 0;
  const spots = lambOutcomes(P("pattern"), eweId, ramId);
  const pattern = { spotted: (1 - pWhite) * (spots["spotted"] ?? 0), solid: 1 - (1 - pWhite) * (spots["spotted"] ?? 0) };
  // A white lamb hides its pigment, pale and spots: those genes only teach when the lamb shows colour.
  const ig = (t: string) => informationGain(P(t), eweId, ramId);
  const learnBits = ig("white") + ig("horns") + (1 - pWhite) * (ig("red") + ig("yellow") + ig("blue") + ig("dilute") + ig("pattern"));
  const colour: Record<string, number> = {};
  const families: Record<string, number> = {};
  for (const s of swatches) { colour[s.key] = s.p; families[s.family] = (families[s.family] ?? 0) + s.p; }
  const f: CrossForecast = {
    colour, swatches, families, white: pWhite,
    trueBlue: pColour({ swatches }, "true blue"), vivid: pColour({ swatches }, "vivid"),
    depth,
    horns: lambOutcomes(P("horns"), eweId, ramId),
    pattern,
    learnBits,
    fineness: forecastQuantitative(sheep3.fineness, Number(ewe.phenotype["fineness"]), Number(ram.phenotype["fineness"]), traitRecords(state, "fineness"), fin.mean, fin.sd),
    fleeceWeight: forecastQuantitative(sheep3.fleeceWeight, Number(ewe.phenotype["fleeceWeight"]), Number(ram.phenotype["fleeceWeight"]), traitRecords(state, "fleeceWeight"), fw.mean, fw.sd),
    relatedness: ped.relatedness(eweId, ramId),
    inbreeding: ped.offspringInbreeding(eweId, ramId),
    blueText: "", colourText: "",
    learnText: learnText(learnBits),
  };
  f.blueText = blueText(f.trueBlue);
  f.colourText = colourText(f);
  return f;
}

/** Higher is better for the chosen goal tab. */
export function scoreCross(f: CrossForecast, goal: Goal): number {
  const c = goalColour(goal);
  if (c) return c === "vivid" ? f.vivid : pColour(f, c, "bright");
  switch (goal) {
    case "trueblue": return f.trueBlue;
    case "learn": return f.learnBits;
    case "fine": return -f.fineness.mean;
    case "heavy": return f.fleeceWeight.mean;
    default: return 0;
  }
}

/**
 * Possible mates for `forId`: adults of the other sex that can breed this season.
 * For ewes this includes the visiting ram while one is at the farm (hired or not —
 * the forecast helps decide whether to hire him).
 */
export function candidates(state: GameState, forId: string): Sheep[] {
  const me = state.sheep[forId];
  if (!me) return [];
  const out = state.flock.map((id) => state.sheep[id]!)
    .filter((s) => s.id !== forId && s.sex !== me.sex && canBreed(s, state.season));
  const v = state.visitingRam;
  if (v && me.sex === "ewe" && v.season === state.season && state.sheep[v.id] && !out.some((s) => s.id === v.id)) out.push(state.sheep[v.id]!);
  return out;
}

/** Sort candidates for a goal tab, best first. */
export function rankCandidates(state: GameState, forId: string, goal: Goal): { sheep: Sheep; forecast: CrossForecast; score: number }[] {
  const me = state.sheep[forId]!;
  return candidates(state, forId).map((c) => {
    const [eweId, ramId] = me.sex === "ewe" ? [me.id, c.id] : [c.id, me.id];
    const forecast = forecastCross(state, eweId, ramId);
    return { sheep: c, forecast, score: scoreCross(forecast, goal) };
  }).sort((a, b) => b.score - a.score);
}

export type { QuantForecast };
