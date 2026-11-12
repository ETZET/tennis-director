// 拳击角的台垫：一块蓝帆布垫（深蓝外圈 → 中蓝 → 浅蓝的里方块），四角四根红色护角柱（3 纹素见方、0.6 米高，顶上一块奶白垫顶），正中一块红的圆标。
// 3.78 × 0.63 × 3.42 米（42 × 7 × 38 设计纹素），垫子本身厚 0.09。没有围绳（细绳在 0.09 米下是噪点）。
// 元素：帆布 paint（大块的轻微深浅 + 很少的擦痕）。
// 三角形 84（垫子盒 12 + 两层方块 4 + 护角柱 4 × 12 + 垫顶 4 × 2 + 中圈 12 段 10）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const flat = (w: number, d: number, x: number, y: number, z: number) =>
  new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) => g.add(new THREE.Mesh(mergeGeometries(gs), m));
  const W = 42 * T;
  const D = 38 * T;
  const H = T;
  const canvas = (ramp: [number, number, number], seed: number) =>
    ctx.mat('clothBlue', {
      ramp,
      tones: undefined,
      edge: 0.05,
      convex: 0,
      elem: { kind: 'paint', size: [14, 9], density: [0, 0.05], patch: 2.5, seed },
    });
  // 外圈（整块垫子）：深蓝，侧面朝镜头那条 1 纹素
  add([box(W, H, D, 0, 0, 0)], canvas([0x3e66d0, 0x2e48a0, 0x24286c], 1));
  // 中蓝一圈
  add([flat(W - 8 * T, D - 8 * T, 0, H + 0.002, 0)], canvas([0x5a8ef0, 0x3e68c4, 0x2a3484], 2));
  // 浅蓝的里方块
  add([flat(W - 20 * T, D - 18 * T, 0, H + 0.004, 0)], canvas([0x86c0fa, 0x5a90dc, 0x34489a], 3));
  // 中圈：一块红的圆标（直径 0.72 米，和护角柱同一种红）
  add(
    [new THREE.CircleGeometry(4 * T, 12).rotateX(-Math.PI / 2).translate(0, H + 0.006, 0)],
    ctx.mat('fabricStripe', { ramp: [0xff6a56, 0xd0404c, 0x6a2456], edge: 0.05, convex: 0 }),
  );
  // 护角柱：红，顶上奶白垫顶
  const posts: THREE.BufferGeometry[] = [];
  const tops: THREE.BufferGeometry[] = [];
  const PH = 0.6;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * (W / 2 - 1.5 * T);
      const z = sz * (D / 2 - 1.5 * T);
      posts.push(box(3 * T, PH - H, 3 * T, x, H, z));
      tops.push(flat(3 * T, 3 * T, x, PH + 0.002, z));
    }
  add(
    posts,
    ctx.mat('fabricStripe', {
      ramp: [0xf4584a, 0xc23a4c, 0x6a2456],
      lightUp: 0.55,
      bands: [-0.45, 0.35],
      edge: 0.6,
      convex: 0.3,
      noShadowReceive: true,
    }),
  );
  add(
    tops,
    ctx.mat('clothWhite', { ramp: [0xfff0e0, 0xd8c0bc, 0x7c6a98], edge: 0.4, convex: 0, noShadowReceive: true }),
  );
  ctx.mats.prepare(g);
  return g;
}
