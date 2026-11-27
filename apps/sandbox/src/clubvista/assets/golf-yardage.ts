// 码数牌（练习场远处的距离标）：一根矮木桩 + 顶上一块方牌（白底，中间一块彩色的圆 = 距离档：v0 红 50、v1 黄 100、v2 蓝 150），
// 牌底下一圈石头压着。不写字：颜色和远近就是码数。0.7 × 1.0 米。本地原点 = 桩脚的地面，牌面朝 +z（镜头）。
// 球道上远远的一个小白点 + 一点颜色：只是暗示"那边是练习场"，不抢焦点。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';
import type { Pal } from '../palette';

const T = 0.09;
const DOT: (keyof Pal)[] = ['clothRed', 'flowerYellow', 'clothBlue'];
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'golf-yardage';
  const v = ctx.variant % DOT.length;
  const postH = 0.6;
  const S = 0.62;

  // 木桩（3 纹素见方）+ 方牌的木框
  const wood: THREE.BufferGeometry[] = [
    box(3 * T, postH, 3 * T, 0, postH / 2, 0),
    box(S, S, 0.08, 0, postH + S / 2 - 0.04, 0),
  ];
  g.add(new THREE.Mesh(mergeGeometries(wood), ctx.mat('timber', { ...FACE, edge: 0.4, convex: 0.2 })));
  // 白牌面（比框每边窄 1 纹素）
  g.add(new THREE.Mesh(box(S - 2 * T, S - 2 * T, 0.03, 0, postH + S / 2 - 0.04, 0.05), ctx.mat('clothWhite', FACE)));
  // 彩色的圆点
  const dot = new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12)
    .rotateX(Math.PI / 2)
    .translate(0, postH + S / 2 - 0.04, 0.07);
  g.add(new THREE.Mesh(dot, ctx.mat(DOT[v], { ...FACE, edge: 0.3, convex: 0 })));
  // 桩脚一圈石头（3 块）
  const stones: THREE.BufferGeometry[] = [
    new THREE.DodecahedronGeometry(0.14, 0).scale(1.2, 0.6, 1).translate(-0.2, 0.06, 0.1),
    new THREE.DodecahedronGeometry(0.12, 0).scale(1, 0.6, 1.2).translate(0.2, 0.05, 0.08),
    new THREE.DodecahedronGeometry(0.1, 0).scale(1, 0.6, 1).translate(0.02, 0.04, 0.22),
  ];
  g.add(new THREE.Mesh(mergeGeometries(stones), ctx.mat('stepStone', { edge: 0.4, convex: 0.4 })));

  ctx.mats.prepare(g, { receive: false });
  return g;
}
