/** View state the controller keeps between renders. Panels are pure functions of (state, view). */
import type { Goal, SeasonReport } from "../core/index.js";

export type PanelName =
  | "title" | "help" | "sheep" | "forecast" | "board" | "orders" | "market" | "vet"
  | "fair" | "codex" | "tree" | "report" | "ending" | "settings" | "animal" | "woolshed";

export const PANEL_NAMES: PanelName[] = [
  "title", "help", "sheep", "forecast", "board", "orders", "market", "vet", "fair", "codex", "tree", "report", "ending", "settings", "animal", "woolshed",
];

export interface View {
  panel: PanelName | null;
  /** Sheep the panel is about (sheep card, forecast "for", tree root; the animal card: a PetId). Falls back sensibly when null. */
  sheepId: string | null;
  /** Selected candidate in the forecast panel. */
  mateId: string | null;
  goal: Goal;
  /** Panel-local tab (vet: selected sheep id; settings: "confirm-new"; codex: "cards" | "concepts"). */
  tab: string | null;
  /** The last wool sale, for the Reveal beside the forecast the player saw (cleared when a panel opens). */
  sale?: { forecast: number; paid: number; text: string } | undefined;
  /** The report from the last sleep, for the report panel. */
  report: SeasonReport | null;
  /** PNG data URL for a sheep (from WorldView.portrait). */
  portraits: (id: string) => string;
  /** PNG data URL of a made-up lamb with this look, for forecast litters (optional; CSS blobs without it). */
  lambArt?: (look: { wool: string; pattern: string; horns: string }) => string;
  /** PNG data URL of a farm dog or the cat (PetId), for the animal card (optional; an emoji without it). */
  petArt?: (id: string) => string;
  /** Settings: walk the farmer (default) or pan the camera (optional; saved in localStorage by the controller). */
  move?: "walk" | "pan";
  /** Settings: world detail — the saved choice (auto by default) and what the world draws now (auto may have gone lite). */
  detail?: { pref: "auto" | "full" | "lite"; now: "full" | "lite" };
  /** Settings: current reduced-motion flag (optional). */
  reducedMotion?: boolean;
  /** Settings: sound on/off and volume 0–1 (optional; saved in localStorage by the controller). */
  sound?: { on: boolean; volume: number };
  /** HUD: the bag's tray of farm places is open (optional; closed by default and whenever a panel opens). */
  tray?: boolean;
  /** Title: a save from before v3 was found and set aside: say "A new season at Kōwhai Creek" (once). */
  oldSave?: boolean;
  /** Title: whether a saved game exists to continue (optional; defaults to "state has been played"). */
  hasSave?: boolean;
}

export function defaultView(portraits: (id: string) => string = () => ""): View {
  return { panel: null, sheepId: null, mateId: null, goal: "trueblue", tab: null, report: null, portraits };
}
