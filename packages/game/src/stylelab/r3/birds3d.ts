// Style lab round 3: chunky round native birds in 3D for the woolshed stations (DESIGN-v3 §12,
// §15 item 7): kākā (olive-brown, grey crown, heavy hooked beak, orange underwing), tūī (dark
// blue-green with the white throat tufts), pīwakawaka (small, buff belly, white brow, fanned tail).
// Each faces +x, feet at y = 0. Big soft eyes to match the sheep.
import * as THREE from "three";
import { GeoBatch, mat } from "../../world3d/builder.js";
import { mesh, type Mats } from "../render.js";

export type Bird3 = "kaka" | "tui" | "piwakawaka";

export function buildBird(mats: Mats, id: Bird3, scale = 1): THREE.Group {
  const root = new THREE.Group();
  const b = new GeoBatch(0);
  const eyes = new GeoBatch(0);
  const eye = (x: number, y: number, z: number, r: number) => {
    for (const s of [1, -1]) {
      eyes.ico("#fbf6ec", r * 1.35, 2, [x - 0.01, y, s * z], [0.6, 1, 1]);
      eyes.ico("#1d1614", r, 2, [x + 0.01, y, s * (z + 0.012)], [0.7, 1, 1]);
      eyes.ico("#ffffff", r * 0.35, 1, [x + 0.03, y + r * 0.4, s * (z + r * 0.8)]);
    }
  };
  if (id === "kaka") {
    const body = "#7d6b3e", belly = "#9c7a44", wing = "#5f5230", crown = "#c9c2b0", beak = "#6d665f", orange = "#e2703a";
    b.ico(body, 0.3, 3, [0, 0.42, 0], [1.05, 1.15, 0.95], [0, 0, -0.35]);
    b.ico(belly, 0.22, 2, [0.1, 0.33, 0], [0.9, 1.1, 0.9]);
    b.ico(body, 0.21, 3, [0.16, 0.78, 0]);
    b.ico(crown, 0.16, 2, [0.14, 0.88, 0], [1, 0.7, 1]);
    b.ico("#c98a4a", 0.07, 1, [0.26, 0.72, 0.1], [1, 1, 0.5]);
    b.ico("#c98a4a", 0.07, 1, [0.26, 0.72, -0.1], [1, 1, 0.5]);
    // heavy hooked beak
    b.add(new THREE.ConeGeometry(0.075, 0.24, 8), beak, mat([0.4, 0.73, 0], [0, 0, -2.2]));
    b.ico(beak, 0.08, 1, [0.34, 0.75, 0], [1, 0.9, 0.8]);
    // wings with the orange underwing showing where they lift a little
    for (const s of [1, -1]) {
      b.ico(orange, 0.2, 2, [-0.05, 0.42, s * 0.24], [1.2, 0.8, 0.3], [0, 0, -0.5]);
      b.ico(wing, 0.24, 2, [-0.08, 0.5, s * 0.25], [1.3, 0.85, 0.35], [0, 0, -0.55]);
    }
    b.add(new THREE.BoxGeometry(0.34, 0.05, 0.16), wing, mat([-0.38, 0.18, 0], [0, 0, 0.9]));
    eye(0.25, 0.83, 0.13, 0.042);
    for (const s of [1, -1]) b.cyl("#6b5a4d", 0.025, 0.025, 0.14, 5, [0.02, 0.07, s * 0.08]);
  } else if (id === "tui") {
    const body = "#2f4552", sheen = "#3c6068", wing = "#233440";
    b.ico(body, 0.26, 3, [0, 0.38, 0], [1.1, 1.1, 0.95], [0, 0, -0.3]);
    b.ico(sheen, 0.2, 2, [0.08, 0.34, 0], [0.9, 1.1, 0.95]);
    b.ico(body, 0.18, 3, [0.15, 0.7, 0]);
    // the white throat tufts and the lacy collar
    b.ico("#ffffff", 0.06, 2, [0.27, 0.58, 0.035]);
    b.ico("#ffffff", 0.06, 2, [0.27, 0.58, -0.035]);
    for (let i = 0; i < 7; i++) { const a = -1.2 + i * 0.4; b.ico("#dfe8ec", 0.025, 1, [0.12 + Math.cos(a) * 0.02, 0.58, Math.sin(a) * 0.17]); }
    b.add(new THREE.ConeGeometry(0.035, 0.2, 6), "#1c1c1c", mat([0.37, 0.7, 0], [0, 0, -1.75]));
    for (const s of [1, -1]) b.ico(wing, 0.21, 2, [-0.06, 0.43, s * 0.2], [1.3, 0.8, 0.35], [0, 0, -0.5]);
    b.add(new THREE.BoxGeometry(0.36, 0.04, 0.14), wing, mat([-0.36, 0.18, 0], [0, 0, 0.8]));
    eye(0.24, 0.74, 0.11, 0.04);
    for (const s of [1, -1]) b.cyl("#3a3a3a", 0.02, 0.02, 0.12, 5, [0.02, 0.06, s * 0.07]);
  } else {
    const body = "#7a6452", belly = "#e8c99a", wing = "#5f4c3e";
    b.ico(body, 0.17, 3, [0, 0.28, 0], [1.1, 1.05, 0.95], [0, 0, -0.25]);
    b.ico(belly, 0.13, 2, [0.07, 0.24, 0], [0.9, 1.05, 0.9]);
    b.ico("#4d3e33", 0.13, 3, [0.1, 0.5, 0]);
    // white brow and throat
    for (const s of [1, -1]) b.ico("#ffffff", 0.05, 1, [0.14, 0.58, s * 0.075], [1.2, 0.4, 0.6], [0, 0, -0.3]);
    b.ico("#ffffff", 0.05, 1, [0.2, 0.42, 0], [0.6, 0.8, 1.2]);
    b.add(new THREE.ConeGeometry(0.022, 0.08, 5), "#2a2420", mat([0.24, 0.5, 0], [0, 0, -1.6]));
    for (const s of [1, -1]) b.ico(wing, 0.13, 2, [-0.03, 0.31, s * 0.13], [1.3, 0.8, 0.35], [0, 0, -0.4]);
    // the fanned tail: a half-fan of feathers with white edges
    const fan = new THREE.Group();
    const fb = new GeoBatch(0);
    for (let i = 0; i < 9; i++) {
      const a = -0.9 + i * 0.225;
      fb.add(new THREE.BoxGeometry(0.34, 0.012, 0.07).translate(0.17, 0, 0), i % 2 ? "#5f4c3e" : "#6f5a48", mat([0, 0, 0], [a, 0, 0]));
      fb.add(new THREE.BoxGeometry(0.06, 0.014, 0.075).translate(0.33, 0, 0), "#f4efe6", mat([0, 0, 0], [a, 0, 0]));
    }
    // rotate so the fan opens upward-back behind the bird
    const fm = mesh(mats, fb.build()!, "world", { outline: 0 });
    fm.rotation.set(Math.PI / 2, 0, Math.PI - 0.5);
    fan.add(fm);
    fan.position.set(-0.12, 0.26, 0);
    root.add(fan);
    eye(0.16, 0.53, 0.085, 0.03);
    for (const s of [1, -1]) b.cyl("#3a3a3a", 0.015, 0.015, 0.12, 5, [0.02, 0.06, s * 0.05]);
  }
  const m = mesh(mats, b.build()!, "wool", { outline: 0 });
  root.add(m);
  root.add(new THREE.Mesh(eyes.build()!, mats.unlit()));
  root.scale.setScalar(scale * (id === "piwakawaka" ? 1.35 : 1.25));
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return root;
}
