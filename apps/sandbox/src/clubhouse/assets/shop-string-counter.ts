// 穿线柜台（1F 穿线 · 试拍吧，正面朝南对着递拍子窗；穿线师站在它北边）：
// 木柜身（竖板，3 纹素一块）+ 一纹素的深色踢脚 + 蜂蜜色木台面（出沿一纹素）；台面西半边两排彩色线轴（3 纹素的圆盘、1.5 纹素高，
// 前后错开），东头一块青绿的小钉板，上面钉着三张标签（奶白 / 粉 / 黄），钉板前面躺着一把等着取的拍子。
// 1.89 × 1.08 × 0.63 米（21 × 12 × 7 设计纹素；规格 1.9 × 1 × 0.6）。
// 元素：柜身正面、台面 planks（timber 的 tones）；其余平涂。三角形 ≈ 250。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
/** 朝镜头的竖直面：光往上偏 + 低档位（太阳在后方，正面不全黑） */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

type Ramp = [number, number, number];
/** 线盘的颜色：借同类的材质名（club 组的冷色留蓝紫，people / accent 组的暖色） */
const REELS: { key: 'ball' | 'clothRed' | 'clothBlue' | 'clothPurple' | 'clothTeal' | 'toolOrange'; ramp: Ramp }[] = [
  { key: 'clothRed', ramp: [0xff6a58, 0xd8424e, 0x74285c] },
  { key: 'ball', ramp: [0xd8f050, 0xb0cc40, 0x5a7a50] },
  { key: 'clothBlue', ramp: [0x5a9cf4, 0x3e6ed4, 0x2a3480] },
  { key: 'clothPurple', ramp: [0xb478f0, 0x8450cc, 0x46308a] },
  { key: 'clothTeal', ramp: [0x48d0bc, 0x2ca098, 0x24587a] },
  { key: 'toolOrange', ramp: [0xffa63c, 0xe46c3a, 0x7a3456] },
];

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (geos: THREE.BufferGeometry[], m: THREE.Material) => g.add(new THREE.Mesh(mergeGeometries(geos), m));

  const W = 21 * T;
  const ZB = -3.5 * T; // 背面
  const YTop = 11 * T; // 台面顶

  // 柜身：竖板（3 纹素一块），正面朝镜头
  const front = ctx.mat('timber', {
    ...FACE,
    convex: 0.3,
    elem: { kind: 'planks', space: 'local', p: [1, 0, 0, 3 * T], seam: 1, hi: 1 },
  });
  g.add(new THREE.Mesh(box(W, 9 * T, 6 * T, 0, T, ZB + 3 * T), front));
  // 踢脚：深一截、往里缩一纹素
  const kick = ctx.mat('wood', { ...FACE, ramp: [0x9c5c56, 0x7a4458, 0x4a3466], tones: undefined, convex: 0.2 });
  g.add(new THREE.Mesh(box(W, T, 5 * T, 0, 0, ZB + 2.5 * T), kick));
  // 台面：出沿一纹素，板沿 x 走；比柜身亮一截的蜂蜜色（顶面落亮档，L ≈ 178）
  const top = ctx.mat('timber', {
    convex: 0.5,
    noShadowReceive: true,
    ramp: [0xeaa870, 0xb8785c, 0x6a4a74],
    tones: {
      bands: [
        [0xeaa870, 0xf4b67e, 0xdc9a64],
        [0xb8785c, 0xc28464, 0xac6c54],
        [0x6a4a74, 0x74547e, 0x60406a],
      ],
      seam: [0xc8865a, 0x96604e, 0x4e3864],
      hi: [0xffc488, 0xd09070, 0x80609a],
    },
    elem: { kind: 'planks', space: 'local', p: [0, 0, 1, 2.5 * T], seam: 1, hi: 0 },
  });
  g.add(new THREE.Mesh(box(W, T, 7 * T, 0, 10 * T, 0), top));

  // 线盘：竖放的线轴（3 纹素的圆盘、1.5 纹素高），前排三个、后排三个（往东错两纹素，从前排的空里露出来）
  const R = 1.6 * T;
  const reel = (i: number, x: number, z: number) => {
    const r = REELS[i];
    const m = ctx.mat(r.key, { ...FACE, ramp: r.ramp, tones: undefined, convex: 0.35 });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.5 * T, 8).translate(x, YTop + 0.75 * T, z), m));
  };
  reel(2, -7 * T, -2 * T);
  reel(3, -3 * T, -2 * T);
  reel(4, 1 * T, -2 * T);
  reel(0, -9 * T, 1.5 * T);
  reel(1, -5 * T, 1.5 * T);
  reel(5, -1 * T, 1.5 * T);

  // 东头的小钉板（青绿，6 × 4 纹素，贴着台面后沿立着）+ 三张标签
  const board = ctx.mat('clothTeal', { ...FACE, ramp: [0x40c4b0, 0x2a9a94, 0x245a78], tones: undefined, convex: 0.3 });
  const BX = 6.5 * T;
  g.add(new THREE.Mesh(box(6 * T, 4 * T, T, BX, YTop, -3 * T), board));
  const tagZ = -2.5 * T + 0.004;
  const tag = (key: 'clothWhite' | 'flowerPurple' | 'flowerYellow', ramp: Ramp, x: number, y: number) =>
    g.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(T, 2 * T).translate(x, y, tagZ),
        ctx.mat(key, { ...FACE, ramp, tones: undefined, edge: 0.1, convex: 0 }),
      ),
    );
  tag('clothWhite', [0xfff4dc, 0xe8d0bc, 0x8a7aa0], BX - 2 * T, YTop + 2.5 * T);
  tag('flowerPurple', [0xff9ad0, 0xe070b4, 0x7a3a86], BX, YTop + 2 * T);
  tag('flowerYellow', [0xffe46a, 0xf0b448, 0x8a5a66], BX + 2 * T, YTop + 2.5 * T);

  // 等着取的拍子：平放在钉板前（拍头 4 × 3 纹素，朝西；握把朝东），框黄、线白
  const rk = ctx.mat('flowerYellow', { ...FACE, ramp: [0xffd040, 0xe89c34, 0x8a5466], tones: undefined, convex: 0.4 });
  const KX = 5 * T;
  const KZ = 1.5 * T;
  const head = new THREE.CylinderGeometry(1, 1, T * 0.5, 8).scale(2 * T, 1, 1.5 * T).translate(KX, YTop + T * 0.25, KZ);
  add([head, box(3 * T, T * 0.5, T, KX + 3.5 * T, YTop, KZ)], rk);
  const bed = ctx.mat('netTape', {
    ramp: [0xf4ecd8, 0xd0c0c8, 0x7a6e9c],
    tones: undefined,
    edge: 0.1,
    convex: 0,
    noShadowReceive: true,
  });
  g.add(
    new THREE.Mesh(
      new THREE.CircleGeometry(1, 8)
        .rotateX(-Math.PI / 2)
        .scale(T, 1, 0.5 * T)
        .translate(KX, YTop + T * 0.5 + 0.004, KZ),
      bed,
    ),
  );

  ctx.mats.prepare(g);
  return g;
}
