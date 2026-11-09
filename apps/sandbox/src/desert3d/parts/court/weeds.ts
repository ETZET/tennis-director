// 从裂缝里钻出来的杂草：实心的低多边形小丛（几片尖叶 + 一个小团），实例化。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function weedGeometry(rnd: () => number, blades: number, tall: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let b = 0; b < blades; b++) {
    const h = tall * (0.6 + rnd() * 0.5);
    const g = new THREE.ConeGeometry(0.085 + rnd() * 0.04, h, 4, 1, true).toNonIndexed();
    g.translate(0, h / 2, 0);
    const a = (b / blades) * Math.PI * 2 + rnd() * 0.6;
    const tilt = 0.35 + rnd() * 0.45;
    g.rotateZ(tilt);
    g.rotateY(a);
    g.translate(Math.cos(a) * 0.04, 0, -Math.sin(a) * 0.04);
    parts.push(g);
  }
  const core = new THREE.IcosahedronGeometry(0.13, 0);
  core.scale(1.2, 0.75, 1.2);
  core.translate(0, 0.06, 0);
  parts.push(core);
  for (const g of parts) {
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
  }
  const m = mergeGeometries(parts)!;
  m.computeVertexNormals();
  return m;
}

export interface WeedSpec {
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
  color: THREE.Color;
}

export function weedInstances(
  geos: THREE.BufferGeometry[],
  mat: THREE.Material,
  specs: WeedSpec[],
): THREE.InstancedMesh[] {
  const buckets: WeedSpec[][] = geos.map(() => []);
  specs.forEach((s, i) => {
    buckets[i % geos.length].push(s);
  });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const out: THREE.InstancedMesh[] = [];
  buckets.forEach((list, gi) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geos[gi], mat, list.length);
    list.forEach((s, i) => {
      q.setFromAxisAngle(up, s.rot);
      m4.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.s, s.s, s.s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, s.color);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    out.push(im);
  });
  return out;
}
