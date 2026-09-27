/** Small shared bits for panel HTML: escaping, swatches, dots, pips, words. No DOM. */
import {
  ageOf, fondnessHearts, fondnessWord, isAdult, oddsLabel, personalityOf, PERSONALITY_WORD, seasonLabel, type GameState, type Sheep, type Unlock,
} from "../core/index.js";

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const COLOUR_HEX: Record<string, string> = {
  white: "#f3eee2", black: "#3c3436", brown: "#8a5a36", blue: "#7f9fe4", fawn: "#d9b98c",
};

export function hex(colour: string): string {
  return COLOUR_HEX[colour] ?? "#cccccc";
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

export function sexMark(s: Sheep): string {
  return s.sex === "ewe" ? `<span class="sex ewe" title="ewe">♀</span>` : `<span class="sex ram" title="ram">♂</span>`;
}

/** Confidence dot: ● certain ◕ likely ◑ leaning ○ unknown. Title in words only. */
export function dot(confidence: number, certain: boolean): string {
  const [g, w] = certain ? ["●", "certain"] : confidence > 0.85 ? ["◕", "almost certain"] : confidence > 0.6 ? ["◑", "probably"] : ["○", "unknown"];
  return `<span class="dot c${certain ? 4 : confidence > 0.85 ? 3 : confidence > 0.6 ? 2 : 1}" title="${w}">${g}</span>`;
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
  if (!src) return `<span class="portrait ${size} blank" style="--wool:${hex(String(s.phenotype["colour"]))}" aria-hidden="true"></span>`;
  return `<img class="portrait ${size}" src="${esc(src)}" alt="" loading="lazy">`;
}

/** Clickable sheep chip (opens the sheep card). */
export function chip(state: GameState, s: Sheep, extra = ""): string {
  const gone = !state.flock.includes(s.id);
  return `<button class="chip ${gone ? "gone" : ""}" data-sheep="${esc(s.id)}">${swatch(String(s.phenotype["colour"]))}${esc(s.name)}${extra}</button>`;
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
};

/** An icon per concept, for the report's "new on the farm" banner. */
export const UNLOCK_ICON: Record<Unlock, string> = {
  cards: "📖", vet: "🩺", orders: "📮", numbers: "🔢", fair: "🎪", tree: "🌳", visitor: "🐏", farm: "🛖", dogs: "🐕", cat: "🐈",
};

export const LOCUS_FRIENDLY: Record<string, string> = {
  A: "hidden colour", B: "brown", D: "dilute", S: "spotting", P: "horns",
};

/** Plain words for measured traits; numbers appended only when unlocked. */
export function traitWords(state: GameState, s: Sheep): { label: string; text: string }[] {
  const ph = s.phenotype;
  const nums = numbersOn(state);
  const fin = Number(ph["fineness"]), fw = Number(ph["fleeceWeight"]), size = Number(ph["size"]), bold = Number(ph["boldness"]);
  const finW = fin < 20 ? "very fine" : fin < 23.5 ? "fine" : fin < 27.5 ? "medium" : "coarse";
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
  return `<span class="stars" title="Reputation">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`;
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
  const fixed = /^(no |two )/.test(rest) ? `has ${rest}` : /^(pure |horned|spotted|brown-based)/.test(rest) ? `is ${rest}` : /^shows /.test(rest) ? rest : rest;
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
    out += `<i class="${cls}" aria-hidden="true">♥</i>`;
  }
  const word = fondnessWord(level);
  const num = numbersOn(state) ? ` <span class="num">${Math.round(level)}/100</span>` : "";
  return `<span class="hearts ${o.compact ? "compact" : ""}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(level)}" aria-label="Fondness: ${esc(word)}" title="Fondness: ${esc(word)}"><span class="h-row">${out}</span><span class="h-word">${esc(word)}${num}</span></span>`;
}
