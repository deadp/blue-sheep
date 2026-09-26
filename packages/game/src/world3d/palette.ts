// Pastel palette and per-season lighting.

export interface SeasonLook {
  name: string;
  grass: string;
  meadow: string;
  foliage: string;
  foliage2: string;
  skyTop: string;
  skyBottom: string;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  pond: string;
  particles: string[];
}

export const SEASONS: readonly SeasonLook[] = [
  {
    name: "spring",
    grass: "#a9dc8c", meadow: "#9fd07e", foliage: "#8fd27a", foliage2: "#b7e39a",
    skyTop: "#9fd3ef", skyBottom: "#f4f1dc",
    sun: "#fff3df", sunI: 2.3, hemiSky: "#e6f4ff", hemiGround: "#a9c98f", hemiI: 1.25,
    pond: "#8ccbe6", particles: ["#f8c3d8", "#fbe0ea", "#ffffff"],
  },
  {
    name: "summer",
    grass: "#b9d97a", meadow: "#c8d680", foliage: "#6fbb5c", foliage2: "#8fcb66",
    skyTop: "#8ccbf0", skyBottom: "#fff0cf",
    sun: "#ffe5b5", sunI: 2.7, hemiSky: "#fff1d6", hemiGround: "#b9c47a", hemiI: 1.2,
    pond: "#7fc3e8", particles: [],
  },
  {
    name: "autumn",
    grass: "#bccd86", meadow: "#d3c27c", foliage: "#ee9a4c", foliage2: "#e0673f",
    skyTop: "#a9c7e4", skyBottom: "#fbe3c7",
    sun: "#ffe0bd", sunI: 2.3, hemiSky: "#f2e8e0", hemiGround: "#b7a88a", hemiI: 1.2,
    pond: "#86b9d4", particles: ["#ee9a4c", "#e0673f", "#f2c257"],
  },
  {
    name: "winter",
    grass: "#eef3f6", meadow: "#e3eaef", foliage: "#7f9c8e", foliage2: "#95ad9f",
    skyTop: "#b9cde3", skyBottom: "#eef1f6",
    sun: "#dfe9ff", sunI: 1.9, hemiSky: "#e2ecff", hemiGround: "#c4d0dc", hemiI: 1.35,
    pond: "#cfe6f2", particles: ["#ffffff"],
  },
];

export const NIGHT = {
  skyTop: "#0e1433", skyBottom: "#2c3566",
  sun: "#7d8cc9", sunI: 0.35, hemiSky: "#5d6fae", hemiGround: "#2a3050", hemiI: 0.55,
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
