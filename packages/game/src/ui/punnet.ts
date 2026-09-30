/**
 * A reusable 2×2 Punnet square for one gene with two versions (core/punnet.ts). Each parent's two copies sit
 * along the edges as small pictures with words; the four cells are the lambs those copies make. Hovering a
 * cell lights up the two copies that made it; clicking a copy lights up the cells it goes to (pure CSS: a
 * hidden radio per copy, `:has()` rules in styles.css). Allele letters appear only when `letters` is on (the
 * `numbers` unlock); otherwise there are no genotype strings anywhere in the markup.
 */
import type { PunnetSquare } from "../core/index.js";
import { esc, hex } from "./util.js";

export interface PunnetView {
  square: PunnetSquare;
  damName: string;
  sireName: string;
  /** Show allele letters (only with the numbers unlock). */
  letters: boolean;
  /** Colour gene: the shade (hex or colour name) a lamb with two colour copies shows (default red). */
  lambColour?: string;
  /** Colour gene: that colour in words (default "coloured"). */
  lambWord?: string;
  /** Small: for the mentor card (default) or the codex. */
  size?: "sm" | "md";
  /** Distinguishes squares on one page (the copies' radio group). */
  id?: string;
}

/** A sheep's head: woolly topknot, face, ears, optionally curly horns. 0..40 viewBox. */
export function headSvg(o: { horns: boolean; wool: string; px: number; title?: string }): string {
  // Curled ram's horns: from the top of the head, out, down and round (drawn twice: an outline, then the horn).
  const curl = "M13 11c-6-3-12 1-11 8 1 6 7 7 9 3 1-3-2-5-4-3";
  const horn = o.horns
    ? `<g class="ph-horns"><path class="ph-horn-o" d="${curl}" /><path class="ph-horn-o" d="${curl}" transform="translate(40 0) scale(-1 1)" /><path class="ph-horn" d="${curl}" /><path class="ph-horn" d="${curl}" transform="translate(40 0) scale(-1 1)" /></g>`
    : "";
  return `<svg class="p-head" viewBox="0 0 40 40" width="${o.px}" height="${o.px}" aria-hidden="true">
    <ellipse class="ph-ear" cx="7" cy="21" rx="5" ry="2.6" transform="rotate(-18 7 21)" />
    <ellipse class="ph-ear" cx="33" cy="21" rx="5" ry="2.6" transform="rotate(18 33 21)" />
    ${horn}
    <ellipse class="ph-face" cx="20" cy="24" rx="9" ry="11" />
    <g fill="${esc(o.wool)}" class="ph-wool"><circle cx="14" cy="13" r="5.5" /><circle cx="20" cy="10.5" r="6" /><circle cx="26" cy="13" r="5.5" /></g>
    <circle class="ph-eye" cx="16.3" cy="24" r="1.6" /><circle class="ph-eye" cx="23.7" cy="24" r="1.6" />
    <ellipse class="ph-nose" cx="20" cy="30.5" rx="2.6" ry="1.5" />
  </svg>`;
}

function woolDot(colour: string, px: number): string {
  return `<svg class="p-wool" viewBox="0 0 24 24" width="${px}" height="${px}" aria-hidden="true"><g fill="${esc(hex(colour))}"><circle cx="8" cy="12" r="6" /><circle cx="16" cy="12" r="6" /><circle cx="12" cy="8" r="6" /><circle cx="12" cy="15" r="6" /></g></svg>`;
}

/** The picture for one copy (an edge of the square). */
function copyArt(sq: PunnetSquare, allele: string, colour: string, px: number): string {
  const dom = allele === sq.gene.dominant;
  if (sq.gene.id === "horns") return headSvg({ horns: !dom, wool: hex("white"), px });
  return woolDot(dom ? "white" : colour, px);
}

/** The picture for one lamb (a cell). */
function lambArt(sq: PunnetSquare, look: string, colour: string, px: number): string {
  if (sq.gene.id === "horns") return headSvg({ horns: look === sq.gene.recessiveLook, wool: hex("white"), px });
  return headSvg({ horns: false, wool: hex(look === sq.gene.recessiveLook ? colour : "white"), px });
}

/** Two letters for a cell, dominant first ("Pp"), used only with letters on. */
function pairLetters(sq: PunnetSquare, a: string, b: string): string {
  return a === sq.gene.dominant || b !== sq.gene.dominant ? `${a}${b}` : `${b}${a}`;
}

/** "3 in 4", "every", "none". */
function inFour(n: number): string {
  return n === 4 ? "all 4" : n === 0 ? "none" : `${n} in 4`;
}

export function punnetHtml(v: PunnetView): string {
  const sq = v.square;
  const g = sq.gene;
  const colour = v.lambColour ?? "red";
  const colourWord = v.lambWord ?? "coloured";
  const sm = (v.size ?? "sm") === "sm";
  const copyPx = sm ? 24 : 32, cellPx = sm ? 32 : 42;
  const name = `pq-${v.id ?? `${g.id}-${sm ? "sm" : "md"}`}`;
  const lookWord = (look: string) => (g.id === "colour" && look === g.recessiveLook ? colourWord : look);
  const copy = (side: "d" | "s", i: number, allele: string) => {
    const dom = allele === g.dominant;
    const words = dom ? g.dominantCopy : g.recessiveCopy;
    return `<label class="pcopy ${dom ? "dom" : "rec"} ${side === "d" ? "row" : "col"}" data-pick="${side}${i}" title="Click to see where this copy goes">
      <input type="radio" name="${name}" data-pick="${side}${i}" />
      ${copyArt(sq, allele, colour, copyPx)}<span class="pc-word">${esc(words)}</span>${v.letters ? `<span class="p-let">${esc(allele)}</span>` : ""}
    </label>`;
  };
  const cell = (r: number, c: number) => {
    const x = sq.cells.find((k) => k.r === r && k.c === c)!;
    const hidden = x.look === g.dominantLook && (x.fromDam !== g.dominant || x.fromSire !== g.dominant);
    const carrier = hidden ? `<span class="pl-carry">${g.id === "horns" ? "carries horns" : "carries colour"}</span>` : "";
    return `<div class="pcell ${x.look === g.recessiveLook ? "rec" : "dom"}" data-r="${r}" data-c="${c}" data-look="${esc(x.look)}" title="Point at a lamb to see which copies made it">
      ${lambArt(sq, x.look, colour, cellPx)}<span class="pl-look">${esc(lookWord(x.look))}</span>${carrier}${v.letters ? `<span class="p-let">${esc(pairLetters(sq, x.fromDam, x.fromSire))}</span>` : ""}
    </div>`;
  };
  const nDom = sq.counts[g.dominantLook] ?? 0, nRec = sq.counts[g.recessiveLook] ?? 0;
  return `<div class="punnet ${sm ? "sm" : "md"}" data-gene="${g.id}" data-dom="${nDom}" data-rec="${nRec}" role="group" aria-label="Punnet square: ${esc(inFour(nDom))} ${esc(lookWord(g.dominantLook))}, ${esc(inFour(nRec))} ${esc(lookWord(g.recessiveLook))}">
    <div class="pgrid">
      <div class="pcorner"><span class="pk-sire">${esc(v.sireName)} ♂ →</span><span class="pk-dam">${esc(v.damName)} ♀ ↓</span></div>
      ${copy("s", 0, sq.sire[0])}${copy("s", 1, sq.sire[1])}
      ${copy("d", 0, sq.dam[0])}${cell(0, 0)}${cell(0, 1)}
      ${copy("d", 1, sq.dam[1])}${cell(1, 0)}${cell(1, 1)}
    </div>
    <div class="psum"><span class="ps dom">${lambArt(sq, g.dominantLook, colour, 18)} <b>${esc(inFour(nDom))}</b> ${esc(lookWord(g.dominantLook))}</span><span class="ps rec">${lambArt(sq, g.recessiveLook, colour, 18)} <b>${esc(inFour(nRec))}</b> ${esc(lookWord(g.recessiveLook))}</span></div>
  </div>`;
}
