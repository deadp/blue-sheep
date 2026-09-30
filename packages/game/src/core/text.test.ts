import { describe, expect, it } from "vitest";
import {
  advanceSeason, blueText, candidates, currentAct, enterAct, factsFor, flockSheep, forecastCross, forecastFair, forecastOrder,
  forecastVet, newGame, oddsText,
} from "./index.js";
import { GENOTYPE_RE, planAll } from "./testkit.js";

describe("player-facing text", () => {
  it("never contains genotype strings over a long game with every system on", () => {
    const g = newGame(100);
    enterAct(g, 3, undefined, { grant: true });
    g.money = 400;
    const texts: string[] = [];
    for (let t = 0; t < 16; t++) {
      planAll(g);
      const r = advanceSeason(g);
      texts.push(...r.messages, ...r.discoveries.map((d) => d.text), ...r.orderResults.map((o) => o.text));
      if (r.event) texts.push(r.event.text);
      if (r.fairResult) texts.push(r.fairResult.text);
      for (const f of Object.values(r.forecastsSeen)) texts.push(f.blueText, f.learnText);
      for (const o of g.orders) texts.push(o.text, forecastOrder(g, o.id).text);
      const s = flockSheep(g)[0]!;
      texts.push(forecastFair(g, s.id).text, forecastVet(g, s.id, "Dl").text, forecastVet(g, s.id, "red").text, forecastVet(g, s.id, "W").text, ...factsFor(g, s.id).map((f) => f.text));
      const c = candidates(g, s.id)[0];
      if (c) { const [e, ra] = s.sex === "ewe" ? [s.id, c.id] : [c.id, s.id]; const f = forecastCross(g, e, ra); texts.push(f.blueText, f.colourText, ...f.swatches.map((w) => w.word)); }
      const a = currentAct(g);
      texts.push(a.goalText, a.progressText, a.line);
    }
    texts.push(...g.log.map((l) => l.text));
    expect(texts.length).toBeGreaterThan(50);
    for (const t of texts) expect(t, t).not.toMatch(GENOTYPE_RE);
  });

  it("odds sentences are short, warm and free of numbers", () => {
    for (const p of [0, 0.01, 0.1, 0.25, 0.4, 0.5, 0.7, 0.9, 0.99, 1]) {
      for (const t of [oddsText(p), blueText(p)]) {
        expect(t.length).toBeLessThan(80);
        expect(t).not.toMatch(/\d/);
      }
    }
    expect(blueText(0.66)).toBe("Good odds — about two lambs in three would be true blue.");
    expect(oddsText(0.1)).toBe("A long shot — about one in ten.");
  });
});
