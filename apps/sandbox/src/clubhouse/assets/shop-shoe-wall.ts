// 专卖店 · 球鞋墙（#46）：立在店中间、朝南（+z 对镜头）。2.43 × 1.78 × 0.5 米 = 27 × 19.8 × 5.5 纹素（14 行）。
// 元素：两根深青的立柱 + 深色踢脚 + 顶上一条浅枫木的顶板（上面摞着三只鞋盒）；三层会所青的层板（每层 1 行，顶面亮档 = 鞋缝里露出来的颜色），
// 每层 5 只鞋（3 纹素宽：一行白鞋底 + 一行鞋面，鞋面红、蓝、橙、紫、黄绿轮着，层与层错开），鞋上面空 1 行露背板。
// 鞋只画朝镜头的面 + 鞋面的顶（看不见的面不画）。竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 222（预算 300）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** 朝镜头的竖直面：中档 */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 鞋：3 纹素宽，描边压暗会吃掉两边各 1 纹素 → 描边弱一点 */
const SHOE = { ...FACE, edge: 0.2, convex: 0.1 };
/** 朝镜头、要落亮档的小面 */
const GLOW = { lightUp: 0.55, bands: [-0.9, -0.6] as [number, number], noShadowReceive: true, convex: 0.1, edge: 0.2 };

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const R = Math.SQRT2;
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const a = bins.get(m);
    if (a) a.push(g);
    else bins.set(m, [g]);
  };
  /** 盒子（纹素）：宽、高（行）、深，x / z 中心，y 底（行） */
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * R * T, d * T).translate(x * T, (y + h / 2) * R * T, z * T));
  /** 朝镜头的面（纹素 / 行）：左沿 x0、行 y0，宽 w、高 h 行，z 纹素 */
  const face = (m: THREE.Material, x0: number, y0: number, w: number, h: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w * T, h * R * T).translate((x0 + w / 2) * T, (y0 + h / 2) * R * T, z * T));
  /** 朝上的面（纹素）：左沿 x0、高 y（行），宽 w、深 d，前沿 z1 */
  const lid = (m: THREE.Material, x0: number, y: number, w: number, d: number, z1: number) =>
    put(
      m,
      new THREE.PlaneGeometry(w * T, d * T)
        .rotateX(-Math.PI / 2)
        .translate((x0 + w / 2) * T, y * R * T, (z1 - d / 2) * T),
    );

  // ── 材质 ──
  const back = ctx.mat('clothTeal', { ...FACE, ramp: [0x40c0b0, 0x30a49a, 0x24506e] });
  const post = ctx.mat('clothTeal', { ...FACE, ramp: [0x1ca8a0, 0x14908e, 0x1e4466], convex: 0.3 });
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x4a4a7a, 0x3a3a6a, 0x262448] });
  // 层板：会所青（顶面亮档，鞋和鞋之间露出来的就是它）；顶板浅枫木
  const shelf = ctx.mat('clothTeal', { ...FACE, ramp: [0x40ccb0, 0x1ca894, 0x24506e], convex: 0.3 });
  const cap = ctx.mat('woodWeathered', { ...FACE, ramp: [0xf4cc90, 0xdca46c, 0x8a5a7a], convex: 0.4 });
  const sole = ctx.mat('clothWhite', { ...SHOE, ramp: [0xf0ece4, 0xd8d0dc, 0x8a7ea8] });
  const boxA = ctx.mat('toolOrange', { ...FACE, ramp: [0xffa050, 0xe0703c, 0x7a3456], convex: 0.4 });
  const boxB = ctx.mat('clothRed', { ...FACE, ramp: [0xf06050, 0xd84848, 0x6a2a5a], convex: 0.4 });
  const boxC = ctx.mat('counter', { ...FACE, ramp: [0x5aaaf0, 0x3a7ed8, 0x2d4991], convex: 0.4 });
  const uppers = [
    ctx.mat('clothRed', { ...SHOE, ramp: [0xf06050, 0xe04c48, 0x6a2a5a] }),
    ctx.mat('counter', { ...SHOE, ramp: [0x4a9aec, 0x3a7ee0, 0x2d4991] }),
    ctx.mat('toolOrange', { ...SHOE, ramp: [0xff9a48, 0xf08040, 0x7a3456] }),
    ctx.mat('clothPurple', { ...SHOE, ramp: [0xa86ae4, 0x9058d4, 0x3a2a7a] }),
    ctx.mat('ball', { ...SHOE, ramp: [0xc8e048, 0xb0cc40, 0x5a7a5a] }),
  ];
  const tops = [
    ctx.mat('clothRed', { ...GLOW, ramp: [0xf06050, 0xe04c48, 0x6a2a5a] }),
    ctx.mat('counter', { ...GLOW, ramp: [0x5aa8f0, 0x3a7ee0, 0x2d4991] }),
    ctx.mat('toolOrange', { ...GLOW, ramp: [0xffa858, 0xf08040, 0x7a3456] }),
    ctx.mat('clothPurple', { ...GLOW, ramp: [0xb47cec, 0x9058d4, 0x3a2a7a] }),
    ctx.mat('ball', { ...GLOW, ramp: [0xd4ec58, 0xb0cc40, 0x5a7a5a] }),
  ];

  // ── 架子：x −13.5…+13.5（27 纹素），z −2.75…+2.75（5.5 纹素）──
  const ZF = 2.75; // 正面
  box(kick, 23, 1, 5, 0, 0, 0); // 踢脚 0…1 行
  box(back, 23, 12, 1.5, 0, 1, -2); // 背板 1…13 行（正面 z −1.25）
  for (const x of [-12.5, 12.5]) box(post, 2, 14, 5.5, x, 0, 0); // 立柱 0…14 行
  box(cap, 27, 1, 5.5, 0, 13, 0); // 顶板 13…14 行
  // 三层层板（1、5、9 行）：深 4 纹素，前沿齐正面
  for (const y of [1, 5, 9]) box(shelf, 23, 1, 4, 0, y, ZF - 2);

  // ── 鞋：每层 5 只，x0 = −9.5、−5.5、−1.5、2.5、6.5（3 纹素宽、空 1 纹素；两头离立柱 2 纹素）──
  // 鞋底 1 行（白）+ 鞋面 1 行（颜色），前沿离层板前沿 0.5 纹素；鞋面顶 2 纹素深（亮一级）
  let k = 0;
  for (const [lv, y] of [1, 5, 9].entries()) {
    for (let i = 0; i < 5; i++) {
      const c = (i * 2 + lv * 3 + k) % uppers.length;
      const x0 = -9.5 + i * 4;
      const zf = ZF - 0.5;
      face(sole, x0, y + 1, 3, 1, zf);
      face(uppers[c], x0, y + 2, 3, 1, zf);
      lid(tops[c], x0, y + 3, 3, 2, zf);
    }
    k++;
  }

  // ── 顶板上三只鞋盒（5 纹素宽 × 1 行 × 4 深：橙、红、蓝；西边两只摞着）──
  box(boxA, 5, 1, 4, -8, 14, 0);
  box(boxB, 5, 1, 4, -8, 15, 0);
  box(boxC, 5, 1, 4, 5, 14, -0.5);

  const root = new THREE.Group();
  root.name = 'shop-shoe-wall';
  for (const [m, gs] of bins) root.add(new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m));
  ctx.mats.prepare(root);
  return root;
}
