// #59 冷柜空了一排（信号）：贴在冷柜墙（shop-fridge-wall）正面、罐 B 那一层（y 0.55..0.86）的一块薄板。
// 尺寸：1.80 宽 × 0.31 高 × 0.04 深（20 纹素 × 2.4 行；竖直 1 行 = √2 纹素 = 0.127 米）。
// 画的是"这一层空了"：底下 1 行货架前沿（浅蓝价签条，和冷柜同色）+ 每扇门一张荧光黄价签（3 纹素），
// 上面 1.4 行深靛的空格（看进去没货）；冷柜的两根中梃（1 纹素，门框色）压在最前面，这一排还是分成三扇门。
// 明暗：空格 L ≈ 100（暗）/ 价签条、中梃 L ≈ 120～140（中）/ 价签 L ≈ 175（亮），相邻差 < 60。
// 全是朝镜头的平面（厚 0.04 米）。材质：jug（借名，空格）、canvasStripe（价签条）、steel（中梃）、flowerYellow（价签）。三角形 14。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖直 1 屏幕行（纹素单位）
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** 朝 +z 的矩形（纹素坐标：x 从中心、y 从底）；z 米 */
  const quad = (m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z: number) => {
    const g = new THREE.PlaneGeometry((x1 - x0) * T, (y1 - y0) * T);
    g.translate(((x0 + x1) / 2) * T, ((y0 + y1) / 2) * T, z);
    const list = parts.get(m) ?? [];
    list.push(g);
    parts.set(m, list);
  };
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0 };
  const col = (key: Parameters<AssetCtx['mat']>[0], lit: number, mid: number, dark: number, edge = 0.3) =>
    ctx.mat(key, { ...face, edge, ramp: [lit, mid, dark] });
  const gap = col('jug', 0x4a64b0, 0x3a5098, 0x26305e, 0.2);
  const strip = col('canvasStripe', 0x80c0fc, 0x4c94e0, 0x34508e);
  const mullion = col('steel', 0xa0b8e4, 0x5a72bc, 0x34407a);
  const tag = col('flowerYellow', 0xf8d860, 0xd8b040, 0x7a5a4a, 0.4);

  const X = 10; // 半宽 10 纹素 = 0.9 米
  // 高 0.31 米：冷柜里的货贴着玻璃，这块板在货前面 2～6 厘米 → 45° 下顶边要比罐顶（0.84）高 2 厘米才盖得住
  const H = 0.31 / T;
  quad(gap, -X, X, R, H, -0.02); // 空格
  quad(strip, -X, X, 0, R, -0.015); // 价签条
  for (const x0 of [-8, -1, 5]) quad(tag, x0, x0 + 3, 0, R, -0.01); // 每扇门一张价签
  for (const x0 of [-4, 3]) quad(mullion, x0, x0 + 1, 0, H, 0.02); // 中梃（和冷柜墙的中梃对齐）

  const root = new THREE.Group();
  for (const [m, gs] of parts) {
    const mesh = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m);
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}
