// 拉伸区的泡沫轴架：两块木侧板 + 三层搁板（贴在后沿，3 纹素深），横躺着的泡沫轴（紫 / 橙轮着），最上层少了两根 ——
// 那两根丢在架子前的地上（信号：没放回去 → 收起来）。0.99 × 1.08 × 0.47 米（11 × 12 × 5 设计纹素）。
// 泡沫轴：6 段圆柱，直径 0.22（2.4 纹素，躺着在屏幕上 ≈ 3.5 行），架上的长 0.38、地上的长 0.45。
// 三角形 ≈ 228（侧板 24 + 搁板 36 + 泡沫轴 7 × 24）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

/** 横躺的泡沫轴（轴沿 x，转 rotY），r 半径、len 长，底贴 y */
function roller(r: number, len: number, x: number, y: number, z: number, rotY = 0) {
  return new THREE.CylinderGeometry(r, r, len, 6, 1)
    .rotateZ(Math.PI / 2)
    .rotateY(rotY)
    .translate(x, y + r * 0.866, z);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) => g.add(new THREE.Mesh(mergeGeometries(gs), m));
  const W = 11 * T;
  const H = 12 * T;
  const D = 3 * T;
  const zc = -0.225 + D / 2; // 架子贴后沿
  // 侧板（1 纹素厚）+ 三层搁板（1 纹素厚：底、中、上）
  add(
    [box(T, H, D, -W / 2 + T / 2, 0, zc), box(T, H, D, W / 2 - T / 2, 0, zc)],
    ctx.mat('timber', { ...FACE, convex: 0.4 }),
  );
  const shelves = [0, 4 * T, 8 * T];
  add(
    shelves.map((y) => box(W - 2 * T, 0.5 * T, D, 0, y + T * 0.5, zc)),
    ctx.mat('wood', { ...FACE, convex: 0.5 }),
  );
  // 架上的泡沫轴：每层两根并排（底层、中层），上层只剩一根
  const R = 0.11;
  const purple: THREE.BufferGeometry[] = [];
  const orange: THREE.BufferGeometry[] = [];
  const lx = 2.3 * T;
  const onShelf = (y: number) => y + T;
  purple.push(roller(R, 0.38, -lx, onShelf(shelves[0]), zc), roller(R, 0.38, lx, onShelf(shelves[2]), zc));
  orange.push(roller(R, 0.38, lx, onShelf(shelves[0]), zc), roller(R, 0.38, -lx, onShelf(shelves[1]), zc));
  purple.push(roller(R, 0.38, lx, onShelf(shelves[1]), zc));
  // 地上的两根：架子前，一根稍斜
  purple.push(roller(R, 0.45, -1.8 * T, 0, 0.1, 0.12));
  orange.push(roller(R, 0.45, 2.6 * T, 0, 0.11, -0.1));
  const rl = { lightUp: 0.5, bands: [-0.5, 0.3] as [number, number], edge: 0.6, convex: 0.3, noShadowReceive: true };
  add(purple, ctx.mat('clothPurple', { ...rl, ramp: [0xb47cf4, 0x8452d4, 0x46308c] }));
  add(orange, ctx.mat('toolOrange', { ...rl, ramp: [0xffa040, 0xe0663a, 0x7a3456] }));
  ctx.mats.prepare(g);
  return g;
}
