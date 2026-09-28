// WorldView — the Kōwhai Creek river valley at play scale (CONTRACTS.md §4, DESIGN-v3 §9 and §15 items 20–24).
// A close isometric camera; a walking farmer by default (click-to-walk with pathing, WASD, walk-up prompts) with
// drag-pan, signposts and a felt minimap as the other mode; land that opens with a reveal. Pure presentation:
// driven entirely by WorldSnapshot, no game logic imports.
import * as THREE from "three";
import { buildFarm, HOTSPOT_DEF, HOTSPOT_LABEL, SEASON_U, ZONES, type FarmBuild, type Land, type Rect } from "./farm.js";
import { applyPose, buildFullRig, buildRig, buildSheepGeos, disposeGeos, restPose, setSheepDetail, sheepKey, SheepMaterials } from "./sheepMesh.js";
import { Markers, type MarkerKind } from "./markers.js";
import { CAM_YAW, computePose, FACE_CAMERA, FOND_SKITTISH, FOND_TRUSTING, flickEars, fondOf, newAnimState, startHop, stepSheep, type Ent, type FlockCtx } from "./behave.js";
import { FlockParts } from "./parts.js";
import { Bubble, Hearts, Puffs } from "./fx.js";
import { Dog, type DogKind } from "./dog.js";
import { Cat } from "./cat.js";
import { BLEATS, LivePortrait, type PortraitStats } from "./portrait.js";
import { NIGHT, PORTRAIT_BG, SEASONS, WOOL_HEX } from "./palette.js";
import { hashString, mulberry32 } from "./rng.js";
import { Grid } from "./grid.js";
import { buildWalker, type Walker } from "./farmer.js";
import { WorldChrome, type PromptSpec } from "./chrome.js";
import { AREAS, AREA_IDS, HOTSPOT_STAND, SPOTS, smoothstep as ss, type UV } from "./valley.js";
import type { AreaId, Hotspot, HoverTarget, LandInfo, MoveMode, Personality, PetKind, WorldHandlers, WorldOptions, WorldSheep, WorldSnapshot, Zone } from "./types.js";

export type { AreaId, Hotspot, HoverTarget, LandInfo, MoveMode, Personality, PetKind, WorldHandlers, WorldOptions, WorldSheep, WorldSnapshot, WorldUpgrade, Zone } from "./types.js";

const DOG_KINDS: readonly DogKind[] = ["terrier", "collie", "maremma"];
const PET_KINDS: readonly PetKind[] = ["terrier", "collie", "maremma", "cat"];
const PET_LABEL: Record<PetKind, string> = { terrier: "the terrier", collie: "the collie", maremma: "the Maremma", cat: "the cat" };

export { BLEATS } from "./portrait.js";
export { Hold, HOLD_MS, HOLD_CLICK_MS, type HoldHandlers } from "./hold.js";

const HOTSPOTS: readonly Hotspot[] = ["house", "shed", "market", "vet", "fairground", "mailbox"];
/** Close isometric: the camera looks from +z, turned a little towards +x, 37° down. */
const ISO_PITCH = (37 * Math.PI) / 180;
const CAM_DIR = new THREE.Vector3(Math.sin(CAM_YAW) * Math.cos(ISO_PITCH), Math.sin(ISO_PITCH), Math.cos(CAM_YAW) * Math.cos(ISO_PITCH));
const CAM_DIST = 200;
/** Ground directions for "up the screen" and "right" (world x, z). */
const SCREEN_UP = new THREE.Vector3(-Math.sin(CAM_YAW), 0, -Math.cos(CAM_YAW));
const SCREEN_RIGHT = new THREE.Vector3(Math.cos(CAM_YAW), 0, -Math.sin(CAM_YAW));
/** Half the view's width in world units: walking is close (one paddock fills the screen), panning can pull back. */
const WALK_HALF = 11, PAN_HALF = 15, ATTEND_HALF = 6.4;
const ZOOM_LIMITS: Record<MoveMode, [number, number]> = { walk: [7.5, 16], pan: [7.5, 32] };
const TRANSITION_MS = 1200;
const FOCUS_MS = 600;
/** The farmer is drawn a good deal bigger than in the movement prototype (user, 2026-09-28). */
const FARMER_SCALE = 1.2;
const WALK_SPEED = 4.6, RUN_SPEED = 7;
/** Clicking a sheep closer than this opens its card at once (the farmer strolls over); further, he walks there first. */
const NEAR_SHEEP = 9;
const NEAR_PLACE = 5;
/** Reach for walk-up prompts. */
const PROMPT_SHEEP = 2.8, PROMPT_PLACE = 3.2;
const PERSONALITIES = new Set<Personality>(["shy", "calm", "curious", "bold"]);
const PLACE_VERB: Record<Hotspot, string> = { house: "Go inside", shed: "Notice board", market: "Trade", vet: "See the vet", fairground: "The show", mailbox: "Check the mail" };

/** Options for attend(): where the card covers the screen, so the sheep can sit beside it. */
export interface AttendOptions {
  /** Screen pixels to shift the sheep left of centre (half the width of a right-hand card). */
  offsetPx?: number;
  /** Speech-bubble text; defaults to the sheep's personality greeting. */
  say?: string;
}

interface Sparkle {
  mesh: THREE.InstancedMesh;
  vel: Float32Array;
  origin: THREE.Vector3;
  t: number;
}

interface Farmer {
  x: number; z: number; heading: number; vx: number; vz: number;
  path: THREE.Vector2[];
  chase: string | null; arrive: number; then: (() => void) | null;
  repath: number; idle: number; lookNext: number;
}

interface Reveal { id: AreaId; t: number; land: Land }

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function backOut(t: number): number {
  const c1 = 2.2, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
const uvOf = (x: number, z: number): UV => [x, -z];

export class WorldView {
  private readonly container: HTMLElement;
  private readonly handlers: WorldHandlers;
  private readonly reduced: boolean;
  private readonly lite: boolean;
  private readonly shadows: boolean;
  private readonly seed: number;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly farm: FarmBuild;
  private readonly sheepMats = new SheepMaterials();
  private readonly markers = new Markers();
  private readonly ents = new Map<string, Ent>();
  private readonly dying: Ent[] = [];
  private readonly sparkles: Sparkle[] = [];
  private readonly label: HTMLDivElement;
  private readonly skyCanvas: HTMLCanvasElement;
  private readonly skyTex: THREE.CanvasTexture;
  private readonly stars: [number, number, number][] = [];
  private particles: THREE.InstancedMesh | null = null;
  private particleData: Float32Array = new Float32Array(0);
  private snap: WorldSnapshot | null = null;
  private season = -1;
  private night = 0;
  private nightAnim: { from: number; to: number; t0: number; resolve: () => void } | null = null;
  /** Camera target on the ground (world), and half the view's width in world units. */
  private target = new THREE.Vector3(-17, 0, 1);
  private halfW = WALK_HALF;
  private focusAnim: { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; h0: number; h1: number; lift: number } | null = null;
  private hover: HoverTarget = null;
  private pointer: { x: number; y: number } | null = null;
  private hoverDirty = false;
  private drag: { x: number; y: number; tx: number; tz: number; moved: boolean; id: number; lx: number; ly: number; lt: number } | null = null;
  private panVel = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private lastT = -1;
  private lastRaw = -1;
  private time = 0;
  private disposed = false;
  private readonly resizeObs: ResizeObserver | null;
  private slotSeq = 0;
  // portrait
  private readonly pScene = new THREE.Scene();
  private readonly pCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  private readonly pGround: THREE.Mesh;
  private readonly pRTs = new Map<number, THREE.WebGLRenderTarget>();
  private readonly pCache = new Map<string, string>();
  private readonly pCanvas = document.createElement("canvas");
  // life
  private readonly parts: FlockParts;
  private readonly puffs: Puffs;
  private readonly bubble: Bubble;
  private readonly dogs: Record<DogKind, Dog>;
  private readonly cat: Cat;
  private readonly hearts: Hearts;
  private live: LivePortrait | null = null;
  private attended: string | null = null;
  private attendSaved: { target: THREE.Vector3; halfW: number } | null = null;
  private readonly flockCtx: FlockCtx;
  // moving about
  private mode: MoveMode = "walk";
  private readonly grid = new Grid();
  private readonly walker: Walker;
  private readonly farmer: Farmer;
  /** The camera is held somewhere other than the farmer (focus, attend, a look-around drag) until he moves. */
  private camHold = false;
  private readonly keys = new Set<string>();
  private keysOn = true;
  private brushing: { id: string; t: number; beat: number } | null = null;
  private readonly chrome: WorldChrome;
  private readonly tapMarker: THREE.Mesh;
  private tapT = -1;
  private promptSpec: PromptSpec | null = null;
  private promptTarget: { kind: "sheep"; id: string } | { kind: "place"; id: Hotspot } | null = null;
  private mmNext = 0;
  // land
  private land = new Map<AreaId, LandInfo>();
  private reveal: Reveal | null = null;
  private revealsDone: AreaId[] = [];

  constructor(container: HTMLElement, handlers: WorldHandlers, opts: WorldOptions = {}) {
    this.container = container;
    this.handlers = handlers;
    this.reduced = !!opts.reducedMotion;
    this.lite = !!opts.lite;
    this.shadows = !this.lite;
    this.seed = opts.seed ?? 7;
    this.mode = opts.move === "pan" ? "pan" : "walk";
    setSheepDetail(this.lite ? "lite" : "full");

    if (getComputedStyle(container).position === "static") container.style.position = "relative";

    this.renderer = new THREE.WebGLRenderer({ antialias: !this.lite, alpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.lite ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const cv = this.renderer.domElement;
    cv.style.display = "block";
    cv.style.width = "100%";
    cv.style.height = "100%";
    cv.style.touchAction = "none";
    cv.dataset.world3d = "1";
    container.appendChild(cv);

    this.label = document.createElement("div");
    Object.assign(this.label.style, {
      position: "absolute", left: "0", top: "0", pointerEvents: "none", display: "none",
      transform: "translate(-50%, -100%)", padding: "3px 10px", borderRadius: "10px",
      background: "rgba(255, 250, 240, 0.94)", color: "#4a3b35", font: "600 13px system-ui, sans-serif",
      boxShadow: "0 2px 6px rgba(60, 40, 30, 0.25)", whiteSpace: "nowrap", zIndex: "2",
    } satisfies Partial<CSSStyleDeclaration>);
    this.label.className = "w3d-label";
    container.appendChild(this.label);

    // camera
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);

    // soft pastoral light (round 3, without the mist)
    this.hemi = new THREE.HemisphereLight("#eaf3ff", "#c9d6b8", 1.5);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff4e6", 2.1);
    this.sun.castShadow = this.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 4;
    const sc = this.sun.shadow.camera;
    sc.near = 1; sc.far = 320;
    this.scene.add(this.sun, this.sun.target);

    // sky
    this.skyCanvas = document.createElement("canvas");
    this.skyCanvas.width = 1024;
    this.skyCanvas.height = 512;
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTex;
    const srng = mulberry32(this.seed ^ 0x51a7);
    for (let i = 0; i < 160; i++) this.stars.push([srng() * 1024, srng() * 330, 0.6 + srng() * 0.9]);

    // the valley
    this.farm = buildFarm(this.seed, { shadows: this.shadows, lite: this.lite });
    this.scene.add(this.farm.group);

    // portrait scene
    this.pScene.add(new THREE.HemisphereLight("#fffaf0", "#b8a890", 1.6));
    const pl = new THREE.DirectionalLight("#fff4e4", 2.2);
    pl.position.set(3, 6, 5);
    this.pScene.add(pl);
    this.pGround = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.08, depthWrite: false }));
    this.pGround.position.y = 0.01;
    this.pScene.add(this.pGround);

    this.parts = new FlockParts(this.scene, this.sheepMats, this.shadows);
    this.puffs = new Puffs(this.scene);
    this.bubble = new Bubble(container);
    this.dogs = { terrier: new Dog(this.scene, this.shadows, "terrier"), collie: new Dog(this.scene, this.shadows, "collie"), maremma: new Dog(this.scene, this.shadows, "maremma") };
    this.cat = new Cat(this.scene, this.shadows, -19);
    this.hearts = new Hearts(this.scene, this.markers.geos.planned, this.markers.mat, this.reduced);

    // the farmer, standing in the home paddock by the gate
    this.walker = buildWalker(this.shadows);
    this.walker.root.scale.setScalar(FARMER_SCALE);
    this.scene.add(this.walker.root);
    this.farmer = { x: -14, z: 3.5, heading: 2.4, vx: 0, vz: 0, path: [], chase: null, arrive: 0.3, then: null, repath: 0, idle: 0, lookNext: 2 };
    this.target.set(this.farmer.x, 0, this.farmer.z).addScaledVector(SCREEN_UP, 1.2);

    this.flockCtx = {
      time: 0, night: 0, attended: null, ents: this.ents.values(), farmer: null,
      insetRect: (zone, r) => this.insetRect(zone, r),
      puff: (x, z, n, size) => { if (!this.reduced) this.puffs.spawn(x, z, n, size); },
    };

    // a felt ring where you tapped to walk
    const tc = document.createElement("canvas");
    tc.width = tc.height = 128;
    const tg = tc.getContext("2d");
    if (tg) {
      tg.lineCap = "round";
      tg.strokeStyle = "rgba(251,246,236,.95)"; tg.lineWidth = 12; tg.beginPath(); tg.arc(64, 64, 46, 0, Math.PI * 2); tg.stroke();
      tg.strokeStyle = "rgba(200,110,95,1)"; tg.lineWidth = 4; tg.setLineDash([9, 7]); tg.beginPath(); tg.arc(64, 64, 46, 0, Math.PI * 2); tg.stroke();
    }
    const tt = new THREE.CanvasTexture(tc);
    tt.colorSpace = THREE.SRGBColorSpace;
    this.tapMarker = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tt, transparent: true, depthWrite: false }));
    this.tapMarker.visible = false;
    this.tapMarker.renderOrder = 3;
    this.scene.add(this.tapMarker);

    this.chrome = new WorldChrome(container, {
      mode: (m) => { this.setMoveMode(m); this.handlers.onMoveMode?.(m); },
      area: (id) => this.handlers.onArea?.(id),
      goto: (w) => this.goto(w),
      prompt: (act) => this.onPrompt(act),
    });
    this.chrome.setMode(this.mode, true);
    this.walker.root.visible = this.mode === "walk";
    if (this.mode === "pan") this.halfW = PAN_HALF;

    this.applySeason(0);

    // events
    cv.addEventListener("pointermove", this.onPointerMove);
    cv.addEventListener("pointerdown", this.onPointerDown);
    cv.addEventListener("pointerup", this.onPointerUp);
    cv.addEventListener("pointerleave", this.onPointerLeave);
    cv.addEventListener("pointercancel", this.onPointerLeave);
    cv.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.resizeObs = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.resize()) : null;
    this.resizeObs?.observe(container);

    this.resize();
    this.renderer.setAnimationLoop(this.frame);
  }

  // ------------------------------------------------------------------ public API

  setSnapshot(s: WorldSnapshot): void {
    if (this.disposed) return;
    const first = this.snap === null;
    this.snap = s;
    if (s.season !== this.season) this.applySeason(s.season);
    const L = this.farm.layers;
    L.bunting.visible = !!s.fairToday;
    L.visitor.visible = !!s.visitorPresent;
    const up = new Set(s.upgrades ?? []);
    L.snugBarn.visible = up.has("barn");
    L.shearing.visible = up.has("shearing");
    for (const k of DOG_KINDS) this.dogs[k].show(up.has(k) || (k === "collie" && up.has("dog")), ZONES.paddock);
    this.cat.show(up.has("cat"));
    this.applyLand(this.landOf(s), !first && !this.reduced);

    const seen = new Set<string>();
    for (const ws of s.sheep) {
      if (seen.has(ws.id)) continue;
      seen.add(ws.id);
      let e = this.ents.get(ws.id);
      const zone: Zone = ZONES[ws.zone] ? ws.zone : "paddock";
      if (!e) {
        e = this.createEnt(ws, zone, !first && !this.reduced);
        this.ents.set(ws.id, e);
      } else {
        const key = sheepKey(ws);
        if (key !== e.key) this.rebuildEnt(e, ws);
        if (zone !== e.zone) {
          e.zone = zone;
          const p = this.findSpot(zone, ws.id, e);
          e.x = e.tx = p[0];
          e.z = e.tz = p[1];
          e.mode = "idle";
          e.timer = 1 + Math.random();
          if (!this.reduced) e.spawn = 0;
        }
        e.ws = ws;
        e.personality = personalityOf(ws);
        e.rig.body.material = this.sheepMats.woolFor(ws.fineness);
      }
      this.applyMarker(e, s);
    }
    for (const [id, e] of this.ents) {
      if (seen.has(id)) continue;
      this.ents.delete(id);
      if (this.hover?.kind === "sheep" && this.hover.id === id) this.setHover(null);
      if (this.brushing?.id === id) this.brushing = null;
      if (this.farmer.chase === id) { this.farmer.chase = null; this.farmer.then = null; this.farmer.path = []; }
      if (this.reduced) this.destroyEnt(e);
      else {
        e.removing = 0;
        this.dying.push(e);
      }
    }
    this.syncTransforms();
  }

  /** Walk (the farmer, default) or pan (drag, signposts, minimap). */
  setMoveMode(m: MoveMode): void {
    if (this.disposed || m === this.mode) return;
    this.mode = m;
    this.keys.clear();
    this.brushing = null;
    this.farmer.path = []; this.farmer.chase = null; this.farmer.then = null;
    this.chrome.setMode(m);
    if (m === "walk") {
      // drop the farmer in near the middle of the view if he is off screen
      const p = this.project(this.farmer.x, 0.8, this.farmer.z);
      if (!p.inView) {
        const f = this.grid.nearestFree(this.target.x, -this.target.z);
        if (f) { this.farmer.x = f[0]; this.farmer.z = -f[1]; }
        if (!this.reduced) this.puffs.spawn(this.farmer.x, this.farmer.z, 8, 1.4);
      }
      this.camHold = false;
      this.glide(this.followPoint(), clamp(this.halfW, ZOOM_LIMITS.walk[0], WALK_HALF + 2), 0.7);
    } else {
      this.camHold = false;
      if (this.halfW < PAN_HALF - 2) this.glide(this.target.clone(), PAN_HALF, 0.5);
    }
    this.walker.root.visible = m === "walk";
  }

  get moveMode(): MoveMode { return this.mode; }

  /** Keyboard walking and prompts are on while no panel covers the farm (the controller says). */
  setKeys(on: boolean): void {
    if (this.keysOn === on) return;
    this.keysOn = on;
    if (!on) { this.keys.clear(); this.brushing = null; }
  }
  portrait(sheep: WorldSheep, px = 96): string {
    if (this.disposed) return "";
    px = Math.max(16, Math.min(512, Math.round(px)));
    const key = `${sheepKey(sheep)}|${sheep.fineness < 21 ? 0 : sheep.fineness < 28 ? 1 : 2}|${px}`;
    const hit = this.pCache.get(key);
    if (hit) return hit;

    const ent = this.ents.get(sheep.id);
    const owned = !(ent && ent.key === sheepKey(sheep));
    const geos = owned ? buildSheepGeos(sheep) : ent!.geos;
    const faceMat = new THREE.MeshStandardMaterial({ color: geos.parts.face, vertexColors: true, roughness: 0.9, metalness: 0 });
    const full = buildFullRig(geos, sheep, this.sheepMats, faceMat);
    const rig = full.rig;
    const pose = restPose();
    pose.headYaw = -0.85;
    pose.headPitch = 0.05;
    pose.headRoll = 0.1;
    full.pose(pose);
    rig.root.rotation.y = 0.42;
    this.pScene.add(rig.root);
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const half = Math.max(size.x, size.y * 1.1, size.z) * 0.47;
    const cam = this.pCam;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
    cam.position.copy(center).add(new THREE.Vector3(0.25, 0.42, 1).normalize().multiplyScalar(20));
    cam.lookAt(center);
    this.pGround.scale.set(size.x * 0.6, 1, size.z * 0.7);
    this.pGround.position.x = center.x;
    this.pGround.position.z = center.z;

    let rt = this.pRTs.get(px);
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(px, px, { samples: 4 });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      this.pRTs.set(px, rt);
    }
    const bg = PORTRAIT_BG[sheep.colour] ?? "#dde8f0";
    this.pScene.background = new THREE.Color(bg);
    const prev = this.renderer.getRenderTarget();
    const prevShadow = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setRenderTarget(rt);
    this.renderer.render(this.pScene, cam);
    const buf = new Uint8Array(px * px * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, px, px, buf);
    this.renderer.setRenderTarget(prev);
    this.renderer.shadowMap.autoUpdate = prevShadow;
    this.pScene.remove(rig.root);
    faceMat.dispose();
    if (owned) disposeGeos(geos);

    const c = this.pCanvas;
    if (c.width !== px) { c.width = px; c.height = px; }
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(px, px);
    const row = px * 4;
    for (let y = 0; y < px; y++) img.data.set(buf.subarray((px - 1 - y) * row, (px - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
    const url = c.toDataURL("image/png");
    if (this.pCache.size > 300) this.pCache.clear();
    this.pCache.set(key, url);
    return url;
  }

  celebrate(id: string): void {
    const e = this.ents.get(id);
    if (!e || this.disposed) return;
    const n = 34;
    const mesh = new THREE.InstancedMesh(this.markers.sparkGeo, this.markers.sparkMat, n);
    const cols = ["#ffd257", "#ff9cc2", "#ffffff", "#8fd0ff", "#b9f09a"];
    const c = new THREE.Color();
    const vel = new Float32Array(n * 3);
    const rng = mulberry32(hashString(id) + Math.floor(this.time * 1000));
    for (let i = 0; i < n; i++) {
      c.set(cols[i % cols.length]!);
      mesh.setColorAt(i, c);
      const a = rng() * Math.PI * 2, sp = 0.8 + rng() * 1.6;
      vel[i * 3] = Math.cos(a) * sp;
      vel[i * 3 + 1] = 2.5 + rng() * 2.5;
      vel[i * 3 + 2] = Math.sin(a) * sp;
    }
    const origin = new THREE.Vector3(e.x, e.geos.dims.top * e.geos.dims.rootScale, e.z);
    const sp: Sparkle = { mesh, vel, origin, t: this.reduced ? 0.45 : 0 };
    this.updateSparkle(sp);
    this.scene.add(mesh);
    this.sparkles.push(sp);
    if (this.reduced) {
      window.setTimeout(() => this.removeSparkle(sp), 1200);
    }
  }

  /**
   * Little hearts float up from a sheep, dog or cat (it has just been greeted or given a treat). `n` is how
   * many (a treat gets more).
   */
  love(id: string, n = 3): void {
    if (this.disposed) return;
    const e = this.ents.get(id);
    const p = e ? new THREE.Vector3(e.x, (e.geos.dims.top + 0.35) * e.geos.dims.rootScale, e.z) : this.petTop(id);
    if (!p) return;
    this.hearts.spawn(p.x, p.y + 0.2, p.z, n);
    if (e && !this.reduced && e.fold < 0.1) { flickEars(e); startHop(e, 0.18, 0.3); }
  }

  /** A dog or the cat says something in a speech bubble (its card opened). */
  say(id: PetKind, text: string): void {
    if (this.disposed || !this.petTop(id)) return;
    this.bubble.show(id, text, this.reduced ? Infinity : 2.4, !this.reduced);
  }

  /** PNG data URL of one of the farm's dogs or the cat, sitting, on a pastel background (cached). */
  petPortrait(id: PetKind, px = 160): string {
    if (this.disposed) return "";
    px = Math.max(16, Math.min(512, Math.round(px)));
    const key = `pet:${id}|${px}`;
    const hit = this.pCache.get(key);
    if (hit) return hit;
    const holder = new THREE.Group();
    const pet = id === "cat" ? new Cat(holder, false) : new Dog(holder, false, id);
    pet.posePortrait();
    const bg = id === "cat" ? "#f2e1c8" : id === "maremma" ? "#d6e6d0" : "#cfe0ee";
    const url = this.renderPortrait(holder, bg, px, 0.62);
    pet.dispose();
    this.pCache.set(key, url);
    return url;
  }

  /** Render an object into a square portrait PNG (shared by sheep and pet portraits). */
  private renderPortrait(root: THREE.Object3D, bg: string, px: number, fit = 0.53): string {
    this.pScene.add(root);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).material as THREE.Material).visible !== false) box.expandByObject(o); });
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const half = Math.max(size.x, size.y * 1.1, size.z) * fit;
    const cam = this.pCam;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
    cam.position.copy(center).add(new THREE.Vector3(0.25, 0.42, 1).normalize().multiplyScalar(20));
    cam.lookAt(center);
    this.pGround.scale.set(size.x * 0.6, 1, size.z * 0.7);
    this.pGround.position.x = center.x;
    this.pGround.position.z = center.z;
    let rt = this.pRTs.get(px);
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(px, px, { samples: 4 });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      this.pRTs.set(px, rt);
    }
    this.pScene.background = new THREE.Color(bg);
    const prev = this.renderer.getRenderTarget();
    const prevShadow = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setRenderTarget(rt);
    this.renderer.render(this.pScene, cam);
    const buf = new Uint8Array(px * px * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, px, px, buf);
    this.renderer.setRenderTarget(prev);
    this.renderer.shadowMap.autoUpdate = prevShadow;
    this.pScene.remove(root);
    const c = this.pCanvas;
    if (c.width !== px) { c.width = px; c.height = px; }
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(px, px);
    const row = px * 4;
    for (let y = 0; y < px; y++) img.data.set(buf.subarray((px - 1 - y) * row, (px - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }


  focus(id: string | Hotspot): void {
    let to: THREE.Vector3 | null = null;
    const e = this.ents.get(id);
    const pt = e ? null : this.petTop(id);
    if (e) to = new THREE.Vector3(e.x, 0, e.z);
    else if (pt) to = new THREE.Vector3(pt.x, 0, pt.z);
    else if ((HOTSPOTS as readonly string[]).includes(id)) {
      const a = HOTSPOT_DEF[id as Hotspot].anchor;
      to = new THREE.Vector3(a[0], 0, a[2]);
    }
    if (!to) return;
    if (this.mode === "walk") this.camHold = true;
    this.glide(to, this.halfW);
  }
  screenPoint(id: string | Hotspot): { x: number; y: number; inView: boolean } | null {
    if (this.disposed) return null;
    const v = new THREE.Vector3();
    const e = this.ents.get(id);
    const pt = e ? null : this.petTop(id);
    if (e) {
      const d = e.geos.dims;
      v.set(e.x, (d.top + 0.1) * d.rootScale + e.pose.bob * d.rootScale, e.z);
    } else if (pt) {
      v.copy(pt);
    } else if ((HOTSPOTS as readonly string[]).includes(id)) {
      const a = HOTSPOT_DEF[id as Hotspot].anchor;
      v.set(a[0], a[1], a[2]);
    } else return null;
    v.project(this.camera);
    const r = this.container.getBoundingClientRect();
    const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height;
    return { x, y, inView: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
  }

  /**
   * Visit a sheep (its card is open): the camera glides in beside it, it stops, turns to face you,
   * flicks its ears, hops or tilts its head and says hello. `null` lets it go back to grazing and
   * returns the camera to where it was.
   */

  /**
   * Visit a sheep (its card is open): the camera glides in beside it, it stops, turns to face you,
   * flicks its ears, hops or tilts its head and says hello. `null` lets it go back to grazing and
   * returns the camera to where it was (to the farmer, when walking).
   */
  attend(id: string | null, opts: AttendOptions = {}): void {
    if (this.disposed) return;
    if (id === this.attended) return;
    const prev = this.attended ? this.ents.get(this.attended) : undefined;
    this.attended = null;
    this.flockCtx.attended = null;
    if (prev) { prev.attendT = -1; this.applyOutline(prev); }
    if (!id) {
      this.bubble.hide();
      if (this.attendSaved) {
        const s = this.attendSaved;
        this.attendSaved = null;
        if (this.mode === "walk") { this.camHold = false; this.glide(this.followPoint(), s.halfW); }
        else this.glide(s.target, s.halfW);
      }
      return;
    }
    const e = this.ents.get(id);
    if (!e) return;
    this.attended = id;
    this.flockCtx.attended = e;
    this.applyOutline(e);
    if (!this.attendSaved) this.attendSaved = { target: this.target.clone(), halfW: this.halfW };
    // camera: close in and put the sheep left of the card
    const half = Math.min(this.halfW, ATTEND_HALF);
    const w = this.container.clientWidth || 1;
    const upp = (half * 2) / w;
    const to = new THREE.Vector3(e.x, 0, e.z).addScaledVector(SCREEN_RIGHT, (opts.offsetPx ?? 0) * upp);
    this.camHold = true;
    this.glide(to, half);
    // the sheep reacts
    e.attendT = 0;
    e.mode = "attend";
    e.nuzzle = null;
    e.follow = -1;
    const fond = fondOf(e);
    const say = opts.say ?? `${BLEATS[e.personality][0]!}${fond >= 80 ? " ♥" : ""}`;
    if (this.reduced) {
      e.heading = FACE_CAMERA;
      this.bubble.show(id, say, Infinity, false);
    } else {
      flickEars(e);
      const P = e.personality;
      window.setTimeout(() => {
        if (this.attended !== id || this.disposed) return;
        if (fond < FOND_SKITTISH) startHop(e, 0.16, 0.34, 1.1); // skittish: backs away first, whatever its temper
        else if (P === "bold") startHop(e, 0.42, 0.5);
        else if (P === "curious") startHop(e, 0.3, 0.42);
        else if (P === "shy") startHop(e, 0.14, 0.3, 0.9);
        this.bubble.show(id, say, 2.8, true);
      }, P === "calm" ? 450 : 320);
      // shy and skittish neighbours shuffle away from the fuss; fond ones come over soon
      for (const o of this.ents.values()) {
        if (o === e || o.zone !== e.zone || o.fold > 0.1) continue;
        if (fondOf(o) >= FOND_TRUSTING && o.personality !== "shy") { o.timer = Math.min(o.timer, 0.3 + Math.random() * 0.6); continue; }
        if (o.personality !== "shy" && fondOf(o) >= FOND_SKITTISH) continue;
        const d = Math.hypot(o.x - e.x, o.z - e.z);
        if (d > 4) continue;
        o.heading = Math.atan2(-(o.z - e.z), o.x - e.x) + Math.PI;
        startHop(o, 0.12, 0.28, 1.4);
        flickEars(o);
        o.timer = 0.4;
      }
    }
  }
  mountPortrait(el: HTMLElement, sheep: WorldSheep): () => void {
    if (this.disposed) return () => {};
    if (!this.live) this.live = new LivePortrait(this.reduced, (id) => this.handlers.onPortraitClick?.(id), (id, phase) => this.handlers.onBrush?.(id, phase));
    return this.live.mount(el, { ...sheep, personality: personalityOf(sheep) });
  }

  /** The live portrait's sheep has just had a full brushing: hearts and a contented bubble in the card. */
  portraitCheer(): void {
    if (!this.disposed) this.live?.cheer();
  }

  sleepTransition(): Promise<void> {
    return this.animateNight(1);
  }

  dawn(): Promise<void> {
    return this.animateNight(0);
  }


  // ------------------------------------------------------------------ camera

  private glide(to: THREE.Vector3, half: number, durS = FOCUS_MS / 1000): void {
    this.clampTarget(to);
    half = clamp(half, 5, 34);
    if (this.reduced) {
      this.target.copy(to);
      this.halfW = half;
      this.focusAnim = null;
      this.applyCamera();
    } else {
      const d = this.target.distanceTo(to);
      this.focusAnim = { from: this.target.clone(), to, t0: performance.now(), dur: durS * 1000 * (d > 25 ? 1.6 : 1), h0: this.halfW, h1: half, lift: Math.min(6, d * 0.06) };
    }
    this.panVel.set(0, 0);
  }

  /** Where the camera looks while it follows the farmer: a little ahead of him, and he sits below centre. */
  private followPoint(): THREE.Vector3 {
    const F = this.farmer;
    const la = 0.5, lx = F.vx * la, lz = F.vz * la, ll = Math.hypot(lx, lz), m = ll > 3 ? 3 / ll : 1;
    return new THREE.Vector3(F.x + lx * m, 0, F.z + lz * m).addScaledVector(SCREEN_UP, 1.2);
  }

  private applyCamera(): void {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    const half = this.halfW, aspect = w / h;
    const c = this.camera;
    c.left = -half; c.right = half; c.top = half / aspect; c.bottom = -half / aspect;
    c.zoom = 1;
    c.updateProjectionMatrix();
    c.position.copy(this.target).addScaledVector(CAM_DIR, CAM_DIST);
    c.lookAt(this.target);
    c.updateMatrixWorld();
    // keep the sun's shadow box on the view, snapped to shadow texels so edges don't crawl while moving
    const sh = Math.min(70, half * 1.7 + 6);
    const sc = this.sun.shadow.camera;
    if (sc.right !== sh) { sc.left = -sh; sc.right = sh; sc.top = sh; sc.bottom = -sh; sc.updateProjectionMatrix(); }
    const texel = (2 * sh) / 2048;
    const ls = this.target.clone().applyMatrix4(this.lightInv);
    ls.x = Math.round(ls.x / texel) * texel; ls.y = Math.round(ls.y / texel) * texel;
    const snapped = ls.applyMatrix4(this.lightBasis);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(this.lightDir, 140);
    this.sun.target.updateMatrixWorld();
  }
  private readonly lightDir = new THREE.Vector3(-0.5, 0.9, 0.7).normalize();
  private readonly lightBasis = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(0.5, -0.9, -0.7).normalize(), new THREE.Vector3(0, 1, 0));
  private readonly lightInv = this.lightBasis.clone().invert();

  private clampTarget(t: THREE.Vector3): void {
    t.x = clamp(t.x, -64, 88);
    t.z = clamp(t.z, -42, 32);
    t.y = 0;
  }

  /** A world point on screen (px within the container) and whether it is in view. */
  private project(x: number, y: number, z: number): { x: number; y: number; inView: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, inView: Math.abs(v.x) <= 1.02 && Math.abs(v.y) <= 1.02 };
  }

  resize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.applyCamera();
  }

  // ------------------------------------------------------------------ land and the reveal

  /** The land as the snapshot gives it, or the old default (home, the flats with `paddock2`, the far bank with the meadow). */
  private landOf(s: WorldSnapshot): LandInfo[] {
    if (s.land?.length) return s.land;
    const up = new Set(s.upgrades ?? []);
    return [
      { id: "home", state: "open" },
      { id: "flats", state: s.paddock2 ? "open" : "locked" },
      { id: "farbank", state: up.has("meadow") ? "open" : "locked" },
      { id: "rushy", state: "later" },
      { id: "terraces", state: "later" },
    ];
  }

  private applyLand(list: LandInfo[], animate: boolean): void {
    for (const info of list) {
      if (info.id === "home") { this.land.set("home", info); continue; }
      const prev = this.land.get(info.id)?.state;
      this.land.set(info.id, info);
      const open = info.state === "open";
      if (prev === undefined) this.setLandVisual(info.id, open);
      else if (prev !== "open" && open) {
        if (animate && !this.reveal) this.startReveal(info.id);
        else if (this.reveal?.id !== info.id) this.setLandVisual(info.id, true);
      } else if (prev === "open" && !open) this.setLandVisual(info.id, false);
    }
    if (!this.reveal) this.grid.setOpen(this.openLand());
    this.chrome.setLand([...this.land.values()]);
  }

  private openLand(): AreaId[] {
    return [...this.land.values()].filter((l) => l.state === "open").map((l) => l.id);
  }

  /** Show a piece of land fully open or fully locked, at once. */
  private setLandVisual(id: AreaId, open: boolean): void {
    const L = this.farm.lands[id];
    if (!L) return;
    L.scrub.forEach((im, k) => { im.visible = !open; L.scrubM[k]!.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; });
    if (L.tall) { L.tall.visible = !open; L.tallM.forEach((m, i) => L.tall!.setMatrixAt(i, m)); L.tall.instanceMatrix.needsUpdate = true; }
    if (L.short) { L.short.visible = open; L.shortM.forEach((m, i) => L.short!.setMatrixAt(i, m)); L.short.instanceMatrix.needsUpdate = true; }
    if (L.broken) { L.broken.visible = !open; L.broken.scale.y = 1; }
    for (const [im, list] of [[L.posts, L.postsM], [L.rails, L.railsM]] as const) {
      if (!im) continue;
      im.visible = open;
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
    }
    if (L.open) { L.open.visible = open; L.open.scale.set(1, 1, 1); }
    const arr = this.farm.terrainAttr.array as Float32Array;
    const src = open ? L.to : L.from;
    for (let i = 0; i < L.idx.length; i++) { const j = L.idx[i]!; arr[j] = src[i * 3]!; arr[j + 1] = src[i * 3 + 1]!; arr[j + 2] = src[i * 3 + 2]!; }
    this.farm.terrainAttr.needsUpdate = true;
    if (id === "farbank") {
      this.farm.layers.bridge.visible = open;
      this.farm.layers.bridge.scale.y = 1;
      this.farm.layers.bridgeStumps.visible = !open;
    }
  }

  private revealCache: { scrub: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; sw: number }[][]; tall: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; sw: number }[]; short: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; sw: number }[] } | null = null;

  /** Opening land: scrub clears in a sweep from the gate, rank grass gives way to lawn, the ground greens, the fence mends. */
  private startReveal(id: AreaId): void {
    const L = this.farm.lands[id];
    this.setLandVisual(id, false);
    const dec = (m: THREE.Matrix4) => { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return { p, q, s, sw: L.sweep(p.x, -p.z) }; };
    this.revealCache = { scrub: L.scrubM.map((list) => list.map(dec)), tall: L.tallM.map(dec), short: L.shortM.map(dec) };
    if (L.short) { L.short.visible = true; for (let i = 0; i < L.shortM.length; i++) L.short.setMatrixAt(i, this.zeroM); L.short.instanceMatrix.needsUpdate = true; }
    for (const im of [L.posts, L.rails]) if (im) { im.visible = true; for (let i = 0; i < im.count; i++) im.setMatrixAt(i, this.zeroM); im.instanceMatrix.needsUpdate = true; }
    if (id === "farbank") { this.farm.layers.bridge.visible = true; this.farm.layers.bridge.scale.y = 0.001; }
    this.reveal = { id, t: 0, land: L };
    this.container.dataset.reveal = "running";
    this.keys.clear();
    this.brushing = null;
    this.farmer.path = []; this.farmer.chase = null; this.farmer.then = null;
    const [u0, u1, v0, v1] = AREAS[id].rect;
    const c = new THREE.Vector3((u0 + u1) / 2, 0, -((v0 + v1) / 2) + (id === "farbank" ? 3 : 0));
    const aspect = (this.container.clientWidth || 1) / (this.container.clientHeight || 1);
    this.camHold = true;
    this.glide(c, Math.max((u1 - u0) / 2 + 3, ((v1 - v0) / 2 + 4) * aspect * Math.sin(ISO_PITCH) * 1.6), 1.1);
  }
  private readonly zeroM = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);

  private stepReveal(dt: number): void {
    const R = this.reveal;
    if (!R || !this.revealCache) return;
    const L = R.land, C = this.revealCache;
    const t0 = R.t;
    R.t += dt;
    const t = R.t;
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    const grow = (x: number) => { const c = 1.9, k = clamp(x, 0, 1); return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
    // scrub clears in a sweep away from the gate, with a puff of dust as each clump goes
    L.scrub.forEach((im, k) => {
      C.scrub[k]!.forEach((g, i) => {
        const d = 0.9 + g.sw * 1.5, q = ss(d, d + 0.45, t);
        im.setMatrixAt(i, m.compose(g.p, g.q, v.set(g.s.x * (1 - 0.5 * q), Math.max(0.0001, g.s.y * (1 - q)), g.s.z * (1 - 0.5 * q))));
        if (t0 < d + 0.05 && t >= d + 0.05 && i % 2 === 0) this.puffs.spawn(g.p.x, g.p.z, 3, 1.2);
      });
      im.instanceMatrix.needsUpdate = true;
      if (t > 3) im.visible = false;
    });
    // rank grass shrinks, lawn grows in, and the ground greens behind the sweep
    if (t < 4.6) {
      if (L.tall) { C.tall.forEach((g, i) => { const d = 1.0 + g.sw * 1.5, k = 1 - ss(d, d + 0.5, t); L.tall!.setMatrixAt(i, m.compose(g.p, g.q, v.copy(g.s).multiplyScalar(Math.max(0.0001, k)))); }); L.tall.instanceMatrix.needsUpdate = true; }
      if (L.short) { C.short.forEach((g, i) => { const d = 1.3 + g.sw * 1.5, k = ss(d, d + 0.6, t); L.short!.setMatrixAt(i, m.compose(g.p, g.q, v.copy(g.s).multiplyScalar(Math.max(0.0001, k)))); }); L.short.instanceMatrix.needsUpdate = true; }
      const arr = this.farm.terrainAttr.array as Float32Array;
      for (let i = 0; i < L.idx.length; i++) {
        const d = 1.0 + L.sweep(L.uv[i * 2]!, L.uv[i * 2 + 1]!) * 1.5, k = ss(d, d + 0.7, t), j = L.idx[i]!;
        arr[j] = L.from[i * 3]! + (L.to[i * 3]! - L.from[i * 3]!) * k;
        arr[j + 1] = L.from[i * 3 + 1]! + (L.to[i * 3 + 1]! - L.from[i * 3 + 1]!) * k;
        arr[j + 2] = L.from[i * 3 + 2]! + (L.to[i * 3 + 2]! - L.from[i * 3 + 2]!) * k;
      }
      this.farm.terrainAttr.needsUpdate = true;
    }
    // the old sign and broken fence go; new posts stand up one after another round the paddock
    if (L.broken) { const k = ss(1.1, 1.7, t); L.broken.scale.y = Math.max(0.0001, 1 - k); L.broken.visible = k < 1; }
    const n = L.postsM.length;
    L.postsM.forEach((pm, i) => {
      const d = 1.6 + (i / Math.max(1, n)) * 1.8, k = (t - d) / 0.35;
      const s = Math.max(0.0001, k <= 0 ? 0 : grow(k));
      L.posts?.setMatrixAt(i, m.copy(pm).multiply(new THREE.Matrix4().makeScale(1, s, 1)));
      if (i < L.railsM.length) L.rails?.setMatrixAt(i, m.copy(L.railsM[i]!).multiply(new THREE.Matrix4().makeScale(1, Math.max(0.0001, k <= 0.4 ? 0 : grow((k - 0.4) / 0.8)), 1)));
      if (t0 < d && t >= d && i % 2 === 0) { const p = new THREE.Vector3().setFromMatrixPosition(pm); this.puffs.spawn(p.x, p.z, 2, 0.8); }
    });
    if (L.posts) L.posts.instanceMatrix.needsUpdate = true;
    if (L.rails) L.rails.instanceMatrix.needsUpdate = true;
    if (R.id === "farbank") this.farm.layers.bridge.scale.y = Math.max(0.001, grow((t - 0.5) / 0.8));
    if (R.id === "farbank" && t > 0.6) this.farm.layers.bridgeStumps.visible = false;
    if (L.open) { const k = (t - 3.4) / 0.4; L.open.visible = k > 0; L.open.scale.setScalar(Math.max(0.0001, grow(k))); }
    if (t0 < 3.9 && t >= 3.9) this.grid.setOpen(this.openLand());
    if (t >= 5.2) {
      this.setLandVisual(R.id, true);
      this.revealsDone.push(R.id);
      this.reveal = null;
      this.revealCache = null;
      this.container.dataset.reveal = "done";
      this.grid.setOpen(this.openLand());
      if (this.mode === "walk") { this.camHold = false; this.glide(this.followPoint(), Math.min(this.halfW, WALK_HALF + 1), 1.1); }
    }
  }

  // ------------------------------------------------------------------ the farmer

  private walkerOn(): boolean { return this.mode === "walk"; }

  /** Walk the farmer to (x, z) along a path round fences and buildings. `then` runs on arrival. */
  private walkTo(x: number, z: number, o: { then?: () => void; chase?: string; arrive?: number; marker?: boolean } = {}): boolean {
    const F = this.farmer;
    this.camHold = false;
    const goal = this.grid.nearestFree(x, -z);
    if (!goal) return false;
    if (this.reduced) {
      // no walking animation: the farmer is simply there
      F.x = goal[0]; F.z = -goal[1]; F.vx = F.vz = 0; F.path = []; F.chase = null; F.then = null;
      if (o.chase) { const e = this.ents.get(o.chase); if (e) F.heading = Math.atan2(-(e.z - F.z), e.x - F.x); }
      this.target.copy(this.followPoint());
      this.applyCamera();
      o.then?.();
      return true;
    }
    const path = this.grid.path([F.x, -F.z], [x, -z]);
    F.chase = o.chase ?? null;
    F.arrive = o.arrive ?? 0.3;
    F.then = o.then ?? null;
    F.repath = 0.5;
    F.path = (path ?? []).map(([u, v]) => new THREE.Vector2(u, -v));
    if (!path) { F.chase = null; F.then = null; return false; }
    if (o.marker !== false) {
      const end = F.path[F.path.length - 1];
      if (end) { this.tapMarker.position.set(end.x, 0.06, end.y); this.tapMarker.visible = true; this.tapT = 0; }
    }
    return true;
  }

  /** Go and see a sheep: near ones get their card at once while he strolls over; far ones when he arrives. */
  private visitSheep(id: string): void {
    const e = this.ents.get(id);
    if (!e) return;
    const F = this.farmer;
    const d = Math.hypot(e.x - F.x, e.z - F.z);
    const face = () => { const s = this.ents.get(id); if (s) F.heading = Math.atan2(-(s.z - F.z), s.x - F.x); };
    if (this.reduced) {
      const dir = new THREE.Vector3(F.x - e.x, 0, F.z - e.z);
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
      dir.normalize().multiplyScalar(2);
      this.walkTo(e.x + dir.x, e.z + dir.z, { chase: id });
      face();
      this.handlers.onSheep(id);
      return;
    }
    if (d < NEAR_SHEEP) {
      this.handlers.onSheep(id);
      if (d > 2.4) this.walkTo(e.x, e.z, { chase: id, arrive: 2.2, marker: false, then: face });
      else face();
    } else {
      this.walkTo(e.x, e.z, { chase: id, arrive: 2.3, marker: false, then: () => { face(); if (this.ents.has(id)) this.handlers.onSheep(id); } });
    }
  }

  /** Go to a place; open it on arrival (or at once when he is already there). */
  private visitPlace(h: Hotspot, open = true): void {
    const [u, v] = HOTSPOT_STAND[h];
    const F = this.farmer;
    const d = Math.hypot(u - F.x, -v - F.z);
    if (d < NEAR_PLACE && !this.reduced) { if (open) this.handlers.onHotspot(h); return; }
    const ok = this.walkTo(u, -v, { then: () => { if (open) this.handlers.onHotspot(h); } });
    if (!ok && open) this.handlers.onHotspot(h);
  }

  /** Signposts, placards, price tags and the minimap: go and have a look. */
  private goto(w: { area?: AreaId; spot?: Hotspot | "home"; u?: number; v?: number; open?: boolean }): void {
    if (this.reveal) return;
    if (this.mode === "walk") {
      if (w.area) { const s = AREAS[w.area].stand; this.walkTo(s[0], -s[1]); }
      else if (w.spot === "home") this.walkTo(-14, 4);
      else if (w.spot) this.visitPlace(w.spot, !!w.open);
      else if (w.u !== undefined && w.v !== undefined) this.walkTo(w.u, -w.v);
      return;
    }
    if (w.spot && w.spot !== "home" && w.open) { this.handlers.onHotspot(w.spot); return; }
    let to: THREE.Vector3, half = this.halfW;
    if (w.area) {
      const [u0, u1, v0, v1] = AREAS[w.area].rect;
      to = new THREE.Vector3((u0 + u1) / 2, 0, -(v0 + v1) / 2 + (w.area === "farbank" ? 3 : 0));
      half = Math.max(PAN_HALF, (u1 - u0) / 2 + 2);
    } else if (w.spot === "home") { to = new THREE.Vector3(-18, 0, 0.5); half = PAN_HALF; }
    else if (w.spot) { const a = HOTSPOT_DEF[w.spot].anchor; to = new THREE.Vector3(a[0], 0, a[2] + 2); half = PAN_HALF; }
    else to = new THREE.Vector3(w.u ?? 0, 0, -(w.v ?? 0));
    this.glide(to, half, 1.1);
  }

  private stepFarmer(dt: number): void {
    const F = this.farmer;
    let dx = 0, dz = 0;
    const k = (a: string, b: string) => this.keys.has(a) || this.keys.has(b);
    const up = +k("w", "arrowup") - +k("s", "arrowdown"), right = +k("d", "arrowright") - +k("a", "arrowleft");
    const speed = this.keys.has("shift") ? RUN_SPEED : WALK_SPEED;
    if (up || right) {
      const ix = SCREEN_UP.x * up + SCREEN_RIGHT.x * right, iz = SCREEN_UP.z * up + SCREEN_RIGHT.z * right;
      const l = Math.hypot(ix, iz) || 1;
      dx = (ix / l) * speed; dz = (iz / l) * speed;
      F.path = []; F.then = null; F.chase = null;
      this.camHold = false;
    } else if (F.path.length || F.chase) {
      const done = () => { F.path = []; const t = F.then; F.then = null; F.chase = null; t?.(); };
      if (F.chase) {
        F.repath -= dt;
        const c = this.ents.get(F.chase);
        if (!c) { F.chase = null; F.then = null; F.path = []; }
        else if (Math.hypot(c.x - F.x, c.z - F.z) < F.arrive) done();
        else if (F.repath <= 0) { F.path = (this.grid.path([F.x, -F.z], [c.x, -c.z]) ?? []).map(([u, v]) => new THREE.Vector2(u, -v)); F.repath = 0.5; }
      }
      const p = F.path[0];
      if (p) {
        const px = p.x - F.x, pz = p.y - F.z, d = Math.hypot(px, pz);
        const last = F.path.length === 1;
        if (d < (last ? Math.max(0.25, F.chase ? 0.25 : F.arrive) : 0.35)) {
          F.path.shift();
          if (!F.path.length) done();
        } else {
          const sp = last ? Math.min(speed, 1.2 + d * 2.2) : speed;
          dx = (px / d) * sp; dz = (pz / d) * sp;
        }
      } else if (F.chase && F.repath > 0.2) done(); // as close as the fences allow
    }
    const a = Math.min(1, dt * 12);
    F.vx += (dx - F.vx) * a;
    F.vz += (dz - F.vz) * a;
    const nx = F.x + F.vx * dt, nz = F.z + F.vz * dt;
    const free = (x: number, z: number) => !this.grid.blocked(x, -z);
    if (free(nx, nz)) { F.x = nx; F.z = nz; }
    else if (free(nx, F.z)) F.x = nx;
    else if (free(F.x, nz)) F.z = nz;
    else { F.vx *= 0.3; F.vz *= 0.3; }
    const sp = Math.hypot(F.vx, F.vz);
    if (sp > 0.3) {
      const ta = Math.atan2(-F.vz, F.vx);
      F.heading += Math.atan2(Math.sin(ta - F.heading), Math.cos(ta - F.heading)) * Math.min(1, dt * 12);
      F.idle = 0;
      this.walker.look(0);
    } else {
      F.idle += dt;
      F.lookNext -= dt;
      if (F.idle > 1.2 && F.lookNext <= 0 && !this.reduced) {
        let yaw = (Math.random() - 0.5) * 1.8;
        let near: Ent | null = null, nd = 8;
        for (const e of this.ents.values()) { const d = Math.hypot(e.x - F.x, e.z - F.z); if (d < nd) { nd = d; near = e; } }
        if (near && Math.random() < 0.6) yaw = Math.atan2(-(near.z - F.z), near.x - F.x) - F.heading;
        yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        this.walker.look(clamp(yaw, -1.1, 1.1));
        F.lookNext = 1.6 + Math.random() * 2.2;
      }
    }
    if (this.walker.pose(this.reduced ? 0 : sp, this.reduced ? 0 : dt, this.time) && !this.reduced) {
      this.puffs.spawn(F.x - Math.cos(F.heading) * 0.2, F.z + Math.sin(F.heading) * 0.2, 2, sp > 5.5 ? 0.75 : 0.5);
    }
    this.walker.root.position.set(F.x, 0, F.z);
    this.walker.root.rotation.y = F.heading;
  }

  /** The walk-up prompt: a sheep in reach (E say hello, F hold to brush) or a place (E). */
  private updatePrompt(): void {
    this.promptSpec = null;
    this.promptTarget = null;
    if (this.mode !== "walk" || !this.keysOn || this.reveal || this.night > 0.3) return;
    const F = this.farmer;
    let best: Ent | null = null, bd = PROMPT_SHEEP;
    for (const e of this.ents.values()) {
      if (e.removing >= 0 || e.zone === "market") continue;
      const d = Math.hypot(e.x - F.x, e.z - F.z);
      if (d < bd) { bd = d; best = e; }
    }
    let place: Hotspot | null = null, pd = PROMPT_PLACE;
    for (const h of HOTSPOTS) {
      const [u, v] = HOTSPOT_STAND[h];
      const d = Math.hypot(u - F.x, -v - F.z);
      if (d < pd) { pd = d; place = h; }
    }
    if (place && !(best && bd < 1.9)) {
      this.promptSpec = { key: "E", act: "use", label: PLACE_VERB[place] };
      this.promptTarget = { kind: "place", id: place };
    } else if (best) {
      this.promptSpec = { key: "E", act: "hello", label: "Say hello", hold: { label: "Brush" } };
      this.promptTarget = { kind: "sheep", id: best.ws.id };
    }
  }

  private onPrompt(act: "hello" | "use" | "brush-down" | "brush-up"): void {
    const t = this.promptTarget;
    if (act === "brush-up") { this.brushing = null; return; }
    if (!t) return;
    if (act === "hello" && t.kind === "sheep") this.sayHello(t.id);
    else if (act === "use" && t.kind === "place") this.handlers.onHotspot(t.id);
    else if (act === "brush-down" && t.kind === "sheep") this.startBrush(t.id);
  }

  /** E beside a sheep: turn to it and open its card (opening the card is how you greet a sheep). */
  private sayHello(id: string): void {
    const e = this.ents.get(id);
    if (!e) return;
    const F = this.farmer;
    F.heading = Math.atan2(-(e.z - F.z), e.x - F.x);
    this.handlers.onSheep(id);
  }

  private startBrush(id: string): void {
    if (this.brushing) return;
    const e = this.ents.get(id);
    if (!e) return;
    this.brushing = { id, t: 0, beat: 0 };
    const F = this.farmer;
    F.heading = Math.atan2(-(e.z - F.z), e.x - F.x);
    e.look = [F.x, F.z];
    e.mode = "idle";
    e.timer = 2;
    e.follow = -1;
  }

  private stepBrush(dt: number): void {
    const b = this.brushing;
    if (!b) return;
    const e = this.ents.get(b.id);
    const F = this.farmer;
    if (!e || Math.hypot(e.x - F.x, e.z - F.z) > 3.4 || this.mode !== "walk") { this.brushing = null; return; }
    b.t += dt;
    e.look = [F.x, F.z];
    if (e.mode !== "attend") { e.mode = "idle"; e.timer = Math.max(e.timer, 0.6); }
    if (b.t - b.beat >= 0.4) { b.beat = b.t; this.handlers.onBrush?.(b.id, "stroke"); if (!this.reduced) this.puffs.spawn(e.x, e.z, 2, 0.5); }
    if (b.t >= 1.2) {
      this.brushing = null;
      if (!this.reduced && e.fold < 0.1) { flickEars(e); startHop(e, 0.14, 0.3); }
      this.handlers.onBrush?.(b.id, "done");
    }
  }



  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObs?.disconnect();
    const cv = this.renderer.domElement;
    cv.removeEventListener("pointermove", this.onPointerMove);
    cv.removeEventListener("pointerdown", this.onPointerDown);
    cv.removeEventListener("pointerup", this.onPointerUp);
    cv.removeEventListener("pointerleave", this.onPointerLeave);
    cv.removeEventListener("pointercancel", this.onPointerLeave);
    cv.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    for (const e of this.ents.values()) this.destroyEnt(e);
    for (const e of this.dying) this.destroyEnt(e);
    this.ents.clear();
    this.dying.length = 0;
    for (const s of [...this.sparkles]) this.removeSparkle(s);
    this.parts.dispose();
    this.puffs.dispose();
    this.bubble.dispose();
    for (const k of DOG_KINDS) this.dogs[k].dispose();
    this.cat.dispose();
    this.hearts.dispose();
    this.walker.dispose();
    this.chrome.dispose();
    this.live?.dispose();
    this.live = null;
    if (this.particles) { this.particles.geometry.dispose(); (this.particles.material as THREE.Material).dispose(); }
    this.tapMarker.geometry.dispose();
    (this.tapMarker.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.tapMarker.material as THREE.Material).dispose();
    this.farm.dispose();
    this.sheepMats.dispose();
    this.markers.dispose();
    this.skyTex.dispose();
    for (const rt of this.pRTs.values()) rt.dispose();
    this.pGround.geometry.dispose();
    (this.pGround.material as THREE.Material).dispose();
    this.renderer.dispose();
    cv.remove();
    this.label.remove();
    delete this.container.dataset.reveal;
  }

  /** Not part of the contract: point the camera at (x, z) with half-width `halfW` (dev harness, probe sheets). */
  debugCamera(x: number, z: number, halfW: number): void {
    this.camHold = true;
    this.focusAnim = null;
    this.target.set(x, 0, z);
    this.halfW = halfW;
    this.applyCamera();
  }

  /** Not part of the contract: render stats and the farmer/camera/land for the dev harness and probes. */
  debugStats(): {
    calls: number; triangles: number; sheep: number; geometries: number; dog: boolean; dogs: DogKind[]; cat: boolean; hearts: number;
    attended: string | null; bubble: string | null; portrait: PortraitStats; lite: boolean; shadows: boolean;
    mode: MoveMode; farmer: { x: number; z: number; moving: boolean; path: number; visible: boolean };
    camera: { x: number; z: number; halfW: number; gliding: boolean; held: boolean };
    land: Record<string, string>; reveal: { area: AreaId | null; t: number; done: AreaId[] }; prompt: string; keys: boolean;
    sheepAt: Record<string, { x: number; z: number; zone: Zone }>;
  } {
    const i = this.renderer.info;
    const F = this.farmer;
    const sheepAt: Record<string, { x: number; z: number; zone: Zone }> = {};
    for (const [id, e] of this.ents) sheepAt[id] = { x: +e.x.toFixed(2), z: +e.z.toFixed(2), zone: e.zone };
    return {
      calls: i.render.calls, triangles: i.render.triangles, sheep: this.ents.size, geometries: i.memory.geometries,
      dog: DOG_KINDS.some((k) => this.dogs[k].visible), dogs: DOG_KINDS.filter((k) => this.dogs[k].visible), cat: this.cat.visible,
      hearts: this.hearts.active, attended: this.attended, bubble: this.bubble.id ? this.bubble.el.textContent : null,
      portrait: this.live?.stats() ?? { mounted: false, id: null, calls: 0, frames: 0, brush: 0, hold: 0, ring: false, holding: false, fluff: 0, hearts: 0, brushDone: false },
      lite: this.lite, shadows: this.shadows, mode: this.mode,
      farmer: { x: +F.x.toFixed(2), z: +F.z.toFixed(2), moving: Math.hypot(F.vx, F.vz) > 0.3, path: F.path.length, visible: this.walker.root.visible },
      camera: { x: +this.target.x.toFixed(2), z: +this.target.z.toFixed(2), halfW: +this.halfW.toFixed(2), gliding: !!this.focusAnim, held: this.camHold },
      land: Object.fromEntries([...this.land.values()].map((l) => [l.id, l.state])),
      reveal: { area: this.reveal?.id ?? null, t: this.reveal?.t ?? 0, done: [...this.revealsDone] },
      prompt: this.promptTarget ? `${this.promptTarget.kind}:${this.promptTarget.id}` : "", keys: this.keysOn, sheepAt,
    };
  }

  // ------------------------------------------------------------------ season / night

  private applySeason(season: number): void {
    const s = clamp(Math.round(season), 0, 3);
    this.season = s;
    const L = SEASONS[s]!;
    const M = this.farm.mats;
    M.terrain.color.set(L.groundTint);
    M.grass.color.set(L.groundTint);
    M.foliage.color.set(L.foliageTint);
    M.props.color.set("#ffffff");
    SEASON_U.uSnow.value = L.snow;
    const lay = this.farm.layers;
    lay.snow.visible = s === 3;
    lay.spring.visible = s === 0;
    lay.summer.visible = s === 1;
    lay.flowers.visible = s <= 1;
    lay.autumn.visible = s === 2;
    for (const g of this.farm.grass) g.visible = s !== 3;
    this.buildParticles(L.particles, s);
    this.updateLighting();
  }

  private updateLighting(): void {
    const L = SEASONS[this.season] ?? SEASONS[0]!;
    const n = this.night;
    const lerpC = (a: string, b: string) => new THREE.Color(a).lerp(new THREE.Color(b), n);
    this.sun.color.copy(lerpC(L.sun, NIGHT.sun));
    this.sun.intensity = L.sunI + (NIGHT.sunI - L.sunI) * n;
    this.hemi.color.copy(lerpC(L.hemiSky, NIGHT.hemiSky));
    this.hemi.groundColor.copy(lerpC(L.hemiGround, NIGHT.hemiGround));
    this.hemi.intensity = L.hemiI + (NIGHT.hemiI - L.hemiI) * n;
    this.farm.windowMat.emissiveIntensity = n * 1.6;
    this.drawSky(lerpC(L.skyTop, NIGHT.skyTop), lerpC(L.skyBottom, NIGHT.skyBottom), n);
  }

  private drawSky(top: THREE.Color, bottom: THREE.Color, n: number): void {
    const ctx = this.skyCanvas.getContext("2d");
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, `#${top.getHexString(THREE.SRGBColorSpace)}`);
    g.addColorStop(1, `#${bottom.getHexString(THREE.SRGBColorSpace)}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 512);
    if (n > 0.02) {
      ctx.fillStyle = `rgba(255, 250, 225, ${(n * 0.9).toFixed(3)})`;
      for (const [x, y, r] of this.stars) ctx.fillRect(x, y, r, r * 1.6);
    }
    this.skyTex.needsUpdate = true;
  }
  private animateNight(to: number): Promise<void> {
    if (this.nightAnim) {
      this.nightAnim.resolve();
      this.nightAnim = null;
    }
    if (this.reduced || this.disposed) {
      this.night = to;
      this.updateLighting();
      if (!this.disposed) this.render();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.nightAnim = { from: this.night, to, t0: performance.now(), resolve };
    });
  }

  private buildParticles(cols: string[], season: number): void {
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      (this.particles.material as THREE.Material).dispose();
      this.particles = null;
    }
    if (!cols.length) return;
    const snow = season === 3;
    const n = snow ? 160 : season === 2 ? 60 : 44;
    const geo = snow ? new THREE.OctahedronGeometry(0.09, 0) : new THREE.PlaneGeometry(0.28, 0.19);
    const mat = snow
      ? new THREE.MeshBasicMaterial({ color: "#ffffff" })
      : new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1 });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    const rng = mulberry32(this.seed * 31 + season);
    const c = new THREE.Color();
    // per particle: x, y, z, fall speed, sway phase, spin
    this.particleData = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      c.set(cols[i % cols.length]!);
      mesh.setColorAt(i, c);
      const o = i * 6;
      this.particleData[o] = (rng() - 0.5) * 70;
      this.particleData[o + 1] = rng() * 9;
      this.particleData[o + 2] = (rng() - 0.5) * 60;
      this.particleData[o + 3] = snow ? 0.7 + rng() * 0.5 : 0.35 + rng() * 0.35;
      this.particleData[o + 4] = rng() * 10;
      this.particleData[o + 5] = 0.5 + rng() * 2;
    }
    this.particles = mesh;
    this.scene.add(mesh);
    this.stepParticles(0);
  }

  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _e = new THREE.Euler();
  private readonly _p = new THREE.Vector3();
  private readonly _s = new THREE.Vector3(1, 1, 1);

  private stepParticles(dt: number): void {
    const mesh = this.particles;
    if (!mesh) return;
    const D = this.particleData;
    for (let i = 0; i < mesh.count; i++) {
      const o = i * 6;
      D[o + 1]! -= D[o + 3]! * dt;
      if (D[o + 1]! < 0) D[o + 1] = 9;
      const ph = D[o + 4]! + this.time * 0.9;
      this._p.set(this.target.x + D[o]! + Math.sin(ph) * 0.6, D[o + 1]!, this.target.z + D[o + 2]! + Math.cos(ph * 0.7) * 0.4);
      this._e.set(ph * D[o + 5]!, ph * 0.5, ph * 0.3);
      this._q.setFromEuler(this._e);
      this._m.compose(this._p, this._q, this._s);
      mesh.setMatrixAt(i, this._m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ sparkles

  private updateSparkle(sp: Sparkle): void {
    const t = sp.t;
    const life = clamp(t / 1.2, 0, 1);
    const scale = life < 0.15 ? life / 0.15 : 1 - ease((life - 0.15) / 0.85);
    for (let i = 0; i < sp.mesh.count; i++) {
      const vx = sp.vel[i * 3]!, vy = sp.vel[i * 3 + 1]!, vz = sp.vel[i * 3 + 2]!;
      this._p.set(sp.origin.x + vx * t * 0.8, sp.origin.y + vy * t - 2.6 * t * t, sp.origin.z + vz * t * 0.8);
      this._e.set(t * 6 + i, t * 4, 0);
      this._q.setFromEuler(this._e);
      const s = Math.max(0.001, scale * (0.7 + (i % 3) * 0.3));
      this._m.compose(this._p, this._q, new THREE.Vector3(s, s, s));
      sp.mesh.setMatrixAt(i, this._m);
    }
    sp.mesh.instanceMatrix.needsUpdate = true;
  }

  private removeSparkle(sp: Sparkle): void {
    const i = this.sparkles.indexOf(sp);
    if (i >= 0) this.sparkles.splice(i, 1);
    this.scene.remove(sp.mesh);
    sp.mesh.dispose();
  }

  // ------------------------------------------------------------------ sheep entities

  private createEnt(ws: WorldSheep, zone: Zone, pop: boolean): Ent {
    const geos = buildSheepGeos(ws);
    const rig = buildRig(geos, ws, this.sheepMats, this.shadows);
    const rng = mulberry32(hashString(ws.id) ^ this.seed);
    const e: Ent = {
      ws, key: geos.key, geos, rig, zone, personality: personalityOf(ws), x: 0, z: 0,
      heading: Math.PI / 4 + (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 1.1,
      tx: 0, tz: 0, mode: "idle", timer: rng() * 3, phase: rng() * 10,
      radius: geos.dims.L * geos.dims.rootScale * 0.95 + 0.12,
      spawn: pop ? 0 : -1, removing: -1, marker: null, markerKind: null, ring: null, selected: false,
      ...newAnimState(), faceColor: new THREE.Color(geos.parts.face),
    };
    e.slot = this.slotSeq++ % 4;
    const p = this.findSpot(zone, ws.id, e);
    e.x = e.tx = p[0];
    e.z = e.tz = p[1];
    this.scene.add(rig.root);
    return e;
  }

  private rebuildEnt(e: Ent, ws: WorldSheep): void {
    const old = e.rig;
    this.scene.remove(old.root);
    disposeGeos(e.geos);
    e.geos = buildSheepGeos(ws);
    e.key = e.geos.key;
    e.rig = buildRig(e.geos, ws, this.sheepMats, this.shadows);
    e.faceColor.set(e.geos.parts.face);
    e.radius = e.geos.dims.L * e.geos.dims.rootScale * 0.95 + 0.12;
    if (e.marker) { e.rig.markerAnchor.add(e.marker); }
    if (e.ring) { e.rig.root.add(e.ring); e.ring.scale.setScalar(e.geos.dims.L * 1.25 + 0.2); }
    this.scene.add(e.rig.root);
    if (!this.reduced) e.spawn = 0;
  }

  private destroyEnt(e: Ent): void {
    this.scene.remove(e.rig.root);
    disposeGeos(e.geos);
  }

  private applyMarker(e: Ent, s: WorldSnapshot): void {
    const m = e.ws.marker ?? null;
    const kind: MarkerKind | null = m === "planned" || m === "new" || m === "ill" || m === "rosette" ? m : null;
    if (kind !== e.markerKind) {
      if (e.marker) e.marker.removeFromParent();
      e.marker = kind ? this.markers.make(kind) : null;
      if (e.marker) e.rig.markerAnchor.add(e.marker);
      e.markerKind = kind;
    }
    const sel = s.selected === e.ws.id || m === "selected";
    if (sel && !e.ring) {
      e.ring = new THREE.Mesh(this.markers.ringGeo, this.markers.ringMat);
      e.ring.position.y = 0.05;
      e.ring.scale.setScalar(e.geos.dims.L * 1.25 + 0.2);
      e.ring.renderOrder = 1;
      e.rig.root.add(e.ring);
    } else if (!sel && e.ring) {
      e.ring.removeFromParent();
      e.ring = null;
    }
    e.selected = sel;
    this.applyOutline(e);
  }

  private applyOutline(e: Ent): void {
    const hovered = this.hover?.kind === "sheep" && this.hover.id === e.ws.id;
    // the sheep you're visiting keeps its ring but loses the outline, so its face reads up close
    e.rig.outline.visible = (e.selected && this.attended !== e.ws.id) || hovered;
    e.rig.outline.material = e.selected ? this.sheepMats.outlineSel : this.sheepMats.outlineHover;
  }

  private insetRect(zone: Zone, r: number): Rect {
    const z = ZONES[zone];
    const cx = (z.x0 + z.x1) / 2, cz = (z.z0 + z.z1) / 2;
    return {
      x0: Math.min(cx, z.x0 + r), x1: Math.max(cx, z.x1 - r),
      z0: Math.min(cz, z.z0 + r), z1: Math.max(cz, z.z1 - r),
    };
  }

  /** Best-candidate spot in a zone: far from the sheep already there. Deterministic per id. */
  private findSpot(zone: Zone, id: string, self: Ent): [number, number] {
    const r = this.insetRect(zone, self.radius);
    const rng = mulberry32(hashString(id) ^ (this.seed * 7919) ^ hashString(zone));
    const others: Ent[] = [];
    for (const e of this.ents.values()) if (e !== self && e.zone === zone && e.removing < 0) others.push(e);
    let best: [number, number] = [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
    let bestD = -Infinity;
    for (let i = 0; i < 24; i++) {
      const x = r.x0 + (r.x1 - r.x0) * rng();
      const z = r.z0 + (r.z1 - r.z0) * rng();
      let d = Infinity;
      for (const o of others) d = Math.min(d, Math.hypot(o.x - x, o.z - z) - o.radius - self.radius);
      if (d > bestD) { bestD = d; best = [x, z]; }
    }
    return best;
  }

  private separate(list: Ent[]): void {
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (a.zone !== b.zone) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = (a.radius + b.radius) * (a.nuzzle === b ? 0.8 : 1);
        if (d >= min) continue;
        const push = (min - d) * 0.5 * 0.5;
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
      }
    }
    const F = this.walkerOn() ? this.farmer : null;
    for (const e of list) {
      if (F) {
        const dx = e.x - F.x, dz = e.z - F.z, d = Math.hypot(dx, dz), min = e.radius + 0.55;
        if (d < min && d > 1e-4) { e.x = F.x + (dx / d) * min; e.z = F.z + (dz / d) * min; }
      }
      const r = this.insetRect(e.zone, e.radius);
      e.x = clamp(e.x, r.x0, r.x1);
      e.z = clamp(e.z, r.z0, r.z1);
    }
  }

  private syncTransforms(): void {
    const list: Ent[] = [];
    for (const e of this.ents.values()) { this.poseEnt(e); list.push(e); }
    for (const e of this.dying) { this.poseEnt(e); list.push(e); }
    this.parts.update(list);
  }

  private poseEnt(e: Ent): void {
    const { rig, geos } = e;
    const d = geos.dims;
    rig.root.position.set(e.x, 0, e.z);
    rig.root.rotation.y = e.heading;
    let s = d.rootScale;
    if (e.spawn >= 0) s *= backOut(clamp(e.spawn / 0.45, 0, 1));
    if (e.removing >= 0) s *= 1 - ease(clamp(e.removing / 0.35, 0, 1));
    rig.root.scale.setScalar(Math.max(0.001, s));
    if (this.reduced) {
      e.fold = this.night > 0.5 ? 1 : 0;
      if (this.attended === e.ws.id) { e.mode = "attend"; e.heading = FACE_CAMERA; rig.root.rotation.y = e.heading; }
      else if (e.mode === "attend") e.mode = "idle";
    }
    applyPose(rig, geos, computePose(e, this.time, this.reduced));
    if (e.marker) {
      const bobY = this.reduced ? 0 : Math.sin(this.time * 2.4 + e.phase) * 0.08;
      e.marker.position.y = bobY - d.legLen * 0.85 * e.fold;
      // counter the body heading so the marker faces the camera, with a slow sway
      e.marker.rotation.y = -e.heading + Math.PI / 4 + (this.reduced ? 0 : Math.sin(this.time * 1.2 + e.phase) * 0.5);
      e.marker.scale.setScalar(0.66 / (e.ws.adult ? 1 : 0.7));
    }
    if (e.ring && !this.reduced) {
      const p = 1 + Math.sin(this.time * 3) * 0.04;
      e.ring.scale.setScalar((d.L * 1.25 + 0.2) * p);
    }
  }


  // ------------------------------------------------------------------ input

  private ndc(ev: { clientX: number; clientY: number }): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  }

  private pick(ndc: THREE.Vector2): HoverTarget {
    this.raycaster.setFromCamera(ndc, this.camera);
    const list: THREE.Object3D[] = [];
    for (const e of this.ents.values()) list.push(e.rig.pick);
    for (const k of DOG_KINDS) if (this.dogs[k].visible) list.push(this.dogs[k].pick);
    if (this.cat.visible) list.push(this.cat.pick);
    // places have pick boxes fitted to the buildings; the nearest hit wins (a sheep in front of a building is nearer)
    for (const p of this.farm.hotspotPicks) list.push(p);
    const hits = this.raycaster.intersectObjects(list, false);
    for (const h of hits) {
      const sid = h.object.userData.sheepId as string | undefined;
      if (sid && this.ents.has(sid)) return { kind: "sheep", id: sid };
      const pet = h.object.userData.pet as PetKind | undefined;
      if (pet && (PET_KINDS as readonly string[]).includes(pet)) return { kind: "pet", id: pet };
      const hs = h.object.userData.hotspot as Hotspot | undefined;
      if (hs) return { kind: "hotspot", id: hs };
    }
    return null;
  }

  private setHover(t: HoverTarget): void {
    const same = (a: HoverTarget, b: HoverTarget) => (a === null && b === null) || (!!a && !!b && a.kind === b.kind && a.id === b.id);
    if (same(t, this.hover)) return;
    const prev = this.hover;
    this.hover = t;
    if (prev?.kind === "sheep") { const e = this.ents.get(prev.id); if (e) this.applyOutline(e); }
    if (prev?.kind === "hotspot") (this.farm.hotspotMeshes[prev.id].material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    if (t?.kind === "sheep") { const e = this.ents.get(t.id); if (e) this.applyOutline(e); }
    if (t?.kind === "hotspot") (this.farm.hotspotMeshes[t.id].material as THREE.MeshStandardMaterial).emissiveIntensity = 0.12;
    this.renderer.domElement.style.cursor = t ? "pointer" : this.mode === "pan" ? "grab" : "";
    if (t) {
      this.label.textContent = t.kind === "sheep" ? this.ents.get(t.id)?.ws.name ?? ""
        : t.kind === "pet" ? this.snap?.pets?.find((p) => p.id === t.id)?.name ?? PET_LABEL[t.id]
        : HOTSPOT_LABEL[t.id];
      this.label.style.display = "block";
    } else this.label.style.display = "none";
    this.handlers.onHover?.(t);
  }

  private updateLabel(): void {
    const t = this.hover;
    if (!t) return;
    const v = new THREE.Vector3();
    if (t.kind === "sheep") {
      const e = this.ents.get(t.id);
      if (!e) return;
      const d = e.geos.dims;
      v.set(e.x, (d.top + (e.marker ? 0.7 : 0.1)) * d.rootScale + 0.2, e.z);
    } else if (t.kind === "pet") {
      const p = this.petTop(t.id);
      if (!p) return;
      v.copy(p);
    } else {
      const a = HOTSPOT_DEF[t.id].anchor;
      v.set(a[0], a[1], a[2]);
    }
    v.project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.label.style.left = `${((v.x + 1) / 2) * w}px`;
    this.label.style.top = `${((1 - v.y) / 2) * h}px`;
  }

  private readonly onPointerMove = (ev: PointerEvent): void => {
    this.pointer = { x: ev.clientX, y: ev.clientY };
    this.hoverDirty = true;
    const d = this.drag;
    if (!d || d.id !== ev.pointerId) return;
    const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 6) d.moved = true;
    if (!d.moved || this.reveal) return;
    const per = (2 * this.halfW) / (this.container.clientWidth || 1);
    const perUp = per / Math.sin(ISO_PITCH);
    const t = new THREE.Vector3(d.tx, 0, d.tz).addScaledVector(SCREEN_RIGHT, -dx * per).addScaledVector(SCREEN_UP, dy * perUp);
    this.clampTarget(t);
    this.target.copy(t);
    this.focusAnim = null;
    if (this.mode === "walk") this.camHold = true;
    const now = performance.now(), dts = Math.max(1, now - d.lt) / 1000;
    const mx = ev.clientX - d.lx, my = ev.clientY - d.ly;
    const vel = new THREE.Vector3().addScaledVector(SCREEN_RIGHT, -mx * per).addScaledVector(SCREEN_UP, my * perUp).divideScalar(dts);
    this.panVel.set(vel.x, vel.z);
    d.lx = ev.clientX; d.ly = ev.clientY; d.lt = now;
    this.renderer.domElement.style.cursor = "grabbing";
    this.applyCamera();
  };

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    this.drag = { x: ev.clientX, y: ev.clientY, tx: this.target.x, tz: this.target.z, moved: false, id: ev.pointerId, lx: ev.clientX, ly: ev.clientY, lt: performance.now() };
    this.panVel.set(0, 0);
    try { this.renderer.domElement.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    const d = this.drag;
    this.drag = null;
    try { this.renderer.domElement.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    if (!d || ev.button !== 0) return;
    if (d.moved) {
      if (performance.now() - d.lt > 80 || this.mode === "walk" || this.reduced) this.panVel.set(0, 0);
      this.renderer.domElement.style.cursor = this.mode === "pan" ? "grab" : "";
      return;
    }
    if (this.reveal) return;
    const hit = this.pick(this.ndc(ev));
    if (this.mode === "walk" && !this.walker.root.visible) this.walker.root.visible = true;
    if (hit?.kind === "sheep") { if (this.mode === "walk") this.visitSheep(hit.id); else this.handlers.onSheep(hit.id); return; }
    if (hit?.kind === "pet") { this.handlers.onPet?.(hit.id); return; }
    if (hit?.kind === "hotspot") { if (this.mode === "walk") this.visitPlace(hit.id); else this.handlers.onHotspot(hit.id); return; }
    if (this.mode !== "walk") return;
    const g = this.groundAt(this.ndc(ev));
    if (!g) return;
    const [u, v] = uvOf(g.x, g.z);
    for (const id of AREA_IDS) {
      const l = this.land.get(id), r = AREAS[id].rect;
      if (l && l.state !== "open" && u > r[0] && u < r[1] && v > r[2] && v < r[3]) { const s = AREAS[id].stand; this.walkTo(s[0], -s[1]); return; }
    }
    this.walkTo(g.x, g.z);
  };

  private readonly onPointerLeave = (): void => {
    this.pointer = null;
    this.drag = null;
    this.setHover(null);
  };

  private readonly onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    const [lo, hi] = ZOOM_LIMITS[this.mode];
    const z = clamp(this.halfW * Math.exp(ev.deltaY * 0.0012), lo, hi);
    if (z === this.halfW) return;
    const before = this.groundAt(this.ndc(ev));
    this.focusAnim = null;
    this.halfW = z;
    this.applyCamera();
    if (this.mode === "pan") {
      const after = this.groundAt(this.ndc(ev));
      if (before && after) this.target.add(before.sub(after));
      this.clampTarget(this.target);
      this.applyCamera();
    }
  };

  private groundAt(ndc: THREE.Vector2): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out);
  }

  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    if (this.disposed || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const el = ev.target as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
    const k = ev.key.toLowerCase();
    if (!this.keysOn || this.reveal) return;
    if (k === "tab") {
      const a = document.activeElement;
      if (a && a !== document.body && a !== this.renderer.domElement) return;
      ev.preventDefault();
      const m: MoveMode = this.mode === "walk" ? "pan" : "walk";
      this.setMoveMode(m);
      this.handlers.onMoveMode?.(m);
      return;
    }
    const move = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k);
    if (move || k === "shift") {
      if (this.mode === "walk") { this.keys.add(k); if (move) ev.preventDefault(); }
      else if (move) {
        const up = k === "w" || k === "arrowup" ? 1 : k === "s" || k === "arrowdown" ? -1 : 0, rt = k === "d" || k === "arrowright" ? 1 : k === "a" || k === "arrowleft" ? -1 : 0;
        this.glide(this.target.clone().addScaledVector(SCREEN_UP, up * 6).addScaledVector(SCREEN_RIGHT, rt * 6), this.halfW, 0.35);
        ev.preventDefault();
      }
      return;
    }
    if (ev.repeat) return;
    if (k === "e" && this.promptTarget) {
      const t = this.promptTarget;
      if (t.kind === "sheep") this.sayHello(t.id); else this.handlers.onHotspot(t.id);
    }
    if (k === "f" && this.promptTarget?.kind === "sheep") this.startBrush(this.promptTarget.id);
  };

  private readonly onKeyUp = (ev: KeyboardEvent): void => {
    const k = ev.key.toLowerCase();
    this.keys.delete(k);
    if (k === "f") this.brushing = null;
  };

  private readonly onBlur = (): void => { this.keys.clear(); this.brushing = null; };

  // ------------------------------------------------------------------ loop

  private readonly frame = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = this.lastT < 0 ? 0 : Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;

    if (this.nightAnim) {
      const a = this.nightAnim;
      const p = clamp((now - a.t0) / TRANSITION_MS, 0, 1);
      this.night = a.from + (a.to - a.from) * ease(p);
      this.updateLighting();
      if (p >= 1) {
        this.nightAnim = null;
        a.resolve();
      }
    }
    this.flockCtx.night = this.night;
    this.flockCtx.farmer = this.walkerOn() ? { x: this.farmer.x, z: this.farmer.z, moving: Math.hypot(this.farmer.vx, this.farmer.vz) > 0.5 } : null;
    // the farmer, brushing and the reveal keep real time even when frames are slow (software GL): small substeps
    const raw = this.lastRaw < 0 ? 0 : Math.min(0.25, (now - this.lastRaw) / 1000);
    this.lastRaw = now;
    if (this.walkerOn() && !this.reveal) { for (let left = raw; left > 1e-6; left -= 0.05) this.stepFarmer(Math.min(0.05, left)); }
    else this.walker.pose(0, this.reduced ? 0 : dt, this.time);
    this.stepBrush(raw);
    this.stepReveal(raw);

    // camera: a glide, else follow the farmer (walk) or coast after a drag (pan)
    if (this.focusAnim) {
      const f = this.focusAnim;
      const p = clamp((now - f.t0) / f.dur, 0, 1);
      const e = ease(p);
      const to = !this.camHold && this.mode === "walk" && !this.reveal ? this.followPoint() : f.to;
      this.target.lerpVectors(f.from, to, e);
      this.halfW = f.h0 + (f.h1 - f.h0) * e + Math.sin(p * Math.PI) * f.lift;
      if (p >= 1) this.focusAnim = null;
    } else if (this.mode === "walk" && !this.camHold && !this.reveal) {
      const to = this.followPoint();
      const k = this.reduced ? 1 : 1 - Math.exp(-dt * 3.2);
      this.target.x += (to.x - this.target.x) * k;
      this.target.z += (to.z - this.target.z) * k;
    } else if (this.mode === "pan" && !this.drag && this.panVel.lengthSq() > 1e-4) {
      this.target.x += this.panVel.x * dt;
      this.target.z += this.panVel.y * dt;
      this.panVel.multiplyScalar(Math.exp(-dt * 5));
      this.clampTarget(this.target);
    }
    this.applyCamera();

    if (!this.reduced) {
      this.time += dt;
      const live = [...this.ents.values()];
      this.flockCtx.time = this.time;
      this.flockCtx.ents = live;
      for (const e of live) {
        if (e.spawn >= 0) { e.spawn += dt; if (e.spawn > 0.45) e.spawn = -1; }
        stepSheep(e, dt, this.flockCtx);
      }
      this.separate(live);
      this.puffs.step(dt);
      this.bubble.step(dt);
      for (let i = this.dying.length - 1; i >= 0; i--) {
        const e = this.dying[i]!;
        e.removing += dt;
        if (e.removing > 0.35) { this.destroyEnt(e); this.dying.splice(i, 1); }
      }
      this.stepParticles(dt);
      const S = this.farm.smoke, at = this.farm.smokeAt;
      for (let i = 0; i < S.length; i++) {
        const m = S[i]!;
        const p = (this.time * 0.25 + i / S.length) % 1;
        m.position.set(at.x + p * 1.4 + Math.sin(this.time + i) * 0.15, at.y + p * 4.5, at.z - p * 0.6);
        m.scale.setScalar(0.6 + p * 1.3 - (p > 0.75 ? (p - 0.75) * 5.6 : 0));
      }
      for (const sp of [...this.sparkles]) {
        sp.t += dt;
        if (sp.t >= 1.2) this.removeSparkle(sp);
        else this.updateSparkle(sp);
      }
    } else if (this.walkerOn()) this.separate([...this.ents.values()]);
    this.syncTransforms();
    this.stepDog(dt);
    this.hearts.step(dt);
    this.placeBubble();
    if (this.tapMarker.visible) {
      this.tapT += dt;
      const s = 1 + Math.sin(this.tapT * 6) * 0.08;
      this.tapMarker.scale.set(s, 1, s);
      (this.tapMarker.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - Math.max(0, this.tapT - 0.8) * 2);
      if (!this.farmer.path.length && this.tapT > 0.4) this.tapMarker.visible = this.tapT < 1.3;
    }

    if (this.hoverDirty && this.pointer && !this.drag?.moved) {
      this.hoverDirty = false;
      const r = this.renderer.domElement.getBoundingClientRect();
      this.setHover(this.pick(new THREE.Vector2(((this.pointer.x - r.left) / r.width) * 2 - 1, -((this.pointer.y - r.top) / r.height) * 2 + 1)));
    }
    this.updateLabel();
    this.updatePrompt();
    const F = this.farmer;
    const pAt = this.promptSpec ? this.project(F.x, 1.2 * FARMER_SCALE, F.z) : null;
    this.chrome.update({
      screen: (u, v, y) => this.project(u, y, -v),
      prompt: { at: pAt, spec: this.promptSpec, hold: this.brushing ? this.brushing.t / 1.2 : 0 },
      farmer: this.walkerOn() ? uvOf(F.x, F.z) : null,
      near: (u, v) => Math.hypot(u - F.x, -v - F.z),
    });
    if (this.mode === "pan" && now >= this.mmNext) {
      this.mmNext = now + 150;
      const view = ([[-1, 1], [1, 1], [1, -1], [-1, -1]] as const).map(([x, y]) => { const g = this.groundAt(new THREE.Vector2(x, y)); return g ? uvOf(g.x, g.z) : ([0, 0] as UV); });
      this.chrome.drawMinimapLive(view, [...this.ents.values()].map((e) => ({ u: e.x, v: -e.z, hex: WOOL_HEX[e.ws.colour] ?? "#ffffff" })), null);
    }
    this.render();
  };
  private stepDog(dt: number): void {
    this.cat.update(this.reduced ? 0 : dt, this.time, this.night, this.reduced);
    const live = DOG_KINDS.map((k) => this.dogs[k]).filter((d) => d.visible);
    if (!live.length) return;
    const pad: { x: number; z: number; radius: number }[] = [];
    let att: { x: number; z: number } | null = null;
    for (const e of this.ents.values()) {
      if (e.zone !== "paddock") continue;
      pad.push(e);
      if (e.ws.id === this.attended) att = e;
    }
    const dogs = live.map((d) => ({ x: d.x, z: d.z, radius: 0.35 * (d.kind === "maremma" ? 1.6 : d.kind === "terrier" ? 0.8 : 1.1), self: d }));
    for (const d of live) d.update(this.reduced ? 0 : dt, { time: this.time, night: this.night, zone: ZONES.paddock, sheep: pad, dogs, attended: att, still: this.reduced });
  }

  /** A pet's position (world, just above its head), if it's on the farm. */
  private petTop(id: string): THREE.Vector3 | null {
    if (id === "cat") return this.cat.visible ? this.cat.top() : null;
    const d = (this.dogs as Record<string, Dog>)[id];
    if (!d?.visible) return null;
    const s = d.kind === "maremma" ? 1.6 : d.kind === "terrier" ? 1.05 : 1.35;
    return new THREE.Vector3(d.x, 1.15 * s, d.z);
  }

  private placeBubble(): void {
    const id = this.bubble.id;
    if (!id) return;
    const e = this.ents.get(id);
    const pt = e ? null : this.petTop(id);
    if (!e && !pt) { this.bubble.hide(); return; }
    const v = e
      ? new THREE.Vector3(e.x, (e.geos.dims.top - 0.25) * e.geos.dims.rootScale + e.pose.bob * e.geos.dims.rootScale, e.z).project(this.camera)
      : pt!.project(this.camera);
    this.bubble.place(((v.x + 1) / 2) * this.container.clientWidth, ((1 - v.y) / 2) * this.container.clientHeight);
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

/** The personality a WorldSheep carries, defaulting to calm. */
function personalityOf(w: WorldSheep): Personality {
  return w.personality && PERSONALITIES.has(w.personality) ? w.personality : "calm";
}
