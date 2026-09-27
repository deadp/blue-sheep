// Style lab round 3: the farmer for the farmer's-eye option. Chunky and friendly to match the
// sheep: black gumboots, stubbies, a red-and-black check bush shirt, a wide felt hat, a crook.
// Faces +x, feet at y = 0, about 2.1 units tall (sheep are about 1.1).
import * as THREE from "three";
import { GeoBatch } from "../../world3d/builder.js";
import { mesh, type Mats } from "../render.js";

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

export function buildFarmer(mats: Mats): THREE.Group {
  const root = new THREE.Group();
  const b = new GeoBatch(0);
  const skin = "#e6b995", boot = "#2b302b", shorts = "#3d4a5c", hat = "#8a6a4a", band = "#5d4636";
  for (const z of [0.16, -0.16]) {
    b.cyl(boot, 0.12, 0.13, 0.55, 10, [0, 0.28, z]);
    b.ico(boot, 0.13, 2, [0.08, 0.08, z], [1.5, 0.6, 1]);
    b.cyl(skin, 0.085, 0.1, 0.32, 8, [0, 0.7, z]);
  }
  b.cyl(shorts, 0.3, 0.32, 0.34, 12, [0, 0.95, 0]);
  // arms (skin below rolled sleeves) and hands
  for (const z of [0.38, -0.38]) {
    b.cyl(skin, 0.07, 0.08, 0.42, 8, [0.02, 1.2, z], [z > 0 ? -0.12 : 0.12, 0, 0]);
    b.ico(skin, 0.08, 1, [0.04, 0.98, z * 1.04]);
  }
  // head, nose, ears, beard stubble shadow
  b.ico(skin, 0.24, 3, [0.02, 1.98, 0], [1, 1.05, 1]);
  b.ico("#d9a47e", 0.06, 1, [0.25, 1.95, 0]);
  for (const z of [0.23, -0.23]) b.ico(skin, 0.06, 1, [0, 1.97, z], [0.6, 1, 0.5]);
  b.ico("#7a5b44", 0.2, 2, [0.06, 1.86, 0], [0.9, 0.5, 1.02]);
  // hat
  b.cyl(hat, 0.5, 0.5, 0.04, 20, [0, 2.15, 0]);
  b.cyl(hat, 0.2, 0.25, 0.26, 14, [0, 2.3, 0]);
  b.cyl(band, 0.255, 0.255, 0.06, 14, [0, 2.2, 0]);
  const body = mesh(mats, b.build()!, "skin", { outline: 0 });
  root.add(body);
  // eyes
  const e = new GeoBatch(0);
  for (const z of [0.09, -0.09]) { e.ico("#2b1e19", 0.035, 1, [0.22, 2.02, z]); e.ico("#ffffff", 0.012, 1, [0.245, 2.035, z + 0.01]); }
  root.add(new THREE.Mesh(e.build()!, mats.unlit()));
  // check shirt with rolled sleeves
  const shirt = new GeoBatch(0);
  shirt.cyl("#ffffff", 0.3, 0.33, 0.62, 14, [0, 1.38, 0]);
  shirt.ico("#ffffff", 0.33, 2, [0, 1.66, 0], [1, 0.45, 1.05]);
  for (const z of [0.38, -0.38]) shirt.cyl("#ffffff", 0.1, 0.1, 0.28, 8, [0, 1.5, z * 0.96], [z > 0 ? -0.2 : 0.2, 0, 0]);
  const sg = shirt.build()!;
  // simple planar UVs for the check
  const p = sg.getAttribute("position");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i)) * 1.2; uv[i * 2 + 1] = p.getY(i) * 1.2; }
  sg.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: checkTexture(), roughness: 0.95 }));
  root.add(sm);
  // crook
  const c = new GeoBatch(0);
  c.cyl("#9a7b5a", 0.03, 0.03, 2.1, 6, [0.12, 1.05, 0.5]);
  const hook = new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI * 1.3);
  c.add(hook, "#9a7b5a", new THREE.Matrix4().makeTranslation(0.24, 2.1, 0.5));
  root.add(mesh(mats, c.build()!, "world", { outline: 0 }));
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return root;
}
