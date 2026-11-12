// B1 洗衣房西北角：布草滑槽的出口 + 下面一堆脏毛巾（#154）。脚印 1.1 × 0.9 米（12 × 10 纹素），北边（−z）贴墙。
// 元素：贴墙一根深钢蓝的方管从上面下来（6 纹素宽，到 2.3 米），管口是一个往前探的宽斗（8 纹素宽，正面最下一行深色 = 斗口）+ 一道亮的唇；
// 斗下面地上一堆脏毛巾：低多边形的团（白、灰紫、几条会所青和蓝灰），球面法线、一团一个颜色，堆高 ≈ 0.6 米，快堆到斗口了。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 198（预算 220）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobNormals } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 布团：抬一点光，一团团的亮顶 */
const HEAP = { lightUp: 0.4, bands: [-0.5, 0.3] as [number, number], noShadowReceive: true, convex: 0.25, edge: 0.5 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2; // 竖面上的 1 屏幕行（纹素）
  const rnd = ctx.rng('gym-chute:heap');
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T));
  const lump = (m: THREE.Material, r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const g = new THREE.IcosahedronGeometry(r * T, 0)
      .rotateY(rnd() * Math.PI)
      .scale(sx, sy, sz)
      .translate(x * T, y * T, z * T);
    put(m, blobNormals(g, new THREE.Vector3(x * T, (y - r * 0.5) * T, z * T)));
  };

  // ── 材质 ──
  const steel = ctx.mat('metal', { ...FACE, ramp: [0xb0dcec, 0x74aacc, 0x3e5a80], convex: 0.6 });
  // 方管：深一档的钢蓝（中档 L ≈ 105），斗是亮的钢 —— 管和斗分得开，画面里也有一块暗
  const duct = ctx.mat('metal', { ...FACE, ramp: [0x7aa4cc, 0x4a70a4, 0x2e3e6e], convex: 0.4 });
  const steelLip = ctx.mat('metal', { ...FACE, bands: [-0.9, -0.6], ramp: [0xd0ecf4, 0xa4cce0, 0x4a6488] });
  const mouth = ctx.mat('ironwork', { ...FACE, ramp: [0x3a3a7a, 0x2c2a62, 0x201e48], edge: 0.2 });
  const white = ctx.mat('clothWhite', HEAP);
  const grey = ctx.mat('clothWhite', { ...HEAP, ramp: [0xdcc8e4, 0xa892c0, 0x6a5a96] });
  const teal = ctx.mat('clothTeal', HEAP);
  const blueGrey = ctx.mat('clothBlue', { ...HEAP, ramp: [0x9ab8e8, 0x6a8ad0, 0x3a4486] });

  // ── 滑槽：方管 6 × 3（z −5…−2），从 行 8 到 行 18（≈ 1.0…2.3 米）；斗 8 × 2 行 × 5（z −5…0，行 6…8 ≈ 0.76…1.0 米），斗口深色 ──
  box(duct, 6, 10 * R, 3, 0, 8 * R, -3.5);
  box(steel, 8, 2 * R, 5, 0, 6 * R, -2.5);
  box(steelLip, 8, 0.7, 1, 0, 6 * R, 0.5);
  decal(mouth, 6, R, -3, 6 * R, 0); // 斗口：正面最下面一行深色（斗口朝下、朝前）

  // ── 脏毛巾堆：斗下面，x −5.5…+5.5、z −3.5…+4.5，堆高 ≈ 6 纹素 ──
  const heap: [THREE.Material, number, number, number, number, number, number, number][] = [
    [white, 3.2, 1.3, 0.8, 1.1, -2.2, 2.2, -0.5],
    [grey, 3.0, 1.3, 0.75, 1.1, 2.4, 2.0, 0.4],
    [white, 2.6, 1.2, 0.8, 1.0, 0.2, 2.0, 2.4],
    [teal, 2.0, 1.4, 0.6, 1.0, -3.8, 1.2, 2.6],
    [grey, 2.4, 1.2, 0.85, 1.0, 0, 4.2, -1.2],
    [white, 2.0, 1.2, 0.8, 1.0, 3.6, 1.2, 3.0],
    [blueGrey, 2.0, 1.3, 0.7, 1.0, -1.6, 4.6, 0.6],
    [white, 1.8, 1.1, 0.9, 1.0, 1.6, 5.4, -0.2],
  ];
  for (const [m, r, sx, sy, sz, x, y, z] of heap) lump(m, r, sx, sy, sz, x, y, z);

  function decal(m: THREE.Material, w: number, h: number, x: number, y: number, z: number) {
    put(m, new THREE.PlaneGeometry(w * T, h * T).translate((x + w / 2) * T, (y + h / 2) * T, z * T + 0.004));
  }

  const root = new THREE.Group();
  root.name = 'gym-chute';
  for (const [m, gs] of bins) {
    const list = gs.some((g) => !g.index) ? gs.map((g) => (g.index ? g.toNonIndexed() : g)) : gs;
    root.add(new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], m));
  }
  ctx.mats.prepare(root);
  return root;
}
