// WorldView — Three.js isometric farm diorama (CONTRACTS.md §4).
// Pure presentation: driven entirely by WorldSnapshot, no game logic imports.
import * as THREE from "three";
import { buildFarm, HOTSPOT_DEF, HOTSPOT_LABEL, ZONES, GROUND, type FarmBuild, type Rect } from "./farm.js";
import { applyPose, buildFullRig, buildRig, buildSheepGeos, disposeGeos, restPose, sheepKey, SheepMaterials } from "./sheepMesh.js";
import { Markers, type MarkerKind } from "./markers.js";
import { computePose, FACE_CAMERA, FOND_SKITTISH, FOND_TRUSTING, flickEars, fondOf, newAnimState, startHop, stepSheep, type Ent, type FlockCtx } from "./behave.js";
import { FlockParts } from "./parts.js";
import { Bubble, Hearts, Puffs } from "./fx.js";
import { Dog, type DogKind } from "./dog.js";
import { Cat } from "./cat.js";
import { BLEATS, LivePortrait, type PortraitStats } from "./portrait.js";
import { NIGHT, PORTRAIT_BG, SEASONS } from "./palette.js";
import { hashString, mulberry32 } from "./rng.js";
import type { Hotspot, HoverTarget, Personality, PetKind, WorldHandlers, WorldOptions, WorldSheep, WorldSnapshot, Zone } from "./types.js";

export type { Hotspot, HoverTarget, Personality, PetKind, WorldHandlers, WorldOptions, WorldSheep, WorldSnapshot, WorldUpgrade, Zone } from "./types.js";

const DOG_KINDS: readonly DogKind[] = ["terrier", "collie", "maremma"];
const PET_KINDS: readonly PetKind[] = ["terrier", "collie", "maremma", "cat"];
const PET_LABEL: Record<PetKind, string> = { terrier: "the terrier", collie: "the collie", maremma: "the Maremma", cat: "the cat" };

export { BLEATS } from "./portrait.js";
export { Hold, HOLD_MS, HOLD_CLICK_MS, type HoldHandlers } from "./hold.js";

const HOTSPOTS: readonly Hotspot[] = ["house", "shed", "market", "vet", "fairground", "mailbox"];
const CAM_DIR = new THREE.Vector3(1, 0.98, 1).normalize();
const CAM_DIST = 90;
const TRANSITION_MS = 1200;
const FOCUS_MS = 600;

const ATTEND_ZOOM = 2.7;
const PERSONALITIES = new Set<Personality>(["shy", "calm", "curious", "bold"]);

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

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function backOut(t: number): number {
  const c1 = 2.2, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class WorldView {
  private readonly container: HTMLElement;
  private readonly handlers: WorldHandlers;
  private readonly reduced: boolean;
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
  private target = new THREE.Vector3(0, 0, 0);
  private focusAnim: { from: THREE.Vector3; to: THREE.Vector3; t0: number } | null = null;
  private zoom = 1;
  private hover: HoverTarget = null;
  private pointer: { x: number; y: number } | null = null;
  private hoverDirty = false;
  private drag: { x: number; y: number; tx: number; tz: number; moved: boolean; id: number } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private lastT = -1;
  private time = 0;
  private disposed = false;
  private readonly resizeObs: ResizeObserver | null;
  private readonly frustum = { cx: 0, cy: 0, half: 20 };
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
  private attendSaved: { target: THREE.Vector3; zoom: number } | null = null;
  private zoomAnim: { from: number; to: number; t0: number } | null = null;
  private readonly flockCtx: FlockCtx;

  constructor(container: HTMLElement, handlers: WorldHandlers, opts: WorldOptions = {}) {
    this.container = container;
    this.handlers = handlers;
    this.reduced = !!opts.reducedMotion;
    this.seed = opts.seed ?? 7;

    if (getComputedStyle(container).position === "static") container.style.position = "relative";

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
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
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 260);
    this.placeCamera();

    // lights
    this.hemi = new THREE.HemisphereLight("#ffffff", "#88aa77", 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#ffffff", 2.4);
    this.sun.position.set(-16, 34, 16);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -32; sc.right = 32; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 110;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
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

    // farm
    this.farm = buildFarm(mulberry32(this.seed), true);
    this.scene.add(this.farm.group);

    // portrait scene
    this.pScene.add(new THREE.HemisphereLight("#fffaf0", "#b8a890", 1.5));
    const pl = new THREE.DirectionalLight("#fff4e4", 2.2);
    pl.position.set(3, 6, 5);
    this.pScene.add(pl);
    this.pGround = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.08, depthWrite: false }));
    this.pGround.position.y = 0.01;
    this.pScene.add(this.pGround);

    this.parts = new FlockParts(this.scene, this.sheepMats, true);
    this.puffs = new Puffs(this.scene);
    this.bubble = new Bubble(container);
    this.dogs = { terrier: new Dog(this.scene, true, "terrier"), collie: new Dog(this.scene, true, "collie"), maremma: new Dog(this.scene, true, "maremma") };
    this.cat = new Cat(this.scene, true);
    this.hearts = new Hearts(this.scene, this.markers.geos.planned, this.markers.mat, this.reduced);
    this.flockCtx = {
      time: 0, night: 0, attended: null, ents: this.ents.values(),
      insetRect: (zone, r) => this.insetRect(zone, r),
      puff: (x, z, n, size) => { if (!this.reduced) this.puffs.spawn(x, z, n, size); },
    };

    this.applySeason(0);

    // events
    cv.addEventListener("pointermove", this.onPointerMove);
    cv.addEventListener("pointerdown", this.onPointerDown);
    cv.addEventListener("pointerup", this.onPointerUp);
    cv.addEventListener("pointerleave", this.onPointerLeave);
    cv.addEventListener("pointercancel", this.onPointerLeave);
    cv.addEventListener("wheel", this.onWheel, { passive: false });
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
    L.paddock2.visible = !!s.paddock2;
    L.meadow.visible = !s.paddock2;
    L.mainGate.visible = !s.paddock2;
    L.bunting.visible = !!s.fairToday;
    L.visitor.visible = !!s.visitorPresent;
    const up = new Set(s.upgrades ?? []);
    L.snugBarn.visible = up.has("barn");
    L.shearing.visible = up.has("shearing");
    L.longMeadow.visible = up.has("meadow");
    for (const k of DOG_KINDS) this.dogs[k].show(up.has(k) || (k === "collie" && up.has("dog")), ZONES.paddock);
    this.cat.show(up.has("cat"));

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
      if (this.reduced) this.destroyEnt(e);
      else {
        e.removing = 0;
        this.dying.push(e);
      }
    }
    this.syncTransforms();
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
    const faceMat = new THREE.MeshLambertMaterial({ color: geos.parts.face, flatShading: true, vertexColors: true });
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
    const half = Math.max(size.x, size.y * 1.1, size.z) * 0.53;
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
    this.glide(to, this.zoom);
  }

  /**
   * Where a sheep (just above its head) or a hotspot is on screen, in client pixels, or null if there is no
   * such thing. `inView` is false when it is outside the world's canvas. Used to point at things (tutorial).
   */
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
        this.glide(s.target, s.zoom);
      }
      return;
    }
    const e = this.ents.get(id);
    if (!e) return;
    this.attended = id;
    this.flockCtx.attended = e;
    this.applyOutline(e);
    if (!this.attendSaved) this.attendSaved = { target: this.target.clone(), zoom: this.zoom };
    // camera: zoom in and put the sheep left of the card
    const zoom = Math.max(this.zoom, ATTEND_ZOOM);
    const h = this.container.clientHeight || 1;
    const upp = (this.frustum.half * 2) / zoom / h;
    const right = new THREE.Vector3(1, 0, -1).normalize();
    const to = new THREE.Vector3(e.x, 0, e.z).addScaledVector(right, (opts.offsetPx ?? 0) * upp);
    this.glide(to, zoom, true);
    // the sheep reacts
    e.attendT = 0;
    e.mode = "attend";
    e.nuzzle = null;
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
        o.heading = Math.atan2(-(o.z - e.z), o.x - e.x) + Math.PI; // face the fuss…
        startHop(o, 0.12, 0.28, 1.4); // …and hop back
        flickEars(o);
        o.timer = 0.4;
      }
    }
  }

  /**
   * A live, animated portrait of `sheep` inside `el` (the sheep card). Only one exists at a time; mounting
   * the same sheep again (the panel re-rendered) just moves the canvas. Returns a disposer that stops it.
   */
  mountPortrait(el: HTMLElement, sheep: WorldSheep): () => void {
    if (this.disposed) return () => {};
    if (!this.live) this.live = new LivePortrait(this.reduced, (id) => this.handlers.onPortraitClick?.(id), (id, phase) => this.handlers.onBrush?.(id, phase));
    return this.live.mount(el, { ...sheep, personality: personalityOf(sheep) });
  }

  /** The live portrait's sheep has just had a full brushing: hearts and a contented bubble in the card. */
  portraitCheer(): void {
    if (!this.disposed) this.live?.cheer();
  }

  private glide(to: THREE.Vector3, zoom: number, loose = false): void {
    this.clampTarget(to, loose ? zoom : undefined);
    if (this.reduced) {
      this.target.copy(to);
      this.focusAnim = null;
      this.zoomAnim = null;
      this.setZoom(zoom);
      this.placeCamera();
    } else {
      this.focusAnim = { from: this.target.clone(), to, t0: performance.now() };
      this.zoomAnim = zoom !== this.zoom ? { from: this.zoom, to: zoom, t0: performance.now() } : null;
    }
  }

  private setZoom(z: number): void {
    this.zoom = z;
    this.camera.zoom = z;
    this.camera.updateProjectionMatrix();
  }

  sleepTransition(): Promise<void> {
    return this.animateNight(1);
  }

  dawn(): Promise<void> {
    return this.animateNight(0);
  }

  resize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.fitFrustum(w / h);
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
    this.live?.dispose();
    this.live = null;
    if (this.particles) { this.particles.geometry.dispose(); (this.particles.material as THREE.Material).dispose(); }
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
  }

  /** Not part of the contract: render stats for the dev harness. */
  debugStats(): { calls: number; triangles: number; sheep: number; geometries: number; dog: boolean; dogs: DogKind[]; cat: boolean; hearts: number; attended: string | null; bubble: string | null; portrait: PortraitStats } {
    const i = this.renderer.info;
    return {
      calls: i.render.calls, triangles: i.render.triangles, sheep: this.ents.size, geometries: i.memory.geometries,
      dog: DOG_KINDS.some((k) => this.dogs[k].visible), dogs: DOG_KINDS.filter((k) => this.dogs[k].visible), cat: this.cat.visible,
      hearts: this.hearts.active, attended: this.attended, bubble: this.bubble.id ? this.bubble.el.textContent : null,
      portrait: this.live?.stats() ?? { mounted: false, id: null, calls: 0, frames: 0, brush: 0, hold: 0, ring: false, holding: false, fluff: 0, hearts: 0, brushDone: false },
    };
  }

  // ------------------------------------------------------------------ sheep entities

  private createEnt(ws: WorldSheep, zone: Zone, pop: boolean): Ent {
    const geos = buildSheepGeos(ws);
    const rig = buildRig(geos, ws, this.sheepMats, true);
    const rng = mulberry32(hashString(ws.id) ^ this.seed);
    const e: Ent = {
      ws, key: geos.key, geos, rig, zone, personality: personalityOf(ws), x: 0, z: 0,
      heading: Math.PI / 4 + (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 1.1,
      tx: 0, tz: 0, mode: "idle", timer: rng() * 3, phase: rng() * 10,
      radius: geos.dims.L * geos.dims.rootScale * 0.95 + 0.12,
      spawn: pop ? 0 : -1, removing: -1, marker: null, markerKind: null, ring: null, selected: false,
      ...newAnimState(), faceColor: new THREE.Color(geos.parts.face),
    };
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
    e.rig = buildRig(e.geos, ws, this.sheepMats, true);
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
    for (const e of list) {
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

  // ------------------------------------------------------------------ season / night

  private applySeason(season: number): void {
    const s = clamp(Math.round(season), 0, 3);
    this.season = s;
    const L = SEASONS[s]!;
    this.farm.groundMat.color.set(L.grass);
    this.farm.foliageMat.color.set(L.foliage);
    this.farm.meadowMat.color.set(L.meadow);
    this.farm.pondMat.color.set(L.pond);
    this.farm.layers.snow.visible = s === 3;
    this.farm.layers.shearingSnow.visible = s === 3;
    this.farm.layers.spring.visible = s === 0;
    this.farm.layers.flowers.visible = s <= 1;
    this.farm.layers.autumn.visible = s === 2;
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
    this.farm.windowMat.emissiveIntensity = n * 1.4;
    this.drawSky(lerpC(L.skyTop, NIGHT.skyTop), lerpC(L.skyBottom, NIGHT.skyBottom), n);
  }

  private drawSky(top: THREE.Color, bottom: THREE.Color, n: number): void {
    const ctx = this.skyCanvas.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, `#${top.getHexString(THREE.SRGBColorSpace)}`);
    g.addColorStop(1, `#${bottom.getHexString(THREE.SRGBColorSpace)}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 512);
    if (n > 0.02) {
      ctx.fillStyle = `rgba(255, 250, 225, ${(n * 0.9).toFixed(3)})`;
      for (const [x, y, r] of this.stars) {
        ctx.fillRect(x, y, r, r * 1.6);
      }
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
    const n = snow ? 70 : season === 2 ? 34 : 22;
    const geo = snow ? new THREE.OctahedronGeometry(0.07, 0) : new THREE.PlaneGeometry(0.24, 0.16);
    const mat = snow
      ? new THREE.MeshBasicMaterial({ color: "#ffffff" })
      : new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
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
      this.particleData[o] = GROUND.x0 + rng() * (GROUND.x1 - GROUND.x0);
      this.particleData[o + 1] = rng() * 9;
      this.particleData[o + 2] = GROUND.z0 + rng() * (GROUND.z1 - GROUND.z0);
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
      this._p.set(D[o]! + Math.sin(ph) * 0.6, D[o + 1]!, D[o + 2]! + Math.cos(ph * 0.7) * 0.4);
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

  // ------------------------------------------------------------------ camera

  private placeCamera(): void {
    this.camera.position.copy(this.target).addScaledVector(CAM_DIR, CAM_DIST);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  private fitFrustum(aspect: number): void {
    const saved = this.target.clone();
    this.target.set(0, 0, 0);
    this.placeCamera();
    const inv = this.camera.matrixWorldInverse;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const v = new THREE.Vector3();
    for (const x of [GROUND.x0, GROUND.x1]) for (const z of [GROUND.z0, GROUND.z1]) for (const y of [-1.8, 4.6]) {
      v.set(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const half = Math.max((maxY - minY) / 2, (maxX - minX) / 2 / aspect) * 1.04;
    this.frustum.cx = (minX + maxX) / 2;
    this.frustum.cy = (minY + maxY) / 2;
    this.frustum.half = half;
    const c = this.camera;
    c.left = this.frustum.cx - half * aspect;
    c.right = this.frustum.cx + half * aspect;
    c.top = this.frustum.cy + half;
    c.bottom = this.frustum.cy - half;
    c.zoom = this.zoom;
    c.updateProjectionMatrix();
    this.target.copy(saved);
    this.placeCamera();
  }

  private clampTarget(t: THREE.Vector3, looseZoom?: number): void {
    const k = 1 - 1 / (looseZoom ?? this.zoom);
    const lx = looseZoom ? 22 : 5 + 18 * k, lz = looseZoom ? 16 : 4 + 14 * k;
    t.x = clamp(t.x, -lx, lx);
    t.z = clamp(t.z, -lz, lz);
    t.y = 0;
  }

  // ------------------------------------------------------------------ input

  private ndc(ev: PointerEvent | WheelEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  }

  private pick(ndc: THREE.Vector2): HoverTarget {
    this.raycaster.setFromCamera(ndc, this.camera);
    const list: THREE.Object3D[] = [];
    for (const e of this.ents.values()) list.push(e.rig.pick);
    for (const k of DOG_KINDS) if (this.dogs[k].visible) list.push(this.dogs[k].pick);
    if (this.cat.visible) list.push(this.cat.pick);
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
    if (prev?.kind === "hotspot") (this.farm.hotspotMeshes[prev.id].material as THREE.MeshLambertMaterial).emissiveIntensity = 0;
    if (t?.kind === "sheep") { const e = this.ents.get(t.id); if (e) this.applyOutline(e); }
    if (t?.kind === "hotspot") (this.farm.hotspotMeshes[t.id].material as THREE.MeshLambertMaterial).emissiveIntensity = 0.28;
    this.renderer.domElement.style.cursor = t ? "pointer" : "";
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
    if (d && d.id === ev.pointerId) {
      const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 5) d.moved = true;
      if (d.moved) {
        const h = this.container.clientHeight || 1;
        const upp = (this.frustum.half * 2) / this.camera.zoom / h; // world units per px
        const right = new THREE.Vector3(1, 0, -1).normalize();
        const fwd = new THREE.Vector3(-1, 0, -1).normalize();
        const sinE = CAM_DIR.y;
        const t = new THREE.Vector3(d.tx, 0, d.tz)
          .addScaledVector(right, -dx * upp)
          .addScaledVector(fwd, (dy * upp) / sinE);
        this.clampTarget(t);
        this.target.copy(t);
        this.focusAnim = null;
        this.placeCamera();
      }
    }
  };

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    this.drag = { x: ev.clientX, y: ev.clientY, tx: this.target.x, tz: this.target.z, moved: false, id: ev.pointerId };
    try { this.renderer.domElement.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    const d = this.drag;
    this.drag = null;
    try { this.renderer.domElement.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    if (!d || d.moved || ev.button !== 0) return;
    const hit = this.pick(this.ndc(ev));
    if (!hit) return;
    if (hit.kind === "sheep") this.handlers.onSheep(hit.id);
    else if (hit.kind === "pet") this.handlers.onPet?.(hit.id);
    else this.handlers.onHotspot(hit.id);
  };

  private readonly onPointerLeave = (): void => {
    this.pointer = null;
    this.drag = null;
    this.setHover(null);
  };

  private readonly onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    const z = clamp(this.zoom * Math.exp(-ev.deltaY * 0.0015), 1, 3.2);
    if (z === this.zoom) return;
    // zoom towards the cursor
    const before = this.groundAt(this.ndc(ev));
    this.zoomAnim = null;
    this.setZoom(z);
    const after = this.groundAt(this.ndc(ev));
    if (before && after) this.target.add(before.sub(after));
    this.clampTarget(this.target);
    this.focusAnim = null;
    this.placeCamera();
  };

  private groundAt(ndc: THREE.Vector2): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out);
  }

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
    if (this.focusAnim) {
      const f = this.focusAnim;
      const p = clamp((now - f.t0) / FOCUS_MS, 0, 1);
      this.target.lerpVectors(f.from, f.to, ease(p));
      this.placeCamera();
      if (p >= 1) this.focusAnim = null;
    }
    if (this.zoomAnim) {
      const z = this.zoomAnim;
      const p = clamp((now - z.t0) / (FOCUS_MS * 1.3), 0, 1);
      this.setZoom(z.from + (z.to - z.from) * ease(p));
      if (p >= 1) this.zoomAnim = null;
    }
    this.flockCtx.night = this.night;

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
      for (let i = 0; i < this.farm.smoke.length; i++) {
        const m = this.farm.smoke[i]!;
        const p = (this.time * 0.25 + i / this.farm.smoke.length) % 1;
        m.position.set(-14.8 + p * 0.9 + Math.sin(this.time + i) * 0.1, 6.0 + p * 3.2, -12.9 - p * 0.4);
        m.scale.setScalar(0.6 + p * 1.2 - (p > 0.75 ? (p - 0.75) * 5.2 : 0));
      }
      for (const sp of [...this.sparkles]) {
        sp.t += dt;
        if (sp.t >= 1.2) this.removeSparkle(sp);
        else this.updateSparkle(sp);
      }
    }
    this.syncTransforms();
    this.stepDog(dt);
    this.hearts.step(dt);
    this.placeBubble();

    if (this.hoverDirty && this.pointer && !this.drag?.moved) {
      this.hoverDirty = false;
      const r = this.renderer.domElement.getBoundingClientRect();
      this.setHover(this.pick(new THREE.Vector2(((this.pointer.x - r.left) / r.width) * 2 - 1, -((this.pointer.y - r.top) / r.height) * 2 + 1)));
    }
    this.updateLabel();
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
