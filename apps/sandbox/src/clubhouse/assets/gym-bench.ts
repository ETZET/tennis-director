// gym-bench · B1 自由重量区的平板卧推凳（南北放，头在北 −z）+ 头端的两根立柱架着一根杠（信号：凳面南半一滩汗 → 擦）。
// 尺寸 0.66 × 1.12 × 1.5 米（7 × 12 × 17 设计纹素）；凳面顶 y 0.45（姿势代理的卧推凳面高度）。
// 元素：红色凳垫（3.5 纹素宽、1.5 纹素厚）、银钢的脊梁 + 两条腿 + 两根脚横档、头端两根 2 纹素的立柱 + 杠托、
//   一根 1.5 纹素的杠（两头各一片蓝杠铃片 Ø0.36）；凳垫南半一滩深红的汗渍（两块叠成不规则的一团）+ 3 个浅色反光纹素。
// 杠只能 0.66 米长（规格宽 0.6 ± 10%，保护的人就站在凳子东边 0.8 米），所以立柱收在凳垫两侧、片挂在立柱外面。
// 朝镜头的面：lightUp + 低 bands；整件不接投影（小件，立柱的影子落在凳面上会碎成麻点）。
// 三角形：方块 11 × 12 + 汗渍 2 × 2 + 反光 3 × 2 + 片 2 × 32 = 206（预算 220）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const pad = ctx.mat('clothRed', { ...face, ramp: [0xff6a54, 0xd8384a, 0x8a2a5e], edge: 0.25, convex: 0.3 });
  const wet = ctx.mat('clothRed', { ...face, ramp: [0xcc4450, 0xa0304a, 0x6a2252], edge: 0.05, convex: 0 });
  const sheen = ctx.mat('clothRed', { ...face, ramp: [0xec7c74, 0xd0646c, 0x8a3a5e], edge: 0.05, convex: 0 });
  const steel = ctx.mat('ironwork', { ...face, ramp: [0xaab2ec, 0x9298d4, 0x5a5c9c], edge: 0.5, convex: 0.4 });
  const plateM = ctx.mat('clothBlue', { ...face, ramp: [0x5a9cff, 0x4a74e0, 0x5868d4], edge: 0.2, convex: 0.2 });

  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const list = parts.get(m) ?? [];
    list.push(g);
    parts.set(m, list);
  };
  /** 方块：x/z 中心，y 底 */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    add(m, new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z));
  /** 朝上的矩形（贴在凳面上） */
  const flat = (m: THREE.Material, w: number, d: number, x: number, y: number, z: number) =>
    add(m, new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z));

  const TOP = 0.45;
  const PT = 1.5 * T; // 凳垫厚
  const PW = 3.5 * T; // 凳垫宽
  const Z0 = -0.5; // 凳垫北头
  const Z1 = 0.74; // 凳垫南头
  // 凳垫
  box(pad, PW, PT, Z1 - Z0, 0, TOP - PT, (Z0 + Z1) / 2);
  // 钢：脊梁（垫子下面）、两条腿、两根脚横档（南脚、北脚 = 立柱底座）
  const SB = TOP - PT - T;
  box(steel, 2 * T, T, Z1 - Z0 - 0.2, 0, SB, (Z0 + Z1) / 2);
  box(steel, 2 * T, SB, 2 * T, 0, 0, Z1 - 0.2);
  box(steel, 2 * T, SB, 2 * T, 0, 0, Z0 + 0.12);
  const W = 0.6;
  box(steel, W, T, 2 * T, 0, 0, Z1 - 0.2);
  const ZU = -0.66; // 立柱（头端）
  box(steel, W, T, 2 * T, 0, 0, ZU);
  // 立柱：2 纹素，收在凳垫两侧；顶上杠托（U 形：底 + 后唇）
  const XU = 0.16;
  const HU = 1.0;
  for (const sx of [-1, 1]) {
    box(steel, 2 * T, HU, 2 * T, sx * XU, T, ZU);
    box(steel, 2 * T, T, T, sx * XU, HU + T, ZU - T / 2);
  }
  // 杠：1.5 纹素见方，架在杠托上；两头各一片蓝片（立柱外面）
  const BW = 1.5 * T;
  const BY = HU + T;
  box(steel, 0.66, BW, BW, 0, BY, ZU + T / 2);
  const r = 0.18;
  const t = 0.085;
  for (const sx of [-1, 1])
    add(
      plateM,
      new THREE.CylinderGeometry(r, r, t, 8, 1)
        .rotateY(Math.PI / 8)
        .rotateZ(Math.PI / 2)
        .translate(sx * (0.33 - t / 2 - 0.005), BY + BW / 2, ZU + T / 2),
    );
  // 汗渍：凳垫南半，两块叠成一团（深一档的红）+ 三个浅的反光纹素
  flat(wet, 2.5 * T, 3.5 * T, -0.25 * T, TOP + 0.002, 0.36);
  flat(wet, 1.5 * T, 2 * T, 0.5 * T, TOP + 0.003, 0.36 + 2.5 * T);
  flat(sheen, T, T, -T, TOP + 0.004, 0.36 - T);
  flat(sheen, T, T, 0, TOP + 0.004, 0.36);
  flat(sheen, T, T, T, TOP + 0.004, 0.36 + 2.5 * T);

  const root = new THREE.Group();
  for (const [m, gs] of parts) root.add(new THREE.Mesh(mergeGeometries(gs), m));
  ctx.mats.prepare(root);
  return root;
}
