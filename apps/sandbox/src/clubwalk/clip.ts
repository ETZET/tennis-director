// 按区域的范围（xz 上的轴对齐矩形）切几何体：CPU 上把三角形裁到矩形里 / 矩形外（Sutherland–Hodgman，所有顶点属性线性插值）。
// 用在两处：区域的地形只留自己范围里的（邻居那块由邻居或底图画）；底图按"属于哪个区域 / 不属于任何区域"切开，区域建好时藏掉那一块。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rect } from '../clubsite/world';

/** 半平面：sign·(p[axis] − v) ≥ 0 留下 */
interface HP {
  axis: 0 | 2;
  sign: 1 | -1;
  v: number;
}

const inside = (r: Rect): HP[] => [
  { axis: 0, sign: 1, v: r.x0 },
  { axis: 0, sign: -1, v: r.x1 },
  { axis: 2, sign: 1, v: r.z0 },
  { axis: 2, sign: -1, v: r.z1 },
];
/** 矩形外 = 四块互不重叠的凸区域：西、东、（中间一条的）北、南 */
const outside = (r: Rect): HP[][] => [
  [{ axis: 0, sign: -1, v: r.x0 }],
  [{ axis: 0, sign: 1, v: r.x1 }],
  [
    { axis: 0, sign: 1, v: r.x0 },
    { axis: 0, sign: -1, v: r.x1 },
    { axis: 2, sign: -1, v: r.z0 },
  ],
  [
    { axis: 0, sign: 1, v: r.x0 },
    { axis: 0, sign: -1, v: r.x1 },
    { axis: 2, sign: 1, v: r.z1 },
  ],
];

interface Attr {
  name: string;
  size: number;
  src: ArrayLike<number>;
  out: number[];
}

/** 非索引几何体（世界坐标）→ 按 cls 把每个三角形分到 keep（整个留）/ drop（整个丢）/ clip（要裁） */
function clipGeo(g: THREE.BufferGeometry, regions: HP[][]): THREE.BufferGeometry | null {
  const pos = g.getAttribute('position');
  const names = Object.keys(g.attributes);
  const attrs: Attr[] = names.map((name) => {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    return { name, size: a.itemSize, src: a.array, out: [] };
  });
  const stride = attrs.reduce((s, a) => s + a.size, 0);
  const posOff = (() => {
    let o = 0;
    for (const a of attrs) {
      if (a.name === 'position') return o;
      o += a.size;
    }
    return 0;
  })();
  const vert = (i: number): number[] => {
    const v: number[] = [];
    for (const a of attrs) for (let k = 0; k < a.size; k++) v.push(a.src[i * a.size + k]);
    return v;
  };
  const emit = (v: number[]) => {
    let o = 0;
    for (const a of attrs) {
      for (let k = 0; k < a.size; k++) a.out.push(v[o + k]);
      o += a.size;
    }
  };
  const side = (v: number[], h: HP) => h.sign * (v[posOff + h.axis] - h.v);
  const n = pos.count;
  for (let t = 0; t + 2 < n; t += 3) {
    const tri = [vert(t), vert(t + 1), vert(t + 2)];
    for (const hps of regions) {
      let poly = tri;
      for (const h of hps) {
        if (!poly.length) break;
        const ds = poly.map((v) => side(v, h));
        if (ds.every((d) => d >= 0)) continue;
        if (ds.every((d) => d <= 0)) {
          poly = [];
          break;
        }
        const out: number[][] = [];
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i];
          const b = poly[(i + 1) % poly.length];
          const da = ds[i];
          const db = ds[(i + 1) % poly.length];
          if (da >= 0) out.push(a);
          if (da >= 0 !== db >= 0) {
            const k = da / (da - db);
            out.push(a.map((x, j) => x + (b[j] - x) * k));
          }
        }
        poly = out;
      }
      if (poly.length < 3) continue;
      for (let i = 1; i + 1 < poly.length; i++) {
        emit(poly[0]);
        emit(poly[i]);
        emit(poly[i + 1]);
      }
    }
  }
  if (!attrs[0].out.length) return null;
  const o = new THREE.BufferGeometry();
  for (const a of attrs) o.setAttribute(a.name, new THREE.Float32BufferAttribute(a.out, a.size));
  void stride;
  return o;
}

/** 几何体的 xz 包围盒和矩形的关系 */
function relation(g: THREE.BufferGeometry, r: Rect): 'in' | 'out' | 'cross' {
  g.computeBoundingBox();
  const b = g.boundingBox as THREE.Box3;
  if (b.min.x >= r.x0 && b.max.x <= r.x1 && b.min.z >= r.z0 && b.max.z <= r.z1) return 'in';
  if (b.max.x <= r.x0 || b.min.x >= r.x1 || b.max.z <= r.z0 || b.min.z >= r.z1) return 'out';
  return 'cross';
}

/** 世界坐标的几何体：留下 rects（互不重叠）里的部分 */
export function clipInside(g: THREE.BufferGeometry, rects: Rect[]): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const r of rects) {
    const rel = relation(g, r);
    if (rel === 'in') return g;
    if (rel === 'out') continue;
    const c = clipGeo(g, [inside(r)]);
    if (c) parts.push(c);
  }
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : mergeGeometries(parts);
}

/** 世界坐标的几何体：去掉 rects 里的部分 */
export function clipOutside(g: THREE.BufferGeometry, rects: Rect[]): THREE.BufferGeometry | null {
  let cur: THREE.BufferGeometry | null = g;
  for (const r of rects) {
    if (!cur) return null;
    const rel = relation(cur, r);
    if (rel === 'out') continue;
    if (rel === 'in') return null;
    cur = clipGeo(cur, outside(r));
  }
  return cur;
}

/**
 * 一个网格按矩形裁（只留 rects 里的 / 只留 rects 外的）：几何体先换到世界坐标裁，再换回本地。
 * 返回 false = 整个裁没了（调用的人把它拿掉）。实例化、蒙皮、多材质分组的不裁（按中心算）。
 */
export function clipMesh(mesh: THREE.Mesh, rects: Rect[], keep: 'in' | 'out'): boolean {
  const g0 = mesh.geometry as THREE.BufferGeometry;
  mesh.updateMatrixWorld(true);
  const center = new THREE.Vector3();
  const simple =
    !(mesh as THREE.InstancedMesh).isInstancedMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh && !g0.groups.length;
  if (!simple) {
    g0.computeBoundingBox();
    (g0.boundingBox as THREE.Box3).getCenter(center).applyMatrix4(mesh.matrixWorld);
    const inR = rects.some((r) => center.x >= r.x0 && center.x <= r.x1 && center.z >= r.z0 && center.z <= r.z1);
    return keep === 'in' ? inR : !inR;
  }
  const g = (g0.index ? g0.toNonIndexed() : g0.clone()).applyMatrix4(mesh.matrixWorld);
  const c = keep === 'in' ? clipInside(g, rects) : clipOutside(g, rects);
  if (!c) return false;
  if (c === g && keep === 'in') return true; // 整个在里面：不动
  const inv = mesh.matrixWorld.clone().invert();
  c.applyMatrix4(inv);
  c.computeBoundingSphere();
  mesh.geometry = c;
  return true;
}
