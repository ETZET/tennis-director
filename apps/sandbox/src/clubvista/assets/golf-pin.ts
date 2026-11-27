// 旗杆 + 洞（果岭上的）：白漆旗杆 2.1 米（不到 1 设计纹素见方，白 / 顶上一截深色）+ 一面旗（三变体：v0 红 = 这张图唯一的暖色焦点、
// v1 奶白、v2 俱乐部蓝；练习场远处的靶旗用 v1 / v2）+ 地上的洞杯（深色圆 + 一圈白边）。
// 旗面分两段、外段往后折一点（"风里飘着"的轮廓，不是一块平板）。本地原点 = 洞的中心，旗朝 +x 伸出。
// 细东西：旗杆、旗面都不接投影；场景里摆的时候 noCast（旗杆的影子落在果岭上是一串虚线）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const FLAG = ['clothRed', 'clothWhite', 'clothBlue'] as const;
const FACE = { lightUp: 0.5, bands: [-0.45, 0.4] as [number, number], noShadowReceive: true };

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'golf-pin';
  const v = ctx.variant % FLAG.length;
  const H = 2.1;
  const pole = T * 1.1;

  // ── 洞杯：深色的圆（直径 3 纹素）+ 外面一圈白（杯沿的白漆），贴着地 ──
  const rim = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14).translate(0, 0.012, 0);
  g.add(new THREE.Mesh(rim, ctx.mat('clothWhite', { edge: 0, convex: 0 })));
  const cup = new THREE.CylinderGeometry(0.13, 0.13, 0.02, 14).translate(0, 0.02, 0);
  g.add(new THREE.Mesh(cup, ctx.mat('ironwork', { edge: 0, convex: 0 })));

  // ── 旗杆：白，顶上 2 纹素一截深色（杆头） ──
  const poleG = box(pole, H - 2 * T, pole, 0, (H - 2 * T) / 2, 0);
  g.add(new THREE.Mesh(poleG, ctx.mat('clothWhite', { ...FACE, edge: 0.3, convex: 0.2 })));
  g.add(new THREE.Mesh(box(pole, 2 * T, pole, 0, H - T, 0), ctx.mat('ironwork', { ...FACE, convex: 0.2 })));

  // ── 旗面：两段（内段 0.32 平、外段 0.26 往后折），高 0.36（4 纹素），很薄 ──
  const fh = 4 * T;
  const fy = H - 2 * T - fh / 2;
  const inner = 0.32;
  const outer = 0.26;
  const parts: THREE.BufferGeometry[] = [box(inner, fh, 0.03, pole / 2 + inner / 2, fy, 0)];
  parts.push(
    box(outer, fh * 0.9, 0.03, outer / 2, 0, 0)
      .rotateY(0.45)
      .translate(pole / 2 + inner, fy - fh * 0.04, 0),
  );
  g.add(
    new THREE.Mesh(
      mergeGeometries(parts),
      ctx.mat(FLAG[v], { ...FACE, lightUp: 0.8, bands: [-0.95, -0.2], edge: 0.4, convex: 0.3 }),
    ),
  );

  ctx.mats.prepare(g, { receive: false });
  return g;
}
