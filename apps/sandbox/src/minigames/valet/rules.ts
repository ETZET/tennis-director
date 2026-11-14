// 代客泊车的规则（纯函数，不碰 three / DOM；rules.test.ts 测）：车怎么开（摇杆 → 油门 + 方向盘 → 运动学自行车模型）、
// 车身碰撞（矩形 / 圆 / 多边形）、停得正不正、小费怎么算、来车和取车的节奏、派哪个车位、导航线（给玩家看、给机器人开）。
//
// 车的模型照 clubpark/life.ts 的（那边的函数没导出，这里按同样的常数重写一份）：
//   车中心在前后轴正中，前后轴离中心 AXLE 1.4 米（轴距 2.8）；后轮不侧滑，横摆角速度 = v·tan(前轮转角) / 轴距；
//   rotY 0 = 车头朝北（−z），车头方向 (−sin rot, −cos rot)；前轮转角正 = 往左（车的本地 −x）= rotY 增大。
//   车身矩形：轿车半长 2.17、半宽 0.95；SUV 半长 2.42、半宽 1.0（life.ts 的 HALF / HALF_W）。
import { AISLE_Z, ENTRY, ROWS, SPOTS, STALL, type V2 } from '../../clubpark/layout';

/** 一局几秒 */
export const DURATION = 120;
/** 星级线（机器人试出来的，见 main.ts 顶上） */
export const STARS: [number, number, number] = [100, 200, 300];

// ── 车 ─────────────────────────────────────────
export const AXLE = 1.4;
export const WHEELBASE = AXLE * 2;
export type CarKind = 'car' | 'suv';
export const DIMS: Record<CarKind, { hl: number; hw: number }> = {
  car: { hl: 2.17, hw: 0.95 },
  suv: { hl: 2.42, hw: 1.0 },
};

/** 操控手感（米、秒、弧度） */
export const CTRL = {
  /** 最快：前进 / 倒车 */
  vFwd: 6.2,
  vRev: 2.8,
  /** 加速、刹车（松开摇杆 = 刹车） */
  acc: 3.6,
  brake: 9,
  /** 前轮最大转角（0.8 → 后轴转弯半径 2.7 米：车道 8 米宽，掉头要借大门口那块地方，或者倒一把） */
  steerMax: 0.8,
  /** 方向盘每秒能打多少 */
  steerRate: 3.2,
  /** 车头和摇杆方向差多少就打多少方向（× 这个） */
  gain: 1.8,
  /** 摇杆和车头的夹角超过这个 → 挂倒挡；倒挡时小于 toFwd → 挂前进挡（中间保持，免得来回跳） */
  toRev: (115 * Math.PI) / 180,
  toFwd: (65 * Math.PI) / 180,
  /** 摇杆死区 */
  dead: 0.12,
} as const;

export interface CarState {
  x: number;
  z: number;
  rot: number;
  /** 纵向速度（米/秒，负 = 倒车） */
  v: number;
  /** 前轮转角 */
  steer: number;
  /** 挡位：1 前进、−1 倒车 */
  gear: 1 | -1;
}

/** 这一步想要的：目标速度、目标转角、挡位 */
export interface Intent {
  v: number;
  steer: number;
  gear: 1 | -1;
}

const P = Math.PI;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const wrapPi = (a: number) => a - Math.round(a / (P * 2)) * P * 2;
/** 车头方向（单位向量） */
export const noseOf = (rot: number): V2 => [-Math.sin(rot), -Math.cos(rot)];
/** 方向 → rotY */
export const rotOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/**
 * 摇杆 → 想要的速度和方向（"往哪拖车就往哪开"）：摇杆是屏幕方向（相机 yaw 0：右 = +x、下 = +z），
 * 和车头夹角小 → 前进、车头转向摇杆；夹角大（指着车尾那边）→ 倒车、车尾转向摇杆。拖得越远开得越快；转得越急开得越慢。
 */
export function intentFromStick(sx: number, sy: number, s: CarState): Intent {
  const mag = Math.min(1, Math.hypot(sx, sy));
  if (mag < CTRL.dead) return { v: 0, steer: s.steer, gear: s.gear };
  const want = rotOf(sx, sy);
  const err = wrapPi(want - s.rot);
  const a = Math.abs(err);
  let gear = s.gear;
  if (gear === 1 && a > CTRL.toRev) gear = -1;
  else if (gear === -1 && a < CTRL.toFwd) gear = 1;
  const k = ((mag - CTRL.dead) / (1 - CTRL.dead)) ** 1.4;
  if (gear === 1) {
    const steer = clamp(err * CTRL.gain, -CTRL.steerMax, CTRL.steerMax);
    return { gear, steer, v: CTRL.vFwd * k * (0.35 + 0.65 * Math.max(0, Math.cos(err))) };
  }
  // 倒车：车尾（rot + π）转向摇杆；倒着走时前轮打左 = 车尾往右甩，所以符号反过来
  const errT = wrapPi(want - (s.rot + P));
  const steer = clamp(-errT * CTRL.gain, -CTRL.steerMax, CTRL.steerMax);
  return { gear, steer, v: -CTRL.vRev * k * (0.5 + 0.5 * Math.max(0, Math.cos(errT))) };
}

/** 往前推一步（运动学自行车模型）：速度朝目标加减（反向 / 松手 = 刹车），方向盘按速率打，后轴沿车头方向走 */
export function stepCar(s: CarState, it: Intent, dt: number): CarState {
  let v = s.v;
  const tv = it.v;
  const braking = (tv === 0 && v !== 0) || Math.sign(tv) * Math.sign(v) < 0 || Math.abs(tv) < Math.abs(v) - 0.05;
  const rate = braking ? CTRL.brake : CTRL.acc;
  if (v < tv) v = Math.min(tv, v + rate * dt);
  else if (v > tv) v = Math.max(tv, v - rate * dt);
  const ds = clamp(it.steer - s.steer, -CTRL.steerRate * dt, CTRL.steerRate * dt);
  const steer = s.steer + ds;
  const w = (v * Math.tan(steer)) / WHEELBASE;
  const [nx, nz] = noseOf(s.rot);
  const rx = s.x - nx * AXLE;
  const rz = s.z - nz * AXLE;
  const rot = s.rot + w * dt;
  const [mx, mz] = noseOf(s.rot + (w * dt) / 2);
  const rx1 = rx + mx * v * dt;
  const rz1 = rz + mz * v * dt;
  const [ex, ez] = noseOf(rot);
  return { x: rx1 + ex * AXLE, z: rz1 + ez * AXLE, rot, v, steer, gear: it.gear };
}

// ── 碰撞：车 = 矩形，挡路的 = 矩形 / 圆 / 多边形 ─────────────────
export interface Box {
  x: number;
  z: number;
  /** 车头方向（单位向量） */
  nx: number;
  nz: number;
  hl: number;
  hw: number;
}
export interface RectS {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export function carBox(s: { x: number; z: number; rot: number }, kind: CarKind, pad = 0): Box {
  const [nx, nz] = noseOf(s.rot);
  const d = DIMS[kind];
  return { x: s.x, z: s.z, nx, nz, hl: d.hl + pad, hw: d.hw + pad };
}
/** 车身本地 (前 l, 右 r) → 世界：右 = 车头方向转 −90°（本地 +x） */
export function boxPoint(b: Box, l: number, r: number): V2 {
  return [b.x + b.nx * l - b.nz * r, b.z + b.nz * l + b.nx * r];
}
export function boxCorners(b: Box): V2[] {
  return [boxPoint(b, b.hl, -b.hw), boxPoint(b, b.hl, b.hw), boxPoint(b, -b.hl, b.hw), boxPoint(b, -b.hl, -b.hw)];
}
/** 车身外沿一圈的采样点（间隔不超过 step 米） */
export function boxRim(b: Box, step = 0.5): V2[] {
  const out: V2[] = [];
  const nl = Math.max(1, Math.ceil((b.hl * 2) / step));
  const nw = Math.max(1, Math.ceil((b.hw * 2) / step));
  for (let i = 0; i <= nl; i++) {
    const l = -b.hl + (b.hl * 2 * i) / nl;
    out.push(boxPoint(b, l, -b.hw), boxPoint(b, l, b.hw));
  }
  for (let i = 1; i < nw; i++) {
    const r = -b.hw + (b.hw * 2 * i) / nw;
    out.push(boxPoint(b, b.hl, r), boxPoint(b, -b.hl, r));
  }
  return out;
}
/** 点在车身里有多深（离最近的边；不在里面 = 0） */
export function pointDepth(b: Box, x: number, z: number): number {
  const dx = x - b.x;
  const dz = z - b.z;
  const l = Math.abs(dx * b.nx + dz * b.nz);
  const r = Math.abs(-dx * b.nz + dz * b.nx);
  return Math.max(0, Math.min(b.hl - l, b.hw - r));
}

/** 两个矩形压进去多深（分离轴；不相交 = 0） */
export function boxPen(a: Box, b: Box): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let pen = Infinity;
  for (const [ux, uz] of [
    [a.nx, a.nz],
    [a.nz, -a.nx],
    [b.nx, b.nz],
    [b.nz, -b.nx],
  ]) {
    const ra = a.hl * Math.abs(ux * a.nx + uz * a.nz) + a.hw * Math.abs(ux * a.nz - uz * a.nx);
    const rb = b.hl * Math.abs(ux * b.nx + uz * b.nz) + b.hw * Math.abs(ux * b.nz - uz * b.nx);
    const o = ra + rb - Math.abs(ux * dx + uz * dz);
    if (o <= 0) return 0;
    if (o < pen) pen = o;
  }
  return pen;
}
/** 圆压进矩形多深 */
export function boxCircPen(a: Box, cx: number, cz: number, r: number): number {
  const dx = cx - a.x;
  const dz = cz - a.z;
  const qx = Math.max(Math.abs(dx * a.nx + dz * a.nz) - a.hl, 0);
  const qz = Math.max(Math.abs(dx * a.nz - dz * a.nx) - a.hw, 0);
  return Math.max(0, r - Math.hypot(qx, qz));
}
/** 轴对齐的矩形当成车身那样的矩形 */
export function rectBox(r: RectS): Box {
  return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, nx: 0, nz: -1, hl: (r.z1 - r.z0) / 2, hw: (r.x1 - r.x0) / 2 };
}
/** 只读的 [x, z]（导航的形状给的是这种） */
export type RV2 = readonly [number, number];
export function inPoly(pts: readonly RV2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px: number, pz: number, a: RV2, b: RV2): number {
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const l2 = vx * vx + vz * vz || 1;
  const t = clamp(((px - a[0]) * vx + (pz - a[1]) * vz) / l2, 0, 1);
  return Math.hypot(px - a[0] - vx * t, pz - a[1] - vz * t);
}
/** 多边形（花坛、种植带的圆角轮廓）和车身压得多深：车身外沿进了多边形的点离多边形边多远，多边形的顶点进了车身多深，取大的 */
export function boxPolyPen(b: Box, pts: readonly RV2[]): number {
  let pen = 0;
  for (const [x, z] of boxRim(b, 0.35)) {
    if (!inPoly(pts, x, z)) continue;
    let d = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) d = Math.min(d, segDist(x, z, pts[j], pts[i]));
    pen = Math.max(pen, d);
  }
  for (const [x, z] of pts) pen = Math.max(pen, pointDepth(b, x, z));
  return pen;
}

/** 挡车的东西：tag 决定撞了以后说什么（车 / 花坛路缘 / 柱子 / 人） */
export type Tag = 'car' | 'curb' | 'pole' | 'person';
export type Solid =
  | { kind: 'box'; b: Box; tag: Tag; id?: string }
  | { kind: 'circle'; x: number; z: number; r: number; tag: Tag; id?: string }
  | { kind: 'poly'; pts: readonly RV2[]; tag: Tag; cx: number; cz: number; rad: number; id?: string };

export function solidPen(b: Box, s: Solid): number {
  if (s.kind === 'box') return boxPen(b, s.b);
  if (s.kind === 'circle') return boxCircPen(b, s.x, s.z, s.r);
  if (Math.hypot(s.cx - b.x, s.cz - b.z) > s.rad + b.hl + 0.5) return 0;
  return boxPolyPen(b, s.pts);
}
export function solidNear(b: Box, s: Solid, reach: number): boolean {
  const [x, z, r] =
    s.kind === 'box' ? [s.b.x, s.b.z, s.b.hl + s.b.hw] : s.kind === 'circle' ? [s.x, s.z, s.r] : [s.cx, s.cz, s.rad];
  return Math.abs(x - b.x) + Math.abs(z - b.z) < reach + r;
}

/**
 * 车从 cur 挪到 next 会不会撞上：哪个东西压得比现在更深（> 现在 + 0.01 且 > 0.02）就算撞上（返回它）。
 * 现在就压着的（刚出生在别的车边上）只要不是越压越深就让走。outside(next) = 车身出了能开的地方（地图边、台地崖壁）。
 */
export function firstHit(cur: Box, next: Box, solids: readonly Solid[]): Solid | null {
  for (const s of solids) {
    if (!solidNear(next, s, next.hl + 1)) continue;
    const p1 = solidPen(next, s);
    if (p1 <= 0.02) continue;
    if (p1 > solidPen(cur, s) + 0.01) return s;
  }
  return null;
}

// ── 车位 ─────────────────────────────────────────
export interface Bay {
  /** 'n-far-2' 这样（和 clubpark 的 SLOTS park-<row>-<i> 一致） */
  id: string;
  row: number;
  i: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  cx: number;
  cz: number;
  /** 's' 南停车场 / 'n' 北停车场 */
  lot: 's' | 'n';
}
/** 全部车位（进出口空出来的不算） */
export function allBays(): Bay[] {
  const out: Bay[] = [];
  ROWS.forEach((row, r) => {
    for (let i = 0; i < STALL.n; i++) {
      if (row.gap && i >= row.gap[0] && i <= row.gap[1]) continue;
      const x0 = STALL.x0 + STALL.w * i;
      out.push({
        id: `${row.id}-${i}`,
        row: r,
        i,
        x0,
        x1: x0 + STALL.w,
        z0: row.z0,
        z1: row.z1,
        cx: x0 + STALL.w / 2,
        cz: (row.z0 + row.z1) / 2,
        lot: r < 2 ? 'n' : 's',
      });
    }
  });
  return out;
}

/** 停正了的标准：压线容差（车身四角可以出线这么多）、角度容差 */
export const PARK = { tol: 0.18, angleOk: 10, stopV: 0.15, holdSec: 0.5 } as const;

export interface ParkCheck {
  /** 四个角都在线里（含容差） */
  inside: boolean;
  /** 车身有多少在车位里（0..1，仪表用） */
  fill: number;
  /** 车身和车位方向差几度（车头朝里朝外都算） */
  angle: number;
  /** 偏离车位中线多少米 */
  off: number;
  /** 停好了（在线里 + 角度够正）；停没停住由调用方看速度 */
  ok: boolean;
  /** 停得多漂亮（0..1）：角度正、在正中 */
  q: number;
}
export function parkCheck(b: Box, rot: number, bay: Bay): ParkCheck {
  const t = PARK.tol;
  const inR = (x: number, z: number, e: number) =>
    x >= bay.x0 - e && x <= bay.x1 + e && z >= bay.z0 - e && z <= bay.z1 + e;
  const inside = boxCorners(b).every(([x, z]) => inR(x, z, t));
  let n = 0;
  let k = 0;
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 2; j++) {
      const [x, z] = boxPoint(b, -b.hl + (b.hl * 2 * i) / 6, -b.hw + (b.hw * 2 * j) / 2);
      n++;
      if (inR(x, z, t)) k++;
    }
  const a = Math.abs(wrapPi(rot));
  const angle = (Math.min(a, P - a) * 180) / P;
  const off = Math.abs(b.x - bay.cx);
  const ok = inside && angle <= PARK.angleOk;
  const q = ok ? clamp(1 - (0.6 * angle) / PARK.angleOk - (0.4 * off) / 0.45, 0, 1) : 0;
  return { inside, fill: k / n, angle, off, ok, q };
}

// ── 小费、罚款 ─────────────────────────────────────
/** 撞一下赔多少（按撞上时的速度；撞到人另加） */
export function bumpCost(speed: number, tag: Tag): number {
  const base = Math.min(40, Math.round(8 + 12 * Math.abs(speed)));
  return tag === 'person' ? base + 15 : base;
}
/** 慢慢蹭（低于这个速度）不算剐蹭：只是停住 */
export const BUMP_MIN_V = 0.45;
/** 会员在落客点等急了（耐心条见底）：扣这么多，这辆车的小费减半 */
export const ANGRY_COST = 15;
/** 取车的会员等急了：扣这么多，走了 */
export const FETCH_ANGRY_COST = 20;

/** 这段路开多快算快 / 算慢（秒）：dist = 导航线长度 */
export function par(dist: number): { fast: number; slow: number } {
  return { fast: 5 + dist / 5, slow: 14 + dist / 2 };
}

export interface ParkTally {
  /** 从接钥匙到停好几秒 */
  secs: number;
  /** 导航线长度（米） */
  dist: number;
  /** 停得多漂亮 0..1 */
  q: number;
  /** 这一趟剐蹭了几下 */
  bumps: number;
  /** 接钥匙时会员的耐心还剩多少 0..1 */
  patience: number;
  /** 等急了 */
  angry: boolean;
}
/** 停好一辆的小费：底 20（等急了 10）+ 快 0..25 + 停得正 0..15 + 没刮 10 + 会员高兴 0..10 */
export function parkTip(t: ParkTally): { total: number; parts: { label: string; value: number }[] } {
  const { fast, slow } = par(t.dist);
  const parts = [
    { label: '底', value: t.angry ? 10 : 20 },
    { label: '快', value: Math.round(25 * clamp((slow - t.secs) / (slow - fast), 0, 1)) },
    { label: '正', value: Math.round(15 * clamp(t.q, 0, 1)) },
    { label: '没刮', value: t.bumps === 0 ? 10 : 0 },
    { label: '高兴', value: t.angry ? 0 : Math.round(10 * clamp(t.patience, 0, 1)) },
  ];
  return { total: parts.reduce((a, p) => a + p.value, 0), parts };
}
/** 取车送到的小费：底 20 + 等得少 0..20 + 零剐蹭 10 */
export function fetchTip(patienceLeft: number, bumps: number): number {
  return 20 + Math.round(20 * clamp(patienceLeft, 0, 1)) + (bumps === 0 ? 10 : 0);
}

// ── 节奏：来车、耐心、取车 ─────────────────────────────
/** 第 k 辆（0 起）来了以后多久来第 k+1 辆：越来越密 */
export const arrivalGap = (k: number) => Math.max(13, 25 - 2 * k);
/** 第 k 辆的会员能等多久（秒）：越来越没耐心 */
export const patienceFor = (k: number) => Math.max(26, 44 - 3 * k);
/** 第 k 辆是 SUV 吗（前三辆都是轿车；以后三成 SUV：更长，车位更紧） */
export const kindFor = (k: number, r: number): CarKind => (k >= 3 && r < 0.35 ? 'suv' : 'car');
/** 排队：落客点 + 后面两个车位（都在进出口东边，不挡倒车掉头） */
export const QUEUE: V2[] = [SPOTS.dropoff, [85.2, SPOTS.dropoff[1]], [90.8, SPOTS.dropoff[1]]];
/** 取车：第一次最早几秒、之后隔多久、停了多久的车才会被取、会员等多久 */
export const FETCH = { first: 38, gap: 24, minAge: 14, patience: 45 } as const;
/** 取车的会员站在车道南沿（南花坛东段前），车开到这一圈里停下 */
export const PICKUP: V2 = [83.6, 2.0];
export const PICKUP_R = 2.1;
export const PICKUP_STAND: V2 = [83.6, 4.15];

/** 代客台（"台子"）：派车位的时候按走回这里多远排 */
export const STAND: V2 = SPOTS.podium;

/**
 * 派车位：没人停、没人预订的里面挑代价最小的。代价 = 离代客台多远（走回来的路）+ 两边有车的话加一点（前两辆尽量给宽敞的）。
 * k = 第几辆（0 起）：越往后越不管宽不宽敞，近的空位用完就只剩远的、夹在车中间的。
 */
export function chooseBay(bays: readonly Bay[], taken: (id: string) => boolean, k: number): Bay | null {
  const byKey = new Map(bays.map((b) => [`${b.row}:${b.i}`, b]));
  const tight = Math.max(0, 8 - 4 * k);
  let best: Bay | null = null;
  let bestC = Infinity;
  for (const b of bays) {
    if (taken(b.id)) continue;
    let nb = 0;
    for (const di of [-1, 1]) {
      const o = byKey.get(`${b.row}:${b.i + di}`);
      if (o && taken(o.id)) nb++;
    }
    const c = Math.abs(b.cx - STAND[0]) + Math.abs(b.cz - STAND[1]) + tight * nb;
    if (c < bestC) {
      bestC = c;
      best = b;
    }
  }
  return best;
}

// ── 导航线 ─────────────────────────────────────────
// 停车场南北对称：用"场内坐标"(u = x, w = 离车道中线多远，往停车场里为正) 算一遍，再按南 / 北换回世界坐标。
export interface RoutePt {
  x: number;
  z: number;
  /** 这一段是倒着开的 */
  rev: boolean;
}
/** 导航线转弯半径（车中心；最小能转 ≈ 3.1）；倒车的弯画大一点（倒着开不好跟） */
export const ROUTE_R = 3.35;
export const ROUTE_R_REV = 3.9;
/** 进出口中线 */
export const ENTRY_X = (ENTRY.x0 + ENTRY.x1) / 2;
/** 通道中线（场内 w） */
const AISLE_W = Math.abs(AISLE_Z.s);
/** 车道上东行那条线 */
const EAST_Z = 2.0;

type Pt2 = [number, number];
/** 直线段（不含起点），每 0.8 米一个点 */
function line(out: RoutePt[], to: Pt2, rev: boolean, map: (u: number, w: number) => Pt2) {
  const last = out[out.length - 1];
  const [x1, z1] = map(to[0], to[1]);
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - last.x, z1 - last.z) / 0.8));
  for (let i = 1; i <= n; i++)
    out.push({ x: last.x + ((x1 - last.x) * i) / n, z: last.z + ((z1 - last.z) * i) / n, rev });
}
/** 90° 的弯：从 p0 沿 m0 方向走、转到 m1 方向（场内坐标）；返回终点 */
function arc(
  out: RoutePt[],
  p0: Pt2,
  m0: Pt2,
  m1: Pt2,
  rev: boolean,
  map: (u: number, w: number) => Pt2,
  R = ROUTE_R,
): Pt2 {
  const c: Pt2 = [p0[0] + m1[0] * R, p0[1] + m1[1] * R];
  for (let i = 1; i <= 8; i++) {
    const f = (i / 8) * (P / 2);
    const u = c[0] - m1[0] * R * Math.cos(f) + m0[0] * R * Math.sin(f);
    const w = c[1] - m1[1] * R * Math.cos(f) + m0[1] * R * Math.sin(f);
    const [x, z] = map(u, w);
    out.push({ x, z, rev });
  }
  return [p0[0] + (m0[0] + m1[0]) * R, p0[1] + (m0[1] + m1[1]) * R];
}
const lotMap =
  (lot: 's' | 'n') =>
  (u: number, w: number): Pt2 => [u, lot === 's' ? w : -w];
const world = (u: number, w: number): Pt2 => [u, w];

/** 这个车位是车头冲着开进去（离进出口够远，两个弯摆得开），还是开过头倒进去 */
export const noseIn = (bay: Bay) => Math.abs(bay.cx - ENTRY_X) >= 2 * ROUTE_R;

/**
 * 落客点 → 车位：先沿西行车道往东倒、车尾甩进对面的进出口（三点掉头，落客区窄，掉不了 U 形头），
 * 再直着开过车道进停车场 → 进通道 → 车头冲进去（远的车位）或开过头倒进去（挨着进出口的车位）。
 */
export function routeToBay(bay: Bay, from: V2 = SPOTS.dropoff): RoutePt[] {
  const R = ROUTE_R;
  const out: RoutePt[] = [{ x: from[0], z: from[1], rev: true }];
  const dz = bay.lot === 's' ? -1 : 1; // 车尾甩向哪边（南停车场 → 车尾甩进北进出口）
  line(out, [ENTRY_X - R, from[1]], true, world);
  arc(out, [ENTRY_X - R, from[1]], [1, 0], [0, dz], true, world);
  // 之后前进：直着穿过车道进停车场
  return lotRoute(out, bay, lotMap(bay.lot));
}

function lotRoute(out: RoutePt[], bay: Bay, map: (u: number, w: number) => Pt2): RoutePt[] {
  const R = ROUTE_R;
  const cw = Math.abs(bay.cz);
  const d = Math.sign(cw - AISLE_W) || 1; // 车位在通道的哪边（场内）
  const wL = AISLE_W - d * 1.8; // 沿通道开的那条线：车位对面那半边
  const h = Math.sign(bay.cx - ENTRY_X) || -1;
  line(out, [ENTRY_X, wL - R], false, map);
  arc(out, [ENTRY_X, wL - R], [0, 1], [h, 0], false, map);
  if (noseIn(bay)) {
    line(out, [bay.cx - h * R, wL], false, map);
    arc(out, [bay.cx - h * R, wL], [h, 0], [0, d], false, map);
    line(out, [bay.cx, cw + d * 0.15], false, map);
  } else {
    // 开过头，倒进去（车尾先进）
    const xs = bay.cx + h * ROUTE_R_REV;
    line(out, [xs, wL], false, map);
    arc(out, [xs, wL], [-h, 0], [0, d], true, map, ROUTE_R_REV);
    line(out, [bay.cx, cw + d * 0.15], true, map);
  }
  return out;
}

/**
 * 车位 → 取车点：车头朝里停的（noseIn）先倒出来、车头转向进出口，沿通道开到进出口，拐出去上东行车道，开到取车点。
 * 车头朝通道停的（倒进去的）直接开出来；挨着进出口的那几个弯摆不开（要倒一把），导航线只画个大概。
 */
export function routeToPickup(bay: Bay, rot: number): RoutePt[] {
  const R = ROUTE_R;
  const map = lotMap(bay.lot);
  const cw = Math.abs(bay.cz);
  const d = Math.sign(cw - AISLE_W) || 1;
  const hOut = Math.sign(ENTRY_X - bay.cx) || 1;
  const nz = noseOf(rot)[1];
  const nw = bay.lot === 's' ? nz : -nz; // 车头在场内 w 方向的分量
  const noseToAisle = nw * -d > 0;
  const [sx, sz] = map(bay.cx, cw);
  const out: RoutePt[] = [{ x: sx, z: sz, rev: !noseToAisle }];
  if (!noseToAisle) {
    const wS = AISLE_W + d * R;
    line(out, [bay.cx, wS], true, map);
    arc(out, [bay.cx, wS], [0, -d], [-hOut, 0], true, map);
    line(out, [ENTRY_X - hOut * R, AISLE_W], false, map);
  } else {
    // 直接开出来、拐向进出口（离进出口近的弯摆不开：只画大概）
    const wS = AISLE_W - d * 0.6 + d * R;
    line(out, [bay.cx, wS], false, map);
    arc(out, [bay.cx, wS], [0, -d], [hOut, 0], false, map);
    line(out, [ENTRY_X - hOut * R, AISLE_W - d * 0.6], false, map);
  }
  const lastW = bay.lot === 's' ? out[out.length - 1].z : -out[out.length - 1].z;
  arc(out, [ENTRY_X - hOut * R, lastW], [hOut, 0], [0, -1], false, map);
  // 上车道：南停车场往北开出来右拐（东）；北停车场往南开出来左拐（东），都上东行那条线
  const zIn = bay.lot === 's' ? EAST_Z + R : EAST_Z - R;
  line(out, [ENTRY_X, bay.lot === 's' ? zIn : -zIn], false, map);
  arc(out, [ENTRY_X, zIn], [0, bay.lot === 's' ? -1 : 1], [1, 0], false, world);
  line(out, [PICKUP[0] + 0.5, EAST_Z], false, world);
  return out;
}

/** 导航线长度（米） */
export function routeLen(r: readonly RoutePt[]): number {
  let s = 0;
  for (let i = 1; i < r.length; i++) s += Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z);
  return s;
}

// ── 结算 ─────────────────────────────────────────
export interface Tally {
  parked: number;
  fetched: number;
  perfect: number;
  bumps: number;
  damage: number;
  angry: number;
  tips: number;
}
/** 结算卡：明细 + 奖励（零剐蹭停够 3 辆 +40） */
export function settle(t: Tally): {
  lines: { label: string; value: string }[];
  bonus: { label: string; value: number }[];
} {
  const bonus: { label: string; value: number }[] = [];
  if (t.bumps === 0 && t.parked >= 3) bonus.push({ label: '一下都没刮', value: 40 });
  const lines = [
    { label: '停好', value: `${t.parked} 辆` },
    { label: '取车送到', value: `${t.fetched} 次` },
    { label: '停得漂亮', value: t.perfect ? `${t.perfect} 辆` : '—' },
    { label: '小费', value: `+${t.tips}` },
    { label: '剐蹭', value: t.bumps ? `${t.bumps} 下（−${t.damage}）` : '0' },
  ];
  if (t.angry) lines.push({ label: '等急了的会员', value: `${t.angry} 位` });
  return { lines, bonus };
}
