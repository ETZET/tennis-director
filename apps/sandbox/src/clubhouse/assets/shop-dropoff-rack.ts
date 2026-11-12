// 穿线 · 试拍吧 · 送穿架（#51，挂满 = 信号：活积压了）：朝南（+z 对镜头）。1.26 × 1.6 × 0.36 米 = 14 × 17.8 × 4 纹素（12.5 行）。
// 元素：青绿的架子（两根立柱 + 顶上一根横杆 + 两只脚）；前后两排挂满五支拍子（拍面 4 纹素 × 5 行的八角框 + 深色拍线）：
// 后排 2 支（蓝、粉）挂在横杆下，前排 3 支（红、橙、紫）低一截、错开半格，握把上各拴一张亮色的工单签（2 纹素 × 1.5 行：黄、白、黄绿）。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 ≈ 110（预算 250）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** 朝镜头的竖直面：中档 */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 朝镜头、要落亮档的小面 */
const GLOW = { lightUp: 0.55, bands: [-0.9, -0.6] as [number, number], noShadowReceive: true, convex: 0.2 };

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
  /** 朝镜头的薄片（纹素 / 行）：左下角 x0、行 y0，宽 w、高 h 行，z 纹素 + 层 */
  const face = (m: THREE.Material, x0: number, y0: number, w: number, h: number, z: number, layer = 0) =>
    put(
      m,
      new THREE.PlaneGeometry(w * T, h * R * T).translate(
        (x0 + w / 2) * T,
        (y0 + h / 2) * R * T,
        z * T + 0.004 * layer,
      ),
    );

  // ── 材质 ──
  const frame = ctx.mat('clothTeal', { ...FACE, ramp: [0x3cc4ac, 0x2a9890, 0x24506e], convex: 0.3 });
  const strings = ctx.mat('ironwork', { ...GLOW, ramp: [0x6a6898, 0x55547e, 0x3a3862] });
  const grip = ctx.mat('ironwork', { ...GLOW, ramp: [0x4c4474, 0x3a3458, 0x2a2644] });
  const red = ctx.mat('clothRed', { ...GLOW, ramp: [0xf0584a, 0xc03c4c, 0x6a2a5a] });
  const blue = ctx.mat('counter', { ...GLOW, ramp: [0x4a9aec, 0x2f7ec8, 0x2d4991] });
  const orange = ctx.mat('toolOrange', { ...GLOW, ramp: [0xff8c40, 0xd8603a, 0x7a3456] });
  const purple = ctx.mat('clothPurple', { ...GLOW, ramp: [0xa070e0, 0x7a50b8, 0x4a3080] });
  const tagY = ctx.mat('ball', { ...GLOW, ramp: [0xf4d040, 0xd0a83c, 0x8a6a5a] });
  const tagW = ctx.mat('clothWhite', { ...GLOW, ramp: [0xf0e8dc, 0xd4ccd8, 0x8a7ea8] });
  const pink = ctx.mat('fabricStripe', { ...GLOW, ramp: [0xf0609c, 0xc04478, 0x6a2a62] });
  const tagG = ctx.mat('ball', { ...GLOW, ramp: [0xc0e050, 0x9cc044, 0x5a7a5a] });

  // ── 架子：x −7…+7（14），z −2…+2（4）。立柱在后面（z −1.5），拍子挂在前面（z +0.5）──
  for (const s of [-1, 1]) {
    box(frame, 1.5, 1, 4, s * 6.25, 0, 0); // 脚
    box(frame, 1.5, 10.5, 1.5, s * 6.25, 1, -1.25); // 立柱
  }
  box(frame, 14, 1, 2, 0, 11.5, -1); // 顶上的横杆 11.5…12.5 行（顶面亮档）

  // ── 拍子（拍面 4 纹素 × 5 行的八角框 + 2 × 3 行的拍线）：x0 = 拍面左沿，y0 = 握把底（行）
  const racket = (fr: THREE.Material, x0: number, y0: number, z: number, L: number, tag?: THREE.Material) => {
    face(grip, x0 + 1, y0, 2, 2.5, z, L + 1);
    face(fr, x0 + 1, y0 + 2.5, 2, 1, z, L + 1); // 拍喉
    face(fr, x0 + 1, y0 + 3.5, 2, 5, z, L + 1);
    face(fr, x0, y0 + 4.5, 4, 3, z, L + 1);
    face(strings, x0 + 1, y0 + 4.5, 2, 3, z, L + 2);
    if (tag) face(tag, x0 + 1, y0 + 0.5, 2, 1.5, z, L + 3); // 工单签
  };
  // 后排 2 支挂在横杆下（拍面从前排的空当上面露出来），前排 3 支低一截、握把上拴着工单签
  racket(blue, -4.5, 3, -1, 0);
  racket(pink, 0.5, 3, -1, 0);
  racket(red, -7, 0.5, 1.6, 0, tagY);
  racket(orange, -2, 0.5, 1.6, 0, tagW);
  racket(purple, 3, 0.5, 1.6, 0, tagG);

  const root = new THREE.Group();
  root.name = 'shop-dropoff-rack';
  for (const [m, gs] of bins) {
    const list = gs.some((g) => !g.index) ? gs.map((g) => (g.index ? g.toNonIndexed() : g)) : gs;
    root.add(new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], m));
  }
  ctx.mats.prepare(root);
  return root;
}
