// grate-band：北巷的铁格栅采光带（B1 的天井上面，和地面平）。23.2 × 0.06 × 1.8 米（258 × 1 × 20 设计纹素），x 沿长边。
// 画法：不画格子（1 纹素的网格在 45° 下是噪点）—— 一圈混凝土窄沿（castWall，0.16 米）围着一条暗带（往下看天井 = 暗靛），
// 暗带里每 1.45 米一块格栅板（planks：板缝 + 每块自己一个深浅），四组扁铁（沿 x）各一条 1 纹素的亮唇（ironwork 的亮档，L 107 + 9，
// 和暗带差 < 60）。三角形 22（底座 12 + 暗带 2 + 4 条亮唇 8）。不挡路（noBlock），只在地面上的看法里出现。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const W = 23.2;
const D = 1.8;
const H = 0.06;
const RIM = 0.16;

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const t = ctx.texel;
  // 混凝土沿：一个扁盒子（顶面就是沿，侧面露出 0.06 米）
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(W, H, D).translate(0, H / 2, 0),
    ctx.mat('castWall', { elem: { kind: 'stones', size: [26, 6], seam: 0.45, hi: 0.3 } }),
  );
  g.add(base);

  // 暗带：往下看天井。手挑一套暗的三档（借 ironwork 调色，club 组暗档留蓝紫）；格栅板 = planks（沿 x 每 1.45 米一块）
  const iw = D - 2 * RIM;
  const dark = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 2 * RIM, iw).rotateX(-Math.PI / 2).translate(0, H + 0.002, 0),
    ctx.mat('ironwork', {
      ramp: [0x3a3470, 0x2e2a5a, 0x221e44],
      tones: {
        bands: [
          [0x3a3470, 0x443e7c, 0x322c64], // L 59 / 68 / 51（亮档：天井口朝天，但往下看是暗的）
          [0x2e2a5a, 0x363264, 0x28244e], // L 48 / 56 / 42
          [0x221e44, 0x28244c, 0x1c1838], // L 35 / 40 / 29
        ],
        seam: [0x28244e, 0x221e44, 0x181430],
        hi: [0x5a5490, 0x48447e, 0x34305e],
      },
      elem: { kind: 'planks', space: 'local', seam: 1, hi: 0, p: [1, 0, 0, 1.45], q: [1, 0, 0, 0] },
      edge: 0.05,
      convex: 0,
    }),
  );
  g.add(dark);

  // 四组扁铁的亮唇：每组一条屏幕上 1 纹素高的亮线（地面纵深 1 纹素 × √2 = 屏幕一行），沿 x 贯通（横线不出强边缘），
  // 离暗带北沿 0.18 / 0.56 / 0.94 / 1.32 米
  const lips: THREE.BufferGeometry[] = [];
  const z0 = -iw / 2;
  for (const dz of [0.18, 0.56, 0.94, 1.32].filter((d) => d < iw - 0.05))
    lips.push(
      new THREE.PlaneGeometry(W - 2 * RIM, t * Math.SQRT2).rotateX(-Math.PI / 2).translate(0, H + 0.004, z0 + dz),
    );
  // 亮唇 L 140（中档的淡紫灰，和暗带差 ≈ 75：横线只在两头算强边缘）
  g.add(
    new THREE.Mesh(
      mergeGeometries(lips),
      ctx.mat('ironwork', { ramp: [0x8e86c8, 0x6e68a4, 0x48446e], edge: 0.05, convex: 0 }),
    ),
  );
  ctx.mats.prepare(g, { cast: false });
  return g;
}
