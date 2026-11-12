// 便利店的饮料冷柜（#62）：立式双门，1.62 × 2.12 × 0.72 米 = 18 × 24 × 8 纹素（柜身 15 行 + 顶上两箱备货）。
// 元素：青蓝的柜身（门边 2 纹素、中梃 2 纹素，脚下一行深靛踢脚 + 一行深靛的散热格栅，顶上 2 行里一块发冷光的灯箱）；
// 两扇玻璃门里是冷光的青色内胆，四层饮料：每层两组 3 纹素宽、2 行高的瓶子（可乐红、蓝、橙、黄、绿、粉红、紫，按亮度配对），
// 层板的前沿是一行亮青的灯条（"冷光"，两头让出内胆）；门把是中梃两边各一条 1 纹素的不锈钢；顶上两只纸箱（备货）。
// 横着相邻的（门边 | 瓶子 | 瓶子 | 中梃、内胆 | 灯条）亮度差都 < 60：玻璃框的竖边不出强边缘。
// 只画看得见的面（正面 + 顶面）。三角形 ≈ 130（预算 250）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.25 };
type C3 = [number, number, number];

/** 一组组饮料的颜色（正面落中档：L 93～185）；一层里同一扇门的两组按 PAIRS 配对（亮度差 < 60，和门框也 < 60） */
const DRINKS: C3[] = [
  [0xd05a64, 0xb04050, 0x5a2a50], // 0 可乐红（L 93，暗档的那一份）
  [0x70a8f0, 0x4a80d8, 0x2e4a8c], // 1 蓝（L 127）
  [0xffb050, 0xf08a3a, 0x8a4450], // 2 橙（L 158）
  [0xffd860, 0xe0b440, 0x8a6a50], // 3 黄（L 185）
  [0x7ad060, 0x4cb050, 0x2e6a5a], // 4 绿（L 147）
  [0xff9088, 0xf06a6a, 0x8a3a5a], // 5 粉红（L 140）
  [0xc098f4, 0xa070e0, 0x4a3a8a], // 6 紫（L 134）
];
const PAIRS: [number, number][] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 4],
  [1, 6],
  [5, 2],
  [0, 6],
];

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2;
  const rnd = ctx.rng('shop-drinks-fridge:drinks');
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T));
  const front = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w * T, h * T).translate(x * T, (y + h / 2) * T, z * T));

  // ── 材质 ──
  const body = ctx.mat('clothTeal', { ...FACE, ramp: [0x3aa8d8, 0x2a88b8, 0x22457a] });
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x4a4a86, 0x363670, 0x262450] });
  const inner = ctx.mat('jug', { ...FACE, ramp: [0x8adcec, 0x60bcd4, 0x3a6aa0] });
  const glow = ctx.mat('jug', { ...FACE, ramp: [0xc0f4fc, 0x98dcea, 0x4a7ab0] });
  const handle = ctx.mat('steel', { ...FACE });
  const carton = ctx.mat('straw', { ...FACE, ramp: [0xf0c47a, 0xd49a62, 0x8a6474] });
  const tape = ctx.mat('straw', { ...FACE, ramp: [0xfff0b0, 0xf0d890, 0x9a8080] });
  const drinkM = DRINKS.map((ramp) => ctx.mat('clothBlue', { ...FACE, ramp }));

  // ── 柜身：18 × 15 行 × 8，正面 z +4；踢脚 1 行（往里收 1 纹素）、门 12 行、顶上 2 行（中间 12 宽的冷光灯箱）──
  const W = 18;
  const D = 8;
  const ZF = D / 2;
  box(kick, W - 1, R, D - 1, 0, 0, -0.5);
  box(body, W, 14 * R, D, 0, R, 0);
  front(inner, 12, 1.5 * R, 0, 13.25 * R, ZF + 0.02);
  // 门下面的散热格栅：一行深靛（14 宽），格栅不画格子
  front(kick, 14, R, 0, R, ZF + 0.02);

  // ── 两扇门：门边 2 纹素（外沿那一列被轮廓压暗，挨着玻璃的是柜身的中档），玻璃 x −7…−1、1…7（6 宽），行 2…13 ──
  for (const sx of [-1, 1]) {
    const cx = sx * 4;
    front(inner, 6, 11 * R, cx, 2 * R, ZF + 0.02);
    // 三道层板灯条（行 4、7、10，两头各让出 1 纹素的内胆）
    for (const r of [4, 7, 10]) front(glow, 4, R, cx, r * R, ZF + 0.04);
    // 四层饮料，每层两组（3 宽，挨着）：2、2、2 行，最上面一层罐装 1 行；顶上露 1 行内胆
    for (const [r, h] of [
      [2, 2],
      [5, 2],
      [8, 2],
      [11, 1],
    ] as const) {
      const [a, b] = PAIRS[Math.floor(rnd() * PAIRS.length)];
      const [l, rr] = rnd() < 0.5 ? [a, b] : [b, a];
      front(drinkM[l], 3, h * R, cx - 1.5, r * R, ZF + 0.04);
      front(drinkM[rr], 3, h * R, cx + 1.5, r * R, ZF + 0.04);
    }
    // 门把：中梃两边各一条（1 纹素 × 4 行）
    front(handle, 1, 4 * R, sx * 0.5, 6 * R, ZF + 0.06);
  }

  // ── 顶上两只纸箱（备货），封箱带一条 ──
  const top = 15 * R;
  box(carton, 6, 2 * R, 5, -4.5, top, -0.5);
  box(carton, 5, 1.5 * R, 4, 3, top, -1);
  front(tape, 1, 2 * R, -4.5, top, 2.02);

  const root = new THREE.Group();
  root.name = 'shop-drinks-fridge';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
