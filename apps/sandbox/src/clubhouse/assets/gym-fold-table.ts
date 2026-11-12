// B1 洗衣房的叠衣台（#152）：1.8 × 1.15 × 0.81 米 = 20 × 12.7 × 9 纹素（台面 0.76 米，毛巾摞到 1.15 米），朝南（+z 对镜头），洗衣工站在北边。
// 元素：木台面（planks，沿 x 的长板、每 3 纹素一道缝，台面 1 行厚、在 0.76 米）+ 两头 3 纹素宽的实木腿板 + 下面一层搁板；
// 台面上两摞叠好的毛巾（白 / 会所青相间，每条 6 × 1 行 × 4，叠得不太齐）+ 一条摊开正在叠的白毛巾。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 132（预算 150）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 毛巾：正面也落亮档（白 / 青毛巾正面是中档就是灰的） */
const CLOTH = { lightUp: 0.55, bands: [-0.45, -0.25] as [number, number], noShadowReceive: true, convex: 0.3 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖面上的 1 屏幕行（纹素）
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T));

  // ── 材质 ──
  // 台面：不接投影（毛巾堆的影子落在台面上是一片糊的暗块）；板缝只比板暗 ≈ 25
  const top = ctx.mat('wood', {
    elem: { kind: 'planks', space: 'local', p: [0, 0, 1, 3 * T], seam: 1, hi: 0 },
    ramp: [0xe8a868, 0xc07c52, 0x5e426e],
    tones: {
      bands: [
        [0xe8a868, 0xf0b474, 0xdc9c60],
        [0xc07c52, 0xca865a, 0xb4704a],
        [0x5e426e, 0x684a76, 0x543a64],
      ],
      seam: [0xc8885a, 0xa0603e, 0x4a3460],
      hi: [0xf6c488, 0xd09068, 0x6e5480],
    },
    noShadowReceive: true,
  });
  const leg = ctx.mat('wood', { ...FACE, ramp: [0xc07c52, 0xa0603e, 0x4e3664] });
  const shelf = ctx.mat('wood', { ramp: [0xc8885a, 0x9a6448, 0x4e3664], noShadowReceive: true });
  const white = ctx.mat('clothWhite', CLOTH);
  const teal = ctx.mat('clothTeal', CLOTH);

  // ── 台子：台面 20 × 1 行 × 9（顶在 6 行 ≈ 0.76 米），两头腿板 3 × 5 行 × 8，搁板在 1 行 ──
  const YT = 5 * R; // 台面底
  box(top, 20, R, 9, 0, YT, 0);
  for (const sx of [-1, 1]) box(leg, 3, YT, 8, sx * 8, 0, 0);
  box(shelf, 13, 0.7, 7, 0, R, -0.5);

  // ── 毛巾：两摞（西 3 条、东 3 条，白青相间，叠得不齐 = 每条错 0 或 1 纹素）+ 中间摊开的一条 ──
  const Y0 = YT + R;
  const piles: [number, number[]][] = [
    [-6, [0, 1, 0]],
    [5, [1, 0, 1]],
  ];
  for (const [i, [px, offs]] of piles.entries())
    for (let k = 0; k < 3; k++) box((k + i) % 2 === 0 ? white : teal, 6, R, 4, px + offs[k], Y0 + k * R, -1.5);
  box(white, 7, 0.7, 5, -0.5, Y0, 2);

  const root = new THREE.Group();
  root.name = 'gym-fold-table';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
