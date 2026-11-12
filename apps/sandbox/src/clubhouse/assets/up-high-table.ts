// 高脚桌（酒吧南段，站着喝的那张）：一根黄铜柱、黄铜圆底座、离地 0.3 的黄铜脚踏圈，顶上一张蜂蜜色木圆面（面高 1.05），面上一杯啤酒。
// 0.7 × 1.05 × 0.7 米（≈ 8 × 12 × 8 设计纹素）。站在它北边的人（slots 的 2f-bar-stand）面朝南、手里拿杯子。
// 元素：没有（小件：木面一整块亮档 + 前沿中档，黄铜靠三档 + 凸边）。
// 三角形 112（面 24 = 侧 16 + 顶 8，裙边 16，柱 16，脚踏圈 16，底座 16，啤酒 24）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const tube = (rTop: number, rBot: number, h: number, seg: number, y: number) =>
  new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true).translate(0, y + h / 2, 0);
const cap = (r: number, seg: number, y: number) =>
  new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2).translate(0, y, 0);
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) =>
    g.add(new THREE.Mesh(mergeGeometries(gs.map((x) => x.toNonIndexed())), m));
  const TOP = 1.05;
  const SLAB = 1.4 * T;
  const R = 0.35;
  // 木面：蜂蜜色，顶面亮档、前沿中档
  add(
    [tube(R, R, SLAB, 8, TOP - SLAB), cap(R, 8, TOP)],
    ctx.mat('wood', {
      ramp: [0xeaa45c, 0xc87c52, 0x6a3a5e],
      tones: undefined,
      lightUp: 0.4,
      bands: [-0.5, 0.45],
      edge: 0.45,
      convex: 0.35,
    }),
  );
  // 面下的深色裙边（1 纹素多一点，比面收进半纹素，2 纹素高）：亮的木面底下一条暗带
  add(
    [tube(R - 0.5 * T, R - 0.5 * T, 2 * T, 8, TOP - SLAB - 2 * T)],
    ctx.mat('wood', {
      ramp: [0x9a5a4a, 0x8a4a54, 0x4e2e58],
      tones: undefined,
      lightUp: 0.5,
      bands: [-0.7, 0.6],
      edge: 0.4,
      convex: 0.2,
      noShadowReceive: true,
    }),
  );
  // 黄铜：柱（2 纹素粗）、脚踏圈、底座
  const brass = ctx.mat('brass', {
    ramp: [0xf6c454, 0xb07434, 0x7a4a52],
    tones: undefined,
    lightUp: 0.45,
    bands: [-0.45, 0.4],
    edge: 0.5,
    convex: 0.45,
    side: THREE.DoubleSide,
    noShadowReceive: true,
  });
  add(
    [tube(0.09, 0.09, TOP - SLAB - 0.06, 8, 0.06), tube(0.2, 0.2, 1.4 * T, 8, 0.28), tube(0.09, 0.26, 0.07, 8, 0)],
    brass,
  );
  // 一杯啤酒（2 × 2 纹素的琥珀杯身 + 1 纹素白泡沫），摆在面的东南边
  const bx = 0.1;
  const bz = 0.08;
  add(
    [box(1.5 * T, 1.8 * T, 1.5 * T, bx, TOP, bz)],
    ctx.mat('flowerYellow', {
      ramp: [0xffb43c, 0xe0782c, 0x8a4440],
      tones: undefined,
      lightUp: 0.55,
      bands: [-0.45, 0.35],
      edge: 0.3,
      convex: 0.2,
      noShadowReceive: true,
    }),
  );
  add(
    [box(1.5 * T, 0.6 * T, 1.5 * T, bx, TOP + 1.8 * T, bz)],
    ctx.mat('clothWhite', {
      ramp: [0xfff6e4, 0xe8d8cc, 0x9a8aa8],
      tones: undefined,
      lightUp: 0.55,
      bands: [-0.45, 0.35],
      edge: 0.3,
      convex: 0.2,
      noShadowReceive: true,
    }),
  );
  ctx.mats.prepare(g);
  return g;
}
