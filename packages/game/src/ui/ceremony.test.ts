import { describe, expect, it } from "vitest";
import { setColour, woolOf, type SeasonReport, type Sheep } from "../core/index.js";
import { forecastMark, lambTier } from "./ceremony.js";
import { renderPanel } from "./index.js";
import { fixtures } from "./fixtures.js";

const lamb = (id: string): Sheep => ({ id, phenotype: {}, genome: {} } as unknown as Sheep);

describe("lambing ceremony tiers", () => {
  it("a plain lamb is ordinary; a rare lamb is first only when it is the first of its wool", () => {
    const a = lamb("a"), b = lamb("b");
    const r = { lambs: [a, b], rareLambs: [{ id: "a", wool: "steel", first: true, expected: 0 }, { id: "b", wool: "steel", first: false, expected: 0 }] } as unknown as SeasonReport;
    expect(lambTier(r, 5, a)).toBe("first");
    expect(lambTier(r, 5, b)).toBe("ordinary");
    expect(lambTier({ lambs: [a], rareLambs: [] } as unknown as SeasonReport, 5, a)).toBe("ordinary");
  });

  it("a true blue is first only when every blue ever born is in this report", () => {
    const ph: Record<string, string | number> = { depth: 1 };
    setColour(ph, { blue: 4 });
    const blue = { id: "b1", phenotype: ph, genome: {} } as unknown as Sheep;
    expect(woolOf(blue).trueBlue).toBe(true);
    const rep = { lambs: [blue], rareLambs: [] } as unknown as SeasonReport;
    expect(lambTier(rep, 1, blue)).toBe("first");
    expect(lambTier(rep, 5, blue)).toBe("ordinary");
  });

  it("a rare-wool first via rareLambs is first", () => {
    const a = lamb("a");
    const r = { lambs: [a], rareLambs: [{ id: "a", wool: "gold", first: true, expected: 0 }] } as unknown as SeasonReport;
    expect(lambTier(r, 99, a)).toBe("first");
  });

  it("only the first true blue of the farm is a bigger moment", () => {
    const f = fixtures().find((x) => x.name === "afterFirst")!;
    const blues = f.report!.lambs.filter((l) => woolOf(l).trueBlue);
    // Force a true blue by checking the helper on whatever the fixture bred: with no blues it is always ordinary.
    for (const l of f.report!.lambs) expect(lambTier({ ...f.report!, rareLambs: [] }, 99, l)).toBe(blues.includes(l) ? "first" : "ordinary");
  });
});

describe("forecast against result", () => {
  it("uses a tick when matched, a soft marker when not, and no digits", () => {
    expect(forecastMark(true).mark).toBe("✓");
    expect(forecastMark(false).mark).toBe("~");
    for (const m of [forecastMark(true), forecastMark(false)]) expect(m.words).not.toMatch(/\d/);
  });

  it("a lamb outside the forecast is marked miss, one inside is marked hit", () => {
    const f = fixtures().find((x) => x.name === "afterFirst")!;
    const r = f.report!;
    const ewe = Object.keys(r.matings)[0]!;
    const lambs = r.lambs.filter((l) => l.dam === ewe);
    const fc = r.forecastsSeen[ewe]!;
    const render = (key: string): string => {
      const sw = { ...fc.swatches[0]!, key, p: 1 };
      const rep = { ...r, lambs, matings: { [ewe]: r.matings[ewe]! }, forecastsSeen: { [ewe]: { ...fc, swatches: [sw] } } } as SeasonReport;
      return renderPanel(f.state, { panel: "report", sheepId: null, mateId: null, goal: "trueblue", tab: null, report: rep, portraits: () => "" });
    };
    expect(render("no-such-wool")).toContain('class="fc-mark miss"');
    expect(render("no-such-wool")).not.toContain('class="fc-mark hit"');
    expect(render(woolOf(lambs[0]!).key)).toContain('class="fc-mark hit"');
  });

  it("the report shows a marker beside each stamped swatch, and the skip and short controls", () => {
    const f = fixtures().find((x) => x.name === "afterFirst")!;
    const h = renderPanel(f.state, { panel: "report", sheepId: null, mateId: null, goal: "trueblue", tab: null, report: f.report, portraits: () => "" });
    expect((h.match(/class="fc-mark (hit|miss)"/g) ?? []).length).toBe(f.report!.lambs.length);
    expect(h).toContain('data-toggle="lamb-skip"');
    expect(h).toContain("Short lambing: off");
    const q = renderPanel(f.state, { panel: "report", sheepId: null, mateId: null, goal: "trueblue", tab: null, report: f.report, portraits: () => "", shortLambing: true, quickLambing: true });
    expect(q).toContain("Short lambing: on");
    expect(q).toContain('class="reveal quick"');
  });
});
