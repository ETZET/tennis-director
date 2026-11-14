// 球童的规则（纯函数，不碰 three / DOM；rules.test.ts 测）：一分怎么打（击球时间轴、球的轨迹、死球停在哪）、
// 回收窗口多长、递球的准星、毛巾、分数、星级线、发球人的视线。
// 坐标 = 世界坐标（米，北 = −z，东 = +x），场地数据从 clubstadium/layout 只读拿。
import { DIM, MATCH_RECT, S } from '../../clubstadium/layout';

export type V2 = [number, number];
export type V3 = [number, number, number];

/** 一局几秒 */
export const DURATION = 120;
/** 几条命（犯规三次就被换下场） */
export const LIVES = 3;
/** 星级线（机器人试出来的：反应慢、准星随便松、不送毛巾 ≈ 650～800；一般 ≈ 900～1100；又快又准 ≈ 1000～1150） */
export const STARS: [number, number, number] = [500, 850, 1100];
/** 连击的时间窗（秒）：两次干净的活之间隔多久还算连着（一分一般 10～14 秒） */
export const COMBO_WINDOW = 26;

// ── 场地 ──
export const NX = S.x;
export const NZ = S.z;
/** 半场长（网到底线）、单打半宽、双打半宽、发球线离网 */
export const HL = DIM.L / 2;
export const HW = DIM.SW / 2;
export const HDW = DIM.DW / 2;
export const SVC = DIM.SVC;
/** 网（导航里挡着）的南北两头 */
export const NET_Z0 = NZ - HDW - DIM.post;
export const NET_Z1 = NZ + HDW + DIM.post;
/** 球滚到四周停下的边（西头敞口外是沙地也算场边；北边广告板、南边南看台） */
export const FENCE = { x0: -17.6, x1: 17.6, z0: -29.55, z1: -12.9 } as const;
/** "场上"：比赛的地方（双打边线外、底线后 3 米）；四边各让 0.15 米（踩着线不算） */
export const COURT = {
  x0: MATCH_RECT.x0 + 0.15,
  x1: MATCH_RECT.x1 - 0.15,
  z0: MATCH_RECT.z0 + 0.15,
  z1: MATCH_RECT.z1 - 0.15,
} as const;
export const onCourt = (x: number, z: number) => x > COURT.x0 && x < COURT.x1 && z > COURT.z0 && z < COURT.z1;

/** 总监的岗位：南网柱西边（场景里那个蹲着的球童的位置，往南挪出比赛的地方） */
export const STATION: V2 = [-1.0, -13.85];
export const STATION_R = 0.6;
/** 球童兜里最多揣几个球（多的递给底线的球童）、开局揣几个 */
export const POCKET_MAX = 3;
export const POCKET_START = 2;
/** 球童跑多快（米/秒；play 的默认 3.4 是总监散步） */
export const RUN = 4.6;

const G = 9.8;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const dist2 = (a: readonly number[], b: readonly number[]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** 3D 点的水平距离（x, z） */
const flat3 = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[2] - a[2]);

// ── 球的轨迹：一段一段（飞 = 抛物线，滚 = 贴地减速）──
export interface Seg {
  kind: 'fly' | 'roll';
  t0: number;
  t1: number;
  p0: V3;
  p1: V3;
}
/** 球在 t 时刻的位置：第一段之前 = null（还在发球人手里），最后一段之后 = 终点 */
export function ballAt(segs: readonly Seg[], t: number): V3 | null {
  if (!segs.length || t < segs[0].t0) return null;
  for (const s of segs) {
    if (t > s.t1) continue;
    const T = Math.max(1e-4, s.t1 - s.t0);
    const u = clamp(t - s.t0, 0, T);
    if (s.kind === 'roll') {
      const k = u / T;
      const e = 1 - (1 - k) * (1 - k);
      return [lerp(s.p0[0], s.p1[0], e), lerp(s.p0[1], s.p1[1], e), lerp(s.p0[2], s.p1[2], e)];
    }
    const vy = (s.p1[1] - s.p0[1] + 0.5 * G * T * T) / T;
    const k = u / T;
    return [lerp(s.p0[0], s.p1[0], k), s.p0[1] + vy * u - 0.5 * G * u * u, lerp(s.p0[2], s.p1[2], k)];
  }
  return segs[segs.length - 1].p1.slice() as V3;
}

// ── 球员 ──
/** 挥拍：一遍几秒、拍面碰球在第几成（同 clubstadium/life） */
export const SWING = 0.72;
export const C_STROKE = 0.485;
export const SERVE_DUR = 1.35;
export const SERVE_C = 0.68;
export const TOSS_AT = 0.1;
/** 拍面碰球的点（人物本地坐标：−x = 右手边，+z = 前面） */
const CONTACT: Record<'forehand' | 'backhand' | 'serve', V3> = {
  forehand: [-0.85, 0.85, 0.35],
  backhand: [0.85, 0.85, 0.35],
  serve: [-0.4, 1.95, 0.15],
};
const TOSS: V3 = [0.32, 1.05, 0.2];
/** 朝网的朝向（side = 站在哪半场：−1 西、1 东） */
export const netYaw = (side: number) => (side > 0 ? -Math.PI / 2 : Math.PI / 2);
/** 人物本地点 → 世界（绕 y 转 yaw，同 three 的 applyAxisAngle） */
export function local(stand: V2, yaw: number, p: V3): V3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [stand[0] + c * p[0] + s * p[2], p[1], stand[1] - s * p[0] + c * p[2]];
}
/** 发球站位（side 半场，deuce = 平分区：发球人右手边） */
export function serveSpot(side: number, deuce: boolean): V2 {
  const right = side > 0 ? -1 : 1;
  return [NX + side * (HL + 0.35), NZ + (deuce ? right : -right) * 1.3];
}
export function returnSpot(side: number, deuce: boolean): V2 {
  const right = side > 0 ? 1 : -1;
  return [NX + side * (HL + 0.4), NZ + (deuce ? right : -right) * 2.6];
}

export type Stroke = 'serve' | 'forehand' | 'backhand';
export interface Move {
  who: 0 | 1;
  t0: number;
  t1: number;
  from: V2;
  to: V2;
}
export interface Swing {
  who: 0 | 1;
  name: Stroke;
  t0: number;
  dur: number;
}
/** 死球最后去哪：挂网 / 底线后 / 南边场边（岗位这边）/ 北边广告板下 / 飞上看台（没有死球，要递球） */
export type EndKind = 'net' | 'deep' | 'wideS' | 'wideN' | 'stands';
export interface PointPlan {
  segs: Seg[];
  moves: Move[];
  swings: Swing[];
  /** 这一分定了的时刻（落地出界 / 挂网 / 第二跳） */
  tDead: number;
  /** 球停住的时刻 */
  tRest: number;
  /** 死球停在哪（飞上看台 = null） */
  rest: V2 | null;
  end: EndKind;
  /** 出界（不是制胜分） */
  out: boolean;
  /** 赢这一分的人（0 = A） */
  winner: 0 | 1;
  /** 一共打了几拍（含发球） */
  shots: number;
  /** 发球人这一分完了举手要球 */
  feed: boolean;
}

export interface PointIn {
  /** 发球动作开始（抛球前）的时刻 */
  t0: number;
  /** 谁发球（0 = A） */
  srv: 0 | 1;
  /** A 在哪半场：−1 西、1 东 */
  sideA: number;
  /** 平分区发（这一局打了偶数分） */
  deuce: boolean;
  /** 难度 0..1（一局里越往后越难） */
  level: number;
}

/** 死球去哪的权重（越往后越远：北边、底线后多起来） */
export function endWeights(level: number): Record<EndKind, number> {
  const L = clamp(level, 0, 1);
  return { net: 0.38 - 0.06 * L, deep: 0.14 + 0.1 * L, wideS: 0.3 - 0.12 * L, wideN: 0.07 + 0.08 * L, stands: 0.11 };
}
function pickW<K extends string>(rng: () => number, w: Record<K, number>): K {
  const keys = Object.keys(w) as K[];
  let sum = 0;
  for (const k of keys) sum += w[k];
  let r = rng() * sum;
  for (const k of keys) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

const BALL_Y = 0.12;
/** 发球人赢一分的概率 */
export const SERVER_WINS = 0.68;
/**
 * 一分：发球 → 来回几拍 → 结束（死球停到某处）。击球不等球（同 clubstadium/life）：出手那一刻算好整条轨迹，
 * 接球的人马上起动，挥拍按"拍面到击球点的时刻 = 球到的时刻"倒推。
 */
export function planPoint(rng: () => number, o: PointIn): PointPlan {
  const side = (i: 0 | 1) => (i === 0 ? o.sideA : -o.sideA);
  const segs: Seg[] = [];
  const moves: Move[] = [];
  const swings: Swing[] = [];
  const pos: [V2, V2] = [
    o.srv === 0 ? serveSpot(side(0), o.deuce) : returnSpot(side(0), o.deuce),
    o.srv === 1 ? serveSpot(side(1), o.deuce) : returnSpot(side(1), o.deuce),
  ];
  const moveTo = (who: 0 | 1, to: V2, t0: number, t1: number, latest = t1) => {
    const d = dist2(pos[who], to);
    const end = Math.min(latest, Math.max(t1, t0 + d / 6));
    moves.push({ who, t0, t1: Math.max(t0 + 0.05, end), from: [...pos[who]] as V2, to: [...to] as V2 });
    pos[who] = [...to] as V2;
  };

  // 发球：抛球 → 拍面最高点碰球
  const srv = o.srv;
  const ss = side(srv);
  const sYaw = netYaw(ss);
  swings.push({ who: srv, name: 'serve', t0: o.t0, dur: SERVE_DUR });
  const tToss = o.t0 + TOSS_AT * SERVE_DUR;
  const tServe = o.t0 + SERVE_C * SERVE_DUR;
  let P0 = local(pos[srv], sYaw, CONTACT.serve);
  segs.push({ kind: 'fly', t0: tToss, t1: tServe, p0: local(pos[srv], sYaw, TOSS), p1: P0 });

  let shots = 1 + Math.floor(rng() * 2.6) + (rng() < 0.12 ? 2 : 0);
  /** 谁赢这一分：发球人七成（一局四五分就完，常换边） */
  const wantSrv = rng() < SERVER_WINS;
  let hitter: 0 | 1 = srv;
  let tHit = tServe;
  let n = 1;
  // 来回（最后一拍之前的都是好球）
  while (shots > 1) {
    const recv: 0 | 1 = hitter === 0 ? 1 : 0;
    const rs = side(recv);
    const serve = n === 1;
    const vh = serve ? 19 + rng() * 2 : 16 + rng() * 4;
    const sgn = Math.sign(pos[recv][1] - NZ) || 1;
    const target: V3 = serve
      ? [NX + rs * (HL - 0.3 + rng() * 0.9), 0.9, NZ + sgn * (1.4 + rng() * 1.6)]
      : [NX + rs * (HL - 1.0 + rng() * 2.0), 0.9, NZ + (rng() < 0.5 ? -1 : 1) * rng() * 3.4];
    const f = 0.76 + rng() * 0.1;
    const B0: V3 = serve
      ? [NX + rs * (SVC - 0.5 - rng() * 1.6), BALL_Y, NZ + sgn * (0.6 + rng() * 2.6)]
      : [lerp(P0[0], target[0], f), BALL_Y, lerp(P0[2], target[2], f)];
    const T1 = flat3(P0, B0) / vh;
    const T2 = Math.max(0.35, flat3(B0, target) / (vh * 0.75));
    const tc = tHit + T1 + T2;
    // 接球的人：正手还是反手（目标在右手边 = 正手）
    const yaw = netYaw(rs);
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    const rel = (target[0] - pos[recv][0]) * rx + (target[2] - pos[recv][1]) * rz;
    const stroke: Stroke = rel > -0.5 ? 'forehand' : 'backhand';
    const off = local([0, 0], yaw, CONTACT[stroke]);
    const du = Math.abs(target[0] - off[0] - NX);
    const stand: V2 = [
      NX + rs * clamp(du, HL - 2.4, HL + 2.8),
      clamp(target[2] - off[2], NZ - HDW - 1.3, NZ + HDW + 1.3),
    ];
    const P1 = local(stand, yaw, CONTACT[stroke]);
    segs.push({ kind: 'fly', t0: tHit, t1: tHit + T1, p0: P0, p1: B0 });
    segs.push({ kind: 'fly', t0: tHit + T1, t1: tc, p0: B0, p1: P1 });
    moveTo(recv, stand, tHit + 0.1, tc - 0.32, tc - 0.04);
    swings.push({ who: recv, name: stroke, t0: tc - C_STROKE * SWING, dur: SWING });
    // 打完的人回位（底线后中间）
    const hs = side(hitter);
    moveTo(hitter, [NX + hs * (HL + 0.6), NZ + (pos[hitter][1] - NZ) * 0.3], tHit + 0.25, tHit + 0.25 + 0.9);
    hitter = recv;
    tHit = tc;
    P0 = P1;
    shots--;
    n++;
  }

  // 最后一拍：怎么结束、死球停在哪
  let end = pickW(rng, endWeights(o.level));
  // 想让最后出手的人赢：只能是好球（落在场里）
  const hitterWins = (hitter === srv) === wantSrv;
  if (hitterWins && (end === 'net' || end === 'stands')) end = rng() < 0.5 ? 'wideS' : rng() < 0.5 ? 'deep' : 'wideN';
  const hs = side(hitter);
  const rs = -hs;
  let tDead: number;
  let tRest: number;
  let rest: V2 | null;
  let out = true;
  if (end === 'net') {
    const zN = NZ + (rng() * 2 - 1) * (HDW - 0.8);
    const hitN: V3 = [NX + hs * 0.14, 0.45 + rng() * 0.35, zN];
    const T = Math.max(0.35, flat3(P0, hitN) / 13);
    const drop: V3 = [NX + hs * 0.3, BALL_Y, zN + (rng() - 0.5) * 0.3];
    rest = [NX + hs * (0.55 + rng() * 1.1), clamp(drop[2] + (rng() - 0.5) * 0.8, NET_Z0 + 0.4, NET_Z1 - 0.4)];
    segs.push({ kind: 'fly', t0: tHit, t1: tHit + T, p0: P0, p1: hitN });
    segs.push({ kind: 'fly', t0: tHit + T, t1: tHit + T + 0.32, p0: hitN, p1: drop });
    segs.push({ kind: 'roll', t0: tHit + T + 0.32, t1: tHit + T + 1.2, p0: drop, p1: [rest[0], BALL_Y, rest[1]] });
    tDead = tHit + T;
    tRest = tHit + T + 1.2;
  } else if (end === 'stands') {
    // 打飞了：越过北边的广告板，落进看台
    const up: V3 = [NX + rs * (3 + rng() * 9), 4.2 + rng() * 1.2, -32.5 - rng() * 2];
    const T = 1.0 + rng() * 0.25;
    segs.push({ kind: 'fly', t0: tHit, t1: tHit + T, p0: P0, p1: up });
    tDead = tHit + T * 0.55;
    tRest = tHit + T;
    rest = null;
  } else {
    // 落地（界内 = 制胜分 / 界外 = 出界）→ 弹一下 → 滚到场边停住
    let R: V2;
    let bx: number;
    if (end === 'deep') {
      R = [NX + rs * (13.4 + rng() * 2.8), NZ + (rng() * 2 - 1) * 3.6];
      out = !hitterWins;
      bx = NX + rs * (out ? HL + 0.2 + rng() * 0.8 : HL - 3.0 + rng() * 2.6);
    } else {
      const zEdge = end === 'wideS' ? FENCE.z1 - rng() * 0.7 : FENCE.z0 + rng() * 0.45;
      R = [NX + rs * (6 + rng() * 9), zEdge];
      bx = NX + rs * (3.5 + rng() * (Math.abs(R[0] - NX) - 4.5));
    }
    const fx = clamp((bx - P0[0]) / (R[0] - P0[0]), 0.3, 0.92);
    const B0: V3 = [lerp(P0[0], R[0], fx), BALL_Y, lerp(P0[2], R[1], fx)];
    if (end !== 'deep') {
      // 边线：赢 = 落在单打边线里面，输 = 落在外面
      out = !hitterWins;
      const sz = Math.sign(R[1] - NZ) || 1;
      B0[2] = NZ + sz * (out ? HW + 0.25 + rng() * 0.9 : Math.min(HW - 0.3, Math.abs(B0[2] - NZ)));
    }
    const vh = 15 + rng() * 4;
    const T1 = flat3(P0, B0) / vh;
    const B1: V3 = [lerp(B0[0], R[0], 0.45), BALL_Y, lerp(B0[2], R[1], 0.45)];
    const T2 = Math.max(0.3, flat3(B0, B1) / (vh * 0.55));
    const T3 = 0.5 + flat3(B1, [R[0], 0, R[1]]) / 4;
    segs.push({ kind: 'fly', t0: tHit, t1: tHit + T1, p0: P0, p1: B0 });
    segs.push({ kind: 'fly', t0: tHit + T1, t1: tHit + T1 + T2, p0: B0, p1: B1 });
    segs.push({ kind: 'roll', t0: tHit + T1 + T2, t1: tHit + T1 + T2 + T3, p0: B1, p1: [R[0], BALL_Y, R[1]] });
    // 界内：第二跳才算定（对手追不到）
    tDead = out ? tHit + T1 : tHit + T1 + T2;
    tRest = tHit + T1 + T2 + T3;
    rest = R;
  }
  const winner: 0 | 1 = end !== 'net' && !out ? hitter : hitter === 0 ? 1 : 0;
  // 发球人这一分完了要球：打飞了一定要；不然越往后越常要
  const feed = end === 'stands' || rng() < 0.22 + 0.18 * clamp(o.level, 0, 1);
  return { segs, moves, swings, tDead, tRest, rest, end, out, winner, shots: n, feed };
}

// ── 回收窗口 ──
/** 南网柱绕过去的点、北网柱绕过去的点（网在导航里挡着：x ±0.2、z 网两头之间） */
const AROUND_S: V2 = [NX + 0.05, NET_Z1 + 0.75];
const AROUND_N: V2 = [NX, NET_Z0 - 0.35];
/** 从 a 跑到 b 大概多远（隔着网就从网柱绕） */
export function pathLen(a: V2, b: V2): number {
  const crosses = Math.sign(a[0] - NX) !== Math.sign(b[0] - NX) && a[0] !== NX && b[0] !== NX;
  if (!crosses) return dist2(a, b);
  const k = (NX - a[0]) / (b[0] - a[0]);
  const zc = lerp(a[1], b[1], k);
  if (zc < NET_Z0 - 0.3 || zc > NET_Z1 + 0.3) return dist2(a, b);
  return Math.min(dist2(a, AROUND_S) + dist2(AROUND_S, b), dist2(a, AROUND_N) + dist2(AROUND_N, b));
}
/** 跑一趟来回的宽松倍数（越往后越紧） */
export const slack = (level: number) => lerp(1.5, 1.15, clamp(level, 0, 1));
/** 递球要的时间（按住、出手、滚过去） */
export const FEED_TIME = 2.6;
/**
 * 这一分完了到下一次发球隔多久（从死球定了那一刻算）：球滚停的时间 + 反应 + 来回跑 × 宽松倍数 + 捡球；要球再加递球的时间。
 * 没有死球（飞上看台）：只等递球。
 */
export function serveDelay(p: Pick<PointPlan, 'rest' | 'tDead' | 'tRest' | 'feed'>, level: number): number {
  const roll = Math.max(0, p.tRest - p.tDead) * 0.6;
  const feed = p.feed ? FEED_TIME : 0;
  if (!p.rest) return Math.max(4.5, 2.4 + roll + feed);
  const run = (2 * pathLen(STATION, p.rest)) / RUN;
  return Math.max(4.5, roll + 0.8 + 0.5 + run * slack(level) + feed);
}

// ── 发球人的视线 ──
/** 视线锥的半角（发球前别在发球人正前方走动：对面底线后面那一片） */
export const SIGHT = (20 * Math.PI) / 180;
/** 发球人站在 server（side 半场，朝 −side 看）：p 在不在他眼前（离他 6 米以外、半角 SIGHT 以内、场边以内） */
export function inSight(server: V2, side: number, p: V2): boolean {
  const d = (p[0] - server[0]) * -side;
  if (d < 6) return false;
  if (p[0] < FENCE.x0 - 0.5 || p[0] > FENCE.x1 + 0.5 || p[1] < FENCE.z0 - 0.5 || p[1] > FENCE.z1 + 0.5) return false;
  return Math.atan2(Math.abs(p[1] - server[1]), d) < SIGHT;
}
/** 发球前多久开始算"在发球"（拍球、抛球）：这段时间里在他眼前走动 = 挡视线 */
export const WINDUP = 1.4;
/** 犯规以后发球推迟多久 */
export const PENALTY_DELAY = 4;

// ── 递球的准星 ──
/** 准星一来一回（0 → 1 → 0）的秒数，越往后越快 */
export const meterPeriod = (level: number) => lerp(1.25, 0.85, clamp(level, 0, 1));
/** 绿区：中心、半宽（越往后越窄） */
export const meterZone = (level: number) => ({ c: 0.72, w: lerp(0.13, 0.08, clamp(level, 0, 1)) });
/** 按住 t 秒时准星在哪（0..1，来回） */
export function meterAt(t: number, period: number): number {
  const u = ((t / period) * 2) % 2;
  return u > 1 ? 2 - u : u;
}
export type FeedQ = 'perfect' | 'good' | 'poor';
export function feedQuality(m: number, zone: { c: number; w: number }): FeedQ {
  const e = Math.abs(m - zone.c);
  return e <= zone.w * 0.45 ? 'perfect' : e <= zone.w ? 'good' : 'poor';
}
export const FEED_PTS: Record<FeedQ, number> = { perfect: 60, good: 35, poor: 10 };
/** 递歪了：球滚到离发球人脚下多远（米） */
export const FEED_MISS: Record<FeedQ, number> = { perfect: 0.3, good: 1.4, poor: 3.4 };

// ── 分数 ──
/** 捡回来（回到岗位）：50 底 + 快的奖励（窗口剩下的比例 × 50）+ 连击（第 2 次起每次 +10，最多 +40） */
export function retrievePoints(spare: number, combo: number): number {
  return 50 + Math.round(50 * clamp(spare, 0, 1)) + 10 * Math.min(Math.max(combo - 1, 0), 4);
}
/** 发球了才回到岗位（手里拿着球、人在场外）：只给这么多 */
export const LATE_PTS = 20;
/** 递毛巾：80 + 快的奖励（换边剩下的比例 × 40）；递错人 −20 */
export const towelPoints = (spare: number) => 80 + Math.round(40 * clamp(spare, 0, 1));
export const WRONG_TOWEL = 20;
/** 犯规扣分 */
export const PENALTY_PTS = 40;
/** 结算：剩下的每条命 */
export const LIFE_BONUS = 60;

// ── 比分（表演赛：无占先，抢到 4 分赢一局；每局打完换边、休息）──
export function award(score: [number, number], w: 0 | 1): { score: [number, number]; game: boolean } {
  const s: [number, number] = [score[0], score[1]];
  s[w]++;
  return s[w] >= 4 ? { score: [0, 0], game: true } : { score: s, game: false };
}
const PTS = ['0', '15', '30', '40'];
/** 裁判报分（发球人的分在前；3–3 = 平分，下一分决胜） */
export function callOf(score: [number, number], srv: 0 | 1): string {
  const [a, b] = [score[srv], score[1 - srv]];
  if (a === 3 && b === 3) return '平分 · 决胜分';
  if (a === 0 && b === 0) return '';
  if (a === b) return `${PTS[a]} 平`;
  return `${PTS[Math.min(3, a)]}–${PTS[Math.min(3, b)]}`;
}
/** 开局的比分（表演赛已经打了一会儿：第一局两三分就完，早早换一次边） */
export const OPEN_GAMES: [number, number] = [2, 1];
export const OPEN_SCORE: [number, number] = [2, 1];
/** 换边休息几秒 */
export const CHANGE = 10;

export interface Tally {
  clean: number;
  late: number;
  missed: number;
  points: number;
  feeds: number;
  perfectFeeds: number;
  feedMissed: number;
  towels: number;
  towelWrong: number;
  towelMissed: number;
  fouls: number;
  lives: number;
  bestCombo: number;
}
export const emptyTally = (): Tally => ({
  clean: 0,
  late: 0,
  missed: 0,
  points: 0,
  feeds: 0,
  perfectFeeds: 0,
  feedMissed: 0,
  towels: 0,
  towelWrong: 0,
  towelMissed: 0,
  fouls: 0,
  lives: LIVES,
  bestCombo: 0,
});

/** 结算卡：明细 + 奖励（剩下的命） */
export function settle(t: Tally): {
  lines: { label: string; value: string }[];
  bonus: { label: string; value: number }[];
} {
  const lines = [
    { label: '打了几分', value: `${t.points}` },
    {
      label: '干净回收',
      value: `${t.clean}${t.late ? ` · 慢了 ${t.late}` : ''}${t.missed ? ` · 漏 ${t.missed}` : ''}`,
    },
    {
      label: '递球',
      value: `${t.feeds}${t.perfectFeeds ? `（正好 ${t.perfectFeeds}）` : ''}${t.feedMissed ? ` · 没递 ${t.feedMissed}` : ''}`,
    },
    {
      label: '毛巾',
      value: `${t.towels}${t.towelWrong ? ` · 递错 ${t.towelWrong}` : ''}${t.towelMissed ? ` · 没送到 ${t.towelMissed}` : ''}`,
    },
    { label: '最长连击', value: t.bestCombo >= 2 ? `×${t.bestCombo}` : '—' },
    { label: '犯规', value: t.fouls ? `${t.fouls} 次` : '没有' },
  ];
  const bonus: { label: string; value: number }[] = [];
  if (t.lives > 0) bonus.push({ label: `剩 ${t.lives} 条命 × ${LIFE_BONUS}`, value: t.lives * LIFE_BONUS });
  return { lines, bonus };
}
