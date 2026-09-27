// Movement prototype: renderer, close-iso camera, the round-3 farm (early stage, creek flats revealable),
// sheep with swinging legs, the walking farmer, birds at the woolshed, a mailbox, dust puffs, a tap marker.
import * as THREE from "three";
import { GeoBatch } from "../../world3d/builder.js";
import { mulberry32 } from "../../world3d/rng.js";
import { mesh, type Mats } from "../render.js";
import { MISTY } from "../r2/stage.js";
import { buildSheep2, faceOf } from "../r2/sheep2.js";
import type { LabSheep } from "../sheep.js";
import { buildFarm, type Farm, type Reveal, type UV } from "../r3/farm.js";
import { buildWalker, type Walker } from "./farmer.js";

export const ISO_YAW = 0.42, ISO_PITCH = (37 * Math.PI) / 180;
export const ISO_DIR = new THREE.Vector3(Math.sin(ISO_YAW) * Math.cos(ISO_PITCH), Math.sin(ISO_PITCH), Math.cos(ISO_YAW) * Math.cos(ISO_PITCH));
/** Screen directions on the ground, in farm (u, v): up the screen and to the right. */
export const SCREEN_UP: UV = [-Math.sin(ISO_YAW), Math.cos(ISO_YAW)];
export const SCREEN_RIGHT: UV = [Math.cos(ISO_YAW), Math.sin(ISO_YAW)];

export interface Opts { lite: boolean }

export interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  cam: THREE.OrthographicCamera;
  farm: Farm;
  mats: Mats;
  reveal: Reveal;
  walker: Walker;
  mailbox: THREE.Object3D;
  marker: THREE.Mesh;
  /** Point the camera at (u, v) with a half-width of `halfW` world units. */
  frame(u: number, v: number, halfW: number): void;
  resize(): void;
  render(): void;
  dust(u: number, v: number, size?: number): void;
  tick(dt: number, t: number): void;
  /** Every bird at the woolshed does a little hop, one after another. */
  hopBirds(): void;
}

function makeRenderer(canvas: HTMLCanvasElement, lite: boolean) {
  const d = MISTY;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = d.exposure;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(d.hemi.sky, d.hemi.ground, d.hemi.intensity * (lite ? 1.15 : 1)));
  const sun = new THREE.DirectionalLight(d.sun.color, d.sun.intensity);
  sun.castShadow = !lite;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 5;
  const sc = sun.shadow.camera;
  sc.near = 1; sc.far = 300;
  scene.add(sun, sun.target);
  return { renderer, scene, sun };
}

function softDot(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function markerTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d")!;
  g.lineCap = "round";
  g.strokeStyle = "rgba(251,246,236,.95)"; g.lineWidth = 12;
  g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "rgba(200,110,95,1)"; g.lineWidth = 4; g.setLineDash([9, 7]);
  g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A sheep whose four legs are separate pivots (the round-2 sheep merges them), for a trot. */
export interface SheepRig { root: THREE.Group; head: THREE.Group; legs: THREE.Group[]; body: THREE.Object3D }
export function buildSheepRig(mats: Mats, s: LabSheep): SheepRig {
  const root = buildSheep2(mats, s, 1.25, { friendly: true });
  const [body, legMesh, head] = root.children as [THREE.Object3D, THREE.Mesh, THREE.Group];
  root.remove(legMesh);
  legMesh.geometry.dispose();
  const face = faceOf(s), hoof = face.clone().multiplyScalar(0.55);
  const L = 0.56, legLen = s.lamb ? 0.46 : 0.42, top = legLen + 0.13;
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[0.36, 0.15], [-0.36, -0.15], [0.36, -0.15], [-0.36, 0.15]] as const) {
    const g = new THREE.Group();
    g.position.set(x * L * 1.25, top, z);
    const b = new GeoBatch(0);
    b.cyl(face, 0.048, 0.04, legLen + 0.08, 8, [0, (legLen + 0.08) / 2 + 0.05 - top, 0]);
    b.cyl(hoof, 0.045, 0.05, 0.07, 8, [0.008, 0.035 - top, 0]);
    g.add(mesh(mats, b.build()!, "skin", { outline: 0 }));
    root.add(g);
    legs.push(g);
  }
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return { root, head, legs, body };
}

export function buildWorld(canvas: HTMLCanvasElement, opts: Opts): World {
  const { renderer, scene, sun } = makeRenderer(canvas, opts.lite);
  const built = buildFarm("early", {
    noSheep: true, backdrop: false, reveal: true, gateOpen: 1.45, mist: false,
    grass: opts.lite ? 2500 : 7000, flowers: opts.lite ? 350 : 900,
  });
  const farm = built.farm, mats = built.mats, reveal = built.reveal!;
  scene.add(farm.root);
  if (opts.lite) farm.root.traverse((o) => { o.castShadow = false; });

  const walker = buildWalker(mats);
  walker.root.scale.setScalar(0.92);
  farm.root.add(walker.root);

  // mailbox by the road, at the end of the track to the home paddock gate
  const mb = new GeoBatch(0);
  mb.box(MISTY.palette.trunk, [0.16, 1.3, 0.16], [0, 0.65, 0]);
  mb.box("#c2574a", [0.75, 0.55, 0.5], [0, 1.45, 0]);
  mb.cyl("#c2574a", 0.25, 0.25, 0.75, 12, [0, 1.72, 0], [0, 0, Math.PI / 2]);
  mb.box("#f1d36e", [0.05, 0.4, 0.12], [0.1, 1.95, 0.3]);
  const mailbox = mesh(mats, mb.build()!, "world", { outline: 0 });
  mailbox.position.copy(farm.at(-8.5, -12.3));
  mailbox.rotation.y = 0.3;
  mailbox.castShadow = !opts.lite;
  farm.root.add(mailbox);

  const marker = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: markerTexture(), transparent: true, depthWrite: false }));
  marker.visible = false;
  marker.renderOrder = 3;
  farm.root.add(marker);

  // dust puffs: a small pool of soft sprites
  const dotTex = softDot();
  const puffs: { s: THREE.Sprite; age: number; life: number; size: number; vy: number }[] = [];
  for (let i = 0; i < 48; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: "#d8c49c", transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    s.renderOrder = 4;
    farm.root.add(s);
    puffs.push({ s, age: 1, life: 1, size: 0.5, vy: 0 });
  }
  let nextPuff = 0;
  const rnd = mulberry32(42);

  // birds bob and hop at their stations
  const birds = [...farm.birds.values()].map((g, i) => ({ g, y0: g.position.y, r0: g.rotation.y, seed: i * 1.7, hop: 0 }));

  const cam = new THREE.OrthographicCamera(-10, 10, 6, -6, 1, 600);
  let halfW = 14;
  const focus = new THREE.Vector3();
  const lightDir = new THREE.Vector3(...MISTY.sun.dir).normalize();
  const lightBasis = new THREE.Matrix4();
  const lightInv = new THREE.Matrix4();
  lightBasis.lookAt(new THREE.Vector3(), lightDir.clone().negate(), new THREE.Vector3(0, 1, 0));
  lightInv.copy(lightBasis).invert();

  const world: World = {
    renderer, scene, sun, cam, farm, mats, reveal, walker, mailbox, marker,
    frame(u, v, hw) {
      halfW = hw;
      focus.copy(farm.at(u, v, 0.4));
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      cam.left = -hw; cam.right = hw; cam.top = hw / aspect; cam.bottom = -hw / aspect;
      cam.position.copy(focus).addScaledVector(ISO_DIR, 200);
      cam.lookAt(focus);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      // keep the sun's shadow box on the view, snapped to shadow texels so edges don't crawl while moving
      const half = Math.min(62, hw * 1.9 + 4);
      const sc = sun.shadow.camera;
      if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
      const texel = (2 * half) / 2048;
      const ls = focus.clone().applyMatrix4(lightInv);
      ls.x = Math.round(ls.x / texel) * texel; ls.y = Math.round(ls.y / texel) * texel;
      const snapped = ls.applyMatrix4(lightBasis);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(lightDir, 120);
      sun.target.updateMatrixWorld();
    },
    resize() {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      world.frame(focus.x, -focus.z, halfW);
    },
    render() { renderer.render(scene, cam); },
    dust(u, v, size = 0.5) {
      const p = puffs[nextPuff]!;
      nextPuff = (nextPuff + 1) % puffs.length;
      p.s.position.copy(farm.at(u + (rnd() - 0.5) * 0.3, v + (rnd() - 0.5) * 0.3, 0.15));
      p.age = 0; p.life = 0.55 + rnd() * 0.3; p.size = size * (0.8 + rnd() * 0.4); p.vy = 0.5 + rnd() * 0.4;
      p.s.visible = true;
    },
    hopBirds() { birds.forEach((b, i) => { b.hop = 0.35 + i * 0.12; }); },
    tick(dt, t) {
      for (const p of puffs) {
        if (!p.s.visible) continue;
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) { p.s.visible = false; continue; }
        p.s.position.y += p.vy * dt;
        const sz = p.size * (0.6 + k * 1.3);
        p.s.scale.set(sz, sz * 0.75, 1);
        (p.s.material as THREE.SpriteMaterial).opacity = 0.9 * (1 - k) * Math.min(1, k * 6);
      }
      for (const b of birds) {
        const ph = t * 1.3 + b.seed;
        if (b.hop <= 0 && Math.sin(ph * 0.7) > 0.995) b.hop = 0.35;
        let y = Math.sin(ph * 2.2) * 0.02;
        if (b.hop > 0) { b.hop -= dt; if (b.hop < 0.35) y += Math.sin((1 - b.hop / 0.35) * Math.PI) * 0.22; }
        b.g.position.y = b.y0 + y;
        b.g.rotation.y = b.r0 + Math.sin(ph * 0.45) * 0.35;
      }
    },
  };
  return world;
}
