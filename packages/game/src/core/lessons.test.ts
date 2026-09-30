import { describe, expect, it } from "vitest";
import {
  LESSONS, PACING, VET_FEE, ackLesson, advanceLesson, advanceSeason, deserialize, lessonInfo, lessonSpeech, lessonStepMet, newGame,
  forecastVet, newTutorialGame, serialize, skipLesson, startLesson, vetTest, type GameState, type LessonView,
} from "./index.js";
import { planAll } from "./testkit.js";

const V = (panel: string | null = null, sheepId: string | null = null): LessonView => ({ panel, sheepId });

/** Sleep until `season` begins (planning every ewe, coins topped up). */
function sleepTo(g: GameState, season: number): void {
  while (g.season < season) { g.money = Math.max(g.money, 60); planAll(g); advanceSeason(g); }
}

/** Play the vet lesson the way the controller does. */
function playVet(seed: number): GameState {
  const g = newGame(seed);
  sleepTo(g, 4);
  g.money = 3;
  expect(lessonInfo(g)?.stepId).toBe("vet");
  expect(lessonStepMet(g, V("vet"))).toBe(true);
  expect(advanceLesson(g, "vet")).toBe(true);
  const id = g.flock[0]!;
  vetTest(g, id, "Dl");
  expect(lessonStepMet(g, V("vet"))).toBe(true);
  expect(advanceLesson(g, "test")).toBe(true);
  expect(ackLesson(g)).toBe(true);
  return g;
}

describe("mini-lessons", () => {
  it("every concept but the codex has a lesson of two to four steps, each with lines", () => {
    const withLesson = PACING.map((p) => p.id).filter((id) => id !== "cards");
    expect(LESSONS.map((l) => l.id).sort()).toEqual([...withLesson].sort());
    const g = newGame(1);
    for (const l of LESSONS) {
      expect(l.steps.length, l.id).toBeGreaterThanOrEqual(2);
      expect(l.steps.length, l.id).toBeLessThanOrEqual(4);
      expect(new Set(l.steps.map((s) => s.id)).size, l.id).toBe(l.steps.length);
      for (const s of l.steps) {
        // Each step either waits for a real action or has a button.
        expect(!!s.done || !!s.ack, `${l.id}.${s.id}`).toBe(true);
        expect(s.say(g, V()).length, `${l.id}.${s.id}`).toBeGreaterThan(0);
        expect(s.say(g, V()).join(" "), `${l.id}.${s.id}`).not.toMatch(/\b[A-Za-z]\/[A-Za-z]\b/); // no genotypes
      }
    }
  });

  it("each arrival starts its lesson; the vet's steps advance on the real actions", () => {
    const g = newGame(5);
    sleepTo(g, 2);
    expect(lessonInfo(g)).toMatchObject({ id: "orders", step: 1, stepId: "orders" });
    skipLesson(g);
    sleepTo(g, 4);
    expect(lessonInfo(g)).toMatchObject({ id: "vet", step: 1, count: 3, stepId: "vet" });
    // Nothing happens until the vet's hut is open; the wrong step id does nothing.
    expect(lessonStepMet(g, V(null))).toBe(false);
    expect(lessonStepMet(g, V("market"))).toBe(false);
    expect(advanceLesson(g, "test")).toBe(false);
    // Step 1 points at the vet's hut (and its HUD button); step 2 at a Test button once the hut is open.
    expect(lessonSpeech(g, V(null))?.point).toEqual({ hud: "vet", spot: "vet" });
    g.money = 5;
    expect(advanceLesson(g, "vet")).toBe(true);
    // Old Tom pays for the first test if coins are short.
    expect(g.money).toBe(VET_FEE);
    // The arrow goes to the chosen sheep's most informative untested trait (never one that would teach nothing).
    const pt = lessonSpeech(g, V("vet"))?.point as { sel: string[] };
    expect(pt.sel[1]).toBe("#overlay .chips");
    const m = pt.sel[0]!.match(/data-test="(s\d+):([A-Za-z]+)"/)!;
    expect(m[1]).toBe(g.flock[0]);
    const gains = ["W", "red", "yellow", "blue", "Dl", "S", "P"].map((l) => forecastVet(g, g.flock[0]!, l).gainBits);
    expect(forecastVet(g, g.flock[0]!, m[2]!).gainBits).toBe(Math.max(...gains));
    expect(lessonStepMet(g, V("vet"))).toBe(false);
    vetTest(g, g.flock[1]!, "blue");
    expect(lessonStepMet(g, V("vet"))).toBe(true);
    expect(advanceLesson(g, "test")).toBe(true);
    expect(lessonInfo(g)).toMatchObject({ stepId: "learnt", ack: "Got it" });
    expect(ackLesson(g)).toBe(true);
    expect(g.lesson).toBeNull();
    expect(g.lessonsDone).toEqual(["orders", "vet"]);
  });

  it("is deterministic", () => {
    expect(serialize(playVet(21))).toBe(serialize(playVet(21)));
  });

  it("skip ends a lesson and it never comes back", () => {
    const g = newGame(6);
    sleepTo(g, 4);
    skipLesson(g);
    expect(g.lesson).toBeNull();
    expect(g.lessonsDone).toContain("vet");
    expect(startLesson(g, "vet")).toBe(false);
    expect(ackLesson(g)).toBe(false);
  });

  it("sleeping mid-lesson resumes it; a new arrival ends the unfinished one quietly", () => {
    const g = newGame(7);
    sleepTo(g, 4);
    advanceLesson(g, "vet");
    expect(g.lesson).toEqual({ id: "vet", step: 2 });
    sleepTo(g, 5); // nothing new in Year 2 Summer: the lesson picks up where it was
    expect(g.lesson).toEqual({ id: "vet", step: 2 });
    expect(lessonInfo(g)?.stepId).toBe("test");
    sleepTo(g, 6); // farm improvements arrive
    expect(g.lesson).toEqual({ id: "farm", step: 1 });
    expect(g.lessonsDone).toContain("vet");
  });

  it("the orders lesson ends on accepting the horns letter", () => {
    const g = newGame(8);
    sleepTo(g, 2);
    advanceLesson(g, "orders");
    const o = g.orders.find((x) => x.status === "open")!;
    expect(o.kind).toBe("horns");
    expect(lessonSpeech(g, V("orders"))!.lines.join(" ")).toMatch(/horn/);
    expect(lessonStepMet(g, V("orders"))).toBe(false);
    g.acceptedOrders.push(o.id);
    o.status = "accepted";
    expect(lessonStepMet(g, V("orders"))).toBe(true);
  });

  it("waits while the tutorial runs", () => {
    const g = newTutorialGame(3);
    startLesson(g, "vet");
    expect(lessonInfo(g)).toBeNull();
    expect(lessonStepMet(g, V("vet"))).toBe(false);
    g.tutorial!.done = true;
    expect(lessonInfo(g)?.id).toBe("vet");
  });

  it("dogs: the buy step is optional (Maybe later), and buying a dog finishes it", () => {
    const g = newGame(9);
    sleepTo(g, 8);
    expect(lessonInfo(g)?.id).toBe("dogs");
    advanceLesson(g, "market");
    expect(lessonInfo(g)?.ack).toBe("Got it");
    g.upgrades = ["terrier"];
    expect(lessonStepMet(g, V("market"))).toBe(true);
    advanceLesson(g, "odds");
    expect(lessonInfo(g)).toMatchObject({ stepId: "buy", ack: "Maybe later" });
  });

  it("saves from before lessons load with none running", () => {
    const g = newGame(10);
    const raw = JSON.parse(serialize(g));
    delete raw.lesson;
    delete raw.lessonsDone;
    const back = deserialize(JSON.stringify(raw));
    expect(back.lesson).toBeNull();
    expect(back.lessonsDone).toEqual([]);
    expect(lessonInfo(back)).toBeNull();
    // A lesson mid-way survives a save.
    const h = newGame(10);
    sleepTo(h, 4);
    advanceLesson(h, "vet");
    expect(deserialize(serialize(h)).lesson).toEqual({ id: "vet", step: 2 });
  });
});
