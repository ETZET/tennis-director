// 广场生活小件（鸟、落叶、饮料车、饮水点）共用的几何小工具。
// 规矩：一个部件一种材质一个网格（合并几何体）；合并前统一成"非索引 + position/normal/uv(+color)"，不然 mergeGeometries 会拒绝。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 统一属性：非索引，只留 position / normal / uv（缺 uv 补 0），keepColor 时留（或补白的）color */
export function norm(g: THREE.BufferGeometry, keepColor = false): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  if (!n.getAttribute('uv'))
    n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.getAttribute('position').count * 2), 2));
  for (const k of Object.keys(n.attributes)) {
    if (k === 'position' || k === 'normal' || k === 'uv') continue;
    if (k === 'color' && keepColor) continue;
    n.deleteAttribute(k);
  }
  if (keepColor && !n.getAttribute('color')) tint(n, 1);
  return n;
}

/** 合并（全部先 norm）；空数组返回一个空几何体 */
export function merge(geos: THREE.BufferGeometry[], keepColor = false): THREE.BufferGeometry {
  if (geos.length === 0) return new THREE.BufferGeometry();
  const out = mergeGeometries(geos.map((g) => norm(g, keepColor)));
  if (!out) throw new Error('life/kit: mergeGeometries 失败');
  return out;
}

/** 整个几何体一个顶点色（接近白的明暗 0.82～1.0：元素自己的深浅，颜色还是来自三档） */
export function tint(g: THREE.BufferGeometry, k: number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3).fill(k);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** 盒子：中心 (x, y, z)，尺寸 w × h × d */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** 盒子：底面落在 y0（中心 x、z） */
export function boxOn(w: number, h: number, d: number, x: number, y0: number, z: number): THREE.BufferGeometry {
  return box(w, h, d, x, y0 + h / 2, z);
}

/** 竖圆柱：底面落在 y0 */
export function cyl(
  rTop: number,
  rBot: number,
  h: number,
  seg: number,
  x: number,
  y0: number,
  z: number,
): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBot, h, seg).translate(x, y0 + h / 2, z);
}

/** 法线改成从 c 指向顶点（一团一团的东西：鸟身子、头、饮料桶） */
export function roundNormals(g: THREE.BufferGeometry, c: THREE.Vector3): THREE.BufferGeometry {
  const n = norm(g);
  const p = n.getAttribute('position');
  const nn = n.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(c).normalize();
    nn.setXYZ(i, v.x, v.y, v.z);
  }
  nn.needsUpdate = true;
  return n;
}

/** 三角形列表 → 几何体（平面法线） */
export function tris(pts: THREE.Vector3[][]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const t of pts) for (const p of t) pos.push(p.x, p.y, p.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** 四边形（a b c d 逆时针，从法线那边看） → 两个三角形 */
export function quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): THREE.Vector3[][] {
  return [
    [a, b, c],
    [a, c, d],
  ];
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 网格 + 名字 */
export function mesh(g: THREE.BufferGeometry, m: THREE.Material, name?: string): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  if (name) o.name = name;
  return o;
}
