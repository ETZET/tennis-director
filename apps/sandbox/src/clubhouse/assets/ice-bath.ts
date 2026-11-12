// 理疗区的冰浴桶：一只长方的不锈钢桶（壁 1 纹素，口沿一圈亮的卷边），里面一池冰水。
// 0.9 × 0.7 × 1.53 米（10 × 7.8 × 17 设计纹素），长边南北；水面在口沿下 1 纹素。朝镜头的一面三层：口沿（亮）、桶身（中）、往里缩的底座（暗）；南沿东边搭着一条白毛巾。
// v0 = 刚加的冰：青色的冰水 + 9 块白冰块（2 纹素见方，半浮在水面上，各转一点）；
// v1 = 冰化了（信号 → 去制冰机再扛一桶来）：没有冰块，水深一截、偏蓝（L ≈ 133，和口沿差 < 60）。
// 元素：水面 paint（大块的轻微深浅，冰水偏亮）；桶身 planks 竖着每 0.45 米一道焊缝。
// 三角形 v0 194（底座 12 + 桶身 12 + 口沿 4 × 12 + 毛巾 12 + 水 2 + 冰块 9 × 12），v1 86。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) => g.add(new THREE.Mesh(mergeGeometries(gs), m));
  const melted = ctx.variant % 2 === 1;
  const W = 10 * T;
  const D = 17 * T;
  const H = 0.7; // 口沿顶
  const WATER = H - T * 1.2; // 水面
  const BODY = WATER - 0.04; // 桶身顶（在水面下 4 厘米，被水面盖住；贴得太近描边会在水面上出黑点）；口沿从这里到 H
  const RH = H - BODY;

  // 桶身（实心盒，顶面被水和口沿盖住）：冷的不锈钢，朝镜头那面落中档；下面 5 纹素是往里缩 1 纹素的底座（暗档）
  const BASE = 5 * T;
  add(
    [box(W - 2 * T, BASE, D - 2 * T, 0, 0, 0)],
    ctx.mat('ironwork', { ramp: [0x6a74a8, 0x4a5084, 0x2c3058], edge: 0.3, convex: 0.1, noShadowReceive: true }),
  );
  add(
    [box(W - 0.02, BODY - BASE, D - 0.02, 0, BASE, 0)],
    ctx.mat('metal', {
      ramp: [0x8cbcf0, 0x4c78c0, 0x34448c],
      tones: undefined,
      lightUp: 0.55,
      bands: [-0.45, 0.35],
      edge: 0.5,
      convex: 0.3,
      noShadowReceive: true,
      elem: { kind: 'planks', p: [1, 0, 0, 0.45], seam: 1, hi: 0 },
    }),
  );
  // 口沿：一圈 1 纹素宽的卷边（亮）
  const rim = ctx.mat('metal', {
    ramp: [0x88b8e0, 0x6090c8, 0x40569a],
    lightUp: 0.6,
    bands: [-0.5, 0.3],
    edge: 0.3,
    convex: 0.15,
    noShadowReceive: true,
  });
  add(
    [
      box(W, RH, T, 0, BODY, D / 2 - T / 2),
      box(W, RH, T, 0, BODY, -D / 2 + T / 2),
      box(T, RH, D - 2 * T, W / 2 - T / 2, BODY, 0),
      box(T, RH, D - 2 * T, -W / 2 + T / 2, BODY, 0),
    ],
    rim,
  );
  // 毛巾：搭在南沿东边，垂在桶身前面（3 纹素宽，正面落亮档）
  add(
    [box(3 * T, RH + 2.5 * T, 0.04, 2 * T, H + 0.02 - RH - 2.5 * T, D / 2 + 0.02)],
    ctx.mat('clothWhite', {
      ramp: [0xf4f8f8, 0xc8d4e4, 0x7a7ea8],
      lightUp: 0.55,
      bands: [-0.45, -0.25],
      edge: 0.5,
      convex: 0,
      noShadowReceive: true,
    }),
  );
  // 水面
  const water = new THREE.PlaneGeometry(W - 2 * T, D - 2 * T).rotateX(-Math.PI / 2).translate(0, WATER, 0);
  add(
    [water],
    ctx.mat('jug', {
      ramp: melted ? [0x2a8ec0, 0x22689e, 0x1e3678] : [0x38b4d4, 0x2a90c4, 0x2a5aa0],
      tones: undefined,
      edge: 0.05,
      convex: 0,
      noShadowReceive: true,
      elem: { kind: 'paint', size: [6, 4], density: [0, 0], patch: 1.5, seed: 4 },
      toneW: [0.3, 0.3],
    }),
  );
  if (!melted) {
    const rnd = ctx.rng('ice-bath:cubes');
    const cubes: THREE.BufferGeometry[] = [];
    // 冰块：两列错开，2 纹素见方（1.5 纹素高，一半在水下）
    const spots: [number, number][] = [
      [-1.6, -5.5],
      [1.4, -4.2],
      [-0.6, -2.0],
      [1.8, -0.6],
      [-1.8, 0.8],
      [0.4, 1.6],
      [-1.0, 3.6],
      [1.6, 4.4],
      [-0.2, 6.0],
    ];
    for (const [x, z] of spots) {
      const s = 2 * T;
      cubes.push(
        new THREE.BoxGeometry(s, 1.5 * T, s).rotateY((rnd() - 0.5) * 1.2).translate(x * T, WATER + 0.3 * T, z * T),
      );
    }
    add(
      cubes,
      ctx.mat('jug', {
        // 冰：浅青白（亮档 L ≈ 223，和水面差 < 60；凸边高光会被午后的描边染成奶油色 → 不要）
        ramp: [0x94d8f8, 0x6ab8e8, 0x4a80c8],
        tones: undefined,
        lightUp: 0.4,
        bands: [-0.4, 0.3],
        edge: 0.4,
        convex: 0,
        noShadowReceive: true,
      }),
    );
  }
  ctx.mats.prepare(g);
  return g;
}
