// 代客泊车的机器人司机（调星级线、无头截图用；?bot=1 或 __valet.bot(true)）：照着导航线开，给的是和手指一样的摇杆
// （屏幕方向：往哪拖就往哪开，拖向车尾 = 倒车），所以开得多快、蹭不蹭都和真人一个手感。纯函数，不碰 three / DOM。
//   · 跟线：找车身离导航线最近的点，往前看 2～3 米取一个目标点，摇杆指向它（倒车段指向车后的点）；
//   · 换向（前进 ↔ 倒车的那个点）：开到跟前、停住，才进下一段；
//   · 卡住了（想走走不动 1.5 秒）：反着拧一下摇杆挪开，再接着跟。
import { AXLE, type CarState, noseOf, type RoutePt, wrapPi } from './rules';

export interface Follow {
  /** 走到导航线的第几个点了 */
  i: number;
  /** 想走却没动多久了 */
  stuck: number;
  /** 正在挪开（剩几秒） */
  wiggle: number;
  /** 到终点了 */
  done: boolean;
}

export const newFollow = (): Follow => ({ i: 0, stuck: 0, wiggle: 0, done: false });

/** 当前这段（同一个方向）的最后一个点 */
function cuspOf(r: readonly RoutePt[], i: number): number {
  const dir = r[Math.min(i + 1, r.length - 1)].rev;
  let k = i + 1;
  while (k < r.length - 1 && r[k + 1].rev === dir) k++;
  return Math.min(k, r.length - 1);
}

/** 这一步的摇杆 */
export function followStick(r: readonly RoutePt[], f: Follow, s: CarState, dt: number): { x: number; y: number } {
  if (r.length < 2 || f.done) return { x: 0, y: 0 };
  let c = cuspOf(r, f.i);
  // 最近的点（只在这一段里找）
  let best = f.i;
  let bd = Infinity;
  for (let k = f.i; k <= c; k++) {
    const d = Math.hypot(r[k].x - s.x, r[k].z - s.z);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  f.i = best;
  const rev = r[Math.min(f.i + 1, r.length - 1)].rev;
  const toC = Math.hypot(r[c].x - s.x, r[c].z - s.z);
  // 到了换向点：停住再进下一段
  if (c < r.length - 1 && toC < 0.7) {
    if (Math.abs(s.v) > 0.25) return { x: 0, y: 0 };
    f.i = c;
    c = cuspOf(r, f.i);
    return followStick(r, f, s, 0);
  }
  if (c === r.length - 1 && toC < 0.3) {
    f.done = true;
    return { x: 0, y: 0 };
  }
  // 往前看（倒车从后轴看：倒着开是后轴带路）
  const [nx, nz] = noseOf(s.rot);
  const L = rev ? 3.0 : 2.8;
  let k = f.i;
  let acc = 0;
  while (k < c && acc < L) {
    acc += Math.hypot(r[k + 1].x - r[k].x, r[k + 1].z - r[k].z);
    k++;
  }
  // 这一段剩下的不够看：顺着最后一截的方向往外延长（快到头时方向还是稳的）
  let tx = r[k].x;
  let tz = r[k].z;
  if (acc < L && k > 0) {
    const ex = r[k].x - r[k - 1].x;
    const ez = r[k].z - r[k - 1].z;
    const el = Math.hypot(ex, ez) || 1;
    tx += (ex / el) * (L - acc);
    tz += (ez / el) * (L - acc);
  }
  const ox = rev ? s.x - nx * AXLE : s.x;
  const oz = rev ? s.z - nz * AXLE : s.z;
  let dx = tx - ox;
  let dz = tz - oz;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l;
  dz /= l;
  // 前进段别让摇杆指到车后（会挂倒挡），倒车段别指到车前
  const nose = Math.atan2(nx, nz);
  let a = wrapPi(Math.atan2(dx, dz) - nose);
  if (!rev && Math.abs(a) > 1.6) a = Math.sign(a) * 1.6;
  if (rev && Math.abs(a) < 2.2) a = (Math.sign(a) || 1) * 2.2;
  const dir = nose + a;
  let mag = Math.min(1, Math.max(0.3, toC / 4.5));
  if (c === r.length - 1) mag = Math.min(mag, Math.max(0.22, toC / 3));
  // 卡住了：反着挪一下
  if (f.wiggle > 0) {
    f.wiggle -= dt;
    return { x: -Math.sin(dir) * 0.6, y: -Math.cos(dir) * 0.6 };
  }
  if (Math.abs(s.v) < 0.08) f.stuck += dt;
  else f.stuck = 0;
  if (f.stuck > 1.5) {
    f.stuck = 0;
    f.wiggle = 0.9;
  }
  return { x: Math.sin(dir) * mag, y: Math.cos(dir) * mag };
}
