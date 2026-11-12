// 便利店的零食架 / 运动营养的补剂架（#61）：单面的货架（gondola），1.62 × 1.53 × 0.54 米 = 18 × 17 × 6 纹素。
// 元素：会所蓝的铁架（两块侧板 + 背板，脚下一条深靛踢脚）；三层货，每层一排 3～4 纹素宽、2 行高的包装（红、橙、黄、绿、蓝、紫、粉，
// 同一层里相邻的亮度差 < 60），每层上面一条浅黄的价签条（满宽，是货架上最亮的横条）；最上面一层是补剂罐（带亮的盖）；
// 顶上一块橙色的小招牌（没有字）。竖直方向按屏幕行排（1 行 = √2 纹素）。
// 只画看得见的面：包装 = 正面 + 顶面两片（侧面在 yaw 0 下看不见）。三角形 ≈ 130（预算 300）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.25 };
type C3 = [number, number, number];

/** 包装的颜色（[亮, 中, 暗]，正面落中档：中档 L 120～165） */
const PACKS: C3[] = [
  [0xf4785c, 0xe85a44, 0x7a2e52], // 红（L 124）
  [0xffb050, 0xf08a3a, 0x8a4450], // 橙（L 154）
  [0xffe070, 0xe8c040, 0x8a6a50], // 黄（L 189）
  [0x7ad060, 0x4cb050, 0x2e6a5a], // 绿（L 143）
  [0x70b0f4, 0x4a8ee0, 0x2e4a8c], // 蓝（L 133）
  [0xb888ec, 0x9a64d8, 0x4a3a8a], // 紫（L 120）
  [0xffa0b8, 0xf07898, 0x8a3a6a], // 粉（L 148）
];

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖面上的 1 屏幕行（纹素）
  const rnd = ctx.rng('shop-snack-shelves:packs');
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 盒子（纹素）：宽、高、深，x / z 中心，y 底 */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T));
  /** 朝 +z 的竖片：宽 w、高 h，x 中心、y 底、z 面 */
  const front = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w * T, h * T).translate(x * T, (y + h / 2) * T, z * T));
  /** 朝上的平片：宽 w、深 d，x / z 中心、y 高 */
  const top = (m: THREE.Material, w: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w * T, d * T).rotateX(-Math.PI / 2).translate(x * T, y * T, z * T));

  // ── 材质 ──
  const frame = ctx.mat('counter', { ...FACE, ramp: [0x6ab0f0, 0x3a7cc8, 0x2c4890] });
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x4a4a86, 0x363670, 0x262450] });
  const strip = ctx.mat('signPaint', { ...FACE, ramp: [0xffe490, 0xf6d070, 0x9a7a8a] });
  const sign = ctx.mat('toolOrange', { ...FACE, ramp: [0xffa040, 0xf47a30, 0x8a3a4a] });
  const packM = PACKS.map((ramp) => ctx.mat('clothBlue', { ...FACE, ramp }));
  const lid = ctx.mat('clothWhite', { ...FACE, ramp: [0xfff4e0, 0xf4e8d8, 0x8a7a9c] });

  // ── 架子：18 × 10 行 × 6，正面 z +3。正面的东西都在同一个面上（屏幕上一行一行正好对齐）：
  // 踢脚 1 行、货 2 行、价签 1 行、货 2 行、价签 1 行、货 2 行、顶上价签 1 行 ──
  const W = 18;
  const H = 10 * R;
  const ZF = 3;
  box(kick, W - 1, R, 5, 0, 0, 0.5);
  box(frame, W, H, 1, 0, 0, -2.5); // 背板
  box(frame, 1, H, 6, -8.5, 0, 0); // 侧板
  box(frame, 1, H, 6, 8.5, 0, 0);
  top(frame, W - 2, 5, 0, H, 0.5); // 顶面（侧板顶在两头）
  for (const y of [3 * R, 6 * R, 9 * R]) front(strip, W, R, 0, y, ZF + 0.02);

  // ── 三层货：每层从 x −8 排到 +8，宽 3～4，偶尔空 1 纹素（露出背板）；相邻的不重色、亮度差 < 60 ──
  const lum = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
  let last = -1;
  const tiers = [R, 4 * R, 7 * R];
  tiers.forEach((y0, tier) => {
    let x = -8;
    while (x < 7.5) {
      const w = Math.min(rnd() < 0.7 ? 3 : 4, 8 - x);
      if (w < 2) break;
      const clash = (c: number) => c === last || (last >= 0 && Math.abs(lum(PACKS[c][1]) - lum(PACKS[last][1])) > 55);
      let k = Math.floor(rnd() * PACKS.length);
      for (let t = 0; t < 8 && clash(k); t++) k = (k + 1 + Math.floor(rnd() * 3)) % PACKS.length;
      last = k;
      const cx = x + w / 2;
      if (tier === 2) {
        // 补剂罐：1.5 行的罐身 + 半行亮盖（盖窄 1 纹素）
        front(packM[k], w - 0.5, 1.5 * R, cx, y0, ZF - 0.1);
        front(lid, w - 1.5, 0.5 * R, cx, y0 + 1.5 * R, ZF - 0.1);
      } else {
        // 袋子：2 行或 1.5 行（矮的上面露出背板）
        const h = rnd() < 0.35 ? 1.5 * R : 2 * R;
        front(packM[k], w, h, cx, y0, ZF - 0.1);
      }
      x += w + (rnd() < 0.2 ? 1 : 0);
    }
  });

  // ── 顶上的小招牌：橙色，12 宽 × 2 行，立在顶面中间 ──
  box(sign, 12, 2 * R, 1, 0, H, 0);

  const root = new THREE.Group();
  root.name = 'shop-snack-shelves';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
