// Style lab: the four art directions as data. Throwaway exploration (DESIGN-v3 §15 item 18a).
// Each direction drives the same procedural valley, sheep and HTML scenes with its own palette,
// materials, outline pass, terrain treatment and UI skin (lab.css, scoped by body.dir-X).

export type DirId = "A" | "B" | "C" | "D";

/** Colour roles every world builder asks for. */
export interface Palette {
  bg: string; // clear colour behind the world (paper, card, sky)
  bg2: string; // second stop for the sky gradient
  grass: string;
  grass2: string; // paddock grass (greener)
  flats: string; // creek flats
  tussock: string;
  hill: string;
  rock: string;
  snow: string;
  soil: string; // slab edge / creek bank
  water: string;
  road: string;
  bush: string;
  bush2: string;
  pohutukawa: string;
  kowhai: string;
  cabbage: string;
  fern: string;
  trunk: string;
  wall: string; // homestead weatherboards
  trim: string;
  roofIron: string; // corrugated iron grey
  roofRed: string; // woolshed red iron
  shedWall: string; // woolshed walls (red)
  fence: string;
  ink: string; // outline colour
  face: string; // sheep face and legs
  tent: string;
  tent2: string;
  bunting: string[];
}

export interface Direction {
  id: DirId;
  name: string;
  tagline: string;
  /** Short look notes for the contact sheet label tile. */
  notes: string[];
  palette: Palette;
  /** "lambert": soft painterly; "toon": hard bands; "standard": soft PBR; "plastic": glossy toy. */
  shading: "lambert" | "toon" | "standard" | "plastic";
  /** Faceted normals on buildings and trees. */
  flat: boolean;
  /** Inverted-hull outline width in world units (0 = none). */
  outline: number;
  /** Terrain: "fade" smooth mesh fading into the page; "slab" faceted with a cut earth edge; "tiles" bevelled toy tiles. */
  terrain: "fade" | "slab" | "tiles";
  fog: boolean;
  shadows: boolean;
  /** Geometry roundness: segment counts for cylinders/cones and ico detail for blobs. */
  seg: number;
  detail: number;
  /** Per-face shade jitter for a hand-made faceted look. */
  jitter: number;
  sheep: "ink" | "chunky" | "soft" | "clay";
  /** Light setup. */
  sun: { color: string; intensity: number; dir: [number, number, number] };
  hemi: { sky: string; ground: string; intensity: number };
  exposure: number;
}

const A: Direction = {
  id: "A",
  name: "Farm Diary",
  tagline: "Pencil, watercolour and washi tape",
  notes: ["ink outlines, wobbly pencil pass", "watercolour washes fade into the page", "notebook panels, tape, handwriting"],
  palette: {
    bg: "#f4ecd8", bg2: "#efe4c9",
    grass: "#b9cc8a", grass2: "#a6c47c", flats: "#c5d493", tussock: "#d8c089", hill: "#a9bd84", rock: "#b7ad9c", snow: "#f7f3ea",
    soil: "#c9ab85", water: "#8fbfd0", road: "#dcc9a3",
    bush: "#5f7e55", bush2: "#789a63", pohutukawa: "#c8484a", kowhai: "#e9c85a", cabbage: "#8aa566", fern: "#6d9a5d", trunk: "#8a6a50",
    wall: "#f3ead6", trim: "#6f8fa6", roofIron: "#a9b0b3", roofRed: "#c0574a", shedWall: "#c46a55", fence: "#9d8163",
    ink: "#3d3029", face: "#5a4a42", tent: "#f4efe3", tent2: "#d8736a", bunting: ["#d8736a", "#e9c85a", "#7fb0c9", "#9cc27f"],
  },
  shading: "lambert", flat: false, outline: 0.07, terrain: "fade", fog: false, shadows: false,
  seg: 7, detail: 1, jitter: 0.03, sheep: "ink",
  sun: { color: "#fff6e4", intensity: 1.6, dir: [-0.6, 1, 0.4] },
  hemi: { sky: "#fffaf0", ground: "#d9ccb0", intensity: 1.9 },
  exposure: 1.0,
};

const B: Direction = {
  id: "B",
  name: "Woolshed Woodcut",
  tagline: "Bold storybook shapes, rimu and red iron",
  notes: ["thick ink lines, two-tone toon light", "limited warm palette, cut-earth edge", "rimu woodgrain, corrugated iron, stamps"],
  palette: {
    bg: "#f1e2c2", bg2: "#e9cf9f",
    grass: "#8fa14a", grass2: "#7f9a3f", flats: "#a3ad55", tussock: "#d2a24c", hill: "#869a48", rock: "#8c7a62", snow: "#fbf4e4",
    soil: "#7b4a2c", water: "#3f7f95", road: "#d9b778",
    bush: "#2f4f2c", bush2: "#476b34", pohutukawa: "#b8232f", kowhai: "#e8b52a", cabbage: "#6f8b35", fern: "#3e6b35", trunk: "#5b3a24",
    wall: "#f3e4c2", trim: "#2f5a6b", roofIron: "#8e9696", roofRed: "#a8302a", shedWall: "#b83a2c", fence: "#6d4a2e",
    ink: "#2a1a14", face: "#2c211d", tent: "#f5ead0", tent2: "#b8232f", bunting: ["#b8232f", "#e8b52a", "#2f5a6b", "#f5ead0"],
  },
  shading: "toon", flat: true, outline: 0.16, terrain: "slab", fog: false, shadows: true,
  seg: 6, detail: 0, jitter: 0, sheep: "chunky",
  sun: { color: "#fff0d0", intensity: 2.6, dir: [-0.7, 1, 0.25] },
  hemi: { sky: "#ffe9c2", ground: "#6b5a3a", intensity: 1.0 },
  exposure: 1.0,
};

const C: Direction = {
  id: "C",
  name: "Misty Pastoral",
  tagline: "Soft watercolour light, felt and stitches",
  notes: ["smooth shading, soft shadows", "morning mist, layered hills", "stitched felt panels, airy and quiet"],
  palette: {
    bg: "#dfeaf0", bg2: "#f7efe2",
    grass: "#a9d08a", grass2: "#98c97c", flats: "#b8d894", tussock: "#e3cf9a", hill: "#a9c79b", rock: "#b9b4ae", snow: "#ffffff",
    soil: "#cdb89a", water: "#9cc9d9", road: "#eadcc0",
    bush: "#5f9470", bush2: "#83ad80", pohutukawa: "#e07a7c", kowhai: "#f1d36e", cabbage: "#9dbb86", fern: "#7fae84", trunk: "#a08670",
    wall: "#fbf6ec", trim: "#9bb6c9", roofIron: "#b9c3c9", roofRed: "#d98b7c", shedWall: "#dc9484", fence: "#c2a88c",
    ink: "#6b5a55", face: "#7a6660", tent: "#fffaf2", tent2: "#f0a9a0", bunting: ["#f0a9a0", "#f1d36e", "#a9cfe0", "#bcdca8"],
  },
  shading: "standard", flat: false, outline: 0, terrain: "fade", fog: true, shadows: true,
  seg: 14, detail: 2, jitter: 0, sheep: "soft",
  sun: { color: "#fff4e6", intensity: 2.1, dir: [-0.5, 0.9, 0.7] },
  hemi: { sky: "#eaf3ff", ground: "#c9d6b8", intensity: 1.5 },
  exposure: 1.05,
};

const D: Direction = {
  id: "D",
  name: "Toybox Diorama",
  tagline: "Chunky tiles, plasticine sheep, big buttons",
  notes: ["bevelled toy tiles on a thick slab", "glossy plastic, plasticine sheep", "chunky buttons and badges, hardly any words"],
  palette: {
    bg: "#8fd3f0", bg2: "#c9ecf7",
    grass: "#74c05a", grass2: "#62b64a", flats: "#8fca5e", tussock: "#eab84e", hill: "#5aa94c", rock: "#9c8f86", snow: "#ffffff",
    soil: "#a8683a", water: "#2fa6e8", road: "#f6cf6a",
    bush: "#2e8f52", bush2: "#46a95e", pohutukawa: "#ff3b4a", kowhai: "#ffcc1a", cabbage: "#6cc23a", fern: "#23a355", trunk: "#8b5a35",
    wall: "#fff3d6", trim: "#2f7fd8", roofIron: "#aab6c0", roofRed: "#ff4a3a", shedWall: "#ff5a40", fence: "#fff1d6",
    ink: "#23303a", face: "#4a3a3a", tent: "#ffffff", tent2: "#ff4a5a", bunting: ["#ff4a5a", "#ffcc1a", "#2fa6e8", "#5cbf3a"],
  },
  shading: "plastic", flat: false, outline: 0, terrain: "tiles", fog: false, shadows: true,
  seg: 16, detail: 3, jitter: 0, sheep: "clay",
  sun: { color: "#fff8ec", intensity: 2.8, dir: [-0.9, 0.9, 0.2] },
  hemi: { sky: "#e8f7ff", ground: "#6f8f60", intensity: 0.55 },
  exposure: 1.0,
};

export const DIRECTIONS: Record<DirId, Direction> = { A, B, C, D };
export const DIR_IDS: DirId[] = ["A", "B", "C", "D"];
