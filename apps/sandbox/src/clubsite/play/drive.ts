// 开车的手感（球车、汽车：src/valley）。纯函数，不碰 three / DOM，control.ts 每个模拟步调一次。
//
// 手机上的"指哪开哪"（绝对方向）：输入（手指按住的地方 / 键盘）是想去的方向，车自己打方向盘拐过去 ——
// 同《Sneaky Sasquatch》：没有摇杆，手指按住画面，车往手指那边开；不用想"左转还是右转"，只想"往哪去"。
// 原来开车就是走路换了速度：没有惯性（一推就满速、一松就停死）、往输入方向平移（车身慢慢转，车却横着走）、
// 原地掉头、汽车碰到路边就停死。这里换成一辆有分量的车：
// - 油门：输入大小（手指离车多远，control.ts 换算）到 75% 就是满油门；加速越接近极速越慢；松手滑行，往反方向按 = 刹车。
// - 方向：车头往输入方向拐，拐弯快慢按速度（最小转弯半径：停着拐不动，越快拐得越急，封顶 turn）；
//   急弯自动松油门（不用自己控速也拐得过去）；方向盘有一点点滞后（车有分量）。
// - 倒车：停着（或慢于 3 米/秒）按在车尾后面 = 先刹住再倒车，车尾对着手指；按回车头那半边就挂前进档（有回差，不来回跳）。
// - 侧滑：速度是世界里的一个向量，车身转了，速度跟着慢慢转过来（抓地力 grip）—— 急弯有一点甩尾，沙地上更滑。
// - 地面：ground(x, z) 给 0..1（路 1，沙地小一些）：极速、抓地都按它打折，开下路会慢下来、会颠，不是撞墙。
// - 撞墙：按实际走出去的比例掉速，返回撞击的速度（场景拿去震手机、晃车）。

export interface DriveSpec {
  /** 好路上的极速（米/秒） */
  speed: number;
  /** 拐弯最快多少（弧度/秒） */
  turn: number;
  /** 加速（米/秒²，起步时；越接近极速越小）；默认 speed / 2.4 */
  accel?: number;
  /** 刹车（往反方向按）；默认 accel × 2.6 */
  brake?: number;
  /** 松手滑行的减速；默认 accel × 0.9 */
  coast?: number;
  /** 倒车极速；默认 speed × 0.3，最多 5 */
  reverse?: number;
  /** 最小转弯半径（米）：速度 / 半径 = 这个速度下最快的转向 */
  radius?: number;
  /** 抓地（1/秒）：横向速度每秒衰减多少；大 = 不滑 */
  grip?: number;
  /** 地面好坏 0..1（路 = 1）；不给 = 处处 1 */
  ground?(x: number, z: number): number;
  /** 车头 / 车尾离车中心多远（米）：碰撞时车头车尾也要能站（不然长车的头会扎进树丛里）；不给 = 只看车中心 */
  reach?: number;
  /** 车上的姿势（默认 'idle'，停在第 0 帧） */
  pose?: string;
}

export interface DriveState {
  /** 世界里的速度（米/秒） */
  vx: number;
  vz: number;
  /** 沿车头的速度（倒车为负） */
  v: number;
  /** 横向速度（车身右手为正）：侧滑 */
  side: number;
  /** 转向角速度（弧度/秒，yaw 增大为正 = 往车的左手拐） */
  yawRate: number;
  /** 这一步沿车头的加速度（米/秒²）：车身前后点头用 */
  accel: number;
  /** 倒车档 */
  rev: boolean;
  /** 脚下地面 0..1 */
  ground: number;
  /** 这一步撞上东西掉的速度（米/秒，没撞 = 0） */
  hit: number;
}

export const newDriveState = (): DriveState => ({
  vx: 0,
  vz: 0,
  v: 0,
  side: 0,
  yawRate: 0,
  accel: 0,
  rev: false,
  ground: 1,
  hit: 0,
});

const wrap = (a: number) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** 输入死区（比这小 = 松手） */
const DEAD = 0.12;
/** 推到这里就是满油门 */
const FULL = 0.75;
/** 停着往车尾方向拉多少度以内算倒车（离正后方）：35° */
const REV_IN = Math.PI - 0.62;
/** 比这慢（米/秒）往车尾后面按才倒车（先刹住再倒）；更快 = 拐弯掉头 */
const REV_V = 3;
/** 倒车时输入回到车头这边多少度以内挂前进档：80° */
const REV_OUT = 1.4;

/**
 * 一步：读输入（世界方向 want，|want| ≤ 1），改 st、返回新的朝向和这一步想走的位移。
 * 走不走得动由调用方试（碰撞），再调 driveHit 告诉实际走了多少。
 */
export function driveStep(
  st: DriveState,
  spec: DriveSpec,
  x: number,
  z: number,
  yaw: number,
  wantX: number,
  wantZ: number,
  dt: number,
): { yaw: number; dx: number; dz: number } {
  const accel = spec.accel ?? spec.speed / 2.4;
  const brake = spec.brake ?? accel * 2.6;
  const coast = spec.coast ?? accel * 0.9;
  const revTop = spec.reverse ?? Math.min(5, spec.speed * 0.3);
  const radius = spec.radius ?? 3;
  const g = clamp(spec.ground?.(x, z) ?? 1, 0.05, 1);
  st.ground = g;
  const top = spec.speed * g;
  const grip = (spec.grip ?? 10) * (0.45 + 0.55 * g);

  // 现在的速度分到车头 / 车身右手
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  // 车身右手（车头 +z 时右手是 −x）
  const rx = -fz;
  const rz = fx;
  let v = st.vx * fx + st.vz * fz;
  let side = st.vx * rx + st.vz * rz;

  const mag = Math.min(1, Math.hypot(wantX, wantZ));
  const on = mag > DEAD;
  const thr = on ? Math.min(1, (mag - DEAD) / (FULL - DEAD)) : 0;

  // ── 档位 ──
  let dd = 0;
  if (on) {
    const dir = Math.atan2(wantX, wantZ);
    const a = Math.abs(wrap(dir - yaw));
    if (!st.rev && a > REV_IN && v < REV_V) st.rev = true;
    else if (st.rev && a < REV_OUT) st.rev = false;
    // 倒车：车尾对着输入方向
    dd = wrap(st.rev ? dir + Math.PI - yaw : dir - yaw);
  } else if (Math.abs(v) < 0.4) st.rev = false;

  // ── 油门 / 刹车 ──
  let tv = 0;
  if (on) {
    if (st.rev) tv = -revTop * thr;
    else {
      // 急弯松油门：差 20° 以内全速，差 90° 以上只给 40%
      const k = clamp((Math.abs(dd) - 0.35) / (Math.PI / 2 - 0.35), 0, 1);
      tv = top * thr * (1 - 0.6 * k);
    }
  }
  const dv = tv - v;
  let rate: number;
  if (!on) rate = coast;
  else if (v * tv < 0)
    rate = brake; // 反推 = 刹车
  else if (Math.abs(tv) < Math.abs(v))
    rate = Math.abs(v) > top + 0.5 ? coast * 1.6 : coast * 1.3; // 急弯 / 开上沙地：松油门拖下来
  else rate = accel * (1 - 0.55 * Math.min(1, Math.abs(v) / Math.max(spec.speed, 0.1))) * (0.6 + 0.4 * g);
  const dvs = clamp(dv, -rate * dt, rate * dt);
  v += dvs;
  if (!on && Math.abs(v) < 0.25) v = 0;
  st.accel = dvs / Math.max(dt, 1e-4);

  // ── 方向盘 ──
  // 这个速度下最快的转向：速度 / 最小转弯半径，封顶 turn；很慢的时候也留一点（不然停着推侧面会一直直走）
  const maxRate = Math.min(spec.turn, Math.max(Math.abs(v), 0.6) / radius);
  const want = on ? clamp(dd * 4.5, -maxRate, maxRate) : 0;
  st.yawRate += (want - st.yawRate) * (1 - Math.exp(-dt * 10));
  const ny = yaw + st.yawRate * dt;

  // ── 侧滑：车身转了，速度还朝原来的方向，横向那份按抓地衰减 ──
  // 车身转过 Δ：原来沿车头的 v 在新车身里有 −v·sinΔ 的横向
  const d = st.yawRate * dt;
  const v2 = v * Math.cos(d) + side * Math.sin(d);
  side = side * Math.cos(d) - v * Math.sin(d);
  v = v2;
  side *= Math.exp(-grip * dt);

  const nfx = Math.sin(ny);
  const nfz = Math.cos(ny);
  st.vx = v * nfx - side * nfz;
  st.vz = v * nfz + side * nfx;
  st.v = v;
  st.side = side;
  st.hit = 0;
  return { yaw: ny, dx: st.vx * dt, dz: st.vz * dt };
}

/** 碰撞以后：想走 want 米，实际走了 moved 米 → 按比例掉速，记下撞掉的速度 */
export function driveHit(st: DriveState, want: number, moved: number) {
  if (want < 1e-6 || moved >= want * 0.98) return;
  const k = clamp(moved / want, 0, 1);
  const before = Math.hypot(st.vx, st.vz);
  st.vx *= k;
  st.vz *= k;
  st.v *= k;
  st.side *= k;
  st.hit = before * (1 - k);
  // 顶着墙：别留着残速一直蹭
  if (k < 0.05) {
    st.vx = st.vz = st.v = st.side = 0;
  }
}
