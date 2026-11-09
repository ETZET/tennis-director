// 前台三件（凉棚、L 形柜台、后柜）共用的几何小工具。所有几何体都转成非索引（position + normal + uv），可以直接合并。
// 单位米；本地原点 = 资产落地点（y 0 = 地面），+x 东、+z 南（朝镜头）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type G = THREE.BufferGeometry;
export type V3 = [number, number, number];

const flat = (g: G): G => (g.index ? g.toNonIndexed() : g);

/** 盒子：x0..x1 × y0..y1 × z0..z1 */
export function boxR(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): G {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return flat(g);
}

/** 盒子：中心 (x, z)、底 y0 */
export function box(w: number, h: number, d: number, x: number, y0: number, z: number): G {
  return boxR(x - w / 2, x + w / 2, y0, y0 + h, z - d / 2, z + d / 2);
}

/**
 * 四边形（两个三角形，平法线）：a → b → c → d 一圈；法线取 want 那一侧（顺序反了就自动翻过来）。
 * uv 按 a(0,0) b(1,0) c(1,1) d(0,1)。
 */
export function quad(a: V3, b: V3, c: V3, d: V3, want: V3): G {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const C = new THREE.Vector3(...c);
  const D = new THREE.Vector3(...d);
  const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(D, A));
  if (n.lengthSq() < 1e-12) n.subVectors(C, B).cross(new THREE.Vector3().subVectors(A, B));
  const flip = n.dot(new THREE.Vector3(...want)) < 0;
  n.normalize();
  if (flip) n.negate();
  const pts = flip ? [A, D, C, A, C, B] : [A, B, C, A, C, D];
  const uvs = flip ? [0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0] : [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      pts.flatMap((p) => [p.x, p.y, p.z]),
      3,
    ),
  );
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      pts.flatMap(() => [n.x, n.y, n.z]),
      3,
    ),
  );
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/** 合并（全部转非索引；空表返回空几何体） */
export function merge(gs: G[]): G {
  if (!gs.length) return new THREE.BufferGeometry();
  const m = mergeGeometries(gs.map(flat));
  if (!m) throw new Error('desk/kit merge: 属性不一致');
  return m;
}

/** 合并成一个网格 */
export function meshOf(gs: G[], mat: THREE.Material, name?: string): THREE.Mesh {
  const m = new THREE.Mesh(merge(gs), mat);
  if (name) m.name = name;
  return m;
}

/** 三角形数（验预算） */
export function triCount(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return Math.round(n);
}
