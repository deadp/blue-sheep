import { describe, expect, it } from "vitest";
import { kindsStillNeeded, median, shareWithin, statsBlock } from "./simstats.js";

describe("sim stats", () => {
  it("median", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(3);
    expect(median([])).toBeNaN();
  });
  it("shareWithin counts nulls and negatives as misses", () => {
    expect(shareWithin([10, 27, 28, null, -1], 27)).toBeCloseTo(0.4);
    expect(shareWithin([], 27)).toBe(0);
  });
  it("kindsStillNeeded counts each kind once, sold or in flight", () => {
    expect(kindsStillNeeded([], [], 3)).toBe(3);
    expect(kindsStillNeeded(["socks"], ["socks", "socks"], 3)).toBe(2);
    expect(kindsStillNeeded(["socks"], ["beanie", "mittens", "beanie"], 3)).toBe(0);
  });
  it("statsBlock on fake data", () => {
    const rs = [
      { actSeason: [0, 3, 6, 9, 12, 15], endSeason: 15, firstFantasy: 20 },
      { actSeason: [0, 5, 8, 11, 30, -1], endSeason: null, firstFantasy: 30 },
      { actSeason: [0, 4, 7, 10, 13, 40], endSeason: 40, firstFantasy: null },
    ];
    const b = statsBlock(rs, 60);
    expect(b[0]).toBe("stat,median_season,seeds_reached,seeds_total");
    expect(b).toContain("chapter_1,4,3,3");
    expect(b).toContain("chapter_5,40,2,3");
    expect(b).toContain("first_rare_fleece,30,2,3");
    expect(b).toContain("ending_within_60,0.67,2,3");
    expect(b).toContain("rare_fleece_by_27,0.33,1,3");
  });
});
