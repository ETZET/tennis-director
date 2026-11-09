// umpire-chair-cc：中心球场的裁判椅（用户定的：**不带遮阳顶** —— 45° 俯视里遮阳顶会把裁判整个挡住）。
// 一把白漆钢架的高脚椅：四条 2 纹素粗的腿（往下略张开）、背面一架梯子（北面，看不见）、
// 两条前腿之间一块朝镜头的俱乐部蓝面板（正中一颗网球徽标，脚踏下面露出来）、座箱 + 两侧扶手 + 矮靠背（蓝板 + 白框），座前一块脚踏。
// 靠背只到 2.3 米：裁判坐上去，头和肩露在靠背上面（从 45° 看，裁判是椅子最上面的东西）。
// 本地原点 = 椅子落地中心，裁判面朝 +z（顺着网往南看）。
//
// 座位（给人物模块的 sit）：座面顶 y 1.77、座心 (0, 1.77, 0)；脚踏顶 y 1.54、在座心前 0.3（人物模块 setSeat(1.77, 1.54)）。
// userData.seat = { at: [0, 1.77, 0], foot: [0, 1.54, 0.3] }（本地坐标）。
// 场景里要用它：SLOTS 里 umpire-chair 那一行把 asset 改成 'umpire-chair-cc'（现在是复用 desert3d-v2 的 umpire-chair）。
import * as THREE from 'three';
import type { AssetCtx } from '../world';
import { Bag, DU, DV, FACE_MID, PROP, rod, V } from './court/kit';

const SEAT_Y = 1.77;
const FOOT_Y = 1.54;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'umpire-chair-cc';
  const white = ctx.mat('stucco', { ...PROP, convex: 0.7 });
  const whiteFace = ctx.mat('stucco', { ...FACE_MID, convex: 0.7 });
  const blue = ctx.mat('counter', { ...PROP, convex: 0.5 });
  const blueFace = ctx.mat('counter', {
    ...FACE_MID,
    convex: 0.5,
    elem: { kind: 'planks', p: [1, 0, 0, 0.18], seam: 1, hi: 1, space: 'local' },
  });
  const tread = ctx.mat('timber', { ...PROP, convex: 0.8 });
  const ball = ctx.mat('ball', { ...FACE_MID, bands: [-0.75, -0.2] });

  const bag = new Bag();
  // ── 四条腿：顶 (±0.38, 1.5, ±0.26) → 地 (±0.46, 0, ±0.4)；2 纹素粗 ──
  const LEG = 0.18;
  const top = (sx: number, sz: number) => V(sx * 0.42, 1.52, sz * 0.27);
  const foot = (sx: number, sz: number) => V(sx * 0.52, 0, sz * 0.42);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(bag, white, foot(sx, sz), top(sx, sz), LEG);
  // 两侧各一根斜撑（侧对镜头，看到的是一纹素的亮顶）+ 背面一根横撑
  for (const sx of [-1, 1]) rod(bag, white, V(sx * 0.49, 0.35, 0.37), V(sx * 0.44, 1.1, -0.3), 0.1);
  // ── 背面的梯子（北面，朝镜头看不见；四档横档）+ 正面低处一根横撑 ──
  for (const y of [0.4, 0.75, 1.1]) bag.box(tread, 0.86, 0.08, 0.14, 0, y - 0.04, -0.36 + y * 0.06);
  bag.box(white, 0.9, 0.1, 0.1, 0, 0.36, 0.37);
  // ── 脚踏（座前，顶 1.54）+ 座箱（1.54..1.77，蓝侧板 + 白顶）──
  bag.box(white, 0.9, 0.08, 0.3, 0, FOOT_Y - 0.08, 0.32);
  bag.box(blue, 0.84, SEAT_Y - FOOT_Y - 0.06, 0.52, 0, FOOT_Y, -0.04);
  bag.box(white, 0.9, 0.06, 0.56, 0, SEAT_Y - 0.06, -0.04);
  // 座下的蓝面板（朝镜头，两条前腿之间、脚踏下面露出来的那一截）：竖板 + 正中网球徽标（3 纹素 × 2 行 + 顶上一格）
  const pz = 0.33;
  const py0 = 0.82;
  const ph = 0.5;
  bag.box(blueFace, 0.78, ph, 0.06, 0, py0, pz - 0.03);
  bag.box(ball, 3 * DU, 2 * DV, 0.03, 0, py0 + ph / 2 - DV, pz + 0.015);
  bag.box(ball, 1 * DU, 1 * DV, 0.03, 0, py0 + ph / 2 + DV, pz + 0.015);
  // 面板上下各一条白边（框）
  bag.box(white, 0.86, 0.08, 0.08, 0, py0 - 0.06, pz - 0.03);
  bag.box(white, 0.86, 0.08, 0.08, 0, py0 + ph - 0.02, pz - 0.03);
  // ── 扶手（两侧，白）+ 靠背（白框 + 蓝板，到 2.3 米）──
  for (const sx of [-1, 1]) {
    bag.box(white, 0.1, 0.24, 0.1, sx * 0.42, SEAT_Y, 0.14);
    bag.box(white, 0.12, 0.08, 0.5, sx * 0.42, SEAT_Y + 0.24, -0.06);
    bag.box(white, 0.1, 2.3 - SEAT_Y, 0.1, sx * 0.4, SEAT_Y, -0.29);
  }
  bag.box(blueFace, 0.7, 0.36, 0.06, 0, SEAT_Y + 0.1, -0.29);
  bag.box(whiteFace, 0.9, 0.08, 0.12, 0, 2.3 - 0.08, -0.29);
  bag.into(root);

  root.userData.seat = { at: [0, SEAT_Y, 0], foot: [0, FOOT_Y, 0.3] };
  ctx.mats.prepare(root);
  return root;
}
