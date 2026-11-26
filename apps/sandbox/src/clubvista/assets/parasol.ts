// 露台的米白遮阳伞（歇脚景）：八角伞面（米白 canvas，坡 ≈ 14°）+ 伞沿一圈垂边 + 顶上一颗小帽，伞杆 2 纹素粗。
// v0 大（伞面半径 1.35，沿高 2.2），v1 小（半径 1.0，沿高 2.05）—— 第 2 轮评判：三把一样的伞等距排开、和球场的伞同一个模型。
// 伞杆不投影（细杆的影子在石板上是一串虚线，"像在下雨"），伞面投影（桌子周围一块八角形的影子）。
// 本地原点 = 杆脚（桌心）的地面。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const big = ctx.variant % 2 === 0;
  const R = big ? 1.25 : 0.95;
  // 第 3 轮：伞降低（影子短一截），伞面近白 + 一圈 1 纹素的蓝下摆，南半边落暗档（伞读成伞，不是八角地砖）
  const yE = big ? 1.95 : 1.85;
  const yT = yE + R * 0.25;
  const g = new THREE.Group();
  g.name = 'parasol';
  const N = 8;
  const pos: number[] = [];
  const south: number[] = [];
  const skirt: number[] = [];
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2 + Math.PI / 8;
    const a1 = ((i + 1) / N) * Math.PI * 2 + Math.PI / 8;
    const p0 = [Math.cos(a0) * R, yE, Math.sin(a0) * R];
    const p1 = [Math.cos(a1) * R, yE, Math.sin(a1) * R];
    (Math.sin((a0 + a1) / 2) > 0.3 ? south : pos).push(0, yT, 0, ...p1, ...p0);
    // 垂边（只要朝南半圈的几片：朝北的看不见）
    if (Math.sin((a0 + a1) / 2) > -0.2) {
      const h = 0.1;
      skirt.push(...p0, p0[0], yE - h, p0[2], p1[0], yE - h, p1[2], ...p0, p1[0], yE - h, p1[2], ...p1);
    }
  }
  const mk = (arr: number[]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    geo.computeVertexNormals();
    return geo;
  };
  // 伞面法线朝外上方：反了就翻
  const up = (geo: THREE.BufferGeometry) => {
    if (geo.getAttribute('normal').getY(0) >= 0) return geo;
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) {
      const t = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)];
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, t[0], t[1], t[2]);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const cloth = ctx.mat('parasolWhite', { noShadowReceive: true, edge: 0.4, convex: 0.2, bands: [-2, -1.5] });
  const clothS = ctx.mat('parasolWhite', { noShadowReceive: true, edge: 0.4, convex: 0.2, bands: [-2, 2] });
  cloth.shadowSide = THREE.DoubleSide;
  clothS.shadowSide = THREE.DoubleSide;
  const canopy = new THREE.Mesh(up(mk(pos)), cloth);
  canopy.castShadow = true;
  const canopyS = new THREE.Mesh(up(mk(south)), clothS);
  canopyS.castShadow = true;
  g.add(canopyS);
  const sk = new THREE.Mesh(
    mk(skirt),
    ctx.mat('counter', { noShadowReceive: true, lightUp: 0.4, bands: [-0.4, 0.4], edge: 0.3, convex: 0.2 }),
  );
  sk.material.side = THREE.DoubleSide;
  const pole = new THREE.Mesh(
    mergeGeometries([
      new THREE.BoxGeometry(0.1, yT, 0.1).translate(0, yT / 2, 0),
      new THREE.BoxGeometry(0.2, 0.12, 0.2).translate(0, yT + 0.06, 0),
    ]),
    ctx.mat('wood', { noShadowReceive: true, lightUp: 0.5, bands: [-0.45, 0.3], edge: 0.3, convex: 0.3 }),
  );
  pole.castShadow = false;
  g.add(canopy, sk, pole);
  return g;
}
