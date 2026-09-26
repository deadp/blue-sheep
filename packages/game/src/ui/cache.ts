/**
 * UI-side memo for expensive knowledge-limited forecasts. Posteriors cost 0.1–0.5 s on big flocks,
 * so forecasts are cached per state object and invalidated when anything they depend on changes.
 */
import { forecastCross, rankCandidates, type CrossForecast, type GameState, type Goal } from "../core/index.js";

const memo = new WeakMap<GameState, { key: string; map: Map<string, unknown> }>();

/** Everything a cross forecast depends on: season, pedigree size, vet tests, the visiting ram. */
function knowledgeKey(s: GameState): string {
  let tests = 0;
  for (const x of Object.values(s.sheep)) tests += Object.keys(x.tested).length;
  return `${s.season}:${s.nextId}:${Object.keys(s.sheep).length}:${s.flock.length}:${tests}:${s.visitingRam?.id ?? ""}`;
}

function cached<T>(s: GameState, k: string, f: () => T): T {
  const key = knowledgeKey(s);
  let m = memo.get(s);
  if (!m || m.key !== key) { m = { key, map: new Map() }; memo.set(s, m); }
  if (!m.map.has(k)) m.map.set(k, f());
  return m.map.get(k) as T;
}

export function crossCached(s: GameState, ewe: string, ram: string): CrossForecast {
  return cached(s, `x:${ewe}:${ram}`, () => forecastCross(s, ewe, ram));
}

export function rankCached(s: GameState, forId: string, goal: Goal): ReturnType<typeof rankCandidates> {
  return cached(s, `r:${forId}:${goal}`, () => rankCandidates(s, forId, goal));
}
