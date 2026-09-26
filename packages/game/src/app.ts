/**
 * The controller: owns the GameState and the View, wires core + world3d + ui together, handles deep links,
 * saving, the sleep flow, and exposes `window.__game` for the probes (CONTRACTS.md §6 and §8).
 */
import {
  acceptOrder, advanceSeason, buySheep, buyUpgrade, hasUpgrade, upgradeDef, canBreed, declineOrder, deserialize, enterFair, forecastCross, forecastFair,
  forecastOrder, hireVisitingRam, isAdult, isEnding, markEndingShown, newGame, planMating, renameSheep, sellSheep,
  seasonOfYear, serialize, unplanMating, vetTest, yearOf,
  type GameState, type Goal, type Sheep,
} from "./core/index.js";
import { WorldView, type Hotspot, type WorldSheep, type WorldSnapshot, type Zone } from "./world3d/index.js";
import {
  Overlay, PANEL_NAMES, defaultView, delegateActions, hudHtml, panelOptions, renderPanel, toast,
  type ActionData, type PanelName, type View,
} from "./ui/index.js";
import { fastForward } from "./debug.js";

export const SAVE_KEY = "blue-sheep-save-v2";
const MOTION_KEY = "blue-sheep-reduced-motion";
export const VERSION = "1.0.0";
/** Sheep that fit in the first paddock before the rest move to the second one. */
const PADDOCK_ROOM = 10;

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
  | { type: "rename"; id: string; name: string }
  | { type: "newGame"; seed?: number }
  | { type: "open"; panel: PanelName; id?: string }
  | { type: "close" };

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
  /** False while a `?seed=` / `?act=` preview runs: the old save is kept until the player acts. */
  private persist: boolean;
  private sleeping = false;
  private closing = false;

  constructor() {
    const q = new URLSearchParams(location.search);
    if (q.get("fresh") === "1") { try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ } }
    this.reduced = q.get("nomotion") === "1" || this.loadMotionPref();
    document.body.classList.toggle("reduced-motion", this.reduced);

    this.view = defaultView((id) => this.portraitOf(id));
    this.view.reducedMotion = this.reduced;

    // ---- which game?
    let panel: PanelName | null = null;
    const seedParam = q.get("seed");
    const seed = seedParam !== null && Number.isFinite(Number(seedParam)) ? Math.floor(Number(seedParam)) : null;
    if (q.get("act") !== null) {
      const ff = fastForward(seed ?? 7, Number(q.get("act")));
      this.state = ff.state;
      this.view.report = ff.report;
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
    this.makeWorld();

    if (panel) this.openPanel(panel, undefined);
    this.render();
    this.exposeHook();
    requestAnimationFrame(() => requestAnimationFrame(() => { document.body.dataset.ready = "1"; }));
  }

  // ------------------------------------------------------------------ world

  private makeWorld(): void {
    this.world = new WorldView(this.worldEl, {
      onSheep: (id) => this.guard(() => this.onSheepClick(id)),
      onHotspot: (h) => this.guard(() => this.onHotspot(h)),
    }, { seed: this.state.seed, reducedMotion: this.reduced });
    this.world.setSnapshot(this.snapshot());
  }

  private onSheepClick(id: string): void {
    if (this.sleeping) return;
    this.openPanel("sheep", id);
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

  private portraitOf(id: string): string {
    const s = this.state.sheep[id];
    if (!s) return "";
    try { return this.world.portrait(this.worldSheep(s, "paddock", null), 96); } catch { return ""; }
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
      zone, marker,
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
    const marker = (x: Sheep): Marker => {
      if (x.id === selected) return "selected";
      if (planned.has(x.id)) return "planned";
      if (x.ill) return "ill";
      if (x.born === s.season && x.origin === "bred") return "new";
      if (x.rosettes.length) return "rosette";
      return null;
    };
    const out: WorldSheep[] = [];
    let inPaddock = 0;
    for (const id of s.flock) {
      const x = s.sheep[id];
      if (!x) continue;
      let zone: Zone;
      if (x.ill || (winter && !isAdult(x, s.season))) zone = "barn";
      else if (p2 && inPaddock >= PADDOCK_ROOM) zone = "paddock2";
      else { zone = "paddock"; inPaddock++; }
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
    };
  }

  // ------------------------------------------------------------------ rendering

  private render(): void {
    this.hudEl.innerHTML = hudHtml(this.state, this.view);
    if (this.view.panel) {
      this.overlay.show(renderPanel(this.state, this.view), panelOptions(this.view.panel));
    } else if (this.overlay.open) {
      this.closing = true;
      this.overlay.close();
      this.closing = false;
    }
    document.body.dataset.panel = this.view.panel ?? "";
    this.world.setSnapshot(this.snapshot());
  }

  private onOverlayClosed(): void {
    const was = this.view.panel;
    this.view.panel = null;
    this.view.tab = null;
    if (!this.closing && was === "report" && isEnding(this.state)) {
      this.openPanel("ending", undefined);
    }
    if (this.closing) { document.body.dataset.panel = ""; return; }
    this.render();
  }

  /** Point the view at a panel. `id` picks the sheep for sheep/forecast/tree/vet. */
  private openPanel(panel: PanelName, id: string | undefined, tab: string | null = null): void {
    if (!(PANEL_NAMES as string[]).includes(panel)) throw new Error(`There is no "${String(panel)}" panel.`);
    const s = this.state;
    const flock = s.flock.map((x) => s.sheep[x]!);
    if (id !== undefined && !s.sheep[id]) throw new Error("I can't find that sheep.");
    this.view.tab = tab;
    switch (panel) {
      case "forecast":
        this.view.sheepId = id ?? (flock.find((x) => x.sex === "ewe" && canBreed(x, s.season)) ?? flock.find((x) => isAdult(x, s.season)) ?? flock[0])?.id ?? null;
        this.view.mateId = null;
        break;
      case "sheep":
        this.view.sheepId = id ?? flock[0]?.id ?? null;
        break;
      case "tree": {
        // Default to the flock sheep with the most family on record (parents + lambs + grandlambs).
        const all = Object.values(s.sheep);
        const kids = (pid: string) => all.filter((k) => k.dam === pid || k.sire === pid);
        const family = (x: Sheep) => (x.dam ? 1 : 0) + (x.sire ? 1 : 0) + kids(x.id).reduce((n, k) => n + 1 + kids(k.id).length, 0);
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
      if (d["open"]) this.openPanel(d["open"] as PanelName, d["sheepId"], d["tab"] ?? null);
      else if (d["sheep"]) this.openPanel("sheep", d["sheep"]);
      else if (d["findmate"]) this.openPanel("forecast", d["findmate"]);
      else if (d["mate"]) this.view.mateId = d["mate"];
      else if (d["goal"]) { this.view.goal = d["goal"] as Goal; this.view.mateId = null; }
      else if (d["plan"]) { const [e, r] = d["plan"].split(":"); this.mutate(() => planMating(this.state, e!, r!)); }
      else if (d["buy"]) this.mutate(() => { buySheep(this.state, d["buy"]!); toast(`${this.state.sheep[d["buy"]!]?.name ?? "The sheep"} joins your flock.`); });
      else if (d["sell"]) this.mutate(() => { const name = this.state.sheep[d["sell"]!]?.name; const p = sellSheep(this.state, d["sell"]!); toast(`Sold ${name ?? "the sheep"} for ${p} coins.`); });
      else if (d["hire"]) this.mutate(() => hireVisitingRam(this.state));
      else if (d["upgrade"]) this.mutate(() => { buyUpgrade(this.state, d["upgrade"]!); toast(upgradeDef(d["upgrade"]!).done); });
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
      else if (d["export"]) this.exportSave();
      else if (d["import"]) { this.importSave(); return; }
      else if ("tab" in d) this.view.tab = d["tab"] || null;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
    this.render();
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
      case "upgrade": this.mutate(() => buyUpgrade(this.state, a.id)); break;
      case "rename": this.mutate(() => renameSheep(this.state, a.id, a.name)); break;
      case "newGame": this.startNewGame(a.seed); return;
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
      const blues = report.lambs.filter((l) => l.phenotype["colour"] === "blue" && this.state.flock.includes(l.id));
      const found = new Set(report.discoveries.map((d) => d.sheep));
      for (const id of new Set([...blues.map((b) => b.id), ...found])) if (this.state.flock.includes(id)) this.world.celebrate(id);
    } finally {
      this.sleeping = false;
    }
  }

  private startNewGame(seed?: number): void {
    const s = seed !== undefined && Number.isFinite(seed) ? Math.floor(seed) : randomSeed();
    this.state = newGame(s);
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
    toast(`A new farm (seed ${s}). The old flock is waiting in the paddock.`);
  }

  private setReducedMotion(on: boolean): void {
    this.reduced = on;
    this.view.reducedMotion = on;
    document.body.classList.toggle("reduced-motion", on);
    try { localStorage.setItem(MOTION_KEY, on ? "1" : "0"); } catch { /* ignore */ }
    this.world.dispose();
    this.makeWorld();
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
      forecast: {
        cross: (ewe: string, ram: string) => forecastCross(this.state, ewe, ram),
        order: (id: string) => forecastOrder(this.state, id),
        fair: (id: string) => forecastFair(this.state, id),
      },
    };
  }
}
