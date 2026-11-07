// 植物造型工具：把叶团（扰动的二十面体）、扫掠的枝干、扇叶等拼进一个带顶点色的非索引几何体。
// 所有造型在植物本地坐标里搭：根部在原点，y 朝上（风摆按本地 y 算，见 toon.ts）。
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Rnd = () => number;
export type V3 = THREE.Vector3;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** 颜色：十六进制 + 明度抖动 */
export function col(hex: number, rnd?: Rnd, vary = 0, hueVary = 0): THREE.Color {
  const c = new THREE.Color(hex);
  if (rnd && (vary || hueVary)) c.offsetHSL((rnd() * 2 - 1) * hueVary, 0, (rnd() * 2 - 1) * vary);
  return c;
}

/** 从调色板里挑一个 */
export function pick<T>(rnd: Rnd, xs: readonly T[]): T {
  return xs[Math.floor(rnd() * xs.length) % xs.length];
}

export const rr = (rnd: Rnd, a: number, b: number) => a + (b - a) * rnd();

/** 顶点缓冲：position / normal / color，非索引三角形 */
export class Mesher {
  p: number[] = [];
  n: number[] = [];
  c: number[] = [];

  v(p: V3, n: V3, c: THREE.Color) {
    this.p.push(p.x, p.y, p.z);
    this.n.push(n.x, n.y, n.z);
    this.c.push(c.r, c.g, c.b);
  }

  get tris() {
    return this.p.length / 9;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const icoCache = new Map<number, THREE.BufferGeometry>();
function ico(detail: number): THREE.BufferGeometry {
  let g = icoCache.get(detail);
  if (!g) {
    const raw = new THREE.IcosahedronGeometry(1, detail);
    raw.deleteAttribute('normal');
    raw.deleteAttribute('uv');
    g = mergeVertices(raw);
    icoCache.set(detail, g);
  }
  return g;
}

export interface BlobOpts {
  c: V3;
  /** 半径，或三个轴的半径 */
  r: number | V3;
  detail?: number;
  /** 半径随机扰动比例 */
  jitter?: number;
  color: THREE.Color;
  /** 树冠中心：法线朝它外面混（整团树冠读成一个体积，三档光分得清） */
  shade?: V3;
  mix?: number;
  /** 底部压暗（叶团内部的阴影感），0..1 */
  ao?: number;
  /** 绕 y 转（弧度） */
  rotY?: number;
  /** 任意朝向（先于 rotY） */
  q?: THREE.Quaternion;
  /** 底面压平到 c.y - r.y * flat（0 不压） */
  flat?: number;
}

/** 一团圆的低多边形叶团 */
export function blob(m: Mesher, rnd: Rnd, o: BlobOpts) {
  const base = ico(o.detail ?? 0);
  const pos = base.attributes.position;
  const idx = base.index!;
  const s = typeof o.r === 'number' ? v3(o.r, o.r, o.r) : o.r;
  const jit = o.jitter ?? 0.18;
  const mix = o.mix ?? 0.55;
  const ao = o.ao ?? 0.25;
  const rot = o.rotY ?? 0;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const P: V3[] = [];
  const N: V3[] = [];
  const C: THREE.Color[] = [];
  const u = v3();
  for (let i = 0; i < pos.count; i++) {
    u.fromBufferAttribute(pos, i).normalize();
    const k = 1 + (rnd() * 2 - 1) * jit;
    const lp = v3(u.x * s.x * k, u.y * s.y * k, u.z * s.z * k);
    if (o.flat !== undefined && lp.y < -s.y * o.flat) lp.y = -s.y * o.flat;
    const nl = v3(u.x / s.x, u.y / s.y, u.z / s.z).normalize();
    if (o.q) {
      lp.applyQuaternion(o.q);
      nl.applyQuaternion(o.q);
    }
    const p = v3(lp.x * cr + lp.z * sr, lp.y, -lp.x * sr + lp.z * cr).add(o.c);
    const n = v3(nl.x * cr + nl.z * sr, nl.y, -nl.x * sr + nl.z * cr);
    if (o.shade) n.lerp(p.clone().sub(o.shade).normalize(), mix).normalize();
    P.push(p);
    N.push(n);
    C.push(o.color.clone().multiplyScalar(1 - ao * Math.max(0, -u.y)));
  }
  for (let t = 0; t < idx.count; t++) {
    const i = idx.getX(t);
    m.v(P[i], N[i], C[i]);
  }
}

/**
 * 沿折线扫一根管（枝干、茎、仙人掌）。radii 和 pts 一一对应；color(t) 的 t 是沿长度 0..1。
 * 平行移动标架，不会扭。
 */
export function sweep(
  m: Mesher,
  pts: V3[],
  radii: number[],
  sides: number,
  color: THREE.Color | ((t: number, a: number) => THREE.Color),
  opts: { capEnd?: boolean; shade?: V3; mix?: number; flatten?: number } = {},
) {
  const n = pts.length;
  const T: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    T.push(b.clone().sub(a).normalize());
  }
  const ref = Math.abs(T[0].y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
  let U = v3().crossVectors(T[0], ref).normalize();
  const rings: { p: V3; n: V3 }[][] = [];
  let len = 0;
  const lens = [0];
  for (let i = 1; i < n; i++) lens.push((len += pts[i].distanceTo(pts[i - 1])));
  for (let i = 0; i < n; i++) {
    U = U.sub(T[i].clone().multiplyScalar(U.dot(T[i]))).normalize();
    const W = v3().crossVectors(T[i], U);
    const ring: { p: V3; n: V3 }[] = [];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const fl = opts.flatten ?? 1;
      const dir = U.clone()
        .multiplyScalar(Math.cos(a))
        .add(W.clone().multiplyScalar(Math.sin(a) * fl));
      const nn = U.clone()
        .multiplyScalar(Math.cos(a) * fl)
        .add(W.clone().multiplyScalar(Math.sin(a)))
        .normalize();
      const p = pts[i].clone().add(dir.multiplyScalar(radii[i]));
      if (opts.shade) nn.lerp(p.clone().sub(opts.shade).normalize(), opts.mix ?? 0.4).normalize();
      ring.push({ p, n: nn });
    }
    rings.push(ring);
  }
  const cf = typeof color === 'function' ? color : () => color;
  for (let i = 0; i < n - 1; i++) {
    const t0 = len ? lens[i] / len : 0;
    const t1 = len ? lens[i + 1] / len : 1;
    for (let j = 0; j < sides; j++) {
      const j1 = (j + 1) % sides;
      const a = rings[i][j];
      const b = rings[i][j1];
      const c = rings[i + 1][j1];
      const d = rings[i + 1][j];
      const ca = cf(t0, j / sides);
      const cb = cf(t0, j1 / sides);
      const cc = cf(t1, j1 / sides);
      const cd = cf(t1, j / sides);
      m.v(a.p, a.n, ca);
      m.v(b.p, b.n, cb);
      m.v(c.p, c.n, cc);
      m.v(a.p, a.n, ca);
      m.v(c.p, c.n, cc);
      m.v(d.p, d.n, cd);
    }
  }
  if (opts.capEnd && radii[n - 1] > 0) {
    const last = rings[n - 1];
    const tip = pts[n - 1];
    const cc = cf(1, 0);
    for (let j = 0; j < sides; j++) {
      const a = last[j];
      const b = last[(j + 1) % sides];
      m.v(a.p, T[n - 1], cc);
      m.v(b.p, T[n - 1], cc);
      m.v(tip, T[n - 1], cc);
    }
  }
}

/** 一条略弯的曲线：从 a 出发朝 dir，长 len，末端往 bend 方向弯 */
export function curve(a: V3, dir: V3, len: number, bend: V3, segs: number): V3[] {
  const pts: V3[] = [];
  const d = dir.clone().normalize();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(
      a
        .clone()
        .addScaledVector(d, len * t)
        .addScaledVector(bend, len * t * t),
    );
  }
  return pts;
}

/** 单个三角形（两面），法线给定 */
export function tri2(m: Mesher, a: V3, b: V3, c: V3, n: V3, ca: THREE.Color, cb = ca, cc = ca) {
  m.v(a, n, ca);
  m.v(b, n, cb);
  m.v(c, n, cc);
  m.v(a, n, ca);
  m.v(c, n, cc);
  m.v(b, n, cb);
}

/** 方向：方位角 az（绕 y，从 +x 起）、仰角 el */
export function dirAE(az: number, el: number): V3 {
  return v3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
}

/** 把一个几何体（索引或非索引，需有 position；没有 normal 就算）加进来，颜色按顶点给 */
export function addGeo(m: Mesher, g: THREE.BufferGeometry, color: (p: V3, n: V3) => THREE.Color) {
  if (!g.attributes.normal) g.computeVertexNormals();
  const ng = g.index ? g.toNonIndexed() : g;
  const P = ng.attributes.position;
  const N = ng.attributes.normal;
  for (let i = 0; i < P.count; i++) {
    const p = v3().fromBufferAttribute(P, i);
    const n = v3().fromBufferAttribute(N, i);
    m.v(p, n, color(p, n));
  }
}

/** 把 dir 偏离 angle 弧度（绕一个随机的垂直轴），并朝 out 方向偏一点 */
export function deflect(rnd: Rnd, dir: V3, angle: number, out?: V3, outK = 0.3): V3 {
  const r = v3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
  const axis = v3().crossVectors(dir, r).normalize();
  const d = dir.clone().applyAxisAngle(axis, angle);
  if (out && out.lengthSq() > 1e-6) d.addScaledVector(out.clone().setY(0).normalize(), outK);
  return d.normalize();
}

/** 一株植物按材质分几块（叶、枝、花……），每块一个 Mesher */
export class Parts {
  map = new Map<string, Mesher>();
  get(k: string): Mesher {
    let m = this.map.get(k);
    if (!m) this.map.set(k, (m = new Mesher()));
    return m;
  }
  get tris() {
    let t = 0;
    for (const m of this.map.values()) t += m.tris;
    return t;
  }
}

/** 接近白的明暗（配合 ramp 材质：顶点色只当明暗用） */
export function tone(rnd: Rnd, lo = 0.9, hi = 1): THREE.Color {
  const k = lo + (hi - lo) * rnd();
  return new THREE.Color(k, k, k);
}
