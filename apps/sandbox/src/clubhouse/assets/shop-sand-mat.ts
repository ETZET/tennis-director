// 电梯门厅南门里的进门垫（#66，信号：垫子上积了一堆沙 → 该抖垫子、扫沙了）：1.35 × 0.03 × 0.99 米 = 15 × 11 纹素。
// 南门（钟楼南墙，门口 x −47.6）在垫子的南边（+z）、偏西 0.35 米。
// 元素：蓝的垫子（一圈 1 行 / 1 纹素的深靛边）+ 里面横着的三条浅蓝条纹（每条 1 屏幕行 = √2 纹素深；横纹在屏幕上是水平的，不出强边缘）；
// 南半边靠门那头一堆沙（低的六棱锥，高 0.16 米：背坡亮、朝镜头的坡中档）+ 两小团踢散的沙。平铺在地上，接投影，几乎不描边。
// 三角形 36（预算 40）。
// userData.setSignal(on)：垫子上有没有沙（默认 true = 原样；stage 3：总监抖过垫子 = false，只剩干净的垫子）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FLAT = { edge: 0.08, convex: 0 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 地面纵深上的 1 屏幕行（纹素）
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  const H = 0.03; // 垫子厚（米）
  /** 垫子上的一片（纹素）：宽 w（x）、深 d（z），中心 x、z */
  const flat = (m: THREE.Material, w: number, d: number, x: number, z: number, lift = 0.002) =>
    put(m, new THREE.PlaneGeometry(w * T, d * T).rotateX(-Math.PI / 2).translate(x * T, H + lift, z * T));

  // 亮度从边到沙一级一级上去（横着相邻的差都 < 60）：深靛的边 L ≈ 100 → 蓝的垫身 140 → 浅蓝条纹 181 → 沙 193
  const rim = ctx.mat('canvasStripe', { ...FLAT, ramp: [0x4a64b4, 0x3a4c9a, 0x222a5a] });
  const mat = ctx.mat('canvasStripe', { ...FLAT, ramp: [0x4a94d8, 0x3a74b8, 0x2a3a78] });
  const stripe = ctx.mat('canvasStripe', { ...FLAT, ramp: [0x7cc0f0, 0x5a9ad4, 0x3a5a98] });
  const sand = ctx.mat('straw', { edge: 0.15, convex: 0.1, ramp: [0xe4b880, 0xc8945e, 0x8a6a7a] });
  // 沙堆：朝镜头的坡（l 小）落中档、背坡和顶落亮档
  const heap = ctx.mat('straw', { edge: 0.15, convex: 0.1, bands: [0.1, 0.72], ramp: [0xe4b880, 0xc8945e, 0x8a6a7a] });

  // ── 垫子：15 × 11（深 11 纹素 ≈ 7.8 行：上下边各 1 行，中间三条蓝纹、两条深靛）──
  const W = 15;
  const D = 11;
  put(rim, new THREE.BoxGeometry(W * T, H, D * T).translate(0, H / 2, 0));
  flat(mat, W - 2, D - 2 * R, 0, 0, 0.001);
  for (const k of [-2, 0, 2]) flat(stripe, W - 4, R, 0, k * R);

  // ── 沙：门那头（南、偏西）一堆，低的六棱锥（半径 3、高 0.16 米，整堆在边里面）+ 两小团 ──
  put(heap, new THREE.ConeGeometry(3 * T, 0.16, 6, 1, true).translate(-3 * T, H + 0.08, 1 * T));
  flat(sand, 3, 2, 1.5, 3, 0.003);
  flat(sand, 2, 2, 4, -1, 0.003);

  const root = new THREE.Group();
  root.name = 'shop-sand-mat';
  const sandy: THREE.Mesh[] = [];
  for (const [m, gs] of bins) {
    const mesh = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m);
    if (m === sand || m === heap) sandy.push(mesh);
    root.add(mesh);
  }
  root.userData.setSignal = (on: boolean) => {
    for (const mesh of sandy) mesh.visible = on;
  };
  ctx.mats.prepare(root, { cast: false, receive: true });
  return root;
}
