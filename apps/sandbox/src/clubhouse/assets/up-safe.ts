// 保险柜（#77，总监办公室西北角）：0.7 × 1.0 × 0.6 米（≈ 8 × 11 × 6.7 设计纹素），门朝南（+z 对镜头）。
// 元素：墨绿的铸铁柜身（顶面亮档）+ 正面一扇凸出 3 厘米、亮一级的绿门（四周露 1 纹素的深绿门框）+ 西边两个深绿合页
// + 门上一只黄铜密码盘（2.4 纹素见方，中间一个深色的钮 = 一个环）+ 下面一根横的黄铜把手 + 底下往里收的深色底座。
// 三角形 96（柜身 12、门 12、底座 12、密码盘 12 + 钮 12、把手 12、合页 24）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, tones: undefined };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = T * Math.SQRT2;
  const g = new THREE.Group();
  g.name = 'up-safe';
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) =>
    g.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs.map((x) => x.toNonIndexed())) : gs[0], m));
  const W = 0.7;
  const H = 1.0;
  const D = 0.6;
  const FOOT = 0.08;
  const ZF = D / 2 - 0.08; // 柜身正面（门再凸 3 厘米）

  // 柜身：墨绿
  add(
    [box(W, H - FOOT, D - 0.08, 0, FOOT, -0.04)],
    ctx.mat('cactus', { ...FACE, ramp: [0x4cc078, 0x1e7a5c, 0x1c4a5a], edge: 0.5, convex: 0.4 }),
  );
  // 门：亮一级的绿，四周露 1 纹素门框
  const DW = W - 2 * T;
  const DY = FOOT + T;
  const DH = H - FOOT - 2 * T;
  add(
    [box(DW, DH, 0.03, 0, DY, ZF + 0.015)],
    ctx.mat('cactus', { ...FACE, ramp: [0x5cd088, 0x35a46c, 0x245e66], bands: [-0.6, 1.01], edge: 0.4, convex: 0.5 }),
  );
  // 底座
  add(
    [box(W - 2 * T, FOOT, D - 2 * T, 0, 0, 0)],
    ctx.mat('ironwork', { ...FACE, ramp: [0x4a5a7a, 0x2c3c62, 0x1e2850], edge: 0.3, convex: 0.2 }),
  );
  // 黄铜：密码盘（八边形，朝 +z）、把手、合页。正面落亮档 = 一眼是金色的
  const brass = ctx.mat('brass', {
    ...FACE,
    ramp: [0xf6c454, 0xd89a3c, 0x7a4a52],
    lightUp: 0.9,
    bands: [-0.45, 0.2],
    edge: 0.4,
    convex: 0.4,
  });
  const zd = ZF + 0.03;
  const dy = DY + DH - 2.4 * R; // 密码盘底
  const hy = DY + 1.2 * R; // 把手底
  add([box(2.4 * T, 2.4 * T, 0.04, 0, dy, zd + 0.02), box(3.4 * T, T, 0.04, 0, hy, zd + 0.02)], brass);
  // 密码盘中间的钮：深褐（盘读成一个环）
  add(
    [box(0.9 * T, 0.9 * T, 0.02, 0, dy + 0.75 * T, zd + 0.05)],
    ctx.mat('brass', { ...FACE, ramp: [0xb07038, 0x8a4c40, 0x5a3450], edge: 0.2, convex: 0.2 }),
  );
  // 合页：门西边两块深绿
  add(
    [box(T, 1.6 * T, 0.03, -DW / 2, DY + DH - 2.6 * T, zd), box(T, 1.6 * T, 0.03, -DW / 2, DY + T, zd)],
    ctx.mat('cactus', { ...FACE, ramp: [0x2a8a60, 0x1a5a50, 0x183a4c], edge: 0.2, convex: 0.2 }),
  );
  ctx.mats.prepare(g);
  return g;
}
