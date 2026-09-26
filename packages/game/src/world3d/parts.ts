// Flock-wide instanced legs, ears and eyes: three draw calls for every sheep's
// articulated parts, however big the flock.
import * as THREE from "three";
import { earMatrix, eyeMatrix, legMatrix, type SheepGeos, type SheepMaterials, type SheepPose, type SheepRig } from "./sheepMesh.js";

export interface PartsSource {
  geos: SheepGeos;
  rig: SheepRig;
  pose: SheepPose;
  faceColor: THREE.Color;
}

const _m = new THREE.Matrix4();
const _w = new THREE.Matrix4();

export class FlockParts {
  private legs: THREE.InstancedMesh;
  private ears: THREE.InstancedMesh;
  private eyes: THREE.InstancedMesh;
  private cap = 0;

  constructor(private readonly scene: THREE.Scene, private readonly mats: SheepMaterials, private readonly shadows: boolean) {
    this.legs = this.ears = this.eyes = null as unknown as THREE.InstancedMesh;
    this.grow(48);
  }

  private grow(n: number): void {
    if (this.cap) this.disposeMeshes();
    this.cap = n;
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, per: number, cast: boolean, tint = true) => {
      const m = new THREE.InstancedMesh(geo, mat, n * per);
      m.frustumCulled = false;
      m.castShadow = this.shadows && cast;
      m.count = 0;
      // allocate the colour buffer up front
      if (tint) m.setColorAt(0, new THREE.Color("#ffffff"));
      this.scene.add(m);
      return m;
    };
    this.legs = make(this.mats.legGeo, this.mats.part, 4, true);
    this.ears = make(this.mats.earGeo, this.mats.part, 2, false);
    this.eyes = make(this.mats.eyeGeo, this.mats.eye, 2, false, false);
  }

  /** Recompute every instance from the rigs' world matrices. Call after the rigs are posed. */
  update(list: PartsSource[]): void {
    if (list.length > this.cap) this.grow(Math.ceil(list.length * 1.5));
    let li = 0, ei = 0, yi = 0;
    for (const s of list) {
      const root = s.rig.root;
      root.updateMatrixWorld(true);
      const headW = s.rig.headPivot.matrixWorld;
      for (let i = 0; i < 4; i++) {
        _w.multiplyMatrices(root.matrixWorld, legMatrix(_m, s.geos, i, s.pose));
        this.legs.setMatrixAt(li, _w);
        this.legs.setColorAt(li++, s.faceColor);
      }
      for (let i = 0; i < 2; i++) {
        _w.multiplyMatrices(headW, earMatrix(_m, s.geos, i, s.pose));
        this.ears.setMatrixAt(ei, _w);
        this.ears.setColorAt(ei++, s.faceColor);
        _w.multiplyMatrices(headW, eyeMatrix(_m, s.geos, i, s.pose));
        this.eyes.setMatrixAt(yi++, _w);
      }
    }
    for (const [m, n] of [[this.legs, li], [this.ears, ei], [this.eyes, yi]] as const) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private disposeMeshes(): void {
    for (const m of [this.legs, this.ears, this.eyes]) {
      this.scene.remove(m);
      m.dispose();
    }
  }

  dispose(): void {
    this.disposeMeshes();
  }
}
