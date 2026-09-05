import Phaser from "phaser";
import {
  FARMER_PAL, SOLID, TILE, TRADER_PAL, ensurePersonTexture, ensureSheepTexture, ensureTilesTexture,
} from "../pixel/art.js";
import { advanceSeason, buySheep, overCap, plannedPairings, ramPrice, sellSheep, sheepValue, type SeasonReport } from "../sim.js";
import { updateDiscoveries } from "../knowledge.js";
import { forecastPanelHtml, type Goal } from "../ui/forecast.js";
import { deserialize, isAdult, newGame, seasonLabel, serialize, type GameState, type Pairing, type Sheep } from "../state.js";
import { Overlay, boardHtml, esc, helpHtml, reportHtml, setHud, sheepCardHtml } from "../ui/overlay.js";
import { MAP_H, MAP_W, PENS, POI, ZONES, buildMap, zoneOfTile, type ZoneId } from "./map.js";

const SAVE_KEY = "blue-sheep-save";
const SEASON_TINT = [0xffffff, 0xf4f0c8, 0xf3c9a0, 0xd8e4f0];

interface SheepActor {
  sheep: Sheep;
  sprite: Phaser.Physics.Arcade.Sprite;
  label: Phaser.GameObjects.Text;
  target: Phaser.Math.Vector2 | null;
  restUntil: number;
}

export class FarmScene extends Phaser.Scene {
  private state!: GameState;
  private farmer!: Phaser.Physics.Arcade.Sprite;
  private trader!: Phaser.GameObjects.Sprite;
  private actors = new Map<string, SheepActor>();
  private leading: SheepActor | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private overlay!: Overlay;
  private ground!: Phaser.Tilemaps.TilemapLayer;
  private prompt = "";
  private facing: "down" | "side" = "down";
  private sleeping = false;

  constructor() { super("farm"); }

  create(): void {
    this.state = this.loadSave() ?? newGame(Date.now() % 100000);
    for (const id of this.state.market) this.state.zone[id] = "market";

    const tilesKey = ensureTilesTexture(this);
    const farm = buildMap();
    const map = this.make.tilemap({ data: farm.ground, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(tilesKey, tilesKey, TILE, TILE, 0, 0)!;
    this.ground = map.createLayer(0, tileset, 0, 0)!;
    const objects = map.createBlankLayer("objects", tileset, 0, 0)!;
    farm.objects.forEach((row, y) => row.forEach((t, x) => { if (t >= 0) objects.putTileAt(t, x, y); }));
    objects.setCollision(SOLID);
    objects.setDepth(1);

    ensurePersonTexture(this, "farmer", FARMER_PAL);
    ensurePersonTexture(this, "trader", TRADER_PAL);
    for (const who of ["farmer", "trader"]) {
      this.anims.create({ key: `${who}-down`, frames: [{ key: who, frame: "down-a" }, { key: who, frame: "down-b" }], frameRate: 6, repeat: -1 });
      this.anims.create({ key: `${who}-side`, frames: [{ key: who, frame: "side-a" }, { key: who, frame: "side-b" }], frameRate: 6, repeat: -1 });
    }
    this.farmer = this.physics.add.sprite(POI.farmerStart.x * TILE + 8, POI.farmerStart.y * TILE + 8, "farmer", "down-a");
    this.farmer.body!.setSize(10, 8).setOffset(1, 10);
    this.farmer.setDepth(10);
    this.physics.add.collider(this.farmer, objects);
    this.trader = this.add.sprite(POI.trader.x * TILE + 8, POI.trader.y * TILE + 8, "trader", "down-a").setDepth(5);

    this.physics.world.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE).startFollow(this.farmer, true, 0.15, 0.15).setRoundPixels(true);

    this.keys = this.input.keyboard!.addKeys("W,A,S,D,E,I,H,UP,DOWN,LEFT,RIGHT,ESC") as Record<string, Phaser.Input.Keyboard.Key>;
    this.overlay = new Overlay((d) => this.onPanelAction(d));

    this.syncActors();
    this.applySeasonTint();
    this.updateHud();
    const params = new URLSearchParams(location.search);
    const zoom = Number(params.get("zoom"));
    if (zoom > 0) this.cameras.main.setZoom(zoom).stopFollow().centerOn((MAP_W * TILE) / 2, (MAP_H * TILE) / 2);
    if (params.get("panel") === "forecast") { const ewe = this.state.flock.find((id) => this.state.sheep[id]!.sex === "ewe"); if (ewe) this.showForecast(ewe); return; }
    if (params.get("panel") === "sheep") { const id = this.state.flock[0]; if (id) this.showCard(id); return; }
    if (this.state.season === 0 && this.state.log.length <= 1) this.overlay.show(helpHtml());
  }

  // --- persistence ---------------------------------------------------------
  private loadSave(): GameState | null {
    try { const raw = localStorage.getItem(SAVE_KEY); return raw ? deserialize(raw) : null; } catch { return null; }
  }
  private save(): void { localStorage.setItem(SAVE_KEY, serialize(this.state)); }

  // --- actors --------------------------------------------------------------
  private syncActors(): void {
    const wanted = new Set([...this.state.flock, ...this.state.market]);
    for (const [id, a] of this.actors) if (!wanted.has(id)) { a.sprite.destroy(); a.label.destroy(); this.actors.delete(id); }
    for (const id of wanted) if (!this.actors.has(id)) this.spawn(this.state.sheep[id]!);
    for (const a of this.actors.values()) this.applyScale(a);
  }

  private zoneOf(s: Sheep): ZoneId {
    return (this.state.zone[s.id] as ZoneId | undefined) ?? (this.state.market.includes(s.id) ? "market" : "paddock");
  }

  private randomPointIn(z: ZoneId): Phaser.Math.Vector2 {
    const r = ZONES[z];
    return new Phaser.Math.Vector2((r.x + Math.random() * r.w) * TILE + 8, (r.y + Math.random() * r.h) * TILE + 8);
  }

  private spawn(s: Sheep): void {
    const key = ensureSheepTexture(this, s);
    if (!this.anims.exists(`${key}-walk`)) {
      this.anims.create({ key: `${key}-walk`, frames: [{ key, frame: "a" }, { key, frame: "b" }], frameRate: 5, repeat: -1 });
    }
    const p = this.randomPointIn(this.zoneOf(s));
    const sprite = this.physics.add.sprite(p.x, p.y, key, "a");
    sprite.body!.setSize(12, 8).setOffset(2, 6);
    const label = this.add.text(p.x, p.y - 12, s.name, { fontFamily: "monospace", fontSize: "8px", color: "#2b2224" }).setOrigin(0.5, 1).setVisible(false).setDepth(50);
    const actor: SheepActor = { sheep: s, sprite, label, target: null, restUntil: 0 };
    this.actors.set(s.id, actor);
    this.applyScale(actor);
  }

  private applyScale(a: SheepActor): void {
    const adult = isAdult(a.sheep, this.state.season);
    const size = Number(a.sheep.phenotype["size"]);
    a.sprite.setScale(adult ? 0.9 + (size - 60) / 120 : 0.6);
  }

  // --- update loop ----------------------------------------------------------
  update(time: number): void {
    if (this.overlay.open) {
      if (Phaser.Input.Keyboard.JustDown(this.keys["ESC"]!) || Phaser.Input.Keyboard.JustDown(this.keys["E"]!) || Phaser.Input.Keyboard.JustDown(this.keys["I"]!)) this.overlay.close();
      this.farmer.setVelocity(0);
      return;
    }
    this.moveFarmer();
    this.updateSheep(time);
    this.handleInteraction();
    this.updateHud();
  }

  private moveFarmer(): void {
    const k = this.keys;
    const left = k["A"]!.isDown || k["LEFT"]!.isDown, right = k["D"]!.isDown || k["RIGHT"]!.isDown;
    const up = k["W"]!.isDown || k["UP"]!.isDown, down = k["S"]!.isDown || k["DOWN"]!.isDown;
    const v = new Phaser.Math.Vector2((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0)).normalize().scale(this.sleeping ? 0 : 75);
    this.farmer.setVelocity(v.x, v.y);
    if (v.x !== 0) { this.facing = "side"; this.farmer.setFlipX(v.x < 0); } else if (v.y !== 0) this.facing = "down";
    if (v.length() > 0) this.farmer.anims.play(`farmer-${this.facing}`, true);
    else { this.farmer.anims.stop(); this.farmer.setFrame(`${this.facing}-a`); }
    this.farmer.setDepth(this.farmer.y);
  }

  private updateSheep(time: number): void {
    for (const a of this.actors.values()) {
      const sp = a.sprite;
      if (a === this.leading) {
        const dx = this.farmer.x - sp.x, dy = this.farmer.y - sp.y;
        const d = Math.hypot(dx, dy);
        if (d > 16) { sp.setVelocity((dx / d) * Math.min(90, d * 4), (dy / d) * Math.min(90, d * 4)); }
        else sp.setVelocity(0);
      } else {
        if (a.target && sp.body!.velocity.length() > 0 && Phaser.Math.Distance.Between(sp.x, sp.y, a.target.x, a.target.y) < 3) { a.target = null; sp.setVelocity(0); a.restUntil = time + 1000 + Math.random() * 3000; }
        if (!a.target && time > a.restUntil) {
          a.target = this.randomPointIn(this.zoneOf(a.sheep));
          this.physics.moveTo(sp, a.target.x, a.target.y, 18 + Math.random() * 10);
        }
        if (a.target && time > a.restUntil + 6000) { a.target = null; sp.setVelocity(0); a.restUntil = time + 500; }
      }
      const moving = sp.body!.velocity.length() > 1;
      if (moving) { sp.anims.play(`${sp.texture.key}-walk`, true); sp.setFlipX(sp.body!.velocity.x < 0); }
      else { sp.anims.stop(); sp.setFrame("a"); }
      sp.setDepth(sp.y);
      a.label.setPosition(sp.x, sp.y - 10);
    }
  }

  private nearestSheep(radius = 22): SheepActor | null {
    let best: SheepActor | null = null;
    let bd = radius;
    for (const a of this.actors.values()) {
      if (a === this.leading) continue;
      const d = Phaser.Math.Distance.Between(this.farmer.x, this.farmer.y, a.sprite.x, a.sprite.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  private nearTile(t: { x: number; y: number }, radius = 20): boolean {
    return Phaser.Math.Distance.Between(this.farmer.x, this.farmer.y, t.x * TILE + 8, t.y * TILE + 8) < radius;
  }

  private handleInteraction(): void {
    const near = this.nearestSheep();
    for (const a of this.actors.values()) a.label.setVisible(a === near || a === this.leading);
    const atBed = this.nearTile(POI.bed), atBoard = this.nearTile(POI.board), atCart = this.nearTile(POI.cart, 24);
    const focus = this.leading ?? near;
    const isMarket = focus ? this.state.market.includes(focus.sheep.id) : false;

    if (this.leading && atCart) this.prompt = `E: sell ${this.leading.sheep.name} for ${sheepValue(this.leading.sheep)} coins`;
    else if (this.leading) this.prompt = `Leading ${this.leading.sheep.name} — E: let go here · I: notebook`;
    else if (near && isMarket) this.prompt = `${near.sheep.name} (for sale, ${ramPrice(near.sheep)} coins) — E: buy · I: look`;
    else if (near) this.prompt = `${near.sheep.name} — E: lead · I: notebook & find a mate`;
    else if (atBed) this.prompt = "E: sleep until next season";
    else if (atBoard) this.prompt = "E: read the shed board";
    else this.prompt = "H: help";

    const E = Phaser.Input.Keyboard.JustDown(this.keys["E"]!), I = Phaser.Input.Keyboard.JustDown(this.keys["I"]!), H = Phaser.Input.Keyboard.JustDown(this.keys["H"]!);
    if (H) { this.overlay.show(helpHtml()); return; }
    if (I && focus) { this.showCard(focus.sheep.id); return; }
    if (!E) return;
    try {
      if (this.leading && atCart) this.sell(this.leading);
      else if (this.leading) this.drop();
      else if (near && isMarket) this.buy(near);
      else if (near) this.leading = near;
      else if (atBed) this.sleep();
      else if (atBoard) this.overlay.show(boardHtml(this.state));
    } catch (err) {
      this.toast(err instanceof Error ? err.message : String(err));
    }
  }

  private drop(): void {
    const a = this.leading!;
    this.leading = null;
    const tx = Math.floor(a.sprite.x / TILE), ty = Math.floor(a.sprite.y / TILE);
    const z = zoneOfTile(tx, ty) ?? zoneOfTile(Math.floor(this.farmer.x / TILE), Math.floor(this.farmer.y / TILE));
    if (!z || z === "market") {
      this.toast(`${a.sheep.name} wanders back to the paddock.`);
      this.state.zone[a.sheep.id] = "paddock";
      a.target = this.randomPointIn("paddock");
      this.physics.moveTo(a.sprite, a.target.x, a.target.y, 40);
    } else {
      this.state.zone[a.sheep.id] = z;
      a.target = null; a.restUntil = this.time.now + 800; a.sprite.setVelocity(0);
    }
    this.save();
  }

  private buy(a: SheepActor): void {
    buySheep(this.state, a.sheep.id);
    this.state.zone[a.sheep.id] = "paddock";
    this.leading = a;
    this.toast(`Bought ${a.sheep.name}. Lead it home.`);
    this.save();
  }

  private sell(a: SheepActor): void {
    const price = sellSheep(this.state, a.sheep.id);
    this.leading = null;
    delete this.state.zone[a.sheep.id];
    this.toast(`Sold ${a.sheep.name} for ${price} coins.`);
    this.syncActors();
    this.save();
  }

  private pairingsFromPens(): Pairing[] {
    const out: Pairing[] = [];
    for (const z of PENS) {
      const occ = this.state.flock.map((id) => this.state.sheep[id]!).filter((s) => this.zoneOf(s) === z && isAdult(s, this.state.season));
      const ram = occ.find((s) => s.sex === "ram");
      if (!ram) continue;
      for (const e of occ) if (e.sex === "ewe") out.push({ ewe: e.id, ram: ram.id });
    }
    return out;
  }

  private sleep(): void {
    if (overCap(this.state) > 0) { this.toast(`Too many sheep for the farm (${this.state.flock.length}/${this.state.flockCap}). Sell some at the cart first.`); return; }
    if (this.leading) this.drop();
    this.sleeping = true;
    this.cameras.main.fadeOut(500, 20, 16, 24);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      let report: SeasonReport;
      const planned = plannedPairings(this.state);
      const pens = this.pairingsFromPens().filter((p) => !planned.some((q) => q.ewe === p.ewe));
      try { report = advanceSeason(this.state, [...planned, ...pens]); }
      catch (err) { this.sleeping = false; this.cameras.main.fadeIn(300); this.toast(err instanceof Error ? err.message : String(err)); return; }
      for (const l of report.lambs) this.state.zone[l.id] = "paddock";
      for (const d of report.deaths) delete this.state.zone[d.id];
      for (const id of this.state.market) this.state.zone[id] = "market";
      this.state.plans = {};
      const discoveries = updateDiscoveries(this.state);
      this.syncActors();
      this.applySeasonTint();
      this.save();
      this.cameras.main.fadeIn(600, 20, 16, 24);
      this.sleeping = false;
      this.overlay.show(reportHtml(this.state, report, discoveries));
    });
  }

  private applySeasonTint(): void {
    this.ground.setTint(SEASON_TINT[((this.state.season % 4) + 4) % 4]!);
  }

  private spriteDataUrl(s: Sheep): string {
    const key = ensureSheepTexture(this, s);
    const src = this.textures.get(key).getSourceImage() as HTMLCanvasElement;
    const c = document.createElement("canvas");
    c.width = 16; c.height = 14;
    c.getContext("2d")!.drawImage(src, 0, 0, 16, 14, 0, 0, 16, 14);
    return c.toDataURL();
  }

  private forecastFor: string | null = null;
  private forecastMate: string | null = null;
  private forecastGoal: Goal = "blue";

  private showCard(id: string): void {
    const s = this.state.sheep[id]!;
    this.overlay.show(sheepCardHtml(this.state, s, this.spriteDataUrl(s)));
  }

  private showForecast(id: string): void {
    this.forecastFor = id;
    this.overlay.show(forecastPanelHtml(this.state, id, this.forecastMate, this.forecastGoal), true);
  }

  private onPanelAction(d: DOMStringMap): void {
    if (d["findmate"]) { this.forecastMate = null; this.showForecast(d["findmate"]); return; }
    if (d["mate"] && this.forecastFor) { this.forecastMate = d["mate"]; this.showForecast(this.forecastFor); return; }
    if (d["goal"] && this.forecastFor) { this.forecastGoal = d["goal"] as Goal; this.showForecast(this.forecastFor); return; }
    if (d["plan"] && this.forecastFor) {
      const [ewe, ram] = d["plan"].split(":") as [string, string];
      if (this.state.plans[ewe] === ram) delete this.state.plans[ewe]; else this.state.plans[ewe] = ram;
      this.save();
      this.forecastMate = ram === this.forecastFor ? ewe : ram;
      this.showForecast(this.forecastFor);
    }
  }

  private toastText: Phaser.GameObjects.Text | null = null;
  private toast(msg: string): void {
    this.toastText?.destroy();
    const cam = this.cameras.main;
    this.toastText = this.add.text(cam.width / 2, cam.height - 24, msg, {
      fontFamily: "monospace", fontSize: "10px", color: "#fffaf0", backgroundColor: "#2b2224cc", padding: { x: 6, y: 4 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1000);
    this.time.delayedCall(3500, () => { this.toastText?.destroy(); this.toastText = null; });
  }

  private updateHud(): void {
    const s = this.state;
    setHud(`<span>🐑 ${esc(seasonLabel(s.season))}</span><span>💰 ${s.money}</span><span>Flock ${s.flock.length}/${s.flockCap}</span><span class="prompt">${esc(this.prompt)}</span>`);
  }
}
