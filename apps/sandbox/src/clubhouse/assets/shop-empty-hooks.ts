// 专卖店 · 空挂钩（#47，信号：拍子卖空了）：挂在拍子墙东头前面（slots-1f 的 y 1.15），朝南（+z 对镜头）。
// 1.08 × 0.51 × 0.045 米 = 12 × 5.7 × 0.5 纹素（4 行）。
// 元素：浅桦木的挂板（一条横槽）+ 底下一条深色托条 + 三根空着的钢挂钩
// （每根 2 纹素宽、2 行：上一行亮档的钩子顶，下一行暗的钩身 + 投在板上的影 —— 45° 下往镜头伸出来的钩子就是这样一小竖条）
// + 右上角一张红色的"售罄"小卡。挂钩画在板面上（不往外伸：规格深 0.05 米）。三角形 30（预算 60）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** 朝镜头的竖直面：中档 */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.2 };
/** 朝镜头、要落亮档的小面 */
const GLOW = { lightUp: 0.55, bands: [-0.9, -0.6] as [number, number], noShadowReceive: true, convex: 0.2 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2;
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 朝镜头的薄片（纹素 / 行）：左下角 x0（从板的西沿算）、行 y0，宽 w、高 h 行 */
  const face = (m: THREE.Material, x0: number, y0: number, w: number, h: number, layer = 1) =>
    put(
      m,
      new THREE.PlaneGeometry(w * T, h * R * T).translate(
        (x0 - 6 + w / 2) * T,
        (y0 + h / 2) * R * T,
        0.25 * T + 0.004 * layer,
      ),
    );

  // ── 材质 ──
  // 挂板：浅桦木（比拍子墙的蜂蜜色亮、偏黄）；横条的槽是一条薄片（只一条：多了就是横条纹）
  const board = ctx.mat('woodWeathered', { ...FACE, ramp: [0xf8c070, 0xeca050, 0x8e6a84] });
  const groove = ctx.mat('woodWeathered', { ...FACE, ramp: [0xdc9a58, 0xcc8040, 0x7a5a74] });
  const rail = ctx.mat('wood', { ...FACE, ramp: [0xb4604a, 0x9a5040, 0x5e426e] });
  const pegTop = ctx.mat('steel', { ...GLOW, ramp: [0xa8c4e8, 0x98b0d4, 0x8c9cb0] });
  const pegLow = ctx.mat('steel', { ...GLOW, ramp: [0x6474c4, 0x5464b0, 0x404c90] });
  const tag = ctx.mat('clothRed', { ...GLOW, ramp: [0xf0584a, 0xc03c4c, 0x6a2a5a] });

  // 板：12 纹素宽、4 行高、0.5 纹素厚
  put(board, new THREE.BoxGeometry(12 * T, 4 * R * T, 0.5 * T).translate(0, 2 * R * T, 0));
  face(rail, 0, 0, 12, 1); // 底下的托条
  face(groove, 0, 2, 12, 1); // 挂钩插着的那条槽
  // 三根空挂钩：x 2…4、5…7、8…10，第 1～2 行
  for (const x of [2, 5, 8]) {
    face(pegLow, x, 1, 2, 1);
    face(pegTop, x, 2, 2, 1);
  }
  face(tag, 8, 3, 3, 1, 2); // "售罄"小卡（红）

  const root = new THREE.Group();
  root.name = 'shop-empty-hooks';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
