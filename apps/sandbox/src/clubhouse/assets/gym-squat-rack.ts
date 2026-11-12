// gym-squat-rack · B1 自由重量区的力量架（×2，镜墙前）：练的人站在架子里、脸朝南（+z 朝镜头）。
// 尺寸 2.16 × 2.4 × 2.0 米（24 × 27 × 22 设计纹素；宽多出来的是杠头）：脚下一块 2 × 2 米的举重台（中间木板 + 一圈 3 纹素的黑胶边），
//   上面一个力量架：四根 2 纹素粗的工具橙立柱（x ±0.5、z ±0.55）、顶上一圈横梁、两根钢的保护杆；
//   前面两根立柱上挂着 J 钩，杠铃架在 1.4 米（杠 1.5 纹素的亮钢），两头各三片杠铃片（红 Ø0.5、蓝 Ø0.44、绿 Ø0.36，
//   2 / 1.5 / 1.3 纹素厚 → 侧看一头是一块 ≈ 5 纹素宽、5～6 行高的彩色片堆）。
// 元素：木板台面 planks（沿 x 的板，每块 5 纹素）；其余是干净的漆面 / 钢（饱和的主体色 + 暗的钢）。
// 立柱、横梁、钢件、片朝镜头的面：lightUp 0.55 + 低 bands（落中档的亮橙，不是暗档的紫褐），不接投影；台面接投影（架子的影子），
//   木头 / 胶的暗档挑亮一点（影子和亮面差 < 60，不出强边缘）。
// 三角形：方块 17 × 12 + 杠铃片 6 × 32 = 396（预算 400）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const orange = ctx.mat('toolOrange', { ...face, ramp: [0xffb048, 0xf47a30, 0x8a3a5a], edge: 0.45, convex: 0.35 });
  const steel = ctx.mat('ironwork', { ...face, ramp: [0x8a8cc0, 0x5a5e9c, 0x2e2e5c], edge: 0.5, convex: 0.4 });
  const bar = ctx.mat('ironwork', { ...face, ramp: [0xc8d0f0, 0x98a4dc, 0x6c70a8], edge: 0.3, convex: 0.2 });
  const wood = ctx.mat('wood', {
    ramp: [0xe8a464, 0xc47c52, 0xb47c8a],
    edge: 0.1,
    convex: 0.05,
    elem: { kind: 'planks', space: 'local', p: [0, 0, 1, 5 * T], seam: 1, hi: 0 },
  });
  const rubber = ctx.mat('rubber', { ramp: [0x4a6488, 0x34486e, 0x323e6c], edge: 0.2, convex: 0.1 });
  const red = ctx.mat('clothRed', { ...face, ramp: [0xff6a50, 0xe04a50, 0xa43c6a], edge: 0.25, convex: 0.3 });
  const blue = ctx.mat('clothBlue', { ...face, ramp: [0x5a9cff, 0x4a6ce0, 0x4a58c0], edge: 0.25, convex: 0.3 });
  const green = ctx.mat('cactus', { ...face, ramp: [0x7cc450, 0x3ea058, 0x2e7a72], edge: 0.25, convex: 0.3 });

  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const list = parts.get(m) ?? [];
    list.push(g);
    parts.set(m, list);
  };
  /** 方块：x/z 中心，y 底 */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    add(m, new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z));
  /** 杠铃片：轴沿 x 的八角柱（顶上一条平边） */
  const plate = (m: THREE.Material, r: number, t: number, x: number, y: number, z: number) =>
    add(
      m,
      new THREE.CylinderGeometry(r, r, t, 8, 1)
        .rotateY(Math.PI / 8)
        .rotateZ(Math.PI / 2)
        .translate(x, y, z),
    );

  // ── 举重台：黑胶底 2 × 2，中间木台面（四周露 3 纹素的胶边）──
  const PH = 0.06;
  box(rubber, 2.0, PH - 0.02, 2.0, 0, 0, 0);
  box(wood, 2.0 - 6 * T, 0.02, 2.0 - 6 * T, 0, PH - 0.02, 0);

  // ── 力量架 ──
  const P = 2 * T; // 立柱 2 纹素
  const X = 0.5;
  const Z = 0.55;
  const H = 2.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(orange, P, H - PH, P, sx * X, PH, sz * Z);
  // 顶梁：前后两根（沿 x）、左右两根（沿 z）
  for (const sz of [-1, 1]) box(orange, 2 * X - P, P, P, 0, H - P, sz * Z);
  for (const sx of [-1, 1]) box(orange, P, P, 2 * Z - P, sx * X, H - P, 0);
  // 保护杆：立柱内侧、离地 0.75，前后贯通
  for (const sx of [-1, 1]) box(steel, 1.5 * T, 1.5 * T, 2 * Z + 3 * T, sx * (X - P), 0.75, 0);

  // ── J 钩 + 杠铃（杠心 y 1.4，在前立柱前面）──
  const BY = 1.4;
  const BZ = Z + P / 2 + T;
  const BW = 1.5 * T;
  for (const sx of [-1, 1]) {
    // 钩底（托着杠）+ 前唇
    box(steel, P, T, 2 * T + BW, sx * X, BY - BW / 2 - T, BZ);
    box(steel, P, 2 * T, T, sx * X, BY - BW / 2 - T, BZ + BW / 2 + T / 2);
  }
  box(bar, 2.16, BW, BW, 0, BY - BW / 2, BZ);
  // 杠铃片：立柱外侧，红在里、蓝在外；外面露 1 纹素的杠头
  const x0 = X + P / 2 + 0.02;
  const tr = 2 * T;
  const tb = 1.5 * T;
  const ty = 1.3 * T;
  for (const sx of [-1, 1]) {
    plate(red, 0.25, tr, sx * (x0 + tr / 2), BY, BZ);
    plate(blue, 0.22, tb, sx * (x0 + tr + tb / 2), BY, BZ);
    plate(green, 0.18, ty, sx * (x0 + tr + tb + ty / 2), BY, BZ);
  }

  const root = new THREE.Group();
  for (const [m, gs] of parts) root.add(new THREE.Mesh(mergeGeometries(gs), m));
  ctx.mats.prepare(root);
  return root;
}
