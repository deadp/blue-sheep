// Style lab round 2: the HTML layer over a map concept: felt price tags on locked land,
// "new" ribbons on freshly opened paddocks, icon-only place buttons and the stage stepper.
import { icon, type Icon2 } from "./icons2.js";
import { STAGE_NAMES, type Concept, type How, type Stage } from "./types.js";

export type MapTag =
  | { kind: "price"; how: How; price: number; label: string; x: number; y: number; soon: boolean }
  | { kind: "new"; label: string; x: number; y: number; icon?: Icon2 }
  | { kind: "place"; icon: Icon2; label: string; x: number; y: number }
  | { kind: "bush"; label: string; x: number; y: number };

const HOW: Record<How, [Icon2, string]> = {
  home: ["shed", ""], lease: ["key", "For lease"], buy: ["handshake", "For sale"], mend: ["hammer", "Mend fences"],
  drain: ["spade", "Clear the drain"], bridge: ["bridge", "Build a bridge"],
};

const YEARS = ["Year 1", "Year 3", "Year 6"];

export function mapOverlay(c: Concept, stage: Stage, tags: MapTag[]): string {
  const steps = STAGE_NAMES.map((s, i) => `<span class="step${i === stage ? " on" : i < stage ? " done" : ""}"><i></i>${s}</span>`).join("");
  const head = `<div class="mplaque felt stitch"><small>${c.id.toUpperCase()} · ${YEARS[stage]}</small><h1>${c.name}</h1><p>${c.line}</p><div class="steps">${steps}</div></div>`;
  const body = tags.map((t, i) => {
    const pos = `left:${t.x}px;top:${t.y}px`;
    if (t.kind === "price") {
      const [ic, word] = HOW[t.how];
      return `<div class="ptag${t.soon ? " soon" : ""}" style="${pos};--r:${(i % 3) - 1.2}deg"><i class="string"></i><div class="ptag-in felt"><i class="hole"></i>${icon(ic, "how")}<span class="pr">${icon("coin")}<b>${t.price}</b></span><small>${word}</small></div></div>`;
    }
    if (t.kind === "new") return `<div class="ntag2" style="${pos}"><span class="felt">${icon(t.icon ?? "sparkle")}<b>${t.label}</b></span></div>`;
    if (t.kind === "bush") return `<div class="btag" style="${pos}"><span class="felt">${icon(stage === 2 ? "bird" : "leaf")}<b>${t.label}</b></span></div>`;
    return `<div class="pl" style="${pos}"><span class="felt" title="${t.label}">${icon(t.icon)}</span></div>`;
  }).join("");
  return head + body;
}
