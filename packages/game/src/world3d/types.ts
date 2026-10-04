// Public world types (CONTRACTS.md §4). Re-exported from ./index.ts.

export type Zone = "paddock" | "paddock2" | "meadow" | "barn" | "market" | "visitor";
/** The farm's land (DESIGN-v3 §9): the home paddock, and land you can open. */
export type AreaId = "home" | "flats" | "rushy" | "farbank" | "terraces";
/** How the farmer gets about: walking (default) or panning the camera (drag, signposts, minimap). */
export type MoveMode = "walk" | "pan";
/** One piece of land as the world shows it. */
export interface LandInfo {
  id: AreaId;
  /** open: fenced and grazed; locked: scrub and a felt price tag; later: a "coming later" tag. */
  state: "open" | "locked" | "later";
  /** Coins to open it (locked land). */
  price?: number;
  /** Whether the player could open it now (the tag shows "Open this land"). */
  can?: boolean;
  /** A short line on the tag when it can't be opened yet ("Year 2", "Needs coins"). */
  note?: string;
}
export type Hotspot = "house" | "shed" | "market" | "vet" | "fairground" | "mailbox";
/** How a sheep behaves in the field and how it greets you. Derived from boldness by the controller. */
export type Personality = "shy" | "calm" | "curious" | "bold";
/** Farm improvements drawn in the diorama. */
export type WorldUpgrade = "paddock" | "terrier" | "collie" | "maremma" | "cat" | "barn" | "shearing" | "meadow";
/** The farm's other animals: three dogs and a cat. */
export type PetKind = "terrier" | "collie" | "maremma" | "cat";

export interface WorldSheep {
  id: string;
  name: string;
  sex: "ewe" | "ram";
  adult: boolean;
  /** Wool colour as a hex, from the colour model (core/colour.ts), e.g. "#FAFAF7" snow-white, "#C8322F" red. */
  wool: string;
  /** Colour family: "white", "oatmeal", "taupe", "charcoal", "brown", "red", "orange", "yellow", "green", "blue", "purple". */
  family: string;
  pattern: "solid" | "spotted";
  horns: "polled" | "horned";
  /** kg, typically 40–80 → body scale */
  size: number;
  /** kg, typically 2–6 → wool puffiness */
  fleeceWeight: number;
  /** µm, 16–36 → lower = subtle sheen */
  fineness: number;
  /** /cm, 2–8 → wool bumpiness */
  crimp: number;
  /**
   * The breed behind its looks (optional; default "farm"): "farm" | "merino" | "corriedale" | "perendale" |
   * "romney" | "drysdale" | "icelandic". Changes face and leg colour, fleece texture and build a little.
   */
  breed?: string;
  /**
   * The breed blend of a crossbred sheep (optional): up to three breeds with shares that sum to 1, biggest first
   * (the pedigree's breed fractions, from the controller). Absent for pure sheep (shares of 97% or more). The look
   * is blended by these weights; `breed` stays the dominant look for the flock's main-breed rule.
   */
  breedMix?: { breed: string; share: number }[];
  zone: Zone;
  marker?: "planned" | "new" | "ill" | "rosette" | "selected" | null;
  /** Idle behaviour and greeting (optional; defaults to "calm"). */
  personality?: Personality;
  /** Mother's id, so lambs can stay close to her (optional). */
  dam?: string | null;
  /**
   * How fond of you it is, 0–100 (optional; default 30). Fond sheep (60+) trot over to the front and follow
   * the sheep you're visiting; skittish ones (under 20) back away from a fuss. Personality applies on top.
   */
  fondness?: number;
}

export interface WorldSnapshot {
  /** 0..3 = spring..winter */
  season: 0 | 1 | 2 | 3;
  year: number;
  sheep: WorldSheep[];
  selected: string | null;
  /** second paddock fenced & open */
  paddock2: boolean;
  /** visiting ram pen occupied */
  visitorPresent: boolean;
  /** bunting on the fairground */
  fairToday: boolean;
  /**
   * Owned farm improvements (optional): the dogs ("terrier", "collie", "maremma"; the old "dog" means the
   * collie), the "cat", the snug barn, the shearing shed, the long meadow.
   */
  upgrades?: string[];
  /** Names (hover label) and fondness of the dogs and cat you own (optional). */
  pets?: { id: PetKind; name: string; fondness?: number }[];
  /**
   * The land (optional; default: home open, the creek flats open when `paddock2`, the rest locked). Land that
   * turns from locked to open after the first snapshot plays the reveal (scrub clears, grass greens, fence mends).
   */
  land?: LandInfo[];
}

export type HoverTarget = { kind: "sheep"; id: string } | { kind: "hotspot"; id: Hotspot } | { kind: "pet"; id: PetKind } | null;

export interface WorldHandlers {
  onSheep(id: string): void;
  onHotspot(h: Hotspot): void;
  onHover?(target: HoverTarget): void;
  /** The live portrait was clicked (the sheep hops and bleats); the controller plays its voice. */
  onPortraitClick?(id: string): void;
  /** A dog or the cat was clicked in the field. */
  onPet?(id: PetKind): void;
  /**
   * The live portrait's fleece is being brushed (click-and-drag over the sheep). "stroke": a stretch of
   * brushing (for a swish sound, a few times a second at most); "done": one full brushing has been given,
   * reported when the drag ends (at most once per mounted sheep until it is mounted afresh).
   */
  onBrush?(id: string, phase: "stroke" | "done"): void;
  /** A felt price tag's "Open this land" (or the tag itself) was clicked. */
  onArea?(id: AreaId): void;
  /** The walk / pan switch was flipped in the world (Tab or the felt switch); the controller persists it. */
  onMoveMode?(mode: MoveMode): void;
  /** Auto detail measured slow frames and switched the world to lite (at most once per WorldView). */
  onAutoLite?(info: { median: number; samples: number }): void;
}

/** How much the world draws: "auto" measures the first seconds (and after a resize) and drops to lite when slow. */
export type Detail = "auto" | "full" | "lite";

export interface WorldOptions {
  seed?: number;
  reducedMotion?: boolean;
  /** Walk (default) or pan. */
  move?: MoveMode;
  /** Cheaper fallback (`?lite=1`): no shadows, fewer grass tufts and wool locks, pixel ratio 1. Same as detail "lite". */
  lite?: boolean;
  /** Detail level (default "full"); "auto" starts full and may switch itself to lite (see onAutoLite). */
  detail?: Detail;
}
