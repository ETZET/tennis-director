// 电梯门厅的泳池毛巾格（#65）：1.17 × 1.43 × 0.41 米 = 13 × 16 × 4.5 纹素（格子 9 行 + 顶上两卷毛巾）。
// 元素：柚木色的格子柜（1 纹素的格板、侧板，脚下一行深色踢脚）：3 列 × 3 层，每格是两卷叠着的毛巾（端面朝外，
// 青绿、薄荷白一卷一卷错开 = 一条条的青 / 白横纹；最下面一层的青绿深一号，在格子里背光）；
// 顶上两卷（圆柱，端面朝镜头）读出"卷起来的毛巾"。
// 横着相邻的（格板 | 毛巾 | 格板）亮度差都 < 60。三角形 ≈ 110（预算 200）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.25 };

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
  /** 卷好的毛巾：轴沿 z 的圆柱（半径 r、长 len，纹素），中心 x、y、z */
  const roll = (m: THREE.Material, r: number, len: number, x: number, y: number, z: number) =>
    put(m, new THREE.CylinderGeometry(r * T, r * T, len * T, 8).rotateX(Math.PI / 2).translate(x * T, y * T, z * T));

  // ── 材质 ──
  const wood = ctx.mat('timber', { ...FACE, ramp: [0xf0b070, 0xdc9658, 0x6a3e5a] });
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x6a4a76, 0x4a3460, 0x2c2448] });
  const teal = ctx.mat('clothTeal', { ...FACE, ramp: [0x4ccab8, 0x2aa8a0, 0x24606e] });
  const hole = ctx.mat('timber', { ...FACE, ramp: [0x8a5a5a, 0x7a4a5a, 0x4a3050] });
  const deep = ctx.mat('clothTeal', { ...FACE, ramp: [0x2c9a94, 0x1c8080, 0x1e4a60] });
  const mint = ctx.mat('jug', { ...FACE, ramp: [0xa8f0dc, 0x74ccb4, 0x4a8a9a] });
  // 顶上那两卷：圆柱的顶亮、端面中档
  const tealRoll = ctx.mat('clothTeal', { ...FACE, convex: 0.2, ramp: [0x4ccab8, 0x2aa8a0, 0x1e5a6a] });
  const mintRoll = ctx.mat('jug', { ...FACE, convex: 0.2, ramp: [0xa8f0dc, 0x74ccb4, 0x4a8a9a] });

  // ── 柜子：13 × 9 行 × 4.5。柜身的盒子往里收半纹素，正面的格板、侧板、毛巾都是同一个面上的片
  // （没有深度差 → 格板和毛巾之间不出描边的暗线）──
  const W = 13;
  const D = 4.5;
  const ZF = D / 2;
  const Z = ZF + 0.02;
  box(wood, W, 9 * R, D - 0.5, 0, 0, -0.25);
  front(kick, W, R, 0, 0, Z);
  for (const r of [3, 6]) front(wood, W, R, 0, r * R, Z); // 格板
  for (const x of [-6, -2, 2, 6]) for (const r of [1, 4, 7]) front(wood, 1, 2 * R, x, r * R, Z); // 侧板、隔板
  // 3 层（行 1…2、4…5、7…8，每层两卷毛巾；最上面一层顶着柜顶），3 列（格宽 3）。
  // 最上面一层东边那格只剩一卷（上面露出格子里的暗处）
  const cols = [-4, 0, 4];
  const tiers = [1, 4, 7];
  tiers.forEach((r0, t) => {
    cols.forEach((cx, c) => {
      const lowFirst = (t + c) % 2 === 0;
      const a = t === 0 ? deep : teal;
      const [lo, hi] = lowFirst ? [a, mint] : [mint, a];
      front(lo, 3, R, cx, r0 * R, Z);
      front(t === 2 && c === 2 ? hole : hi, 3, R, cx, (r0 + 1) * R, Z);
    });
  });

  // ── 顶上两卷（薄荷白、青），端面朝镜头 ──
  const top = 9 * R;
  const r = 1.6;
  roll(mintRoll, r, 4, -2, top + r, 0);
  roll(tealRoll, r, 4, 1.6, top + r, -0.2);

  const root = new THREE.Group();
  root.name = 'shop-towel-shelf';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
