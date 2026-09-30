// Seasonal light and palette for the valley, wool colours and portrait backgrounds.

export interface SeasonLook {
  name: string;
  /** Multiplies the baked ground and grass colours (a golden summer, a russet autumn). */
  groundTint: string;
  foliageTint: string;
  /** Snow settling on everything that faces up (0–1). */
  snow: number;
  skyTop: string;
  skyBottom: string;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  particles: string[];
}

/** Soft pastoral light (round 3 "Misty Pastoral", without the mist), one look per season. */
export const SEASONS: readonly SeasonLook[] = [
  {
    name: "spring", groundTint: "#fffcf2", foliageTint: "#fffaf0", snow: 0,
    skyTop: "#a9d3ec", skyBottom: "#fbf0de",
    // warm late-morning sun, a soft sky and a warm bounce off the pasture
    sun: "#ffecd2", sunI: 2.15, hemiSky: "#edf3fb", hemiGround: "#d6d3ae", hemiI: 1.5,
    particles: ["#f8c3d8", "#fbe0ea", "#ffffff"],
  },
  {
    name: "summer", groundTint: "#fbf0cf", foliageTint: "#f3f1d8", snow: 0,
    skyTop: "#96c9ec", skyBottom: "#fff0d6",
    sun: "#ffebc8", sunI: 2.35, hemiSky: "#fff4de", hemiGround: "#d2d2a6", hemiI: 1.45,
    particles: [],
  },
  {
    name: "autumn", groundTint: "#f4e2c0", foliageTint: "#f6d7a6", snow: 0,
    skyTop: "#b1c9e2", skyBottom: "#f8e2c8",
    sun: "#ffe2c2", sunI: 2.0, hemiSky: "#f4e9e0", hemiGround: "#cdbd9a", hemiI: 1.45,
    particles: ["#ee9a4c", "#e0673f", "#f2c257"],
  },
  {
    name: "winter", groundTint: "#e9eef2", foliageTint: "#dfe7e6", snow: 0.82,
    skyTop: "#bccde2", skyBottom: "#eef1f6",
    sun: "#e6eeff", sunI: 1.8, hemiSky: "#e6eeff", hemiGround: "#cdd6e0", hemiI: 1.6,
    particles: ["#ffffff"],
  },
];

export const NIGHT = {
  skyTop: "#0e1433", skyBottom: "#2c3566",
  sun: "#7d8cc9", sunI: 0.22, hemiSky: "#5d6fae", hemiGround: "#2a3050", hemiI: 0.45,
};

/** Mask-white wool (a cool bright white, distinct from warm oatmeal). Other wool comes as a hex from the colour model. */
export const WHITE_WOOL = "#FAFAF7";

/** Pastel portrait backgrounds chosen to contrast with each colour family. */
export const PORTRAIT_BG: Record<string, string> = {
  white: "#bfdcec", oatmeal: "#cfdcf2", taupe: "#d4e9c6", charcoal: "#f5dcc4", brown: "#d4e9c6",
  red: "#cfe8dc", orange: "#cddcf2", yellow: "#d8d4f0", green: "#f2d8de", blue: "#f7e2c2", purple: "#e3eecb",
};

/** A sheep's wool hex (falls back to mask-white for a malformed snapshot). */
export function woolHex(w: { wool?: string }): string {
  return typeof w.wool === "string" && /^#[0-9a-fA-F]{6}$/.test(w.wool) ? w.wool : WHITE_WOOL;
}
