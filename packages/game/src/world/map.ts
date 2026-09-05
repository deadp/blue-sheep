import { T } from "../pixel/art.js";

export const MAP_W = 48;
export const MAP_H = 36;

export interface Rect { x: number; y: number; w: number; h: number }
export type ZoneId = "paddock" | "penA" | "penB" | "market";

/** Interior rectangles (tile units) where sheep may wander. */
export const ZONES: Record<ZoneId, Rect> = {
  paddock: { x: 13, y: 3, w: 17, h: 17 },
  penA: { x: 34, y: 3, w: 11, h: 6 },
  penB: { x: 34, y: 13, w: 11, h: 6 },
  market: { x: 4, y: 25, w: 7, h: 6 },
};
export const PENS: ZoneId[] = ["penA", "penB"];
export const ZONE_LABEL: Record<ZoneId, string> = { paddock: "Paddock", penA: "North pen", penB: "South pen", market: "Market pen" };

/** Points of interest (tile units). */
export const POI = {
  bed: { x: 3, y: 5 },
  board: { x: 36, y: 26 },
  cart: { x: 13, y: 28 },
  trader: { x: 13, y: 26 },
  farmerStart: { x: 6, y: 10 },
};

export interface FarmMap { ground: number[][]; objects: number[][] }

export function buildMap(seed = 7): FarmMap {
  let a = seed >>> 0;
  const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ground: number[][] = Array.from({ length: MAP_H }, () =>
    Array.from({ length: MAP_W }, () => (rnd() < 0.06 ? T.FLOWER : rnd() < 0.5 ? T.GRASS : T.GRASS2)),
  );
  const objects: number[][] = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(-1));
  const setG = (x: number, y: number, t: number) => { if (ground[y]) ground[y]![x] = t; };
  const setO = (x: number, y: number, t: number) => { if (objects[y]) objects[y]![x] = t; };

  // Hedge border.
  for (let x = 0; x < MAP_W; x++) { setO(x, 0, T.HEDGE); setO(x, MAP_H - 1, T.HEDGE); }
  for (let y = 0; y < MAP_H; y++) { setO(0, y, T.HEDGE); setO(MAP_W - 1, y, T.HEDGE); }

  // Fenced rectangle around a zone with gates (tile coords on the fence line).
  const fence = (z: Rect, gates: { x: number; y: number }[]) => {
    const x0 = z.x - 1, y0 = z.y - 1, x1 = z.x + z.w, y1 = z.y + z.h;
    for (let x = x0; x <= x1; x++) { setO(x, y0, T.FENCE); setO(x, y1, T.FENCE); }
    for (let y = y0; y <= y1; y++) { setO(x0, y, T.FENCE_V); setO(x1, y, T.FENCE_V); }
    for (const c of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) setO(c[0], c[1], T.POST);
    for (const g of gates) { setO(g.x, g.y, -1); setG(g.x, g.y, T.GATE); }
    for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) if (rnd() < 0.05) setG(x, y, T.DIRT);
  };
  fence(ZONES.paddock, [{ x: 12, y: 11 }, { x: 21, y: 20 }]);
  fence(ZONES.penA, [{ x: 33, y: 5 }]);
  fence(ZONES.penB, [{ x: 33, y: 15 }]);
  fence(ZONES.market, [{ x: 11, y: 27 }]);

  // House: roof rows 2-3, walls, floor inside, door bottom.
  for (let x = 2; x <= 9; x++) { setO(x, 2, T.ROOF); setO(x, 3, T.ROOF); setO(x, 4, T.WALL); setO(x, 7, T.WALL); }
  for (let y = 4; y <= 7; y++) { setO(2, y, T.WALL); setO(9, y, T.WALL); }
  for (let y = 5; y <= 6; y++) for (let x = 3; x <= 8; x++) setG(x, y, T.FLOOR);
  setO(5, 7, -1); setG(5, 7, T.DOOR);
  setO(POI.bed.x, POI.bed.y, T.BED);

  // Shed with the board.
  for (let x = 34; x <= 44; x++) { setO(x, 23, T.ROOF); setO(x, 24, T.ROOF); setO(x, 25, T.WALL); setO(x, 28, T.WALL); }
  for (let y = 25; y <= 28; y++) { setO(34, y, T.WALL); setO(44, y, T.WALL); }
  for (let y = 26; y <= 27; y++) for (let x = 35; x <= 43; x++) setG(x, y, T.FLOOR);
  setO(39, 28, -1); setG(39, 28, T.DOOR);
  setO(POI.board.x, POI.board.y, T.BOARD);

  // Pond.
  for (let y = 27; y <= 30; y++) for (let x = 19; x <= 24; x++) setO(x, y, T.WATER);
  for (const [x, y] of [[18, 27], [25, 30], [18, 30], [25, 27]] as const) setO(x, y, -1);

  // Market cart.
  setO(POI.cart.x, POI.cart.y, T.CART);

  // Paths.
  for (let y = 8; y <= 11; y++) setG(5, y, T.DIRT);
  for (let x = 5; x <= 12; x++) setG(x, 11, T.DIRT);
  for (let x = 30; x <= 33; x++) { setG(x, 5, T.DIRT); setG(x, 15, T.DIRT); }
  for (let y = 21; y <= 27; y++) setG(21, y, T.DIRT);
  for (let x = 12; x <= 21; x++) setG(x, 27, T.DIRT);
  for (let y = 27; y <= 33; y++) setG(31, y, T.DIRT);
  for (let x = 21; x <= 39; x++) setG(x, 32, T.DIRT);
  for (let y = 29; y <= 32; y++) setG(39, y, T.DIRT);
  return { ground, objects };
}

export function zoneOfTile(tx: number, ty: number): ZoneId | null {
  for (const [id, r] of Object.entries(ZONES) as [ZoneId, Rect][]) {
    if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return id;
  }
  return null;
}
