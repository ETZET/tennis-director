// 后门边的一排带轮垃圾桶（#69）：三只挨着，1.35 × 1.0 × 0.72 米 = 15 × 11 × 8 纹素（每只 5 宽）。
// 元素：桶身绿、蓝、绿（正面中档；脚下一行暗的轮子 / 底座带），桶盖同色更亮（顶面是亮档的一大块、前沿 1 行的盖唇往前探半纹素，
// 盖唇下面一行是盖子压出来的暗影）；每只正面贴一张浅一号的分类贴（3 纹素 × 1 行）。
// 横着相邻的（绿桶 | 蓝桶、桶身 | 贴纸）亮度差 < 60。三角形 ≈ 100（预算 200）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.3 };
type C3 = [number, number, number];

/** 一只桶：桶身、桶盖、贴纸、底座带、盖唇下的暗影（[亮, 中, 暗]） */
interface Bin {
  body: C3;
  lid: C3;
  sticker: C3;
  under: C3;
}
const GREEN: Bin = {
  body: [0x4ac868, 0x22a04c, 0x1e5a4a],
  lid: [0x6ae068, 0x38b458, 0x22604e],
  sticker: [0xa8e8a0, 0x6ac080, 0x2e6a5a],
  under: [0x2e7a4e, 0x1e6a48, 0x183e40],
};
const BLUE: Bin = {
  body: [0x4a98f4, 0x2e70d8, 0x283e88],
  lid: [0x58b0ff, 0x3a88ec, 0x2c4890],
  sticker: [0xa8d0f8, 0x70a8e8, 0x3a5aa0],
  under: [0x2c5aa0, 0x264e94, 0x1e2a64],
};

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2;
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T));
  const front = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w * T, h * T).translate(x * T, (y + h / 2) * T, z * T));

  const mats = (b: Bin) => ({
    body: ctx.mat('clothTeal', { ...FACE, ramp: b.body }),
    lid: ctx.mat('clothTeal', { ...FACE, ramp: b.lid }),
    sticker: ctx.mat('clothTeal', { ...FACE, ramp: b.sticker }),
    under: ctx.mat('clothTeal', { ...FACE, ramp: b.under }),
  });
  const green = mats(GREEN);
  const blue = mats(BLUE);
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x5a5a8a, 0x3e3c6a, 0x26244a] });

  // ── 三只桶：x −5、0、+5；桶身 5 × 7 行 × 7（正面 z +3.5），盖 5 × 1 行 × 8（往前探半纹素）──
  const D = 7;
  const ZF = D / 2;
  const H = 7 * R;
  [green, blue, green].forEach((m, i) => {
    const x = (i - 1) * 5;
    box(m.body, 5, H, D, x, 0, 0);
    box(m.lid, 5, R, D + 1, x, H, 0);
    front(kick, 5, R, x, 0, ZF + 0.02); // 轮子 / 底座
    front(m.under, 5, R, x, H - R, ZF + 0.02); // 盖唇下的暗影
    front(m.sticker, 3, R, x, 3 * R, ZF + 0.02);
  });

  const root = new THREE.Group();
  root.name = 'shop-trash-bins';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
