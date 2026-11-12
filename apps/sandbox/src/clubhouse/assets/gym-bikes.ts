// 动感单车 ×3（B1 有氧区西头）：三台并排沿 x，骑的人面朝镜头（+z）—— 把手和飞轮在前（+z），座在后。
// 2.58 × 1.01 × 1.18 米（29 × 11 × 13 纹素；规格 2.6 × 1.2）。接口：座面 y 0.85、把手 1.0；三台的中心 x −0.95 / 0 / +0.95，座在 z −0.27。
// 每台：前后两根落地横脚（2 纹素）、3 纹素宽的车身、座杆 + 座、把立 + 车架色的把手（两头深色握把）、脚踏，前头一个 6 纹素直径、3 纹素厚的飞轮（8 段，
// 亮钢 / 深钢 / 车架色三种轮流 = 辐条的三档颜色；从镜头看是一圈一圈的横段）。车架饱和色：俱乐部红 / 青 / 红。
// 所有杆 ≥ 2 纹素。三角形 408（每台 136）。userData：seats = 三个座的本地 [x, y, z]（姿势代理摆人用）。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { FACE, Parts, slab, wheel } from './gym-treadmill';

type C3 = [number, number, number];
const RED: C3 = [0xff5048, 0xf03e50, 0x8a2466];
const TEAL: C3 = [0x22d4c4, 0x16a2ac, 0x1a5a86];
/** 深钢（脚、把手、踏板）：比跑步机的钢暗一档，车架色才跳得出来 */
const DARK: C3 = [0x7878dc, 0x5c5cc4, 0x38388a];

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel; // 0.09
  const root = new THREE.Group();
  root.name = 'gym-bikes';
  const P = new Parts(ctx);
  /** 小件（脚、把手、座）的朝镜头面也留在中档：暗档的小块在 45° 下就是一个个黑点 */
  const LIFT = { lightUp: 0.4, bands: [-0.35, 0.45] as [number, number] };
  P.def('red', 'carRed', { ramp: RED, edge: 0.5, convex: 0.5 });
  P.def('redFace', 'carRed', { ramp: RED, ...FACE });
  P.def('teal', 'clothTeal', { ramp: TEAL, edge: 0.5, convex: 0.5 });
  P.def('tealFace', 'clothTeal', { ramp: TEAL, ...FACE });
  P.def('steel', 'ironwork', { ramp: DARK, ...LIFT, edge: 0.5, convex: 0.4 });
  // 飞轮：亮钢段（镀铬）、深钢段、车架色段；飞轮的面大多朝镜头 → lightUp 抬一档，不接投影
  const FLY = { lightUp: 0.45, bands: [-0.3, 0.45] as [number, number], noShadowReceive: true, edge: 0.4, convex: 0.7 };
  P.def('chrome', 'silverBlue', { ramp: [0x8cd8ff, 0x5aa0e8, 0x3450a8], ...FLY });
  P.def('flyDark', 'ironwork', { ramp: DARK, ...FLY });
  P.def('flyRed', 'carRed', { ramp: RED, ...FLY });
  P.def('flyTeal', 'clothTeal', { ramp: TEAL, ...FLY });
  // 座：梅紫的皮（不压到最暗：座是剪影的最上一块，太暗就是一个黑点）
  P.def('saddle', 'ironwork', { ramp: [0xc87ee4, 0xa060cc, 0x643a90], ...LIFT, edge: 0.5, convex: 0.5 });

  const SEAT_Y = 0.85;
  const BAR_Y = 1.0;
  const seats: [number, number, number][] = [];
  const xs = [-0.95, 0, 0.95];
  xs.forEach((cx, i) => {
    const fr = i === 1 ? 'teal' : 'red';
    const frF = i === 1 ? 'tealFace' : 'redFace';
    // 前后落地横脚：0.6 宽、2 纹素深
    P.add('steel', slab(cx - 0.3, cx + 0.3, 0, 0.12, -0.6, -0.6 + 2 * T));
    P.add('steel', slab(cx - 0.3, cx + 0.3, 0, 0.12, 0.4, 0.4 + 2 * T));
    // 车身（3 纹素宽的一大块，代替细主梁：从上往下看是车架色的一条）
    P.add(fr, slab(cx - 1.5 * T, cx + 1.5 * T, 0.18, 0.48, -0.36, 0.14));
    // 座杆 + 座（座面 0.85）
    P.add(frF, slab(cx - T, cx + T, 0.3, SEAT_Y - 0.09, -0.36, -0.36 + 2 * T));
    P.add('saddle', slab(cx - 1.5 * T, cx + 1.5 * T, SEAT_Y - 0.09, SEAT_Y, -0.42, -0.12));
    seats.push([cx, SEAT_Y, -0.27]);
    // 把立 + 把手（把手顶 1.0，往前探一点）
    P.add(frF, slab(cx - T, cx + T, 0.3, BAR_Y - 0.09, 0.12, 0.12 + 2 * T));
    P.add(fr, slab(cx - 0.25 + T, cx + 0.25 - T, BAR_Y - 0.09, BAR_Y, 0.06, 0.06 + 3 * T));
    for (const sx of [-1, 1])
      P.add('steel', slab(cx + sx * 0.25 - T, cx + sx * 0.25 + T, BAR_Y - 0.1, BAR_Y + 0.01, 0.06, 0.06 + 3 * T));
    // 脚踏（曲柄两头的踏板：一根 0.4 宽的横块）
    P.add('steel', slab(cx - 0.2, cx + 0.2, 0.3, 0.39, -0.1, -0.1 + 2 * T));
    // 飞轮：前头，直径 6 纹素、厚 3 纹素，8 段三种颜色轮流
    const [a, b, c] = wheel(cx, 0.36, 0.33, 3 * T, 3 * T, 8, 3, Math.PI / 8);
    P.add('chrome', a);
    P.add('flyDark', b);
    P.add(i === 1 ? 'flyTeal' : 'flyRed', c);
  });

  P.build(root);
  root.userData.seats = seats;
  ctx.mats.prepare(root);
  return root;
}
