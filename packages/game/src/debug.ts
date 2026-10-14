/** Debug fast-forward for `?act=N`: a real game played with a greedy policy, then nudged into act N. */
import {
  ACTS, LESSONS, RARE_IDS, giftFleece, enterAct, grantUnlock, hireVisitingRam, enterFair, isAdult, makeLot, newGame, plantRareSheep, seasonOfYear,
  updateDiscoveries, updatePatterns, type RareId,
  type ActNumber, type GameState, type SeasonReport,
} from "./core/index.js";
import { greedySeason } from "./ui/fixtures.js";

export interface FastForward { state: GameState; report: SeasonReport | null }

/**
 * Deterministic for a seed. Plays a few greedy seasons so the flock has lambs, pedigree, orders and
 * (from act 2) fair history, entering each act on the way so its panels have something to show.
 */
export function fastForward(seed: number, act: number, rare?: string): FastForward {
  const target = Math.max(0, Math.min(4, Math.floor(act))) as ActNumber;
  const s = newGame(seed);
  if (target === 0) return { state: s, report: null };
  let r: SeasonReport = greedySeason(s);
  for (let i = 0; i < 4; i++) r = greedySeason(s);
  if (s.act < 1) enterAct(s, 1, undefined, { grant: true });
  else for (const u of ACTS[1]!.unlocks) grantUnlock(s, u, { fixture: true });
  for (let a = 2; a <= target; a++) {
    if (s.act < a) enterAct(s, a as ActNumber, undefined, { grant: true });
    else for (const u of ACTS[a]!.unlocks) grantUnlock(s, u, { fixture: true });
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
  // The woolshed has Old Tom's spare fleece to start with (fixtures keep the store's auto-sell as it was).
  if (s.unlocks.includes("craft") && !(s.store ?? []).length) giftFleece(s);
  // `?rare=steel` (or "steel,cloud"; "all"): a grown sheep showing that rare wool, its carrier parents on record, and one
  // of its fleeces in the store (so a job in that wool can be queued).
  const wanted = (rare === "all" ? RARE_IDS : (rare ?? "").split(",")).filter((x): x is RareId => (RARE_IDS as string[]).includes(x));
  for (const id of wanted) {
    const sheep = plantRareSheep(s, id);
    if (s.unlocks.includes("craft")) (s.store ??= []).push(makeLot(s, sheep, s.season));
  }
  if (wanted.length) { updatePatterns(s); updateDiscoveries(s); }
  // Everything up to act N at once, without lessons (a lesson started on the way is dropped).
  s.lesson = null;
  s.lessonsDone = LESSONS.filter((l) => s.unlocks.includes(l.id)).map((l) => l.id);
  return { state: s, report: r };
}
