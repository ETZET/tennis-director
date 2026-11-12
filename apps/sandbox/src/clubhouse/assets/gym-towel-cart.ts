// B1 洗衣房的干净毛巾车（#153）：1.08 × 1.02 × 0.63 米 = 12 × 11.3 × 7 纹素，推把在西头（−x）。
// 元素：会所蓝的帆布车斗（正面中档、筐口里面一块深色）+ 1 纹素的钢色底框 + 前面两个深色小轮（后面两个被挡住，不画）；
// 斗里冒出两摞叠好的会所青毛巾（顶面亮、正面亮档，每条 4 × 1 行 × 5，一摞错 1 纹素）；西头一根 2 纹素粗的钢推把（两根立柱 + 横杆）。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 158（预算 180）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
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
  const bag = ctx.mat('clothBlue', { ...FACE, ramp: [0x5a9cf4, 0x3a78ec, 0x2a3274], convex: 0.3 });
  const inner = ctx.mat('clothBlue', { ramp: [0x3a50a8, 0x2c3c8a, 0x22286a], noShadowReceive: true, edge: 0.2 });
  const steel = ctx.mat('metal', { ...FACE, ramp: [0x9cd0e8, 0x5c9cc4, 0x3e5a78], convex: 0.6 });
  const wheel = ctx.mat('ironwork', { ...FACE, ramp: [0x4a4a7a, 0x34345e, 0x262448] });
  const teal = ctx.mat('clothTeal', CLOTH);
  const tealLt = ctx.mat('clothTeal', { ...CLOTH, ramp: [0x7ae0cc, 0x50c8b6, 0x24607a] });

  // ── 车：轮 1 行，底框 1 行（9 × 7），车斗 4 行（9 × 4 行 × 7，x −4.5…+4.5，往东挪 1 纹素给推把）──
  const BX = 1;
  // 只画前面两个轮（后面两个 45° 下被车斗挡住）
  for (const sx of [-1, 1]) box(wheel, 2, R, 2, BX + sx * 3.5, 0, 2.5);
  box(steel, 9, 0.7, 7, BX, R, 0);
  box(bag, 9, 4 * R, 7, BX, R + 0.7, 0);
  const YR = R + 0.7 + 4 * R; // 车斗口
  put(inner, new THREE.PlaneGeometry(8 * T, 6 * T).rotateX(-Math.PI / 2).translate(BX * T, YR * T + 0.004, 0));
  // 推把：西头两根 2 × 2 的立柱 + 一根横杆（在斗口上面 2 行）
  for (const sz of [-1, 1]) box(steel, 2, 6 * R, 2, -4.5, R, sz * 2);
  box(steel, 2, R, 6, -4.5, 7 * R, 0);

  // ── 毛巾：斗里两摞，冒出斗口 1～2 条（每条 4 × 1 行 × 5，青 / 浅青相间）──
  for (const [i, px] of [-1, 3.5].entries())
    for (let k = 0; k < 3; k++)
      box((k + i) % 2 === 0 ? teal : tealLt, 4, R, 5, BX + px + (k === 1 ? 1 : 0) - 1, YR - R + k * R - (i ? R : 0), 0);

  const root = new THREE.Group();
  root.name = 'gym-towel-cart';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
