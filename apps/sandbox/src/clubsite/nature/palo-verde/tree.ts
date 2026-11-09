// 树的共用几何（palo-verde、smoke-tree 用）：叶团 = 一个扁椭球芯 + 一圈贴在上半面的小叶簇；
// 法线 = 团心法线和簇心法线混合 → 每团有清楚的亮顶/中腰/暗底，亮暗交界是一小团一小团的叶簇（不是竖条纹）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Tones } from '../../render/toon';

export type Rnd = () => number;
export type V3 = [number, number, number];

/** 材质规范 v2 的元素调色板：tn(亮, 中, 暗, 缝, 亮边)，每档 [本色, 高一级, 低一级]（同 palette.ts 的 tn） */
export const tn = (lit: V3, mid: V3, dark: V3, seam: V3, hi: V3): Tones => ({ bands: [lit, mid, dark], seam, hi });

/** 统一成非索引、只有 position + normal，才能合并 */
export function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  return n;
}

export function merge(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(gs.map(clean));
}

/** 扰动过的二十面体（同一位置扰动一致），返回未设法线的几何体 */
function lumpSphere(r: number, rnd: Rnd, detail: number, jit: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.getAttribute('position');
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) {
      k = 1 + (rnd() - 0.5) * jit;
      seen.set(key, k);
    }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  return g;
}

/** 法线 = normalize(a·(p − 团心)/半径² + b·(p − 簇心))：团的大明暗 + 簇的小起伏 */
function mixNormals(g: THREE.BufferGeometry, mass: V3, radii: V3, sub: V3 | null, wSub: number) {
  const p = g.getAttribute('position');
  const n = new Float32Array(p.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // 椭球的梯度方向（扁团顶部法线更朝上）
    a.set(
      (x - mass[0]) / (radii[0] * radii[0]),
      (y - mass[1]) / (radii[1] * radii[1]),
      (z - mass[2]) / (radii[2] * radii[2]),
    ).normalize();
    if (sub) {
      b.set(x - sub[0], y - sub[1], z - sub[2]).normalize();
      a.multiplyScalar(1 - wSub)
        .addScaledVector(b, wSub)
        .normalize();
    }
    n[i * 3] = a.x;
    n[i * 3 + 1] = a.y;
    n[i * 3 + 2] = a.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
}

export interface MassOpts {
  /** 团心 */
  c: V3;
  /** 椭球半径（x, y, z） */
  r: V3;
  /** 叶簇个数、簇半径（米） */
  clumps: number;
  clumpR: number;
  /** 簇法线权重（0.3～0.45） */
  wSub?: number;
  /** 簇只放在 y 方向 ≥ 这个值的方向上（-1 全身，0 上半） */
  minY?: number;
  /** 芯是否画（通透的团可以只用簇） */
  core?: boolean;
  /** 簇的二十面体细分（默认 1 = 80 三角形；很小的簇用 0） */
  detail?: number;
}

/** 一个叶团：返回 [叶几何, 每个簇的中心（用来挑开花的簇）] */
export function mass(
  rnd: Rnd,
  o: MassOpts,
): { geo: THREE.BufferGeometry[]; tops: { g: THREE.BufferGeometry; up: number }[] } {
  const out: THREE.BufferGeometry[] = [];
  const tops: { g: THREE.BufferGeometry; up: number }[] = [];
  const wSub = o.wSub ?? 0.38;
  if (o.core !== false) {
    const core = lumpSphere(1, rnd, 1, 0.12);
    core.scale(o.r[0] * 0.92, o.r[1] * 0.92, o.r[2] * 0.92);
    core.translate(o.c[0], o.c[1], o.c[2]);
    mixNormals(core, o.c, o.r, null, 0);
    out.push(core);
  }
  const minY = o.minY ?? -0.35;
  for (let i = 0; i < o.clumps; i++) {
    // 方向：黄金角螺旋 + 抖动，只取 y ≥ minY 的半球带
    const t = (i + 0.5) / o.clumps;
    const dy = 1 - t * (1 - minY);
    const ring = Math.sqrt(Math.max(0, 1 - dy * dy));
    const ang = i * 2.39996 + rnd() * 0.6;
    const d = new THREE.Vector3(Math.cos(ang) * ring, dy, Math.sin(ang) * ring);
    const sr = o.clumpR * (0.8 + rnd() * 0.4);
    const k = 0.78 + rnd() * 0.12;
    const sc: V3 = [o.c[0] + d.x * o.r[0] * k, o.c[1] + d.y * o.r[1] * k, o.c[2] + d.z * o.r[2] * k];
    const g = lumpSphere(sr, rnd, o.detail ?? 1, 0.14);
    g.scale(1, 0.82, 1);
    g.translate(sc[0], sc[1], sc[2]);
    mixNormals(g, o.c, o.r, sc, wSub);
    out.push(g);
    tops.push({ g, up: d.y });
  }
  return { geo: out, tops };
}

/** 一段枝：从 a 到 b 的锥台（r0 → r1），面数少，法线平滑 */
export function limb(a: V3, b: V3, r0: number, r1: number, sides = 6): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  g.translate(a[0], a[1], a[2]);
  return g;
}

/** 两个枝之间的圆疙瘩（盖住锥台接缝） */
export function knot(c: V3, r: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.translate(c[0], c[1], c[2]);
  mixNormals(g, c, [1, 1, 1], null, 0);
  return g;
}
