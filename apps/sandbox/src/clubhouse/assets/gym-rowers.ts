// 划船机 ×2（B1 有氧区东头）：两台并排沿 x，导轨沿 z；划的人面朝镜头（+z）—— 飞轮罩在 +z 一头，座在导轨上滑。
// 1.44 × 0.71 × 2.2 米（16 × 8 × 24 纹素；规格 1.5 × 2.2）。接口：座面 y 0.32（静止在 z −0.3），脚蹬在座前 1.0 米（z 0.7）。
// 两台的中心 x −0.4 / +0.4。每台：一根 2 纹素宽的亮铝导轨、后脚、前脚、座、一对脚蹬（比飞轮罩宽，从罩子两边露出来）、
// 飞轮罩（轴沿 x 的 10 棱柱，直径 6 纹素、宽 5 纹素，两种车身色轮流 = 风扇叶的分段）、挂在罩子后面的拉把（2 纹素）和罩顶一块小表。
// 所有杆 ≥ 2 纹素。三角形 208。
// userData：seats = 两个座的网格（单独的 Mesh，position.z 沿导轨滑，0 = 静止位）；seatRange = [前, 后] 能滑的 z 偏移（米）；
// seatY = 0.32；footZ = 0.7。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { FACE, Parts, slab, wheel } from './gym-treadmill';

type C3 = [number, number, number];
/** 罩子：俱乐部青（比地上的绿胶垫更蓝、更亮，分得开） */
const TEAL: C3 = [0x2ad8d8, 0x18a4bc, 0x1a5a90];
const TEAL2: C3 = [0x20b4c4, 0x1688aa, 0x184a80];
/** 导轨：亮铝 */
const ALU: C3 = [0x58a8f0, 0x4a88e0, 0x3a52b0];
const DARK: C3 = [0x8080e4, 0x6a6ad0, 0x40409a];

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel; // 0.09
  const root = new THREE.Group();
  root.name = 'gym-rowers';
  const P = new Parts(ctx);
  const LIFT = { lightUp: 0.4, bands: [-0.35, 0.45] as [number, number] };
  const DRUM = {
    lightUp: 0.45,
    bands: [-0.3, 0.45] as [number, number],
    noShadowReceive: true,
    edge: 0.4,
    convex: 0.6,
  };
  P.def('alu', 'counter', { ramp: ALU, edge: 0.4, convex: 0.6 });
  P.def('steel', 'ironwork', { ramp: DARK, ...LIFT, edge: 0.5, convex: 0.4 });
  P.def('drumA', 'clothTeal', { ramp: TEAL, ...DRUM });
  P.def('drumB', 'clothTeal', { ramp: TEAL2, ...DRUM });
  P.def('foot', 'ironwork', { ramp: [0x8a62d0, 0x6c4cb8, 0x40347e], ...FACE });
  P.def('screen', 'jug', {
    ramp: [0x40d8f4, 0x20b4e4, 0x1a70c0],
    emissive: 0x061418,
    noShadowReceive: true,
    edge: 0.3,
    convex: 0.2,
  });

  const SEAT_Y = 0.32;
  const SEAT_Z = -0.3;
  const FOOT_Z = SEAT_Z + 1.0;
  const RAIL_Y = SEAT_Y - T; // 导轨顶 0.23，座 1 纹素厚
  const seatMat = ctx.mat('ironwork', {
    ramp: [0xc87ee4, 0xa868d4, 0x643a90],
    ...FACE,
    lightUp: 0.5,
    edge: 0.5,
    convex: 0.5,
  });
  const seats: THREE.Mesh[] = [];

  for (const cx of [-0.4, 0.4]) {
    // 导轨（2 纹素宽，沿 z）+ 后脚 + 前脚
    P.add('alu', slab(cx - T, cx + T, RAIL_Y - 0.1, RAIL_Y, -1.08, FOOT_Z));
    P.add('steel', slab(cx - 0.24, cx + 0.24, 0, RAIL_Y - 0.1, -1.1, -1.1 + 2 * T));
    P.add('steel', slab(cx - 0.26, cx + 0.26, 0, 0.14, 0.86, 1.1));
    // 脚蹬：一对板（比罩子宽，两边露出来），中间被导轨隔开
    P.add('foot', slab(cx - 0.32, cx + 0.32, 0.1, 0.36, FOOT_Z - 0.06, FOOT_Z + 0.06));
    // 飞轮罩：轴沿 x，直径 6 纹素，宽 5 纹素；10 段两种青轮流
    const [a, b] = wheel(cx, 0.4, 0.83, 3 * T, 5 * T, 10, 2, Math.PI / 10);
    P.add('drumA', a);
    P.add('drumB', b);
    // 拉把：挂在罩子后面、脚蹬上方（2 纹素粗）
    P.add('steel', slab(cx - 0.26, cx + 0.26, 0.4, 0.4 + 2 * T, FOOT_Z - 0.16, FOOT_Z - 0.16 + 2 * T));
    // 小表：罩子顶上一块屏（3 × 2 纹素）
    P.add('screen', slab(cx - 1.5 * T, cx + 1.5 * T, 0.66, 0.71, 0.74, 0.74 + 2 * T));
    // 座：单独一个网格（能滑）
    const seat = new THREE.Mesh(
      slab(cx - 1.5 * T, cx + 1.5 * T, RAIL_Y, SEAT_Y, SEAT_Z - 0.15, SEAT_Z + 0.15),
      seatMat,
    );
    seat.name = 'rower-seat';
    root.add(seat);
    seats.push(seat);
  }

  P.build(root);
  root.userData.seats = seats;
  root.userData.seatRange = [0.2, -0.5];
  root.userData.seatY = SEAT_Y;
  root.userData.footZ = FOOT_Z;
  ctx.mats.prepare(root);
  return root;
}
