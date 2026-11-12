// 橱窗展台（#33，纪念品店朝拱廊的橱窗里）：朝南（+z 对镜头）。1.62 × 1.78 × 0.63 米 = 18 × 19.8 × 7 纹素（14 行）。
// 元素：一座矮展台（会所红，2 行高，顶面亮档）；台上一个穿会所球衣的模特（浅米色的身子和蛋形头（亮档 L ≈ 180：和红球衣、红展台差 < 60），
// 红球衣 + 短袖、白短裤），两边各立一支球拍（拍面 6 × 7 行的八角框：天蓝 / 薄荷青，深色拍线；框和线差 < 60），
// 拍子在模特后面一点（模特的胳膊压在拍框里沿上）。竖直方向按屏幕行排（1 行 = 1.414 纹素）。三角形 150（预算 300）。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobNormals } from '../../clubsite/render/toon';
import type { AssetCtx } from '../ctx';

/** 朝镜头的竖直面：中档 */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };
/** 朝镜头、要落亮档的面（模特的象牙白、拍框） */
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
  /** 盒子（纹素）：左沿 x0、宽 w，y 底（行）、高 h（行），z 中心、深 d */
  const box = (m: THREE.Material, x0: number, w: number, y: number, h: number, z: number, d: number) =>
    put(m, new THREE.BoxGeometry(w * T, h * R * T, d * T).translate((x0 + w / 2) * T, (y + h / 2) * R * T, z * T));
  /** 朝镜头的薄片（纹素 / 行） */
  const face = (m: THREE.Material, x0: number, y0: number, w: number, h: number, z: number) =>
    put(m, new THREE.PlaneGeometry(w * T, h * R * T).translate((x0 + w / 2) * T, (y0 + h / 2) * R * T, z * T));

  // ── 材质 ──
  const plinth = ctx.mat('clothRed', { ...FACE, ramp: [0xf06050, 0xd04848, 0x62285a], convex: 0.3 });
  const ivory = ctx.mat('clothWhite', { ...GLOW, ramp: [0xd0b498, 0xbca088, 0x8a6e98] });
  const head = ctx.mat('clothWhite', {
    lightUp: 0.5,
    bands: [-0.9, -0.2],
    noShadowReceive: true,
    ramp: [0xd8bca0, 0xbca088, 0x8a6e98],
    convex: 0.2,
  });
  const shirt = ctx.mat('clothRed', { ...GLOW, ramp: [0xf06050, 0xe04c48, 0x62285a], convex: 0.25 });
  const shorts = ctx.mat('clothWhite', { ...GLOW, ramp: [0xf0ece4, 0xdcd4dc, 0x7a6ea0] });
  const strings = ctx.mat('ironwork', { ...GLOW, ramp: [0x7270a4, 0x5c5a88, 0x3a3862] });
  const grip = ctx.mat('ironwork', { ...GLOW, ramp: [0x6a5e8c, 0x584e78, 0x3a3458] });
  const frames = [
    ctx.mat('counter', { ...GLOW, ramp: [0x60bcf2, 0x2f7ec8, 0x2d4991] }),
    ctx.mat('clothTeal', { ...GLOW, ramp: [0x48ccb0, 0x2a9890, 0x24506e] }),
  ];

  // ── 展台：x −9…+9，z −3.5…+3.5，0…2 行（会所红；浅木台面和模特的象牙白腿分不开，不用）──
  box(plinth, -9, 18, 0, 2, 0, 7);

  // ── 两支拍子（立在台面上，z −2：模特后面）：拍面 6 × 7 行、拍喉 + 握把各 1 行，x0 = −9 / +3 ──
  const racket = (x0: number, fr: THREE.Material) => {
    const y0 = 2;
    const z = -2;
    face(grip, x0 + 2, y0, 2, 1, z);
    face(fr, x0 + 2, y0 + 1, 2, 1, z);
    face(fr, x0 + 1, y0 + 2, 4, 7, z);
    face(fr, x0, y0 + 3, 6, 5, z);
    face(strings, x0 + 1, y0 + 3, 4, 5, z + 0.05);
  };
  racket(-9, frames[0]);
  racket(3, frames[1]);

  // ── 模特（x −3…+3 的身子，z 0.5 中心，身子只 2 纹素厚：45° 下顶面小，头不被肩挡住）──
  //   腿 2…6 行、短裤 6…7.5、球衣 7.5…11（短袖 + 小臂垂在两边，x ±3…±5）、脖子 11…11.5、蛋形头 11.5…14
  const ZM = 0.5;
  box(ivory, -2, 4, 2, 4, ZM, 2); // 两条腿（并成一块，中间一道 1 纹素的缝）
  face(grip, -0.5, 2, 1, 3, ZM + 1.01); // 腿缝
  box(shorts, -3, 6, 6, 1.5, ZM, 2.5);
  box(shirt, -3, 6, 7.5, 3.5, ZM, 2.5);
  for (const x0 of [-5, 3]) {
    box(shirt, x0, 2, 9.5, 1.5, ZM, 2); // 短袖
    box(ivory, x0, 2, 7, 2.5, ZM, 1.5); // 小臂
  }
  box(ivory, -1, 2, 11, 0.5, ZM, 1.5); // 脖子
  const egg = new THREE.IcosahedronGeometry(1.9 * T, 0).scale(1, 1.2, 0.9).translate(0, 12.7 * R * T, ZM * T);
  put(head, blobNormals(egg, new THREE.Vector3(0, 12.5 * R * T, ZM * T)));

  const root = new THREE.Group();
  root.name = 'window-display';
  for (const [m, gs] of bins) {
    const list = gs.some((g) => !g.index) ? gs.map((g) => (g.index ? g.toNonIndexed() : g)) : gs;
    root.add(new THREE.Mesh(list.length > 1 ? mergeGeometries(list) : list[0], m));
  }
  ctx.mats.prepare(root);
  return root;
}
