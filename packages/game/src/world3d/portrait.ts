// Live 3D portrait for the sheep card: one small dedicated renderer, one sheep,
// animated only while mounted. Breathes, blinks, looks around, flicks its ears,
// watches the cursor, and bleats with a hop when clicked.
import * as THREE from "three";
import { buildFullRig, buildSheepGeos, disposeGeos, EAR_REST, restPose, sheepKey, SheepMaterials, type FullRig, type SheepGeos, type SheepPose } from "./sheepMesh.js";
import { Bubble } from "./fx.js";
import type { Personality, WorldSheep } from "./types.js";

/** What each temperament says. The first line is the greeting; clicks cycle through the rest. */
export const BLEATS: Record<Personality, string[]> = {
  shy: ["…", "mm?", "…!"],
  calm: ["Mehh.", "Baa.", "Mm-hm."],
  curious: ["Baa!", "Baa?", "Ooh?"],
  bold: ["BAA!", "BAAA!", "MEH!"],
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rnd = (a: number, b: number) => a + (b - a) * Math.random();

interface Live {
  id: string;
  key: string;
  ws: WorldSheep;
  geos: SheepGeos;
  full: FullRig;
  faceMat: THREE.MeshLambertMaterial;
  el: HTMLElement;
  bubble: Bubble;
  token: number;
  // animation
  t: number;
  pose: SheepPose;
  yaw: number; pitch: number; roll: number;
  vyaw: number; vpitch: number;
  tYaw: number; tPitch: number; tRoll: number;
  nextLook: number;
  blinkIn: number; blinkT: number;
  earIn: number; earT: [number, number];
  hop: number; landed: number;
  pointer: THREE.Vector2 | null;
  bleats: number;
  lookX: number; lookY: number;
}

export interface PortraitStats { mounted: boolean; id: string | null; calls: number; frames: number }

export class LivePortrait {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  private readonly mats = new SheepMaterials();
  private readonly ground: THREE.Mesh;
  private readonly shadowTex: THREE.CanvasTexture;
  private readonly center = new THREE.Vector3();
  private live: Live | null = null;
  private raf = 0;
  private last = -1;
  private tokens = 0;
  private frames = 0;
  private readonly ray = new THREE.Raycaster();

  constructor(private readonly reduced: boolean) {
    this.scene.add(new THREE.HemisphereLight("#fffaf0", "#b8a890", 1.55));
    const key = new THREE.DirectionalLight("#fff1dc", 2.2);
    key.position.set(4, 6, 5);
    const rim = new THREE.DirectionalLight("#dfe9ff", 0.9);
    rim.position.set(-5, 3, -4);
    this.scene.add(key, rim);
    // soft round contact shadow
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, "rgba(40,30,20,0.34)");
    grad.addColorStop(0.55, "rgba(40,30,20,0.16)");
    grad.addColorStop(1, "rgba(40,30,20,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.shadowTex = new THREE.CanvasTexture(c);
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }),
    );
    this.ground.position.y = 0.005;
    this.scene.add(this.ground);
  }

  get canvas(): HTMLCanvasElement | null { return this.renderer?.domElement ?? null; }

  stats(): PortraitStats {
    return { mounted: !!this.live, id: this.live?.id ?? null, calls: this.renderer?.info.render.calls ?? 0, frames: this.frames };
  }

  mount(el: HTMLElement, ws: WorldSheep): () => void {
    const key = sheepKey(ws);
    const token = ++this.tokens;
    const r = this.ensureRenderer();
    if (this.live && this.live.id === ws.id && this.live.key === key) {
      // Same sheep, new panel HTML: move the canvas and keep the animation going.
      const L = this.live;
      L.token = token;
      L.ws = ws;
      if (L.el !== el) {
        L.el = el;
        el.appendChild(r.domElement);
        el.appendChild(L.bubble.el);
        el.classList.add("live");
        this.size();
        this.frame3d();
      }
      if (this.reduced) this.draw();
      return () => this.unmount(token);
    }
    this.teardown();
    const geos = buildSheepGeos(ws);
    const faceMat = new THREE.MeshLambertMaterial({ color: geos.parts.face, flatShading: true });
    const full = buildFullRig(geos, ws, this.mats, faceMat);
    full.rig.body.castShadow = false;
    this.scene.add(full.rig.root);
    const bubble = new Bubble(el, "portrait-bubble");
    this.live = {
      id: ws.id, key, ws, geos, full, faceMat, el, bubble, token,
      t: Math.random() * 10, pose: restPose(),
      yaw: 0, pitch: 0, roll: 0, vyaw: 0, vpitch: 0, tYaw: 0.25, tPitch: 0.05, tRoll: 0,
      nextLook: 1.2, blinkIn: rnd(0.8, 2.5), blinkT: -1, earIn: rnd(0.5, 2), earT: [-1, -1],
      hop: -1, landed: 99, pointer: null, bleats: 0, lookX: 0, lookY: 0,
    };
    el.appendChild(r.domElement);
    el.classList.add("live");
    this.size();
    this.frame3d();
    const cv = r.domElement;
    cv.onpointermove = (ev) => this.onPointer(ev);
    cv.onpointerleave = () => { if (this.live) { this.live.pointer = null; if (this.reduced) this.draw(); } };
    cv.onclick = () => this.bleat();
    if (this.reduced) {
      this.draw();
    } else {
      this.last = -1;
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.loop);
    }
    return () => this.unmount(token);
  }

  /** Make the mounted sheep bleat (click, or a greeting). */
  bleat(text?: string): void {
    const L = this.live;
    if (!L) return;
    const lines = BLEATS[L.ws.personality ?? "calm"];
    const say = text ?? lines[L.bleats % lines.length]!;
    L.bleats++;
    L.bubble.show(L.id, say, 1.8, !this.reduced);
    if (this.reduced) { this.draw(); return; }
    const P = L.ws.personality ?? "calm";
    if (L.hop < 0) L.hop = 0;
    L.earT = [0, 0];
    L.tRoll = P === "shy" ? -0.25 : P === "curious" ? 0.3 : 0.1;
    L.nextLook = 1.4;
  }

  private unmount(token: number): void {
    if (!this.live || this.live.token !== token) return;
    this.teardown();
  }

  private teardown(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    const L = this.live;
    if (!L) return;
    this.live = null;
    this.scene.remove(L.full.rig.root);
    disposeGeos(L.geos);
    L.faceMat.dispose();
    L.bubble.dispose();
    L.el.classList.remove("live");
    this.renderer?.domElement.remove();
  }

  private ensureRenderer(): THREE.WebGLRenderer {
    if (this.renderer) return this.renderer;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    const cv = r.domElement;
    cv.dataset.livePortrait = "1";
    cv.className = "live-portrait";
    cv.style.display = "block";
    cv.style.width = "100%";
    cv.style.height = "100%";
    cv.style.cursor = "pointer";
    cv.title = "Say hello";
    this.renderer = r;
    return r;
  }

  private size(): void {
    const L = this.live, r = this.renderer;
    if (!L || !r) return;
    const w = Math.max(40, L.el.clientWidth || 180), h = Math.max(40, L.el.clientHeight || 180);
    r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Frame the sheep: three-quarter view, face towards the viewer, filling the stage with room above for hops. */
  private frame3d(): void {
    const L = this.live!;
    const root = L.full.rig.root;
    root.rotation.y = -0.5;
    L.full.pose(restPose());
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    box.getCenter(this.center);
    this.center.y += size.y * 0.1; // headroom for hops and the bubble
    const tanH = Math.tan((this.camera.fov * Math.PI) / 360);
    const aspect = Math.max(0.6, this.camera.aspect || 1.6);
    const wide = Math.hypot(size.x, size.z) * 0.85;
    const dist = Math.max(size.y / (0.74 * 2 * tanH), wide / (0.72 * 2 * tanH * aspect));
    const dir = new THREE.Vector3(0.62, 0.3, 0.72).normalize();
    this.camera.position.copy(this.center).addScaledVector(dir, dist);
    this.camera.lookAt(this.center);
    this.ground.scale.set(size.x * 0.62, 1, size.z * 0.75);
    this.ground.position.set(this.center.x, 0.005, this.center.z);
  }

  private onPointer(ev: PointerEvent): void {
    const L = this.live;
    if (!L || !this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    L.pointer = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    if (this.reduced) { this.lookAtPointer(L); L.yaw = L.tYaw; L.pitch = L.tPitch; this.draw(); }
  }

  /** Head yaw/pitch that points the face at the cursor. */
  private lookAtPointer(L: Live): void {
    if (!L.pointer) return;
    const root = L.full.rig.root;
    const neck = L.full.rig.headPivot.getWorldPosition(new THREE.Vector3());
    this.ray.setFromCamera(L.pointer, this.camera);
    const n = this.camera.getWorldDirection(new THREE.Vector3()).negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, neck.clone().addScaledVector(n, 0.8));
    const p = this.ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!p) return;
    const lp = root.worldToLocal(p.clone());
    const ln = root.worldToLocal(neck.clone());
    const dx = lp.x - ln.x, dy = lp.y - ln.y, dz = lp.z - ln.z;
    const yaw = Math.atan2(-dz, dx);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    L.tYaw = clamp(yaw, -0.95, 0.95);
    L.tPitch = clamp(pitch, -0.45, 0.5);
    L.lookX = clamp((yaw - L.tYaw) * 2 + yaw * 0.4, -1, 1);
    L.lookY = clamp(pitch * 0.8, -1, 1);
  }

  /** ~30 fps is plenty for a portrait and halves its cost next to the world. */
  private readonly loop = (now: number): void => {
    this.raf = 0;
    const L = this.live;
    if (!L) return;
    if (this.last < 0) this.last = now - 33;
    const elapsed = now - this.last;
    if (elapsed >= 30 && !document.hidden && L.el.isConnected) {
      this.last = now;
      this.step(L, Math.min(0.066, elapsed / 1000));
      this.draw();
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private step(L: Live, dt: number): void {
    L.t += dt;
    const t = L.t;
    // where to look
    if (L.pointer) this.lookAtPointer(L);
    else if ((L.nextLook -= dt) <= 0) {
      L.nextLook = rnd(1.4, 3.6);
      const glance = Math.random();
      L.tYaw = glance < 0.45 ? rnd(0.15, 0.5) /* at you */ : rnd(-0.6, 0.8);
      L.tPitch = rnd(-0.15, 0.2);
      L.tRoll = Math.random() < 0.35 ? rnd(-0.22, 0.28) : 0;
      L.lookX = rnd(-0.5, 0.5); L.lookY = rnd(-0.3, 0.3);
    }
    // springy head (slightly underdamped → a little overshoot, feels alive)
    const k = 38, c = 9;
    L.vyaw += (k * (L.tYaw - L.yaw) - c * L.vyaw) * dt;
    L.vpitch += (k * (L.tPitch - L.pitch) - c * L.vpitch) * dt;
    L.yaw += L.vyaw * dt;
    L.pitch += L.vpitch * dt;
    L.roll += (L.tRoll - L.roll) * (1 - Math.exp(-dt * 4));
    // blink, ears
    if (L.blinkT >= 0) { L.blinkT += dt; if (L.blinkT > 0.15) L.blinkT = -1; }
    else if ((L.blinkIn -= dt) <= 0) { L.blinkT = 0; L.blinkIn = Math.random() < 0.25 ? 0.22 : rnd(1.8, 4.5); }
    for (let i = 0; i < 2; i++) if (L.earT[i]! >= 0) { L.earT[i]! += dt; if (L.earT[i]! > 0.32) L.earT[i] = -1; }
    if ((L.earIn -= dt) <= 0) { L.earT[Math.random() < 0.5 ? 0 : 1] = 0; if (Math.random() < 0.3) L.earT = [0, 0]; L.earIn = rnd(1.2, 4.5); }
    // hop
    let hopY = 0, squash = 1;
    if (L.hop >= 0) {
      L.hop += dt;
      const u = clamp(L.hop / 0.42, 0, 1);
      hopY = 4 * 0.22 * u * (1 - u);
      squash = 1 + 0.14 * Math.sin(u * Math.PI);
      if (u >= 1) { L.hop = -1; L.landed = 0; }
    } else L.landed += dt;
    if (L.landed < 0.22) squash = 1 - 0.16 * Math.sin((L.landed / 0.22) * Math.PI);
    L.bubble.step(dt);

    const p = L.pose;
    p.bob = hopY;
    p.squash = squash;
    p.breathe = Math.sin(t * 2.1) * 0.022;
    p.wobble = Math.sin(t * 12) * Math.exp(-L.landed * 3.5) * 1.6 + Math.sin(t * 1.3) * 0.25;
    p.bodyRoll = 0.02 * Math.sin(t * 0.9);
    p.bodyPitch = L.hop >= 0 ? 0.12 * Math.cos(clamp(L.hop / 0.42, 0, 1) * Math.PI) : 0;
    p.headYaw = L.yaw;
    p.headPitch = L.pitch + 0.03 * Math.sin(t * 1.7);
    p.headRoll = L.roll;
    const tuck = L.hop >= 0 ? Math.sin(clamp(L.hop / 0.42, 0, 1) * Math.PI) * 0.45 : 0;
    p.legs[0] = p.legs[1] = -tuck; p.legs[2] = p.legs[3] = tuck;
    for (let i = 0; i < 2; i++) {
      const et = L.earT[i]!;
      const f = et >= 0 ? Math.sin(clamp(et / 0.32, 0, 1) * Math.PI) : 0;
      p.earDroop[i] = EAR_REST - 0.8 * f + 0.06 * Math.sin(t * 1.9 + i * 2);
      p.earSweep[i] = 0.4 * f;
    }
    p.blink = L.blinkT >= 0 ? Math.sin(clamp(L.blinkT / 0.15, 0, 1) * Math.PI) : 0;
    p.lookX += (L.lookX - p.lookX) * (1 - Math.exp(-dt * 10));
    p.lookY += (L.lookY - p.lookY) * (1 - Math.exp(-dt * 10));
  }

  private draw(): void {
    const L = this.live, r = this.renderer;
    if (!L || !r) return;
    if (this.reduced) {
      const p = L.pose;
      p.headYaw = L.pointer ? L.yaw : 0.25;
      p.headPitch = L.pointer ? L.pitch : 0.05;
      p.headRoll = 0.12;
      p.lookX = L.pointer ? L.lookX : 0;
      p.lookY = L.pointer ? L.lookY : 0;
    }
    L.full.pose(L.pose);
    // keep the bubble over the head
    const head = L.full.rig.headPivot.getWorldPosition(new THREE.Vector3());
    head.y += 0.55 * L.geos.dims.rootScale;
    head.project(this.camera);
    const w = L.el.clientWidth, h = L.el.clientHeight;
    L.bubble.place(clamp(((head.x + 1) / 2) * w, 36, w - 36), clamp(((1 - head.y) / 2) * h, 34, h));
    r.render(this.scene, this.camera);
    this.frames++;
  }

  dispose(): void {
    this.teardown();
    this.mats.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.shadowTex.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }
}
