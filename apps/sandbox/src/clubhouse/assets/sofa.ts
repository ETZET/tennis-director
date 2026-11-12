// 沙发（会员休息室，壁炉前两张对着放）：青绿皮的切斯特菲尔德。2.4 × 0.85 × 0.95 米（27 × 9 × 11 设计纹素）。
// 座面 0.45（两块坐垫，中间 1 纹素缝）；靠背 0.85、扶手 0.72（扶手顶一条往外翻 1 纹素的卷边）；底下一圈往里收 1 纹素的深色木脚线。
// 拉扣：靠背正面、两个扶手外侧面 1 纹素的深青点，交错两行（菱形格，横 4 纹素、竖 2 屏幕行）。场景里两张都侧对镜头 →
// 看到的是扶手外侧面（拉扣）、坐垫和靠背的顶。
// 朝上的面单独一个网格（接收投影：靠背的影子落在坐垫上），竖直面不接收投影（lightUp + 低 bands 落中档）。
// 三角形 146（皮 8 个盒子 96 + 木脚线 12 + 19 个拉扣 38）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => g.add(new THREE.Mesh(geo, m));

  const W = 2.4;
  const D = 0.95;
  const A = 3 * T; // 扶手宽
  const BK = 3 * T; // 靠背厚
  const SEAT = 0.45;
  const ARM = 0.72;
  const BACK = 0.85;
  const z0 = -D / 2;

  // 皮：偏蓝的青绿（暖色的太阳会把它往薄荷绿推；亮档 L ≈ 171、中档 123、暗档 74）。小件家具：不接收投影（靠背落在坐垫上的影子是一片毛边）
  const face = {
    tones: undefined,
    edge: 0.6,
    convex: 0.3,
    lightUp: 0.55,
    bands: [-0.45, 0.35] as [number, number],
    noShadowReceive: true,
  };
  const leatherM = ctx.mat('clothTeal', { ...face, ramp: [0x3cc8d0, 0x2690a8, 0x24507a] });
  // 座基正面：坐垫下面往里收 1 纹素的那一条（坐垫挑出来的影子）
  const underM = ctx.mat('clothTeal', { ...face, ramp: [0x2690a8, 0x1e6c8a, 0x1c3c62] });

  const leather: THREE.BufferGeometry[] = [];
  const AX = W / 2 - T; // 扶手外侧面（卷边再往外 1 纹素到 W/2）
  // 座基（两扶手之间，坐垫下）
  const iw = 2 * (AX - A);
  add(box(iw, 0.36 - T, D - BK - T, 0, T, z0 + BK + (D - BK - T) / 2), underM);
  // 两块坐垫（中间 1 纹素缝，比座基往前挑 1 纹素）
  const cw = (iw - T) / 2;
  for (const s of [-1, 1])
    leather.push(box(cw, SEAT - 0.36, D - BK, s * (T / 2 + cw / 2), 0.36, z0 + BK + (D - BK) / 2));
  // 靠背（两扶手之间）
  leather.push(box(iw, BACK - T, BK, 0, T, z0 + BK / 2));
  // 扶手 + 卷边（往外翻 1 纹素，2 纹素高）
  for (const s of [-1, 1]) {
    leather.push(box(A, ARM - 3 * T, D, s * (AX - A / 2), T, 0));
    leather.push(box(A + T, 2 * T, D, s * (AX - A / 2 + T / 2), ARM - 2 * T, 0));
  }
  add(mergeGeometries(leather), leatherM);

  // 木脚线：比扶手外侧面往里收 1 纹素
  add(
    box(2 * AX - 2 * T, T, D - 2 * T, 0, 0, 0),
    ctx.mat('timber', {
      ramp: [0x9a5a44, 0x74404c, 0x402a52],
      tones: undefined,
      edge: 0.4,
      convex: 0.2,
      lightUp: 0.55,
      bands: [-0.45, 0.35],
      noShadowReceive: true,
    }),
  );

  // 拉扣：1 纹素 × 1 屏幕行的点，贴在面上 2 毫米
  const row = T / Math.SQRT1_2; // 竖直面上一屏幕行 = 0.127 米
  const dots: THREE.BufferGeometry[] = [];
  const dotZ = (x: number, y: number, z: number) => new THREE.PlaneGeometry(T, row).translate(x, y, z);
  const dotX = (s: number, y: number, z: number) =>
    new THREE.PlaneGeometry(T, row).rotateY((s * Math.PI) / 2).translate(s * (AX + 0.002), y, z);
  // 靠背正面（坐垫顶 0.45 到 0.85 露出 3 屏幕行）：上下两行，交错 = 菱形格
  const zf = z0 + BK + 0.002;
  const yA = SEAT + row * 0.5 + 0.02;
  const yB = yA + 2 * row;
  for (const x of [-1.5, -0.5, 0.5, 1.5]) dots.push(dotZ(x * 4 * T, yA, zf));
  for (const x of [-2, -1, 0, 1, 2]) dots.push(dotZ(x * 4 * T, yB, zf));
  // 扶手外侧面（卷边下面那段 T…ARM−2T，露出 3.5 屏幕行）：两行交错
  const ay0 = T + row * 0.5 + 0.02;
  const ay1 = ay0 + 2 * row;
  for (const s of [-1, 1]) {
    for (const z of [-1, 0, 1]) dots.push(dotX(s, ay1, z * 4 * T));
    for (const z of [-0.5, 0.5]) dots.push(dotX(s, ay0, z * 4 * T));
  }
  add(
    mergeGeometries(dots),
    ctx.mat('clothTeal', {
      ramp: [0x1e7a80, 0x1a6470, 0x183c5c],
      tones: undefined,
      edge: 0,
      convex: 0,
      lightUp: 0.55,
      bands: [-0.45, 0.35],
      noShadowReceive: true,
    }),
  );

  ctx.mats.prepare(g);
  return g;
}
