// Shared marker meshes floating above sheep (heart, star, cloud, rosette) and
// the selection ring on the ground.
import * as THREE from "three";
import { GeoBatch } from "./builder.js";

export type MarkerKind = "planned" | "new" | "ill" | "rosette";

function heartShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.15, -0.3, -0.55, -0.1, -0.55, 0.18);
  s.bezierCurveTo(-0.55, 0.45, -0.2, 0.55, 0, 0.3);
  s.bezierCurveTo(0.2, 0.55, 0.55, 0.45, 0.55, 0.18);
  s.bezierCurveTo(0.55, -0.1, 0.15, -0.3, 0, -0.5);
  return s;
}

function starShape(): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 0.55 : 0.24;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

export class Markers {
  readonly geos: Record<MarkerKind, THREE.BufferGeometry>;
  readonly mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: "#3a3a3a" });
  readonly ringGeo = new THREE.RingGeometry(0.85, 1.12, 28).rotateX(-Math.PI / 2);
  readonly ringMat = new THREE.MeshBasicMaterial({ color: "#ffd257", transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  readonly sparkGeo = new THREE.OctahedronGeometry(0.1, 0);
  readonly sparkMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });

  constructor() {
    const ext = { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1, curveSegments: 6 };
    const heart = new GeoBatch().add(new THREE.ExtrudeGeometry(heartShape(), ext).translate(0, 0, -0.07), "#f2789f").build()!;
    const star = new GeoBatch().add(new THREE.ExtrudeGeometry(starShape(), ext).translate(0, 0, -0.07), "#ffcf3f").build()!;
    const cloud = new GeoBatch()
      .ico("#a7adb6", 0.26, 1, [0, 0.05, 0])
      .ico("#b6bcc4", 0.2, 1, [-0.26, -0.03, 0.02])
      .ico("#9da3ac", 0.2, 1, [0.26, -0.03, -0.02])
      .box("#7f93b0", [0.04, 0.14, 0.04], [-0.12, -0.3, 0])
      .box("#7f93b0", [0.04, 0.14, 0.04], [0.1, -0.34, 0])
      .build()!;
    const rb = new GeoBatch();
    rb.cyl("#4f86dc", 0.36, 0.36, 0.08, 14, [0, 0, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      rb.box("#6d9ce6", [0.14, 0.1, 0.06], [Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0], [0, 0, a]);
    }
    rb.cyl("#ffd257", 0.18, 0.18, 0.12, 12, [0, 0, 0.02], [Math.PI / 2, 0, 0]);
    rb.box("#3f73c6", [0.14, 0.42, 0.04], [-0.1, -0.5, -0.02], [0, 0, -0.25]);
    rb.box("#3f73c6", [0.14, 0.42, 0.04], [0.1, -0.5, -0.02], [0, 0, 0.25]);
    const rosette = rb.build()!;
    this.geos = { planned: heart, new: star, ill: cloud, rosette };
  }

  make(kind: MarkerKind): THREE.Mesh {
    const m = new THREE.Mesh(this.geos[kind], this.mat);
    m.scale.setScalar(0.66);
    return m;
  }

  dispose(): void {
    for (const g of Object.values(this.geos)) g.dispose();
    this.mat.dispose();
    this.ringGeo.dispose();
    this.ringMat.dispose();
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
  }
}
