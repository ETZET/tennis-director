// 壁炉（会员休息室北墙正中，面朝南）：西班牙复兴式的灰泥壁炉。2.2 × 2.6 × 0.8 米（24 × 29 × 9 设计纹素）。
// 从下往上：陶砖炉床（整宽，往前伸到 z +0.4，面上顺 z 的砖缝）→ 玫瑰赭的灰泥炉身（1.9 宽，炉口 0.9 × 0.78）+ 炉口一圈 2 纹素宽的
// 塔拉韦拉蓝砖框 → 深色的炉膛（后壁）+ 两根柴 → 胡桃木的壁炉台（整宽，两头下面各一个托座）→ 灰泥的烟囱胸（1.5 宽）+ 收窄的顶
// （1.3 宽）+ 胸口一块蓝砖方饰（赭色心）。
// 变体：v0 = 烧着（火苗三种暖色：红 → 橙 → 黄一层套一层，userData.update 每 0.13 秒换一次高度，按屏幕行跳；炉膛后壁被火映暖），
//       v1 = 凉了（炉膛冷灰、柴烧成炭头、一堆灰 = "火灭了：去拿柴"）。
// 朝镜头的竖直面不接收投影（lightUp + 低 bands 落中档），顶面落亮档。相邻色亮度差尽量 < 60：
// 灰泥 ≈ 155、砖框 ≈ 112、炉膛 ≈ 80、红火 ≈ 100、橙 ≈ 155、黄 ≈ 205（调色后）。
// 元素：灰泥 stones（18 × 10 纹素的抹灰块，无缝），炉床 planks（顺 z 的砖缝，每 0.27 米）。
// 三角形：v0 216，v1 218（见文件末尾）。userData.update(dt, t)（v0）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** 0..1 的确定性哈希（演出用，不进模拟） */
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = T / Math.SQRT1_2; // 竖直面上一屏幕行
  const lit = ctx.variant !== 1;
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) => {
    const mesh = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m);
    g.add(mesh);
    return mesh;
  };
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

  const W = 2.2;
  const D = 0.8;
  const z0 = -D / 2; // 贴墙
  const HEARTH = 0.12;
  const BW = 1.9; // 炉身宽
  const BD = 0.55; // 炉身深
  const OW = 0.9; // 炉口宽
  const OT = 0.9; // 炉口顶
  const MY = 1.3; // 壁炉台底
  const MH = 0.18;
  const bz = z0 + BD / 2;
  const bf = z0 + BD; // 炉身正面

  // ── 灰泥（玫瑰赭）：炉身两侧、炉口上的过梁、烟囱胸、顶 ──
  const plaster = ctx.mat('adobe', {
    ...face,
    ramp: [0xf4b890, 0xd88a74, 0x8a5878],
    edge: 0.5,
    convex: 0.35,
    elem: { kind: 'stones', size: [18, 10], seam: 0, hi: 0, seed: 5 },
    tones: {
      bands: [
        [0xf4b890, 0xfac098, 0xeab088],
        [0xd88a74, 0xe0927a, 0xcc826e],
        [0x8a5878, 0x925e80, 0x825270],
      ],
      seam: [0xd8a07c, 0xb87262, 0x704864],
      hi: [0xffcca4, 0xe89c84, 0x9a6888],
    },
  });
  const jw = (BW - OW) / 2;
  const BREAST_Y = MY + MH;
  const CAP_Y = 2.3;
  add(
    [
      box(jw, MY - HEARTH, BD, -(OW / 2 + jw / 2), HEARTH, bz),
      box(jw, MY - HEARTH, BD, OW / 2 + jw / 2, HEARTH, bz),
      box(OW, MY - OT, BD, 0, OT, bz),
      box(1.5, CAP_Y - BREAST_Y, 0.45, 0, BREAST_Y, z0 + 0.225),
      box(1.3, 2.6 - CAP_Y, 0.36, 0, CAP_Y, z0 + 0.18),
    ],
    plaster,
  );

  // ── 炉床：陶砖，顺 z 的砖缝 ──
  add(
    [box(W, HEARTH, D, 0, 0, 0)],
    ctx.mat('tile', {
      ...face,
      ramp: [0xec9a6a, 0xc4766a, 0x8a5070],
      edge: 0.4,
      convex: 0.3,
      elem: { kind: 'planks', p: [1, 0, 0, 3 * T], seam: 1, hi: 0 },
      tones: {
        bands: [
          [0xec9a6a, 0xf4a272, 0xe29062],
          [0xc4766a, 0xcc7e70, 0xba6e62],
          [0x8a5070, 0x925878, 0x824a68],
        ],
        seam: [0xc8785a, 0xa05c5a, 0x6c4062],
        hi: [0xffb07c, 0xd8887a, 0x9a6080],
      },
    }),
  );

  // ── 炉口一圈塔拉韦拉蓝砖（2 纹素宽，比灰泥凸 1 厘米）──
  const fz = bf + 0.005;
  const fw = 2 * T;
  add(
    [
      box(fw, OT - HEARTH, 0.02, -(OW / 2 + fw / 2), HEARTH, fz),
      box(fw, OT - HEARTH, 0.02, OW / 2 + fw / 2, HEARTH, fz),
      box(OW + 2 * fw, 2 * R, 0.02, 0, OT, fz),
    ],
    ctx.mat('talavera', { ...face, ramp: [0x5a96f0, 0x3a72d8, 0x26408a], edge: 0.3, convex: 0.3 }),
  );

  // ── 炉膛：后壁（往里 0.3）+ 膛底一层灰。烧着 = 被火映成暖褐，凉了 = 冷灰紫 ──
  const backZ = bf - 0.3;
  add(
    [
      box(OW, OT - HEARTH, backZ - z0, 0, HEARTH, (z0 + backZ) / 2),
      box(OW, 0.01, bf - backZ, 0, HEARTH, (backZ + bf) / 2),
    ],
    ctx.mat('ironwork', {
      ...face,
      tones: undefined,
      ramp: lit ? [0x9a4c48, 0x8a4040, 0x5a2c44] : [0x7a6478, 0x5e4c66, 0x3a3050],
      edge: 0.2,
      convex: 0,
    }),
  );

  // ── 柴：两根横放（凉了 = 烧黑的炭头）──
  const logZ = backZ + 0.14;
  const logM = ctx.mat('wood', {
    ...face,
    tones: undefined,
    ramp: lit ? [0xc08050, 0x8a5048, 0x4e3050] : [0x6a5060, 0x4e3c52, 0x302640],
    edge: 0.4,
    convex: 0.3,
  });
  if (lit)
    add([box(0.68, 1.2 * R, 0.13, -0.02, HEARTH, logZ), box(0.5, R, 0.12, 0.06, HEARTH + 0.9 * R, logZ - 0.08)], logM);
  else add([box(0.4, R, 0.12, -0.12, HEARTH, logZ - 0.04), box(0.26, 0.8 * R, 0.1, 0.18, HEARTH, logZ + 0.02)], logM);

  // ── 壁炉台：胡桃木，整宽，两头一个托座 ──
  const walnut = ctx.mat('timber', {
    ...face,
    tones: undefined,
    ramp: [0xb4643e, 0x7e4442, 0x48294c],
    edge: 0.6,
    convex: 0.5,
  });
  add(
    [
      box(W, MH, 0.7, 0, MY, z0 + 0.35),
      box(3 * T, 2 * R, 0.14, -(BW / 2 - 1.5 * T), MY - 2 * R, bf + 0.07),
      box(3 * T, 2 * R, 0.14, BW / 2 - 1.5 * T, MY - 2 * R, bf + 0.07),
    ],
    walnut,
  );

  // ── 烟囱胸口的蓝砖方饰（4 纹素 × 3 行）+ 赭色心 ──
  const my = 1.95;
  const mz = z0 + 0.45;
  add(
    [box(4 * T, 3 * R, 0.02, 0, my - 1.5 * R, mz + 0.01)],
    ctx.mat('talavera', { ...face, ramp: [0x5a96f0, 0x3a72d8, 0x26408a], edge: 0.3, convex: 0.3 }),
  );
  add(
    [new THREE.PlaneGeometry(2 * T, R).translate(0, my, mz + 0.03)],
    ctx.mat('flowerYellow', { ...face, ramp: [0xd89848, 0xc89040, 0x7a4c5c], edge: 0, convex: 0 }),
  );

  if (lit) {
    // ── 火苗：红 → 橙 → 黄，一层套一层（每种颜色两侧都是下一层，不直接挨着炉膛）──
    const glow = {
      tones: undefined,
      lightUp: 1,
      bands: [-2, -1.5] as [number, number],
      edge: 0,
      convex: 0,
      noShadowReceive: true,
    };
    const red = ctx.mat('flowerRed', { ...glow, ramp: [0xe04a34, 0xc03a34, 0x6a2a5a] });
    const orange = ctx.mat('toolOrange', { ...glow, ramp: [0xf88830, 0xd8603a, 0x7a3456] });
    const yellow = ctx.mat('flowerYellow', { ...glow, ramp: [0xffd040, 0xe49c34, 0x8a5466] });
    const flameY = HEARTH + 0.6 * R;
    const tongue = (w: number, x: number, z: number, m: THREE.Material) => {
      const mesh = add([new THREE.PlaneGeometry(w, R).translate(0, R / 2, 0)], m);
      mesh.position.set(x, flameY, z);
      return mesh;
    };
    const fzb = backZ + 0.03;
    const reds = [tongue(3 * T, -1.5 * T, fzb, red), tongue(3 * T, 1.5 * T, fzb, red)];
    const oranges = [tongue(2 * T, -T, fzb + 0.02, orange), tongue(2 * T, T, fzb + 0.02, orange)];
    const core = tongue(2 * T, 0, fzb + 0.04, yellow);
    const flick = (t: number) => {
      const f = Math.floor(t / 0.13);
      const hy = 1 + (hash(f, 0) > 0.5 ? 1 : 0);
      core.scale.y = hy;
      for (let i = 0; i < 2; i++) {
        const ho = Math.min(3, hy + 1 + (hash(f, 1 + i) > 0.6 ? 1 : 0));
        oranges[i].scale.y = ho;
        reds[i].scale.y = Math.min(4, ho + 1 + (hash(f, 3 + i) > 0.55 ? 1 : 0));
      }
    };
    flick(0);
    g.userData.update = (_dt: number, t: number) => flick(t);
  } else {
    // ── 灰：一堆冷灰（顶面亮、正面中档），压在炭头前 ──
    add(
      [box(0.62, 0.6 * R, 0.24, 0.02, HEARTH, logZ + 0.02)],
      ctx.mat('concrete', { ...face, tones: undefined, ramp: [0xb0a4b4, 0x8e8098, 0x5a5070], edge: 0.3, convex: 0.3 }),
    );
  }

  // 三角形：灰泥 5 盒 60 + 炉床 12 + 砖框 36 + 炉膛 24 + 柴 24 + 壁炉台 36 + 方饰 14 = 206；v0 + 火苗 5 片 10 = 216，v1 + 灰 12 = 218
  ctx.mats.prepare(g);
  return g;
}
