// Public world types (CONTRACTS.md §4). Re-exported from ./index.ts.

export type Zone = "paddock" | "paddock2" | "barn" | "market" | "visitor";
export type Hotspot = "house" | "shed" | "market" | "vet" | "fairground" | "mailbox";
/** How a sheep behaves in the field and how it greets you. Derived from boldness by the controller. */
export type Personality = "shy" | "calm" | "curious" | "bold";
/** Farm improvements drawn in the diorama. */
export type WorldUpgrade = "paddock" | "dog" | "barn" | "shearing" | "meadow";

export interface WorldSheep {
  id: string;
  name: string;
  sex: "ewe" | "ram";
  adult: boolean;
  colour: "white" | "black" | "brown" | "blue" | "fawn";
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
  zone: Zone;
  marker?: "planned" | "new" | "ill" | "rosette" | "selected" | null;
  /** Idle behaviour and greeting (optional; defaults to "calm"). */
  personality?: Personality;
  /** Mother's id, so lambs can stay close to her (optional). */
  dam?: string | null;
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
  /** Owned farm improvements (optional): a sheepdog, the snug barn, the shearing shed, the long meadow. */
  upgrades?: string[];
}

export type HoverTarget = { kind: "sheep"; id: string } | { kind: "hotspot"; id: Hotspot } | null;

export interface WorldHandlers {
  onSheep(id: string): void;
  onHotspot(h: Hotspot): void;
  onHover?(target: HoverTarget): void;
  /** The live portrait was clicked (the sheep hops and bleats); the controller plays its voice. */
  onPortraitClick?(id: string): void;
}

export interface WorldOptions {
  seed?: number;
  reducedMotion?: boolean;
}
