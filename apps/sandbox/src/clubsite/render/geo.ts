// 几何工具（渲染核心 clubsite/render，各场景共用）：轮廓平滑、水平顶面、竖直墙、点在多边形里、方块 / 矩形面 / 圆环。
// 原来 topGeo / wallGeo / smoothLoop / smoothLine / insidePoly 在 clubfront/terrain.ts（从 desert3d-v2/terrain.ts 复制改的），
// quad / box / ring 在 clubmap/build.ts。单位米，y 朝上；V2 = [x, z]。
import * as THREE from 'three';
import type { Rect, V2 } from '../world';

/** 闭合折线按 Catmull-Rom 平滑重采样（间距约 step 米）+ 一点抖动 */
export function smoothLoop(pts: V2[], step: number, rnd: () => number, jitter = 0.05): V2[] {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  const n = Math.max(8, Math.round(curve.getLength() / step));
  return curve
    .getSpacedPoints(n)
    .slice(0, n)
    .map((p) => [p.x + (rnd() - 0.5) * jitter, p.z + (rnd() - 0.5) * jitter] as V2);
}

export function smoothLine(pts: V2[], step: number): V2[] {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
  );
  const n = Math.max(4, Math.round(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => [p.x, p.z] as V2);
}

const area = (pts: V2[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
};

/** 水平顶面（y = h），可带洞 */
export function topGeo(pts: V2[], h: number, holes: V2[][] = []): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, h, 0);
  g.deleteAttribute('uv');
  return g;
}

/**
 * 竖直墙：沿闭合轮廓从 h 到 hb；outward = 法线朝多边形外。
 * expo（可选）：按墙顶点 (x, z) 和朝外法线算"这段墙在画面上露出多高"（米），写进 aElem.x（矮墙规则用）
 */
export function wallGeo(
  pts: V2[],
  h: number,
  hb: number,
  outward: boolean,
  depth0 = 0,
  expo?: (x: number, z: number, nx: number, nz: number) => number,
): THREE.BufferGeometry {
  const ccw = area(pts) > 0;
  const n = pts.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const ex: number[] = [];
  const idx: number[] = [];
  const segN = (i: number): V2 => {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % n];
    const l = Math.hypot(x1 - x0, z1 - z0) || 1;
    let nx = (z1 - z0) / l;
    let nz = -(x1 - x0) / l;
    if (!ccw) [nx, nz] = [-nx, -nz];
    if (!outward) [nx, nz] = [-nx, -nz];
    return [nx, nz];
  };
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    const a = segN((i - 1 + n) % n);
    const b = segN(i % n);
    const nx = a[0] + b[0];
    const nz = a[1] + b[1];
    const l = Math.hypot(nx, nz) || 1;
    if (i > 0) {
      const q = pts[i - 1];
      s += Math.hypot(p[0] - q[0], p[1] - q[1]);
    }
    pos.push(p[0], h, p[1], p[0], hb, p[1]);
    nor.push(nx / l, 0, nz / l, nx / l, 0, nz / l);
    uv.push(s, depth0, s, depth0 + h - hb);
    if (expo) {
      const e = expo(p[0], p[1], nx / l, nz / l);
      ex.push(e, 0, 0, 0, e, 0, 0, 0);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    if (ccw === outward) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (expo) g.setAttribute('aElem', new THREE.Float32BufferAttribute(ex, 4));
  g.setIndex(idx);
  return g;
}

export function insidePoly(p: V2, poly: V2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** 水平矩形面（y 高） */
export const quad = (r: Rect, y: number) => {
  const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2);
  g.translate((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  return g;
};
/** 盒子：中心 x、z，底在 y */
export const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** 圆环墙（池沿）：外径、内径、高 */
export function ring(outer: number, inner: number, h: number): THREE.BufferGeometry {
  const shape = new THREE.Shape().absarc(0, 0, outer, 0, Math.PI * 2, false);
  shape.holes.push(new THREE.Path().absarc(0, 0, inner, 0, Math.PI * 2, true));
  return new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 20 }).rotateX(-Math.PI / 2);
}
