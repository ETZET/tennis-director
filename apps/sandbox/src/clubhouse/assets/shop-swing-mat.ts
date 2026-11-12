// 穿线 · 试拍吧 · 试挥垫（#50）：平铺在地上（noBlock），长边沿 z。2.4 × 0.03 × 3.4 米 = 26.7 × 0.3 × 37.8 纹素（画面上 27 × 27）。
// 一小条球场：外场绿的边（2 纹素）+ 硬地蓝的内场 + 白线（两条边线、南头的底线 + 中点、发球线、发球线往北的中线），
// 底线后面两只黄的脚印（站位）。横线 1.5 纹素深（45° 下 ≈ 1 行），竖线 1 纹素宽。
// 都是朝天的面（亮档）：蓝 L 148、绿 L 153、线 L ≈ 200（线和场地差 ≈ 50）。三角形 ≈ 30。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const H = 0.03;
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** 朝天的片（纹素）：x0…x1、z0…z1（+z = 南），层 */
  const top = (m: THREE.Material, x0: number, x1: number, z0: number, z1: number, layer: number) => {
    const g = new THREE.PlaneGeometry((x1 - x0) * T, (z1 - z0) * T)
      .rotateX(-Math.PI / 2)
      .translate(((x0 + x1) / 2) * T, H + 0.003 * layer, ((z0 + z1) / 2) * T);
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };

  const opt = { noShadowReceive: true, convex: 0, edge: 0 };
  const green = ctx.mat('surround', { ...opt, edge: 0.3 });
  const blue = ctx.mat('court', opt);
  const line = ctx.mat('line', { ...opt, ramp: [0xd8ecec, 0xb4c8dc, 0x7a86b4] });
  const foot = ctx.mat('ball', { ...opt, ramp: [0xf0d848, 0xc8b040, 0x7a7a5a] });

  const HW = 13.3; // 半宽
  const HD = 18.9; // 半长
  // 垫子（绿边）：一个薄盒子，底面看不见
  const base = new THREE.BoxGeometry(2 * HW * T, H, 2 * HD * T).translate(0, H / 2, 0);
  // 内场
  top(blue, -HW + 2, HW - 2, -HD + 2, HD - 2, 1);
  // 线：边线 x ±8，底线 z +11（南），发球线 z −5，中线从发球线到北头，底线中点
  const SX = 8;
  const ZB = 11;
  const ZS = -5;
  const ZN = -HD + 2;
  for (const s of [-1, 1]) top(line, s * SX - 0.5, s * SX + 0.5, ZN, ZB + 1.5, 2);
  top(line, -SX, SX, ZB, ZB + 1.5, 2);
  top(line, -SX, SX, ZS, ZS + 1.5, 2);
  top(line, -0.5, 0.5, ZN, ZS, 2);
  top(line, -0.5, 0.5, ZB - 1.5, ZB, 2);
  // 脚印（底线后面，2 × 3 纹素）
  for (const s of [-1, 1]) top(foot, s * 2.5 - 1, s * 2.5 + 1, ZB + 2.5, ZB + 5.5, 2);

  const root = new THREE.Group();
  root.name = 'shop-swing-mat';
  root.add(new THREE.Mesh(base, green));
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
