/**
 * The tutorial mentor: what Old Tom says at each step, what to point at, and when the step's action has
 * happened. Pure functions of (state, view); the controller renders the card, rings and arrow, and calls
 * core `advanceTutorial` when `tutorialStepMet` says so. One idea per step, plain words, no genotypes.
 */
import {
  MENTOR, PUNNET_GENES, TUTORIAL_STEPS, cheapestMarketEwe, knownPunnet, lessonInfo, lessonSpeech, tutorialInfo, tutorialLambs, tutorialStep,
  type GameState, type LessonPoint, type Sheep, type TutorialStepId,
} from "../core/index.js";
import { punnetHtml } from "./punnet.js";
import { esc, numbersOn } from "./util.js";
import type { View } from "./view.js";

/**
 * Something to point at: a sheep in the world, a place in the world (a hotspot such as the vet's hut; its HUD
 * button gets a ring and takes the arrow when the place is off screen), or HTML (the first selector gets the
 * arrow, all get a ring).
 */
export type TutorialTarget =
  | { kind: "sheep"; id: string; rings?: string[] }
  | { kind: "spot"; id: string; rings: string[] }
  | { kind: "html"; selectors: string[] }
  | null;

function sheepOf(state: GameState, id: string | undefined | null): Sheep | undefined {
  return id ? state.sheep[id] : undefined;
}

/** The tutorial pair's lamb `index` (0–2; default: the latest) if it is still on the farm. */
export function tutorialLamb(state: GameState, index?: number): Sheep | undefined {
  const all = tutorialLambs(state);
  const l = all[index ?? all.length - 1];
  return l && state.flock.includes(l.id) ? l : undefined;
}

/** Lambs the tutorial pair has had so far. */
const lambCount = (state: GameState) => tutorialLambs(state).length;
const planned = (state: GameState) => !!state.tutorial && state.plans[state.tutorial.ewe] === state.tutorial.ram;

/** Has the player done what the current step asks? (The controller then advances the step.) */
export function tutorialStepMet(state: GameState, view: View): boolean {
  const id = tutorialStep(state);
  const t = state.tutorial;
  if (!id || !t) return false;
  switch (id) {
    case "ewe": return view.panel === "sheep" && view.sheepId === t.ewe;
    case "ram": return view.panel === "sheep" && view.sheepId === t.ram;
    case "forecast": return view.panel === "forecast";
    case "plan": case "again": case "again2": return planned(state);
    case "sleep": return lambCount(state) >= 1 && view.panel === "report";
    case "sleep2": return lambCount(state) >= 2 && view.panel === "report";
    case "sleep3": return lambCount(state) >= 3 && view.panel === "report";
    case "lamb1": case "horns": case "black": return view.panel !== "report";
    case "market": return state.flock.some((sid) => { const s = state.sheep[sid]!; return s.origin === "market" && s.sex === "ewe"; });
    case "punnet": case "why": case "goal": case "done": return false; // "Got it" buttons
  }
}

/** Plan the pair again: the plan button, Find a mate on either card, else the ewe in the field. */
function againTarget(state: GameState, view: View): TutorialTarget {
  const t = state.tutorial!;
  if (view.panel === "forecast") return { kind: "html", selectors: ["#overlay [data-plan]"] };
  if (view.panel === "sheep" && (view.sheepId === t.ewe || view.sheepId === t.ram)) return { kind: "html", selectors: ["#overlay [data-findmate]"] };
  return { kind: "sheep", id: t.ewe };
}

/** The report: point at "Back to the farm" (and the discovery cards, when there are any). */
function revealTarget(view: View, cards: boolean): TutorialTarget {
  if (view.panel !== "report") return { kind: "html", selectors: ["#overlay [data-close]"] };
  return { kind: "html", selectors: cards ? ["#overlay .row [data-close].primary", "#overlay .dcards"] : ["#overlay .row [data-close].primary"] };
}

/** What to highlight for the current step. */
export function tutorialTarget(state: GameState, view: View): TutorialTarget {
  const id = tutorialStep(state);
  const t = state.tutorial;
  if (!id || !t) return null;
  switch (id) {
    case "ewe": return { kind: "sheep", id: t.ewe };
    case "ram": return { kind: "sheep", id: t.ram };
    case "forecast": return view.panel === "sheep" ? { kind: "html", selectors: ["#overlay [data-findmate]"] } : { kind: "sheep", id: t.ram };
    case "plan": case "again": case "again2": return againTarget(state, view);
    case "sleep": case "sleep2": case "sleep3": return { kind: "html", selectors: ["#hud [data-sleep]"] };
    case "lamb1": return revealTarget(view, false);
    case "horns": case "black": return revealTarget(view, true);
    case "punnet": { const l = tutorialLamb(state, 1); return l && !view.panel ? { kind: "sheep", id: l.id } : null; }
    case "why": { const l = tutorialLamb(state, 2); return l && !view.panel ? { kind: "sheep", id: l.id, rings: ["#hud [data-open=codex]"] } : null; }
    case "market": {
      if (view.panel !== "market") return { kind: "html", selectors: ["#hud [data-open=market]"] };
      const e = cheapestMarketEwe(state);
      return { kind: "html", selectors: [e ? `#overlay [data-buy="${e.id}"]` : "#overlay [data-buy]"] };
    }
    case "goal": return { kind: "html", selectors: ["#hud .pill.goal"] };
    case "done": return null;
  }
}

interface Speech {
  who: { name: string; icon: string };
  lines: string[];
  button?: string;
  /** Full-width HTML under the lines (a Punnet square), then more lines. */
  figure?: string;
  after?: string[];
}

function speech(state: GameState, view: View, id: TutorialStepId): Speech[] {
  const t = state.tutorial!;
  const E = esc(sheepOf(state, t.ewe)?.name ?? "your ewe");
  const R = esc(sheepOf(state, t.ram)?.name ?? "your ram");
  const name = (i: number) => esc(tutorialLamb(state, i)?.name ?? "your lamb");
  const tom = (lines: string[], button?: string): Speech => (button ? { who: MENTOR, lines, button } : { who: MENTOR, lines });
  const onFarm = view.panel !== "report";
  /** How to plan the pair again from wherever the player is. */
  const how = view.panel === "forecast" ? "Press <b>Plan this mating</b>."
    : view.panel === "sheep" && (view.sheepId === t.ewe || view.sheepId === t.ram) ? "Press <b>Find a mate</b>."
      : `Click <b>${E}</b>, press <b>Find a mate</b>, then plan her with ${R}.`;
  switch (id) {
    case "ewe":
      return [tom([
        "Morning, neighbour! I'm Old Tom from down the lane. You're starting small: two sheep.",
        `This is your ewe, <b>${E}</b>. Click her in the field to say hello.`,
      ])];
    case "ram":
      return [tom(view.panel === "sheep" && view.sheepId === t.ewe ? [
        `This is ${E}'s card: what you know about her. Saying hello once a season makes her fonder of you.`,
        `Now meet your ram, <b>${R}</b>: click him in the field.`,
      ] : [`Now meet your ram, <b>${R}</b>. Click him in the field.`])];
    case "forecast":
      return [tom([
        `${R} is your only ram, so he'll be the father.`,
        view.panel === "sheep" ? `Press <b>Find a mate</b> to see what lambs ${E} and ${R} might have.` : `Click ${R}, then press <b>Find a mate</b>.`,
      ])];
    case "plan":
      return [tom(view.panel === "forecast" ? [
        "This is a <b>forecast</b>: ten make-believe lambs, each one chance in ten.",
        "Press <b>Plan this mating</b>.",
      ] : [how])];
    case "sleep":
      return [tom(["Planned! Lambs arrive when the season turns. Press <b>Sleep</b> (or click the farmhouse)."])];
    case "lamb1":
      return [tom(onFarm ? ["Close this to get back to the farm."] : [
        `Your first lamb: <b>${name(0)}</b>, white like both parents.`,
        "Lambs take two seasons to grow up before they can breed. Press <b>Back to the farm</b>.",
      ])];
    case "again":
      return [tom(["Let's see what else these two can give us.", how])];
    case "sleep2": case "sleep3":
      return [tom(["Planned. Press <b>Sleep</b>."])];
    case "horns":
      return [tom(onFarm ? ["Close this to get back to the farm."] : [
        `Look at that: <b>${name(1)}</b> has <b>horns</b>, and neither parent does!`,
        "A clue like that becomes a <b>discovery card</b>. Press <b>Back to the farm</b>.",
      ])];
    case "punnet": {
      const sq = knownPunnet(state, PUNNET_GENES.horns, t.ewe, t.ram);
      const figure = sq ? punnetHtml({ square: sq, damName: sheepOf(state, t.ewe)?.name ?? "Ewe", sireName: sheepOf(state, t.ram)?.name ?? "Ram", letters: numbersOn(state), id: "tut-horns" }) : "";
      return [{ who: MENTOR, lines: [
        `Here's how. Every sheep has <b>two copies</b> of each gene and passes <b>one</b> to a lamb, at random. ${E} and ${R} each have a no-horns copy and a hidden horns copy.`,
      ], figure, after: [
        `Only a lamb with two horns copies grows horns: <b>about one lamb in four</b>, just as the forecast showed. ${name(1)} was that one.`,
      ], button: "Got it" }];
    }
    case "again2":
      return [tom(["Once more: two white parents can hide more than horns.", how])];
    case "black":
      return [tom(onFarm ? ["Close this to get back to the farm."] : [
        `Well I never! <b>${name(2)}</b> is <b>black</b>, from two white parents!`,
        "Press <b>Back to the farm</b> and I'll show you how.",
      ])];
    case "why": {
      const colour = String(tutorialLamb(state, 2)?.phenotype["colour"] ?? "black");
      const sq = knownPunnet(state, PUNNET_GENES.colour, t.ewe, t.ram);
      const figure = sq ? punnetHtml({ square: sq, damName: sheepOf(state, t.ewe)?.name ?? "Ewe", sireName: sheepOf(state, t.ram)?.name ?? "Ram", letters: numbersOn(state), lambColour: colour, id: "tut-colour" }) : "";
      return [{ who: MENTOR, lines: [
        `The same square! ${E} and ${R} each hide a <b>colour copy</b> under a <b>white copy</b>.`,
      ], figure, after: [
        `One lamb in four gets the colour copy from both, and <b>${name(2)}</b> did. The square is in your codex (📖).`,
      ], button: "Got it" }];
    }
    case "market": {
      const gift = t.gift > 0 ? ` I've put ${t.gift} coins towards her.` : "";
      return [tom(view.panel === "market" ? [
        `Buy a ewe.${gift} A market sheep comes with <b>nothing known</b>: no family on record, so forecasts with her are wide guesses.`,
      ] : ["Another ewe would help your flock grow. Pop over to the <b>Market</b>."])];
    }
    case "goal":
      return [tom([
        "Now, the big dream: a <b>blue sheep</b>.",
        "Blue needs a coloured sheep with two hidden <b>dilute</b> copies, one from each parent: the same square again. Your goal stays up top.",
      ], "Got it")];
    case "done": {
      const flock = state.flock.map((sid) => state.sheep[sid]!).map((s) => esc(s.name));
      const list = flock.length > 1 ? `${flock.slice(0, -1).join(", ")} and ${flock[flock.length - 1]}` : flock.join("");
      return [tom([
        `That's your flock: <b>${list}</b>. It grows with your lambs and the market.`,
        "New things come one at a time, and I'll show you each. The first letter from the village is on its way. Happy farming!",
      ], "Let's farm!")];
    }
  }
}

/** The docked mentor card (empty string when no tutorial is running). */
export function mentorHtml(state: GameState, view: View): string {
  const info = tutorialInfo(state);
  const id = tutorialStep(state);
  if (!info || !id) return "";
  const def = TUTORIAL_STEPS[info.step - 1]!;
  const parts = speech(state, view, id);
  const btn = parts.find((p) => p.button)?.button;
  const talk = parts.map((p, i) => `<div class="m-talk">
      <div class="m-face" aria-hidden="true">${p.who.icon}</div>
      <div class="m-say">${i === 0 || parts[i - 1]!.who !== p.who ? `<div class="m-who">${esc(p.who.name)}</div>` : ""}${p.lines.map((l) => `<p>${l}</p>`).join("")}</div>
    </div>${p.figure ? `<div class="m-figure">${p.figure}</div>` : ""}${p.after?.length ? `<div class="m-after">${p.after.map((l) => `<p>${l}</p>`).join("")}</div>` : ""}`).join("");
  const wide = parts.some((p) => p.figure);
  return `<div class="mentor${wide ? " m-wide" : ""}" role="status" aria-live="polite" data-step="${info.step}" data-step-id="${def.id}">
    <div class="m-head"><span class="m-step">Step ${info.step} of ${TUTORIAL_STEPS.length} · ${esc(def.title)}</span>
      ${def.id === "done" ? "" : `<button class="link m-skip" data-tutorial="skip">Skip tutorial</button>`}</div>
    ${talk}
    ${btn ? `<div class="row"><button class="primary" data-tutorial="ack">${esc(btn)}</button></div>` : ""}
  </div>`;
}

// ---- Mini-lessons (core/lessons.ts): the same card, ring and arrow for each newly arrived concept -----------

/** Panels a lesson waits behind (the season report introduces the concept first). */
const LESSON_HIDDEN = new Set(["report", "title", "ending"]);

/** Is a lesson on screen now? (Running, and not behind the report, the title or the ending.) */
export function lessonShown(state: GameState, view: View): boolean {
  return !!lessonInfo(state) && !LESSON_HIDDEN.has(view.panel ?? "");
}

/** A lesson's point, as a target for the controller. */
export function pointTarget(p: LessonPoint): TutorialTarget {
  if (!p) return null;
  if ("hud" in p) {
    const btn = `#hud [data-open=${p.hud}]`;
    return p.spot ? { kind: "spot", id: p.spot, rings: [btn] } : { kind: "html", selectors: [btn] };
  }
  if ("sel" in p) return { kind: "html", selectors: p.sel };
  return p.rings ? { kind: "sheep", id: p.sheep, rings: p.rings } : { kind: "sheep", id: p.sheep };
}

/** What the running lesson points at. */
export function lessonTarget(state: GameState, view: View): TutorialTarget {
  if (!lessonShown(state, view)) return null;
  const sp = lessonSpeech(state, view);
  return sp ? pointTarget(sp.point) : null;
}

/** The docked mentor card for a lesson (empty string when none is shown). */
export function lessonMentorHtml(state: GameState, view: View): string {
  const info = lessonInfo(state);
  const sp = lessonSpeech(state, view);
  if (!info || !sp || !lessonShown(state, view)) return "";
  const last = info.step === info.count;
  return `<div class="mentor lesson" role="status" aria-live="polite" data-lesson="${esc(info.id)}" data-step="${info.step}" data-step-id="${esc(info.stepId)}">
    <div class="m-head"><span class="m-step">New · ${esc(info.title)} · ${info.step} of ${info.count}</span>
      ${last && info.ack ? "" : `<button class="link m-skip" data-lesson="skip">Skip</button>`}</div>
    <div class="m-talk">
      <div class="m-face" aria-hidden="true">${MENTOR.icon}</div>
      <div class="m-say"><div class="m-who">${esc(MENTOR.name)} · ${esc(info.stepTitle)}</div>${sp.lines.map((l) => `<p>${l}</p>`).join("")}</div>
    </div>
    ${info.ack ? `<div class="row"><button class="primary" data-lesson="ack">${esc(info.ack)}</button></div>` : ""}
  </div>`;
}
