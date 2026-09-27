import { describe, expect, it } from "vitest";
import {
  colourFamily, colourInputFromPhenotype, HUE_FAMILIES, intensityBand, MASK_WHITE, NEUTRAL_C, paintAmount, RYB_CORNERS,
  rgbToOklab, hexToRgb, rybToRgb, rgbToHex, woolColour, type ColourInput,
} from "./colour.js";

const col = (red: number, yellow: number, blue: number, depth = 1, dilute = false, extra: Partial<ColourInput> = {}) =>
  woolColour({ white: false, red, yellow, blue, dilute, depth, ...extra });

describe("woolColour: the §2.2 example table", () => {
  const cases: [number, number, number, number, boolean, string, number][] = [
    [0, 0, 4, 1.0, false, "blue", 1.0],
    [0, 0, 2, 1.3, false, "blue", 0.65],
    [1, 0, 3, 1.0, false, "blue", 0.75],
    [4, 0, 4, 1.0, false, "purple", 1.0],
    [2, 2, 0, 1.0, false, "orange", 0.5],
    [3, 3, 3, 1.0, false, "charcoal", 0],
    [3, 3, 2, 1.0, false, "brown", 0.25],
    [0, 0, 0, 1.0, false, "oatmeal", 0],
    [0, 0, 0, 1.4, false, "oatmeal", 0],
    [4, 0, 0, 1.0, true, "red", 0.5],
  ];
  it.each(cases)("r%i y%i b%i ×%f dilute=%s → %s, I %f", (r, y, b, d, dil, family, intensity) => {
    const c = col(r, y, b, d, dil);
    expect(c.family).toBe(family);
    expect(c.intensity).toBeCloseTo(intensity, 6);
  });
  it("dilute red is called pink", () => expect(col(4, 0, 0, 1, true).name).toBe("pink"));
  it("true blue: family blue, I ≥ 0.6, not dilute", () => {
    expect(col(0, 0, 4).trueBlue).toBe(true);
    expect(col(0, 0, 2, 1.3).trueBlue).toBe(true);
    expect(col(1, 0, 3).trueBlue).toBe(true);
    expect(col(0, 0, 2).trueBlue).toBe(false); // I 0.5
    expect(col(0, 0, 4, 1, true).trueBlue).toBe(false); // sky
    expect(col(4, 0, 4).trueBlue).toBe(false); // purple
  });
});

describe("woolColour: rules", () => {
  it("white masks everything and is distinct from oatmeal", () => {
    const w = woolColour({ white: true, red: 4, yellow: 0, blue: 4, dilute: true, depth: 1.4, spotted: true });
    expect(w).toMatchObject({ hex: MASK_WHITE, family: "white", name: "snow-white", intensity: 0, spotted: false, trueBlue: false });
    const oat = col(0, 0, 0);
    expect(oat.hex).toBe(RYB_CORNERS["000"]);
    const dL = rgbToOklab(w.rgb)[0] - rgbToOklab(oat.rgb)[0];
    expect(dL).toBeGreaterThan(0.03); // mask-white is visibly brighter
  });

  it("full doses at strength 1 give exactly the corner colours", () => {
    expect(col(4, 0, 0).hex).toBe(RYB_CORNERS["100"]);
    expect(col(0, 4, 0).hex).toBe(RYB_CORNERS["010"]);
    expect(col(0, 0, 4).hex).toBe(RYB_CORNERS["001"]);
    expect(col(4, 4, 0).hex).toBe(RYB_CORNERS["110"]);
    expect(col(0, 4, 4).hex).toBe(RYB_CORNERS["011"]);
    expect(col(4, 0, 4).hex).toBe(RYB_CORNERS["101"]);
    expect(col(4, 4, 4).hex).toBe(RYB_CORNERS["111"]);
  });

  it("paint mixes like paint: red+yellow orange, yellow+blue green, red+blue purple", () => {
    expect(colourFamily(1, 1, 0)).toBe("orange");
    expect(colourFamily(0, 1, 1)).toBe("green");
    expect(colourFamily(1, 0, 1)).toBe("purple");
    expect(colourFamily(1, 0.4, 0)).toBe("red");
    expect(colourFamily(0.4, 1, 0)).toBe("yellow");
    expect(colourFamily(0.5, 0.5, 0.5)).toBe("taupe");
    expect(colourFamily(0.1, 0.1, 0.1)).toBe("oatmeal");
  });

  it("muted warm mixes are brown; muted cool mixes keep their hue", () => {
    expect(colourFamily(0.75, 0.75, 0.5)).toBe("brown");
    expect(colourFamily(0.75, 0.5, 0.5)).toBe("brown");
    expect(colourFamily(0.5, 0.5, 1)).toBe("blue"); // slate blue, not brown
    expect(colourFamily(0.5, 1, 0.75)).toBe("green");
  });

  it("dilution is lighter, halves intensity and uses pastel names", () => {
    const names: Record<string, string> = { red: "pink", orange: "peach", yellow: "lemon", green: "mint", blue: "sky", purple: "lilac" };
    const doses: Record<string, [number, number, number]> = { red: [4, 0, 0], orange: [4, 4, 0], yellow: [0, 4, 0], green: [0, 4, 4], blue: [0, 0, 4], purple: [4, 0, 4] };
    for (const f of HUE_FAMILIES) {
      const [r, y, b] = doses[f]!;
      const full = col(r, y, b), pale = col(r, y, b, 1, true);
      expect(full.family).toBe(f);
      expect(pale.family).toBe(f);
      expect(pale.name).toBe(names[f]);
      expect(pale.intensity).toBeCloseTo(full.intensity / 2, 9);
      expect(rgbToOklab(pale.rgb)[0]).toBeGreaterThan(rgbToOklab(full.rgb)[0]);
    }
  });

  it("gold: vivid yellow or orange with lustre ≥ 6", () => {
    expect(col(0, 4, 0, 1, false, { lustre: 7 })).toMatchObject({ gold: true, name: "gold", family: "yellow" });
    expect(col(0, 4, 0, 1, false, { lustre: 5 }).gold).toBe(false);
    expect(col(0, 2, 0, 1, false, { lustre: 9 }).gold).toBe(false);
    expect(col(0, 0, 4, 1, false, { lustre: 9 }).gold).toBe(false);
  });

  it("strength scales paint and caps at 1", () => {
    expect(paintAmount(2, 1)).toBe(0.5);
    expect(paintAmount(4, 1.4)).toBe(1);
    expect(paintAmount(1, 0.6)).toBeCloseTo(0.15);
  });

  it("intensity bands", () => {
    expect(intensityBand(0)).toBe("none");
    expect(intensityBand(0.25)).toBe("soft");
    expect(intensityBand(0.3)).toBe("bright");
    expect(intensityBand(0.6)).toBe("vivid");
  });

  it("reads colour input from sheep3 phenotypes", () => {
    expect(colourInputFromPhenotype({ white: "coloured", red: "2", yellow: "0", blue: "1", dilute: "pale", depth: 1.2, pattern: "spotted", lustre: 6 }))
      .toEqual({ white: false, red: 2, yellow: 0, blue: 1, dilute: true, depth: 1.2, spotted: true, lustre: 6 });
    expect(colourInputFromPhenotype({ white: "white", depth: 1 }).white).toBe(true);
  });
});

describe("woolColour: exhaustive over all 125 × 2 mixes and strengths", () => {
  const all: { r: number; y: number; b: number; d: number; dil: boolean }[] = [];
  for (let r = 0; r <= 4; r++) for (let y = 0; y <= 4; y++) for (let b = 0; b <= 4; b++)
    for (const d of [0.6, 0.8, 1, 1.2, 1.4]) for (const dil of [false, true]) all.push({ r, y, b, d, dil });

  it("every colour is a valid hex with consistent fields", () => {
    for (const { r, y, b, d, dil } of all) {
      const c = col(r, y, b, d, dil);
      expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(rgbToHex(hexToRgb(c.hex))).toBe(c.hex);
      const { red, yellow, blue } = c.amounts;
      const C = Math.max(red, yellow, blue) - Math.min(red, yellow, blue);
      expect(c.intensity).toBeCloseTo(C * (dil ? 0.5 : 1), 12);
      expect(c.intensity).toBeGreaterThanOrEqual(0);
      expect(c.intensity).toBeLessThanOrEqual(1);
      expect(c.family === "oatmeal" || c.family === "taupe" || c.family === "charcoal").toBe(C < NEUTRAL_C);
      expect(c.trueBlue).toBe(c.family === "blue" && c.intensity >= 0.6 && !dil);
    }
  });

  it("any net pigment (unequal doses) is named by a hue or brown", () => {
    for (const { r, y, b, d, dil } of all) {
      if (r === y && y === b) continue;
      const c = col(r, y, b, d, dil);
      const capped = [r, y, b].map((x) => Math.min(1, (x / 4) * d));
      if (Math.max(...capped) - Math.min(...capped) < 1e-9) continue; // both capped at 1
      if (Math.max(...capped) - Math.min(...capped) < NEUTRAL_C) continue; // near-caps
      expect(["oatmeal", "taupe", "charcoal", "white"]).not.toContain(c.family);
    }
  });

  it("the family matches the hue a person sees (OKLab hue angle of the swatch)", () => {
    // OKLab hue windows: the family boundaries (the 1:2 mixes) sit at about 39° (red|orange),
    // 72°, 115°, 204°, 286° and 355° (purple|red); each window reaches 6° past its boundaries.
    const hueDeg = (hex: string) => { const [, a, b] = rgbToOklab(hexToRgb(hex)); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; };
    const window: Record<string, [number, number]> = {
      red: [349, 45], orange: [33, 78], yellow: [66, 121], green: [109, 210], blue: [198, 292], purple: [280, 1],
    };
    const inWin = (h: number, [lo, hi]: [number, number]) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi);
    for (const { r, y, b, d, dil } of all) {
      const c = col(r, y, b, d, dil);
      const w = window[c.family];
      if (!w || c.intensity < 0.3) continue; // soft tints and neutrals are too pale to judge
      expect(inWin(hueDeg(c.hex), w), `${r}${y}${b} ×${d} ${dil ? "pale" : ""} ${c.family} ${c.hex} hue ${hueDeg(c.hex).toFixed(0)}`).toBe(true);
    }
  });

  it("the six vivid hues are clearly distinct (OKLab distance ≥ 0.1)", () => {
    const hexes = ["100", "110", "010", "011", "001", "101"].map((k) => rgbToOklab(hexToRgb(RYB_CORNERS[k as keyof typeof RYB_CORNERS])));
    for (let i = 0; i < hexes.length; i++) for (let j = i + 1; j < hexes.length; j++) {
      const [a, b] = [hexes[i]!, hexes[j]!];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(0.1);
    }
  });

  it("more dose of one pigment is never less colourful", () => {
    for (const c of ["r", "y", "b"] as const) for (const d of [0.6, 1, 1.4]) {
      let prev = -1;
      for (let k = 0; k <= 4; k++) {
        const w = col(c === "r" ? k : 0, c === "y" ? k : 0, c === "b" ? k : 0, d);
        expect(w.intensity).toBeGreaterThanOrEqual(prev);
        prev = w.intensity;
      }
    }
  });

  it("rybToRgb stays in gamut", () => {
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) for (let k = 0; k <= 10; k++) {
      for (const v of rybToRgb(i / 10, j / 10, k / 10)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255); }
    }
  });
});
