// #55 会所纪念品架（纪念品店北墙，门两边各一架，朝南）。
// 尺寸：1.62 宽 × 2.16 高 × 0.45 深（18 纹素 × 17 行 × 5 纹素；竖直 1 行 = √2 纹素）。
// 结构：胡桃木框（timber 借名，两侧 1 纹素 + 三层隔板 1 行）+ 海军蓝踢脚 + 顶上一块俱乐部红的招牌（金色徽标）。
// 货（每件 3～4 纹素的色块，只画正面 + 顶面，件间 1 纹素缝）从上到下：帽子（红 / 海军蓝，帽檐往前 1 纹素）、
// 奶白马克杯 + 毛绒吉祥物（荧光球色）、叠好的毛巾（红白条）、球筒（海军蓝筒 + 荧光黄盖）。
// 明暗按"一层一个调子"排（强边缘只数横向相邻）：帽子层、球筒层偏暗，杯子层偏亮，框是中间调，竖着的红白条不算强边缘。
// 45° 看进 0.38 米高、0.45 米深的格子，后板被上一层隔板挡住 → 看得见的是货的正面 + 隔板前沿和顶面。
// 材质：timber、fabricStripe（俱乐部红）、canvasStripe（海军蓝）、counterTop（奶白）、ball、signPaint（徽标金）；招牌 paint 元素。
// 变体 v1：帽子、杯子的排列换一下（场景里两架都是 v0）。三角形 122（只建看得见的面）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** BoxGeometry 的面顺序：+x −x +y −y +z −z */
const FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 } as const;
type Face = keyof typeof FACE;

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** 盒子（纹素坐标：x 从中心、y 从地面、z 从中心）；faces = 只留哪些面 */
  const slab = (
    m: THREE.Material,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    faces: Face[],
  ) => {
    const g = new THREE.BoxGeometry((x1 - x0) * T, (y1 - y0) * T, (z1 - z0) * T);
    g.translate(((x0 + x1) / 2) * T, ((y0 + y1) / 2) * T, ((z0 + z1) / 2) * T);
    const src = g.index!.array;
    const idx: number[] = [];
    for (const f of faces) for (let i = 0; i < 6; i++) idx.push(src[FACE[f] * 6 + i]);
    g.setIndex(idx);
    const list = parts.get(m) ?? [];
    list.push(g);
    parts.set(m, list);
  };
  const front: Face[] = ['pz', 'py'];

  // 朝镜头的竖直面：lightUp + 低 bands → 正面中档、顶面亮档
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
  const wood = ctx.mat('timber', { ...face, edge: 0.35, convex: 0.3, ramp: [0xc8865c, 0xa86a50, 0x5a3c66] });
  const red = ctx.mat('fabricStripe', {
    ...face,
    edge: 0.4,
    convex: 0.25,
    ramp: [0xff8a62, 0xd84848, 0x6a2a5e],
    tones: {
      bands: [
        [0xff8a62, 0xff966a, 0xf68058],
        [0xd84848, 0xe05250, 0xcc4044],
        [0x6a2a5e, 0x743266, 0x602456],
      ],
      seam: [0xc84a44, 0xb43a40, 0x521c4a],
      hi: [0xff8a6a, 0xee6058, 0x843a72],
    },
    elem: { kind: 'paint', size: [8, 5], density: [0, 0.03], patch: 2 },
  });
  const navy = ctx.mat('canvasStripe', { ...face, edge: 0.4, convex: 0.25, ramp: [0x5478d8, 0x3c58b8, 0x2a2c6a] });
  const cream = ctx.mat('counterTop', { ...face, edge: 0.4, convex: 0.3, ramp: [0xf4dcc0, 0xd8ac8a, 0x8a78aa] });
  const ball = ctx.mat('ball', { ...face, edge: 0.4, convex: 0.3, ramp: [0xe0f048, 0xbcc83c, 0x5e7a52] });
  const gold = ctx.mat('signPaint', { ...face, edge: 0.3, convex: 0.2, ramp: [0xf4c860, 0xd89a48, 0x8a6a6a] });

  // ── 框（高度按屏幕行排：竖直面 1 行 = √2 纹素 = 0.127 米）──
  // 行：踢脚 0..1、下格 1..6、隔板 6..7、中格 7..10、隔板 10..11、上格 11..14、隔板 14..15、招牌 15..17。
  // 中格 + 它下面的隔板 = y 0.76..1.27 米 = slots-1f.ts 里"卖空的一格"信号（shop-soldout-gap，y 0.75、高 0.51）贴的位置。
  const R = Math.SQRT2; // 一行（纹素单位）
  const X = 9; // 半宽 9 纹素 = 0.81 米
  const Z0 = -2.5;
  const Z1 = 2.5;
  const W = X - 1; // 格子内半宽 8
  const H = 17 * R; // 总高 17 行 = 2.16 米
  slab(navy, -W, W, 0, R, Z0, Z1 - 1, ['pz', 'py']); // 踢脚 1 行（缩进 1 纹素）
  slab(wood, -X, -X + 1, 0, H, Z0, Z1, ['pz', 'py', 'nx']); // 西侧板
  slab(wood, X - 1, X, 0, H, Z0, Z1, ['pz', 'py', 'px']); // 东侧板
  for (const r of [6, 10, 14]) slab(wood, -W, W, r * R, (r + 1) * R, Z0, Z1, front); // 隔板 1 行
  slab(wood, -W, W, 0, H, Z0, Z0 + 0.5, ['pz']); // 后板（只挡投影）
  // 招牌（15..17 行）：俱乐部红，中间金色徽标（4 纹素 × 1 行）
  slab(red, -W, W, 15 * R, H, Z0, Z1, ['pz', 'py']);
  slab(gold, -2, 2, 15.5 * R, 16.5 * R, Z1, Z1 + 0.02, ['pz']);

  // ── 货：每格一排，正面在 z +1.5（隔板前沿后 1 纹素），件和件之间 1 纹素缝（露出隔板顶） ──
  const v = ctx.variant % 2;
  const zf = 1.5;
  // 上格（11..14 行）：4 顶帽子（红 / 海军蓝），帽身 2 行 + 往前 1 纹素的帽檐（只露顶面）
  const capCols = v ? [navy, red, navy, red] : [red, navy, red, navy];
  capCols.forEach((m, i) => {
    const x0 = -W + i * 4;
    slab(m, x0, x0 + 4, 11 * R, 13 * R, zf - 3, zf, front);
    slab(m, x0 + 0.5, x0 + 3.5, 11 * R, 11 * R + 0.5, zf, zf + 1, ['pz', 'py']);
  });
  // 中格（7..10 行）：奶白马克杯 3 个（3 宽、2 行）+ 一颗绒球吉祥物（4 宽、2.5 行，更深）。
  // v0 = 场景里两架都用的：西半边（x −7..−1）的两只杯子正好被"卖空"的信号盖住，最西 1 纹素本来就空着
  const mid: [THREE.Material, number, number][] = v
    ? [
        [ball, -W, -W + 4],
        [cream, -3, 0],
        [cream, 1, 4],
        [cream, 5, W],
      ]
    : [
        [cream, -7, -4],
        [cream, -3, -1],
        [ball, 0, 4],
        [cream, 5, W],
      ];
  for (const [m, x0, x1] of mid)
    slab(m, x0, x1, 7 * R, (m === ball ? 9.5 : 9) * R, m === ball ? zf - 4 : zf - 3, zf, front);
  // 下格（1..6 行）：两叠毛巾（红 / 奶白 / 红 / 奶白，每条 1 行）+ 中间三个球筒（2 宽，海军蓝 / 红 / 海军蓝筒 2 行 + 透出来的荧光球 1 行）
  for (const [x0, x1] of [
    [-W, -4],
    [4, W],
  ]) {
    for (let k = 0; k < 4; k++)
      slab(k % 2 ? cream : red, x0, x1, (1 + k) * R, (2 + k) * R, zf - 3, zf, k === 3 ? front : ['pz']);
  }
  for (const [x0, m] of [
    [-3, navy],
    [-1, red],
    [1, navy],
  ] as [number, THREE.Material][]) {
    slab(m, x0, x0 + 2, R, 3 * R, zf - 2, zf, ['pz']);
    slab(ball, x0, x0 + 2, 3 * R, 4 * R, zf - 2, zf, front);
  }

  const root = new THREE.Group();
  for (const [m, gs] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(gs), m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}
