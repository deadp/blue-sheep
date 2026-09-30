import { describe, expect, it } from "vitest";
import { RECHECK_BOOTS, RECHECK_MS, recallLite, rememberLite } from "./autolite.js";

describe("auto-lite memory", () => {
  it("starts lite after a remembered decision and counts boots", () => {
    const t0 = 1_000_000;
    let raw: string | null = rememberLite(t0);
    for (let i = 1; i < RECHECK_BOOTS; i++) {
      const r = recallLite(raw, t0 + i * 1000);
      expect(r.lite).toBe(true);
      raw = r.store;
    }
    // the tenth boot re-checks: no memory, auto measures again
    expect(recallLite(raw, t0 + 99_000)).toEqual({ lite: false, store: null });
  });

  it("re-checks after a week, and ignores junk", () => {
    const t0 = 5_000;
    expect(recallLite(rememberLite(t0), t0 + RECHECK_MS).lite).toBe(false);
    expect(recallLite(rememberLite(t0), t0 + RECHECK_MS - 1).lite).toBe(true);
    expect(recallLite("not json", t0)).toEqual({ lite: false, store: null });
    expect(recallLite(null, t0)).toEqual({ lite: false, store: null });
  });
});
