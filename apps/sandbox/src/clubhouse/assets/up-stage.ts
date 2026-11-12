// 宴会厅的小台子（#80，致辞、颁奖）：3.0 × 0.4 × 2.0 米 = 33 × 4.5 × 22 纹素（讲台顶到 1.45 米、话筒到 1.7 米），朝南（+z 对镜头）。
// 元素：樱桃木台面（planks，板顺着进深铺、每 4 纹素一道缝，比地上的蜂蜜色橡木红一截）；正面和两侧一圈会所青绿的围裙（planks 的竖缝 = 褶）；
// 中间一条红地毯从前沿的踏步铺到台子后沿；前沿正中一级踏步（1.0 × 0.2 × 0.3）；台上东侧一座深色木讲台（斜顶板、正面一块黄铜徽牌）+ 一支话筒。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 82（预算 350）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type Ramp = [number, number, number];
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** BoxGeometry 的面序：e +x、w −x、t +y、b −y、s +z、n −z */
const FACES = 'ewtbsn';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 盒子（米）：x、z 是中心，y 是底；skip = 不要的面（默认去掉底面和背面） */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, skip = 'bn') => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const src = Array.from(g.index?.array ?? []);
    const idx: number[] = [];
    for (let f = 0; f < 6; f++) if (!skip.includes(FACES[f])) idx.push(...src.slice(f * 6, f * 6 + 6));
    g.setIndex(idx);
    g.clearGroups();
    put(m, g);
  };

  // ── 材质 ──
  // 台面：樱桃木（亮档 L ≈ 135，比橡木地板 L 164 深、更红），板缝只暗 ≈ 25
  const deckRamp: Ramp = [0xd07a54, 0xa85a56, 0x74466e];
  const deck = ctx.mat('wood', {
    ramp: deckRamp,
    tones: {
      bands: [
        [0xd07a54, 0xdc865c, 0xc4704c],
        [0xa85a56, 0xb4645e, 0x9c504e],
        [0x74466e, 0x7e4e7a, 0x6a3e64],
      ],
      seam: [0xb86848, 0x8a4446, 0x5a345a],
      hi: [0xeea070, 0xc47a6c, 0x8e5e8c],
    },
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 4 * T], seam: 1, hi: 0 },
    edge: 0.5,
    convex: 0.3,
    noShadowReceive: true,
  });
  const step = ctx.mat('wood', { ...FACE, ramp: [0xdc865c, 0xb4645e, 0x7e4e7a], tones: undefined, convex: 0.3 });
  // 围裙：会所青绿的布，竖缝 = 褶（每 3 纹素一道）
  const skirt = ctx.mat('clothTeal', {
    ...FACE,
    ramp: [0x44d0b0, 0x2c9c94, 0x265a7c],
    tones: {
      bands: [
        [0x44d0b0, 0x50dcbc, 0x3ac2a4],
        [0x2c9c94, 0x36a89e, 0x268e88],
        [0x265a7c, 0x2e6488, 0x205070],
      ],
      seam: [0x30aa94, 0x1e7a7a, 0x1a4464],
      hi: [0x70ecd0, 0x4cbcb0, 0x3c7a9c],
    },
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 3 * T], seam: 1, hi: 0 },
    edge: 0.2,
    convex: 0.2,
  });
  const carpet = ctx.mat('clothRed', {
    ramp: [0xf0604a, 0xc23e4c, 0x6e2a60],
    edge: 0.2,
    convex: 0.1,
    noShadowReceive: true,
  });
  const carpetFace = ctx.mat('clothRed', { ...FACE, ramp: [0xf0604a, 0xc23e4c, 0x6e2a60], convex: 0.1 });
  const lectern = ctx.mat('timber', { ...FACE, ramp: [0xb0685a, 0x84465a, 0x543060], tones: undefined, convex: 0.3 });
  const lecternTop = ctx.mat('timber', {
    ramp: [0xe89a64, 0xb86a5a, 0x7a4868],
    tones: undefined,
    convex: 0.4,
    noShadowReceive: true,
  });
  const brass = ctx.mat('brass', { ...FACE, ramp: [0xf6c454, 0xd89a40, 0x7a4a52], tones: undefined, lightUp: 0.9 });
  const mic = ctx.mat('ironwork', { ...FACE, ramp: [0x5a5a9a, 0x40407a, 0x282a54], tones: undefined });

  // ── 台子：台面 z −1.0…+0.7（前面留 0.3 给踏步），围裙收进 2 厘米 ──
  const H = 0.4;
  const Z0 = -1.0;
  const Z1 = 0.7;
  const ZC = (Z0 + Z1) / 2;
  const D = Z1 - Z0;
  box(deck, 3.0, 0.04, D, 0, H - 0.04, ZC);
  box(skirt, 2.96, H - 0.04, D - 0.04, 0, 0, ZC, 'bnt');
  // 踏步（前沿正中偏西）+ 红地毯（踏步面 → 台面 → 后沿）
  const SX = -0.5;
  box(step, 1.0, 0.2, 0.3, SX, 0, Z1 + 0.15, 'bn');
  box(carpet, 0.72, 0.02, D, SX, H, ZC, 'bn');
  box(carpetFace, 0.72, H - 0.2 + 0.02, 0.02, SX, 0.2, Z1 + 0.01, 'bnewt');
  box(carpet, 0.72, 0.02, 0.3, SX, 0.2, Z1 + 0.15, 'bn');

  // ── 讲台（台上东侧）：柜身 0.5 × 0.95 × 0.36，斜顶板，正面一块黄铜徽牌；话筒从顶板后沿伸出来 ──
  const LX = 0.85;
  const LZ = -0.05;
  box(lectern, 0.5, 0.95, 0.36, LX, H, LZ);
  box(lecternTop, 0.6, 0.1, 0.45, LX, H + 0.95, LZ);
  box(brass, 0.27, 0.27, 0.02, LX, H + 0.45, LZ + 0.19, 'bn');
  box(mic, T, 0.2, T, LX - 0.1, H + 1.05, LZ - 0.1, 'bn');
  box(mic, 1.5 * T, 1.5 * T, 1.5 * T, LX - 0.1, H + 1.2, LZ - 0.08, 'b');

  const root = new THREE.Group();
  root.name = 'up-stage';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
