// 宴会厅的长桌 ×2（#81，一组）：5.0 × 0.88 × 2.6 米 = 55.5 × 10 × 29 纹素（桌面 0.76 米，花到 0.88 米），两张东西向的长桌南北并排、中间留 0.8 米过道。
// 元素：奶白桌布（桌面 paint 的深浅块；垂下来的一圈落中档的淡紫灰，planks 的竖缝 = 布褶，离地 0.2 米露出深色桌脚）；
// 每张桌子中间一条会所青绿的桌旗；两条长边各 7 只蓝釉盘子（2.5 × 2 纹素）；桌旗上三簇花（绿叶 + 红 / 黄花，各 2～3 纹素）。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 224（预算 350）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

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
  /** 平放的薄片（盘子） */
  const flat = (m: THREE.Material, w: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z));

  // ── 材质 ──
  // 桌布顶面：奶白（L ≈ 225，和亮的橡木地板差 < 60），paint 的深浅块；不接投影（花的影子是一块块暗斑）
  const clothTop = ctx.mat('clothWhite', {
    ramp: [0xf4e4d2, 0xd8c4cc, 0x9a86ac],
    tones: {
      bands: [
        [0xf4e4d2, 0xfcefde, 0xead8c6],
        [0xd8c4cc, 0xe2ced6, 0xccb8c2],
        [0x9a86ac, 0xa690b8, 0x8e7aa0],
      ],
      seam: [0xdcc8b8, 0xb8a4b4, 0x7c6a92],
      hi: [0xfff8ea, 0xeedae0, 0xb8a2c8],
    },
    elem: { kind: 'paint', size: [12, 5], density: [0, 0], patch: 2 },
    edge: 0.5,
    convex: 0.3,
    noShadowReceive: true,
  });
  // 垂下来的布：正面落中档（淡紫灰 L ≈ 195），竖缝 = 褶
  const clothFace = ctx.mat('clothWhite', {
    ...FACE,
    ramp: [0xf4e4d2, 0xd4c0cc, 0x9a86ac],
    tones: {
      bands: [
        [0xf4e4d2, 0xfcefde, 0xead8c6],
        [0xd4c0cc, 0xe0ccd6, 0xc6b2c2],
        [0x9a86ac, 0xa690b8, 0x8e7aa0],
      ],
      seam: [0xd8c4b4, 0xb09cb4, 0x7c6a92],
      hi: [0xfff8ea, 0xeedae0, 0xb8a2c8],
    },
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 5 * T], seam: 1, hi: 0 },
    edge: 0.2,
    convex: 0.2,
  });
  const leg = ctx.mat('timber', { ...FACE, ramp: [0x8a5a6a, 0x6a3e5a, 0x4a2e52], tones: undefined });
  const runner = ctx.mat('clothTeal', {
    ramp: [0x3cc8aa, 0x2a9690, 0x24567a],
    edge: 0.2,
    convex: 0.1,
    noShadowReceive: true,
  });
  const plate = ctx.mat('talavera', {
    ramp: [0x5a9cf0, 0x3a6cc8, 0x2a4090],
    tones: undefined,
    edge: 0,
    convex: 0,
    noShadowReceive: true,
  });
  const small = { ...FACE, bands: [-0.45, -0.25] as [number, number], convex: 0.3, edge: 0.3 };
  const leaf = ctx.mat('sage', { ...small, ramp: [0x62b85a, 0x3e8e5e, 0x2a5a66] });
  const red = ctx.mat('flowerRed', { ...small, ramp: [0xf45a48, 0xc83a4c, 0x6e2a60] });
  const yellow = ctx.mat('flowerYellow', { ...small, ramp: [0xffc444, 0xe08a34, 0x8a4a48] });

  // ── 两张桌子（z = ∓0.85，各 5.0 × 0.9）──
  const TOP = 0.76;
  for (const [i, zc] of [-0.85, 0.85].entries()) {
    box(clothTop, 5.0, 0.04, 0.9, 0, TOP - 0.04, zc, 'b');
    box(clothFace, 4.96, TOP - 0.04 - 0.2, 0.86, 0, 0.2, zc, 'bnt');
    for (const sx of [-1, 1]) box(leg, 0.12, 0.2, 0.6, sx * 2.2, 0, zc, 'bnt');
    box(runner, 5.0, 0.012, 0.28, 0, TOP, zc, 'bn');
    for (let k = 0; k < 7; k++)
      for (const sz of [-1, 1]) flat(plate, 2.5 * T, 2 * T, -2.1 + k * 0.7, TOP + 0.006, zc + sz * 0.29);
    for (const [k, fx] of [-1.4, 0, 1.4].entries()) {
      const bloom = (k + i) % 2 === 0 ? red : yellow;
      box(leaf, 0.27, 0.06, 0.2, fx, TOP + 0.012, zc, 'bn');
      box(bloom, 0.18, 0.05, 0.14, fx, TOP + 0.07, zc, 'bn');
    }
  }

  const root = new THREE.Group();
  root.name = 'up-banquet-tables';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
