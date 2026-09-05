/**
 * Procedural pixel art. Every texture is drawn at runtime onto canvas textures
 * from a character grid, so sheep look is a pure function of phenotype.
 */
import Phaser from "phaser";
import type { Sheep } from "../state.js";

export type Palette = Record<string, string | null>;

export const TILE = 16;

/** Draw a character grid onto a 2D context at (ox, oy). Unknown chars are transparent. */
export function blit(ctx: CanvasRenderingContext2D, rows: string[], pal: Palette, ox: number, oy: number): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]!];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

// --- Sheep ---------------------------------------------------------------
// 16 × 14, facing right. O outline, W wool, w wool shade, h highlight, S spot,
// F face, E eye, L leg, H horn, C crimp bumps (only for curly fleece).
const SHEEP_BODY = [
  "..C..CC..C......",
  "...OOOOOOOO..H.H",
  "..OhhhhhhhhOOHOH",
  ".OhhWWWWWWWhOOOO",
  "OhWWWWSWWWWWOFFO",
  "OWWWWWWWWWWWOFEO",
  "OWWSWWWWWSWWOFFO",
  "OWWWWWWWWWWWOOFO",
  "OwWWWWSWWWWwO.O.",
  ".OwwwwwwwwwwO...",
  "..OOwwwwwwOO....",
];
const LEGS_A = ["...OLLO.OLLO....", "...OLLO.OLLO....", "...OOOO.OOOO...."];
const LEGS_B = ["..OLLO...OLLO...", ".OLLO.....OLLO..", ".OOOO.....OOOO.."];

interface WoolColours { W: string; w: string; h: string; F: string; S: string }
const WOOL: Record<string, WoolColours> = {
  white: { W: "#f3eee2", w: "#d9d1bf", h: "#ffffff", F: "#4a3b36", S: "#b9ad99" },
  black: { W: "#3c3436", w: "#27222a", h: "#5a5054", F: "#1c1719", S: "#ece6da" },
  brown: { W: "#8a5a36", w: "#63401f", h: "#a8744a", F: "#3a2416", S: "#ece6da" },
  blue:  { W: "#8fa8d8", w: "#6b84b4", h: "#b7c8ec", F: "#3a4664", S: "#ece6da" },
  fawn:  { W: "#d9b98c", w: "#b8956a", h: "#efd7b3", F: "#5b4630", S: "#f7f1e6" },
};
const OUTLINE = "#2b2224";

export function sheepPalette(s: Sheep): Palette {
  const colour = String(s.phenotype["colour"]);
  const c = WOOL[colour] ?? WOOL["white"]!;
  const fine = Number(s.phenotype["fineness"]) < 23; // very fine wool looks softer
  const curly = Number(s.phenotype["crimp"]) >= 6;
  return {
    O: OUTLINE, W: c.W, w: c.w, h: fine ? c.h : c.W, F: c.F, E: "#fbfbf6", L: c.F,
    S: s.phenotype["pattern"] === "spotted" ? c.S : c.W,
    H: s.phenotype["horns"] === "horned" ? "#d8c08e" : null,
    C: curly ? OUTLINE : null,
  };
}

export function sheepTextureKey(s: Sheep): string {
  return `sheep-${s.id}`;
}

export function ensureSheepTexture(scene: Phaser.Scene, s: Sheep): string {
  const key = sheepTextureKey(s);
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, 32, 14)!;
  const ctx = tex.context;
  const pal = sheepPalette(s);
  blit(ctx, [...SHEEP_BODY, ...LEGS_A], pal, 0, 0);
  blit(ctx, [...SHEEP_BODY, ...LEGS_B], pal, 16, 0);
  tex.add("a", 0, 0, 0, 16, 14);
  tex.add("b", 0, 16, 0, 16, 14);
  tex.refresh();
  return key;
}

// --- People --------------------------------------------------------------
// 12 × 18. A hat, K skin, Y eye, T shirt, P pants, B boots, O outline.
const PERSON_DOWN = [
  "...OOOOOO...",
  "..OAAAAAAO..",
  ".OAAAAAAAAO.",
  ".OOOOOOOOOO.",
  "..OKKKKKKO..",
  "..OKYKKYKO..",
  "..OKKKKKKO..",
  "...OKKKKO...",
  "..OOTTTTOO..",
  ".OTOTTTTOTO.",
  ".OTOTTTTOTO.",
  ".OKOTTTTOKO.",
  "..OOTTTTOO..",
  "...OPPPPO...",
  "...OPOOPO...",
  "...OPO.OPO..",
  "...OBO.OBO..",
  "...OOO.OOO..",
];
const PERSON_DOWN_B = [...PERSON_DOWN.slice(0, 13), "...OPPPPO...", "...OPOOPO...", "..OPO...OPO.", "..OBO...OBO.", "..OOO...OOO."];
const PERSON_SIDE = [
  "...OOOOOO...",
  "..OAAAAAAO..",
  ".OAAAAAAAAO.",
  ".OOOOOOOOOO.",
  "...OKKKKKO..",
  "...OKKKYKO..",
  "...OKKKKKO..",
  "....OKKKO...",
  "...OOTTTOO..",
  "...OTTTTTO..",
  "...OTTTTTO..",
  "...OTTKTTO..",
  "...OOTTTOO..",
  "....OPPPO...",
  "....OPPPO...",
  "....OPOPO...",
  "....OBOBO...",
  "....OOOOO...",
];
const PERSON_SIDE_B = [...PERSON_SIDE.slice(0, 13), "....OPPPO...", "...OPPOPPO..", "..OPO...OPO.", "..OBO...OBO.", "..OOO...OOO."];

export function ensurePersonTexture(scene: Phaser.Scene, key: string, pal: Palette): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, 48, 18)!;
  const ctx = tex.context;
  const full = { O: OUTLINE, ...pal };
  blit(ctx, PERSON_DOWN, full, 0, 0);
  blit(ctx, PERSON_DOWN_B, full, 12, 0);
  blit(ctx, PERSON_SIDE, full, 24, 0);
  blit(ctx, PERSON_SIDE_B, full, 36, 0);
  tex.add("down-a", 0, 0, 0, 12, 18);
  tex.add("down-b", 0, 12, 0, 12, 18);
  tex.add("side-a", 0, 24, 0, 12, 18);
  tex.add("side-b", 0, 36, 0, 12, 18);
  tex.refresh();
  return key;
}

export const FARMER_PAL: Palette = { A: "#c98a4b", K: "#f2c9a0", Y: "#2b2224", T: "#6f9c76", P: "#4b5a7a", B: "#5a3d2b" };
export const TRADER_PAL: Palette = { A: "#8a5a9c", K: "#e9b98c", Y: "#2b2224", T: "#c96a5b", P: "#3d3d3d", B: "#2b2224" };

// --- Tiles ---------------------------------------------------------------
export const T = {
  GRASS: 0, GRASS2: 1, FLOWER: 2, DIRT: 3, FENCE: 4, WATER: 5, WALL: 6, ROOF: 7, BOARD: 8, BED: 9,
  FLOOR: 10, HEDGE: 11, CART: 12, GATE: 13, FENCE_V: 14, DOOR: 15, POST: 16,
} as const;
export const SOLID = [T.FENCE, T.WATER, T.WALL, T.ROOF, T.HEDGE, T.CART, T.FENCE_V, T.BOARD, T.BED, T.POST];

export function ensureTilesTexture(scene: Phaser.Scene): string {
  const key = "tiles";
  if (scene.textures.exists(key)) return key;
  const n = 17;
  const tex = scene.textures.createCanvas(key, n * TILE, TILE)!;
  const ctx = tex.context;
  const at = (i: number) => i * TILE;
  const fill = (i: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(at(i), 0, TILE, TILE); };
  const px = (i: number, x: number, y: number, c: string, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(at(i) + x, y, w, h); };
  const grass = "#8fbf6a", grassDark = "#7aac58", dirt = "#c9a97a";

  fill(T.GRASS, grass); px(T.GRASS, 3, 4, grassDark); px(T.GRASS, 11, 9, grassDark); px(T.GRASS, 6, 12, grassDark);
  fill(T.GRASS2, grass); px(T.GRASS2, 8, 3, grassDark, 1, 2); px(T.GRASS2, 2, 10, grassDark, 2, 1); px(T.GRASS2, 13, 13, grassDark);
  fill(T.FLOWER, grass); px(T.FLOWER, 4, 5, "#f2d54b", 2, 2); px(T.FLOWER, 10, 9, "#f0a0b8", 2, 2); px(T.FLOWER, 5, 7, grassDark); px(T.FLOWER, 11, 11, grassDark);
  fill(T.DIRT, dirt); px(T.DIRT, 2, 3, "#b8956a", 2, 1); px(T.DIRT, 9, 10, "#b8956a", 3, 1); px(T.DIRT, 12, 5, "#d9bb8f");
  // horizontal fence: two rails + posts
  fill(T.FENCE, grass); px(T.FENCE, 0, 5, "#8a5a36", 16, 2); px(T.FENCE, 0, 10, "#8a5a36", 16, 2); px(T.FENCE, 2, 3, "#63401f", 2, 11); px(T.FENCE, 12, 3, "#63401f", 2, 11);
  fill(T.FENCE_V, grass); px(T.FENCE_V, 6, 0, "#8a5a36", 2, 16); px(T.FENCE_V, 10, 0, "#8a5a36", 2, 16); px(T.FENCE_V, 5, 2, "#63401f", 8, 2); px(T.FENCE_V, 5, 11, "#63401f", 8, 2);
  fill(T.POST, grass); px(T.POST, 6, 2, "#63401f", 5, 12);
  fill(T.WATER, "#7fb2d8"); px(T.WATER, 3, 4, "#a9d0ea", 4, 1); px(T.WATER, 9, 10, "#a9d0ea", 4, 1);
  fill(T.WALL, "#d8b98a"); px(T.WALL, 0, 0, "#b8956a", 16, 1); px(T.WALL, 0, 8, "#b8956a", 16, 1); px(T.WALL, 8, 0, "#b8956a", 1, 8); px(T.WALL, 4, 8, "#b8956a", 1, 8);
  fill(T.ROOF, "#b86a5b"); px(T.ROOF, 0, 4, "#9a5448", 16, 1); px(T.ROOF, 0, 9, "#9a5448", 16, 1); px(T.ROOF, 0, 14, "#9a5448", 16, 1);
  fill(T.FLOOR, "#e6d2ad"); px(T.FLOOR, 0, 7, "#d3bd95", 16, 1); px(T.FLOOR, 7, 0, "#d3bd95", 1, 16);
  fill(T.BOARD, "#e6d2ad"); px(T.BOARD, 1, 1, "#63401f", 14, 12); px(T.BOARD, 2, 2, "#d9c9a0", 12, 10); px(T.BOARD, 4, 4, "#f2d54b", 3, 3); px(T.BOARD, 9, 5, "#f0a0b8", 3, 3); px(T.BOARD, 5, 8, "#a9d0ea", 3, 3);
  fill(T.BED, "#e6d2ad"); px(T.BED, 2, 1, "#63401f", 12, 14); px(T.BED, 3, 2, "#f3eee2", 10, 4); px(T.BED, 3, 6, "#c96a5b", 10, 8);
  fill(T.HEDGE, "#5f8f48"); px(T.HEDGE, 2, 2, "#4c7a3a", 3, 3); px(T.HEDGE, 9, 6, "#4c7a3a", 4, 3); px(T.HEDGE, 4, 10, "#7aac58", 3, 3); px(T.HEDGE, 11, 11, "#7aac58", 2, 2);
  fill(T.CART, grass); px(T.CART, 1, 5, "#63401f", 14, 6); px(T.CART, 2, 6, "#8a5a36", 12, 4); px(T.CART, 3, 11, "#2b2224", 4, 4); px(T.CART, 9, 11, "#2b2224", 4, 4); px(T.CART, 3, 2, "#f3eee2", 4, 3); px(T.CART, 8, 2, "#8fa8d8", 4, 3);
  fill(T.GATE, dirt); px(T.GATE, 2, 3, "#63401f", 2, 11); px(T.GATE, 12, 3, "#63401f", 2, 11);
  fill(T.DOOR, "#d8b98a"); px(T.DOOR, 4, 0, "#63401f", 8, 16); px(T.DOOR, 5, 1, "#8a5a36", 6, 14); px(T.DOOR, 9, 8, "#f2d54b");
  for (let i = 0; i < n; i++) tex.add(i, 0, at(i), 0, TILE, TILE);
  tex.refresh();
  return key;
}
