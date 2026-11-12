// 总监的办公桌（#22，行政办公室）：1.6 × 0.76 × 0.84 米（≈ 18 × 8.4 × 9 设计纹素；椅背顶 1.17、显示器顶 1.22；桌子本身深 0.56，椅子在北边）。朝南（+z 对镜头）。
// 元素：红木桌身（正面三块凸起的芯板 + 深色踢脚）、红木桌面（planks 木边 + 中间嵌墨绿皮面，面高 0.76，东半边空着：slots 的钱袋放在本地 x +0.55、z +0.15）；
// 桌面西边一台背对镜头的显示器（深靛外壳 + 支架）、中间一摞文件（白纸 + 最上面一张错开）；桌后一把青绿皮的高背椅（椅背高出桌面 4 行）。
// 三角形 206（桌身 12、芯板 36、踢脚 12、桌面 12 + 皮面 2、显示器 36、文件 24、椅子 48）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
/** 朝镜头的竖直面：抬光 + 低阈值，正面落中档 */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, tones: undefined };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const g = new THREE.Group();
  g.name = 'desk';
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) =>
    g.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));

  const W = 1.6;
  const TOP = 0.76;
  const SLAB = 0.07;
  const ZF = 0.4; // 桌面前沿
  const ZB = -0.16; // 桌面后沿
  const KICK = 0.1;
  const BW = W - 2 * T; // 桌身宽
  const BZF = ZF - 0.05;

  // ── 桌身：红木，正面三块芯板 ──
  add(
    [box(BW, TOP - SLAB - KICK, BZF - ZB - 0.04, 0, KICK, (BZF + ZB + 0.04) / 2)],
    ctx.mat('timber', { ...FACE, ramp: [0xe89a64, 0xb86458, 0x7a4868], edge: 0.5, convex: 0.3 }),
  );
  const PANEL = BW / 3;
  const ph = TOP - SLAB - KICK - 2 * T;
  add(
    [-1, 0, 1].map((k) => box(PANEL - 2 * T, ph, 0.05, k * PANEL, KICK + T, BZF + 0.02)),
    ctx.mat('timber', {
      ...FACE,
      ramp: [0xf0a870, 0xd08464, 0x84506e],
      bands: [-0.6, 1.01], // 芯板的顶面也落中档
      edge: 0.35,
      convex: 0.6,
    }),
  );
  add(
    [box(BW - 0.08, KICK, BZF - ZB - 0.1, 0, 0, (BZF + ZB) / 2)],
    ctx.mat('timber', { ...FACE, ramp: [0x8a5a6a, 0x6a3e5a, 0x4a2e52], edge: 0.4, convex: 0.2 }),
  );
  // ── 桌面：红木长板（沿 x，每 3 纹素一道缝），不接投影（显示器、文件的影子是一块块暗斑）──
  add(
    [box(W, SLAB, ZF - ZB, 0, TOP - SLAB, (ZF + ZB) / 2)],
    ctx.mat('wood', {
      elem: { kind: 'planks', space: 'local', p: [0, 0, 1, 3 * T], seam: 1, hi: 0 },
      ramp: [0xd8745e, 0xb05458, 0x6a3e6a],
      tones: {
        bands: [
          [0xd8745e, 0xe27e66, 0xcc6a56],
          [0xb05458, 0xba5e60, 0xa44a50],
          [0x6a3e6a, 0x744672, 0x603660],
        ],
        seam: [0xb4584e, 0x8c3e4a, 0x52305c],
        hi: [0xf4967a, 0xc87070, 0x80507e],
      },
      lightUp: 0.4,
      bands: [-0.5, 0.45],
      edge: 0.5,
      convex: 0.4,
      noShadowReceive: true,
    }),
  );

  // 桌面中间嵌的墨绿皮面（四周留 1 纹素的木边）：白纸、钱袋、显示器在绿底上都跳得出来
  add(
    [
      new THREE.PlaneGeometry(W - 2 * T, ZF - ZB - 2 * T)
        .rotateX(-Math.PI / 2)
        .translate(0, TOP + 0.004, (ZF + ZB) / 2),
    ],
    ctx.mat('cactus', {
      ramp: [0x3cae78, 0x1e7a5c, 0x1c4a5a],
      tones: undefined,
      edge: 0,
      convex: 0,
      noShadowReceive: true,
    }),
  );

  // ── 显示器（背对镜头）：深靛外壳 6 纹素 × 3 行，支架 + 底座 ──
  const mx = -0.45;
  const mz = 0.02;
  add(
    [
      box(6 * T, 0.36, 0.06, mx, TOP + 0.1, mz),
      box(1.2 * T, 0.12, 0.05, mx, TOP, mz - 0.03),
      box(3 * T, 0.03, 0.2, mx, TOP, mz - 0.02),
    ],
    ctx.mat('ironwork', { ...FACE, ramp: [0x7880c8, 0x5454a8, 0x30306e], edge: 0.35, convex: 0.4 }),
  );
  // 背壳中间一块稍亮的凸起（散热 / 支架座）：读成"显示器的背面"而不是一块黑板
  add(
    [box(2 * T, 0.14, 0.03, mx, TOP + 0.2, mz + 0.035)],
    ctx.mat('ironwork', { ...FACE, ramp: [0x9498dc, 0x7070c0, 0x404088], edge: 0.2, convex: 0.3 }),
  );

  // ── 一摞文件：白纸（3 × 2.6 纹素，高 0.09）+ 最上面一个错开的黄色文件夹 ──
  const px = 0.02;
  const pz = 0.17;
  add(
    [box(3 * T, 0.09, 2.6 * T, px, TOP, pz)],
    ctx.mat('clothWhite', {
      ...FACE,
      bands: [-0.45, -0.1],
      ramp: [0xfff4e0, 0xe2d2cc, 0x9a8aa8],
      edge: 0.3,
      convex: 0.3,
    }),
  );
  add(
    [box(2.4 * T, 0.02, 2 * T, px + 0.6 * T, TOP + 0.09, pz - 0.4 * T)],
    ctx.mat('flowerYellow', { ...FACE, ramp: [0xffc84a, 0xe09a3c, 0x8a5466], edge: 0.2, convex: 0.2 }),
  );

  // ── 椅子（桌后，面朝南）：青绿皮高背 + 深色椅座 ──
  const cz = -0.39;
  const leather = ctx.mat('clothTeal', { ...FACE, ramp: [0x3cc8d0, 0x2690a8, 0x24507a], edge: 0.6, convex: 0.3 });
  add(
    [
      box(6 * T, 0.72, 0.1, 0, 0.45, cz), // 椅背
      box(6 * T, 0.1, 0.3, 0, 0.38, cz + 0.16), // 坐垫
      box(T, 0.2, 0.26, -3 * T, 0.48, cz + 0.14), // 扶手
      box(T, 0.2, 0.26, 3 * T, 0.48, cz + 0.14),
    ],
    leather,
  );
  add(
    [box(0.12, 0.38, 0.12, 0, 0, cz + 0.16)],
    ctx.mat('ironwork', { ...FACE, ramp: [0x5a5a9a, 0x3a3a80, 0x262458], edge: 0.3, convex: 0.2 }),
  );

  ctx.mats.prepare(g);
  return g;
}
