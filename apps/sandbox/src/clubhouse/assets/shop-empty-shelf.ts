// 便利店零食架上空了的一格（#63，信号：卖空了 → 去货梯厅搬一箱上来）：贴在零食架（shop-snack-shelves）正面，0.63 × 0.38 × 0.04 米 = 7 × 3 行 × 0.4 纹素。
// 摆在 slots-1f.ts 的 kiosk-empty（y 0.6，z = 货架正面）：画的高度对着货架最上面一层货（货架的 7 行起、2 行高），
// 所以本地 y 从 0.29 米起（画廊里浮在地台上 0.29 米）。
// 元素：上面 1 行是背板的暗处（深靛，空格子里看得见的背板）、下面 1 行是光秃秃的层板（亮蓝，被顶灯照着）；
// 下面那条价签上挂一张 3 纹素宽的红色"缺货"签（没有字）。三角形 16（预算 40）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.2 };
/** 摆放高度（slots-1f.ts 的 kiosk-empty y）和货架最上面一层货的底（shop-snack-shelves：7 行，1 行 = √2 纹素） */
const SLOT_Y = 0.6;

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2;
  const y0 = (7 * R * T - SLOT_Y) / T; // 本地纹素：这一层货的底
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };

  const back = ctx.mat('ironwork', { ...FACE, ramp: [0x4a5ac0, 0x2c3ca8, 0x262a70] });
  const deck = ctx.mat('counter', { ...FACE, ramp: [0x9ad4ff, 0x7cc4ff, 0x3a5aa0] });
  const tag = ctx.mat('clothRed', { ...FACE, ramp: [0xff7a5a, 0xf05a44, 0x8a2e52] });

  const D = 0.034 / T; // 盒子 0.034 米 + 两片贴面 = 0.04 米
  // 空格子：7 宽 × 2 行的盒子（正面 = 背板的暗处），下面一行盖一片亮的层板
  put(back, new THREE.BoxGeometry(7 * T, 2 * R * T, D * T).translate(0, (y0 + R) * T, 0));
  put(deck, new THREE.PlaneGeometry(7 * T, R * T).translate(0, (y0 + R / 2) * T, (D / 2) * T + 0.002));
  // 缺货签：挂在下面那条价签上（3 × 1 行），靠左
  put(tag, new THREE.PlaneGeometry(3 * T, R * T).translate(-1.5 * T, (y0 - R / 2) * T, (D / 2) * T + 0.004));

  const root = new THREE.Group();
  root.name = 'shop-empty-shelf';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root, { cast: false });
  return root;
}
