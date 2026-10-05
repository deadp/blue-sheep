/** Small shared bits for panel HTML: escaping, swatches, dots, pips, words. No DOM. */
import {
 ageOf, finenessWord, strengthFraction, strengthWord, WOOL_TYPE_BLURB, fleeceWords, breedFractions, breedLine, fondnessHearts, fondnessWord, isAdult, oddsLabel, personalityOf, PERSONALITY_WORD, seasonLabel, woolOf, type GameState, type Sheep, type Unlock,
} from "../core/index.js";
import { icon, type IconName } from "./felt/icons.js";
import { tag } from "./felt/components.js";

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Fallback shades for a few colour names (swatches normally carry the sheep's own wool hex). */
export const COLOUR_HEX: Record<string, string> = {
  white: "#FAFAF7", "snow-white": "#FAFAF7", oatmeal: "#EDE3CF", taupe: "#8F7B69", charcoal: "#2B2724", brown: "#8A5A36",
  red: "#C8322F", orange: "#E07A2A", yellow: "#F2C230", green: "#3E8E4A", blue: "#2F5DA8", purple: "#6E3A8E",
  pink: "#E59A98", peach: "#EEB88E", lemon: "#F6DD8F", mint: "#9CC6A2", sky: "#93ACD2", lilac: "#B39BC2",
  slate: "#5F6F8C", olive: "#7C7F4A", silver: "#A9A6A3", fawn: "#C9A98C", gold: "#E3B53A", "true blue": "#2F5DA8",
};

/** A colour's shade: a hex passes through; a colour name uses COLOUR_HEX. */
export function hex(colour: string): string {
  return colour.startsWith("#") ? colour : COLOUR_HEX[colour] ?? "#cccccc";
}

/** A sheep's wool swatch (its own shade). */
export function woolSwatch(s: Sheep, extra = ""): string {
  return swatch(woolOf(s).hex, extra);
}

export function numbersOn(state: GameState): boolean {
  return state.unlocks.includes("numbers");
}

export function has(state: GameState, u: Unlock): boolean {
  return state.unlocks.includes(u);
}

/** "40%" only when numbers are unlocked, otherwise "". Keeps % out of early-game HTML. */
export function pctIf(state: GameState, p: number, pre = " · "): string {
  return numbersOn(state) ? `${pre}${Math.round(p * 100)}%` : "";
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A 0..1 value as a CSS custom property (no "%" in the markup). */
export function prop(name: string, v: number): string {
  return `--${name}:${Math.max(0, Math.min(1, v)).toFixed(3)}`;
}

export function swatch(colour: string, extra = ""): string {
  return `<span class="swatch ${extra}" style="--wool:${hex(colour)}" aria-hidden="true"></span>`;
}

export function sexMark(s: Pick<Sheep, "sex">): string {
  return s.sex === "ewe" ? `<span class="sex ewe" title="ewe" aria-label="ewe">♀</span>` : `<span class="sex ram" title="ram" aria-label="ram">♂</span>`;
}

/** Confidence dot, a felt knot filled to how sure you are: full certain, ¾ almost, ½ probably, empty unknown. */
export function dot(confidence: number, certain: boolean): string {
  const w = certain ? "certain" : confidence > 0.85 ? "almost certain" : confidence > 0.6 ? "probably" : "unknown";
  return `<span class="dot c${certain ? 4 : confidence > 0.85 ? 3 : confidence > 0.6 ? 2 : 1}" title="${w}" role="img" aria-label="${w}"></span>`;
}

/** Words under every odds meter, left to right. */
export const ODDS_SCALE = ["long shot", "likely", "sure"] as const;
/** Words under every "how much you'd learn" meter. */
export const LEARN_SCALE = ["little", "loads"] as const;

export interface MeterOptions {
  /** Headline word next to the bar (defaults to the odds word). */
  word?: string;
  /** Tooltip. */
  label?: string;
  /** Hide the scale words (tight lists). */
  compact?: boolean;
  /** A risk (something bad happening): the segments fill in warning colours instead of green. */
  risk?: boolean;
}

function segments(n: number, kind: string): string {
  let out = "";
  for (let i = 0; i < 10; i++) out += `<i class="${i < n ? `on s${i}` : ""}"></i>`;
  return `<span class="m-bar ${kind}">${out}</span>`;
}

/**
 * The one odds meter used everywhere (orders, fair, visitor): ten segments filling warm → green, the odds
 * in words, a "long shot · even · likely · sure" scale underneath, and the percentage only with numbers.
 */
export function oddsMeter(state: GameState, p: number, o: MeterOptions = {}): string {
  const n = Math.max(0, Math.min(10, Math.round(p * 10)));
  const word = o.word ?? oddsLabel(p);
  const scale = o.compact ? "" : `<span class="m-scale odds">${ODDS_SCALE.map((w, i) => `<span class="w${i}">${w}</span>`).join("")}</span>`; // long shot · likely · sure
  return `<span class="meter2 odds ${o.compact ? "compact" : ""} ${o.risk ? "risk" : ""}" role="meter" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${n}" aria-label="${esc(o.label ?? word)}" title="${esc(o.label ?? word)}">
    <span class="m-row">${segments(n, o.risk ? "risk" : "odds")}<span class="m-word">${esc(word)}${numbersOn(state) ? ` <span class="num">${Math.round(p * 100)}%</span>` : ""}</span></span>${scale}</span>`;
}

/** The odds scale words on their own: one legend above a list of compact meters. */
export function oddsScale(): string {
  return `<span class="m-scale odds solo" aria-hidden="true">${ODDS_SCALE.map((w, i) => `<span class="w${i}">${w}</span>`).join("")}</span>`;
}

/** Same look for "how much would this teach you" (forecast, vet): 0..1, blue segments, "a little → a lot". */
export function learnMeter(v: number, word: string, o: MeterOptions = {}): string {
  const n = Math.max(0, Math.min(10, Math.round(v * 10)));
  const scale = o.compact ? "" : `<span class="m-scale learn"><span class="w0">${LEARN_SCALE[0]}</span><span class="w2">${LEARN_SCALE[1]}</span></span>`;
  return `<span class="meter2 learn ${o.compact ? "compact" : ""}" role="meter" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${n}" aria-label="${esc(o.label ?? word)}" title="${esc(o.label ?? "how much you'd learn")}">
    <span class="m-row">${segments(n, "learn")}<span class="m-word">${esc(word)}</span></span>${scale}</span>`;
}

/** A word for a learn-meter value. */
export function learnWord(v: number): string {
  return v <= 0.02 ? "nothing new" : v < 0.25 ? "a little" : v < 0.55 ? "a fair bit" : v < 0.85 ? "a lot" : "loads";
}

/** Odds meter (kept name): segments always, the percentage only with numbers. */
export function pips(state: GameState, p: number, label = "", compact = false): string {
  return oddsMeter(state, p, { label: label || oddsLabel(p), compact });
}

/** Portrait image, or a wool-coloured placeholder circle when no portrait is available. */
export function portrait(view: { portraits: (id: string) => string }, s: Sheep, size = "md"): string {
  let src = "";
  try { src = view.portraits(s.id) || ""; } catch { src = ""; }
  if (!src) return `<span class="portrait ${size} blank" style="--wool:${woolOf(s).hex}" aria-hidden="true"></span>`;
  return `<img class="portrait ${size}" src="${esc(src)}" alt="" loading="lazy">`;
}

/** Clickable sheep chip (opens the sheep card). */
export function chip(state: GameState, s: Sheep, extra = ""): string {
  const gone = !state.flock.includes(s.id);
  return `<button class="chip ${gone ? "gone" : ""}" data-sheep="${esc(s.id)}">${woolSwatch(s)}<span class="nm">${esc(s.name)}</span>${extra}</button>`;
}

export function ageWords(state: GameState, s: Sheep): string {
  const a = ageOf(s, state.season);
  if (a <= 0) return "newborn lamb";
  if (!isAdult(s, state.season)) return `lamb, ${a} season${a === 1 ? "" : "s"} old`;
  if (a < 8) return `${a} seasons old`;
  const y = Math.floor(a / 4);
  return `${y} years old`;
}

export function dueWords(state: GameState, deadline: number): string {
  const left = deadline - state.season;
  const when = `due by ${seasonLabel(deadline)}`;
  if (left <= 0) return `${when} (overdue)`;
  if (left === 1) return `${when} (this season)`;
  return `${when} (${left} seasons left)`;
}

export const UNLOCK_WORDS: Record<Unlock, string> = {
  cards: "Discovery cards in the codex",
  vet: "The vet's tests",
  orders: "Villager orders at the mailbox",
  numbers: "Percentages and measurements",
  fair: "The village fair every autumn",
  tree: "Family trees",
  visitor: "Visiting rams each spring",
  farm: "Farm improvements and winter weather",
  dogs: "Dogs at the market (and foxes)",
  cat: "A farm cat (and mice)",
  craft: "The woolshed: card, spin and knit your wool",
};

/** An icon per concept, for the report's "new on the farm" banner. */
export const UNLOCK_ICON: Record<Unlock, IconName> = {
  cards: "book", vet: "vet", orders: "mail", numbers: "ruler", fair: "rosette", tree: "tree", visitor: "ram", farm: "barn", dogs: "dog", cat: "cat", craft: "yarn",
};

export const LOCUS_FRIENDLY: Record<string, string> = {
  W: "hidden colour", red: "red paint", yellow: "yellow paint", blue: "blue paint", Dl: "pale", S: "spots", P: "horns",
};

/**
 * Pigment dots (DESIGN-v3 §12): three rows of four felt dots for red, yellow and blue doses, a pale/full chip
 * and the colour-strength bar. A white sheep's pigment is hidden: the rows show a "?" instead. Doses are
 * dots, not numbers.
 */
export function pigmentDots(s: Sheep): string {
  const w = woolOf(s);
  if (s.phenotype["white"] === "white") {
    return `<div class="pig hidden" title="White on top: the colour underneath is hidden">${["red", "yellow", "blue"].map((c) => `<span class="pig-row ${c}"><span class="v-pig ${c}"></span><span class="pig-q">?</span></span>`).join("")}<span class="pig-h">hidden</span></div>`;
  }
  const row = (c: "red" | "yellow" | "blue") => {
    const d = Number(s.phenotype[c] ?? 0);
    let dots = "";
    for (let i = 0; i < 4; i++) dots += `<i class="${i < d ? "on" : ""}"></i>`;
    return `<span class="pig-row ${c}" title="${d === 0 ? `no ${c}` : `${d === 1 ? "one" : d === 2 ? "two" : d === 3 ? "three" : "four"} ${c} dose${d === 1 ? "" : "s"}`}"><span class="pig-l">${c}</span><span class="pig-d">${dots}</span></span>`;
  };
  const depth = Number(s.phenotype["depth"] ?? 1);
  const strength = strengthFraction(depth);
  const sword = strengthWord(depth);
  return `<div class="pig" style="--wool:${w.hex}">${row("red")}${row("yellow")}${row("blue")}
    <span class="pig-row extra"><span class="pig-chip ${w.dilute ? "pale" : "full"}">${w.dilute ? "pale" : "full"}</span><span class="pig-str" title="Colour strength: ${sword}"><span style="${prop("s", strength)}"></span></span><span class="pig-sw">${sword}</span></span></div>`;
}

/** Plain words for measured traits; numbers appended only when unlocked. */
export function traitWords(state: GameState, s: Sheep): { label: string; text: string }[] {
  const ph = s.phenotype;
  const nums = numbersOn(state);
  const fin = Number(ph["fineness"]), fw = Number(ph["fleeceWeight"]), size = Number(ph["size"]), bold = Number(ph["boldness"]);
  const finW = finenessWord(fin);
  const fwW = fw < 3.2 ? "light" : fw < 4.8 ? "average" : "heavy";
  const sizeW = size < 50 ? "small" : size < 68 ? "medium-sized" : "big";
  const pers = personalityOf(s);
  const boldW = `${PERSONALITY_WORD[pers].toLowerCase()}${pers === "bold" ? " — foxes keep away" : ""}${nums && Number.isFinite(bold) ? ` (boldness ${bold.toFixed(1)})` : ""}`;
  const young = !isAdult(s, state.season);
  return [
    { label: "Wool", text: young ? "not shorn yet" : `${finW}${nums ? ` (${fin.toFixed(1)} µm)` : ""}` },
    { label: "Fleece", text: young ? "still growing" : `${fwW}${nums ? ` (${fw.toFixed(1)} kg)` : ""}` },
    { label: "Build", text: `${sizeW}${nums ? ` (${size.toFixed(0)} kg)` : ""}` },
    { label: "Temper", text: boldW },
  ];
}

export function stars(rep: number): string {
  const n = Math.max(0, Math.min(5, Math.round(rep / 2)));
  let out = "";
  for (let i = 0; i < 5; i++) out += `<i class="${i < n ? "on" : ""}">${icon("star")}</i>`;
  return `<span class="stars" title="Reputation: ${n} of 5" role="img" aria-label="Reputation: ${n} of 5">${out}</span>`;
}

/** Card heading: the friendly names of every hidden trait on the card. */
export function discoveryTitle(d: { locus: string; loci?: string[] }): string {
  const names = (d.loci ?? [d.locus]).map((l) => LOCUS_FRIENDLY[l] ?? "discovery");
  return [...new Set(names)].join(" · ");
}

/** Discovery sentence with a verb ("Seamus no spotting allele" → "Seamus has no spotting allele"). */
export function discoveryText(state: GameState, d: { sheep: string; text: string }): string {
  const name = state.sheep[d.sheep]?.name;
  if (!name || !d.text.startsWith(`${name} `)) return d.text;
  const rest = d.text.slice(name.length + 1);
  const fixed = /^(no |two |one )/.test(rest) ? `has ${rest}` : /^(pure |horned|spotted|pale)/.test(rest) ? `is ${rest}` : rest;
  return `${name} ${fixed}`;
}

/**
 * The fondness heart meter: five hearts (halves allowed) and the word (Skittish … Devoted). The number out of
 * 100 only with the numbers unlock. `to` draws the hearts a treat would add, faintly.
 */
export function heartMeter(state: GameState, level: number, o: { to?: number; compact?: boolean } = {}): string {
  const h = fondnessHearts(level);
  const t = o.to !== undefined ? fondnessHearts(o.to) : h;
  let out = "";
  for (let i = 0; i < 5; i++) {
    const cls = h >= i + 1 ? "full" : h >= i + 0.5 ? "half" : t >= i + 0.5 ? "more" : "";
    out += `<i class="${cls}" aria-hidden="true">${icon("heart")}</i>`;
  }
  const word = fondnessWord(level);
  const num = numbersOn(state) ? ` <span class="num">${Math.round(level)}/100</span>` : "";
  return `<span class="hearts ${o.compact ? "compact" : ""}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(level)}" aria-label="Fondness: ${esc(word)}" title="Fondness: ${esc(word)}"><span class="h-row">${out}</span><span class="h-word">${esc(word)}${num}</span></span>`;
}

/** The wool type's tag tone. */
const WOOL_TONE: Record<string, string> = { fine: "sky", medium: "sage", strong: "butter", lustre: "lilac", carpet: "rose", lopi: "cream", crossbred: "cream" };

/** The wool type as a felt tag ("Lopi", "Medium"), with its blurb as the hover text. */
export function woolTypeTag(state: GameState, s: Sheep): string {
  const f = fleeceWords(s, numbersOn(state));
  return tag(esc(f.label), { icon: "yarn", tone: WOOL_TONE[f.type] ?? "cream", cls: `wool-type wt-${f.type}`, title: `${f.label}: ${WOOL_TYPE_BLURB[f.type]}` });
}

/** The breed line ("Romney", "Merino × Romney", "¾ Corriedale") from the farm's records. */
export function breedWords(state: GameState, s: Sheep): string {
  return breedLine(breedFractions(state, s.id));
}
