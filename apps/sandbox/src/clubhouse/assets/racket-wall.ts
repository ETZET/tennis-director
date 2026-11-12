// 专卖店 · 拍子墙（#30）：贴北墙、朝南（+z 对镜头）。4.0 × 2.55 × 0.4 米 = 44 × 28 × 4.4 纹素（20 行）（场景里 s 0.9）。
// 元素：蜂蜜色竖条木板墙（planks，每 4 纹素一道缝）+ 底下一条矮台座（台面亮档）+ 顶上一条会所蓝的檐板；
// 两排拍子（下排 5 支、上排错开半格、只有西头 3 支）：拍面 6 × 7 行的八角框（亮的拍框色：红、蓝、橙、青、粉轮着）、
// 中间 4 × 5 行的深色拍线，拍喉 2 纹素 + 1 行深色握把；东头台面上一摞球罐。上排东头空着（slots-1f 的 shop-empty-hooks 挂在那：卖空了）。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 130（预算 400）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Tones } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

/** 朝镜头的竖直面：中档（太阳在后方，不抬就全黑） */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 朝镜头、要落亮档的小面（拍框） */
const GLOW = { lightUp: 0.55, bands: [-0.9, -0.6] as [number, number], noShadowReceive: true, convex: 0.2 };

const lum = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
/** 按亮度差 dL 提亮 / 压暗一个颜色（RGB 等比） */
const shade = (c: number, dL: number) => {
  const k = 1 + dL / Math.max(1, lum(c));
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (q((c >> 16) & 255) << 16) | (q((c >> 8) & 255) << 8) | q(c & 255);
};
/** 三档本色 → 元素调色板（高 / 低一级 ±8，缝 −20，亮边 +18） */
const tn3 = (lit: number, mid: number, dark: number): Tones => {
  const b = (c: number): [number, number, number] => [c, shade(c, 8), shade(c, -8)];
  return {
    bands: [b(lit), b(mid), b(dark)],
    seam: [shade(lit, -20), shade(mid, -20), shade(dark, -16)],
    hi: [shade(lit, 18), shade(mid, 18), shade(dark, 14)],
  };
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
  const slatT = tn3(0xe8a868, 0xc8845e, 0x8a5a76);
  const slat = ctx.mat('timber', {
    ...FACE,
    ramp: [0xe8a868, 0xc8845e, 0x8a5a76],
    tones: slatT,
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 4 * T], seam: 1, hi: 0 },
  });
  const cab = ctx.mat('wood', { ...FACE, ramp: [0xeaa864, 0xb4704e, 0x7a4c6c] });
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x5a4a7a, 0x463a68, 0x302850] });
  const cornice = ctx.mat('counter', { ...GLOW, ramp: [0x6cc8f4, 0x2f80c8, 0x2d4991], convex: 0.4 });
  const strings = ctx.mat('ironwork', { ...GLOW, ramp: [0x6a6898, 0x55547e, 0x3a3862] });
  const grip = ctx.mat('ironwork', { ...GLOW, ramp: [0x48406a, 0x3a3458, 0x2a2644] });
  const can = ctx.mat('ball', { ...GLOW, ramp: [0xc8e048, 0xa8c840, 0x5a7a5a] });
  const canBand = ctx.mat('clothWhite', { ...GLOW, ramp: [0xf4f0e8, 0xd4ccd8, 0x8a7ea8] });
  // 拍框色（亮档本色 L 120～165，和拍线 L ≈ 112 差 < 60：黄、黄绿的拍框 L > 190，和拍线之间一圈强边缘，不用）
  const red = ctx.mat('clothRed', { ...GLOW, ramp: [0xf0584a, 0xc03c4c, 0x6a2a5a] });
  const blue = ctx.mat('counter', { ...GLOW, ramp: [0x4a9aec, 0x2f7ec8, 0x2d4991] });
  const orange = ctx.mat('toolOrange', { ...GLOW, ramp: [0xff8c40, 0xd8603a, 0x7a3456] });
  const teal = ctx.mat('clothTeal', { ...GLOW, ramp: [0x34bca4, 0x2a9890, 0x24506e] });
  const pink = ctx.mat('fabricStripe', { ...GLOW, ramp: [0xf0609c, 0xc04478, 0x6a2a62] });
  const frames = [red, blue, orange, teal, pink, orange, pink, teal];

  // ── 台座 + 墙 + 檐板（宽 44：x −22…+22；深 4.4：z −2.2…+2.2）──
  box(cab, 44, 1, 4.4, 0, 0, 0); // 矮台座 0…1 行（顶面亮档 = 一条台面，球罐站在上面）
  face(kick, -22, 0, 44, 1, 2.2, 1); // 正面深色踢脚
  // 板墙 1…19 行，正面 z +1.9（差不多贴着包围盒前沿：空挂钩那块板在场景里挂在 z −39.1 = 这面的前面 4 厘米）
  box(slat, 44, 18, 4.1, 0, 1, -0.15);
  box(cornice, 44, 1, 4.1, 0, 19, -0.15); // 檐板 19…20 行（不出挑：出挑会挡住上排拍子的顶）

  // ── 拍子（屏幕上 6 × 9 纹素）：x0 = 拍面左沿，y0 = 握把底（行）。
  //   .XXXX.   拍面 6 × 7 行：一纹素的拍框（八角）+ 4 × 5 的拍线
  //   X####X
  //   X####X
  //   X####X
  //   X####X
  //   X####X
  //   .XXXX.
  //   ..XX..   拍喉
  //   ..GG..   握把
  const ZF = 1.9;
  let k = 0;
  const racket = (x0: number, y0: number) => {
    const fr = frames[k++ % frames.length];
    face(grip, x0 + 2, y0, 2, 1, ZF, 1);
    face(fr, x0 + 2, y0 + 1, 2, 1, ZF, 1);
    face(fr, x0 + 1, y0 + 2, 4, 7, ZF, 1);
    face(fr, x0, y0 + 3, 6, 5, ZF, 1);
    face(strings, x0 + 1, y0 + 3, 4, 5, ZF, 2);
  };
  // 下排 5 支（1…10 行），上排错开半格（握把落在下排两个拍面的空当里），只有西头 3 支（10…19 行）：
  // 东头 x 5.6…17.9 是 shop-empty-hooks 那块板（场景里 s 0.9、y 1.15、z −39.1 → 本地 ≈ 9.7…14 行）= 卖空了
  for (let i = 0; i < 5; i++) racket(-21 + i * 8, 1);
  for (let i = 0; i < 3; i++) racket(-17 + i * 8, 10);
  // 东头一摞球罐（3 罐，每罐 3 纹素 × 2 行：一行荧光黄罐身 + 一行白盖子）
  for (let i = 0; i < 3; i++) {
    face(can, 18, 1 + i * 2, 3, 1, ZF, 1);
    face(canBand, 18, 2 + i * 2, 3, 1, ZF, 1);
  }

  const root = new THREE.Group();
  root.name = 'racket-wall';
  for (const [m, gs] of bins) {
    const list = gs.some((g) => !g.index) ? gs.map((g) => (g.index ? g.toNonIndexed() : g)) : gs;
    root.add(new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], m));
  }
  ctx.mats.prepare(root);
  return root;
}
