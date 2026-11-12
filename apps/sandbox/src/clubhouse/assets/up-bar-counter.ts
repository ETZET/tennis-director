// 吧台（会员酒吧）：红木的吧台正面分成五块雕花板（planks 元素的竖缝 + 每块板里一块凸起的芯板），底下一条深色踢脚，
// 离地 0.2 一根 2 纹素的黄铜脚踏杆；绿大理石台面（面高 1.1）上东边一座黄铜酒头（三根拉杆）+ 不锈钢接酒盘，西边、中间几只杯子。
// 2.4 × 1.1 × 0.7 米（≈ 27 × 12 × 8 设计纹素）。酒保站在它后面（−z，slots 的 2f-bartender，本地 x ≈ −0.3）面朝镜头：酒头放在东边不挡脸。
// 元素：正面 planks（沿 x 每 0.46 米一块板，缝 1 纹素）；台面 paint（大理石的深浅块）。
// 三角形 288（正面 12、芯板 60、踢脚 12、台面 12、脚踏杆 12 + 托架 24、酒头 12 + 拉杆 36 + 杆头 36、接酒盘 12、杯子 60）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
/** 朝镜头的竖直面：抬光 + 低阈值，正面落中档 */
const FRONT = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number] };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material, dx = 0) => {
    const mesh = new THREE.Mesh(mergeGeometries(gs.map((x) => x.toNonIndexed())), m);
    mesh.position.x = dx;
    g.add(mesh);
    return mesh;
  };
  const W = 2.4;
  const TOP = 1.1;
  const SLAB = 1.1 * T;
  const BW = W - 0.1; // 正面宽（台面两头各出 5 厘米）
  const ZF = 0.2; // 正面的 z
  const ZB = -0.3; // 背面
  const KICK = 0.14;
  const PANEL = BW / 5;

  // ── 正面：红木板，planks 元素沿 x（几何体挪半块板，缝落在板与板之间）──
  const front = ctx.mat('timber', {
    ...FRONT,
    edge: 0.5,
    convex: 0.3,
    noShadowReceive: true,
    tones: {
      bands: [
        [0xe89a64, 0xf4a46c, 0xdc905c],
        [0xb05e58, 0xbc6860, 0xa45450], // L 111 / 121 / 101（框落暗档，芯板中档）
        [0x7a4868, 0x86527a, 0x6e405e],
      ],
      seam: [0xc07454, 0x84404e, 0x5e3a5a], // 中档 −31
      hi: [0xffb47a, 0xcc7868, 0x9a6080], // 中档 +25
    },
    ramp: [0xe89a64, 0xb05e58, 0x7a4868],
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, PANEL], seam: 1, hi: 0 },
  });
  const off = BW / 2; // 几何体 x 往 + 挪半个正面宽：板缝在 x = −BW/2 + k·PANEL
  add([box(BW, TOP - SLAB - KICK, ZF - ZB, off, KICK, (ZF + ZB) / 2)], front, -off);
  // 芯板：每块板中间一块凸出 0.05 米的芯（稍亮、凸边提亮 → 读成雕出来的板）
  const panel = ctx.mat('timber', {
    ...FRONT,
    ramp: [0xeea46e, 0xd4806a, 0x84506e],
    tones: undefined,
    bands: [-0.6, 1.01], // 芯板的顶面也落中档（不然每块板顶上一条亮线）
    edge: 0.35,
    convex: 0.6,
    noShadowReceive: true,
  });
  const ph = TOP - SLAB - KICK - 4 * T;
  add(
    Array.from({ length: 5 }, (_, i) =>
      box(PANEL - 3 * T, ph, 0.05, -BW / 2 + (i + 0.5) * PANEL + 0.5 * T, KICK + 2 * T, ZF + 0.025),
    ),
    panel,
  );
  // 踢脚：往里收 0.06 的深色一条
  add(
    [box(BW, KICK, ZF - ZB - 0.06, 0, 0, (ZF - 0.06 + ZB) / 2)],
    ctx.mat('timber', {
      ...FRONT,
      ramp: [0x8a5a6a, 0x6a3e5a, 0x4a2e52],
      tones: undefined,
      edge: 0.4,
      convex: 0.2,
      noShadowReceive: true,
    }),
  );
  // 台面：绿大理石厚板（paint 元素 = 一片片深浅的石纹），出正面 0.15。和二层蜂蜜色的橡木地板一冷一暖分开（木台面会化进地板里）
  add(
    [box(W, SLAB, 0.7, 0, TOP - SLAB, 0)],
    ctx.mat('slate', {
      ramp: [0x5ccaa8, 0x379a90, 0x2a5870],
      tones: {
        bands: [
          [0x5ccaa8, 0x6cd6b4, 0x4cb89a],
          [0x379a90, 0x42a69a, 0x2e8a84],
          [0x2a5870, 0x32647c, 0x244c64],
        ],
        seam: [0x48a890, 0x2c7e78, 0x1e4258],
        hi: [0x8ae6c8, 0x5cb8a8, 0x3c7088],
      },
      elem: { kind: 'paint', size: [9, 5], density: [0, 0.06], patch: 2 },
      lightUp: 0.4,
      bands: [-0.5, 0.45],
      edge: 0.55,
      convex: 0.4,
      noShadowReceive: true, // 杯子、酒头的影子在台面上 = 一块块暗斑
    }),
  );

  // ── 黄铜：脚踏杆（2 纹素见方，离地 0.2）+ 两个托架、酒头、三根拉杆 ──
  const brassOpts = {
    ramp: [0xf6c454, 0xc08038, 0x7a4a52] as [number, number, number],
    tones: undefined,
    ...FRONT,
    edge: 0.5,
    convex: 0.5,
    noShadowReceive: true,
  };
  const brass = ctx.mat('brass', brassOpts);
  const RZ = ZF + 0.1;
  const tx = 6.5 * T; // 酒头的 x（酒保在 −0.3）；拉杆按纹素格对齐（1 纹素宽不闪）
  const tz = -0.12;
  add(
    [
      box(W - 0.2, 2 * T, 0.09, 0, 0.2, RZ),
      box(T, T, RZ - ZF, -0.8, 0.245, (RZ + ZF) / 2),
      box(T, T, RZ - ZF, 0.8, 0.245, (RZ + ZF) / 2),
      // 酒头：一根横的黄铜座（7 × 1.5 纹素）
      box(7 * T, 1.5 * T, 1.5 * T, tx, TOP, tz),
    ],
    brass,
  );
  // 三根拉杆（1 × 3.5 纹素，间隔 3 纹素）：正面也落亮档，一眼是三根金色的杆
  add(
    [-1, 0, 1].map((k) => box(T, 3.5 * T, T, tx + k * 3 * T, TOP + 1.5 * T, tz)),
    ctx.mat('brass', { ...brassOpts, lightUp: 0.9, bands: [-0.45, 0.2] }),
  );
  // 拉杆头：深色木把手（1 纹素），三根一样
  add(
    [-1, 0, 1].map((k) => box(T, 1.5 * T, 1.2 * T, tx + k * 3 * T, TOP + 5 * T, tz)),
    ctx.mat('timber', {
      ...FRONT,
      ramp: [0xa05a54, 0x7a3c50, 0x4a2a52],
      tones: undefined,
      edge: 0.5,
      convex: 0.4,
      noShadowReceive: true,
    }),
  );
  // 接酒盘：酒头前面一块不锈钢
  add(
    [box(6 * T, 0.3 * T, 2 * T, tx, TOP, tz + 1.8 * T)],
    ctx.mat('steel', {
      ramp: [0x9cc0e0, 0x6a88b8, 0x3a4a80],
      tones: undefined,
      edge: 0.3,
      convex: 0.3,
      noShadowReceive: true,
    }),
  );
  // 杯子：两杯啤酒（琥珀 + 白沫）、一只空杯（玻璃），1.5 × 2 纹素
  const glassAt: [number, number][] = [
    [-0.95, 0.12],
    [-0.75, 0.18],
    [0.12, 0.14],
  ];
  const cup = (x: number, z: number, h: number, y = TOP) => box(1.5 * T, h, 1.5 * T, x, y, z);
  const glassOpts = { ...FRONT, edge: 0.3, convex: 0.2, noShadowReceive: true, tones: undefined };
  add(
    [cup(glassAt[0][0], glassAt[0][1], 1.6 * T), cup(glassAt[2][0], glassAt[2][1], 1.6 * T)],
    ctx.mat('flowerYellow', { ...glassOpts, ramp: [0xffb43c, 0xe0782c, 0x8a4440] }),
  );
  add(
    [
      cup(glassAt[0][0], glassAt[0][1], 0.6 * T, TOP + 1.6 * T),
      cup(glassAt[2][0], glassAt[2][1], 0.6 * T, TOP + 1.6 * T),
    ],
    ctx.mat('clothWhite', { ...glassOpts, ramp: [0xfff6e4, 0xe8d8cc, 0x9a8aa8] }),
  );
  add(
    [cup(glassAt[1][0], glassAt[1][1], 2 * T)],
    ctx.mat('glass', { ...glassOpts, ramp: [0x8ad8e8, 0x5aaccc, 0x3a6aa0] }),
  );
  ctx.mats.prepare(g);
  return g;
}
