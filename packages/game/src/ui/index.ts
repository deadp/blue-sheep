/** Public UI API: pure HTML renderers of (state, view), the HUD, the overlay and a toast. */
import type { GameState } from "../core/index.js";
import { boardHtml, ordersHtml } from "./board.js";
import { codexHtml } from "./codex.js";
import { fairHtml, marketHtml, vetHtml } from "./farm.js";
import { forecastPanelHtml } from "./forecast.js";
import { endingHtml, helpHtml, settingsHtml, titleHtml } from "./misc.js";
import { reportHtml } from "./report.js";
import { sheepCardHtml, treeHtml } from "./sheep.js";
import { animalCardHtml } from "./pets.js";
import type { PanelName, View } from "./view.js";

export type { View, PanelName } from "./view.js";
export { PANEL_NAMES, defaultView } from "./view.js";
export { esc } from "./util.js";
export { Overlay, toast, delegateActions, type ActionData, type ShowOptions } from "./overlay.js";
export { hudHtml, titleHtml, helpHtml, settingsHtml, endingHtml } from "./misc.js";
export { forecastPanelHtml, litterRow, litterWords, litterLooks, lambTile, rangeBar } from "./forecast.js";
export { sheepCardHtml, treeHtml, familyTreeHtml, careHtml } from "./sheep.js";
export { animalCardHtml, myAnimalsHtml, petSubject, PET_ICON } from "./pets.js";
export { boardHtml, ordersHtml, goalCard } from "./board.js";
export { marketHtml, vetHtml, fairHtml } from "./farm.js";
export { codexHtml, CONCEPTS } from "./codex.js";
export { reportHtml } from "./report.js";
export { actTrack, ACT_ICONS } from "./track.js";
export {
  mentorHtml, tutorialTarget, tutorialStepMet, tutorialLamb, lessonShown, lessonTarget, lessonMentorHtml, pointTarget, type TutorialTarget,
} from "./tutorial.js";
export { oddsMeter, learnMeter, ODDS_SCALE, LEARN_SCALE } from "./util.js";

const RENDER: Record<PanelName, (s: GameState, v: View) => string> = {
  title: titleHtml, help: helpHtml, sheep: sheepCardHtml, forecast: forecastPanelHtml, board: boardHtml,
  orders: ordersHtml, market: marketHtml, vet: vetHtml, fair: fairHtml, codex: codexHtml, tree: treeHtml,
  report: reportHtml, ending: endingHtml, settings: settingsHtml, animal: animalCardHtml,
};

/** Panels that want the wide layout. */
export const WIDE_PANELS: ReadonlySet<PanelName> = new Set<PanelName>(["forecast", "board", "orders", "market", "vet", "fair", "codex", "tree", "report"]);

/** Panels docked to the right so the farm stays visible beside them (the sheep card: the sheep says hello). */
export const SIDE_PANELS: ReadonlySet<PanelName> = new Set<PanelName>(["sheep", "animal"]);

/** Options for Overlay.show for a panel. The title and ending cannot be dismissed with the backdrop. */
export function panelOptions(panel: PanelName): { wide: boolean; closable: boolean; name: string; side: boolean } {
  return { wide: WIDE_PANELS.has(panel), closable: panel !== "title", name: panel, side: SIDE_PANELS.has(panel) };
}

/** Render the open panel, or "" when none. */
export function renderPanel(state: GameState, view: View): string {
  if (!view.panel) return "";
  const r = RENDER[view.panel];
  if (!r) return "";
  return r(state, view);
}
