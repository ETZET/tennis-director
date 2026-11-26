// suitcase：刚下接驳车的人的行李箱，立着，拉杆抽出一截。0.45 × 0.89 × 0.27 米（箱身 5 纹素 × 4 行 × 3 纹素，拉杆 2 行 + 横把 1 纹素）。
// 硬壳箱身（slate 暗青：颜色收着，不和前台的帆抢）正面中间一道竖缝（两半壳一深一浅）；
// 箱顶一个小提手，后沿两根 1 纹素的拉杆 + 一根横把（ironwork），底下四只小轮子（tyre）。
// 小道具：不接投影（阴影贴图的毛边落在小面上是麻点）；朝镜头的正面 lightUp + 低 bands，不全黑。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const ROW = T / Math.SQRT1_2;

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
  if (!g) throw new Error('suitcase: merge failed');
  return g;
}

const FACE = { lightUp: 0.5, bands: [-0.45, 0.3] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'suitcase';
  const W = 5 * T;
  const D = 3 * T;
  const y0 = 0.07;
  const hB = 4 * ROW;
  const shell: THREE.BufferGeometry[] = [];
  const iron: THREE.BufferGeometry[] = [];
  const wheel: THREE.BufferGeometry[] = [];

  // 箱身 4 行的直角盒子（试过四角各倒 1 纹素：45° 下读成一只圆垃圾桶）
  shell.push(box(W, hB, D, 0, y0 + hB / 2, 0));
  // 箱顶的提手：一小块 2 纹素的横条，贴着箱顶前沿
  iron.push(box(2 * T, T, T, 0, y0 + hB + T / 2, D / 2 - T));

  // 拉杆：两根 1 纹素的杆从箱顶后沿抽出 2 行（中间空 2 纹素，看得见后面的地），上面一根横把
  const top = y0 + hB;
  const rodH = 2 * ROW;
  const rz = -D / 2 + T / 2;
  for (const sx of [-1, 1]) iron.push(box(T, rodH, T, sx * 1.5 * T, top + rodH / 2, rz));
  iron.push(box(4 * T, T, T, 0, top + rodH + T / 2, rz));

  // 轮子：底下四角四只小方轮（前面两只看得见）
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) wheel.push(box(T, y0, T, sx * (W / 2 - T), y0 / 2, sz * (D / 2 - T / 2)));
  }

  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => g.add(new THREE.Mesh(merge(geos), mat));
  // 壳：正面中间一道竖缝（两半壳）—— 板宽 = 半个箱宽，缝落在 x = 0；不画亮条
  add(
    shell,
    ctx.mat('slate', {
      ...FACE,
      convex: 0.3,
      elem: { kind: 'planks', p: [1, 0, 0, W / 2], seam: 1, hi: 0 },
      toneW: [0.5, 0],
    }),
  );
  add(iron, ctx.mat('ironwork', { ...FACE, convex: 0.2 }));
  add(wheel, ctx.mat('tyre', { ...FACE, convex: 0 }));
  ctx.mats.prepare(g, { receive: false });
  return g;
}
