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
    name: "spring", groundTint: "#ffffff", foliageTint: "#ffffff", snow: 0,
    skyTop: "#a9d3ec", skyBottom: "#f7efe2",
    sun: "#fff4e6", sunI: 2.1, hemiSky: "#eaf3ff", hemiGround: "#c9d6b8", hemiI: 1.5,
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

export const WOOL_HEX = {
  white: "#f3eee2",
  black: "#3c3436",
  brown: "#8a5a36",
  // contract says #8fa8d8; nudged more saturated so blue still reads under warm summer/autumn light
  blue: "#7f9fe4",
  fawn: "#d9b98c",
} as const;

/** Pastel portrait backgrounds chosen to contrast with each wool colour. */
export const PORTRAIT_BG = {
  white: "#bfdcec",
  black: "#f5dcc4",
  brown: "#d4e9c6",
  blue: "#f7e2c2",
  fawn: "#cfdcf2",
} as const;
