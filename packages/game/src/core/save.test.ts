import { describe, expect, it } from "vitest";
import { advanceSeason, deserialize, newGame, OldSaveError, serialize } from "./index.js";
import { planAll } from "./testkit.js";

describe("saves (v3 starts fresh: DESIGN-v3 §15 item 5)", () => {
  it("v3 round-trips exactly", () => {
    const g = newGame(90);
    expect(g.version).toBe(3);
    planAll(g); advanceSeason(g);
    expect(serialize(deserialize(serialize(g)))).toBe(serialize(g));
  });

  it("a loaded save plays on identically (determinism through a save)", () => {
    const g = newGame(92);
    planAll(g); advanceSeason(g);
    const a = deserialize(serialize(g)), b = deserialize(serialize(g));
    planAll(a); planAll(b); advanceSeason(a); advanceSeason(b);
    expect(serialize(a)).toBe(serialize(b));
  });

  it("refuses pre-v3 saves with OldSaveError (the game then starts a fresh farm) and unknown ones", () => {
    const old = JSON.parse(serialize(newGame(91))) as Record<string, unknown>;
    for (const v of [1, 2]) {
      old["version"] = v;
      expect(() => deserialize(JSON.stringify(old))).toThrow(OldSaveError);
    }
    expect(() => deserialize(JSON.stringify({ version: 7 }))).toThrow(/unknown version/);
  });
});
