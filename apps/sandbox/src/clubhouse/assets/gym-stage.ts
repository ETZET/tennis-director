// 团课房的教练台（B1，北头朝南）：一块木台面（板条）压在往里缩 1 纹素的暗台裙上，前沿一条青绿的防滑沿，台面东北角一只小音箱。
// 2.43 × 0.84 × 1.17 米（27 × 9.3 × 13 设计纹素；台面高 0.30 = 3.3 纹素，音箱顶 0.84）；教练站在台面中间（y 0.30）。
// 元素：台面 planks（沿 x 的板，每 0.29 米一块，缝 1 纹素 + 缝后亮条）；别的平涂。
// 三角形 104（台面 12 + 台裙 12 + 防滑沿 12 + 音箱 12 + 两只喇叭 2 × 28）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
/** 盒子：中心 x、z，底在 y */
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
/** 朝镜头的立面：光往上偏 + 档位往下挪（太阳在后方时正面留在中档） */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number] };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) => g.add(new THREE.Mesh(mergeGeometries(gs), m));

  const W = 27 * T;
  const H = 0.3;
  const zb = -6.5 * T; // 后沿
  const zf = 5.5 * T; // 台面前沿（再往前 1 纹素是防滑沿）

  // 台面：一块 1 纹素厚的板（板条沿 x，缝沿 z 每 0.29 米），前沿再往前 1 纹素是防滑沿
  // 板缝比 timber 自带的深一截（亮档缝 L ≈ 102，和板面差 < 60）：一道道横的暗缝 = 台面的明暗骨架
  const deck = ctx.mat('timber', {
    ...FACE,
    bands: [-0.45, 0.2],
    elem: { kind: 'planks', p: [0, 0, 1, 0.29], seam: 1, hi: 1 },
    tones: {
      bands: [
        [0xd8925c, 0xe29e66, 0xcc8654],
        [0xa86650, 0xb2725a, 0x9c5a4a],
        [0x5c3e6c, 0x664876, 0x523662],
      ],
      seam: [0x9a5a48, 0x7a4252, 0x3e2a58],
      hi: [0xeeae74, 0xc07e64, 0x74568a],
    },
  });
  add([box(W, T, zf - zb, 0, H - T, (zb + zf) / 2)], deck);
  // 台裙：台面下往里缩 1 纹素（朝镜头这面落暗档 = 台面下的一道影子）
  add(
    [box(W - 2 * T, H - T, zf - zb - T, 0, 0, (zb + zf) / 2 - T / 2)],
    ctx.mat('timber', { bands: [0.1, 0.5], convex: 0.2, noShadowReceive: true }),
  );
  // 防滑沿：台面前沿一整条（1 纹素见方），青绿漆
  add(
    [box(W, T, T, 0, H - T, zf + T / 2)],
    ctx.mat('clothTeal', {
      ...FACE,
      ramp: [0x5ad8c4, 0x2aa09c, 0x22567a],
      edge: 0.6,
      convex: 0.3,
      noShadowReceive: true,
    }),
  );
  // 音箱：台面东北角，喇叭朝南
  const sx = 8.5 * T;
  const sz = -4 * T;
  add([box(4 * T, 6 * T, 3 * T, sx, H, sz)], ctx.mat('ironwork', { ...FACE, convex: 0.3, noShadowReceive: true }));
  const cone = (r: number, y: number) =>
    new THREE.CylinderGeometry(r, r, 0.02, 7).rotateX(Math.PI / 2).translate(sx, H + y, sz + 1.5 * T + 0.01);
  add(
    [cone(1.4 * T, 2 * T), cone(0.7 * T, 4.6 * T)],
    ctx.mat('metal', { ...FACE, edge: 0.3, convex: 0.2, noShadowReceive: true }),
  );

  ctx.mats.prepare(g);
  return g;
}
