/**
 * Auto-lite memory (DESIGN-v3 §15 item 28): once the world's "auto" detail has measured slow frames and gone
 * lite, the next visits start lite straight away instead of stuttering through another measurement. The
 * decision is re-checked now and then: after RECHECK_BOOTS boots or RECHECK_MS, whichever comes first, the
 * memory is dropped and auto measures again. Pure (no DOM): the controller reads and writes the string.
 */
export const AUTOLITE_KEY = "blue-sheep-autolite";
export const RECHECK_BOOTS = 10;
export const RECHECK_MS = 7 * 24 * 3600 * 1000;

export interface AutoLiteMemory { at: number; boots: number }

/** The memory to store when auto detail has just gone lite. */
export function rememberLite(now: number): string {
  return JSON.stringify({ at: now, boots: 0 } satisfies AutoLiteMemory);
}

/**
 * On boot (auto detail only): should the world start lite, and what to store now (null = remove the memory).
 * Each remembered boot counts; on the RECHECK_BOOTS-th boot or after RECHECK_MS the memory is dropped and auto
 * measures again (and remembers again if frames are still slow).
 */
export function recallLite(raw: string | null, now: number): { lite: boolean; store: string | null } {
  if (!raw) return { lite: false, store: null };
  let m: AutoLiteMemory;
  try { m = JSON.parse(raw) as AutoLiteMemory; } catch { return { lite: false, store: null }; }
  if (!m || typeof m.at !== "number" || typeof m.boots !== "number") return { lite: false, store: null };
  const boots = m.boots + 1;
  if (boots >= RECHECK_BOOTS || now - m.at >= RECHECK_MS || now < m.at) return { lite: false, store: null };
  return { lite: true, store: JSON.stringify({ at: m.at, boots } satisfies AutoLiteMemory) };
}
