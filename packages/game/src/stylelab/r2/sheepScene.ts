// Style lab round 2: the round-1 chibi (option C) next to the more natural sheep, close up in five
// v3 colours and at the two farm zooms (map overview and HUD), same light and scale.
import * as THREE from "three";
import type { ColourInput } from "@blue-sheep/genetics";
import { GeoBatch } from "../../world3d/builder.js";
import { makeStage, Mats } from "../render.js";
import { buildSheep, hexOf, type LabSheep } from "../sheep.js";
import { fenceLine, type Kit } from "../valley.js";
import { mulberry32 } from "../../world3d/rng.js";
import { buildSheep2 } from "./sheep2.js";
import { frame, MISTY, portraits, type Builder } from "./stage.js";

const col = (red: number, yellow: number, blue: number, dilute = false, white = false): ColourInput => ({ white, red, yellow, blue, dilute, depth: 1 });
const FIVE: [string, string, ColourInput, boolean?][] = [
  ["Pikelet", "pastel pink", col(4, 0, 0, true)],
  ["Bluey", "true blue", { ...col(0, 0, 4), depth: 1.05 }, true],
  ["Pickle", "olive", col(1, 3, 2)],
  ["Lavender", "lilac", col(3, 0, 3, true)],
  ["Scone", "white", col(0, 0, 0, false, true)],
];
/** A little paddock at a given zoom (world units per half-width), rendered to an image. */
function paddock(build: Builder, halfW: number, w: number, h: number, scale: number): string {
  const canvas = document.createElement("canvas");
  const st = makeStage(MISTY, canvas, w, h, true);
  const mats = new Mats(MISTY);
  const root = new THREE.Group();
  root.rotation.y = Math.PI / 4;
  st.scene.add(root);
  const P = MISTY.palette;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: P.grass2, roughness: 1 }));
  ground.receiveShadow = true;
  root.add(ground);
  const k: Kit = { dir: MISTY, mats, rng: mulberry32(3), ground: () => 0, add: (o) => root.add(o) };
  const fb = new GeoBatch(0);
  const R = halfW * 0.62;
  fenceLine(k, fb, [-R, -R * 0.55], [R, -R * 0.55], 2.4);
  fenceLine(k, fb, [-R, R * 0.55], [R, R * 0.55], 2.4);
  const fm = new THREE.Mesh(fb.build()!, mats.surface("world"));
  fm.castShadow = true;
  root.add(fm);
  const rng = mulberry32(11);
  const spots: [number, number][] = [[-0.55, 0.1], [-0.3, -0.25], [-0.05, 0.2], [0.2, -0.15], [0.45, 0.15], [0.7, -0.2], [-0.8, -0.2], [0.05, -0.35]];
  spots.forEach(([x, y], i) => {
    const f = FIVE[i % 5]!;
    const g = build(mats, { name: f[0] + i, colour: f[2], horns: !!f[3], lamb: i === 7 }, scale);
    g.position.set(x * R, 0, -y * R);
    g.rotation.y = -0.6 + rng() * 1.2 + (i % 2 ? Math.PI : 0);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    root.add(g);
  });
  root.updateMatrixWorld(true);
  const cam = new THREE.OrthographicCamera();
  frame(cam, new THREE.Vector3(0, 0.8, 0), halfW, w, h);
  st.sun.position.set(-30, 60, 40);
  st.renderer.render(st.scene, cam);
  const url = canvas.toDataURL("image/png");
  st.renderer.dispose();
  st.renderer.forceContextLoss();
  return url;
}

export async function sheepScene(): Promise<void> {
  document.body.classList.add("r2", "scene-sheep");
  await document.fonts.ready;
  const list: LabSheep[] = FIVE.map(([name, , colour, horns]) => ({ name, colour, horns: !!horns }));
  const chibi = portraits(buildSheep, list, 240, 200);
  const real = portraits(buildSheep2, list, 240, 200);
  const W = 624, H = 230;
  // pixel scale matches the map overview (1280 px ≈ 100 units) and the HUD (1280 px ≈ 60 units)
  const mapHalf = (W / 1280) * 50, hudHalf = (W / 1280) * 30;
  const pads = [paddock(buildSheep, mapHalf, W, H, 1.9), paddock(buildSheep2, mapHalf, W, H, 2.1), paddock(buildSheep, hudHalf, W, H, 1.5), paddock(buildSheep2, hudHalf, W, H, 1.7)];
  const row = (imgs: string[], title: string, sub: string) => `<div class="srow"><div class="shead"><h2>${title}</h2><small>${sub}</small></div>${imgs.map((src, i) => `<figure><img src="${src}" alt=""><figcaption><i style="background:${hexOf(FIVE[i]![2])}"></i>${FIVE[i]![1]}</figcaption></figure>`).join("")}</div>`;
  document.getElementById("app")!.innerHTML = `<main class="sheep-sheet">
    <h1>Sheep: round-1 chibi vs a more natural sheep</h1>
    ${row(chibi, "Round 1 (C)", "big head, toy body")}
    ${row(real, "Round 2", "smaller natural head, woolly barrel, slim legs")}
    <div class="farm"><div class="shead"><h2>Map zoom</h2><small>same pixel scale as the map</small></div><figure><img src="${pads[0]}"><figcaption>round 1</figcaption></figure><figure><img src="${pads[1]}"><figcaption>round 2</figcaption></figure></div>
    <div class="farm"><div class="shead"><h2>HUD zoom</h2><small>playing close-up</small></div><figure><img src="${pads[2]}"><figcaption>round 1</figcaption></figure><figure><img src="${pads[3]}"><figcaption>round 2</figcaption></figure></div>
  </main>`;
  requestAnimationFrame(() => { document.body.dataset.ready = "1"; });
}
