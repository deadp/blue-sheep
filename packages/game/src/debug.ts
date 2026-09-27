/** Debug fast-forward for `?act=N`: a real game played with a greedy policy, then nudged into act N. */
import {
  ACTS, LESSONS, enterAct, grantUnlock, hireVisitingRam, enterFair, isAdult, newGame, seasonOfYear,
  type ActNumber, type GameState, type SeasonReport,
} from "./core/index.js";
import { greedySeason } from "./ui/fixtures.js";

export interface FastForward { state: GameState; report: SeasonReport | null }

/**
 * Deterministic for a seed. Plays a few greedy seasons so the flock has lambs, pedigree, orders and
 * (from act 2) fair history, entering each act on the way so its panels have something to show.
 */
export function fastForward(seed: number, act: number): FastForward {
  const target = Math.max(0, Math.min(4, Math.floor(act))) as ActNumber;
  const s = newGame(seed);
  if (target === 0) return { state: s, report: null };
  let r: SeasonReport = greedySeason(s);
  for (let i = 0; i < 4; i++) r = greedySeason(s);
  if (s.act < 1) enterAct(s, 1, undefined, { grant: true });
  else for (const u of ACTS[1]!.unlocks) grantUnlock(s, u);
  for (let a = 2; a <= target; a++) {
    if (s.act < a) enterAct(s, a as ActNumber, undefined, { grant: true });
    else for (const u of ACTS[a]!.unlocks) grantUnlock(s, u);
    r = greedySeason(s);
    if (a === 2) {
      r = greedySeason(s);
      const eligible = s.flock.find((id) => isAdult(s.sheep[id]!, s.fair.nextSeason));
      if (eligible && !s.fair.entry) { try { enterFair(s, eligible); } catch { /* not open */ } }
    }
    if (a === 3) {
      for (let i = 0; i < 4 && seasonOfYear(s.season) !== 0; i++) r = greedySeason(s);
      if (s.visitingRam && s.money >= s.visitingRam.fee) { try { hireVisitingRam(s); } catch { /* ignore */ } }
    }
  }
  // Everything up to act N at once, without lessons (a lesson started on the way is dropped).
  s.lesson = null;
  s.lessonsDone = LESSONS.filter((l) => s.unlocks.includes(l.id)).map((l) => l.id);
  return { state: s, report: r };
}
