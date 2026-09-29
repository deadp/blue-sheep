/** Title, help, settings, ending and the HUD. */
import {
  TUTORIAL_STEPS, canBreed, currentAct, growingLambs, lambRoom, seasonLabel, seasonOfYear, tutorialInfo, tutorialStep, type GameState,
} from "../core/index.js";
import { esc, has } from "./util.js";
import type { PanelName, View } from "./view.js";
import { ACT_ICONS, actTrack } from "./track.js";
import { lessonShown, lessonTarget, tutorialTarget } from "./tutorial.js";
import { btn, head, icon, more, pom, stitch, type IconName } from "./felt/index.js";

const FLAVOUR = [
  "Somewhere in this flock, a blue lamb is waiting to be born.",
  "Two white sheep, one black lamb. Something is hiding in the wool.",
  "Every lamb is a little surprise. Some are big ones.",
];

export function titleHtml(state: GameState, view: View): string {
  const played = view.hasSave ?? (state.season > 0 || Object.keys(state.plans).length > 0);
  const extra = `<div class="newgame"><label>Seed <input name="seed" inputmode="numeric" placeholder="random" size="8"></label>
        ${btn("New farm", { icon: "sprout", data: { newgame: "" } })}</div>
      <div class="row center">${played ? btn("Play the tutorial", { icon: "redo", kind: "ghost", data: { tutorial: "start" } }) : ""}${btn("How to play", { icon: "help", kind: "ghost", data: { open: "help" } })}</div>`;
  return `<div class="title">
    <div class="title-art" aria-hidden="true">${icon("sheep", "xl t-blue")}<span class="title-knot k1"></span><span class="title-knot k2"></span></div>
    <h1>Blue Sheep <small>of Kōwhai Creek</small></h1>
    <p class="flavour">${esc(FLAVOUR[state.seed % FLAVOUR.length])}</p>
    <div class="title-actions">
      ${played
        ? btn(`Continue · ${esc(seasonLabel(state.season))}`, { kind: "primary", cls: "big", icon: "arrow", data: { close: "" } })
        : `${btn("Start with the tutorial", { kind: "primary", cls: "big", icon: "sheep", data: { tutorial: "start" } })}
           ${btn("Skip tutorial", { kind: "secondary", data: { close: "" } })}`}
      ${more("title-more", "New farm, seed, how to play", extra)}
    </div>
  </div>`;
}

export function helpHtml(_state: GameState, _view: View): string {
  const row = (i: IconName, what: string, text: string) => `<li>${icon(i, "lg")}<span><b>${what}</b> ${text}</span></li>`;
  return `${head("help", "How to play", 2)}
  <ul class="help-list">
    ${row("sheep", "Click a sheep", "to see it and say hello.")}
    ${row("rings", "Find a mate", "shows ten make-believe lambs first.")}
    ${row("moon", "Next season", "and the lambs arrive.")}
    ${row("heart", "Say hello, brush, treat:", "fond sheep grow better wool.")}
    ${row("bag", "The bag", "holds the board, market and more.")}
  </ul>
  ${more("help-keys", "Places and keys", `<ul class="plain small">
    <li>${icon("house", "inl")} House or shed: the board and diary.</li>
    <li>${icon("store", "inl")} Market: buy and sell. ${icon("vet", "inl")} Vet: tests. ${icon("rosette", "inl")} Fairground: the autumn show. ${icon("mail", "inl")} Mailbox: letters.</li>
    <li>Forecasts use what you know, not the whole truth: surprises teach you, and the next forecast gets sharper.</li>
    <li><b>W A S D</b> or a tap walks the farmer; <b>E</b> says hello or opens a place; hold <b>F</b> to brush; <b>Tab</b> switches to panning.</li>
    <li><b>Esc</b> closes a panel.</li></ul>`)}
  <div class="row">${btn("Got it", { kind: "primary", icon: "check", data: { close: "" } })}</div>`;
}

/** Detail: Auto / Full / Lite (the world's look; auto drops to lite by itself on a slow device). */
function detailSeg(view: View): string {
  const d = view.detail ?? { pref: "auto", now: "full" };
  const b = (id: "auto" | "full" | "lite", label: string) =>
    `<button class="seg-b ${d.pref === id ? "on" : ""}" data-detail="${id}" aria-pressed="${d.pref === id ? "true" : "false"}">${label}</button>`;
  return `<div class="seg" role="group" aria-label="Detail">${b("auto", d.pref === "auto" && d.now === "lite" ? "Auto · lite" : "Auto")}${b("full", "Full")}${b("lite", "Lite")}</div>`;
}

export function settingsHtml(_state: GameState, view: View): string {
  const confirm = view.tab === "confirm-new";
  const toggle = (what: string, on: boolean) => `<button class="toggle ${on ? "on" : ""}" data-toggle="${what}" role="switch" aria-checked="${on ? "true" : "false"}"><span class="knob"></span><span class="b-t">${on ? "On" : "Off"}</span></button>`;
  const row = (i: IconName, label: string, control: string, extra = "") => `<div class="setting">${icon(i, "lg")}<b>${label}</b><div class="s-ctl">${control}</div>${extra}</div>`;
  const on = view.sound?.on ?? true;
  const vol = Math.round((view.sound?.volume ?? 0.7) * 100);
  return `${head("gear", "Settings", 2)}
    ${row("paw", "Getting about", `<button class="toggle move ${view.move === "pan" ? "on" : ""}" data-toggle="move" role="switch" aria-checked="${view.move === "pan" ? "true" : "false"}"><span class="knob"></span><span class="b-t">${view.move === "pan" ? "Pan" : "Walk"}</span></button>`)}
    ${row("sparkle", "Detail", detailSeg(view))}
    ${row("wave", "Calm motion", toggle("motion", !!view.reducedMotion))}
    ${row("sound", "Sheep voices", `${toggle("sound", on)}<label class="volume ${on ? "" : "off"}"><span class="sr">Volume</span><input type="range" min="0" max="100" step="5" value="${vol}" data-volume aria-label="Volume" ${on ? "" : "disabled"}></label>`)}
    ${row("box", "Save file", `${btn("Export", { data: { export: "1" } })}${btn("Import", { data: { import: "1" } })}`)}
    ${stitch}
    ${view.tab === "confirm-tutorial"
      ? `<div class="confirm">${icon("warn", "lg")}<span>Leave this farm for the tutorial?</span><div class="row">${btn("Yes, replay it", { kind: "danger", data: { tutorial: "start" } })}${btn("Keep this one", { data: { tab: "" } })}</div></div>`
      : row("redo", "Replay the tutorial", btn("Replay…", { kind: "ghost", data: { tab: "confirm-tutorial" } }))}
    ${confirm
      ? `<div class="confirm">${icon("warn", "lg")}<span>Really leave this farm?</span><div class="row">${btn("Yes, new farm", { kind: "danger", data: { newgame: "" } })}${btn("Keep this one", { data: { tab: "" } })}</div></div>`
      : row("sprout", "Start over", btn("New game…", { kind: "ghost", data: { tab: "confirm-new" } }))}
    <div class="row">${btn("Done", { kind: "primary", icon: "check", data: { close: "" } })}</div>`;
}

function tookWords(seasons: number): string {
  const y = Math.floor(seasons / 4), s = seasons % 4;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (!y) return part(s, "season");
  return s ? `${part(y, "year")} and ${part(s, "season")}` : part(y, "year");
}

export function endingHtml(state: GameState, _view: View): string {
  const st = state.stats;
  const stat = (i: IconName, n: number, label: string) => `<div class="stat">${icon(i, "lg")}<b>${n}</b><span>${esc(label)}</span></div>`;
  return `<div class="ending">
    <div class="confetti" aria-hidden="true">${"<i></i>".repeat(18)}</div>
    <div class="title-art" aria-hidden="true">${icon("rosette", "xl")}</div>
    <h1>A breed of your own</h1>
    <p>Six blue sheep, fine wool, healthy lines. The registry has a new page with your farm's name on it.</p>
    <div class="stats">${stat("sheep", st.lambsBorn, "lambs born")}${stat("heart", st.bluesBorn, "blue lambs")}${stat("sparkle", st.discoveries, "discoveries")}${stat("mail", st.ordersFilled, "orders filled")}${stat("rosette", st.fairsWon, "rosettes")}${stat("coin", st.coinsEarned, "coins earned")}</div>
    <p class="meta">It took ${tookWords(state.season)}.</p>
    <div class="row center">${btn("Keep farming", { kind: "primary", cls: "big", icon: "sheep", data: { close: "" } })}${btn("Start a new farm", { icon: "sprout", data: { newgame: "" } })}</div>
  </div>`;
}

// ---- HUD --------------------------------------------------------------------

/** "Your lambs are still growing — they can breed from Year 2, Spring." (null when there are no lambs). */
export function growingText(state: GameState, sex?: "ewe" | "ram"): string | null {
  const g = growingLambs(state, sex);
  if (!g.count || g.readySeason === null) return null;
  const who = sex ? `Your ${sex} lamb${g.count === 1 ? " is" : "s are"}` : `Your lamb${g.count === 1 ? " is" : "s are"}`;
  const subject = g.count > 1 ? "the first" : sex === "ewe" ? "she" : sex === "ram" ? "he" : "it";
  return `${who} still growing — ${subject} can breed from ${seasonLabel(g.readySeason)}.`;
}

function hint(state: GameState, view: View): { text: string; icon: IconName; market?: string } | null {
  const n = Object.keys(state.plans).length;
  if (view.panel === "forecast") return null;
  if (state.season === 0 && n === 0) return { icon: "sheep", text: "Click a sheep to meet it." };
  if (n > 0) return { icon: "moon", text: `${n} mating${n === 1 ? "" : "s"} planned. Press Next season when you're ready.` };
  if (lambRoom(state) < 1) {
    const g = growingText(state);
    return { icon: "fence", text: `Your fields are full, so no lambs can be planned.${g ? ` ${g}` : ""}`, market: "Sell a sheep to make room" };
  }
  const ready = state.flock.map((id) => state.sheep[id]!).filter((x) => canBreed(x, state.season));
  const hired = state.hiredRam ? 1 : 0;
  for (const sex of ["ram", "ewe"] as const) {
    if (sex === "ram" && hired) continue;
    if (ready.some((x) => x.sex === sex)) continue;
    const g = growingText(state, sex);
    return { icon: "sprout", text: `No ${sex} is ready to breed this season.${g ? ` ${g}` : ""}`, market: `Buy a grown ${sex}` };
  }
  return null;
}

function hudHint(state: GameState, view: View): string {
  const h = hint(state, view);
  if (!h) return "";
  return `<div class="hud-hint" data-hud-piece="hint">${icon(h.icon)}<span>${esc(h.text)}${h.market ? ` <button class="link" data-open="market">${esc(h.market)} at the market</button>` : ""}</span></div>`;
}

const SEASON_ICON: IconName[] = ["flower", "sun", "leaf", "snow"];
const SEASON_TONE: string[] = ["rose", "butter", "rust", "sky"];

/** While the tutorial runs (until its goal step) the goal tag tracks the tutorial instead of the act. */
function goalPill(state: GameState): string {
  const a = currentAct(state);
  const tut = tutorialInfo(state);
  const id = tutorialStep(state);
  if (tut && id && id !== "goal" && id !== "done") {
    const def = TUTORIAL_STEPS[tut.step - 1]!;
    return `<button class="pill goal tut" data-open="help" data-hud-piece="goal" title="Tutorial: step ${tut.step} of ${TUTORIAL_STEPS.length}">${icon("tom")}<span class="g-text"><span class="g-act">Tutorial ${tut.step}/${TUTORIAL_STEPS.length}</span>${esc(def.title)}</span></button>`;
  }
  return `<button class="pill goal" data-open="board" data-hud-piece="goal" title="${esc(`${a.endless ? "Endless" : `Act ${a.act + 1}`} · ${a.title}: ${a.progressText}`)}">${icon(ACT_ICONS[Math.min(a.act, ACT_ICONS.length - 1)]!)}<span class="g-text">${esc(a.goalText)}</span>${actTrack(state, true)}</button>`;
}

/** Everything that can live in the bag's tray, in order, with whether it has arrived yet. */
function trayItems(state: GameState): { panel: PanelName; label: string; icon: IconName; badge?: number }[] {
  const openOrders = state.orders.filter((o) => o.status === "open").length;
  const items: { panel: PanelName; label: string; icon: IconName; badge?: number; on: boolean }[] = [
    { panel: "board", label: "Board", icon: "board", on: true },
    { panel: "orders", label: "Letters", icon: "mail", badge: openOrders, on: has(state, "orders") },
    { panel: "market", label: "Market", icon: "store", on: true },
    { panel: "vet", label: "Vet", icon: "vet", on: has(state, "vet") },
    { panel: "fair", label: "Fair", icon: "rosette", on: has(state, "fair") },
    { panel: "codex", label: "Codex", icon: "book", on: has(state, "cards") },
    { panel: "help", label: "Help", icon: "help", on: true },
    { panel: "settings", label: "Settings", icon: "gear", on: true },
  ];
  return items.filter((i) => i.on);
}

/** Is the tutorial or a lesson pointing into the tray? Then the tray stays open so the target can be seen. */
function trayTargeted(state: GameState, view: View): boolean {
  const t = tutorialStep(state) ? tutorialTarget(state, view) : lessonTarget(state, view);
  if (!t) return false;
  const sels = t.kind === "html" ? t.selectors : t.rings ?? [];
  return sels.some((x) => /^#hud \[data-open=/.test(x));
}

export function hudHtml(state: GameState, view: View): string {
  const nPlans = Object.keys(state.plans).length;
  const [year, season] = seasonLabel(state.season).split(", ");
  const soy = seasonOfYear(state.season);
  const items = trayItems(state);
  const open = !!view.tray || trayTargeted(state, view);
  const letters = items.find((i) => i.panel === "orders")?.badge ?? 0;
  const tray = items.map((i) =>
    `<button class="tray-b ${view.panel === i.panel ? "on" : ""}" data-open="${i.panel}" title="${esc(i.label)}">${icon(i.icon)}<span>${esc(i.label)}</span>${i.badge ? `<span class="badge">${i.badge}</span>` : ""}</button>`).join("");
  return `<div class="hud-top">
    <div class="hud-poms">
      ${pom("season", SEASON_ICON[soy]!, esc(season ?? ""), esc(year ?? ""), { tone: SEASON_TONE[soy] ?? "cream", title: seasonLabel(state.season) })}
      ${pom("coins", "coin", String(state.money), "", { tone: "butter", title: "Coins" })}
      ${pom("flock", "sheep", `${state.flock.length}<span class="dim">/${state.flockCap}</span>`, "", { tone: "cream", title: "Sheep in your flock / room" })}
    </div>
    ${goalPill(state)}
  </div>
  ${tutorialStep(state) || lessonShown(state, view) ? "" : hudHint(state, view)}
  <div class="hud-dock">
    <div class="tray ${open ? "open" : ""}" data-hud-piece="tray" ${open ? "" : "hidden"} role="menu" aria-label="Farm places">${tray}</div>
    <div class="hud-acts">
      <button class="bag ${open ? "on" : ""}" data-tray="${open ? "close" : "open"}" data-hud-piece="bag" aria-expanded="${open}" aria-label="Farm places" title="Farm places">${icon("bag")}${letters && !open ? `<span class="badge">${letters}</span>` : ""}</button>
      <button class="hud-sleep sky" data-sleep="1" data-hud-piece="sleep" title="End the season">${icon("moon")}<span class="b-t">Next season</span>${nPlans ? `<span class="badge">${nPlans}</span>` : ""}</button>
    </div>
  </div>`;
}
