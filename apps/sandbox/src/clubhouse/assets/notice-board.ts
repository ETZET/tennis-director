// 会员公告板（#34，商店街西头立着的那块）：软木板 1.62 × 1.13 × 0.08 米 = 18 × 8 行 × 1 纹素，下面两条腿。
// 元素：深色的木框（1 纹素 / 1 行），中间软木（暖赭色，正面中档），钉着六张彩色的传单（黄、粉、浅蓝、绿、白、橙；
// 3～5 纹素宽 × 2～3 行，错落、有一张斜出一点的被下一张压住）；两条深色的木腿。
// 摆放：slots-1f.ts 的 shop-notice 放在 y 0.3、s 0.8 → 腿从本地 y 0 往下伸 0.375 米（= 0.3 / 0.8）才落到地面；
// 画廊里腿埋在地台里（只看得见板）。改了那个摆件的 y / s 要改这里的 LEG。
// 传单和软木的亮度差 < 60（不出强边缘）。三角形 50（预算 80）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.25 };
type C3 = [number, number, number];
/** 腿往下伸多少（米，本地）：摆件 y 0.3 ÷ 缩放 0.8 */
const LEG = 0.375;

/** 传单：[颜色, 宽, 高（行）, x（左沿，纹素）, 底（行）] */
const FLYERS: [C3, number, number, number, number][] = [
  [[0xffe880, 0xe8c454, 0x8a7060], 4, 3, -7, 3], // 黄
  [[0xffb0c8, 0xf48aa8, 0x8a4a6a], 3, 2, -2, 5], // 粉
  [[0xa8dcff, 0x78bcf4, 0x3a5a9a], 5, 3, 1, 2], // 浅蓝
  [[0x9ae088, 0x6cc060, 0x2e6a5a], 3, 2, 5, 5], // 绿
  [[0xfff4e4, 0xe8dccc, 0x8a7a9c], 4, 2, -4, 1], // 白
  [[0xffb870, 0xf49a50, 0x8a4a50], 3, 2, -1, 1], // 橙
];

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

  const frame = ctx.mat('timber', { ...FACE, ramp: [0xd08a5a, 0xa86450, 0x4a3058] });
  const cork = ctx.mat('timber', { ...FACE, ramp: [0xf0b070, 0xd08a54, 0x7a4a5a] });

  // ── 板：18 × 8 行 × 0.67（0.06 米），木框 1 纹素 / 1 行，里面软木 ──
  const W = 18;
  const H = 8 * R;
  const D = 0.06 / T; // 板 0.06 + 贴面 ≈ 0.08 米
  box(frame, W, H, D, 0, 0, 0);
  front(cork, W - 2, H - 2 * R, 0, R, D / 2 + 0.05);
  // ── 传单 ──
  FLYERS.forEach(([ramp, w, h, x0, r0], i) => {
    front(ctx.mat('clothBlue', { ...FACE, ramp }), w, h * R, x0 + w / 2, r0 * R, D / 2 + 0.1 + i * 0.02);
  });
  // ── 两条腿（从地面伸到板底往上 1 行）──
  for (const sx of [-1, 1]) box(frame, 1, LEG / T + R, D, sx * 6.5, -LEG / T, 0);

  const root = new THREE.Group();
  root.name = 'notice-board';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
