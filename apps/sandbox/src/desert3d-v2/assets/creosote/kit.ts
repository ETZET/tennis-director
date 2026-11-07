// 灌木小工具（creosote / brittlebush / tumbleweed 共用）：一团团球面法线的叶团、按材质合并成网格。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobNormals } from '../../toon';

export type Rnd = () => number;

/**
 * 一团叶子：扰动过的二十面体，压扁；法线从团心（略往下挪 → 亮顶更大）指向顶点。
 * 同一位置的顶点扰动一致（非索引几何体，否则裂缝）。
 */
export function blob(
  r: number,
  rnd: Rnd,
  opts: { detail?: number; squash?: number; jitter?: number; flatBottom?: number; lowC?: number } = {},
): THREE.BufferGeometry {
  const { detail = 1, squash = 0.85, jitter = 0.16, flatBottom = -1, lowC = 0.25 } = opts;
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('uv');
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const jit = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = jit.get(key);
    if (k === undefined) {
      k = 1 + (rnd() - 0.5) * jitter;
      jit.set(key, k);
    }
    p.setXYZ(i, v.x * k, Math.max(v.y * k * squash, flatBottom * r), v.z * k);
  }
  blobNormals(g, new THREE.Vector3(0, -r * lowC, 0));
  return g;
}

/** 花点：八面体（8 个三角形），≥ 2 纹素，球面法线 */
export function dot(r: number, rnd: Rnd, squash = 0.85): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(r * (0.9 + rnd() * 0.2), 0);
  g.deleteAttribute('uv');
  g.scale(1, squash, 1);
  g.rotateY(rnd() * Math.PI);
  return blobNormals(g, new THREE.Vector3(0, -r * 0.5, 0));
}

export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0): THREE.BufferGeometry {
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** 材质 → 几何体列表；最后每种材质合并成一个网格 */
export class Bucket {
  private m = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, g: THREE.BufferGeometry) {
    const l = this.m.get(mat) ?? [];
    l.push(g.index ? g.toNonIndexed() : g);
    this.m.set(mat, l);
  }
  build(into: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, gs] of this.m) {
      for (const g of gs) if (g.getAttribute('uv')) g.deleteAttribute('uv');
      const mesh = new THREE.Mesh(mergeGeometries(gs), mat);
      into.add(mesh);
      out.push(mesh);
    }
    return out;
  }
}

export function triCount(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  });
  return n;
}
