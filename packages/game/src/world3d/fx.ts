// Small world effects: dust puffs on hops and landings, and the speech bubble.
import * as THREE from "three";

const N = 48;

export class Puffs {
  readonly mesh: THREE.InstancedMesh;
  private readonly data = new Float32Array(N * 6); // x, y, z, vx, vz, age (age < 0 = free)
  private next = 0;
  private live = 0;
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _p = new THREE.Vector3();
  private readonly _s = new THREE.Vector3();
  private readonly sizes = new Float32Array(N);

  constructor(scene: THREE.Scene) {
    const geo = new THREE.IcosahedronGeometry(0.16, 0);
    const mat = new THREE.MeshLambertMaterial({ color: "#efe4cf", flatShading: true, transparent: true, opacity: 0.85, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    for (let i = 0; i < N; i++) this.data[i * 6 + 5] = -1;
    scene.add(this.mesh);
  }

  spawn(x: number, z: number, n: number, size = 1): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % N;
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.6;
      const sp = 0.6 + Math.random() * 0.5;
      const o = i * 6;
      this.data[o] = x + Math.cos(a) * 0.25 * size;
      this.data[o + 1] = 0.08;
      this.data[o + 2] = z + Math.sin(a) * 0.25 * size;
      this.data[o + 3] = Math.cos(a) * sp * size;
      this.data[o + 4] = Math.sin(a) * sp * size;
      this.data[o + 5] = 0;
      this.sizes[i] = size * (0.8 + Math.random() * 0.5);
    }
  }

  step(dt: number): void {
    const LIFE = 0.55;
    let n = 0;
    for (let i = 0; i < N; i++) {
      const o = i * 6;
      if (this.data[o + 5]! < 0) continue;
      const age = (this.data[o + 5]! += dt);
      if (age > LIFE) { this.data[o + 5] = -1; continue; }
      const damp = Math.exp(-age * 5);
      this.data[o]! += this.data[o + 3]! * dt * damp;
      this.data[o + 2]! += this.data[o + 4]! * dt * damp;
      this.data[o + 1]! += dt * 0.5;
      const u = age / LIFE;
      const s = this.sizes[i]! * (0.6 + u * 1.1) * (1 - u * u);
      this._p.set(this.data[o]!, this.data[o + 1]!, this.data[o + 2]!);
      this._q.setFromAxisAngle(this._p.clone().normalize(), age * 3);
      this._m.compose(this._p, this._q, this._s.set(s, s * 0.8, s));
      this.mesh.setMatrixAt(n++, this._m);
    }
    this.live = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }

  get active(): number { return this.live; }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

let styled = false;
/** One-off CSS for world overlays (bubbles). The world owns no stylesheet, so it injects a tiny one. */
export function ensureWorldCss(): void {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const st = document.createElement("style");
  st.dataset.world3d = "1";
  st.textContent = `
.w3d-bubble{position:absolute;left:0;top:0;pointer-events:none;z-index:3;transform:translate(-50%,-100%);
  padding:5px 12px 6px;border-radius:16px;background:#fffdf6;color:#3b3330;border:2.5px solid #3b3330;
  font:800 16px/1.1 system-ui,sans-serif;white-space:nowrap;box-shadow:2px 3px 0 #3b333055}
.w3d-bubble::after{content:"";position:absolute;left:calc(50% - 7px);bottom:-10px;width:12px;height:12px;background:#fffdf6;
  border-right:2.5px solid #3b3330;border-bottom:2.5px solid #3b3330;transform:rotate(45deg) skew(8deg,8deg);border-radius:0 0 4px 0}
.w3d-bubble.loud{font-size:21px;letter-spacing:.02em}
.w3d-bubble.soft{font-size:14px;color:#6b605a}
.w3d-bubble .in{display:inline-block}
.w3d-bubble.pop .in{animation:w3dpop .38s cubic-bezier(.3,1.7,.5,1) both}
.w3d-bubble.pop{animation:w3dfade .25s ease-out both}
.w3d-bubble.bye{opacity:0;transition:opacity .3s}
.w3d-bubble.portrait-bubble{font-size:15px;padding:4px 10px 5px;z-index:2}
.w3d-bubble.portrait-bubble.loud{font-size:18px}
@keyframes w3dpop{from{transform:scale(.3) rotate(-8deg)}to{transform:scale(1) rotate(0)}}
@keyframes w3dfade{from{opacity:0}to{opacity:1}}
`;
  document.head.appendChild(st);
}

export class Bubble {
  readonly el: HTMLDivElement;
  private readonly inner: HTMLSpanElement;
  /** remaining seconds; Infinity = until hidden */
  left = 0;
  id: string | null = null;

  constructor(container: HTMLElement, private readonly extra = "") {
    ensureWorldCss();
    this.el = document.createElement("div");
    this.el.className = `w3d-bubble ${extra}`;
    this.el.style.display = "none";
    this.el.dataset.worldBubble = "1";
    this.inner = document.createElement("span");
    this.inner.className = "in";
    this.el.appendChild(this.inner);
    container.appendChild(this.el);
  }

  show(id: string, text: string, seconds: number, animate: boolean): void {
    this.id = id;
    this.left = seconds;
    this.inner.textContent = text;
    this.el.className = `w3d-bubble ${this.extra} ${text === text.toUpperCase() && /[A-Z]/.test(text) ? "loud" : /^[.…]+$/.test(text) ? "soft" : ""}`;
    this.el.style.display = "block";
    if (animate) {
      void this.el.offsetWidth; // restart the pop animation
      this.el.classList.add("pop");
    }
  }

  hide(): void {
    this.id = null;
    this.left = 0;
    this.el.style.display = "none";
  }

  step(dt: number): void {
    if (!this.id || !Number.isFinite(this.left)) return;
    this.left -= dt;
    if (this.left < 0.3) this.el.classList.add("bye");
    if (this.left <= 0) this.hide();
  }

  place(x: number, y: number): void {
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  dispose(): void {
    this.el.remove();
  }
}

/**
 * Little pink hearts that float up from an animal you've just greeted (or given a treat) and fade. Under
 * reduced motion they appear still for a moment instead.
 */
export class Hearts {
  readonly mesh: THREE.InstancedMesh;
  private readonly data = new Float32Array(24 * 6); // x, y, z, sway phase, age (age < 0 = free), size
  private next = 0;
  private live = 0;
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _p = new THREE.Vector3();
  private readonly _s = new THREE.Vector3();

  constructor(scene: THREE.Scene, heart: THREE.BufferGeometry, mat: THREE.Material, private readonly still: boolean) {
    this.mesh = new THREE.InstancedMesh(heart, mat, 24);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    for (let i = 0; i < 24; i++) this.data[i * 6 + 4] = -1;
    scene.add(this.mesh);
  }

  spawn(x: number, y: number, z: number, n: number): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % 24;
      const o = i * 6;
      const a = (k / Math.max(1, n)) * Math.PI * 2;
      this.data[o] = x + Math.cos(a) * 0.35;
      this.data[o + 1] = y + (this.still ? k * 0.35 : 0);
      this.data[o + 2] = z + Math.sin(a) * 0.35;
      this.data[o + 3] = a;
      this.data[o + 4] = this.still ? 0 : -k * 0.18; // staggered
      this.data[o + 5] = 0.5 + (k % 2) * 0.15;
    }
    this.step(0);
  }

  get active(): number { return this.live; }

  step(dt: number): void {
    const LIFE = this.still ? 1.6 : 1.7;
    let n = 0;
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
    for (let i = 0; i < 24; i++) {
      const o = i * 6;
      if (this.data[o + 4]! < -0.9) continue;
      const age = (this.data[o + 4]! += dt);
      if (age > LIFE) { this.data[o + 4] = -1; continue; }
      if (age < 0) continue;
      const u = age / LIFE;
      const rise = this.still ? 0 : age * 1.1;
      const sway = this.still ? 0 : Math.sin(age * 5 + this.data[o + 3]!) * 0.18;
      const s = this.data[o + 5]! * (u < 0.15 ? u / 0.15 : u > 0.75 ? (1 - u) / 0.25 : 1);
      this._p.set(this.data[o]! + sway, this.data[o + 1]! + rise, this.data[o + 2]!);
      this._m.compose(this._p, this._q, this._s.set(s, s, s));
      this.mesh.setMatrixAt(n++, this._m);
    }
    this.live = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}
