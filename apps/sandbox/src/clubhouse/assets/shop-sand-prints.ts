// 正门里的沙脚印（#64，信号：泳客湿着脚、带着沙从正门进来 → 该拖地了）：1.4 × 0.02 × 0.9 米 = 16 × 10 纹素的一片地。
// 正门在东边（slots-1f.ts 的 shop-sand-prints 在门里 0.95 米）：两串脚印从东（+x，门口）往西走进商店街。
// 元素：脚印是 4 × 2 纹素的沙团（左右脚错开、一步 ≈ 0.27 米），门口那几个是湿的深沙、中间半干、最里面的是干的浅沙（越走越淡、越稀）；
// 门口还有两小团抖下来的沙。平贴在地上（顶面朝上，亮档就是它的颜色；接投影，投影里是暗档那一套），不描边。
// 三角形 22（预算 40）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const FLAT = { edge: 0.05, convex: 0 };
/** 离本地 y 0 多高（米）：会所的地面铺在楼板上 0.03（terrain.ts），摆件 y 0.02 → 0.02 + 0.015 压在地面上面 */
const LIFT = 0.015;

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const rnd = ctx.rng('shop-sand-prints:steps');
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 地上的一块（纹素）：宽（x）、深（z），中心 x、z；按整纹素对齐 */
  const blob = (m: THREE.Material, w: number, d: number, x: number, z: number) =>
    put(
      m,
      new THREE.PlaneGeometry(w * T, d * T).rotateX(-Math.PI / 2).translate(Math.round(x) * T, LIFT, Math.round(z) * T),
    );

  // 湿沙（L ≈ 115，暗的那一份）、半干（L ≈ 157）、干沙（L ≈ 217）；暗档是投影里的
  const wet = ctx.mat('straw', { ...FLAT, ramp: [0x9a6040, 0x80504a, 0x5a3a5a] });
  const damp = ctx.mat('straw', { ...FLAT, ramp: [0xc88a58, 0xa06a56, 0x6a4a66] });
  const dry = ctx.mat('straw', { ...FLAT, ramp: [0xf4cc8a, 0xd0a070, 0x8a6a7a] });
  const byStep = [wet, wet, damp, dry, dry];

  // 两串：北边那串走直线，南边那串往北偏一点；x 从门口（+6）往里（−7），一步 3 纹素
  for (const [z0, drift, n] of [
    [-2, 0, 5],
    [2.5, -0.35, 4],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const x = 5.5 - i * 3 - (z0 > 0 ? 1.5 : 0);
      const side = i % 2 === 0 ? 1 : -1; // 朝西走：左脚在南（+z）
      const z = z0 + side * 1.2 + drift * i + (rnd() - 0.5) * 0.6;
      blob(byStep[Math.min(i, byStep.length - 1)], 4, 2, x, z);
    }
  }
  // 门口抖下来的沙：两小团（3 × 2、4 × 3）
  blob(damp, 3, 2, 6, -0.5);
  blob(wet, 4, 3, 5.5, 3.5);

  const root = new THREE.Group();
  root.name = 'shop-sand-prints';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root, { cast: false, receive: true });
  return root;
}
