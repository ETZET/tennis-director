// 吧凳：一根钢柱 + 一张圆皮面座（面高 0.75 = 接口高度）+ 钢脚踏圈 + 圆底座。
// 0.42 × 0.75 × 0.42 米（≈ 5 × 8 × 5 设计纹素）。v0 牛血红皮面，v1 青绿皮面。
// 元素：没有（小件，皮面一整块颜色靠法线的三档 + 上沿亮边）。
// 三角形 72（座 24 = 侧 16 + 顶 8，柱 8，脚踏圈 16，底座 24）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
/** 开口的圆柱（只有侧面），底在 y */
const tube = (rTop: number, rBot: number, h: number, seg: number, y: number) =>
  new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true).translate(0, y + h / 2, 0);
/** 圆盖（朝上），在 y */
const cap = (r: number, seg: number, y: number) =>
  new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2).translate(0, y, 0);

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) =>
    g.add(new THREE.Mesh(mergeGeometries(gs.map((x) => x.toNonIndexed())), m));
  const TOP = 0.75;
  const SEAT = 1.4 * T; // 皮垫厚
  const R = 0.2;
  const teal = ctx.variant % 2 === 1;
  // 皮面：牛血红 / 青绿；侧面朝镜头靠 lightUp 落中档，顶面亮档
  const leather = teal
    ? ctx.mat('clothTeal', {
        ramp: [0x00c4b4, 0x00a4b4, 0x0a5a8c],
        lightUp: 0.45,
        bands: [-0.95, 0.45],
        edge: 0.4,
        convex: 0.3,
        noShadowReceive: true,
      })
    : ctx.mat('clothRed', {
        ramp: [0xd65048, 0xb43c4c, 0x5c2048],
        lightUp: 0.45,
        bands: [-0.95, 0.45],
        edge: 0.4,
        convex: 0.3,
        noShadowReceive: true,
      });
  add([tube(R, R, SEAT, 8, TOP - SEAT), cap(R, 8, TOP)], leather);
  // 钢：带一点青蓝的冷钢（本色就灰，往蓝里挑一点饱和）
  const steel = ctx.mat('steel', {
    ramp: [0x88c0f0, 0x5682d6, 0x30408e],
    tones: undefined,
    lightUp: 0.5,
    bands: [-0.45, 0.35],
    edge: 0.5,
    convex: 0.45,
    noShadowReceive: true,
    side: THREE.DoubleSide,
  });
  const postH = TOP - SEAT - 0.04;
  add(
    [
      // 柱：2 纹素见方的四棱（转 45°，一条竖棱朝镜头）
      tube(0.08, 0.08, postH, 4, 0.04),
      // 脚踏圈：离地 0.3，2 纹素高的一圈
      tube(0.17, 0.17, 1.6 * T, 8, 0.28),
      // 底座：矮的圆台
      tube(0.12, 0.18, 0.05, 8, 0),
      cap(0.12, 8, 0.05),
    ],
    steel,
  );
  ctx.mats.prepare(g);
  return g;
}
