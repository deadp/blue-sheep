// The sheepdog (upgrade "dog"): a low-poly border collie that trots round the
// flock, sits to watch, keeps an eye on whichever sheep you are visiting, and
// curls up at night.
import * as THREE from "three";
import { GeoBatch } from "./builder.js";
import type { Rect } from "./farm.js";

const BLACK = "#2b2627", WHITE = "#f6f1e8", PINK = "#e88f9a", NOSE = "#161212";
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface DogCtx {
  time: number;
  night: number;
  zone: Rect;
  sheep: { x: number; z: number; radius: number }[];
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

  constructor(scene: THREE.Scene, shadows: boolean) {
    const mk = (b: GeoBatch, parent: THREE.Object3D, cast = true) => {
      const g = b.build()!;
      this.geos.push(g);
      const m = new THREE.Mesh(g, this.mat);
      m.castShadow = shadows && cast;
      parent.add(m);
      return m;
    };
    // body: black saddle over a white chest and belly
    const b = new GeoBatch(0.05);
    b.ico(BLACK, 0.34, 1, [0, 0, 0], [1.45, 0.76, 0.85]);
    b.ico(WHITE, 0.25, 1, [0.3, -0.06, 0], [0.9, 0.9, 0.95]);
    b.ico(WHITE, 0.2, 1, [0.46, 0.1, 0], [0.8, 1.2, 1.05]); // ruff
    b.ico(WHITE, 0.22, 0, [-0.05, -0.14, 0], [1.3, 0.45, 0.8]);
    mk(b, this.body);
    this.body.position.set(0, 0.56, 0);
    // head (pivot at the neck)
    const h = new GeoBatch(0.04);
    h.ico(BLACK, 0.2, 1, [0.1, 0.06, 0], [1.05, 0.95, 0.95]);
    h.box(WHITE, [0.06, 0.2, 0.08], [0.24, 0.1, 0], [0, 0, -0.35]); // blaze
    h.ico(WHITE, 0.12, 1, [0.3, -0.02, 0], [1.3, 0.72, 0.85]); // muzzle
    h.ico(NOSE, 0.045, 0, [0.44, 0.0, 0]);
    h.ico(NOSE, 0.03, 0, [0.22, 0.14, 0.1]);
    h.ico(NOSE, 0.03, 0, [0.22, 0.14, -0.1]);
    h.cone(BLACK, 0.07, 0.2, 4, [0.02, 0.28, 0.1], [0.35, 0, 0.3]);
    h.cone(BLACK, 0.07, 0.2, 4, [0.02, 0.28, -0.1], [-0.35, 0, 0.3]);
    h.box(PINK, [0.08, 0.02, 0.06], [0.36, -0.1, 0], [0, 0, -0.3]); // tongue
    mk(h, this.head, false);
    this.head.position.set(0.5, 0.2, 0);
    this.body.add(this.head);
    // tail (pivot at the rump)
    const t = new GeoBatch(0.04);
    t.cyl(BLACK, 0.05, 0.08, 0.42, 5, [-0.2, 0, 0], [0, 0, Math.PI / 2 + 0.2]);
    t.ico(WHITE, 0.07, 0, [-0.42, -0.04, 0]);
    mk(t, this.tail, false);
    this.tail.position.set(-0.46, 0.08, 0);
    this.body.add(this.tail);
    // legs with white socks
    const l = new GeoBatch(0);
    l.cyl(BLACK, 0.075, 0.065, 0.26, 5, [0, -0.13, 0]);
    l.cyl(WHITE, 0.065, 0.06, 0.2, 5, [0, -0.36, 0]);
    l.ico(WHITE, 0.07, 0, [0.03, -0.45, 0], [1.3, 0.6, 1]);
    const legGeo = l.build()!;
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
    this.group.scale.setScalar(1.35);
    this.group.visible = false;
    scene.add(this.group);
  }

  get visible(): boolean { return this.group.visible; }

  show(on: boolean, zone: Rect): void {
    if (on && !this.group.visible) {
      this.x = (zone.x0 + zone.x1) / 2 + 3;
      this.z = zone.z1 - 0.8;
      this.heading = Math.PI / 2;
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
    if (c.still) {
      // a good dog, sitting by the gate and facing you
      this.x = clamp(1.5, r.x0, r.x1); this.z = r.z1 - 0.3;
      this.heading = -Math.PI / 4; this.sit = c.night > 0.5 ? 0 : 1; this.lie = c.night > 0.5 ? 1 : 0; this.speed = 0;
      this.pose(c.time, [this.x + 1, this.z + 1]);
      return;
    }
    this.timer -= dt;
    if (c.night > 0.4) this.mode = "lie";
    else if (c.attended) this.mode = "watch";
    else if (this.mode === "lie" || this.mode === "watch") { this.mode = "trot"; this.timer = 6; }
    if (this.mode === "trot") {
      if (this.timer <= 0) { this.mode = "sit"; this.timer = 3 + Math.random() * 3; }
      const R = 2.6 + Math.sqrt(c.sheep.length) * 1.1;
      this.theta += dt * 1.6 / R;
      this.tx = clamp(cx + Math.cos(this.theta) * R, r.x0, r.x1);
      this.tz = clamp(cz + Math.sin(this.theta) * R * 0.8, r.z0, r.z1);
    } else if (this.mode === "sit") {
      this.tx = this.x; this.tz = this.z;
      if (this.timer <= 0) { this.mode = "trot"; this.timer = 7 + Math.random() * 7; this.theta = Math.atan2(this.z - cz, this.x - cx); }
    } else if (this.mode === "watch" && c.attended) {
      const a = c.attended;
      look = [a.x, a.z];
      // sit a couple of steps from the sheep, on the camera side
      this.tx = clamp(a.x + 2.2, r.x0, r.x1);
      this.tz = clamp(a.z + 1.2, r.z0, r.z1);
    } else if (this.mode === "lie") {
      this.tx = clamp(1.5, r.x0, r.x1); this.tz = r.z1 - 0.3;
    }
    const dx = this.tx - this.x, dz = this.tz - this.z;
    const d = Math.hypot(dx, dz);
    let want = 0;
    if (d > 0.3) {
      const turn = wrap(Math.atan2(-dz, dx) - this.heading);
      this.heading += clamp(turn * 5, -5, 5) * dt;
      want = (this.mode === "trot" ? 1.7 : 2.2) * Math.max(0, Math.cos(turn)) * clamp(d / 1.2, 0.3, 1);
    } else if (this.mode !== "trot") {
      const turn = wrap(Math.atan2(-(look[1] - this.z), look[0] - this.x) - this.heading);
      this.heading += clamp(turn * 3, -3, 3) * dt;
    }
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * 5));
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.z -= Math.sin(this.heading) * this.speed * dt;
    // don't trot through sheep
    for (const s of c.sheep) {
      const ox = this.x - s.x, oz = this.z - s.z;
      const od = Math.hypot(ox, oz), min = s.radius + 0.45;
      if (od < min && od > 1e-4) { this.x = s.x + (ox / od) * min; this.z = s.z + (oz / od) * min; }
    }
    this.x = clamp(this.x, r.x0, r.x1); this.z = clamp(this.z, r.z0, r.z1);
    this.stride += this.speed * dt * 7;
    const sitting = (this.mode === "sit" || this.mode === "watch") && this.speed < 0.3;
    this.sit += ((sitting ? 1 : 0) - this.sit) * (1 - Math.exp(-dt * 6));
    this.lie += ((this.mode === "lie" && this.speed < 0.3 ? 1 : 0) - this.lie) * (1 - Math.exp(-dt * 3));
    this.pose(c.time, look);
  }

  private pose(time: number, look: [number, number]): void {
    this.group.position.set(this.x, 0, this.z);
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
    const wag = lie ? 0.15 : 0.7 + walk * 0.2;
    this.tail.rotation.set(0, Math.sin(time * (lie ? 3 : 14)) * wag, -0.5 * sit - 0.2 * walk + 0.3 * lie);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
  }
}
