// 网、球、灯杆共用的小工具：最小的 ctx 结构类型（clubpickle、clubclay 和以后的球场场景的 AssetCtx 都能直接传进来）、
// 按材质合并几何体、能按"张力"重算位置的条带几何体。
// 单位米，y 朝上，+z 朝镜头（南），+x 朝东。设计纹素 0.09 米：横向一格 0.09，竖直面上一行 ≈ 0.127 米（俯角 45°）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Mats, ToonOpts } from '../../render/toon';

export type { ToonOpts };

/** 用到的调色板名字（clubpickle / clubclay 的 Pal 都有：desert3d-v2 的表一路继承下来） */
export type NetKey = 'net' | 'netTape' | 'metal' | 'ironwork' | 'clothWhite' | 'ball' | 'toolOrange' | 'concrete';

/** 各场景 AssetCtx 的公共部分 */
export interface NetCtx {
  mats: Mats;
  pal: object;
  mat(key: NetKey, extra?: ToonOpts): THREE.MeshToonMaterial;
  rng(stream: string): () => number;
  variant: number;
  params?: URLSearchParams;
}

/** 设计纹素（米） */
export const DU = 0.09;

/**
 * 朝镜头的竖直小面（网柱、灯杆、绞盘）：太阳在画面后方，朝南的面本来全落暗档 → 光往上偏、档位放宽，落中档；
 * 小件不接投影（规范：小道具 noShadowReceive）。
 */
export const FACING: ToonOpts = { lightUp: 0.55, bands: [-0.35, 0.45], noShadowReceive: true };

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 轴对齐的盒子：底面中心 (x, y, z) */
export function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

/** 同一个材质的几何体合并成一个网格（只留 position / normal / uv） */
export class Bucket {
  private m = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  add(mat: THREE.Material, g: THREE.BufferGeometry, cast = true) {
    let e = this.m.get(mat);
    if (!e) {
      e = { geos: [], cast };
      this.m.set(mat, e);
    }
    const n = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(n.attributes))
      if (a !== 'position' && a !== 'normal' && a !== 'uv') n.deleteAttribute(a);
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    if (!n.getAttribute('uv'))
      n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.getAttribute('position').count * 2), 2));
    e.geos.push(n);
  }
  build(mats: Mats, root: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, e] of this.m) {
      const mesh = new THREE.Mesh(mergeGeometries(e.geos), mat);
      root.add(mesh);
      mats.prepare(mesh, { cast: e.cast });
      out.push(mesh);
    }
    return out;
  }
}

/** 条带：两条导轨 a、b（点数相同）之间的四边形带；hint = 想要的法线大致方向（决定绕序） */
export interface Strip {
  a: THREE.Vector3[];
  b: THREE.Vector3[];
  hint: THREE.Vector3;
  /** 每个点的 uv（可选，米）：给网身的网眼暗示贴图用 */
  uvA?: [number, number][];
  uvB?: [number, number][];
}

/**
 * 把几条条带写进一个几何体（每条条带自己的顶点，法线只在条带内平滑）。
 * 拓扑（点数）不变时可以反复调用同一个几何体：只改 position / uv / index，再重算法线 —— 网绷紧、松开的插值就是这么做的。
 */
export function writeStrips(geo: THREE.BufferGeometry, strips: Strip[]): THREE.BufferGeometry {
  let nv = 0;
  for (const s of strips) nv += s.a.length * 2;
  let pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
  let uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!pos || pos.count !== nv) {
    pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
    uv = new THREE.BufferAttribute(new Float32Array(nv * 2), 2);
    pos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pos);
    geo.setAttribute('uv', uv);
  }
  const idx: number[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  let base = 0;
  for (const s of strips) {
    const n = s.a.length;
    for (let i = 0; i < n; i++) {
      pos.setXYZ(base + i * 2, s.a[i].x, s.a[i].y, s.a[i].z);
      pos.setXYZ(base + i * 2 + 1, s.b[i].x, s.b[i].y, s.b[i].z);
      const ua = s.uvA?.[i] ?? [0, 0];
      const ub = s.uvB?.[i] ?? [0, 0];
      uv?.setXY(base + i * 2, ua[0], ua[1]);
      uv?.setXY(base + i * 2 + 1, ub[0], ub[1]);
    }
    // 第一个四边形的法线和 hint 比，决定整条的绕序
    e1.subVectors(s.a[1], s.a[0]);
    e2.subVectors(s.b[0], s.a[0]);
    const flip = e1.cross(e2).dot(s.hint) < 0;
    for (let i = 0; i < n - 1; i++) {
      const a0 = base + i * 2;
      const b0 = a0 + 1;
      const a1 = a0 + 2;
      const b1 = a0 + 3;
      if (flip) idx.push(a0, b0, a1, a1, b0, b1);
      else idx.push(a0, a1, b0, a1, b1, b0);
    }
    base += n * 2;
  }
  geo.setIndex(idx);
  pos.needsUpdate = true;
  if (uv) uv.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/** 一个点数固定的多段线（便于插值） */
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
