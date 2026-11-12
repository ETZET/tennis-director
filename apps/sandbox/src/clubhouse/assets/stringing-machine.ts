// 穿线机（1F 穿线 · 试拍吧，穿线师背后）：俱乐部蓝的落地立柱 + 深靛圆转台，转台上横着夹一把平放的拍子
// （拍框椭圆 7 × 6 纹素、珊瑚红框 + 青柠色线床、黑握把朝东），背后东北角立一个蓝色拉线头（朝镜头一面一块青色小屏），
// 顶上一盏暖黄的灯。
// 0.9 × 1.26 × 0.9 米（10 × 14 × 10 设计纹素；规格 0.9 × 1.15 × 0.9，高多出一盏灯）。
// 元素：没有（10 × 15 纹素的小件，平涂三档 + 描边）。三角形 ≈ 190。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const T = 0.09;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
/** 朝镜头的竖直面：光往上偏 + 低档位（太阳在后方，正面不全黑） */
const FACE = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  const add = (geos: THREE.BufferGeometry[], m: THREE.Material) => g.add(new THREE.Mesh(mergeGeometries(geos), m));

  // 机身（底座、立柱、横梁、拉线头）：俱乐部蓝的漆
  const body = ctx.mat('counter', { ...FACE, tones: undefined, convex: 0.35 });
  const YT = 9 * T; // 转台底
  const YR = YT + T; // 横梁底
  add(
    [
      box(5 * T, T, 5 * T, 0, 0, 0),
      box(3 * T, 8 * T, 3 * T, 0, T, 0),
      box(10 * T, T, 2 * T, 0, YR, 0),
      // 拉线头：3 × 4 × 3 纹素，立在转台东北沿
      box(3 * T, 4 * T, 3 * T, 3 * T, YT, -3.5 * T),
    ],
    body,
  );

  // 转台：深靛的圆盘（托住拍子的一圈暗色）
  const table = ctx.mat('ironwork', {
    ramp: [0x7c74c0, 0x544c98, 0x342e6c],
    tones: undefined,
    lightUp: 0.3,
    convex: 0.3,
    noShadowReceive: true,
  });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(3.5 * T, 3.5 * T, T, 12).translate(0, YT + T / 2, 0), table));

  // 拉线头正面的小屏（青）
  const screen = ctx.mat('jug', {
    ...FACE,
    ramp: [0x60f0e0, 0x30c8d8, 0x2a5a9c],
    tones: undefined,
    edge: 0.1,
    convex: 0,
  });
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(2 * T, T).translate(3 * T, YT + 2.5 * T, -2 * T + 0.004), screen));
  // 灯：拉线头顶上一块暖黄（自发光一点）
  const lamp = ctx.mat('flowerYellow', {
    ...FACE,
    ramp: [0xffe050, 0xffb830, 0xb07040],
    tones: undefined,
    emissive: 0x281800,
    convex: 0.2,
  });
  g.add(new THREE.Mesh(box(3 * T, T, 2 * T, 3 * T, YT + 4 * T, -3.5 * T), lamp));

  // 拍子：平放，拍头在西（椭圆 7 × 6 纹素，中心 x −1.5 纹素），握把朝东
  const YK = YR + T; // 拍框底
  const HX = -1.5 * T;
  const RX = 3.5 * T;
  const RZ = 3 * T;
  const frame = ctx.mat('fabricStripe', {
    ...FACE,
    ramp: [0xff6a4a, 0xe8484e, 0x7a2862],
    tones: undefined,
    convex: 0.4,
  });
  const ring = new THREE.CylinderGeometry(1, 1, T, 14, 1, true).scale(RX, 1, RZ).translate(HX, YK + T / 2, 0);
  const top = new THREE.CircleGeometry(1, 14)
    .rotateX(-Math.PI / 2)
    .scale(RX, 1, RZ)
    .translate(HX, YK + T, 0);
  // 拍喉：一纹素的框色
  add([ring, top, box(T, T, 2 * T, HX + RX + T / 2, YK, 0)], frame);
  // 线床：青柠色（框里缩一纹素）
  const strings = ctx.mat('ball', {
    ramp: [0xbcd84c, 0x98b848, 0x5a7a5a],
    tones: undefined,
    edge: 0.1,
    convex: 0,
    noShadowReceive: true,
  });
  g.add(
    new THREE.Mesh(
      new THREE.CircleGeometry(1, 14)
        .rotateX(-Math.PI / 2)
        .scale(RX - T, 1, RZ - T)
        .translate(HX, YK + T + 0.004, 0),
      strings,
    ),
  );
  // 握把：黑（3 纹素长、2 纹素宽，伸到东沿）
  const grip = ctx.mat('ironwork', {
    ramp: [0x8078b0, 0x5c5490, 0x443c74],
    tones: undefined,
    convex: 0.3,
    noShadowReceive: true,
  });
  const gx0 = HX + RX + T;
  g.add(new THREE.Mesh(box(5 * T - gx0, T, 2 * T, (gx0 + 5 * T) / 2, YK, 0), grip));

  ctx.mats.prepare(g);
  return g;
}
