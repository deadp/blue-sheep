/**
 * Wool colour from pigment (docs/DESIGN-v3.md §2.2). Pure functions, no DOM.
 *
 * Pigment doses (0–4 per channel) times colour strength give paint amounts ρ, γ, β in 0..1.
 * Those mix like paint: trilinear interpolation in an RYB cube (Gossett–Chen), so red + yellow =
 * orange, yellow + blue = green, red + blue = purple, and all three = brown or charcoal.
 */

export type RGB = [number, number, number];

export type NeutralFamily = "white" | "oatmeal" | "taupe" | "charcoal" | "brown";
export type HueFamily = "red" | "orange" | "yellow" | "green" | "blue" | "purple";
export type ColourFamily = NeutralFamily | HueFamily;

export const HUE_FAMILIES: HueFamily[] = ["red", "orange", "yellow", "green", "blue", "purple"];
export const NEUTRAL_FAMILIES: NeutralFamily[] = ["white", "oatmeal", "taupe", "charcoal", "brown"];

/** What a sheep's colour genes and strength say (phenotype-level; no genome needed). */
export interface ColourInput {
  /** `W` present: the white mask hides every pigment. */
  white: boolean;
  red: number;
  yellow: number;
  blue: number;
  /** `d/d`: pastel. */
  dilute: boolean;
  /** Colour strength ×0.6–1.4 (1 = average). */
  depth: number;
  spotted?: boolean;
  /** Lustre 0–10, for the named "gold" special. */
  lustre?: number;
}

export interface WoolColour {
  hex: string;
  rgb: RGB;
  /** Hue 0–360, saturation and lightness 0–1. */
  hsl: [number, number, number];
  family: ColourFamily;
  /** Display word: the family, or its pastel name when dilute (pink, sky…), "snow-white", "gold". */
  name: string;
  /** Colourfulness 0–1: (max − min) of the paint amounts, halved when dilute. */
  intensity: number;
  dilute: boolean;
  spotted: boolean;
  /** Paint amounts ρ, γ, β after strength, each 0..1. */
  amounts: { red: number; yellow: number; blue: number };
  /** The blue milestone: family blue, intensity ≥ 0.6, not dilute. */
  trueBlue: boolean;
  /** Named special: yellow or orange, intensity ≥ 0.6, lustre ≥ 6. */
  gold: boolean;
}

/** Mask-white: a cool, bright white, visibly different from warm oatmeal. */
export const MASK_WHITE = "#FAFAF7";

/**
 * RYB corner colours, indexed by which pigments are fully present. The six hue corners are the
 * fully saturated wool colours; "000" is natural oatmeal and "111" charcoal. Tuned by eye on the
 * palette sheet (packages/genetics/scripts/palette.ts).
 */
export const RYB_CORNERS: Record<"000" | "100" | "010" | "001" | "110" | "011" | "101" | "111", string> = {
  "000": "#EDE3CF", // oatmeal (natural, unpigmented)
  "100": "#C8322F", // red
  "010": "#F2C230", // yellow
  "001": "#2F5DA8", // blue
  "110": "#E07A2A", // orange
  "011": "#3E8E4A", // green
  "101": "#6E3A8E", // purple
  "111": "#2B2724", // charcoal
};

/** The natural-grey axis (all three pigments equal) passes through a warm taupe, not a cold grey. */
export const TAUPE = "#8F7B69";

/** How far `d/d` pulls the colour toward white. */
export const DILUTE_MIX = 0.45;

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) * 60;
  else if (max === G) h = ((B - R) / d + 2) * 60;
  else h = ((R - G) / d + 4) * 60;
  return [h, s, l];
}

// --- OKLab (Björn Ottosson), for perceptually even blends -------------------
type Lab = [number, number, number];
const toLinear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);

export function rgbToOklab([r8, g8, b8]: RGB): Lab {
  const r = toLinear(r8), g = toLinear(g8), b = toLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, A, B]: Lab): RGB {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ].map((v) => Math.max(0, Math.min(255, v))) as RGB;
}

const lerpLab = (x: Lab, y: Lab, t: number): Lab => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];

const CORNER_LAB = Object.fromEntries(Object.entries(RYB_CORNERS).map(([k, v]) => [k, rgbToOklab(hexToRgb(v))])) as Record<keyof typeof RYB_CORNERS, Lab>;
const TAUPE_LAB = rgbToOklab(hexToRgb(TAUPE));

/** Natural colour for a shared pigment amount m: oatmeal → warm taupe → charcoal. */
function greyAxis(m: number): Lab {
  return m <= 0.5 ? lerpLab(CORNER_LAB["000"], TAUPE_LAB, m / 0.5) : lerpLab(TAUPE_LAB, CORNER_LAB["111"], (m - 0.5) / 0.5);
}

/** The fully saturated hue for a chromatic mix (min already removed, so one part is 0). */
function hueOf(r: number, y: number, b: number): Lab {
  const k = Math.max(r, y, b);
  const [R, Y, B] = [r / k, y / k, b / k];
  // One component is 1, one is 0: the point sits on an edge between two hue corners.
  if (B === 0) return R >= Y ? lerpLab(CORNER_LAB["100"], CORNER_LAB["110"], Y) : lerpLab(CORNER_LAB["010"], CORNER_LAB["110"], R);
  if (R === 0) return Y >= B ? lerpLab(CORNER_LAB["010"], CORNER_LAB["011"], B) : lerpLab(CORNER_LAB["001"], CORNER_LAB["011"], Y);
  return B >= R ? lerpLab(CORNER_LAB["001"], CORNER_LAB["101"], R) : lerpLab(CORNER_LAB["100"], CORNER_LAB["101"], B);
}

/**
 * Paint-mix: RYB amounts (each 0..1) → sRGB.
 *
 * The shared part m = min(ρ, γ, β) is natural colour (oatmeal → taupe → charcoal, like mixing all
 * three paints). The rest is the hue: at most two pigments, mixed along the RYB colour wheel (red,
 * orange, yellow, green, blue, purple). The hue is laid over the natural colour by its strength
 * C = max − min in OKLCH (lightness and chroma blend, hue taken from the pigment), so a little
 * pigment reads as a pale tint of its hue rather than going grey.
 */
export function rybToRgb(r: number, y: number, b: number): RGB {
  const m = Math.min(r, y, b);
  const C = Math.max(r, y, b) - m;
  const base = greyAxis(m);
  if (C <= 1e-9) return oklabToRgb(base);
  const hue = hueOf(r - m, y - m, b - m);
  const L = base[0] + (hue[0] - base[0]) * C;
  const cb = Math.hypot(base[1], base[2]), ch = Math.hypot(hue[1], hue[2]);
  const chroma = cb + (ch - cb) * C;
  const h = Math.atan2(hue[2], hue[1]);
  return oklabToRgb([L, chroma * Math.cos(h), chroma * Math.sin(h)]);
}

/** Paint amount for one channel: dose/4 × strength, capped at 1. */
export function paintAmount(dose: number, depth: number): number {
  return Math.max(0, Math.min(1, (dose / 4) * depth));
}

const PASTEL: Record<HueFamily, string> = {
  red: "pink", orange: "peach", yellow: "lemon", green: "mint", blue: "sky", purple: "lilac",
};
const PASTEL_NEUTRAL: Partial<Record<NeutralFamily, string>> = { charcoal: "silver", brown: "fawn" };

/**
 * Colour family from paint amounts (§2.2 rule 6):
 * C = max − min < 0.12 → neutral by darkness (oatmeal, taupe, charcoal). (§2.2 said 0.2, but a
 * single dose at the lowest strength gives C = 0.15 and visibly tints the wool, so anything with
 * net pigment is named by its hue.) Otherwise the hue of the
 * two largest components after removing the shared grey (a single hue unless the second is ≥ half
 * the first). A muted warm hue (C ≤ 0.5 with min ≥ 0.35 and a red, orange or yellow hue) is
 * brown. Muted cool hues keep their name (slate blue, olive green, plum), because that is what
 * they look like; their low intensity already keeps them out of "vivid".
 */
/** Below this chroma (max − min of the paint amounts) the wool is a neutral. */
export const NEUTRAL_C = 0.12;

export function colourFamily(r: number, y: number, b: number): ColourFamily {
  const m = Math.min(r, y, b);
  const C = Math.max(r, y, b) - m;
  if (C < NEUTRAL_C) return m < 0.25 ? "oatmeal" : m < 0.6 ? "taupe" : "charcoal";
  const parts: [HueFamily, number][] = [["red", r - m], ["yellow", y - m], ["blue", b - m]];
  parts.sort((a, b2) => b2[1] - a[1]);
  const [first, second] = parts as [[HueFamily, number], [HueFamily, number]];
  let hue: HueFamily;
  if (second[1] < 0.5 * first[1]) hue = first[0];
  else {
    const pair = new Set([first[0], second[0]]);
    hue = pair.has("red") && pair.has("yellow") ? "orange" : pair.has("yellow") && pair.has("blue") ? "green" : "purple";
  }
  if (C <= 0.5 && m >= 0.35 && (hue === "red" || hue === "orange" || hue === "yellow")) return "brown";
  return hue;
}

export function isHueFamily(f: ColourFamily): f is HueFamily {
  return (HUE_FAMILIES as string[]).includes(f);
}

/** Intensity bands for words: soft < 0.3 ≤ bright < 0.6 ≤ vivid. */
export function intensityBand(i: number): "none" | "soft" | "bright" | "vivid" {
  if (i <= 0) return "none";
  return i < 0.3 ? "soft" : i < 0.6 ? "bright" : "vivid";
}

export const VIVID = 0.6;

/** The wool colour a sheep shows. */
export function woolColour(ph: ColourInput): WoolColour {
  const spotted = !ph.white && !!ph.spotted;
  if (ph.white) {
    const rgb = hexToRgb(MASK_WHITE);
    return {
      hex: MASK_WHITE, rgb, hsl: rgbToHsl(rgb), family: "white", name: "snow-white", intensity: 0,
      dilute: false, spotted: false, amounts: { red: 0, yellow: 0, blue: 0 }, trueBlue: false, gold: false,
    };
  }
  const r = paintAmount(ph.red, ph.depth), y = paintAmount(ph.yellow, ph.depth), b = paintAmount(ph.blue, ph.depth);
  let rgb = rybToRgb(r, y, b);
  if (ph.dilute) rgb = rgb.map((v) => v + (255 - v) * DILUTE_MIX) as RGB;
  const intensity = (Math.max(r, y, b) - Math.min(r, y, b)) * (ph.dilute ? 0.5 : 1);
  const family = colourFamily(r, y, b);
  const gold = !ph.dilute && (family === "yellow" || family === "orange") && intensity >= VIVID && (ph.lustre ?? 0) >= 6;
  const name = gold ? "gold"
    : ph.dilute ? (isHueFamily(family) ? PASTEL[family] : PASTEL_NEUTRAL[family as NeutralFamily] ?? family)
    : family;
  return {
    hex: rgbToHex(rgb), rgb, hsl: rgbToHsl(rgb), family, name, intensity, dilute: ph.dilute, spotted,
    amounts: { red: r, yellow: y, blue: b },
    trueBlue: family === "blue" && intensity >= VIVID && !ph.dilute,
    gold,
  };
}

/**
 * Colour input from a v3 sheep's observed phenotypes (trait ids of `sheep3`). Masked channels
 * (white sheep) read as zero, which doesn't matter because white wins.
 */
export function colourInputFromPhenotype(ph: Record<string, string | number | undefined>): ColourInput {
  const num = (k: string) => Number(ph[k] ?? 0);
  return {
    white: ph["white"] === "white",
    red: num("red"), yellow: num("yellow"), blue: num("blue"),
    dilute: ph["dilute"] === "pale",
    depth: typeof ph["depth"] === "number" ? ph["depth"] : 1,
    spotted: ph["pattern"] === "spotted",
    ...(typeof ph["lustre"] === "number" ? { lustre: ph["lustre"] } : {}),
  };
}
