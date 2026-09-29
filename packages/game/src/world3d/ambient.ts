// Cheap ambient life for the valley (DESIGN-v3 §15 item 27), purely cosmetic (Math.random is fine here, but a
// seeded rng keeps probe frames steady): small birds flitting between bush and garden trees, butterflies over the
// paddocks in summer, sparkle on the creek, and a few chickens pecking by the homestead. Each kind is one
// instanced mesh (one draw call), nothing casts shadows, and lite mode switches the lot off.
import * as THREE from "three";
import { GeoBatch } from "./builder.js";
import { mulberry32 } from "./rng.js";
import { creekV, groundY, PROPS } from "./valley.js";

interface Bird { at: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; wait: number; hop: number; heading: number; kind: number }
interface Fly { x: number; y: number; z: number; vx: number; vz: number; phase: number; turn: number }
interface Hen { x: number; z: number; heading: number; peck: number; walk: number; tx: number; tz: number }

const BIRD_COLS = ["#2f3b3c", "#7a5a44", "#8fae6a", "#3f4f5c"]; // tūī, pīwakawaka, tauhou (silvereye), kererū-ish grey
const FLY_COLS = ["#fbf7ea", "#f5d35a", "#ef9a45", "#fbf7ea", "#e9c8f0"];

export interface AmbientStats { on: boolean; birds: number; butterflies: number; sparkles: number; chickens: number }

export class Ambient {
  readonly group = new THREE.Group();
  private readonly rng: () => number;
  private readonly perches: THREE.Vector3[];
  private readonly birds: Bird[] = [];
  private readonly flies: Fly[] = [];
  private readonly hens: Hen[] = [];
  private readonly birdBody: THREE.InstancedMesh;
  /** Bird wings and butterfly wings share one instanced mesh (birds first, two wings each). */
  private readonly wings: THREE.InstancedMesh;
  private readonly nb: number;
  private readonly sparkle: THREE.InstancedMesh;
  private readonly henMesh: THREE.InstancedMesh;
  private readonly spark: Float32Array;
  private readonly sparkCycle: Int32Array;
  private readonly disposables: { dispose(): void }[] = [];
  private on = true;
  private fliesOn = false;
  private season = 0;
  private night = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  /** `perches`: tree crowns and fence posts the birds hop between (world points). */
  constructor(seed: number, perches: THREE.Vector3[]) {
    this.rng = mulberry32(seed ^ 0xb1d5);
    this.perches = perches;
    this.group.name = "ambient";

    // birds: a round body with a tail, and a pair of wings as a second instanced mesh
    const bb = new GeoBatch();
    bb.ico("#ffffff", 0.11, 0, [0, 0, 0], [1.35, 0.9, 0.9]);
    bb.ico("#ffffff", 0.075, 0, [0.12, 0.07, 0]);
    bb.cone("#ffffff", 0.05, 0.16, 3, [-0.18, 0.02, 0], [0, 0, Math.PI / 2 + 0.3]);
    const bodyGeo = bb.build()!;
    const birdMat = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: false });
    const NB = 7, NF = 12;
    this.nb = NB;
    this.birdBody = new THREE.InstancedMesh(bodyGeo, birdMat, NB);
    // one wing shape (a rounded triangle pair along +z) for birds and butterflies, mirrored for the other side
    const fw = new THREE.BufferGeometry();
    fw.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.16, 0, 0.1, 0.13, 0, -0.08, 0, 0, 0, 0.13, 0, -0.08, 0.05, 0, -0.14].map((x, i) => (i % 3 === 2 ? -x : x)), 3));
    fw.computeVertexNormals();
    const flyMat = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide, emissive: "#ffffff", emissiveIntensity: 0.12 });
    this.wings = new THREE.InstancedMesh(fw, flyMat, NB * 2 + NF * 2);
    const c = new THREE.Color();
    for (let i = 0; i < NB; i++) {
      const kind = i % BIRD_COLS.length;
      c.set(BIRD_COLS[kind]!);
      this.birdBody.setColorAt(i, c);
      this.wings.setColorAt(i * 2, c.clone().multiplyScalar(0.8));
      this.wings.setColorAt(i * 2 + 1, c.clone().multiplyScalar(0.8));
      const at = perches.length ? perches[Math.floor(this.rng() * perches.length)]!.clone() : new THREE.Vector3();
      this.birds.push({ at, from: at.clone(), to: at.clone(), t: 1, dur: 1, wait: this.rng() * 3, hop: 0, heading: this.rng() * 6, kind });
    }

    // butterflies: two wing instances each, after the birds'
    for (let i = 0; i < NF; i++) {
      c.set(FLY_COLS[i % FLY_COLS.length]!);
      this.wings.setColorAt(NB * 2 + i * 2, c);
      this.wings.setColorAt(NB * 2 + i * 2 + 1, c);
      this.flies.push({ x: 0, y: 0.8, z: 0, vx: 0, vz: 0, phase: this.rng() * 10, turn: this.rng() * 6 });
    }

    // creek sparkle: little four-point glints lying on the water, additive
    const sg = new THREE.BufferGeometry();
    const r = 0.22, w = 0.045;
    sg.setAttribute("position", new THREE.Float32BufferAttribute([-r, 0, 0, 0, 0, w, r, 0, 0, -r, 0, 0, r, 0, 0, 0, 0, -w, 0, 0, -r, w, 0, 0, 0, 0, r, 0, 0, -r, 0, 0, r, -w, 0, 0], 3));
    const sparkMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const NS = 46;
    this.sparkle = new THREE.InstancedMesh(sg, sparkMat, NS);
    this.sparkle.renderOrder = 2;
    this.spark = new Float32Array(NS * 4); // u, v, phase, speed
    this.sparkCycle = new Int32Array(NS).fill(-99);
    for (let i = 0; i < NS; i++) { this.spark[i * 4 + 2] = this.rng() * 6; this.spark[i * 4 + 3] = 1.2 + this.rng() * 1.6; this.spark[i * 4] = NaN; }

    // chickens by the homestead: one merged hen, instanced
    const hb = new GeoBatch();
    hb.ico("#ffffff", 0.2, 0, [0, 0.28, 0], [1.25, 0.95, 0.9]);
    hb.ico("#ffffff", 0.11, 0, [0.2, 0.46, 0]);
    hb.box("#d9463b", [0.1, 0.08, 0.03], [0.22, 0.56, 0]);
    hb.cone("#f0b43c", 0.03, 0.08, 4, [0.33, 0.45, 0], [0, 0, -Math.PI / 2]);
    hb.cone("#ffffff", 0.1, 0.2, 4, [-0.22, 0.38, 0], [0, 0, 0.9]);
    hb.box("#e0a13a", [0.03, 0.14, 0.03], [0.02, 0.07, 0.07]);
    hb.box("#e0a13a", [0.03, 0.14, 0.03], [0.02, 0.07, -0.07]);
    const henGeo = hb.build()!;
    const henMat = new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true });
    const NH = 5;
    this.henMesh = new THREE.InstancedMesh(henGeo, henMat, NH);
    const henCols = ["#c07a3e", "#f3ede0", "#8a4f2e", "#c07a3e", "#3b3434"];
    const [hu, hv] = PROPS.chickens;
    for (let i = 0; i < NH; i++) {
      this.henMesh.setColorAt(i, c.set(henCols[i]!));
      const x = hu + (this.rng() - 0.5) * 3, z = -(hv + (this.rng() - 0.5) * 2);
      this.hens.push({ x, z, heading: this.rng() * 6, peck: this.rng() * 3, walk: 0, tx: x, tz: z });
    }

    for (const im of [this.birdBody, this.wings, this.sparkle, this.henMesh]) {
      im.frustumCulled = false;
      im.castShadow = false;
      im.receiveShadow = false;
      this.group.add(im);
    }
    // the hens stay by the homestead: cull them with a fixed sphere round their run
    this.henMesh.frustumCulled = true;
    this.henMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(hu, 0.5, -hv), 5);
    this.disposables.push(bodyGeo, birdMat, fw, flyMat, sg, sparkMat, henGeo, henMat);
    this.hideFlies();
  }

  setOn(on: boolean): void { this.on = on; this.group.visible = on; }
  setSeason(s: number): void { this.season = s; }
  setNight(n: number): void { this.night = n; }

  stats(): AmbientStats {
    return {
      on: this.on && this.group.visible,
      birds: this.on ? this.birdBody.count : 0,
      butterflies: this.on && this.fliesOn ? this.flies.length : 0,
      sparkles: this.on && this.sparkle.visible ? this.sparkle.count : 0,
      chickens: this.on ? this.henMesh.count : 0,
    };
  }

  /** Step everything around the camera's ground target (world x, z) with the view half-width. */
  step(dt: number, time: number, cx: number, cz: number, half: number): void {
    if (!this.on) return;
    const night = this.night > 0.5;
    this.birdBody.visible = this.wings.visible = !night;
    const flies = !night && (this.season === 1 || this.season === 0);
    if (this.fliesOn && !flies) this.hideFlies();
    this.fliesOn = flies;
    this.sparkle.visible = !night && this.season !== 3;
    this.henMesh.visible = !night;
    if (!night) this.stepBirds(dt, time, cx, cz, half);
    if (this.fliesOn) this.stepFlies(dt, time, cx, cz, half);
    if (!night) this.wings.instanceMatrix.needsUpdate = true;
    if (this.sparkle.visible) this.stepSparkle(time, cx, half);
    if (this.henMesh.visible) this.stepHens(dt, time);
  }

  private nearPerch(cx: number, cz: number, half: number, not?: THREE.Vector3): THREE.Vector3 | null {
    const near = this.perches.filter((p) => Math.abs(p.x - cx) < half * 1.1 && Math.abs(p.z - cz) < half * 1.0 && p !== not);
    if (!near.length) return null;
    return near[Math.floor(this.rng() * near.length)]!;
  }

  private stepBirds(dt: number, time: number, cx: number, cz: number, half: number): void {
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i]!;
      let flap = 0;
      if (b.t < 1) {
        b.t = Math.min(1, b.t + dt / b.dur);
        const t = b.t, e = t * t * (3 - 2 * t);
        b.at.lerpVectors(b.from, b.to, e);
        b.at.y += Math.sin(t * Math.PI) * (1.2 + b.from.distanceTo(b.to) * 0.12);
        flap = 1;
        b.heading = Math.atan2(-(b.to.z - b.from.z), b.to.x - b.from.x);
      } else {
        b.wait -= dt;
        // perched: a hop and a look about now and then
        if (b.hop > 0) { b.hop = Math.max(0, b.hop - dt * 4); }
        else if (this.rng() < dt * 0.6) { b.hop = 1; b.heading += (this.rng() - 0.5) * 2.4; }
        const off = Math.abs(b.at.x - cx) > half * 1.4 || Math.abs(b.at.z - cz) > half * 1.3;
        if (b.wait <= 0 || off) {
          const next = this.nearPerch(cx, cz, half, b.to);
          if (next) {
            b.from.copy(off ? new THREE.Vector3(cx + (this.rng() < 0.5 ? -1 : 1) * half * 1.3, 6, cz - half * 0.6) : b.at);
            b.to.copy(next).add(new THREE.Vector3((this.rng() - 0.5) * 0.6, 0, (this.rng() - 0.5) * 0.6));
            b.t = 0;
            b.dur = Math.max(0.7, b.from.distanceTo(b.to) / 7);
          }
          b.wait = 2 + this.rng() * 6;
        }
      }
      const hopY = Math.sin(b.hop * Math.PI) * 0.12;
      this.p.set(b.at.x, b.at.y + hopY, b.at.z);
      this.e.set(0, b.heading, flap ? 0 : Math.sin(time * 3 + i) * 0.15);
      this.q.setFromEuler(this.e);
      this.s.set(1, 1, 1);
      this.m.compose(this.p, this.q, this.s);
      this.birdBody.setMatrixAt(i, this.m);
      const wing = flap ? Math.sin(time * 38 + i) * 1.0 + 0.2 : -0.1;
      this.p.y += 0.05;
      for (const side of [0, 1]) {
        this.e.set(side ? -wing : wing, b.heading, 0, "YXZ");
        this.q.setFromEuler(this.e);
        this.s.set(0.9, 1, (side ? -1 : 1) * (flap ? 1.35 : 0.7));
        this.m.compose(this.p, this.q, this.s);
        this.wings.setMatrixAt(i * 2 + side, this.m);
      }
    }
    this.birdBody.instanceMatrix.needsUpdate = true;
  }

  private stepFlies(dt: number, time: number, cx: number, cz: number, half: number): void {
    for (let i = 0; i < this.flies.length; i++) {
      const f = this.flies[i]!;
      if (!Number.isFinite(f.x) || f.x === 0 || Math.abs(f.x - cx) > half * 1.25 || Math.abs(f.z - cz) > half * 1.1) {
        f.x = cx + (this.rng() - 0.5) * half * 2;
        f.z = cz + (this.rng() - 0.5) * half * 1.6;
      }
      f.turn += (this.rng() - 0.5) * dt * 5;
      f.vx += Math.cos(f.turn) * dt * 2.2 - f.vx * dt * 0.8;
      f.vz += Math.sin(f.turn) * dt * 2.2 - f.vz * dt * 0.8;
      f.x += f.vx * dt; f.z += f.vz * dt;
      const g = groundY(f.x, -f.z);
      f.y = g + 0.55 + Math.sin(time * 1.7 + f.phase) * 0.3 + Math.abs(Math.sin(time * 5 + f.phase)) * 0.12;
      const heading = Math.atan2(-f.vz, f.vx);
      const flap = Math.sin(time * 22 + f.phase) * 0.9 + 0.2;
      for (const side of [0, 1]) {
        this.p.set(f.x, f.y, f.z);
        this.e.set(side ? -flap : flap, heading, 0, "YXZ");
        this.q.setFromEuler(this.e);
        this.s.set(1, 1, side ? -1 : 1);
        this.m.compose(this.p, this.q, this.s);
        this.wings.setMatrixAt(this.nb * 2 + i * 2 + side, this.m);
      }
    }
  }

  private hideFlies(): void {
    this.m.makeScale(0, 0, 0);
    for (let i = this.nb * 2; i < this.wings.count; i++) this.wings.setMatrixAt(i, this.m);
    this.wings.instanceMatrix.needsUpdate = true;
  }

  private stepSparkle(time: number, cx: number, half: number): void {
    const D = this.spark;
    const n = this.sparkle.count;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const ph = D[o + 2]! + time * D[o + 3]!;
      const cyc = Math.floor(ph / Math.PI);
      const k = Math.max(0, Math.sin(ph)) ** 3;
      // each twinkle lands on a new spot of water near the view
      if (this.sparkCycle[i] !== cyc || !Number.isFinite(D[o]!)) {
        this.sparkCycle[i] = cyc;
        const u = cx + (this.rng() - 0.5) * half * 2.4;
        D[o] = u;
        D[o + 1] = creekV(u) + (this.rng() - 0.5) * 3.2;
      }
      this.p.set(D[o]!, -0.27, -D[o + 1]!);
      this.e.set(0, (i * 0.7) % 3, 0);
      this.q.setFromEuler(this.e);
      const s = k < 0.01 ? 0.001 : 0.2 + k * 1.1;
      this.s.set(s, 1, s);
      this.m.compose(this.p, this.q, this.s);
      this.sparkle.setMatrixAt(i, this.m);
    }
    this.sparkle.instanceMatrix.needsUpdate = true;
  }

  private stepHens(dt: number, time: number): void {
    const [hu, hv] = PROPS.chickens;
    for (let i = 0; i < this.hens.length; i++) {
      const h = this.hens[i]!;
      const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const sp = Math.min(d, dt * 0.9);
        h.x += (dx / d) * sp; h.z += (dz / d) * sp;
        h.heading = Math.atan2(-dz, dx);
        h.walk += dt * 10;
      } else if (this.rng() < dt * 0.35) {
        h.tx = hu + (this.rng() - 0.5) * 5; h.tz = -(hv + (this.rng() - 0.5) * 2.4);
      }
      const pecking = d <= 0.05 ? Math.max(0, Math.sin(time * 4 + h.peck * 3)) ** 4 : 0;
      this.p.set(h.x, groundY(h.x, -h.z) + (d > 0.05 ? Math.abs(Math.sin(h.walk)) * 0.03 : 0), h.z);
      this.e.set(0, h.heading, -pecking * 0.7);
      this.q.setFromEuler(this.e);
      this.s.set(1, 1, 1);
      this.m.compose(this.p, this.q, this.s);
      this.henMesh.setMatrixAt(i, this.m);
    }
    this.henMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    for (const im of [this.birdBody, this.wings, this.sparkle, this.henMesh]) im.dispose();
  }
}
