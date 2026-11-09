// 胖胖的低多边形石头：几种变体，按实例散布（InstancedMesh + instanceColor）。
import * as THREE from 'three';

/** 一块扰动过的二十面体，平面着色 */
export function rockGeometry(rnd: () => number, detail = 0, flat = 0.6): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  // 同一位置的顶点要一起动（非索引几何），按坐标做键
  const offs = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!offs.has(key)) offs.set(key, 0.72 + rnd() * 0.5);
    const k = offs.get(key)!;
    let y = pos.getY(i) * k * flat;
    // 底部压平，石头坐在地上
    if (y < -0.15) y = -0.15 - (y + 0.15) * 0.25;
    pos.setXYZ(i, pos.getX(i) * k, y, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

export interface RockSpec {
  x: number;
  y: number;
  z: number;
  s: number;
  rotY: number;
  color: THREE.Color;
  /** 竖直方向额外压扁 */
  sy?: number;
}

/** 把一批石头分到几个变体的 InstancedMesh 上 */
export function rockInstances(
  geos: THREE.BufferGeometry[],
  mat: THREE.Material,
  specs: RockSpec[],
): THREE.InstancedMesh[] {
  const buckets: RockSpec[][] = geos.map(() => []);
  specs.forEach((s, i) => {
    buckets[i % geos.length].push(s);
  });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const out: THREE.InstancedMesh[] = [];
  buckets.forEach((list, gi) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geos[gi], mat, list.length);
    list.forEach((s, i) => {
      e.set((s.rotY * 7) % 0.3, s.rotY, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.s, s.s * (s.sy ?? 1), s.s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, s.color);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    out.push(im);
  });
  return out;
}
