// 收银台（#31，×3：专卖店、纪念品店、便利店，slots-1f 里都是 v0）：朝南（+z 对镜头），店员站在北边（台后）。
// 1.98 × 1.4 × 0.63 米 = 22 × 15.6 × 7 纹素（台面 0.9 米 = 7 行；球罐摞到 11 行 ≈ 1.45 米）。
// 元素：会所蓝的台身（正面三块浅一级的面板，中间 1 纹素的框露台身色）+ 一行深靛的踢脚
// + 浅枫木色的台面（前沿出 1 纹素）；台面东头一台收银机（深色机身 + 朝镜头斜着的青色屏），西头一座球罐金字塔（2-1，荧光黄罐身 + 白盖顶）。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 140（预算 250）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** 朝镜头的竖直面：中档 */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 朝镜头、要落亮档的小面 */
const GLOW = { lightUp: 0.55, bands: [-0.9, -0.6] as [number, number], noShadowReceive: true, convex: 0.2 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2;
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 盒子（纹素）：宽、高（行）、深，x / z 中心，y 底（行） */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * R * T, d * T).translate(x * T, (y + h / 2) * R * T, z * T));
  /** 朝镜头的薄片（纹素 / 行）：左下角 x0、行 y0，宽 w、高 h 行，z 纹素 */
  const face = (m: THREE.Material, x0: number, y0: number, w: number, h: number, z: number, layer = 1) =>
    put(
      m,
      new THREE.PlaneGeometry(w * T, h * R * T).translate(
        (x0 + w / 2) * T,
        (y0 + h / 2) * R * T,
        z * T + 0.004 * layer,
      ),
    );

  // ── 材质 ──
  const body = ctx.mat('counter', { ...FACE, ramp: [0x40a8ec, 0x2a74b8, 0x2d4991], convex: 0.3 });
  const panel = ctx.mat('counter', { ...FACE, ramp: [0x56b8f0, 0x3c96dc, 0x34529a] });
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x4a4a7a, 0x3a3a6a, 0x262448] });
  const top = ctx.mat('counterTop', { ...FACE, ramp: [0xf2cc96, 0xc88458, 0x8a5a7a], convex: 0.5 }); // 顶面亮档、前沿中档
  const till = ctx.mat('ironwork', { ...FACE, ramp: [0x6a6894, 0x585680, 0x3a3860], convex: 0.3 });
  const screen = ctx.mat('glass', { ...GLOW, ramp: [0x5cd0d8, 0x48aeba, 0x3a86a0] });
  const can = ctx.mat('ball', { ...FACE, ramp: [0xd8f050, 0xb4d444, 0x6a8a5a], convex: 0.3 });
  const lid = ctx.mat('clothWhite', { ...GLOW, ramp: [0xf4f0e8, 0xd8d0dc, 0x8a7ea8] });

  // ── 台身：x −11…+11（22 纹素），z −3…+3（6 纹素）。踢脚 1 行（前面收 1 纹素），台身 5 行，台面 1 行（前沿出 1 纹素）──
  box(kick, 22, 1, 6, 0, 0, 0); // 踢脚和台身齐平（往里收 1 纹素在 45° 下只露 0.3 行）
  box(body, 22, 5, 6, 0, 1, 0); // 正面 z +3
  // 三块面板（各 6 纹素 × 3 行；框 1 纹素，露台身色）
  for (const x0 of [-10, -3, 4]) face(panel, x0, 2, 6, 3, 3);
  box(top, 22, 1, 7, 0, 6, 0.5); // 台面 6…7 行，z −3…+4

  // ── 台面东头：收银机（机身 5 × 1 行 × 4，上面一块朝镜头斜 30° 的屏 4 × 3 纹素 + 屏背）──
  box(till, 5, 1, 4, 6.5, 7, -0.5);
  const tilt = (g: THREE.BufferGeometry, z: number) =>
    g.rotateX(-Math.PI / 6).translate(6.5 * T, 8 * R * T + 1.3 * T, z * T);
  put(screen, tilt(new THREE.PlaneGeometry(4 * T, 3 * T), -1.1));
  put(till, tilt(new THREE.BoxGeometry(4 * T, 3 * T, 0.6 * T), -1.5));

  // ── 台面西头：球罐金字塔 2-1（每罐 3 纹素宽 × 2 行 × 3 深的荧光黄罐身 + 薄薄一片白盖：45° 下盖子是罐顶那 2 行白）──
  const LID = 0.35 / R; // 盖子厚 0.35 纹素（行）
  const can1 = (x0: number, y: number) => {
    box(can, 3, 2, 3, x0 + 1.5, y, 0.5);
    box(lid, 3, LID, 3, x0 + 1.5, y + 2, 0.5);
  };
  can1(-10, 7);
  can1(-6, 7); // 两罐之间空 1 纹素
  can1(-8, 9 + LID);

  const root = new THREE.Group();
  root.name = 'shop-counter';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
