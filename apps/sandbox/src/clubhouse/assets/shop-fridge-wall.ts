// #58 冷柜墙（运动营养 · 饮品店北墙，朝南）：三扇玻璃门的饮料冷柜。
// 尺寸：1.98 宽 × 2.12 高 × 0.70 深（22 纹素 × 2.12 米 × 7.8 纹素）。门框正面在 z +0.34。
// 正面：三扇门（门框、中梃 1 纹素，深钢蓝），门里五层：下两层罐子（0.17 米）、上三层瓶子（0.25 米，瓶身 2 纹素 + 1 纹素瓶颈），
// 每层下面一条 1 行的货架前沿（浅蓝价签条）；门里的后板是冷光的浅青（瓶颈两边、罐子上面露出来）。
// 柜体是俱乐部蓝的漆：顶面（0.7 米深，画面里最大的一块亮面）+ 1 行门楣，脚下 2 行深色通风格栅。
// 高度按屏幕行排（竖直 1 行 = √2 纹素 = 0.127 米）：格栅 0..0.25、罐 A 0.25..0.55、罐 B 0.55..0.85（= slots-1f.ts 里
// "空了一排"信号 shop-empty-row 的位置：y 0.55、高 0.30）、瓶 C/D/E 每层 0.38、门楣 2.0..2.12。
// 明暗：门框、格栅 L ≈ 70～105（暗）、瓶罐和冷光后板 L 120～170（中，颜色鲜，相邻差 < 60）、柜顶（亮）。
// 材质：steel（门框）、ironwork（格栅）、jug（冷光后板）、canvasStripe（柜体、价签条）；瓶罐借 fabricStripe / canvasStripe /
// toolOrange / ball / flowerYellow / clothPurple 换颜色。只建朝镜头的面。三角形 208。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** BoxGeometry 的面顺序：+x −x +y −y +z −z */
const FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 } as const;
type Face = keyof typeof FACE;

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖直 1 屏幕行（纹素单位）
  const M = 1 / T; // 米 → 纹素
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** 盒子（纹素坐标：x 从中心、y 从地面、z 从中心）；faces = 只留哪些面 */
  const slab = (
    m: THREE.Material,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    faces: Face[],
  ) => {
    const g = new THREE.BoxGeometry((x1 - x0) * T, (y1 - y0) * T, (z1 - z0) * T);
    g.translate(((x0 + x1) / 2) * T, ((y0 + y1) / 2) * T, ((z0 + z1) / 2) * T);
    const src = g.index!.array;
    const idx: number[] = [];
    for (const f of faces) for (let i = 0; i < 6; i++) idx.push(src[FACE[f] * 6 + i]);
    g.setIndex(idx);
    const list = parts.get(m) ?? [];
    list.push(g);
    parts.set(m, list);
  };
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const col = (key: Parameters<AssetCtx['mat']>[0], lit: number, mid: number, dark: number) =>
    ctx.mat(key, { ...face, edge: 0.3, convex: 0.15, ramp: [lit, mid, dark] });

  const frame = col('steel', 0xa0b8e4, 0x5a72bc, 0x34407a);
  const strip = col('canvasStripe', 0x80c0fc, 0x4c94e0, 0x34508e);
  const grille = col('ironwork', 0x6a64a0, 0x48408a, 0x2c2850);
  const back = col('jug', 0x8ce4f4, 0x44b4d4, 0x3a6aa0);
  // 柜体：俱乐部蓝的漆（顶面 = 画面里最大的一块亮面）
  const body = col('canvasStripe', 0x40c8f4, 0x2c88d0, 0x374e98);
  // 瓶罐（正面在中档）：L 120～170，鲜
  const drinks = [
    col('toolOrange', 0xffb050, 0xf08a3c, 0x7a3456), // 橙 L ≈ 150
    col('ball', 0xb4e050, 0x74b034, 0x3a6a52), // 青柠 L ≈ 155
    col('fabricStripe', 0xff90b8, 0xf06aa0, 0x6a2a5e), // 粉 L ≈ 140
    col('canvasStripe', 0x70c8f8, 0x44a8e4, 0x2a4c8a), // 天蓝 L ≈ 150
    col('flowerYellow', 0xf8d860, 0xd0a030, 0x7a5a4a), // 黄 L ≈ 165
    col('clothPurple', 0xc090f0, 0xa070e0, 0x3a2a7a), // 紫 L ≈ 125
  ];

  const X = 11; // 半宽 11 纹素 = 0.99 米
  const ZF = 0.34 * M; // 门框正面
  const ZB = -0.36 * M; // 后面
  const top = 2.12 * M;
  // ── 柜体 ──
  slab(grille, -X, X, 0, 0.25 * M, ZB, ZF - 1, ['pz', 'py']); // 格栅（缩进 1 纹素）
  slab(body, -X, X, 1.996 * M, top, ZB, ZF, ['pz', 'py']); // 顶 + 门楣（1 行）
  slab(back, -X + 1, X - 1, 0.25 * M, 1.996 * M, ZB, ZB + 1, ['pz']); // 冷光后板
  // 门框：两边 + 两根中梃（1 纹素），下框 1 纹素（格栅顶上）
  for (const x0 of [-X, -4, 3, X - 1]) slab(frame, x0, x0 + 1, 0.25 * M, 1.996 * M, ZF - 1, ZF, ['pz']);

  // ── 门里五层：每层 = 货架前沿 1 行 + 货 ──
  const doors: [number, number][] = [
    [-10, -4],
    [-3, 3],
    [4, 10],
  ];
  const rows: { y: number; h: number; neck: boolean }[] = [
    { y: 0.25, h: 0.173, neck: false }, // 罐 A
    { y: 0.55, h: 0.173, neck: false }, // 罐 B（被"空了一排"信号盖住的那层）
    { y: 0.85, h: 0.255, neck: true }, // 瓶 C
    { y: 1.232, h: 0.255, neck: true }, // 瓶 D
    { y: 1.614, h: 0.255, neck: true }, // 瓶 E
  ];
  // 货架前沿、瓶罐正面都贴着玻璃（门框正面后 1 厘米）：45° 下不被上一层价签条、门楣挡住，
  // 贴在前面的"空了一排"信号（门框前 1～5 厘米）也正好盖住罐 B 这一层、不错位
  const zs = ZF - 0.01 * M;
  const zb = zs;
  rows.forEach((r, ri) => {
    const y0 = r.y * M;
    const y1 = y0 + R; // 价签条顶
    slab(strip, -X + 1, X - 1, y0, y1, zs - 4, zs, ['pz']);
    doors.forEach(([d0], di) => {
      for (let k = 0; k < 3; k++) {
        const m = drinks[(ri * 2 + di * 3 + k * (ri % 2 ? 1 : 2)) % drinks.length];
        const x0 = d0 + k * 2;
        if (r.neck) {
          slab(m, x0, x0 + 2, y1, y1 + 1.4 * R, zb - 2, zb, ['pz']); // 瓶身 1.4 行
          // 瓶颈 1 纹素：靠门中间那一侧（门边的那只瓶子旁边露出的冷光后板不贴着门框）
          const nx = k === 0 ? x0 + 1 : k === 2 ? x0 : x0 + (ri % 2);
          slab(m, nx, nx + 1, y1 + 1.4 * R, y1 + 2 * R, zb - 1.5, zb - 0.5, ['pz']);
        } else {
          slab(m, x0, x0 + 2, y1, y1 + r.h * M - 0.1, zb - 2, zb, ['pz', 'py']); // 罐
        }
      }
    });
  });

  const root = new THREE.Group();
  for (const [m, gs] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(gs), m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}
