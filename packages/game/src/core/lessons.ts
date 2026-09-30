/**
 * Mini-lessons: when a concept arrives (core/pacing.ts), Old Tom walks the player through it "the tutorial
 * way" in two to four steps, each done on the real action where there is one (open the vet's hut, run a test)
 * or with a "Got it" button when it is only something to read. Lessons are data: each step says what Old Tom
 * says, what to point at and when it is done; the controller renders them with the tutorial's mentor card,
 * rings and arrow (ui/tutorial.ts) and calls `advanceLesson` when a step is met.
 *
 * State: `state.lesson` ({ id, step } with 1-based steps, or null) and `state.lessonsDone` (ids finished or
 * skipped). Older saves have neither and load fine (no lesson running). A lesson waits while the tutorial
 * runs, is hidden while the season report is up, never blocks sleeping, and resumes after a sleep; if another
 * concept arrives first, the unfinished one ends quietly (counted as done) so lessons never pile up.
 */
import { TEST_LOCI, VET_FEE } from "./config.js";
import { forecastVet, wasTested } from "./vet.js";
import { addLog, canBreed } from "./state.js";
import { MENTOR, tutorialActive } from "./tutorial.js";
import type { GameState, Unlock, UpgradeId } from "./types.js";

/** What the controller shows (a structural subset of the UI's View). */
export interface LessonView { panel: string | null; sheepId: string | null; tab?: string | null }

/**
 * What to point at. `hud`: the HUD button that opens a panel (and `spot`, the matching place in the world,
 * when there is one); `sel`: things in the open panel (the first gets the arrow, all get a ring); `sheep`: a
 * sheep in the field.
 */
export type LessonPoint =
  | { hud: string; spot?: string }
  | { sel: string[] }
  | { sheep: string; rings?: string[] }
  | null;

export interface LessonStep {
  id: string;
  title: string;
  /** Informational step: the mentor shows this button ("Got it") and the step ends when it is pressed. */
  ack?: string;
  /** The real action has happened (checked after every render); ack steps may also end this way. */
  done?: (s: GameState, v: LessonView) => boolean;
  /** Called as the step begins (e.g. Old Tom pays for the first test). */
  enter?: (s: GameState) => void;
  /** Old Tom's lines (may hold <b>…</b>; names are escaped). */
  say: (s: GameState, v: LessonView) => string[];
  point: (s: GameState, v: LessonView) => LessonPoint;
}

export interface LessonDef {
  id: Unlock;
  title: string;
  steps: readonly LessonStep[];
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const owns = (s: GameState, ids: UpgradeId[]) => (s.upgrades ?? []).some((u) => ids.includes(u));
const at = (v: LessonView, panel: string) => v.panel === panel;
const openLetters = (s: GameState) => s.orders.filter((o) => o.status === "open");
const tested = (s: GameState) => Object.values(s.sheep).some((x) => Object.keys(x.tested ?? {}).length > 0);
/** A step that is done once a panel is open. */
const opens = (panel: string, spot: string | undefined, title: string, say: string[]): LessonStep => ({
  id: panel, title, done: (_s, v) => at(v, panel), say: () => say, point: (_s, v) => (at(v, panel) ? null : spot ? { hud: panel, spot } : { hud: panel }),
});
/** The vet panel's chosen sheep (as the panel picks it) and its most informative untested trait's Test button. */
const bestTest = (s: GameState, v: LessonView): string => {
  const pool = s.flock.map((id) => s.sheep[id]!);
  const chosen = (v.tab && pool.find((x) => x.id === v.tab)) || (v.sheepId && pool.find((x) => x.id === v.sheepId)) || pool[0];
  if (!chosen) return "#overlay .vet-rows [data-test]";
  let best: string | null = null, gain = -1;
  for (const l of TEST_LOCI) {
    if (wasTested(chosen, l)) continue;
    let g = 0;
    try { g = forecastVet(s, chosen.id, l).gainBits; } catch { g = 0; }
    if (g > gain) { gain = g; best = l; }
  }
  return best ? `#overlay [data-test="${chosen.id}:${best}"]` : "#overlay .vet-rows [data-test]";
};
/** Somewhere to start a forecast or a family tree: a breedable ewe, else anyone. */
const someEwe = (s: GameState) => s.flock.map((id) => s.sheep[id]!).find((x) => x.sex === "ewe" && canBreed(x, s.season))?.id ?? s.flock[0] ?? null;
/** The flock sheep with the most family on record (parents and lambs). */
const kinSheep = (s: GameState) => {
  const all = Object.values(s.sheep);
  const fam = (id: string) => { const x = s.sheep[id]!; return (x.dam ? 1 : 0) + (x.sire ? 1 : 0) + all.filter((k) => k.dam === id || k.sire === id).length; };
  return [...s.flock].sort((a, b) => fam(b) - fam(a))[0] ?? null;
};

export const LESSONS: readonly LessonDef[] = [
  {
    id: "orders", title: "Letters", steps: [
      opens("orders", "mailbox", "A letter!", [
        "A letter's come! Folk down the valley have heard about your flock.",
        "Pop over to the <b>mailbox</b> (📮) and read it.",
      ]),
      {
        id: "accept", title: "Take it on",
        done: (s) => s.acceptedOrders.length > 0 || openLetters(s).length === 0,
        say: (s, v) => {
          const o = openLetters(s)[0];
          if (!at(v, "orders") || !o) return ["Open the mailbox (📮) and take the letter on."];
          const want = o.kind === "horns" ? `a <b>${esc(o.horns ?? "horned")}</b> lamb` : "a lamb";
          return [
            `<b>${esc(o.villager)}</b> wants ${want}. Remember the square: two polled carriers give about one lamb in four with horns.`,
            "The dots show your chance to fill it in time. Press <b>Accept</b> to take it on: you're paid when a lamb fits.",
          ];
        },
        point: (s, v) => (!at(v, "orders") ? { hud: "orders", spot: "mailbox" } : openLetters(s).length ? { sel: ["#overlay .order.open [data-accept]", "#overlay .order.open .o-forecast"] } : null),
      },
      {
        id: "promised", title: "Promised", ack: "Got it",
        say: () => ["Promised orders sit on the <b>Shed board</b> with their chances. Fill them and your reputation (★) grows, and better letters follow."],
        point: () => null,
      },
    ],
  },
  {
    id: "vet", title: "The vet", steps: [
      opens("vet", "vet", "The vet's hut", [
        "Happy new year! The vet's hut down the lane is open now.",
        "Pop over to the <b>vet's hut</b> (🩺).",
      ]),
      {
        id: "test", title: "Choose a sheep and a trait",
        done: (s) => tested(s),
        enter: (s) => {
          // The first test must be possible: Old Tom pays the difference.
          const short = VET_FEE - s.money;
          if (short > 0) { s.money += short; addLog(s, `${MENTOR.name} slips you ${short} coins: “The first test's on me.”`); }
        },
        say: (_s, v) => at(v, "vet") ? [
          "Pick a sheep along the top, then a trait. The bar shows how much a test would teach you: the longer, the better value.",
          "This one would teach you plenty. Press <b>Test</b>, or pick another.",
        ] : ["Open the vet's hut (🩺), choose a sheep and test one trait."],
        point: (s, v) => (at(v, "vet") ? { sel: [bestTest(s, v), "#overlay .chips"] } : { hud: "vet", spot: "vet" }),
      },
      {
        id: "learnt", title: "A sure answer", ack: "Got it",
        say: () => ["That's a sure answer: a <b>full dot</b> on the sheep's card, and every forecast with that sheep gets sharper. A test pays when one hidden copy decides a mating."],
        point: (_s, v) => (at(v, "vet") ? { sel: ["#overlay .vet-row.done"] } : null),
      },
    ],
  },
  {
    id: "farm", title: "Improvements", steps: [
      opens("market", "market", "The market", [
        "Winter's not far off. The trader has farm improvements for sale now.",
        "Pop over to the <b>Market</b> (🛒).",
      ]),
      {
        id: "forecast", title: "Before you buy", ack: "Got it",
        say: (_s, v) => at(v, "market") ? [
          "Under <b>Farm improvements</b>, each one says what it would change for <i>your</i> farm before you spend a coin, like the snug barn here.",
          "When a hard winter's coming, the old folk warn you a season ahead on the board. No need to buy anything yet.",
        ] : ["Open the Market (🛒) and have a look at the farm improvements."],
        point: (_s, v) => (at(v, "market") ? { sel: ["#overlay [data-upgrade-card=barn] .u-fore", "#overlay [data-upgrade-card=barn]"] } : { hud: "market", spot: "market" }),
      },
    ],
  },
  {
    id: "dogs", title: "Dogs and foxes", steps: [
      opens("market", "market", "Meet the dogs", [
        "Foxes have been seen in the valley. They come by night in winter, after the lambs.",
        "Pop over to the <b>Market</b> (🛒) to meet the dogs.",
      ]),
      {
        id: "odds", title: "The fox odds", ack: "Got it",
        done: (s) => owns(s, ["terrier", "collie", "maremma"]),
        say: (_s, v) => at(v, "market") ? [
          "These bars are the <b>fox odds</b>: the chance a fox gets a lamb this winter, now and with that dog. Every dog you add keeps watch too.",
          "I'll always warn you a season before a fox comes.",
        ] : ["Open the Market (🛒) and read the fox odds."],
        point: (_s, v) => (at(v, "market") ? { sel: ["#overlay [data-upgrade-card=collie] .pet-odds", "#overlay [data-upgrade-card=terrier] .pet-odds"] } : { hud: "market", spot: "market" }),
      },
      {
        id: "buy", title: "A dog of your own?", ack: "Maybe later",
        done: (s) => owns(s, ["terrier", "collie", "maremma"]),
        say: () => ["Buy one now if you like, or wait for a warning. A dog likes a pat: <b>press and hold</b> its picture on its card."],
        point: (_s, v) => (at(v, "market") ? { sel: ["#overlay [data-upgrade=terrier]", "#overlay [data-upgrade=collie]"] } : null),
      },
    ],
  },
  {
    id: "cat", title: "The cat and the mice", steps: [
      opens("market", "market", "Meet Mog", [
        "Mice have found the barn. Some seasons they'll nibble the stored wool and the hay.",
        "Pop over to the <b>Market</b> (🛒) to meet Mog the cat.",
      ]),
      {
        id: "mice", title: "What mice cost", ack: "Got it",
        done: (s) => owns(s, ["cat"]),
        say: (_s, v) => at(v, "market") ? [
          "This line is what a <b>mouse season</b> would cost you, now and with Mog. You'll hear about mice a season before they come.",
        ] : ["Open the Market (🛒) and see what mice would cost."],
        point: (_s, v) => (at(v, "market") ? { sel: ["#overlay [data-upgrade-card=cat] .pet-mice", "#overlay [data-upgrade-card=cat]"] } : { hud: "market", spot: "market" }),
      },
      {
        id: "buy", title: "A cat of your own?", ack: "Maybe later",
        done: (s) => owns(s, ["cat"]),
        say: () => ["Take Mog home now or later: he's a good mouser, and the fonder he is of you, the more he catches."],
        point: (_s, v) => (at(v, "market") ? { sel: ["#overlay [data-upgrade=cat]"] } : null),
      },
    ],
  },
  {
    id: "numbers", title: "Real numbers", steps: [
      {
        id: "forecast", title: "Open a forecast", done: (_s, v) => at(v, "forecast"),
        say: (_s, v) => ["You've a head for this now: forecasts show real numbers from here on.", at(v, "sheep") ? "Press <b>Find a mate</b>." : "Click a ewe, then press <b>Find a mate</b>."],
        point: (s, v) => { if (at(v, "sheep")) return { sel: ["#overlay [data-findmate]"] }; const e = someEwe(s); return e ? { sheep: e } : null; },
      },
      {
        id: "read", title: "Percentages", ack: "Got it",
        say: () => ["Each colour now shows its percentage, and fleece and fineness their likely range. The ten lambs are still there: each is one chance in ten."],
        point: (_s, v) => (at(v, "forecast") ? { sel: ["#overlay .litter"] } : null),
      },
    ],
  },
  {
    id: "fair", title: "The village fair", steps: [
      opens("fair", "fairground", "The fair", [
        "The village fair comes round every autumn, and you're invited!",
        "Open the <b>Fair</b> (🎪) to see what the judges want.",
      ]),
      {
        id: "odds", title: "Your chances", ack: "Got it",
        say: (_s, v) => at(v, "fair") ? [
          "The banner says this year's prize. For each sheep, the pips show its chance of first place and of the top three.",
          "Enter one before the fair: you can change your mind until then.",
        ] : ["Open the Fair (🎪) to see this year's prize."],
        point: (_s, v) => (at(v, "fair") ? { sel: ["#overlay .fair-banner"] } : { hud: "fair", spot: "fairground" }),
      },
    ],
  },
  {
    id: "tree", title: "The family book", steps: [
      {
        id: "open", title: "Open a family tree", done: (_s, v) => at(v, "tree"),
        say: (_s, v) => ["Close kin make small lambs. The old family book shows who's related to whom.", at(v, "sheep") ? "Press <b>Family tree</b>." : "Click a sheep, then press <b>Family tree</b>."],
        point: (s, v) => { if (at(v, "sheep")) return { sel: ["#overlay [data-open=tree]"] }; const k = kinSheep(s); return k ? { sheep: k } : null; },
      },
      {
        id: "read", title: "Kin", ack: "Got it",
        say: () => ["Sheep that share a parent or a grandparent are kin. Pair sheep from different branches and the lambs grow up bigger and stronger."],
        point: (_s, v) => (at(v, "tree") ? { sel: ["#overlay .tree-key"] } : null),
      },
    ],
  },
  {
    id: "visitor", title: "Visiting rams", steps: [
      opens("market", "market", "A visitor", [
        "Each spring a ram from over the hills stays for one season. Fresh blood!",
        "Have a look at the <b>Market</b> (🛒).",
      ]),
      {
        id: "meet", title: "Hire for a season", ack: "Got it",
        say: (s, v) => {
          const here = !!s.visitingRam && s.visitingRam.season === s.season;
          if (!at(v, "market")) return ["Open the Market (🛒)."];
          return here
            ? ["Nothing's known about his family, so forecasts with him are wide, but he shares no kin with your flock. Hire him and plan him like your own rams, this season only."]
            : ["He'll be at the market in spring, for that season only. Nothing's known about his family, but he shares no kin with your flock."];
        },
        point: (s, v) => (at(v, "market") && s.visitingRam?.season === s.season ? { sel: ["#overlay .mcard.visitor"] } : null),
      },
    ],
  },
];

export function lessonDef(id: string): LessonDef | undefined {
  return LESSONS.find((l) => l.id === id);
}

export interface LessonInfo { id: Unlock; title: string; step: number; count: number; stepId: string; stepTitle: string; ack: string | null }

/** The running lesson (not while the tutorial runs), or null. */
export function lessonInfo(state: GameState): LessonInfo | null {
  const l = state.lesson;
  if (!l || tutorialActive(state)) return null;
  const def = lessonDef(l.id);
  const st = def?.steps[l.step - 1];
  if (!def || !st) return null;
  return { id: def.id, title: def.title, step: l.step, count: def.steps.length, stepId: st.id, stepTitle: st.title, ack: st.ack ?? null };
}

export function lessonActive(state: GameState): boolean {
  return lessonInfo(state) !== null;
}

function currentStep(state: GameState): LessonStep | null {
  const l = state.lesson;
  return l ? lessonDef(l.id)?.steps[l.step - 1] ?? null : null;
}

function finish(state: GameState): void {
  const l = state.lesson;
  if (!l) return;
  state.lessonsDone = [...new Set([...(state.lessonsDone ?? []), l.id])];
  state.lesson = null;
}

/**
 * A concept has arrived: start its lesson (if it has one and it hasn't been done). An unfinished lesson ends
 * quietly first (counted as done), so there is only ever one.
 */
export function startLesson(state: GameState, id: Unlock): boolean {
  const def = lessonDef(id);
  if (!def || (state.lessonsDone ?? []).includes(id)) return false;
  if (state.lesson) finish(state);
  state.lesson = { id, step: 1 };
  def.steps[0]!.enter?.(state);
  return true;
}

/** Has the player done what the current step asks? */
export function lessonStepMet(state: GameState, view: LessonView): boolean {
  if (!lessonActive(state)) return false;
  return currentStep(state)?.done?.(state, view) ?? false;
}

/** Move on from step `stepId` (no-op unless it is the current step). The last step finishes the lesson. */
export function advanceLesson(state: GameState, stepId: string): boolean {
  const l = state.lesson;
  const def = l ? lessonDef(l.id) : undefined;
  if (!l || !def || !lessonActive(state) || currentStep(state)?.id !== stepId) return false;
  if (l.step >= def.steps.length) { finish(state); return true; }
  state.lesson = { id: l.id, step: l.step + 1 };
  def.steps[l.step]!.enter?.(state);
  return true;
}

/** The mentor's button on an informational step. */
export function ackLesson(state: GameState): boolean {
  const st = currentStep(state);
  if (!st?.ack || !lessonActive(state)) return false;
  return advanceLesson(state, st.id);
}

/** Skip the rest of the running lesson. */
export function skipLesson(state: GameState): boolean {
  if (!state.lesson) return false;
  finish(state);
  return true;
}

/** What Old Tom says and points at for the current step. */
export function lessonSpeech(state: GameState, view: LessonView): { lines: string[]; point: LessonPoint } | null {
  const st = lessonActive(state) ? currentStep(state) : null;
  return st ? { lines: st.say(state, view), point: st.point(state, view) } : null;
}
