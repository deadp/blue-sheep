// The farmer (DESIGN-v3 §15 items 22 and 24; ported from the movement prototype): gumboots, stubbies, the
// red-and-black check bush shirt, a wide felt hat and a crook. Faces +x, feet at y = 0, about 2.1 units tall
// before the world scales it up. Legs swing from the hip, arms from the shoulder, the head looks about.
import * as THREE from "three";
import { GeoBatch } from "./builder.js";
import { smoothGeo } from "./sheepMesh.js";

function checkTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#b8403a"; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(40,24,24,.75)"; g.fillRect(0, 0, 32, 64); g.fillRect(0, 0, 64, 32);
  g.fillStyle = "rgba(40,24,24,.45)"; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Planar UVs so the check wraps any shirt piece. */
function checked(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const p = geo.getAttribute("position");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i)) * 1.2; uv[i * 2 + 1] = p.getY(i) * 1.2; }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return new THREE.Mesh(geo, mat);
}

export interface Walker {
  root: THREE.Group;
  /** Advance the pose: `speed` in units/s (0 = idle), `dt` in seconds. Returns true on a footfall. */
  pose(speed: number, dt: number, t: number): boolean;
  /** Turn the head towards a yaw offset (radians, + = to the farmer's left), eased. */
  look(yaw: number): void;
  dispose(): void;
}

export function buildWalker(shadows: boolean): Walker {
  const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const unlit = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = (g: THREE.BufferGeometry) => new THREE.Mesh(smoothGeo(g), skinMat);
  const root = new THREE.Group();
  const body = new THREE.Group(); // bobs
  root.add(body);
  const skin = "#e6b995", boot = "#2b302b", shorts = "#3d4a5c", hat = "#8a6a4a", band = "#5d4636";
  const shirtMat = new THREE.MeshStandardMaterial({ map: checkTexture(), roughness: 0.95 });
  const HIP = 0.86, SH = 1.56;

  const legs: THREE.Group[] = [];
  for (const z of [0.16, -0.16]) {
    const g = new THREE.Group();
    g.position.set(0, HIP, z);
    const b = new GeoBatch(0);
    b.cyl(boot, 0.12, 0.13, 0.55, 10, [0, 0.28 - HIP, 0]);
    b.ico(boot, 0.13, 2, [0.08, 0.08 - HIP, 0], [1.5, 0.6, 1]);
    b.cyl(skin, 0.085, 0.1, 0.34, 8, [0, 0.7 - HIP, 0]);
    g.add(mesh(b.build()!));
    body.add(g);
    legs.push(g);
  }
  const torso = new GeoBatch(0);
  torso.cyl(shorts, 0.3, 0.32, 0.34, 12, [0, 0.95, 0]);
  body.add(mesh(torso.build()!));
  const shirt = new GeoBatch(0);
  shirt.cyl("#ffffff", 0.3, 0.33, 0.62, 14, [0, 1.38, 0]);
  shirt.ico("#ffffff", 0.33, 2, [0, 1.66, 0], [1, 0.45, 1.05]);
  body.add(checked(shirt.build()!, shirtMat));

  const arms: THREE.Group[] = [];
  for (const z of [0.38, -0.38]) {
    const g = new THREE.Group();
    g.position.set(0, SH, z * 0.96);
    const tilt = z > 0 ? -0.12 : 0.12;
    const a = new GeoBatch(0);
    a.cyl(skin, 0.07, 0.08, 0.42, 8, [0.02, 1.2 - SH, z * 0.04], [tilt, 0, 0]);
    a.ico(skin, 0.08, 1, [0.04, 0.98 - SH, z * 0.08]);
    g.add(mesh(a.build()!));
    const sl = new GeoBatch(0);
    sl.cyl("#ffffff", 0.1, 0.1, 0.28, 8, [0, -0.06, 0], [z > 0 ? -0.2 : 0.2, 0, 0]);
    g.add(checked(sl.build()!, shirtMat));
    if (z < 0) {
      // the crook rides in the right hand
      const c = new GeoBatch(0);
      c.cyl("#9a7b5a", 0.03, 0.03, 2.0, 6, [0.14, 0.98 - SH + 0.05, -0.06]);
      c.add(new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI * 1.3), "#9a7b5a", new THREE.Matrix4().makeTranslation(0.26, 0.98 - SH + 1.05, -0.06));
      g.add(mesh(c.build()!));
    }
    body.add(g);
    arms.push(g);
  }

  const head = new THREE.Group();
  head.position.set(0.02, 1.8, 0);
  const hb = new GeoBatch(0);
  const H0 = 1.8;
  hb.ico(skin, 0.24, 3, [0, 1.98 - H0, 0], [1, 1.05, 1]);
  hb.ico("#d9a47e", 0.06, 1, [0.23, 1.95 - H0, 0]);
  for (const z of [0.23, -0.23]) hb.ico(skin, 0.06, 1, [-0.02, 1.97 - H0, z], [0.6, 1, 0.5]);
  hb.ico("#7a5b44", 0.2, 2, [0.04, 1.86 - H0, 0], [0.9, 0.5, 1.02]);
  hb.cyl(hat, 0.5, 0.5, 0.04, 20, [-0.02, 2.15 - H0, 0]);
  hb.cyl(hat, 0.2, 0.25, 0.26, 14, [-0.02, 2.3 - H0, 0]);
  hb.cyl(band, 0.255, 0.255, 0.06, 14, [-0.02, 2.2 - H0, 0]);
  head.add(mesh(hb.build()!));
  const e = new GeoBatch(0);
  for (const z of [0.09, -0.09]) { e.ico("#2b1e19", 0.035, 1, [0.2, 2.02 - H0, z]); e.ico("#ffffff", 0.012, 1, [0.225, 2.035 - H0, z + 0.01]); }
  head.add(new THREE.Mesh(e.build()!, unlit));
  body.add(head);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = shadows; });

  let phase = 0, amp = 0, lookTarget = 0, lastSin = 0;
  return {
    root,
    look(yaw) { lookTarget = yaw; },
    dispose() {
      root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      skinMat.dispose(); unlit.dispose(); shirtMat.map?.dispose(); shirtMat.dispose();
    },
    pose(speed, dt, t) {
      const moving = speed > 0.2;
      amp += ((moving ? Math.min(1, speed / 4.5) : 0) - amp) * Math.min(1, dt * 10);
      phase += dt * (moving ? 2.2 + speed * 1.15 : 0);
      const s = Math.sin(phase);
      const swing = 0.75 * amp;
      legs[0]!.rotation.z = s * swing;
      legs[1]!.rotation.z = -s * swing;
      arms[0]!.rotation.z = -s * swing * 0.8;
      arms[1]!.rotation.z = s * swing * 0.6;
      arms[0]!.rotation.x = -0.05; arms[1]!.rotation.x = 0.05;
      body.position.y = Math.abs(Math.cos(phase)) * 0.08 * amp + (moving ? 0 : Math.sin(t * 1.6) * 0.012);
      body.rotation.z = -0.07 * amp; // lean into the walk
      body.rotation.x = s * 0.04 * amp;
      head.rotation.y += (lookTarget - head.rotation.y) * Math.min(1, dt * 4);
      head.rotation.z = moving ? 0 : Math.sin(t * 0.7) * 0.03;
      const step = amp > 0.3 && Math.sign(s) !== Math.sign(lastSin);
      lastSin = s;
      return step;
    },
  };
}
