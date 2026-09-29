/**
 * The controller: owns the GameState and the View, wires core + world3d + ui together, handles deep links,
 * saving, the sleep flow, and exposes `window.__game` for the probes (CONTRACTS.md §6 and §8).
 */
import {
  acceptOrder, advanceSeason, buySheep, buyUpgrade, hasUpgrade, upgradeDef, canBreed, declineOrder, deserialize, enterFair, forecastCross, forecastFair,
  forecastOrder, hireVisitingRam, isAdult, isEnding, markEndingShown, newGame, planMating, renameSheep, sellSheep,
  seasonOfYear, serialize, unplanMating, vetTest, yearOf, personalityOf,
  advanceTutorial, newTutorialGame, skipTutorial, tutorialActive, tutorialInfo, tutorialStep, TUTORIAL_STEPS,
  ackLesson, advanceLesson, lessonInfo, lessonStepMet, skipLesson, tutorialOver, LESSONS,
  greetAnimal, giveTreat, brushAnimal, fondnessOf, isPetId, ownedPets, PET_NAME, forecastUpgrade, upgradeBlocked, upgradeOffered,
  type GameState, type Goal, type PetId, type Sheep, type UpgradeId,
} from "./core/index.js";
import { Hold, WorldView, type AreaId, type Hotspot, type LandInfo, type MoveMode, type PetKind, type WorldSheep, type WorldSnapshot, type Zone } from "./world3d/index.js";
import {
  Overlay, PANEL_NAMES, defaultView, delegateActions, hudHtml, panelOptions, renderPanel, toast,
  mentorHtml, tutorialStepMet, tutorialTarget, lessonShown, lessonTarget, lessonMentorHtml,
  type ActionData, type PanelName, type TutorialTarget, type View,
} from "./ui/index.js";
import { fastForward } from "./debug.js";
import { Voices, bleatSeries, happySeries, petVoiceFor, renderOffline, voiceFor, type Voice, type VoiceInput } from "./audio/index.js";

export const SAVE_KEY = "blue-sheep-save-v2";
const MOTION_KEY = "blue-sheep-reduced-motion";
/** Walk (default) or pan: how the player gets about the farm (a setting, not game state). */
const MOVE_KEY = "blue-sheep-move-mode";
/** World detail: auto (default; drops to lite by itself on a slow device), full or lite — a setting, not game state. */
const DETAIL_KEY = "blue-sheep-detail";
/** Set once the "lighter look" toast has been shown, so auto-lite only ever tells the player once. */
const AUTOLITE_TOLD_KEY = "blue-sheep-autolite-told";
type DetailPref = "auto" | "full" | "lite";
export const VERSION = "1.0.0";
/** Sheep that fit in the home paddock before the rest move to the creek flats (and the flats before the far bank). */
const PADDOCK_ROOM = 10;
const FLATS_ROOM = 8;
/** Which farm improvement opens which land (DESIGN-v3 §9): mending the far paddock's fence opens the creek flats,
 *  renting the long meadow builds the bridge to the far bank. */
const LAND_UPGRADE: Partial<Record<AreaId, UpgradeId>> = { flats: "paddock", farbank: "meadow" };
/** Milliseconds of press-and-hold on a dog's or the cat's picture that make one pat (the same as a sheep's brushing). */
const PAT_HOLD_MS = 1200;

export type Action =
  | { type: "plan"; ewe: string; ram: string }
  | { type: "unplan"; ewe: string }
  | { type: "sleep" }
  | { type: "buy"; id: string }
  | { type: "sell"; id: string }
  | { type: "test"; id: string; locus: string }
  | { type: "accept"; id: string }
  | { type: "decline"; id: string }
  | { type: "enter"; id: string | null }
  | { type: "hire" }
  | { type: "upgrade"; id: string }
  /** Give a sheep in the flock, or an owned dog/cat, a treat (1 coin, once a season). Greeting is opening its card. */
  | { type: "treat"; id: string }
  /** Brush a sheep (pat a dog or the cat): once a season. In the game it is a press-and-hold on the live portrait. */
  | { type: "brush"; id: string }
  | { type: "rename"; id: string; name: string }
  | { type: "newGame"; seed?: number }
  | { type: "open"; panel: PanelName; id?: string }
  | { type: "close" }
  /** start: a new tutorial game; ack: the mentor's "Got it"; skip: end the tutorial now (the flock arrives). */
  | { type: "tutorial"; op: "start" | "ack" | "skip"; seed?: number }
  /** The running mini-lesson (core/lessons.ts): ack = the mentor's button on an informational step; skip = end it. */
  | { type: "lesson"; op: "ack" | "skip" };

type Marker = NonNullable<WorldSheep["marker"]> | null;
const COLOURS = new Set(["white", "black", "brown", "blue", "fawn"]);

function randomSeed(): number {
  return (Date.now() % 1_000_000) + 1;
}

export class App {
  state: GameState;
  readonly view: View;
  private world!: WorldView;
  private readonly worldEl: HTMLElement;
  private readonly hudEl: HTMLElement;
  private readonly overlay: Overlay;
  private reduced: boolean;
  private move: MoveMode;
  /** The Detail setting (or `?detail=` / `?lite=1` for this page), and whether auto has gone lite. */
  private detail: DetailPref;
  private autoWentLite = false;
  /** False while a `?seed=` / `?act=` preview runs: the old save is kept until the player acts. */
  private persist: boolean;
  private sleeping = false;
  private closing = false;
  /** Stops the sheep card's live portrait. */
  private portraitStop: (() => void) | null = null;
  /** The sheep the world camera is visiting (sheep card open). */
  private attendedId: string | null = null;
  /** The pet whose card is open (so re-renders don't bark again). */
  private petShown: string | null = null;
  // ---- tutorial: the mentor card, the arrow, what it points at
  private readonly mentorEl: HTMLElement;
  private readonly arrowEl: HTMLElement;
  private tutTarget: TutorialTarget = null;
  private tutStepSeen = "";
  private tutFrame = 0;
  /** Target + window size last scrolled into view (so the player can still scroll freely afterwards). */
  private tutScrollKey = "";
  /** Sheep voices (WebAudio). Settings live in localStorage, not in the game state. */
  private readonly voices = new Voices();
  /** Hearts to float up in the world after the next render (a greeting or a treat): id → how many. */
  private loveQueue = new Map<string, number>();

  constructor() {
    const q = new URLSearchParams(location.search);
    if (q.get("fresh") === "1") { try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ } }
    this.reduced = q.get("nomotion") === "1" || this.loadMotionPref();
    // ?lite=1 and ?detail=… pin the detail for this page (probes pin it so software GL never flips a screenshot)
    const qd = q.get("detail");
    this.detail = q.get("lite") === "1" ? "lite" : qd === "auto" || qd === "full" || qd === "lite" ? qd : this.loadDetailPref();
    this.move = q.get("move") === "pan" || q.get("move") === "walk" ? (q.get("move") as MoveMode) : this.loadMovePref();
    document.body.classList.toggle("reduced-motion", this.reduced);

    this.view = defaultView((id) => this.portraitOf(id));
    this.view.reducedMotion = this.reduced;
    this.view.move = this.move;
    this.view.detail = { pref: this.detail, now: this.detail === "lite" ? "lite" : "full" };
    this.view.lambArt = (l) => this.lambArt(l);
    this.view.petArt = (id) => { try { return isPetId(id) ? this.world.petPortrait(id as PetKind, 180) : ""; } catch { return ""; } };
    this.view.sound = { on: this.voices.on, volume: this.voices.volume };

    // ---- which game?
    let panel: PanelName | null = null;
    const seedParam = q.get("seed");
    const seed = seedParam !== null && Number.isFinite(Number(seedParam)) ? Math.floor(Number(seedParam)) : null;
    if (q.get("act") !== null) {
      const ff = fastForward(seed ?? 7, Number(q.get("act")));
      this.state = ff.state;
      this.view.report = ff.report;
      this.persist = false;
    } else if (q.get("tutorial") === "1") {
      this.state = newTutorialGame(seed ?? randomSeed());
      this.persist = false;
    } else if (seed !== null) {
      this.state = newGame(seed);
      this.persist = false;
    } else {
      const saved = this.loadSave();
      this.view.hasSave = !!saved;
      this.state = saved ?? newGame(randomSeed());
      this.persist = true;
      panel = "title";
    }
    const want = q.get("panel");
    if (want && (PANEL_NAMES as string[]).includes(want)) panel = want as PanelName;

    // ---- DOM
    this.worldEl = document.querySelector<HTMLElement>("#world") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "world" }));
    this.hudEl = document.querySelector<HTMLElement>("#hud") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "hud" }));
    this.overlay = new Overlay((d) => this.onData(d), "#overlay");
    this.overlay.onClose = () => this.onOverlayClosed();
    delegateActions(this.hudEl, (d) => this.onData(d));
    for (const ev of ["input", "change"] as const) {
      this.overlay.el.addEventListener(ev, (e) => {
        const t = e.target as HTMLInputElement;
        if (t?.matches?.("input[data-volume]")) this.onVolume(t, ev === "change");
      });
    }
    this.mentorEl = document.body.appendChild(Object.assign(document.createElement("div"), { id: "mentor" }));
    this.mentorEl.hidden = true;
    delegateActions(this.mentorEl, (d) => this.onData(d));
    this.arrowEl = document.body.appendChild(Object.assign(document.createElement("div"), { id: "tut-arrow" }));
    this.arrowEl.setAttribute("aria-hidden", "true");
    this.arrowEl.innerHTML = `<svg viewBox="0 0 40 48" width="40" height="48"><path d="M13 2h14v22h11L20 46 2 24h11z" /></svg>`;
    this.arrowEl.hidden = true;
    this.makeWorld();

    if (panel) this.openPanel(panel, undefined);
    this.render();
    this.exposeHook();
    // Ready after the first frame and the felt fonts (so screenshots never catch a fallback face).
    const fonts = (document as { fonts?: FontFaceSet }).fonts;
    const ready = () => requestAnimationFrame(() => requestAnimationFrame(() => { document.body.dataset.ready = "1"; }));
    if (fonts) void Promise.race([fonts.load("16px 'Patrick Hand'").then(() => fonts.load("700 16px Nunito")), new Promise((r) => setTimeout(r, 1500))]).then(ready, ready);
    else ready();
  }

  // ------------------------------------------------------------------ world

  private makeWorld(): void {
    this.portraitStop = null;
    this.attendedId = null;
    this.world = new WorldView(this.worldEl, {
      onSheep: (id) => this.guard(() => this.onSheepClick(id)),
      onHotspot: (h) => this.guard(() => this.onHotspot(h)),
      // a scratch behind the ears: it bleats, and (cosmetic only) a couple of hearts float up in the field
      onPortraitClick: (id) => { this.bleat(id, true); if (this.state.flock.includes(id)) this.world.love(id, 2); },
      onPet: (id) => this.guard(() => this.onPetClick(id)),
      // brushing the live portrait: a swish per stroke; a full brushing counts for fondness once a season
      onBrush: (id, phase) => { if (phase === "stroke") this.voices.swish(); else this.guard(() => this.brush(id)); },
      // a felt price tag's "Open this land": the market's improvements, with that one's forecast
      onArea: (id) => this.guard(() => this.onArea(id)),
      onMoveMode: (m) => this.setMove(m),
      // auto detail found the frames slow and went lite: say so once, ever (the setting stays Auto)
      onAutoLite: () => {
        this.autoWentLite = true;
        this.view.detail = { pref: this.detail, now: "lite" };
        if (this.view.panel === "settings") this.render();
        let told = false;
        try { told = localStorage.getItem(AUTOLITE_TOLD_KEY) === "1"; localStorage.setItem(AUTOLITE_TOLD_KEY, "1"); } catch { /* private mode */ }
        if (!told) toast("Switched to a lighter look for smoother play — change in Settings", 5200);
      },
    }, { seed: this.state.seed, reducedMotion: this.reduced, move: this.move, detail: this.detail });
    this.autoWentLite = false;
    this.view.detail = { pref: this.detail, now: this.detail === "lite" ? "lite" : "full" };
    this.world.setSnapshot(this.snapshot());
  }

  // ------------------------------------------------------------------ voices

  /**
   * The stable voice of a sheep: age, sex, size and temperament (all visible traits), plus its id; fondness
   * only warms its delivery. Dogs and the cat (PetId) bark and mew.
   */
  private voiceOf(id: string): Voice | null {
    if (isPetId(id)) return petVoiceFor(id, fondnessOf(this.state, id));
    const s = this.state.sheep[id];
    if (!s) return null;
    return voiceFor({
      id: s.id, sex: s.sex, adult: isAdult(s, this.state.season), ageSeasons: this.state.season - s.born,
      size: Number(s.phenotype["size"] ?? 60), personality: personalityOf(s),
      ...(this.state.flock.includes(s.id) ? { fondness: fondnessOf(this.state, s.id) } : {}),
    });
  }

  /** A sheep says hello (card opened, clicked in the field or in its portrait). */
  private bleat(id: string, force = false): void {
    const v = this.voiceOf(id);
    if (v) this.voices.bleat(v, { force });
  }

  /** The report's new lambs: a soft staggered chorus, a few at most. */
  private lambChorus(ids: string[]): void {
    const lambs = ids.map((id) => this.voiceOf(id)).filter((v): v is Voice => !!v).slice(0, 4);
    lambs.forEach((v, i) => {
      const steps = bleatSeries(v).slice(0, 2);
      this.voices.bleat(v, { steps, delay: 0.25 + i * 0.38 + Math.random() * 0.12, gain: 0.55, force: true });
    });
  }

  private onSheepClick(id: string): void {
    if (this.sleeping) return;
    // clicking the sheep whose card is already open: it just says something again
    if (this.view.panel === "sheep" && this.view.sheepId === id) this.bleat(id);
    this.openPanel("sheep", id);
    this.render();
  }

  private onPetClick(id: PetKind): void {
    if (this.sleeping) return;
    if (this.view.panel === "animal" && this.view.sheepId === id) this.bleat(id);
    this.openPanel("animal", id);
    this.render();
  }

  private onHotspot(h: Hotspot): void {
    if (this.sleeping) return;
    const s = this.state;
    const map: Record<Hotspot, PanelName> = {
      house: "board", shed: "board", market: "market", vet: "vet", fairground: "fair", mailbox: "orders",
    };
    if (h === "mailbox" && !s.unlocks.includes("orders")) { toast("The mailbox is empty. Letters will come once folk hear about your flock."); return; }
    if (h === "vet" && !s.unlocks.includes("vet")) { toast("The vet's hut is shut for now."); return; }
    if (h === "fairground" && !s.unlocks.includes("fair")) { toast("The fairground is quiet. The village fair comes later."); return; }
    this.openPanel(map[h], undefined);
    this.render();
  }

  /** "Open this land" on a price tag: the improvement that opens it, in the market, with its forecast. */
  private onArea(id: AreaId): void {
    if (this.sleeping) return;
    const up = LAND_UPGRADE[id];
    if (!up) { toast("That land comes later."); return; }
    this.openPanel("market", undefined);
    this.render();
    const card = this.overlay.el.querySelector<HTMLElement>(`[data-upgrade-card="${up}"]`);
    if (card) { card.scrollIntoView({ block: "center" }); card.classList.add("flash"); window.setTimeout(() => card.classList.remove("flash"), 1600); }
  }

  /** Walk or pan, remembered in this browser. */
  private setMove(m: MoveMode): void {
    this.move = m;
    try { localStorage.setItem(MOVE_KEY, m); } catch { /* ignore */ }
    this.world.setMoveMode(m);
    this.view.move = m;
    if (this.view.panel === "settings") this.render();
  }

  /** Detail: Auto / Full / Lite, remembered in this browser; a fresh world is built with it. */
  private setDetail(d: DetailPref): void {
    if (d === this.detail) return;
    this.detail = d;
    try { localStorage.setItem(DETAIL_KEY, d); } catch { /* ignore */ }
    this.world.dispose();
    this.makeWorld();
    this.render();
  }

  private loadDetailPref(): DetailPref {
    try { const v = localStorage.getItem(DETAIL_KEY); return v === "full" || v === "lite" ? v : "auto"; } catch { return "auto"; }
  }

  private loadMovePref(): MoveMode {
    try { return localStorage.getItem(MOVE_KEY) === "pan" ? "pan" : "walk"; } catch { return "walk"; }
  }

  /** The land for the world: home, the creek flats and far bank (opened by improvements), the rest later. */
  private landInfo(): LandInfo[] {
    const s = this.state;
    const lock = (id: AreaId, open: boolean): LandInfo => {
      const up = LAND_UPGRADE[id]!;
      if (open) return { id, state: "open" };
      const d = upgradeDef(up).price;
      const blocked = upgradeBlocked(s, up);
      const note = !upgradeOffered(s, up) ? "Opens later on" : blocked && !/coins/.test(blocked) ? blocked.replace(/\.$/, "") : undefined;
      return { id, state: "locked", price: d, can: blocked === null || /coins/.test(blocked), ...(note ? { note } : {}) };
    };
    return [
      { id: "home", state: "open" },
      lock("flats", this.paddock2Open()),
      lock("farbank", hasUpgrade(s, "meadow")),
      { id: "rushy", state: "later" },
      { id: "terraces", state: "later" },
    ];
  }

  private portraitOf(id: string): string {
    const s = this.state.sheep[id];
    if (!s) return "";
    try { return this.world.portrait(this.worldSheep(s, "paddock", null), 96); } catch { return ""; }
  }

  /** A cached portrait of a made-up lamb with this look (forecast litters). */
  private lambArt(l: { colour: string; pattern: string; horns: string }): string {
    const colour = (COLOURS.has(l.colour) ? l.colour : "white") as WorldSheep["colour"];
    const ws: WorldSheep = {
      id: `lamb-art-${colour}-${l.pattern}-${l.horns}`, name: "lamb", sex: l.horns === "horned" ? "ram" : "ewe", adult: false,
      colour, pattern: l.pattern === "spotted" ? "spotted" : "solid", horns: l.horns === "horned" ? "horned" : "polled",
      size: 46, fleeceWeight: 3.8, fineness: 24, crimp: 5, zone: "paddock", marker: null,
    };
    try { return this.world.portrait(ws, 72); } catch { return ""; }
  }

  private worldSheep(s: Sheep, zone: Zone, marker: Marker): WorldSheep {
    const p = s.phenotype;
    const colour = String(p["colour"]);
    return {
      id: s.id, name: s.name, sex: s.sex, adult: isAdult(s, this.state.season),
      colour: (COLOURS.has(colour) ? colour : "white") as WorldSheep["colour"],
      pattern: p["pattern"] === "spotted" ? "spotted" : "solid",
      horns: p["horns"] === "horned" ? "horned" : "polled",
      size: Number(p["size"] ?? 60), fleeceWeight: Number(p["fleeceWeight"] ?? 4),
      fineness: Number(p["fineness"] ?? 26), crimp: Number(p["crimp"] ?? 5),
      zone, marker, personality: personalityOf(s), dam: s.dam, fondness: fondnessOf(this.state, s.id),
    };
  }

  /** Second paddock opens with the bigger flock (cap 16, act 3 onward) or when the player mends its fence. */
  private paddock2Open(): boolean {
    return this.state.flockCap >= 16 || this.state.act >= 3 || hasUpgrade(this.state, "paddock");
  }

  snapshot(): WorldSnapshot {
    const s = this.state;
    const winter = seasonOfYear(s.season) === 3;
    const planned = new Set<string>([...Object.keys(s.plans), ...Object.values(s.plans)]);
    const selected = this.view.panel === "sheep" || this.view.panel === "forecast" ? this.view.sheepId : null;
    const p2 = this.paddock2Open();
    const pointAt = this.tutTarget?.kind === "sheep" ? this.tutTarget.id : null;
    const marker = (x: Sheep): Marker => {
      if (x.id === selected || x.id === pointAt) return "selected";
      if (planned.has(x.id)) return "planned";
      if (x.ill) return "ill";
      if (x.born === s.season && x.origin === "bred") return "new";
      if (x.rosettes.length) return "rosette";
      return null;
    };
    const out: WorldSheep[] = [];
    const meadow = hasUpgrade(s, "meadow");
    let inPaddock = 0, inFlats = 0;
    for (const id of s.flock) {
      const x = s.sheep[id];
      if (!x) continue;
      let zone: Zone;
      if (x.ill || (winter && !isAdult(x, s.season))) zone = "barn";
      else if (p2 && inPaddock >= PADDOCK_ROOM) {
        if (meadow && inFlats >= FLATS_ROOM) zone = "meadow";
        else { zone = "paddock2"; inFlats++; }
      } else { zone = "paddock"; inPaddock++; }
      out.push(this.worldSheep(x, zone, marker(x)));
    }
    for (const id of s.market) {
      const x = s.sheep[id];
      if (x && !s.flock.includes(id)) out.push(this.worldSheep(x, "market", id === selected ? "selected" : null));
    }
    const v = s.visitingRam && s.visitingRam.season === s.season ? s.sheep[s.visitingRam.id] : undefined;
    if (v && !s.flock.includes(v.id)) out.push(this.worldSheep(v, "visitor", v.id === selected ? "selected" : planned.has(v.id) ? "planned" : null));
    return {
      season: seasonOfYear(s.season) as 0 | 1 | 2 | 3,
      year: yearOf(s.season) + 1,
      sheep: out,
      selected,
      paddock2: p2,
      visitorPresent: !!v,
      fairToday: s.unlocks.includes("fair") && s.fair.nextSeason === s.season,
      upgrades: [...(s.upgrades ?? [])],
      pets: ownedPets(s).map((p) => ({ id: p, name: PET_NAME[p], fondness: fondnessOf(s, p) })),
      land: this.landInfo(),
    };
  }

  // ------------------------------------------------------------------ rendering

  private render(): void {
    this.tutorialAdvance();
    this.hudEl.innerHTML = hudHtml(this.state, this.view);
    if (this.view.panel) {
      this.overlay.show(renderPanel(this.state, this.view), panelOptions(this.view.panel));
    } else if (this.overlay.open) {
      this.closing = true;
      this.overlay.close();
      this.closing = false;
    }
    document.body.dataset.panel = this.view.panel ?? "";
    this.world.setKeys(!this.view.panel && !this.sleeping);
    this.world.setSnapshot(this.snapshot());
    this.syncSheepLife();
    this.syncPetPat();
    this.renderTutorial();
    for (const [id, n] of this.loveQueue) this.world.love(id, n);
    this.loveQueue.clear();
  }

  /**
   * Say hello to an animal whose card has just opened: fondness grows once per animal per season. When it
   * does, hearts float up in the field and the game saves.
   */
  private greet(id: string): void {
    if (greetAnimal(this.state, id) > 0) {
      this.loveQueue.set(id, Math.max(this.loveQueue.get(id) ?? 0, 3));
      this.persist = true;
      this.save();
    }
  }

  /** A treat (the card's button or the probe action): costs a coin, more hearts, a happy noise. */
  private treat(id: string): void {
    const name = isPetId(id) ? PET_NAME[id] : this.state.sheep[id]?.name ?? "It";
    this.mutate(() => giveTreat(this.state, id));
    this.loveQueue.set(id, 6);
    this.bleat(id, true);
    toast(`${name} loved that!`);
  }

  /**
   * A full brushing (a sheep's live portrait) or pat (a dog's or the cat's picture): a contented noise every
   * time; fondness and hearts in the field once per animal per season (core `brushAnimal`), then the card
   * re-renders to show "Brushed this season".
   */
  private brush(id: string): void {
    const v = this.voiceOf(id);
    if (v) this.voices.bleat(v, { steps: happySeries(v), force: true, gain: 0.8 });
    if (!this.sleeping && brushAnimal(this.state, id) > 0) {
      const name = isPetId(id) ? PET_NAME[id] : this.state.sheep[id]?.name ?? "It";
      this.loveQueue.set(id, Math.max(this.loveQueue.get(id) ?? 0, 4));
      this.persist = true;
      this.save();
      toast(isPetId(id) ? `${name} loved that pat!` : `${name} loved that brush!`);
      this.render();
    }
    if (!isPetId(id)) this.world.portraitCheer();
  }

  /** The animal card's picture: press and hold it to pat the dog or the cat (a ring fills; let go early and nothing happens). */
  private syncPetPat(): void {
    if (this.view.panel !== "animal") return;
    const id = this.view.sheepId;
    const stage = this.overlay.el.querySelector<HTMLElement>(".pet-stage");
    if (!id || !stage || stage.dataset.pat) return;
    stage.dataset.pat = id;
    stage.style.touchAction = "none";
    const heart = (x: number, y: number) => {
      const h = document.createElement("span");
      h.className = "brush-heart";
      h.textContent = "♥";
      h.style.left = `${Math.round(x)}px`;
      h.style.top = `${Math.round(y)}px`;
      stage.appendChild(h);
      window.setTimeout(() => h.remove(), 1300);
    };
    let beat = { heart: 0, swish: 0 };
    const hold = new Hold(stage, {
      onTick: (_p, x, y) => {
        const ms = hold.heldMs;
        const r = stage.getBoundingClientRect();
        if (ms - beat.swish >= 400) { beat.swish = ms; this.voices.swish(0.25); }
        if (ms - beat.heart >= 320) { beat.heart = ms; heart(x - r.left, y - r.top - 10); }
      },
      onDone: () => {
        const r = stage.getBoundingClientRect();
        for (let i = 0; i < 4; i++) heart(r.width * (0.3 + 0.4 * Math.random()), r.height * 0.3);
        this.guard(() => this.brush(id));
      },
    }, PAT_HOLD_MS);
    stage.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      beat = { heart: 0, swish: 0 };
      hold.down(e.clientX, e.clientY);
      try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      e.preventDefault();
    });
    stage.addEventListener("pointermove", (e) => hold.move(e.clientX, e.clientY));
    stage.addEventListener("pointerup", () => hold.up());
    stage.addEventListener("pointercancel", () => hold.up());
  }

  // ------------------------------------------------------------------ tutorial and mini-lessons

  /** Old Tom is on screen: the tutorial, or a mini-lesson for a newly arrived concept. */
  private guideOn(): boolean {
    return tutorialActive(this.state) || lessonShown(this.state, this.view);
  }

  /** If the player has just done what the tutorial step (or lesson step) asked, move on (possibly several steps). */
  private tutorialAdvance(): void {
    if (this.sleeping) return;
    let moved = false;
    if (tutorialActive(this.state)) {
      for (let i = 0; i < TUTORIAL_STEPS.length && tutorialStepMet(this.state, this.view); i++) {
        const id = tutorialStep(this.state);
        if (!id || !advanceTutorial(this.state, id)) break;
        moved = true;
      }
    } else if (lessonShown(this.state, this.view)) {
      for (let i = 0; i < 6 && lessonStepMet(this.state, this.view); i++) {
        const l = lessonInfo(this.state);
        if (!l || !advanceLesson(this.state, l.stepId)) break;
        moved = true;
      }
    }
    if (moved) { this.persist = true; this.save(); }
  }

  /** The mentor card, the ring on the thing to click and the arrow pointing at it. */
  private renderTutorial(): void {
    const tut = tutorialActive(this.state);
    const on = this.guideOn();
    const info = tutorialInfo(this.state);
    const lesson = !tut && on ? lessonInfo(this.state) : null;
    const target = tut ? tutorialTarget(this.state, this.view) : on ? lessonTarget(this.state, this.view) : null;
    const changedTarget = JSON.stringify(target) !== JSON.stringify(this.tutTarget);
    this.tutTarget = target;
    if (changedTarget) this.world.setSnapshot(this.snapshot()); // the pointed-at sheep gets a ring
    document.body.classList.toggle("tut-on", on);
    const hudTarget = target?.kind === "html" && target.selectors[0]!.startsWith("#hud");
    document.body.classList.toggle("tut-hud-top", on && hudTarget && !!this.view.panel);
    const html = tut ? mentorHtml(this.state, this.view) : on ? lessonMentorHtml(this.state, this.view) : "";
    if (this.mentorEl.innerHTML !== html) this.mentorEl.innerHTML = html;
    this.mentorEl.hidden = !on;
    document.body.dataset.tutorial = tut && info ? String(info.step) : "";
    document.body.dataset.lesson = lesson ? `${lesson.id}:${lesson.step}` : "";
    // A new step that points at a sheep or a place in the field: bring it into view (unless a card is being visited).
    const step = tut && info ? `t${info.step}` : lesson ? `${lesson.id}${lesson.step}` : "";
    if (step !== this.tutStepSeen) {
      this.tutStepSeen = step;
      // (With another sheep's card open the camera is visiting that one: glide over to the new target.)
      if (target?.kind === "sheep" && !(this.view.panel === "sheep" && this.view.sheepId === target.id)) this.world.focus(target.id);
      if (target?.kind === "spot" && !this.view.panel) this.world.focus(target.id as Hotspot);
    }
    this.applyRings();
    if (on && !this.tutFrame) this.tutFrame = requestAnimationFrame(this.tutorialFrame);
    if (!on) this.arrowEl.hidden = true;
  }

  private applyRings(): void {
    const t = this.tutTarget;
    const sels = !t ? [] : t.kind === "html" ? t.selectors : t.rings ?? [];
    const want = new Set<Element>();
    for (const sel of sels) document.querySelectorAll(sel).forEach((el) => want.add(el));
    document.querySelectorAll(".tut-ring").forEach((el) => { if (!want.has(el)) el.classList.remove("tut-ring"); });
    for (const el of want) el.classList.add("tut-ring");
  }

  /** Every frame while the tutorial runs: keep the arrow on its (possibly wandering) target. */
  private readonly tutorialFrame = (): void => {
    this.tutFrame = 0;
    if (!this.guideOn()) { this.arrowEl.hidden = true; return; }
    this.applyRings();
    const t = this.tutTarget;
    // The arrow's tip sits on the target; it comes from above (down), below (up) or the left (right).
    let pt: { x: number; y: number; dir: "down" | "up" | "right" } | null = null;
    // A place in the world points at itself when it is on screen and no panel covers it, else at its HUD button.
    const spot = t?.kind === "spot" && !this.sleeping && !this.view.panel ? this.world.screenPoint(t.id) : null;
    const sel = t?.kind === "html" ? t.selectors[0]! : t?.kind === "spot" && !spot?.inView ? t.rings[0]! : null;
    if (t?.kind === "sheep" && !this.sleeping) {
      const p = this.world.screenPoint(t.id);
      if (p) pt = { x: p.x, y: p.y - 4, dir: "down" };
    } else if (spot?.inView) {
      pt = { x: spot.x, y: spot.y - 4, dir: "down" };
    } else if (sel) {
      const el = document.querySelector<HTMLElement>(sel);
      const key = `${sel}|${window.innerWidth}x${window.innerHeight}|${this.view.panel ?? ""}`;
      if (el && key !== this.tutScrollKey) {
        this.tutScrollKey = key;
        if (el.closest("#overlay")) el.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      const r = el?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        // Buttons inside a panel get the arrow from the left, so it doesn't sit on the text above them
        // (a price, a heading) unless the mentor card is in the way.
        const m = this.mentorEl.getBoundingClientRect();
        const leftFree = r.left - 60 > (this.mentorEl.hidden || r.top > m.bottom || r.bottom < m.top ? 0 : m.right);
        if (el!.closest("#overlay") && el!.tagName === "BUTTON" && leftFree) pt = { x: r.left - 6, y: r.top + r.height / 2, dir: "right" };
        else if (r.top < 110) pt = { x: r.left + r.width / 2, y: r.bottom + 4, dir: "up" };
        else pt = { x: r.left + r.width / 2, y: r.top - 4, dir: "down" };
      }
    }
    if (pt) {
      const W = window.innerWidth, H = window.innerHeight;
      const x = Math.max(24, Math.min(W - 24, pt.x));
      const y = pt.dir === "up" ? Math.min(H - 56, pt.y) : pt.dir === "down" ? Math.max(52, Math.min(H - 4, pt.y)) : pt.y;
      this.arrowEl.style.left = `${Math.round(x)}px`;
      this.arrowEl.style.top = `${Math.round(y)}px`;
      this.arrowEl.dataset.dir = pt.dir;
      this.arrowEl.hidden = false;
    } else {
      this.arrowEl.hidden = true;
    }
    this.tutFrame = requestAnimationFrame(this.tutorialFrame);
  };

  private tutorialOp(op: "start" | "ack" | "skip", seed?: number): void {
    if (op === "start") { this.startNewGame(seed, true); return; }
    if (op === "skip") {
      skipTutorial(this.state);
      toast("Tutorial skipped. The farm is yours — happy farming!");
    } else {
      const id = tutorialStep(this.state);
      const def = TUTORIAL_STEPS.find((d) => d.id === id);
      if (!id || !def?.ack) throw new Error("Do what Old Tom asks to carry on.");
      advanceTutorial(this.state, id);
      // "Let's farm!": the tutorial is over, so close whatever panel was open and show the farm.
      if (this.state.tutorial?.done) { this.view.panel = null; this.view.tab = null; }
    }
    // The tutorial is over: the first letter arrives at once, with its lesson (core/pacing.ts).
    if (this.state.tutorial?.done) tutorialOver(this.state);
    this.persist = true;
    this.save();
  }

  private lessonOp(op: "ack" | "skip"): void {
    if (op === "skip") {
      if (!skipLesson(this.state)) throw new Error("There's no lesson running.");
      toast("Lesson skipped. Old Tom tips his hat.");
    } else if (!ackLesson(this.state)) {
      throw new Error("Do what Old Tom asks to carry on.");
    }
    this.persist = true;
    this.save();
  }

  /**
   * The sheep card makes its sheep feel present: a live portrait in the card, and in the field the camera
   * glides over while the sheep turns to say hello. Both stop when the card closes.
   */
  private syncSheepLife(): void {
    const id = this.view.panel === "sheep" ? this.view.sheepId : null;
    const s = id ? this.state.sheep[id] : undefined;
    const slot = s ? this.overlay.el.querySelector<HTMLElement>("[data-live-portrait-slot]") : null;
    if (s && slot) {
      const stop = this.world.mountPortrait(slot, this.worldSheep(s, "paddock", null));
      this.portraitStop = stop;
    } else if (this.portraitStop) {
      this.portraitStop();
      this.portraitStop = null;
    }
    const want = s ? s.id : null;
    if (want !== this.attendedId) {
      this.attendedId = want;
      if (want) this.bleat(want);
      const panel = this.overlay.el.querySelector<HTMLElement>(".panel");
      const wide = window.innerWidth > 760;
      const offsetPx = want && panel && wide ? (panel.getBoundingClientRect().width + 24) / 2 : 0;
      this.world.attend(want, { offsetPx });
    }
  }

  private onOverlayClosed(): void {
    const was = this.view.panel;
    this.petShown = null;
    this.view.panel = null;
    this.view.tab = null;
    if (!this.closing && was === "report" && isEnding(this.state)) {
      this.openPanel("ending", undefined);
    }
    if (this.closing) { document.body.dataset.panel = ""; this.syncSheepLife(); return; }
    this.render();
  }

  /** Point the view at a panel. `id` picks the sheep for sheep/forecast/tree/vet. */
  private openPanel(panel: PanelName, id: string | undefined, tab: string | null = null): void {
    if (!(PANEL_NAMES as string[]).includes(panel)) throw new Error(`There is no "${String(panel)}" panel.`);
    const s = this.state;
    const flock = s.flock.map((x) => s.sheep[x]!);
    if (id !== undefined && !s.sheep[id] && !(panel === "animal" && isPetId(id))) throw new Error("I can't find that sheep.");
    this.view.tab = tab;
    this.view.tray = false;
    switch (panel) {
      case "forecast":
        this.view.sheepId = id ?? (flock.find((x) => x.sex === "ewe" && canBreed(x, s.season)) ?? flock.find((x) => isAdult(x, s.season)) ?? flock[0])?.id ?? null;
        this.view.mateId = null;
        break;
      case "sheep":
        this.view.sheepId = id ?? flock[0]?.id ?? null;
        if (this.view.sheepId) this.greet(this.view.sheepId);
        break;
      case "animal": {
        const own = ownedPets(s);
        const pet: PetId | null = id && isPetId(id) && own.includes(id) ? id : own[0] ?? null;
        this.view.sheepId = pet;
        if (pet) {
          const again = this.view.panel === "animal" && this.petShown === pet;
          this.greet(pet);
          if (!again) {
            this.petShown = pet;
            this.world.focus(pet);
            this.world.say(pet as PetKind, pet === "cat" ? "Mrrp?" : pet === "maremma" ? "WOOF." : pet === "terrier" ? "Yap! Yap!" : "Woof!");
            this.bleat(pet);
          }
        }
        break;
      }
      case "tree": {
        // Default to the flock sheep with the most family on record (parents + lambs + grandlambs).
        const all = Object.values(s.sheep);
        const kids = (pid: string) => all.filter((k) => k.dam === pid || k.sire === pid);
        const anc = (x: Sheep | undefined, d: number): number => (!x || d <= 0 ? 0 : (x.dam ? 1 + anc(s.sheep[x.dam], d - 1) : 0) + (x.sire ? 1 + anc(s.sheep[x.sire], d - 1) : 0));
        // A tree that reaches both ways reads best: ancestors count double, a huge brood counts less.
        const family = (x: Sheep) => 2 * anc(x, 3) + Math.min(6, kids(x.id).reduce((n, k) => n + 1 + kids(k.id).length, 0));
        const best = [...flock].sort((a, b) => family(b) - family(a))[0];
        this.view.sheepId = id ?? best?.id ?? null;
        break;
      }
      case "vet":
        if (id) this.view.tab = id;
        break;
      case "ending":
        if (isEnding(s)) { markEndingShown(s); this.save(); }
        break;
      default:
        if (id) this.view.sheepId = id;
    }
    this.view.panel = panel;
  }

  // ------------------------------------------------------------------ actions

  private guard(f: () => void): void {
    try { f(); } catch (e) { toast(e instanceof Error ? e.message : String(e)); this.render(); }
  }

  /** A click on any data-* button in the HUD or a panel. */
  private onData(d: ActionData): void {
    if (this.sleeping) return;
    try {
      if ("newgame" in d) { this.startNewGame(d["newgame"] ? Number(d["newgame"]) : undefined); return; }
      if (d["tutorial"]) {
        const op = d["tutorial"] as "start" | "ack" | "skip";
        const inp = op === "start" ? this.overlay.el.querySelector<HTMLInputElement>("input[name=seed]") : null;
        const typed = inp && inp.value.trim() ? Number(inp.value.trim()) : undefined;
        // From the title of an unplayed farm, keep its seed; otherwise a new one (or the one typed in).
        const seed = typed ?? (this.view.panel === "title" && !this.view.hasSave ? this.state.seed : undefined);
        this.tutorialOp(op, seed);
        if (op === "start") return;
      }
      if (d["lesson"]) this.lessonOp(d["lesson"] as "ack" | "skip");
      else if (d["tray"]) this.view.tray = d["tray"] === "open";
      else if (d["open"]) this.openPanel(d["open"] as PanelName, d["sheepId"], d["tab"] ?? null);
      else if (d["sheep"]) this.openPanel("sheep", d["sheep"]);
      else if (d["findmate"]) this.openPanel("forecast", d["findmate"]);
      else if (d["mate"]) this.view.mateId = d["mate"];
      else if (d["goal"]) { this.view.goal = d["goal"] as Goal; this.view.mateId = null; }
      else if (d["plan"]) { const [e, r] = d["plan"].split(":"); this.mutate(() => planMating(this.state, e!, r!)); }
      else if (d["buy"]) this.mutate(() => { buySheep(this.state, d["buy"]!); toast(`${this.state.sheep[d["buy"]!]?.name ?? "The sheep"} joins your flock.`); });
      else if (d["sell"]) this.mutate(() => { const name = this.state.sheep[d["sell"]!]?.name; const p = sellSheep(this.state, d["sell"]!); toast(`Sold ${name ?? "the sheep"} for ${p} coins.`); });
      else if (d["hire"]) this.mutate(() => hireVisitingRam(this.state));
      else if (d["upgrade"]) { const opened = this.buyUpgrade(d["upgrade"]!); if (opened) { this.render(); return; } }
      else if (d["treat"]) this.treat(d["treat"]);
      else if (d["test"]) { const [id, l] = d["test"].split(":"); this.mutate(() => vetTest(this.state, id!, l!)); }
      else if (d["accept"]) this.mutate(() => acceptOrder(this.state, d["accept"]!));
      else if (d["decline"]) this.mutate(() => declineOrder(this.state, d["decline"]!));
      else if (d["enter"]) this.mutate(() => enterFair(this.state, d["enter"] === "none" ? null : d["enter"]!));
      else if (d["sleep"]) { void this.sleep().catch((e: unknown) => toast(e instanceof Error ? e.message : String(e))); return; }
      else if (d["rename"]) {
        const s = this.state.sheep[d["rename"]];
        const name = window.prompt(`A new name for ${s?.name ?? "this sheep"}:`, s?.name ?? "");
        if (name !== null) this.mutate(() => renameSheep(this.state, d["rename"]!, name));
      }
      else if (d["toggle"] === "motion") this.setReducedMotion(!this.reduced);
      else if (d["detail"] === "auto" || d["detail"] === "full" || d["detail"] === "lite") this.setDetail(d["detail"]);
      else if (d["toggle"] === "move") this.setMove(this.move === "walk" ? "pan" : "walk");
      else if (d["toggle"] === "sound") { this.voices.setOn(!this.voices.on); this.view.sound = { on: this.voices.on, volume: this.voices.volume }; this.previewSound(); }
      else if (d["export"]) this.exportSave();
      else if (d["import"]) { this.importSave(); return; }
      else if ("tab" in d) this.view.tab = d["tab"] || null;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
    this.render();
  }

  /**
   * Buy an improvement. One that opens land (the far paddock → the creek flats, the long meadow → the far bank)
   * closes the market so the player sees the land open in the world. Returns whether land opened.
   */
  private buyUpgrade(id: string): boolean {
    const before = JSON.stringify(this.landInfo().map((l) => l.state));
    this.mutate(() => { buyUpgrade(this.state, id); toast(upgradeDef(id).done); });
    const opened = JSON.stringify(this.landInfo().map((l) => l.state)) !== before;
    if (opened) { this.view.panel = null; this.view.tab = null; }
    return opened;
  }

  /** Run a state-changing core action, then save. Errors propagate (player-readable). */
  private mutate(f: () => void): void {
    f();
    this.persist = true;
    this.save();
  }

  /** The probe hook's dispatcher. Illegal moves throw. */
  async act(a: Action): Promise<void> {
    if (this.sleeping) throw new Error("Shh — the farm is asleep.");
    switch (a.type) {
      case "plan": this.mutate(() => planMating(this.state, a.ewe, a.ram)); break;
      case "unplan": this.mutate(() => unplanMating(this.state, a.ewe)); break;
      case "buy": this.mutate(() => buySheep(this.state, a.id)); break;
      case "sell": this.mutate(() => { sellSheep(this.state, a.id); }); break;
      case "test": this.mutate(() => vetTest(this.state, a.id, a.locus)); break;
      case "accept": this.mutate(() => acceptOrder(this.state, a.id)); break;
      case "decline": this.mutate(() => declineOrder(this.state, a.id)); break;
      case "enter": this.mutate(() => enterFair(this.state, a.id && a.id !== "none" ? a.id : null)); break;
      case "hire": this.mutate(() => hireVisitingRam(this.state)); break;
      case "upgrade": this.buyUpgrade(a.id); break;
      case "treat": this.treat(a.id); break;
      case "brush": this.brush(a.id); break;
      case "rename": this.mutate(() => renameSheep(this.state, a.id, a.name)); break;
      case "newGame": this.startNewGame(a.seed); return;
      case "tutorial": this.tutorialOp(a.op, a.seed); if (a.op === "start") return; break;
      case "lesson": this.lessonOp(a.op); break;
      case "open": this.openPanel(a.panel, a.id); break;
      case "close": this.view.panel = null; break;
      case "sleep": await this.sleep(); return;
      default: throw new Error(`Unknown action ${JSON.stringify(a)}`);
    }
    this.render();
  }

  /** Night falls, the season turns, dawn, then the report. */
  async sleep(): Promise<void> {
    if (this.sleeping) throw new Error("Shh — the farm is asleep.");
    this.sleeping = true;
    try {
      this.view.panel = null;
      this.render();
      await this.world.sleepTransition();
      const report = advanceSeason(this.state);
      this.view.report = report;
      this.persist = true;
      this.save();
      this.view.sheepId = null;
      this.render();
      await this.world.dawn();
      this.view.panel = "report";
      this.view.tab = null;
      this.render();
      this.lambChorus(report.lambs.map((l) => l.id).filter((id) => this.state.flock.includes(id)));
      const blues = report.lambs.filter((l) => l.phenotype["colour"] === "blue" && this.state.flock.includes(l.id));
      const found = new Set(report.discoveries.map((d) => d.sheep));
      for (const id of new Set([...blues.map((b) => b.id), ...found])) if (this.state.flock.includes(id)) this.world.celebrate(id);
    } finally {
      this.sleeping = false;
    }
    if (tutorialActive(this.state) || lessonInfo(this.state)) this.render();
  }

  private startNewGame(seed?: number, tutorial = false): void {
    const s = seed !== undefined && Number.isFinite(seed) ? Math.floor(seed) : randomSeed();
    this.state = tutorial ? newTutorialGame(s) : newGame(s);
    this.tutStepSeen = "";
    this.view.report = null;
    this.view.sheepId = null;
    this.view.mateId = null;
    this.view.tab = null;
    this.view.hasSave = true;
    this.view.panel = null;
    this.persist = true;
    this.save();
    this.world.dispose();
    this.makeWorld();
    this.render();
    if (!tutorial) toast(`A new farm (seed ${s}). Your two sheep are waiting in the paddock.`);
  }

  private setReducedMotion(on: boolean): void {
    this.reduced = on;
    this.view.reducedMotion = on;
    document.body.classList.toggle("reduced-motion", on);
    try { localStorage.setItem(MOTION_KEY, on ? "1" : "0"); } catch { /* ignore */ }
    this.world.dispose();
    this.makeWorld();
  }

  /** Settings' volume slider: live while dragging, a sample bleat when let go. No re-render (it would reset the drag). */
  private onVolume(el: HTMLInputElement, done: boolean): void {
    this.voices.setVolume(Number(el.value) / 100);
    this.view.sound = { on: this.voices.on, volume: this.voices.volume };
    if (done) this.previewSound();
  }

  private previewSound(): void {
    const s = this.state.flock.map((id) => this.state.sheep[id]!).find((x) => x) ?? null;
    if (s && this.voices.on) this.bleat(s.id, true);
  }

  // ------------------------------------------------------------------ saving

  private loadMotionPref(): boolean {
    try {
      const v = localStorage.getItem(MOTION_KEY);
      if (v !== null) return v === "1";
    } catch { /* ignore */ }
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  private loadSave(): GameState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem("blue-sheep-save-v1");
      return raw ? deserialize(raw) : null;
    } catch (e) {
      console.warn("Could not load the save:", e);
      return null;
    }
  }

  private save(): void {
    if (!this.persist) return;
    try { localStorage.setItem(SAVE_KEY, serialize(this.state)); } catch { /* storage full or private mode */ }
  }

  private exportSave(): void {
    const blob = new Blob([serialize(this.state)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `blue-sheep-seed${this.state.seed}-season${this.state.season}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private importSave(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const st = deserialize(await f.text());
        this.state = st;
        this.view.report = null;
        this.view.panel = null;
        this.persist = true;
        this.save();
        this.world.dispose();
        this.makeWorld();
        this.render();
        toast("Farm loaded.");
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e));
      }
    };
    input.click();
  }

  // ------------------------------------------------------------------ probe hook

  private exposeHook(): void {
    const w = window as unknown as { __game: unknown };
    w.__game = {
      state: () => this.state,
      act: (a: Action) => this.act(a),
      snapshot: () => this.snapshot(),
      version: VERSION,
      /** The tutorial's current step ({ step, id, done }), or null for a game without one. */
      tutorial: () => { const t = tutorialInfo(this.state); return t ? { ...t } : null; },
      /**
       * The running mini-lesson ({ id, title, step, count, stepId, stepTitle, ack, shown }) or null, plus the
       * lessons done so far and every lesson's step ids (for probes).
       */
      lesson: () => {
        const l = lessonInfo(this.state);
        return {
          current: l ? { ...l, shown: lessonShown(this.state, this.view) } : null,
          done: [...(this.state.lessonsDone ?? [])],
          all: LESSONS.map((x) => ({ id: x.id, steps: x.steps.map((st) => st.id) })),
        };
      },
      /** Not part of the contract: render stats (draw calls, live portrait, the dog) for probes. */
      debug: {
        world: () => this.world.debugStats(),
        /** Point the world camera at (x, z) with half-width halfW (probe sheets only). */
        camera: (x: number, z: number, halfW: number) => this.world.debugCamera(x, z, halfW),
        /** What the world would draw now, by kind (meshes, triangles, shadow-pass meshes), for the perf budget. */
        breakdown: () => this.world.debugBreakdown(),
        /** The voice params of the last bleat (played or not: `played`/`reason` say which). */
        lastSound: () => this.voices.lastSound(),
        /** The stable voice of a sheep (or a dog/cat by PetId), without playing it. */
        voiceOf: (id: string) => this.voiceOf(id),
        /** Where a dog or the cat is on screen (client px), or null. */
        petPoint: (id: string) => this.world.screenPoint(id),
        /** An animal's fondness 0–100 (sheep id or PetId). */
        fondness: (id: string) => fondnessOf(this.state, id),
        /** Render a sheep's bleat (or any made-up voice) offline (no speakers or gesture needed): mono samples for probes. */
        renderVoice: async (who: string | VoiceInput, series: "one" | "random" = "one") => {
          const v = typeof who === "string" ? this.voiceOf(who) : voiceFor(who);
          if (!v) return null;
          const steps = series === "one" ? [{ at: 0, dur: 1, pitch: 1, gain: 1, glide: v.glide }] : bleatSeries(v);
          const data = await renderOffline(v, steps, 22050);
          return data ? { voice: v, steps, sampleRate: 22050, samples: Array.from(data) } : null;
        },
      },
      forecast: {
        cross: (ewe: string, ram: string) => forecastCross(this.state, ewe, ram),
        order: (id: string) => forecastOrder(this.state, id),
        fair: (id: string) => forecastFair(this.state, id),
        /** What an improvement would change (dogs: fox/wolf risk now and with it; the cat: mice cost). */
        upgrade: (id: string) => forecastUpgrade(this.state, id as UpgradeId),
      },
    };
  }
}
