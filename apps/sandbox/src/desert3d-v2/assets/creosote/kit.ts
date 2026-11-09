// 灌木小工具（creosote / brittlebush / tumbleweed 共用）：一团团球面法线的叶团、按材质合并成网格；
// 材质规范 v2 的池塘第四轮灌木做法（docs/lab/2026-11-07-3d-pixel/material-spec.md「第四轮」）：
// 整丛一个圆顶（domeify）、下三分之一暗档 + 底沿更暗（markRim）、脚下一块暗档团影（contactDisc）、花成簇（flowerCluster）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Tones } from '../../toon';
import { blobNormals } from '../../toon';

export type Rnd = () => number;
type Hex = number;

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

/**
 * 一簇花（规范：花成簇、有形状，不撒单点）：n 个花点挤成一个小扁团（中间一个、外圈 n−1 个），
 * 法线从簇心下方一起算 → 整簇一个亮顶、朝镜头的下沿一行中档（橙），屏幕上是 3～4 × 2 纹素的一个形状。
 */
export function flowerCluster(rnd: Rnd, n: number, r: number, spread: number, squash = 0.7): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const a0 = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / Math.max(n - 1, 1)) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
    const d = i === 0 ? 0 : spread * (0.75 + rnd() * 0.35);
    const g = new THREE.OctahedronGeometry(r * (0.85 + rnd() * 0.3), 0);
    g.deleteAttribute('uv');
    g.scale(1, squash, 1);
    g.rotateY(rnd() * Math.PI);
    g.translate(Math.cos(a) * d, (i === 0 ? r * 0.35 : 0) + rnd() * r * 0.2, Math.sin(a) * d * 0.8);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const m = mergeGeometries(parts);
  return blobNormals(m, new THREE.Vector3(0, -r * 1.2, 0));
}

export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0): THREE.BufferGeometry {
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/**
 * 明暗用的光（世界坐标）：main.ts 默认太阳（仰角 50°、偏东 22°）和"正上方偏镜头"按 lightUp 混 —— 和 toon.ts 里的 Ld 一样。
 * 只用来给几何体分"底沿"网格（太阳变了底沿也还是朝下那一圈，差不多）。
 */
export function shadeLight(lightUp: number): THREE.Vector3 {
  const el = (50 * Math.PI) / 180;
  const az = (22 * Math.PI) / 180;
  const sun = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  return sun.lerp(new THREE.Vector3(0, 1, 0.35).normalize(), lightUp).normalize();
}

/**
 * 池塘第四轮：整丛一个圆顶。几团叶子（非索引、带团法线）绕 (cx, base, cz) 横向拉宽、竖向压扁，
 * 每个顶点的法线 = 团自己的球面法线 × (1 − k) + 整丛椭球法线 × k（k 0.55）：顶上亮、中腰中档、下三分之一暗，
 * 而不是每一团都有自己的亮顶（像一摞球）。
 */
export function domeify(
  parts: THREE.BufferGeometry[],
  o: {
    cx: number;
    cz: number;
    /** 拉伸的底（地面或冠底） */
    base: number;
    /** 椭球法线的中心高度 */
    cy: number;
    stretch?: [number, number, number];
    /** 椭球法线的半轴比例（x, y, z） */
    ell?: [number, number, number];
    k?: number;
  },
): void {
  const [sx, sy, sz] = o.stretch ?? [1.18, 0.88, 1.05];
  const [ex, ey, ez] = o.ell ?? [1.1, 0.85, 1.0];
  const k = o.k ?? 0.55;
  const dn = new THREE.Vector3();
  const bn = new THREE.Vector3();
  for (const g of parts) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const nr = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = o.cx + (p.getX(i) - o.cx) * sx;
      const y = o.base + (p.getY(i) - o.base) * sy;
      const z = o.cz + (p.getZ(i) - o.cz) * sz;
      p.setXYZ(i, x, y, z);
      dn.set((x - o.cx) / ex, (y - o.cy) / ey, (z - o.cz) / ez).normalize();
      bn.fromBufferAttribute(nr, i);
      dn.multiplyScalar(k)
        .addScaledVector(bn, 1 - k)
        .normalize();
      nr.setXYZ(i, dn.x, dn.y, dn.z);
    }
    p.needsUpdate = true;
    nr.needsUpdate = true;
  }
}

/**
 * 底沿：三个顶点的 l = dot(N, L) 都低于 thr 的三角形，顶点色压到 k（≈ 0.8：暗档 → 底沿暗边，规范允许的近白明暗），
 * 其余 1。池塘是 shader 里 `l < 暗档阈值 − 0.45` 换色；这里按三角形分（细分 2 的叶团三角形 ≈ 1 纹素，边界本来就是毛的），
 * 和叶冠同一个网格（不多一个 draw call）。材质要开 vertexColors。
 */
export function markRim(g: THREE.BufferGeometry, L: THREE.Vector3, thr: number, k = 0.8): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const n = src.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(n.count * 3).fill(1);
  const v = new THREE.Vector3();
  for (let t = 0; t < n.count; t += 3) {
    let mx = -9;
    for (let j = 0; j < 3; j++) mx = Math.max(mx, v.fromBufferAttribute(n, t + j).dot(L));
    if (mx < thr) col.fill(k, t * 3, t * 3 + 9);
  }
  src.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return src;
}

/** 从上往下打一条射线，找几何体（叶冠）在 (x, z) 处的顶面高度：花簇要贴在冠面上，不浮也不埋 */
export function surfaceY(parts: THREE.BufferGeometry[], x: number, z: number): number | null {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
  const tmp = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  let best: number | null = null;
  for (const g of parts) {
    const hit = ray.intersectObject(new THREE.Mesh(g, tmp), false)[0];
    if (hit && (best === null || hit.point.y > best)) best = hit.point.y;
  }
  tmp.dispose();
  return best;
}

/**
 * 脚下的团影（池塘第四轮）：贴地的椭圆，比灌木宽一圈、往画面下方（南）多露 3～4 纹素。
 * 材质用地面那套暗档（ctx.mat('sand', { bands: [9, 9] … })），和投影接得上。
 */
export function contactDisc(rx: number, rz: number, x: number, z: number, y = 0.014): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(1, 22);
  g.deleteAttribute('uv');
  g.rotateX(-Math.PI / 2);
  g.scale(rx, 1, rz);
  g.translate(x, y, z);
  return g;
}

/**
 * 元素调色板的简写：每档 [本色, 高一级, 低一级] + 三档的缝色、亮边色（顺序 [亮, 中, 暗]，跟 palette 的 tn 一样）。
 * 用 `blades` 的灌木/仙人掌：亮边色 = 竖向笔触（毛、刺）的颜色。
 */
export function tones(
  lit: [Hex, Hex, Hex],
  mid: [Hex, Hex, Hex],
  dark: [Hex, Hex, Hex],
  seam: [Hex, Hex, Hex],
  hi: [Hex, Hex, Hex],
): Tones {
  return { bands: [lit, mid, dark], seam, hi };
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
