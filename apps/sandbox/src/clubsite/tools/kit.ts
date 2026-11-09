// 总监的工具（红土场的拖垫 / 扫线刷 / 水管卷盘，喷泉广场的捞网 / 保洁车）共用的小工具：
// 按材质收几何体再合并（一种材质一个网格）、两点之间的方杆、握点（grip）的约定、贴地 / 跟人走的水管管子。
// 只碰 three，不碰任何场景的 ctx / 调色板：材质由各资产自己 ctx.mat(...) 拿好传进来。
// 单位米，y 朝上，+z 朝镜头（南）。设计纹素 0.09 米；默认像素 1× 下屏幕上一纹素 0.045 米 →
// 细杆一律 ≥ 0.09 米（屏幕上稳定 2 纹素，不会在 1 和 2 之间闪成噪点）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

// ── 握点（给人物模块的 hold(obj, grip) 用）────────────────────────────

/**
 * 工具上手握的地方 —— 字段名和人物模块 `clubsite/people/hold.ts` 的 GripSpec 一样（at / axis / up / at2 / tip），
 * `holder.attach(obj)` 直接读 obj.userData.grip。坐标 = 资产根节点的本地坐标（米），**跟着当前状态走**
 * （各资产 setState 时会把 userData.grip 重算一遍，所以平放着、立着、挂着的都能直接拿起来）。
 * - `at`：主手（右手）拳头的中心。
 * - `axis`：从拳头指向"干活那头"的方向（刷头、网圈、喷口、拖垫、壶嘴）。
 * - `up`：工具的"上 / 正面"（和 axis 正交化）：刷头推的方向、网口朝的方向、枪身的顶。
 * - `at2`：双手工具第二只手（左手）的点；单手工具不给。
 * - `tip`：干活那头的点（刷头底边中点、网圈中心、喷口、壶嘴、拖垫的绳结）：演出（水雾、泡沫弧、扬土）从这里出。
 * - `pose`：建议的人物姿势名（人物模块自己决定用不用；hold.ts 不读它）。
 * 握点坐标系（`gripFrame`，同 hold.ts）：原点 at，−Y = axis，Z = up，X = Y × Z。
 */
export interface Grip {
  at: V3;
  axis: V3;
  up: V3;
  at2?: V3;
  tip?: V3;
  pose?: string;
}

/** 握点坐标系 → 资产本地的矩阵（同 hold.ts：原点 at，−Y = axis，Z = up 正交化，X = Y × Z） */
export function gripFrame(g: Grip): THREE.Matrix4 {
  const y = new THREE.Vector3(...g.axis).normalize().negate();
  const z0 = new THREE.Vector3(...g.up);
  const z = z0.sub(y.clone().multiplyScalar(z0.dot(y))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(...g.at);
}

/** 和 axis 垂直的 up：把 hint 投到 axis 的垂直面上 */
export function perpUp(axis: V3, hint: V3 = [0, 1, 0]): V3 {
  const a = new THREE.Vector3(...axis).normalize();
  const h = new THREE.Vector3(...hint);
  const u = h.sub(a.multiplyScalar(h.dot(a))).normalize();
  return [u.x, u.y, u.z];
}

export const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** 把一组点 / 向量从 m 变过去（握点跟着几何一起摆的时候用） */
export function xfGrip(g: Grip, m: THREE.Matrix4): Grip {
  const p = (v: V3) => {
    const t = new THREE.Vector3(...v).applyMatrix4(m);
    return [t.x, t.y, t.z] as V3;
  };
  const d = (v: V3) => {
    const t = new THREE.Vector3(...v).transformDirection(m);
    return [t.x, t.y, t.z] as V3;
  };
  return { ...g, at: p(g.at), axis: d(g.axis), up: d(g.up), at2: g.at2 && p(g.at2), tip: g.tip && p(g.tip) };
}

// ── 按材质收几何体 ───────────────────────────────────

/**
 * 按材质名收几何体，最后每种材质合并成一个网格（少 draw call）。
 * 所有几何体去掉 uv（工具上的元素都用 local / screen 坐标），保证能合并。
 */
export class Parts<K extends string> {
  private bags = new Map<K, THREE.BufferGeometry[]>();

  add(key: K, g: THREE.BufferGeometry): THREE.BufferGeometry {
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    const list = this.bags.get(key) ?? [];
    list.push(g);
    this.bags.set(key, list);
    return g;
  }

  /** 盒子：尺寸 w×h×d，中心 (x, y, z)，可选欧拉角 */
  box(key: K, w: number, h: number, d: number, x: number, y: number, z: number, rot?: V3): THREE.BufferGeometry {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
    g.translate(x, y, z);
    return this.add(key, g);
  }

  /** a → b 的方杆（截面 t×t，或 [宽, 厚]：宽沿 side 方向） */
  rod(key: K, a: V3, b: V3, t: number | [number, number], side?: V3): THREE.BufferGeometry {
    return this.add(key, rodGeo(a, b, t, side));
  }

  /** 圆柱：半径 r（可 [上, 下]），长 h，轴 'x'|'y'|'z'，中心 (x, y, z) */
  cyl(
    key: K,
    r: number | [number, number],
    h: number,
    seg: number,
    axis: 'x' | 'y' | 'z',
    x: number,
    y: number,
    z: number,
  ): THREE.BufferGeometry {
    const [rt, rb] = typeof r === 'number' ? [r, r] : r;
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (axis === 'x') g.rotateZ(-Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    return this.add(key, g);
  }

  has(key: K): boolean {
    return (this.bags.get(key)?.length ?? 0) > 0;
  }

  /** 合并：每种材质一个网格，挂在一个 Group 上 */
  build(mat: (k: K) => THREE.Material, name = 'tool'): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    for (const [k, list] of this.bags) {
      if (!list.length) continue;
      const merged = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
      const m = new THREE.Mesh(merged, mat(k));
      m.name = `${name}:${k}`;
      g.add(m);
    }
    return g;
  }
}

/** a → b 的方杆几何体。截面的"宽"朝 side（不给 = 尽量让一面朝上 / 朝镜头，像素边干净） */
export function rodGeo(a: V3, b: V3, t: number | [number, number], side?: V3): THREE.BufferGeometry {
  const [tw, th] = typeof t === 'number' ? [t, t] : t;
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  dir.normalize();
  const g = new THREE.BoxGeometry(tw, len, th);
  // 本地 y = 杆的方向；x = 宽的方向：不给就取水平的垂线（一面朝上、一面朝镜头），竖杆取东西向
  let sx = side ? new THREE.Vector3(...side) : new THREE.Vector3(0, 1, 0).cross(dir);
  if (sx.lengthSq() < 1e-4) sx = new THREE.Vector3(1, 0, 0);
  sx.sub(dir.clone().multiplyScalar(sx.dot(dir))).normalize();
  const sz = new THREE.Vector3().crossVectors(sx, dir);
  const m = new THREE.Matrix4().makeBasis(sx, dir, sz);
  m.setPosition(A.clone().add(B).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return g;
}

// ── 管子（水管）─────────────────────────────────────

/**
 * 圆滑一条折线：向心 Catmull-Rom，按 step 米重新取样。点可以带高度（[x, y, z]）。
 */
export function smoothPath(pts: THREE.Vector3[], step = 0.25): THREE.Vector3[] {
  if (pts.length < 2) return pts.map((p) => p.clone());
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n);
}

/**
 * 六棱的管子，几何体按上限预先分配，`set(points)` 只改顶点（不重建网格）—— 跟着人走的水管每帧调也便宜。
 * 截面 6 个顶点、平滑法线：俯角 45° 下读成"顶亮、朝镜头一侧中档、底下暗"的一根圆管。
 */
export class Tube {
  readonly mesh: THREE.Mesh;
  private readonly pos: THREE.BufferAttribute;
  private readonly nrm: THREE.BufferAttribute;
  private readonly sides = 6;
  readonly maxPts: number;
  /** 当前管子的长度（米，沿中心线） */
  length = 0;

  constructor(
    mat: THREE.Material,
    readonly radius: number,
    maxPts = 120,
  ) {
    this.maxPts = maxPts;
    const S = this.sides;
    const vtx = maxPts * S;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(vtx * 3), 3);
    this.nrm = new THREE.BufferAttribute(new Float32Array(vtx * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.nrm.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('normal', this.nrm);
    const idx: number[] = [];
    for (let i = 0; i + 1 < maxPts; i++)
      for (let s = 0; s < S; s++) {
        const a = i * S + s;
        const b = i * S + ((s + 1) % S);
        const c = a + S;
        const d = b + S;
        idx.push(a, c, b, b, c, d);
      }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
  }

  /** 沿中心线 pts（已经圆滑 / 取样好的点）铺管子；超过上限的点丢掉 */
  set(pts: THREE.Vector3[]): void {
    const S = this.sides;
    const n = Math.min(pts.length, this.maxPts);
    const g = this.mesh.geometry;
    if (n < 2) {
      g.setDrawRange(0, 0);
      this.length = 0;
      return;
    }
    const up = new THREE.Vector3(0, 1, 0);
    let side = new THREE.Vector3(1, 0, 0);
    const t = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    let len = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      t.subVectors(b, a).normalize();
      if (i > 0) len += p.distanceTo(pts[i - 1]);
      // 截面：side 水平（贴地时一条棱朝上），立起来的段沿用上一段的 side（不翻转）
      const s2 = new THREE.Vector3().crossVectors(t, up);
      if (s2.lengthSq() > 1e-4) side = s2.normalize();
      const u = new THREE.Vector3().crossVectors(side, t).normalize();
      for (let s = 0; s < S; s++) {
        const ang = (s / S) * Math.PI * 2 + Math.PI / 2;
        nrm.copy(u).multiplyScalar(Math.sin(ang)).addScaledVector(side, Math.cos(ang));
        const k = i * S + s;
        this.pos.setXYZ(k, p.x + nrm.x * this.radius, p.y + nrm.y * this.radius, p.z + nrm.z * this.radius);
        this.nrm.setXYZ(k, nrm.x, nrm.y, nrm.z);
      }
    }
    this.pos.needsUpdate = true;
    this.nrm.needsUpdate = true;
    g.setDrawRange(0, (n - 1) * S * 6);
    g.computeBoundingSphere();
    this.length = len;
  }
}
