// 穿线 · 试拍吧 · 试拍墙（#49）：贴北墙、朝南（+z 对镜头）。3.0 × 2.2 × 0.4 米 = 33 × 24.4 × 4.4 纹素（17 行）。
// 和专卖店的拍子墙（racket-wall）是一家，但不一样：会所蓝的背板（横板，每 4 行一道缝）+ 两头和顶上蜂蜜色的木框，
// 五支试打拍一正一倒咬着排（正挂 3 支橙框、倒挂 2 支粉框：倒挂的拍面落在正挂两支的握把之间），
// 拍面 6 × 7 行的八角框 + 4 × 5 行浅紫的拍线，拍喉 1 行 + 握把 3 行；底下一条矮木台（台面亮档）。
// 竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 ≈ 120（预算 350）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

/** 朝镜头的竖直面：中档 */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 朝镜头、要落亮档的小面（拍框） */
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
  const back = ctx.mat('counter', {
    ...FACE,
    ramp: [0x4aa4ee, 0x2f7ec8, 0x2d4991],
    tones: {
      bands: [
        [0x4aa4ee, 0x56aef4, 0x409ae4],
        [0x2f7ec8, 0x3888d2, 0x2874bc], // L 112 / 122 / 103
        [0x2d4991, 0x35539b, 0x274187],
      ],
      seam: [0x3484cc, 0x2462a8, 0x223878],
      hi: [0x6cbcf8, 0x4a98e0, 0x4464ac],
    },
    elem: { kind: 'planks', space: 'local', p: [0, 1, 0, 4 * R * T], seam: 1, hi: 0 },
  });
  const wood = ctx.mat('wood', { ...FACE, ramp: [0xf0b06a, 0xc8845e, 0x8a5a76], convex: 0.3 });
  const kick = ctx.mat('ironwork', { ...FACE, ramp: [0x5a4a7a, 0x463a68, 0x302850] });
  const strings = ctx.mat('clothWhite', { ...GLOW, ramp: [0xa8a4d8, 0x8a86bc, 0x5a5890] }); // L 168：浅紫的线
  const grip = ctx.mat('ironwork', { ...GLOW, ramp: [0x4c4474, 0x3a3458, 0x2a2644] });
  const tape = ctx.mat('clothWhite', { ...GLOW, ramp: [0xe8e0d0, 0xd0c8d0, 0x8a7ea8] });
  const orange = ctx.mat('toolOrange', { ...GLOW, ramp: [0xff8c40, 0xd8603a, 0x7a3456] });
  const pink = ctx.mat('fabricStripe', { ...GLOW, ramp: [0xf0609c, 0xc04478, 0x6a2a62] });

  // ── 矮台 + 背板 + 木框（宽 33：x −16.5…+16.5；深 4.4：z −2.2…+2.2）──
  box(wood, 33, 1, 4.4, 0, 0, 0); // 矮台 0…1 行（顶面亮档）
  face(kick, -16.5, 0, 33, 1, 2.2, 1);
  const ZF = 1.2; // 背板正面
  box(back, 29, 15, 3.4, 0, 1, ZF - 1.7); // 背板 1…16 行
  for (const s of [-1, 1]) box(wood, 2, 15, 3.8, s * 15.5, 1, ZF - 1.7); // 两头的木框柱（出背板 0.2）
  box(wood, 33, 1, 3.8, 0, 16, ZF - 1.7); // 顶上的木框 16…17 行

  // ── 拍子（6 纹素 × 11 行）：up = 拍面在上（握把底在 y0），否则拍面在下（拍面底在 y0）
  const racket = (x0: number, y0: number, up: boolean, fr: THREE.Material) => {
    const hy = up ? y0 + 4 : y0; // 拍面底
    face(fr, x0 + 1, hy, 4, 7, ZF, 1);
    face(fr, x0, hy + 1, 6, 5, ZF, 1);
    face(strings, x0 + 1, hy + 1, 4, 5, ZF, 2);
    if (up) {
      face(fr, x0 + 2, y0 + 3, 2, 1, ZF, 1); // 拍喉
      face(grip, x0 + 2, y0 + 1, 2, 2, ZF, 1);
      face(tape, x0 + 2, y0, 2, 1, ZF, 1); // 握把底的白胶带
    } else {
      face(fr, x0 + 2, y0 + 7, 2, 1, ZF, 1);
      face(grip, x0 + 2, y0 + 8, 2, 2, ZF, 1);
      face(tape, x0 + 2, y0 + 10, 2, 1, ZF, 1);
    }
  };
  // 正挂 3 支（4.5…15.5 行），倒挂 2 支（1.5…12.5 行），节距 6：一正一倒咬着
  for (let i = 0; i < 3; i++) racket(-14 + i * 11, 4.5, true, orange);
  for (let i = 0; i < 2; i++) racket(-8.5 + i * 11, 1.5, false, pink);

  const root = new THREE.Group();
  root.name = 'shop-demo-wall';
  for (const [m, gs] of bins) {
    const list = gs.some((g) => !g.index) ? gs.map((g) => (g.index ? g.toNonIndexed() : g)) : gs;
    root.add(new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], m));
  }
  ctx.mats.prepare(root);
  return root;
}
