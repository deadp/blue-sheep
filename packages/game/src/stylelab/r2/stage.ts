// Style lab round 2: shared renderer helpers (camera framing, projection, map render).
import * as THREE from "three";
import { makeStage, Mats } from "../render.js";
import { DIRECTIONS, type Direction } from "../styles.js";
import { CONCEPTS, type ConceptId } from "./concepts.js";
import { buildMap, type MapWorld } from "./map.js";
import type { Stage } from "./types.js";
import type { LabSheep } from "../sheep.js";

export const W = 1280, H = 800;
const CAM_DIR = new THREE.Vector3(1, 0.98, 1).normalize();
export const MISTY: Direction = { ...DIRECTIONS.C, fog: false };

export function frame(cam: THREE.OrthographicCamera, target: THREE.Vector3, halfW: number, w = W, h = H) {
  cam.left = -halfW; cam.right = halfW; cam.top = halfW * (h / w); cam.bottom = -halfW * (h / w);
  cam.near = 1; cam.far = 500;
  cam.position.copy(target).addScaledVector(CAM_DIR, 160);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

export function project(cam: THREE.Camera, p: THREE.Vector3, w = W, h = H): { x: number; y: number } {
  const v = p.clone().project(cam);
  return { x: Math.round(((v.x + 1) / 2) * w), y: Math.round(((1 - v.y) / 2) * h) };
}

/** Render a concept at a stage into #world and return the camera + world for tagging. */
export function renderMap(id: ConceptId, stage: Stage, view?: { u: number; v: number; halfW: number }) {
  const c = CONCEPTS[id];
  const canvas = document.getElementById("world") as HTMLCanvasElement;
  const st = makeStage(MISTY, canvas, W, H, true);
  const mats = new Mats(MISTY);
  const world: MapWorld = buildMap(MISTY, mats, c, stage, { close: !!view && view.halfW < 40, sheepScale: view && view.halfW < 40 ? 1.7 : 2.1 });
  st.scene.add(world.root);
  world.root.updateMatrixWorld(true);
  const cam = new THREE.OrthographicCamera();
  const vw = view ?? c.view;
  const target = world.toWorld(vw.u, vw.v, world.ground(vw.u, vw.v));
  frame(cam, target, vw.halfW);
  st.sun.target.position.copy(target);
  st.sun.position.copy(target).add(new THREE.Vector3(...MISTY.sun.dir).multiplyScalar(80));
  st.renderer.render(st.scene, cam);
  return { c, cam, world };
}


export type Builder = (m: Mats, s: LabSheep, scale?: number) => THREE.Group;

export function portraits(build: Builder, list: LabSheep[], w: number, h: number, zoom = 1, zoomLamb = zoom): string[] {
  const canvas = document.createElement("canvas");
  const st = makeStage(MISTY, canvas, w, h, true);
  st.sun.castShadow = false;
  const mats = new Mats(MISTY);
  const cam = new THREE.PerspectiveCamera(24, w / h, 0.1, 50);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.14 }));
  shadow.scale.set(1.3, 1, 0.75);
  shadow.position.y = 0.01;
  st.scene.add(shadow);
  const out: string[] = [];
  for (const s of list) {
    const g = build(mats, s);
    g.rotation.y = -0.35;
    st.scene.add(g);
    const t = new THREE.Vector3(0.1, s.lamb ? 0.5 : 0.62, 0);
    cam.position.set(t.x + 3.0, t.y + 1.05, t.z + 3.6).multiplyScalar(s.lamb ? zoomLamb : zoom);
    cam.lookAt(t);
    st.renderer.render(st.scene, cam);
    out.push(canvas.toDataURL("image/png"));
    st.scene.remove(g);
  }
  st.renderer.dispose();
  st.renderer.forceContextLoss();
  return out;
}

