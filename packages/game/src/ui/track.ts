/** The illustrated story track: six chapter milestones (DESIGN-v3 §10.1). */
import { ACTS, currentAct, type GameState } from "../core/index.js";
import { icon, type IconName } from "./felt/icons.js";
import { esc, prop } from "./util.js";

/** One embroidered icon per chapter, in story order: the farm, hidden colours, the woolshed, true blue, rare wool, the Golden Fleece. */
export const ACT_ICONS: readonly IconName[] = ["house", "sheep", "yarn", "heart", "ram", "rosette"];

/**
 * The story so far as an illustrated track: one milestone per chapter with icons, finished ones ticked, the current
 * one ringed with its progress filling the path to the next. `mini` is the compact HUD version (one knot each).
 */
export function actTrack(state: GameState, mini = false): string {
  const a = currentAct(state);
  const done = (i: number) => i < a.act || (a.endless && i <= a.act);
  const items = ACTS.map((d, i) => {
    const cls = done(i) ? "done" : i === a.act ? "now" : "later";
    const fill = i < a.act ? 1 : i === a.act ? a.progress : 0;
    return `<li class="${cls}" style="${prop("p", fill)}" title="${esc(`Act ${i + 1} · ${d.title}${cls === "done" ? " — done" : cls === "now" ? " — you are here" : ""}`)}">
      <span class="ms">${mini ? "" : `<span class="ms-ico">${icon(ACT_ICONS[i]!)}</span>`}${cls === "done" && !mini ? `<span class="tick">${icon("check", "sm")}</span>` : ""}</span>${mini ? "" : `<span class="ms-lbl"><b>Act ${i + 1}</b>${esc(d.title)}</span>`}</li>`;
  }).join("");
  return `<ol class="act-track ${mini ? "mini" : ""}" aria-label="Story progress: act ${a.act + 1} of ${ACTS.length}">${items}</ol>`;
}
