// The farm dogs (upgrades "terrier", "collie", "maremma"): low-poly dogs that
// keep watch over the flock, each in its own way. Pip the terrier is small,
// scruffy and busy, darting about; Bess the border collie trots round the flock
// and sits to watch; Samson the Maremma is big and white and mostly lies among
// the sheep, getting up now and then for a slow patrol. All keep an eye on the
// sheep you are visiting and curl up at night.
import * as THREE from "three";
import { groundY } from "./valley.js";
import { GeoBatch } from "./builder.js";
import type { Rect } from "./farm.js";

export type DogKind = "terrier" | "collie" | "maremma";

const BLACK = "#2b2627", WHITE = "#f6f1e8", PINK = "#e88f9a", NOSE = "#161212";
const TAN = "#c9955c", TAN_DARK = "#9c6c3f", SCRUFF = "#efe6d4";
const CREAM = "#f1e2c4", CREAM_SH = "#dcc8a2", CREAM_EAR = "#d9bf95";

interface Breed {
  scale: number;
  /** trot speed, dash speed (to a target) */
  trot: number; dash: number;
  /** seconds of trotting / sitting before switching (base, random extra) */
  trotFor: [number, number]; sitFor: [number, number];
  /** chance to lie down instead of sitting during the day */
  lieInDay: number;
  /** orbit radius factor */
  orbit: number;
  /** where it waits at the gate / sleeps (x offset from the gate) */
  gateX: number;
  wag: number;
}
const BREEDS: Record<DogKind, Breed> = {
  terrier: { scale: 1.05, trot: 2.5, dash: 3.2, trotFor: [3, 4], sitFor: [1.2, 2], lieInDay: 0, orbit: 0.7, gateX: -0.4, wag: 1.3 },
  collie: { scale: 1.35, trot: 1.7, dash: 2.2, trotFor: [7, 7], sitFor: [3, 3], lieInDay: 0, orbit: 1, gateX: 1.5, wag: 1 },
  maremma: { scale: 1.6, trot: 1.0, dash: 1.4, trotFor: [5, 4], sitFor: [8, 8], lieInDay: 0.6, orbit: 0.55, gateX: 3.6, wag: 0.5 },
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface DogCtx {
  time: number;
  night: number;
  zone: Rect;
  sheep: { x: number; z: number; radius: number; self?: unknown }[];
  /** The other dogs, so they don't walk through each other. */
  dogs?: { x: number; z: number; radius: number; self?: unknown }[];
  attended: { x: number; z: number } | null;
  still: boolean;
}

export class Dog {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  x = 1; z = 0; heading = Math.PI / 2;
  private tx = 1; private tz = 0;
  private mode: "trot" | "sit" | "watch" | "lie" = "sit";
  private timer = 2;
  private speed = 0;
  private stride = 0;
  private theta = 0;
  private sit = 1;
  private lie = 0;
  private yaw = 0;
  private lying = false;

  readonly kind: DogKind;
  private readonly breed: Breed;
  /** Invisible box for clicking the dog (userData.pet = kind). */
  readonly pick: THREE.Mesh;

  constructor(parent: THREE.Object3D, shadows: boolean, kind: DogKind = "collie") {
    this.kind = kind;
    this.breed = BREEDS[kind];
    const mk = (b: GeoBatch, par: THREE.Object3D, cast = true) => {
      const g = b.build()!;
      this.geos.push(g);
      const m = new THREE.Mesh(g, this.mat);
      m.castShadow = shadows && cast;
      par.add(m);
      return m;
    };
    const parts = buildBreed(kind);
    mk(parts.body, this.body);
    this.body.position.set(0, 0.56, 0);
    mk(parts.head, this.head, false);
    this.head.position.set(0.5, 0.2, 0);
    this.body.add(this.head);
    mk(parts.tail, this.tail, false);
    this.tail.position.set(-0.46, 0.08, 0);
    this.body.add(this.tail);
    const legGeo = parts.leg.build()!;
    this.geos.push(legGeo);
    for (const [x, z] of [[0.32, 0.13], [0.32, -0.13], [-0.32, 0.13], [-0.32, -0.13]] as const) {
      const p = new THREE.Group();
      p.position.set(x, 0.49, z);
      const m = new THREE.Mesh(legGeo, this.mat);
      m.castShadow = shadows;
      p.add(m);
      this.group.add(p);
      this.legs.push(p);
    }
    this.group.add(this.body);
    const pickGeo = new THREE.BoxGeometry(1.4, 1.3, 0.9);
    this.geos.push(pickGeo);
    this.pick = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.pick.position.set(0.1, 0.6, 0);
    this.pick.userData.pet = kind;
    this.group.add(this.pick);
    this.group.scale.setScalar(this.breed.scale);
    this.group.visible = false;
    parent.add(this.group);
  }

  /** Sit still facing the camera (for portraits). */
  posePortrait(): void {
    this.group.visible = true;
    this.x = 0; this.z = 0; this.heading = -0.5; this.sit = 1; this.lie = 0; this.speed = 0; this.yaw = 0.35;
    this.pose(0.4, [2, 3]);
    this.group.position.set(0, 0, 0);
  }

  get visible(): boolean { return this.group.visible; }

  show(on: boolean, zone: Rect): void {
    if (on && !this.group.visible) {
      this.x = (zone.x0 + zone.x1) / 2 + 3 + this.breed.gateX;
      this.z = zone.z1 - 0.8;
      this.heading = Math.PI / 2;
      this.theta = this.breed.gateX;
    }
    this.group.visible = on;
  }

  update(dt: number, c: DogCtx): void {
    if (!this.group.visible) return;
    const r = { x0: c.zone.x0 + 0.5, x1: c.zone.x1 - 0.5, z0: c.zone.z0 + 0.5, z1: c.zone.z1 - 0.5 };
    let cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (c.sheep.length) {
      cx = c.sheep.reduce((a, s) => a + s.x, 0) / c.sheep.length;
      cz = c.sheep.reduce((a, s) => a + s.z, 0) / c.sheep.length;
    }
    let look: [number, number] = [cx, cz];
    const B = this.breed;
    if (c.still) {
      // a good dog, sitting by the gate and facing you
      this.x = clamp(B.gateX, r.x0, r.x1); this.z = r.z1 - 0.3;
      this.heading = -1.15; this.sit = c.night > 0.5 ? 0 : 1; this.lie = c.night > 0.5 ? 1 : 0; this.speed = 0;
      this.pose(c.time, [this.x + 1, this.z + 1]);
      return;
    }
    this.timer -= dt;
    if (c.night > 0.4) this.mode = "lie";
    else if (c.attended) this.mode = "watch";
    else if (this.mode === "lie" || this.mode === "watch") { this.mode = "trot"; this.timer = 6; }
    if (this.mode === "trot") {
      if (this.timer <= 0) { this.mode = "sit"; this.timer = B.sitFor[0] + Math.random() * B.sitFor[1]; this.lying = Math.random() < B.lieInDay; }
      const R = (2.6 + Math.sqrt(c.sheep.length) * 1.1) * B.orbit + (this.kind === "terrier" ? Math.sin(c.time * 0.7) * 1.2 : 0);
      this.theta += dt * B.trot * (this.kind === "terrier" && Math.sin(c.time * 0.31) < 0 ? -1 : 1) / R;
      this.tx = clamp(cx + Math.cos(this.theta) * R, r.x0, r.x1);
      this.tz = clamp(cz + Math.sin(this.theta) * R * 0.8, r.z0, r.z1);
    } else if (this.mode === "sit") {
      this.tx = this.x; this.tz = this.z;
      if (this.timer <= 0) { this.mode = "trot"; this.lying = false; this.timer = B.trotFor[0] + Math.random() * B.trotFor[1]; this.theta = Math.atan2(this.z - cz, this.x - cx); }
    } else if (this.mode === "watch" && c.attended) {
      const a = c.attended;
      look = [a.x, a.z];
      // sit a couple of steps from the sheep, on the camera side (each dog on its own side)
      const side = this.kind === "terrier" ? -1.4 : this.kind === "maremma" ? 1.1 : 0;
      this.tx = clamp(a.x + 2.2 + side, r.x0, r.x1);
      this.tz = clamp(a.z + 1.2 - side * 1.3, r.z0, r.z1);
    } else if (this.mode === "lie") {
      this.tx = clamp(B.gateX, r.x0, r.x1); this.tz = r.z1 - 0.3;
    }
    const dx = this.tx - this.x, dz = this.tz - this.z;
    const d = Math.hypot(dx, dz);
    let want = 0;
    if (d > 0.3) {
      const turn = wrap(Math.atan2(-dz, dx) - this.heading);
      this.heading += clamp(turn * 5, -5, 5) * dt;
      want = (this.mode === "trot" ? B.trot : B.dash) * Math.max(0, Math.cos(turn)) * clamp(d / 1.2, 0.3, 1);
    } else if (this.mode !== "trot") {
      const turn = wrap(Math.atan2(-(look[1] - this.z), look[0] - this.x) - this.heading);
      this.heading += clamp(turn * 3, -3, 3) * dt;
    }
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * 5));
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.z -= Math.sin(this.heading) * this.speed * dt;
    // don't trot through sheep (or the other dogs)
    for (const s of [...c.sheep, ...(c.dogs ?? [])]) {
      if (s.self === this) continue;
      const ox = this.x - s.x, oz = this.z - s.z;
      const od = Math.hypot(ox, oz), min = s.radius + 0.45;
      if (od < min && od > 1e-4) { this.x = s.x + (ox / od) * min; this.z = s.z + (oz / od) * min; }
    }
    this.x = clamp(this.x, r.x0, r.x1); this.z = clamp(this.z, r.z0, r.z1);
    this.stride += this.speed * dt * 7;
    const sitting = (this.mode === "sit" || this.mode === "watch") && this.speed < 0.3;
    this.sit += ((sitting ? 1 : 0) - this.sit) * (1 - Math.exp(-dt * 6));
    const lying = (this.mode === "lie" || (this.mode === "sit" && this.lying)) && this.speed < 0.3;
    this.lie += ((lying ? 1 : 0) - this.lie) * (1 - Math.exp(-dt * 3));
    this.pose(c.time, look);
  }

  private pose(time: number, look: [number, number]): void {
    this.group.position.set(this.x, groundY(this.x, -this.z), this.z);
    this.group.rotation.y = this.heading;
    const walk = clamp(this.speed / 1.5, 0, 1);
    const s = Math.sin(this.stride);
    const sit = this.sit * (1 - this.lie), lie = this.lie;
    // legs: gallop-ish trot, fold when sitting/lying
    const swing = [s, -s, -s, s];
    this.legs.forEach((p, i) => {
      const back = i >= 2;
      p.rotation.z = swing[i]! * 0.6 * walk + (back ? -1.2 * sit : 0.15 * sit) + (back ? -1.3 : 1.3) * lie;
      p.position.y = 0.49 - (back ? 0.16 * sit : 0) - 0.3 * lie;
    });
    this.body.position.y = 0.56 + Math.abs(s) * 0.05 * walk - 0.1 * sit - 0.32 * lie;
    this.body.position.x = -0.1 * sit;
    this.body.rotation.z = 0.5 * sit + 0.04 * s * walk;
    // head looks at the target, pants a little
    const turn = wrap(Math.atan2(-(look[1] - this.z), look[0] - this.x) - this.heading);
    this.yaw += (clamp(turn, -1, 1) * (1 - walk * 0.7) - this.yaw) * 0.1;
    this.head.rotation.set(0.15 * Math.sin(time * 0.9) * (sit + lie * 0.5), this.yaw, -0.5 * sit + 0.1 * Math.sin(time * 7) * sit - 0.1 * lie, "YXZ");
    // wag!
    const wag = (lie ? 0.15 : 0.7 + walk * 0.2) * this.breed.wag;
    const up = this.kind === "maremma" ? 0.9 : this.kind === "terrier" ? 1.1 : 0; // plumed / perky tails curl up
    this.tail.rotation.set(0, Math.sin(time * (lie ? 3 : this.kind === "terrier" ? 18 : 14)) * wag, -0.5 * sit - 0.2 * walk + 0.3 * lie + up * (1 - lie * 0.7));
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    (this.pick.material as THREE.Material).dispose();
  }
}

/** Geometry for each breed: body, head (pivot at the neck), tail (pivot at the rump), one leg. */
function buildBreed(kind: DogKind): { body: GeoBatch; head: GeoBatch; tail: GeoBatch; leg: GeoBatch } {
  const b = new GeoBatch(0.05), h = new GeoBatch(0.04), t = new GeoBatch(0.04), l = new GeoBatch(0);
  if (kind === "collie") {
    // black saddle over a white chest and belly
    b.ico(BLACK, 0.34, 1, [0, 0, 0], [1.45, 0.76, 0.85]);
    b.ico(WHITE, 0.25, 1, [0.3, -0.06, 0], [0.9, 0.9, 0.95]);
    b.ico(WHITE, 0.2, 1, [0.46, 0.1, 0], [0.8, 1.2, 1.05]); // ruff
    b.ico(WHITE, 0.22, 0, [-0.05, -0.14, 0], [1.3, 0.45, 0.8]);
    h.ico(BLACK, 0.2, 1, [0.1, 0.06, 0], [1.05, 0.95, 0.95]);
    h.box(WHITE, [0.06, 0.2, 0.08], [0.24, 0.1, 0], [0, 0, -0.35]); // blaze
    h.ico(WHITE, 0.12, 1, [0.3, -0.02, 0], [1.3, 0.72, 0.85]); // muzzle
    h.ico(NOSE, 0.045, 0, [0.44, 0.0, 0]);
    h.ico(NOSE, 0.03, 0, [0.22, 0.14, 0.1]);
    h.ico(NOSE, 0.03, 0, [0.22, 0.14, -0.1]);
    h.cone(BLACK, 0.07, 0.2, 4, [0.02, 0.28, 0.1], [0.35, 0, 0.3]);
    h.cone(BLACK, 0.07, 0.2, 4, [0.02, 0.28, -0.1], [-0.35, 0, 0.3]);
    h.box(PINK, [0.08, 0.02, 0.06], [0.36, -0.1, 0], [0, 0, -0.3]); // tongue
    t.cyl(BLACK, 0.05, 0.08, 0.42, 5, [-0.2, 0, 0], [0, 0, Math.PI / 2 + 0.2]);
    t.ico(WHITE, 0.07, 0, [-0.42, -0.04, 0]);
    l.cyl(BLACK, 0.075, 0.065, 0.26, 5, [0, -0.13, 0]);
    l.cyl(WHITE, 0.065, 0.06, 0.2, 5, [0, -0.36, 0]);
    l.ico(WHITE, 0.07, 0, [0.03, -0.45, 0], [1.3, 0.6, 1]);
  } else if (kind === "terrier") {
    // wiry white coat with tan patches, a beard and eyebrows, upright ears, a stubby perky tail
    b.ico(SCRUFF, 0.32, 1, [0, 0, 0], [1.3, 0.85, 0.85]);
    b.ico(TAN, 0.2, 1, [-0.12, 0.13, 0.05], [1.4, 0.7, 1.0]); // saddle patch
    b.ico(TAN, 0.14, 0, [0.12, 0.16, -0.12], [1, 0.7, 0.9]);
    for (const [x, y, z] of [[0.3, 0.12, 0.2], [0.34, -0.1, -0.2], [-0.3, 0.12, -0.21], [0.05, 0.25, 0.14], [-0.36, -0.05, 0.18], [0.2, 0.26, -0.05]] as const) {
      b.cone(SCRUFF, 0.06, 0.14, 4, [x, y, z], [x * 2, 0, z * 3]); // scruffy tufts
    }
    b.ico(SCRUFF, 0.2, 0, [0.36, 0.02, 0], [0.8, 1.05, 1.0]); // chest
    h.ico(SCRUFF, 0.19, 1, [0.1, 0.06, 0], [1.05, 1.0, 0.95]);
    h.ico(TAN, 0.13, 0, [0.06, 0.16, 0.08], [1, 0.8, 0.8]); // tan cap over one eye
    h.ico(SCRUFF, 0.12, 0, [0.3, -0.06, 0], [1.2, 0.8, 0.95]); // muzzle
    h.cone(SCRUFF, 0.09, 0.16, 5, [0.31, -0.17, 0], [0, 0, Math.PI]); // beard
    h.box("#8f8474", [0.1, 0.03, 0.07], [0.22, 0.17, 0.1], [0, 0, -0.3]); // eyebrows
    h.box("#8f8474", [0.1, 0.03, 0.07], [0.22, 0.17, -0.1], [0, 0, -0.3]);
    h.ico(NOSE, 0.045, 0, [0.42, 0.0, 0]);
    h.ico(NOSE, 0.032, 0, [0.22, 0.12, 0.1]);
    h.ico(NOSE, 0.032, 0, [0.22, 0.12, -0.1]);
    h.cone(TAN_DARK, 0.065, 0.2, 4, [0.0, 0.3, 0.1], [0.2, 0, 0.1]); // upright ears
    h.cone(TAN_DARK, 0.065, 0.2, 4, [0.0, 0.3, -0.1], [-0.2, 0, 0.1]);
    h.box(PINK, [0.07, 0.02, 0.05], [0.34, -0.1, 0], [0, 0, -0.3]);
    t.cyl(SCRUFF, 0.04, 0.06, 0.22, 5, [-0.1, 0, 0], [0, 0, Math.PI / 2 + 0.2]);
    t.cone(TAN, 0.05, 0.1, 4, [-0.24, 0.02, 0], [0, 0, Math.PI / 2]);
    l.cyl(SCRUFF, 0.07, 0.065, 0.3, 5, [0, -0.17, 0]);
    l.ico(SCRUFF, 0.07, 0, [0.03, -0.44, 0], [1.3, 0.6, 1]);
    l.cyl(SCRUFF, 0.075, 0.075, 0.14, 5, [0, -0.33, 0]);
  } else {
    // Maremma: big, all cream-white, a thick ruff, droopy ears and a plumed tail
    b.ico(CREAM, 0.36, 1, [0, 0, 0], [1.4, 0.85, 0.95]);
    b.ico(CREAM_SH, 0.3, 1, [-0.05, -0.1, 0], [1.3, 0.6, 0.9]);
    b.ico(CREAM, 0.27, 1, [0.4, 0.1, 0], [0.9, 1.25, 1.15]); // ruff
    b.ico(CREAM, 0.16, 0, [0.46, -0.05, 0.14]);
    b.ico(CREAM, 0.16, 0, [0.46, -0.05, -0.14]);
    h.ico(CREAM, 0.21, 1, [0.1, 0.06, 0], [1.05, 0.95, 1.0]);
    h.ico(CREAM_SH, 0.13, 1, [0.3, -0.04, 0], [1.25, 0.72, 0.9]); // muzzle
    h.ico(NOSE, 0.06, 0, [0.45, 0.0, 0], [0.9, 0.8, 1.1]);
    h.ico(NOSE, 0.038, 0, [0.24, 0.12, 0.1]);
    h.ico(NOSE, 0.038, 0, [0.24, 0.12, -0.1]);
    h.box(NOSE, [0.1, 0.018, 0.012], [0.36, -0.1, 0]); // mouth line
    h.ico(CREAM_EAR, 0.1, 0, [0.0, 0.04, 0.2], [0.6, 1.6, 0.45], [0.25, 0, 0]); // droopy ears
    h.ico(CREAM_EAR, 0.1, 0, [0.0, 0.04, -0.2], [0.6, 1.6, 0.45], [-0.25, 0, 0]);
    h.box(PINK, [0.08, 0.02, 0.06], [0.36, -0.12, 0], [0, 0, -0.3]);
    t.cyl(CREAM, 0.07, 0.1, 0.46, 5, [-0.22, 0, 0], [0, 0, Math.PI / 2 + 0.2]);
    t.ico(CREAM, 0.13, 0, [-0.44, -0.02, 0], [1.3, 0.9, 0.9]); // plume
    l.cyl(CREAM, 0.085, 0.075, 0.28, 5, [0, -0.14, 0]);
    l.cyl(CREAM_SH, 0.075, 0.07, 0.2, 5, [0, -0.36, 0]);
    l.ico(CREAM, 0.08, 0, [0.03, -0.45, 0], [1.3, 0.6, 1]);
  }
  return { body: b, head: h, tail: t, leg: l };
}
