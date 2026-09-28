// Mog the farm cat (upgrade "cat"): a little orange tabby who lives around the
// barn. Naps and grooms on the barn roof, hops down onto the hay bales, stalks
// along the barn floor with its tail twitching, pounces, sits in the sun, and
// climbs back up. Curls up on the roof at night. Cosmetic only (Math.random is fine).
import * as THREE from "three";
import { GeoBatch } from "./builder.js";

const ORANGE = "#e79a52", STRIPE = "#bf6d33", CREAM = "#fbeede", PINK = "#f2a3ad", EYE = "#3d5a2a", NOSE = "#d9727f";
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

type P3 = [number, number, number];
/** Where the cat likes to be. Heights are the surface it stands on. */
const ROOF: P3 = [-19.4, 2.95, -4.45];
const ROOF2: P3 = [-16.2, 2.95, -4.45];
const HAY_TOP: P3 = [-21.65, 1.42, -4.4];
const HAY_LOW: P3 = [-21.1, 0.72, -3.4];
const TROUGH: P3 = [-15.0, 0.57, -4.6];
/** Ground where it stalks (the barn floor, inside the lean-to). */
const FLOOR = { x0: -22.2, x1: -13.2, z0: -4.2, z1: -2.4 };
const SUN: P3 = [-13.6, 0.03, 0.9];

type Mode = "nap" | "groom" | "sit" | "walk" | "stalk" | "pounce" | "jump";

export class Cat {
  readonly group = new THREE.Group();
  readonly pick: THREE.Mesh;
  private readonly mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly tail: THREE.Group[] = [];
  private readonly legs: THREE.Group[] = [];
  x = ROOF[0]; y = ROOF[1]; z = ROOF[2]; heading = -1.15;
  private mode: Mode = "nap";
  private timer = 4;
  private route: { to: P3; mode: Mode }[] = [];
  private jump: { from: P3; to: P3; t: number; dur: number } | null = null;
  private target: P3 = ROOF;
  private speed = 0;
  private stride = 0;
  private curl = 1;
  private crouch = 0;
  private lick = 0;
  private sitAmt = 0;
  private yaw = 0;

  /** `ox` shifts the whole barn-side routine along x (the barn moved in the valley). */
  constructor(parent: THREE.Object3D, shadows: boolean, private readonly ox = 0) {
    const mk = (b: GeoBatch, par: THREE.Object3D, cast = true) => {
      const g = b.build()!;
      this.geos.push(g);
      const m = new THREE.Mesh(g, this.mat);
      m.castShadow = shadows && cast;
      par.add(m);
      return m;
    };
    const b = new GeoBatch(0.05);
    b.ico(ORANGE, 0.22, 1, [0, 0, 0], [1.45, 0.82, 0.8]);
    b.ico(CREAM, 0.15, 1, [0.17, -0.07, 0], [1.1, 0.8, 0.85]); // chest and belly
    for (const x of [-0.18, -0.04, 0.1]) b.box(STRIPE, [0.06, 0.05, 0.36], [x, 0.14, 0], [0, 0, 0.1]); // tabby stripes
    mk(b, this.body);
    this.body.position.set(0, 0.3, 0);
    const h = new GeoBatch(0.04);
    h.ico(ORANGE, 0.15, 1, [0.06, 0.04, 0], [1.0, 0.92, 1.05]);
    h.ico(CREAM, 0.075, 0, [0.17, -0.02, 0], [0.9, 0.7, 1.1]); // muzzle
    h.ico(NOSE, 0.022, 0, [0.22, 0.01, 0]);
    h.ico(EYE, 0.03, 0, [0.15, 0.07, 0.065], [0.7, 1.2, 1]);
    h.ico(EYE, 0.03, 0, [0.15, 0.07, -0.065], [0.7, 1.2, 1]);
    h.cone(ORANGE, 0.06, 0.12, 3, [0.02, 0.18, 0.08], [0.25, 0, 0]);
    h.cone(ORANGE, 0.06, 0.12, 3, [0.02, 0.18, -0.08], [-0.25, 0, 0]);
    h.cone(PINK, 0.032, 0.07, 3, [0.035, 0.17, 0.08], [0.25, 0, 0]);
    h.cone(PINK, 0.032, 0.07, 3, [0.035, 0.17, -0.08], [-0.25, 0, 0]);
    h.box(STRIPE, [0.05, 0.02, 0.1], [0.07, 0.15, 0], [0, 0, -0.2]);
    mk(h, this.head, false);
    this.head.position.set(0.3, 0.13, 0);
    this.body.add(this.head);
    // tail: three segments that curl
    let parentSeg: THREE.Object3D = this.body;
    for (let i = 0; i < 3; i++) {
      const t = new GeoBatch(0.03);
      t.cyl(i === 2 ? STRIPE : ORANGE, 0.035, 0.042, 0.17, 5, [-0.085, 0, 0], [0, 0, Math.PI / 2]);
      const seg = new THREE.Group();
      seg.position.set(i === 0 ? -0.3 : -0.17, i === 0 ? 0.04 : 0, 0);
      mk(t, seg, false);
      parentSeg.add(seg);
      this.tail.push(seg);
      parentSeg = seg;
    }
    const l = new GeoBatch(0);
    l.cyl(ORANGE, 0.045, 0.04, 0.2, 5, [0, -0.1, 0]);
    l.ico(CREAM, 0.045, 0, [0.02, -0.2, 0], [1.3, 0.6, 1]);
    const legGeo = l.build()!;
    this.geos.push(legGeo);
    for (const [x, z] of [[0.2, 0.08], [0.2, -0.08], [-0.2, 0.08], [-0.2, -0.08]] as const) {
      const p = new THREE.Group();
      p.position.set(x, 0.22, z);
      const m = new THREE.Mesh(legGeo, this.mat);
      m.castShadow = shadows;
      p.add(m);
      this.group.add(p);
      this.legs.push(p);
    }
    this.group.add(this.body);
    const pickGeo = new THREE.BoxGeometry(0.9, 0.7, 0.6);
    this.geos.push(pickGeo);
    this.pick = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.pick.position.set(0, 0.3, 0);
    this.pick.userData.pet = "cat";
    this.group.add(this.pick);
    this.group.scale.setScalar(1.7);
    this.group.visible = false;
    parent.add(this.group);
  }

  get visible(): boolean { return this.group.visible; }

  show(on: boolean): void {
    if (on && !this.group.visible) { [this.x, this.y, this.z] = ROOF; this.mode = "nap"; this.timer = 3 + Math.random() * 4; this.route = []; }
    this.group.visible = on;
  }

  /** Sit still facing the camera (for portraits and reduced motion). */
  posePortrait(): void {
    this.group.visible = true;
    this.x = 0; this.y = 0; this.z = 0; this.heading = -0.5; this.mode = "sit"; this.sitAmt = 1; this.curl = 0; this.crouch = 0; this.speed = 0; this.yaw = 0.4;
    this.pose(0.6);
  }

  /** Where to draw a speech bubble or hearts (world coords, above its head). */
  top(): THREE.Vector3 {
    return new THREE.Vector3(this.x + this.ox, this.y + 0.95, this.z);
  }

  update(dt: number, time: number, night: number, still: boolean): void {
    if (!this.group.visible) return;
    if (still) {
      [this.x, this.y, this.z] = ROOF; this.heading = -1.15;
      this.mode = night > 0.5 ? "nap" : "sit";
      this.curl = night > 0.5 ? 1 : 0; this.sitAmt = night > 0.5 ? 0 : 1; this.crouch = 0; this.speed = 0;
      this.pose(time);
      return;
    }
    if (night > 0.4 && this.mode !== "jump" && this.mode !== "nap") {
      // bedtime: back to the roof
      if (!this.route.length && Math.hypot(this.x - ROOF[0], this.z - ROOF[2]) > 0.3) this.plan(ROOF, "nap");
      else if (!this.route.length) { this.mode = "nap"; this.timer = 5; }
    }
    this.timer -= dt;
    if (this.jump) {
      const j = this.jump;
      j.t += dt;
      const u = clamp(j.t / j.dur, 0, 1);
      this.x = j.from[0] + (j.to[0] - j.from[0]) * u;
      this.z = j.from[2] + (j.to[2] - j.from[2]) * u;
      this.y = j.from[1] + (j.to[1] - j.from[1]) * u + Math.sin(u * Math.PI) * (0.5 + Math.abs(j.to[1] - j.from[1]) * 0.35);
      this.heading = Math.atan2(-(j.to[2] - j.from[2]), j.to[0] - j.from[0]);
      if (u >= 1) { this.jump = null; this.next(); }
    } else if (this.mode === "walk" || this.mode === "stalk") {
      const [tx, , tz] = this.target;
      const dx = tx - this.x, dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) { this.next(); }
      else {
        const turn = wrap(Math.atan2(-dz, dx) - this.heading);
        this.heading += clamp(turn * 6, -6, 6) * dt;
        const v = (this.mode === "stalk" ? 0.35 : 1.0) * Math.max(0, Math.cos(turn));
        this.speed += (v - this.speed) * (1 - Math.exp(-dt * 6));
        this.x += Math.cos(this.heading) * this.speed * dt;
        this.z -= Math.sin(this.heading) * this.speed * dt;
        this.stride += this.speed * dt * 16;
      }
    } else {
      this.speed *= Math.exp(-dt * 8);
      if (this.mode === "pounce") { if (this.timer <= 0) { this.mode = "sit"; this.timer = 2 + Math.random() * 2; } }
      else if (this.timer <= 0 && !this.route.length) this.choose(night);
      else if (this.timer <= 0) this.next();
    }
    const k = 1 - Math.exp(-dt * 5);
    this.curl += ((this.mode === "nap" ? 1 : 0) - this.curl) * k;
    this.sitAmt += ((this.mode === "sit" || this.mode === "groom" ? 1 : 0) - this.sitAmt) * k;
    this.crouch += ((this.mode === "stalk" ? 1 : this.mode === "pounce" && this.timer > 0.4 ? 0.6 : 0) - this.crouch) * k;
    this.lick = this.mode === "groom" ? 1 : this.lick * Math.exp(-dt * 4);
    this.pose(time);
  }

  /** Pick the next little adventure. */
  private choose(night: number): void {
    const onRoof = this.y > 2.5;
    const r = Math.random();
    if (night > 0.4) { this.mode = "nap"; this.timer = 6; return; }
    if (onRoof) {
      if (r < 0.35) { this.mode = "nap"; this.timer = 6 + Math.random() * 8; }
      else if (r < 0.55) { this.mode = "groom"; this.timer = 3 + Math.random() * 3; }
      else if (r < 0.7) { this.plan(Math.abs(this.x - ROOF[0]) < 0.5 ? ROOF2 : ROOF, "sit"); }
      else {
        // down for a hunt: roof → hay stack → barn floor, stalk, pounce
        const fx = FLOOR.x0 + Math.random() * (FLOOR.x1 - FLOOR.x0), fz = FLOOR.z0 + Math.random() * (FLOOR.z1 - FLOOR.z0);
        this.route = [
          { to: HAY_TOP, mode: "jump" }, { to: HAY_LOW, mode: "jump" }, { to: [HAY_LOW[0] + 0.6, 0.02, HAY_LOW[2] + 0.4], mode: "jump" },
          { to: [fx, 0.02, fz], mode: "stalk" }, { to: [fx + 0.5, 0.02, fz], mode: "pounce" },
        ];
        if (this.x > -18) this.route.unshift({ to: ROOF, mode: "walk" });
        this.next();
      }
      return;
    }
    if (r < 0.3) {
      const fx = FLOOR.x0 + Math.random() * (FLOOR.x1 - FLOOR.x0), fz = FLOOR.z0 + Math.random() * (FLOOR.z1 - FLOOR.z0);
      this.route = [{ to: [fx, 0.02, fz], mode: "stalk" }, { to: [fx + 0.4, 0.02, fz + 0.1], mode: "pounce" }];
    } else if (r < 0.5) {
      this.route = [{ to: [SUN[0], 0.02, SUN[2]], mode: "walk" }, { to: SUN, mode: "nap" }];
    } else if (r < 0.65) {
      this.route = [{ to: [TROUGH[0], 0.02, TROUGH[2] + 0.5], mode: "walk" }, { to: TROUGH, mode: "jump" }, { to: TROUGH, mode: "groom" }];
    } else {
      // back up to the roof by the hay
      this.route = [{ to: [HAY_LOW[0] + 0.6, 0.02, HAY_LOW[2] + 0.4], mode: "walk" }, { to: HAY_LOW, mode: "jump" }, { to: HAY_TOP, mode: "jump" }, { to: ROOF, mode: "jump" }, { to: ROOF, mode: "nap" }];
    }
    this.next();
  }

  /** Walk (and jump) to a point, then do `then` there. */
  private plan(to: P3, then: Mode): void {
    const onRoof = this.y > 2.5, toRoof = to[1] > 2.5;
    if (onRoof === toRoof) this.route = [{ to, mode: toRoof ? "walk" : "walk" }, { to, mode: then }];
    else if (toRoof) this.route = [{ to: [HAY_LOW[0] + 0.6, 0.02, HAY_LOW[2] + 0.4], mode: "walk" }, { to: HAY_LOW, mode: "jump" }, { to: HAY_TOP, mode: "jump" }, { to, mode: "jump" }, { to, mode: then }];
    else this.route = [{ to: HAY_TOP, mode: "jump" }, { to: HAY_LOW, mode: "jump" }, { to, mode: "jump" }, { to, mode: then }];
    this.next();
  }

  private next(): void {
    const step = this.route.shift();
    if (!step) { this.mode = "sit"; this.timer = 1.5 + Math.random() * 2; return; }
    this.target = step.to;
    if (step.mode === "jump") {
      const from: P3 = [this.x, this.y, this.z];
      this.jump = { from, to: step.to, t: 0, dur: 0.45 + Math.hypot(step.to[0] - from[0], step.to[2] - from[2]) * 0.12 };
      this.mode = "jump";
    } else if (step.mode === "walk" || step.mode === "stalk") {
      this.y = step.to[1];
      this.mode = step.mode;
    } else if (step.mode === "pounce") {
      this.jump = { from: [this.x, this.y, this.z], to: step.to, t: 0, dur: 0.35 };
      this.mode = "jump";
      this.route.unshift({ to: step.to, mode: "sit" });
      this.timer = 0.8;
    } else {
      this.mode = step.mode;
      this.timer = step.mode === "nap" ? 8 + Math.random() * 10 : step.mode === "groom" ? 3 + Math.random() * 2 : 2 + Math.random() * 3;
    }
  }

  private pose(time: number): void {
    this.group.position.set(this.x + this.ox, this.y, this.z);
    this.group.rotation.y = this.heading;
    const walk = clamp(this.speed / 0.8, 0, 1);
    const s = Math.sin(this.stride);
    const curl = this.curl, sit = this.sitAmt * (1 - curl), crouch = this.crouch;
    const air = this.jump ? 1 : 0;
    const swing = [s, -s, -s, s];
    this.legs.forEach((p, i) => {
      const back = i >= 2;
      p.rotation.z = swing[i]! * 0.7 * walk + (back ? -1.3 * sit : 0.1 * sit) + (back ? -1.4 : 1.4) * curl + (back ? 0.6 : -0.6) * air;
      p.position.y = 0.22 - (back ? 0.1 * sit : 0) - 0.16 * curl - 0.07 * crouch;
    });
    this.body.position.y = 0.3 + Math.abs(s) * 0.02 * walk - 0.06 * sit - 0.19 * curl - 0.09 * crouch;
    this.body.position.x = -0.06 * sit;
    this.body.rotation.z = 0.55 * sit + 0.03 * s * walk;
    this.body.rotation.y = 0.5 * curl; // curls round
    const nap = curl > 0.5;
    this.head.rotation.set(
      0.2 * this.lick * Math.sin(time * 9) + (nap ? 0.3 : 0),
      nap ? 0.9 : this.yaw * (1 - walk) + 0.15 * Math.sin(time * 0.6),
      -0.5 * sit - (nap ? 0.5 : 0) - this.lick * (0.6 + 0.1 * Math.sin(time * 9)) + 0.25 * crouch, "YXZ");
    // tail: up and swaying when walking, low and twitching when stalking, wrapped round when curled
    const twitch = Math.sin(time * (crouch > 0.5 ? 11 : 2.2));
    this.tail.forEach((seg, i) => {
      const up = (1 - curl) * (1 - crouch) * (i === 0 ? 1.2 : 0.35) + crouch * (i === 0 ? 0.15 : 0.05) - sit * (i === 0 ? 1.4 : 0);
      seg.rotation.set(curl * (i === 0 ? 1.1 : 0.9) + sit * 0.5, 0.15 * twitch * (i + 1) * (crouch > 0.5 ? 0.6 : 1), up);
    });
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    (this.pick.material as THREE.Material).dispose();
  }
}
