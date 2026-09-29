// The dressing pass's ground rules (DESIGN-v3 §15 item 27): the farm floor rolls only gently, stays flat under
// buildings and pens (props there were built at y = 0), and the paddock's obstacles leave the gate and the flock
// room to move.
import { describe, expect, it } from "vitest";
import { AREAS, FLAT_RECTS, OBSTACLES, SOLIDS, groundY, softRect, swell } from "./valley.js";

describe("the rolling farm floor", () => {
  it("is flat (within 2 cm) inside every flat rectangle", () => {
    for (const r of FLAT_RECTS) {
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
        // 1.6 units in from the edges (the swell blends back in over 3.2 units round each)
        const u = r[0] + 1.6 + ((r[1] - r[0] - 3.2) * i) / 8, v = r[2] + 1.6 + ((r[3] - r[2] - 3.2) * j) / 8;
        expect(Math.abs(swell(u, v)), `swell at ${u.toFixed(1)}, ${v.toFixed(1)}`).toBeLessThan(0.02);
      }
    }
  });
  it("rolls gently in the home paddock: under 0.8 high and slopes under 0.25", () => {
    const [u0, u1, v0, v1] = AREAS.home.rect;
    let lo = Infinity, hi = -Infinity, steep = 0;
    for (let u = u0; u <= u1; u += 0.5) for (let v = v0; v <= v1; v += 0.5) {
      const h = groundY(u, v);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
      steep = Math.max(steep, Math.abs(groundY(u + 0.25, v) - h) / 0.25, Math.abs(groundY(u, v + 0.25) - h) / 0.25);
    }
    expect(hi).toBeLessThan(0.8);
    expect(lo).toBeGreaterThan(-0.8);
    expect(hi - lo, "it does roll").toBeGreaterThan(0.15);
    expect(steep).toBeLessThan(0.25);
  });
});

describe("paddock obstacles", () => {
  it("sit inside the home paddock, clear of its gate and of each other", () => {
    const [u0, u1, v0, v1] = AREAS.home.rect;
    const gate: [number, number] = [u1, AREAS.home.gate.at];
    for (const [u, v, r] of OBSTACLES) {
      expect(u - r > u0 && u + r < u1 && v - r > v0 && v + r < v1, `obstacle at ${u}, ${v} inside the paddock`).toBe(true);
      expect(Math.hypot(u - gate[0], v - gate[1]), `obstacle at ${u}, ${v} clear of the gate`).toBeGreaterThan(r + 2.5);
    }
    // together they take a small share of the paddock
    const area = OBSTACLES.reduce((a, [, , r]) => a + Math.PI * r * r, 0);
    expect(area / ((u1 - u0) * (v1 - v0))).toBeLessThan(0.06);
  });
  it("new props' solids stay out of the paddocks", () => {
    for (const s of SOLIDS) for (const id of ["home", "flats"] as const) {
      const cu = (s[0] + s[1]) / 2, cv = (s[2] + s[3]) / 2;
      expect(softRect(cu, cv, AREAS[id].rect, 0.01), `solid ${s.join(",")} not in ${id}`).toBeLessThan(0.5);
    }
  });
});
