// gym-cable · 龙门架 / 功能训练架（B1 器械循环，slots-b1 的 gym-cable）。
// 尺寸：2.88 × 2.34 × 0.99 米（32 × 26 × 11 纹素，w × h × d）；规格 3 × 2.3 × 1。正面朝 +z（镜头）。
// 两座配重塔（两根灰钢立柱 + 中间深色的片 + 顶上一块亮压板），顶上一根刷会所青的横梁连着；塔下前后两条包胶的深色地梁（和器械那排的底梁一样）。
// 塔的里侧各有一个高滑轮和一个中间的滑车（3 纹素的块，橙），各垂一根 1 纹素的钢索（共 4 根）到一个红握把。
// 元素：钢架 `paint`（低频深浅块）。
// 三角形：24 个盒子，去掉底面 × 10 = 240（预算 350）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, edge: 0.3 };
  const steel = ctx.mat('metal', {
    ...face,
    ramp: [0xa8baf6, 0x7686d2, 0x40449a],
    convex: 0.25,
    elem: { kind: 'paint', size: [8, 5], density: [0, 0.02], patch: 2 },
  });
  const stackM = ctx.mat('ironwork', { ...face, ramp: [0x7c6cc2, 0x5c4ca2, 0x3c2e7a], convex: 0.2 });
  const plateM = ctx.mat('signPaint', { noShadowReceive: true, edge: 0.3, convex: 0.3 });
  const cableM = ctx.mat('ironwork', { ...face, ramp: [0x5a4c98, 0x423678, 0x2e2658], convex: 0 });
  const pulleyM = ctx.mat('toolOrange', { ...face, convex: 0.25 });
  const gripM = ctx.mat('clothRed', { ...face, ramp: [0xf4523e, 0xc42e42, 0x6a1e54], convex: 0.25 });
  const signM = ctx.mat('clothTeal', { ...face, ramp: [0x2ccab2, 0x16989a, 0x1a5480], convex: 0.2 });

  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** 盒子（纹素坐标的最小 / 最大），去掉底面 */
  const b = (m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const g = new THREE.BoxGeometry((x1 - x0) * T, (y1 - y0) * T, (z1 - z0) * T);
    const idx = Array.from(g.index!.array);
    idx.splice(18, 6);
    g.setIndex(idx);
    g.clearGroups();
    g.translate(((x0 + x1) / 2) * T, ((y0 + y1) / 2) * T, ((z0 + z1) / 2) * T);
    const l = parts.get(m) ?? [];
    l.push(g);
    parts.set(m, l);
  };

  for (const s of [-1, 1]) {
    /** 本地 x：s = −1 西塔、+1 东塔；a..b 从外往里 */
    const X = (a: number, c: number): [number, number] => (s < 0 ? [-a, -c] : [c, a]);
    // 底座：塔下一条前后通长的地梁（包胶，深色）
    b(stackM, ...X(16, 8), 0, 1, -6, 5);
    // 塔：两根立柱 + 配重片 + 亮压板
    b(steel, ...X(16, 14), 0, 24, -6, -3);
    b(steel, ...X(10, 8), 0, 24, -6, -3);
    b(stackM, ...X(14, 10), 1, 21, -5, -3);
    b(plateM, ...X(14, 10), 21, 22, -5, -3);
    // 里侧：高滑轮 + 中间的滑车（3 纹素的块），各垂一根钢索到握把
    b(pulleyM, ...X(8, 5), 21, 24, -5, -2);
    b(pulleyM, ...X(8, 5), 10, 13, -5, -2);
    b(cableM, ...X(7, 6), 16, 21, -4, -3);
    b(cableM, ...X(7, 6), 6, 10, -4, -3);
    b(gripM, ...X(8, 5), 14, 16, -4, -2);
    b(gripM, ...X(8, 5), 4, 6, -4, -2);
  }
  b(stackM, -8, 8, 0, 1, -6, -3); // 两塔之间的地梁
  b(signM, -16, 16, 24, 26, -6, -3); // 顶梁（刷会所青）

  const root = new THREE.Group();
  for (const [m, gs] of parts) root.add(new THREE.Mesh(mergeGeometries(gs), m));
  ctx.mats.prepare(root);
  return root;
}
