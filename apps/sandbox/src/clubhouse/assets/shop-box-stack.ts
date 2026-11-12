// 货梯厅里送来的一垛货箱（#67，信号：堆起来了 → 该用手推车搬进货梯、送到各店）：1.35 × 1.27 × 0.99 米 = 15 × 14 × 11 纹素。
// 元素：一块木托盘（1 行，正面是暗的叉孔带 + 两块亮的垫木），上面两层半的瓦楞纸箱（5 只，大小不一、往后错开，
// 三种牛皮纸色），每只箱子顶面一条封箱带（1 纹素，顺着 z，翻过前沿往下 1 行），正面贴一张彩色的面单（红 / 蓝 / 绿 / 黄，3 纹素 × 1 行）。
// 箱子只画看得见的两片（正面 + 顶面），都不接投影；下面那只大箱是旧的深牛皮纸（暗的那一份）。
// 三角形 ≈ 80（预算 200）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], convex: 0.3 };
type C3 = [number, number, number];

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2;
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
  const top = (m: THREE.Material, w: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w * T, d * T).rotateX(-Math.PI / 2).translate(x * T, y * T, z * T));

  // ── 材质（都不接投影：上面的箱子在下面箱子顶面上的影子边就是一圈强边缘）──
  // 箱子 = 正面一片（中档）+ 顶面一片（亮档）；三种纸箱正面的亮度 113 / 150 / 170，横着挨着的差 < 60
  const F = { ...FACE, noShadowReceive: true };
  const old = ctx.mat('straw', { ...F, ramp: [0xe8b070, 0xa06844, 0x6a4460] }); // 旧的深牛皮纸
  const kraft = ctx.mat('straw', { ...F, ramp: [0xecb878, 0xc88c58, 0x7a5068] });
  const pale = ctx.mat('straw', { ...F, ramp: [0xf6cc8c, 0xdca46a, 0x86607a] });
  // 封箱带：顶面浅（L ≈ 225），翻到正面那一截是中档的黄褐（和三种纸箱都差 < 60）
  const tape = ctx.mat('straw', { ...F, ramp: [0xfff0c0, 0xc89a5a, 0x8a6a70] });
  const pallet = ctx.mat('woodWeathered', { ...F, ramp: [0xd8a878, 0x7a5064, 0x4a3458] });
  const block = ctx.mat('woodWeathered', { ...F, ramp: [0xe0b484, 0xb88464, 0x5a4468] });
  const LABELS: C3[] = [
    [0xff7a5a, 0xf05a44, 0x8a2e52], // 0 红（L 125）
    [0x70b0f4, 0x4a8ee0, 0x2e4a8c], // 1 蓝（L 133）
    [0x7ad060, 0x4cb050, 0x2e6a5a], // 2 绿（L 150）
    [0xffe070, 0xe8c040, 0x8a6a50], // 3 黄（L 189）
  ];
  const label = LABELS.map((ramp) => ctx.mat('clothBlue', { ...F, ramp }));

  // ── 托盘：15 × 1 行 × 11；正面暗的叉孔带，两头和中间三块亮的垫木（3 纹素宽）──
  box(pallet, 15, R, 11, 0, 0, 0);
  for (const x of [-6, 0, 6]) front(block, 3, R, x, 0, 5.52);

  // ── 箱子：[材质, 宽, 高（行）, 深, x, 底（行）, z, 面单] ──
  const boxes: [THREE.Material, number, number, number, number, number, number, number][] = [
    [old, 8, 4, 10, -3.5, 1, 0, 0], // A：左下大箱（旧、深）
    [kraft, 7, 3, 8, 4, 1, 1.5, 2], // B：右下
    [pale, 7, 3, 7, -3.5, 5, -1, 3], // C：压在 A 上，往后错
    [kraft, 5, 2, 5, 4.5, 4, 0.5, 1], // D：压在 B 上
    [kraft, 5, 2, 5, -3, 8, -1.5, 2], // E：最上面
  ];
  for (const [m, w, h, d, x, r0, z, li] of boxes) {
    const y = r0 * R;
    const H = h * R;
    const zf = z + d / 2;
    front(m, w, H, x, y, zf);
    top(m, w, d, x, y + H, z);
    // 封箱带：顶面中线一条（顺着 z），翻过前沿往下 1 行
    top(tape, 1, d, x, y + H + 0.02, z);
    front(tape, 1, R, x, y + H - R, zf + 0.02);
    // 面单：正面最下面一行、靠左（3 × 1 行）
    front(label[li], 3, R, x - w / 2 + 2.5, y, zf + 0.02);
  }

  const root = new THREE.Group();
  root.name = 'shop-box-stack';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
