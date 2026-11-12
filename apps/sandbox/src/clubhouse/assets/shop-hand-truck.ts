// 货梯厅的手推车（#68，搬货箱进货梯用）：立着、正面朝南，0.54 × 1.15 × 0.45 米 = 6 × 13 × 5 纹素。
// 元素：橙色的车架（两根 1 纹素的立管、顶上一道把手、两道横撑），立管中间一块深靛的网板（网不画网眼：一块暗面），
// 脚下一块往前伸的不锈钢托板（顶面亮）；后面两只深色的轮子（圆柱，轴沿 x，在立管后面，从托板和网板两边露出一点）。
// 横着相邻的（橙 | 网板 | 橙）亮度差 < 60：网板 L ≈ 95、橙管 L ≈ 145。三角形 ≈ 140（预算 180）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.3 };

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

  // ── 材质 ──
  const orange = ctx.mat('toolOrange', { ...FACE, ramp: [0xffa848, 0xf08030, 0x8a3a4a] });
  const mesh = ctx.mat('ironwork', { ...FACE, ramp: [0x6a5aa8, 0x4c4890, 0x2c2858] });
  const plate = ctx.mat('steel', { ...FACE });
  const tire = ctx.mat('ironwork', {
    lightUp: 0.3,
    bands: [-0.2, 0.5],
    noShadowReceive: true,
    convex: 0.2,
    ramp: [0x7a76a8, 0x585888, 0x34345a],
  });

  // ── 托板：6 × 0.5 × 3，往前伸（正面 z +2.5）──
  box(plate, 6, 0.5, 3, 0, 0, 1);
  // ── 轮子：轴沿 x，在立管后面（x ±2.4、z −0.7），半径 1.8 ──
  for (const sx of [-1, 1])
    put(
      tire,
      new THREE.CylinderGeometry(1.8 * T, 1.8 * T, 1.2 * T, 8)
        .rotateZ(Math.PI / 2)
        .translate(sx * 2.4 * T, 1.8 * T, -0.7 * T),
    );
  // ── 车架：两根立管（托板上 → 9 行）、顶上把手、两道横撑；中间的网板 ──
  const y0 = 0.5;
  const top = 9 * R;
  for (const sx of [-1, 1]) box(orange, 1, top - y0, 1, sx * 2.5, y0, 0);
  box(orange, 6, R, 1, 0, top - R, 0);
  for (const r of [3, 6]) box(orange, 4, R, 0.8, 0, r * R, 0);
  front(mesh, 4, top - R - (R + y0), 0, R + y0, -0.2);

  const root = new THREE.Group();
  root.name = 'shop-hand-truck';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
