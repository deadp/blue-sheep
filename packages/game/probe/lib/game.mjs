// Read-only helpers over a GameState snapshot (plain JSON from __game.state()). Mirrors core rules the probes rely on.

export const ADULT_AGE = 2;

/** @param {any} s sheep @param {number} season */
export const isAdult = (s, season) => season - s.born >= ADULT_AGE;

/** Living flock as sheep objects. @param {any} st */
export const flock = (st) => st.flock.map((/** @type {string} */ id) => st.sheep[id]);

/** @param {any} st */
export const adultEwes = (st) => flock(st).filter((s) => s.sex === "ewe" && isAdult(s, st.season));
/** @param {any} st */
export const adultRams = (st) => flock(st).filter((s) => s.sex === "ram" && isAdult(s, st.season));

/** Flock cap: v2 may name it `flockCap` (v1) or `cap`. @param {any} st */
export const capOf = (st) => st.flockCap ?? st.cap ?? Infinity;

const COLOUR_RANK = { blue: 5, fawn: 4, brown: 3, black: 2, white: 1 };

/** Rough market value used only to pick which lamb to sell. Blue is precious; finer, heavier fleece is better. @param {any} s */
export function roughValue(s) {
  const p = s.phenotype ?? {};
  return (COLOUR_RANK[/** @type {keyof typeof COLOUR_RANK} */ (p.colour)] ?? 1) * 10 + (p.fleeceWeight ?? 0) * 2 - (p.fineness ?? 26) * 0.5;
}

/**
 * Score a sheep for a fair category (higher = better). Category names are matched loosely:
 * finest wool / heaviest fleece / rarest colour / biggest.
 * @param {string} category @param {any} s
 */
export function fairScore(category, s) {
  const c = String(category).toLowerCase();
  const p = s.phenotype ?? {};
  if (/fine/.test(c)) return -(p.fineness ?? 99);
  if (/fleece|heav/.test(c)) return p.fleeceWeight ?? 0;
  if (/colou?r|rare/.test(c)) return COLOUR_RANK[/** @type {keyof typeof COLOUR_RANK} */ (p.colour)] ?? 0;
  if (/big|size/.test(c)) return p.size ?? 0;
  return roughValue(s);
}
