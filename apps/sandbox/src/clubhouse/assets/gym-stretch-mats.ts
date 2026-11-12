// 拉伸区的拉伸垫：两张铺开的厚青绿垫（1 纹素厚，三折的折痕横着），东头一张叠成三层的放在垫子北半。
// 2.7 × 0.40 × 1.89 米（30 × 4.4 × 21 设计纹素）。
// 元素：垫面 planks（沿 z 每 0.63 米一折，折痕 1 纹素缝 + 亮条）；叠着的那张沿 y 每 0.135 米一道缝（三层）。
// 三角形 36（两张铺开的 2 × 12 + 叠着的 12）。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const L = 21 * T; // 铺开的长（南北）
  // 两张铺开的：西边一张浅薄荷青、中间一张深一点的青（两种青，不是一整块）
  const flat = (ramp: [number, number, number], x: number, w: number, seed: number) =>
    g.add(
      new THREE.Mesh(
        box(w, T, L, x, 0, 0),
        ctx.mat('clothTeal', {
          ramp,
          tones: undefined,
          edge: 0.3,
          convex: 0.15,
          elem: { kind: 'planks', p: [0, 0, 1, 7 * T], seam: 1, hi: 1, seed },
        }),
      ),
    );
  flat([0x52e4c8, 0x24aaa0, 0x1e5e7e], -9.5 * T, 11 * T, 1);
  flat([0x26c4ac, 0x1a8c94, 0x1a4e70], 2.5 * T, 11 * T, 2);
  // 叠着的：三层（每层 1.5 纹素，顶面落在一层的中间 → 不压在缝上），7 纹素宽、10 纹素深，放在东头北半
  g.add(
    new THREE.Mesh(
      box(7 * T, 0.4, 10 * T, 11.5 * T, 0, -5 * T),
      ctx.mat('clothTeal', {
        ramp: [0x52e4c8, 0x24aaa0, 0x1e5e7e],
        tones: undefined,
        lightUp: 0.5,
        bands: [-0.45, 0.35],
        edge: 0.5,
        convex: 0.3,
        noShadowReceive: true,
        elem: { kind: 'planks', p: [0, 1, 0, 0.135], seam: 1, hi: 0 },
      }),
    ),
  );
  ctx.mats.prepare(g);
  return g;
}
