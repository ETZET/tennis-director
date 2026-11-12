// B1 储藏间北墙的货架（#158）：2.16 × 2.38 × 0.63 米 = 24 × 26.5 × 7 纹素（架子 18 行 + 顶上的球筐），朝南（+z 对镜头）。
// 元素：木架子（两头 2 纹素宽的立柱 + 4 层 1 行厚的搁板，层间 4 行）；
// 下两层蓝色的大水桶（满的，饮水机换桶从这拿）+ 纸箱；第三层一排纸箱（牛皮纸色，有的贴一道会所青的胶带）；
// 顶上三筐网球（深靛的铁丝筐，筐口一层荧光黄的球：stones 元素 2 × 2 纹素一颗；放在顶上，没有搁板挡着）。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 324（预算 400）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
const ROUND = { lightUp: 0.55, bands: [-0.45, -0.1] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖面上的 1 屏幕行（纹素）
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T));
  /** 水桶：6 段的开口圆柱 + 顶上一块圆盖（底面看不见，不画） */
  const jugAt = (x: number, y: number) => {
    put(jug, new THREE.CylinderGeometry(2 * T, 2 * T, 3 * R * T, 6, 1, true).translate(x * T, (y + 1.5 * R) * T, 0));
    put(jugTop, new THREE.CircleGeometry(2 * T, 6).rotateX(-Math.PI / 2).translate(x * T, (y + 3 * R) * T, 0));
  };
  /** 胶带：贴在箱子正面的 1 纹素竖条 */
  const tapeAt = (x: number, y: number, h: number) =>
    put(tape, new THREE.PlaneGeometry(T, h * T).translate(x * T, (y + h / 2) * T, 2.5 * T + 0.004));

  // ── 材质 ──
  const post = ctx.mat('wood', { ...FACE, ramp: [0xd8945a, 0xb06a48, 0x5e426e] });
  const board = ctx.mat('wood', { ramp: [0xe8a868, 0xb87452, 0x5e426e], noShadowReceive: true });
  const jug = ctx.mat('clothBlue', { ...ROUND, ramp: [0x5ac8f8, 0x2a8ae0, 0x2a4c92], convex: 0.4 });
  const jugTop = ctx.mat('clothBlue', { ramp: [0x6ad4f8, 0x3a9ae4, 0x2a4c92], noShadowReceive: true, convex: 0.4 });
  const crate = ctx.mat('ironwork', { ...FACE, ramp: [0x5a5aa8, 0x40409a, 0x262458] });
  // 网球：荧光黄（借 ball），筐口一层 2 × 2 纹素一颗（stones 元素：每颗一个深浅、缝 = 球和球之间的暗）
  const balls = ctx.mat('ball', {
    noShadowReceive: true,
    elem: { kind: 'stones', size: [2.2, 2.2], seam: 0.45, hi: 0.4 },
    tones: {
      bands: [
        [0xe8ff50, 0xf4ff80, 0xd4ec40],
        [0xb8d044, 0xc6dc50, 0xa8c03c],
        [0x6a8a5a, 0x76965e, 0x5e7e54],
      ],
      seam: [0xa8c43a, 0x8aa83a, 0x4e6a50],
      hi: [0xfaffb0, 0xd8ec70, 0x86a066],
    },
  });
  const kraft = ctx.mat('cap', { ...FACE, ramp: [0xf6c088, 0xdc9466, 0x7c4e8a] });
  const kraft2 = ctx.mat('cap', { ...FACE, ramp: [0xeab07a, 0xc8845c, 0x6e4682] });
  const tape = ctx.mat('clothTeal', { ...FACE });

  // ── 架子：24 宽（x −12…+12），7 深（z −3.5…+3.5）；立柱 2 × 18 行；搁板 1 行，顶在 行 1、6、11、16 ──
  const W = 24;
  for (const sx of [-1, 1]) box(post, 2, 18 * R, 7, sx * (W / 2 - 1), 0, 0);
  for (const r of [0, 5, 10, 15]) box(board, W - 4, R, 6, 0, r * R, -0.5);

  // 最下层（行 1…5）：三桶水（半径 2，高 3 行 + 桶口）+ 一个纸箱
  for (const x of [-7.5, -3, 1.5]) jugAt(x, R);
  box(kraft, 5, 3 * R, 5, 6.5, R, 0);
  // 第二层（行 6…10）：两桶水 + 两个纸箱
  for (const x of [-7.5, -3]) jugAt(x, 6 * R);
  box(kraft2, 5, 2 * R, 5, 2.5, 6 * R, 0);
  box(kraft, 4, 3 * R, 5, 7.5, 6 * R, 0);
  tapeAt(7.5, 6 * R, 3 * R);

  // 第三层（行 11…15）：纸箱一排（高低不齐），两个贴会所青胶带
  const boxes: [number, number, number, boolean][] = [
    [-7, 5, 3, true],
    [-1.5, 5, 2, false],
    [4, 5, 3, false],
    [8.5, 3, 2, true],
  ];
  for (const [i, [x, w, h, taped]] of boxes.entries()) {
    box(i % 2 ? kraft2 : kraft, w, h * R, 5, x, 11 * R, 0);
    if (taped) tapeAt(x, 11 * R, h * R);
  }
  // 顶上（顶板 行 16 上面，上面没东西挡，球看得最全）：三筐网球（筐 6 × 2 行 × 5，球冒出筐口 1 纹素）
  for (const x of [-6.5, 0, 6.5]) {
    box(crate, 6, 2 * R, 5, x, 16 * R, 0);
    box(balls, 5, 1, 4, x, 18 * R, 0);
  }

  const root = new THREE.Group();
  root.name = 'gym-store-shelves';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
