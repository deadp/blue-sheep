// Style lab: materials per direction and the inverted-hull ink outline.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Direction } from "./styles.js";

/** Re-index a merged, vertex-coloured geometry so it shades smoothly. */
export function smooth(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.deleteAttribute("normal");
  const g = mergeVertices(geo, 1e-4);
  g.computeVertexNormals();
  geo.dispose();
  return g;
}

/** Position-only, welded copy with smooth normals: the shell the outline pushes outwards. */
function hullGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", geo.getAttribute("position").clone());
  if (geo.index) g.setIndex(geo.index.clone());
  const w = mergeVertices(g, 1e-3);
  w.computeVertexNormals();
  g.dispose();
  return w;
}

export class Mats {
  readonly dir: Direction;
  private readonly cache = new Map<string, THREE.Material>();
  private gradient: THREE.DataTexture | null = null;

  constructor(dir: Direction) {
    this.dir = dir;
  }

  private toonRamp(): THREE.DataTexture {
    if (!this.gradient) {
      const data = new Uint8Array([120, 120, 120, 255, 255, 255, 255, 255]);
      const t = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat);
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.needsUpdate = true;
      this.gradient = t;
    }
    return this.gradient;
  }

  /** Vertex-coloured surface in this direction's shading. `kind` tunes gloss (e.g. "water", "clay"). */
  surface(kind: "world" | "terrain" | "water" | "wool" | "clay" | "skin" = "world"): THREE.Material {
    const key = kind;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const d = this.dir;
    const flat = d.flat && kind !== "water";
    let m: THREE.Material;
    switch (d.shading) {
      case "lambert":
        m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: flat });
        break;
      case "toon":
        m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: this.toonRamp() });
        break;
      case "standard":
        m = new THREE.MeshStandardMaterial({
          vertexColors: true, flatShading: false, metalness: 0,
          roughness: kind === "water" ? 0.25 : 0.95,
        });
        break;
      case "plastic": {
        const rough = kind === "water" ? 0.1 : kind === "clay" ? 0.62 : kind === "terrain" ? 0.5 : 0.35;
        m = new THREE.MeshPhysicalMaterial({
          vertexColors: true, metalness: 0, roughness: rough,
          clearcoat: kind === "clay" ? 0 : 0.45, clearcoatRoughness: 0.35,
          envMapIntensity: kind === "clay" ? 0.12 : 0.4,
        });
        break;
      }
    }
    if (kind === "water" && d.shading !== "toon") {
      (m as THREE.MeshStandardMaterial).transparent = d.shading === "plastic";
      (m as THREE.MeshStandardMaterial).opacity = d.shading === "plastic" ? 0.88 : 1;
    }
    this.cache.set(key, m);
    return m;
  }

  /** Unlit vertex colours (eyes, highlights). */
  unlit(): THREE.Material {
    const hit = this.cache.get("unlit");
    if (hit) return hit;
    const m = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.cache.set("unlit", m);
    return m;
  }

  private outlineMat(width: number): THREE.ShaderMaterial {
    const key = `outline:${width.toFixed(3)}`;
    const hit = this.cache.get(key) as THREE.ShaderMaterial | undefined;
    if (hit) return hit;
    const wobble = this.dir.id === "A" ? 0.55 : 0.12;
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { width: { value: width }, color: { value: new THREE.Color(this.dir.palette.ink) }, wobble: { value: wobble } },
      vertexShader: /* glsl */ `
        uniform float width;
        uniform float wobble;
        void main() {
          // hand-drawn line weight: vary the shell thickness a little per vertex
          float n = fract(sin(dot(floor(position * 7.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float w = width * (1.0 - wobble * 0.5 + wobble * n);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 nv = normalize(normalMatrix * normal);
          mv.xyz += nv * w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        void main() { gl_FragColor = vec4(color, 1.0); }`,
    });
    this.cache.set(key, m);
    return m;
  }

  /**
   * Give a mesh an ink outline (inverted hull) when the direction has one.
   * `scale` is the mesh's world scale, so the line keeps a constant screen weight.
   */
  outline(mesh: THREE.Mesh, scale = 1, weight = 1): void {
    if (this.dir.outline <= 0) return;
    const hull = new THREE.Mesh(hullGeometry(mesh.geometry), this.outlineMat((this.dir.outline * weight) / scale));
    hull.renderOrder = -1;
    hull.castShadow = false;
    mesh.add(hull);
  }
}

/** Mesh helper: vertex-coloured geometry in a surface material, with shadows and an outline. */
export function mesh(mats: Mats, geo: THREE.BufferGeometry, kind: Parameters<Mats["surface"]>[0] = "world", opts: { outline?: number; scale?: number; shadow?: boolean } = {}): THREE.Mesh {
  const d = mats.dir;
  const g = d.flat || kind === "water" ? geo : smooth(geo);
  const m = new THREE.Mesh(g, mats.surface(kind));
  m.castShadow = d.shadows && opts.shadow !== false;
  m.receiveShadow = d.shadows;
  if (opts.outline !== 0) mats.outline(m, opts.scale ?? 1, opts.outline ?? 1);
  return m;
}

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
}

/** Renderer, lights and environment for a direction. */
export function makeStage(dir: Direction, canvas: HTMLCanvasElement | null, w: number, h: number, transparent = false): Stage {
  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: transparent, preserveDrawingBuffer: true,
    ...(canvas ? { canvas } : {}),
  });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = dir.shading === "standard" || dir.shading === "plastic" ? THREE.NeutralToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = dir.exposure;
  renderer.shadowMap.enabled = dir.shadows;
  renderer.shadowMap.type = dir.shading === "toon" ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  if (transparent) renderer.setClearColor(0x000000, 0);
  else renderer.setClearColor(dir.palette.bg, 1);

  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(dir.hemi.sky, dir.hemi.ground, dir.hemi.intensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(dir.sun.color, dir.sun.intensity);
  const [sx, sy, sz] = dir.sun.dir;
  sun.position.set(sx * 60, sy * 60, sz * 60);
  sun.castShadow = dir.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 200;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = dir.id === "C" ? 6 : 2;
  scene.add(sun);
  scene.add(sun.target);
  if (dir.shading === "plastic") {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return { renderer, scene, sun };
}
