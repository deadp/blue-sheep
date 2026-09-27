/**
 * The tutorial mentor: what Old Tom says at each step, what to point at, and when the step's action has
 * happened. Pure functions of (state, view); the controller renders the card, rings and arrow, and calls
 * core `advanceTutorial` when `tutorialStepMet` says so. One idea per step, plain words, no genotypes.
 */
import {
  MENTOR, PUNNET_GENES, TUTORIAL_STEPS, cheapestMarketEwe, knownPunnet, seasonLabel, tutorialInfo, tutorialStep, ADULT_AGE,
  type GameState, type Sheep, type TutorialStepId,
} from "../core/index.js";
import { punnetHtml } from "./punnet.js";
import { esc, numbersOn } from "./util.js";
import type { View } from "./view.js";

/** Something to point at: a sheep in the world, or HTML (the first selector gets the arrow, all get a ring). */
export type TutorialTarget = { kind: "sheep"; id: string; rings?: string[] } | { kind: "html"; selectors: string[] } | null;

function sheepOf(state: GameState, id: string | undefined | null): Sheep | undefined {
  return id ? state.sheep[id] : undefined;
}

/** The tutorial pair's first lamb still on the farm. */
export function tutorialLamb(state: GameState): Sheep | undefined {
  const t = state.tutorial;
  if (!t) return undefined;
  return state.flock.map((id) => state.sheep[id]!).find((s) => s.dam === t.ewe && s.sire === t.ram);
}

/** Has the player done what the current step asks? (The controller then advances the step.) */
export function tutorialStepMet(state: GameState, view: View): boolean {
  const id = tutorialStep(state);
  const t = state.tutorial;
  if (!id || !t) return false;
  switch (id) {
    case "ewe": return view.panel === "sheep" && view.sheepId === t.ewe;
    case "ram": return view.panel === "sheep" && view.sheepId === t.ram;
    case "forecast": return view.panel === "forecast";
    case "plan": return Object.keys(state.plans).length > 0;
    case "sleep": return state.stats.lambsBorn > 0 && view.panel === "report";
    case "reveal": return view.panel === null || view.panel === "sheep";
    case "punnet": case "why": return false; // "Got it" buttons
    case "grow": { const l = tutorialLamb(state); return !l || (view.panel === "sheep" && view.sheepId === l.id); }
    case "market": return state.flock.some((sid) => { const s = state.sheep[sid]!; return s.origin === "market" && s.sex === "ewe"; });
    case "goal": case "done": return false; // "Got it" buttons
  }
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
    case "punnet": return view.panel === "forecast" ? { kind: "html", selectors: ["#overlay .legend.extras .xkey:first-child"] } : null;
    case "plan": return view.panel === "forecast" ? { kind: "html", selectors: ["#overlay [data-plan]"] } : { kind: "html", selectors: ["#hud [data-open=board]"] };
    case "sleep": return { kind: "html", selectors: ["#hud [data-sleep]"] };
    case "reveal": return view.panel === "report"
      ? { kind: "html", selectors: ["#overlay .row [data-close].primary", "#overlay .dcards"] }
      : { kind: "html", selectors: ["#overlay [data-close]"] };
    case "why": { const l = tutorialLamb(state); return l && !view.panel ? { kind: "sheep", id: l.id, rings: ["#hud [data-open=codex]"] } : null; }
    case "grow": { const l = tutorialLamb(state); return l ? { kind: "sheep", id: l.id, rings: ["#hud [data-open=codex]"] } : null; }
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
  const E = sheepOf(state, t.ewe)?.name ?? "your ewe";
  const R = sheepOf(state, t.ram)?.name ?? "your ram";
  const lamb = tutorialLamb(state);
  const L = lamb?.name ?? "your lamb";
  const her = lamb?.sex === "ram" ? "he" : "she";
  const tom = (lines: string[], button?: string): Speech => (button ? { who: MENTOR, lines, button } : { who: MENTOR, lines });
  switch (id) {
    case "ewe":
      return [tom([
        "Morning, neighbour! I'm Old Tom from down the lane. You're starting small: two sheep.",
        `This is your ewe, <b>${esc(E)}</b>. Click her in the field to say hello.`,
      ])];
    case "ram":
      return [tom(view.panel === "sheep" && view.sheepId === t.ewe ? [
        `This is ${esc(E)}'s card. <b>What you know</b> lists what your records can tell about her. The dots show how sure you are: an empty dot is a guess, a full dot is certain.`,
        `Saying hello like this once a season makes her fonder of you (the hearts), and happy sheep grow better wool.`,
        `She looks white, but white wool can hide other colours. Now meet your ram, <b>${esc(R)}</b>: click him in the field.`,
      ] : [`Now meet your ram, <b>${esc(R)}</b>. Click him in the field.`])];
    case "forecast":
      return [tom([
        `${esc(R)} is your only ram, so he'll be the father. A ram can be matched with several ewes each season.`,
        view.panel === "sheep" ? `Press <b>Find a mate</b> to see what lambs ${esc(E)} and ${esc(R)} might have.` : `Click ${esc(R)}, then press <b>Find a mate</b>.`,
      ])];
    case "punnet": {
      const sq = knownPunnet(state, PUNNET_GENES.horns, t.ewe, t.ram);
      const lines = [
        view.panel === "forecast"
          ? "This <b>forecast</b> shows ten make-believe lambs, each one chance in ten. Some have little horns. Here's why."
          : "Before you plan, here's how lambs get their looks.",
        `Every sheep has <b>two copies</b> of each gene and passes <b>one</b> to a lamb, at random. ${esc(E)} and ${esc(R)} had horned mothers, so each has a <b>no-horns copy</b> and a <b>horns copy</b>.`,
      ];
      const figure = sq ? punnetHtml({ square: sq, damName: E, sireName: R, letters: numbersOn(state), id: "tut-horns" }) : "";
      return [{ who: MENTOR, lines, figure, after: [
        "One no-horns copy is enough, so three lambs in four are polled. <b>That's why about one lamb in four has horns</b> in the forecast.",
      ], button: "Got it" }];
    }
    case "plan":
      return [tom(view.panel === "forecast" ? [
        "Mostly white lambs, from two white parents. But keep an eye out for surprises.",
        "Press <b>Plan this mating</b>.",
      ] : [`Open the board or ${esc(E)}'s card, then plan her with ${esc(R)}.`])];
    case "sleep":
      return [tom([
        "Planned! Lambs arrive when the season turns.",
        "Press <b>Sleep</b> (or click the farmhouse) to end the season.",
      ])];
    case "reveal": {
      const colour = lamb ? String(lamb.phenotype["colour"]) : "coloured";
      return [tom(view.panel === "report" ? [
        `Well I never! You expected mostly white lambs, but <b>${esc(L)}</b> is <b>${esc(colour)}</b>!`,
        "Clues like that become <b>discovery cards</b>. Press <b>Back to the farm</b> and I'll show you how it happened.",
      ] : ["Close this to get back to the farm."])];
    }
    case "why": {
      const colour = lamb ? String(lamb.phenotype["colour"]) : "black";
      const sq = knownPunnet(state, PUNNET_GENES.colour, t.ewe, t.ram);
      const figure = sq ? punnetHtml({ square: sq, damName: E, sireName: R, letters: numbersOn(state), lambColour: colour, id: "tut-colour" }) : "";
      return [{ who: MENTOR, lines: [
        `How do two white sheep have a ${esc(colour)} lamb? The same square! ${esc(E)} and ${esc(R)} each hide a <b>colour copy</b> under a <b>white copy</b>.`,
      ], figure, after: [
        `One lamb in four gets the colour copy from both parents, and <b>${esc(L)}</b> was that one. The square is in your codex (📖) for next time.`,
      ], button: "Got it" }];
    }
    case "grow": {
      const ready = lamb ? seasonLabel(lamb.born + ADULT_AGE) : "";
      return [tom(lamb ? [
        `${esc(L)} is only a lamb. Lambs take ${ADULT_AGE === 2 ? "two" : ADULT_AGE} seasons to grow up before they can breed: ${her} can breed from <b>${esc(ready)}</b>.`,
        `Click ${esc(L)} in the field to say hello.`,
      ] : ["Lambs take two seasons to grow up before they can breed."])];
    }
    case "market": {
      const gift = t.gift > 0 ? ` I've put ${t.gift} coins towards her.` : "";
      return [tom(view.panel === "market" ? [
        `Buy a ewe.${gift} A sheep from the market comes with <b>nothing known</b>: no family on record, so forecasts with her are wide guesses.`,
        "That's alright. Every lamb she has will teach you more.",
      ] : [
        `While ${esc(L)} grows, another ewe would help. Pop over to the <b>Market</b>.`,
      ])];
    }
    case "goal":
      return [tom([
        "Now, the big dream: a <b>blue sheep</b>.",
        "Blue needs a coloured sheep that also has two hidden <b>dilute</b> copies, one from its mum and one from its dad — the same square again. White sheep can carry dilute without showing it.",
        "So breed, watch for surprises and follow the clues. Your goal stays up top.",
      ], "Got it")];
    case "done": {
      const flock = state.flock.map((sid) => state.sheep[sid]!).map((s) => esc(s.name));
      const list = flock.length > 1 ? `${flock.slice(0, -1).join(", ")} and ${flock[flock.length - 1]}` : flock.join("");
      return [tom([
        `That's your flock: <b>${list}</b>. Nobody's bringing more sheep: it grows with your lambs and the market.`,
        "New things will come along one at a time, when you're ready — the first letters from the village soon. Happy farming!",
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
