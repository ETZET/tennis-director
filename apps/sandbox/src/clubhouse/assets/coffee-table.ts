// 茶几（会员休息室，地毯中间、两张沙发之间）：西班牙式的木头搁架桌。1.3 × 0.42 × 0.7 米（14 × 5 × 8 设计纹素）。
// 桌面 1 屏幕行厚（0.13 米），面上 5 块顺 z 的板（planks，1 纹素缝）；下面两块胡桃色的端板（3 纹素宽）+ 一根低横撑。
// 西半边：一只陶碗（塔拉韦拉蓝）盛着两个橙子、一个青苹果；碗前两本杂志（一本压着一本，斜一点）。
// 东半边空着：slot 2f-cups（空杯，x +0.25、z +0.1）放在这里。
// 三角形 114（桌面 12、端板 24、横撑 12、杂志 24、碗 18、水果 24）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** 圆的水果：八面体（中心在 x, y, z），法线取球面（圆的明暗，不是切面） */
function fruit(r: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(r, 0);
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i) + r * 0.35, p.getZ(i)).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g.translate(x, y, z);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) =>
    g.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  const face = { tones: undefined, lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

  const W = 1.3;
  const D = 0.7;
  const H = 0.42;
  const TOP = T / Math.SQRT1_2; // 桌面厚 = 1 屏幕行
  // 桌面：蜂蜜色的木头，顺 z 的板（板宽 0.26 = 5 块），缝 1 纹素
  add(
    [box(W, TOP, D, 0, H - TOP, 0)],
    ctx.mat('timber', {
      ...face,
      ramp: [0xe0a060, 0xb06a50, 0x5c3e6c],
      edge: 0.6,
      convex: 0.4,
      elem: { kind: 'planks', p: [1, 0, 0, 0.26], seam: 1, hi: 0 },
      tones: {
        bands: [
          [0xe0a060, 0xe8aa68, 0xd6965a],
          [0xb06a50, 0xba7458, 0xa6624a],
          [0x5c3e6c, 0x644474, 0x563866],
        ],
        seam: [0xc4844e, 0x925446, 0x4a3260],
        hi: [0xf0b878, 0xc47e5e, 0x6c4c7c],
      },
    }),
  );
  // 端板 + 横撑：胡桃色（比桌面深一截 → 桌面浮在一团暗的上面）
  const legH = H - TOP;
  const lx = W / 2 - 2 * T - 1.5 * T;
  add(
    [
      box(3 * T, legH, D - 2 * T, -lx, 0, 0),
      box(3 * T, legH, D - 2 * T, lx, 0, 0),
      box(2 * lx - 3 * T, 2 * T, 2 * T, 0, T, 0),
    ],
    ctx.mat('timber', { ...face, ramp: [0xa0603c, 0x7a4040, 0x45294e], edge: 0.5, convex: 0.3 }),
  );

  // 杂志：两本，一本正放、一本斜着压在上面（封面饱和色）
  const my = H + 0.003;
  const m1 = box(0.32, 0.03, 0.24, -0.2, my, 0.13);
  const m2 = box(0.3, 0.03, 0.22, 0, 0, 0)
    .rotateY(0.3)
    .translate(-0.14, my + 0.03, 0.12);
  add([m1], ctx.mat('talavera', { ...face, ramp: [0x5aa0f0, 0x3a6cc8, 0x2a3c86], edge: 0.4, convex: 0.4 }));
  add([m2], ctx.mat('toolOrange', { ...face, ramp: [0xffa840, 0xd8603a, 0x7a3456], edge: 0.4, convex: 0.4 }));

  // 碗：六边的塔拉韦拉蓝陶碗，高 0.18（≥ 1 屏幕行的碗身），开口处一块深蓝 = 碗里
  const bx = -0.38;
  const bz = -0.12;
  const bowl = new THREE.CylinderGeometry(0.22, 0.15, 0.18, 6, 1, true).translate(bx, H + 0.09, bz);
  add(
    [bowl],
    ctx.mat('talavera', { ...face, bands: [-0.8, 0.2], ramp: [0x78b4ff, 0x5a90e8, 0x3c5cb0], edge: 0.5, convex: 0.3 }),
  );
  const bed = new THREE.CircleGeometry(0.21, 6).rotateX(-Math.PI / 2).translate(bx, H + 0.15, bz);
  add([bed], ctx.mat('talavera', { ...face, ramp: [0x5a90e8, 0x4a74c8, 0x2a3c86], edge: 0.1, convex: 0 }));
  // 水果：两个橙子 + 一个青苹果（直径 2.2～2.7 纹素）
  const fy = H + 0.15; // 果心在碗口：一半露出碗
  add(
    [fruit(0.12, bx - 0.07, fy, bz + 0.02), fruit(0.11, bx + 0.09, fy, bz - 0.05)],
    ctx.mat('flowerYellow', { ...face, ramp: [0xf8a838, 0xd87030, 0x8a4458], edge: 0.5, convex: 0.2 }),
  );
  add(
    [fruit(0.1, bx + 0.05, fy, bz + 0.1)],
    ctx.mat('yellowGreen', { ...face, ramp: [0xa0cc48, 0x6ea444, 0x3a7c62], edge: 0.5, convex: 0.2 }),
  );

  ctx.mats.prepare(g);
  return g;
}
