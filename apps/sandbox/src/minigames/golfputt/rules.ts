// 果岭推杆的规则（纯函数，不碰 three / DOM；rules.test.ts 测）：球怎么滚（摩擦 + 坡）、进洞 / 吊洞、
// 力度怎么换算、一洞几分、星级线。果岭的坡和九个洞的摆法在 course.ts。
//
// 尺度：游戏里的球和洞杯都比真的大一倍（球半径 4.5 厘米、杯半径 10 厘米），手机画面上球才有 4 个纹素；
// 进洞的速度门槛按杯的弦长换算（正中最多 1.3 米/秒能进，擦边要更慢），和真球的手感差不多。

export type V2 = readonly [number, number];
/** 地面：果岭、果岭边（collar）、球道草、长草、沙坑、水塘、界外（砂石地） */
export type Surface = 'green' | 'fringe' | 'fairway' | 'rough' | 'sand' | 'water' | 'out';

/** 滚动的球受坡的加速度 = 5/7 g × 坡度（实心球滚而不滑） */
export const G_ROLL = (9.81 * 5) / 7;
/** 各种地面的滚动阻力（米/秒²，和速度反向的定值减速）；沙、水、界外 = 进去就停（罚杆） */
export const FRICTION: Record<Surface, number> = {
  green: 0.8,
  fringe: 1.3,
  fairway: 1.9,
  rough: 5.5,
  sand: 9,
  water: 9,
  out: 9,
};
/** 罚杆的地面 */
export const HAZARD: ReadonlySet<Surface> = new Set<Surface>(['sand', 'water', 'out']);
export const BALL_R = 0.045;
export const CUP_R = 0.1;
/** 进洞：过杯时速度 ≤ K × 弦长（正中弦长 0.2 → 1.3 米/秒） */
export const CAPTURE_K = 6.5;
/** 在杯沿里转悠、慢到这个速度就掉进去 */
export const DROP_SLOW = 0.42;
/** 慢到这个速度、坡又拉不动它 = 停 */
export const V_STOP = 0.03;
/** 瞄准线：只画前面这么多米（不给整条路） */
export const PREVIEW = 1.5;
/** 满力度在平的果岭上能滚多远（米）；力度 k ∈ [0,1] → 平地距离 = FLAT_MAX × k^POWER_EXP（短推拖得开、好控制） */
export const FLAT_MAX = 20;
export const POWER_EXP = 1.7;

/** 一洞最多几杆：标准杆 + 3 还没进 = 捡起来（记标准杆 + 3） */
export const MAX_OVER = 3;
/** 一洞的分：标准杆 200，每少一杆 +100、多一杆 −100（不到 0） */
export const PTS_PAR = 200;
export const PTS_STROKE = 100;
/** 快手奖励（这洞在建议时间内推进）：九洞最多 90 < 一杆的 100 —— 星级只看杆数 */
export const QUICK_BONUS = 10;
/**
 * 星级线（九洞标准杆都打 = 1800 分，和标准杆总数无关）：
 * 一星 ≥ 1200（总杆 ≤ 标准杆 +6）、二星 ≥ 1700（≤ +1）、三星 ≥ 1900（低于标准杆）
 */
export const STARS: [number, number, number] = [1200, 1700, 1900];

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// ── 力度 ───────────────────────────────────────────────

/** 力度 k（0..1）→ 在平果岭上滚多远（米） */
export const flatDistance = (k: number) => FLAT_MAX * clamp(k, 0, 1) ** POWER_EXP;
/** 力度 k → 出杆速度（米/秒）：平果岭上 v² = 2·μ·d */
export const launchSpeed = (k: number) => Math.sqrt(2 * FRICTION.green * flatDistance(k));
/** 反过来：想在平果岭上滚 d 米要多大力度 */
export const powerFor = (d: number) => clamp((Math.max(0, d) / FLAT_MAX) ** (1 / POWER_EXP), 0, 1);

// ── 坡 ─────────────────────────────────────────────────

/** 一个鼓包（h > 0）或一个碗（h < 0）：高斯形，sx / sz 是两个方向的宽（米） */
export interface Bump {
  x: number;
  z: number;
  sx: number;
  sz: number;
  h: number;
}
/** 果岭的形：整体倾斜（每米升多少：gx 往东、gz 往南）+ 鼓包和碗；绕 (cx, cz) 算倾斜 */
export interface Slope {
  cx: number;
  cz: number;
  gx: number;
  gz: number;
  bumps: readonly Bump[];
}

/** 高度（米，相对 (cx, cz)）：只给画面用（看坡的流线、坡纹） */
export function heightAt(s: Slope, x: number, z: number): number {
  let h = s.gx * (x - s.cx) + s.gz * (z - s.cz);
  for (const b of s.bumps) {
    const u = (x - b.x) / b.sx;
    const w = (z - b.z) / b.sz;
    h += b.h * Math.exp(-0.5 * (u * u + w * w));
  }
  return h;
}

/** 坡度（高度对 x、z 的偏导；往高处指） */
export function gradient(s: Slope, x: number, z: number): [number, number] {
  let gx = s.gx;
  let gz = s.gz;
  for (const b of s.bumps) {
    const u = (x - b.x) / b.sx;
    const w = (z - b.z) / b.sz;
    const e = b.h * Math.exp(-0.5 * (u * u + w * w));
    gx += (-e * u) / b.sx;
    gz += (-e * w) / b.sz;
  }
  return [gx, gz];
}

// ── 滚 ─────────────────────────────────────────────────

export interface Env {
  surface(x: number, z: number): Surface;
  slope: Slope;
  cup: V2;
}

export interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** 在滚 */
  moving: boolean;
  /** 球心在杯口里（进去那一刻判过进不进；出来之前不再判） */
  inCup: boolean;
  /** 这一杆滚了多远（米） */
  dist: number;
  /** 最后一个能打的位置（罚杆后在这附近放球） */
  safe: [number, number];
}

export type RollEvent =
  | { kind: 'holed'; at: V2; speed: number }
  | { kind: 'lip'; at: V2; speed: number; edge: number }
  | { kind: 'hazard'; surface: Surface; at: V2; drop: V2 }
  | { kind: 'stop'; at: V2 };

export function newBall(at: V2): Ball {
  return { x: at[0], z: at[1], vx: 0, vz: 0, moving: false, inCup: false, dist: 0, safe: [at[0], at[1]] };
}

/** 出杆：朝 angle（弧度，atan2(dz, dx)）、力度 k */
export function hit(b: Ball, angle: number, k: number): void {
  const v = launchSpeed(k);
  b.vx = Math.cos(angle) * v;
  b.vz = Math.sin(angle) * v;
  b.moving = v > V_STOP;
  b.inCup = false;
  b.dist = 0;
}

/** 罚杆放球：从进去的地方往回退，退到能打的地面再多退 0.3 米 */
export function dropPoint(env: Env, at: V2, safe: V2): V2 {
  const dx = safe[0] - at[0];
  const dz = safe[1] - at[1];
  const L = Math.hypot(dx, dz);
  if (L < 1e-6) return safe;
  // 顺着来的方向往回退（safe 只是上一小步，退的距离不受它限制）
  const ux = dx / L;
  const uz = dz / L;
  const ok = (t: number) => !HAZARD.has(env.surface(at[0] + ux * t, at[1] + uz * t));
  for (let s = 0.02; s <= 4; s += 0.02) {
    if (!ok(s)) continue;
    let t = s + 0.4;
    while (t > s && !ok(t)) t -= 0.05;
    return [at[0] + ux * t, at[1] + uz * t];
  }
  return safe;
}

/** 速度转一个角（弧度） */
function rotate(b: Ball, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const vx = b.vx * c - b.vz * s;
  b.vz = b.vx * s + b.vz * c;
  b.vx = vx;
}

/**
 * 滚 dt 秒（内部按 2 厘米一小步）。返回这一段里发生的事（进洞 / 吊洞 / 出事 / 停），没事 = null。
 * 进洞那一刻：球心第一次进杯口，算球的路线离杯心多远（b）→ 弦长 2√(R²−b²)；速度 ≤ K·弦长就掉进去，
 * 不然吊出来：擦边的被杯沿拽着拐个弯（越擦边、越慢拐得越多），正中太快的跳过去（掉一截速度）。
 */
export function stepBall(b: Ball, dt: number, env: Env): RollEvent | null {
  if (!b.moving) return null;
  const v0 = Math.hypot(b.vx, b.vz);
  const n = Math.max(1, Math.ceil((v0 * dt) / 0.02));
  const h = dt / n;
  let ev: RollEvent | null = null;
  for (let i = 0; i < n; i++) {
    const surf = env.surface(b.x, b.z);
    if (HAZARD.has(surf)) {
      b.moving = false;
      b.vx = 0;
      b.vz = 0;
      const at: V2 = [b.x, b.z];
      return { kind: 'hazard', surface: surf, at, drop: dropPoint(env, at, b.safe) };
    }
    b.safe = [b.x, b.z];
    const mu = FRICTION[surf];
    const [gx, gz] = gradient(env.slope, b.x, b.z);
    const ax = -G_ROLL * gx;
    const az = -G_ROLL * gz;
    const pull = Math.hypot(ax, az);
    const v = Math.hypot(b.vx, b.vz);
    if (v < V_STOP) {
      if (pull <= mu) {
        b.moving = false;
        b.vx = 0;
        b.vz = 0;
        return ev ?? { kind: 'stop', at: [b.x, b.z] };
      }
      // 坡比阻力陡：顺着坡往下溜
      b.vx += (ax - (mu * ax) / pull) * h;
      b.vz += (az - (mu * az) / pull) * h;
    } else {
      const nvx = b.vx + (ax - (mu * b.vx) / v) * h;
      const nvz = b.vz + (az - (mu * b.vz) / v) * h;
      if (nvx * b.vx + nvz * b.vz <= 0 && pull <= mu) {
        b.moving = false;
        b.vx = 0;
        b.vz = 0;
        return ev ?? { kind: 'stop', at: [b.x, b.z] };
      }
      b.vx = nvx;
      b.vz = nvz;
    }
    const ox = b.x;
    const oz = b.z;
    b.x += b.vx * h;
    b.z += b.vz * h;
    b.dist += Math.hypot(b.x - ox, b.z - oz);

    // ── 洞杯 ──
    const dx = env.cup[0] - b.x;
    const dz = env.cup[1] - b.z;
    const d = Math.hypot(dx, dz);
    const sp = Math.hypot(b.vx, b.vz);
    if (!b.inCup && d < CUP_R) {
      b.inCup = true;
      const ux = b.vx / Math.max(sp, 1e-6);
      const uz = b.vz / Math.max(sp, 1e-6);
      // 杯心在路线左边（> 0）还是右边；|cross| = 路线离杯心多远
      const cross = ux * dz - uz * dx;
      const off = Math.min(CUP_R, Math.abs(cross));
      const chord = 2 * Math.sqrt(Math.max(0, CUP_R * CUP_R - off * off));
      if (sp <= CAPTURE_K * chord || sp < DROP_SLOW) return holed(b, env, sp);
      const edge = off / CUP_R;
      const away = cross >= 0 ? -1 : 1;
      if (edge < 0.4) {
        // 正中太快：跳过杯去
        rotate(b, away * 0.05);
        b.vx *= 0.62;
        b.vz *= 0.62;
      } else {
        // 擦边：杯沿拽着拐弯
        rotate(b, away * (0.2 + 0.9 * edge) * clamp(1.5 / sp, 0.35, 1));
        b.vx *= 0.72;
        b.vz *= 0.72;
      }
      ev = { kind: 'lip', at: [b.x, b.z], speed: sp, edge };
    } else if (b.inCup) {
      if (d > CUP_R + 0.01) b.inCup = false;
      else if (sp < DROP_SLOW * 0.8 && d < CUP_R * 0.85) return holed(b, env, sp);
    }
  }
  return ev;
}

function holed(b: Ball, env: Env, speed: number): RollEvent {
  b.moving = false;
  b.vx = 0;
  b.vz = 0;
  b.x = env.cup[0];
  b.z = env.cup[1];
  return { kind: 'holed', at: env.cup, speed };
}

/** 瞄准线：从 at 朝 angle、力度 k 滚，前 maxDist 米的路（每 0.1 米一个点；进洞、出事、停了就断） */
export function predict(env: Env, at: V2, angle: number, k: number, maxDist = PREVIEW): [number, number][] {
  const b = newBall(at);
  hit(b, angle, k);
  const pts: [number, number][] = [[b.x, b.z]];
  let next = 0.1;
  for (let i = 0; i < 2400 && b.moving && b.dist < maxDist; i++) {
    const ev = stepBall(b, 1 / 120, env);
    while (b.dist >= next && next <= maxDist + 1e-6) {
      pts.push([b.x, b.z]);
      next += 0.1;
    }
    if (ev && ev.kind !== 'lip') break;
  }
  return pts;
}

export interface Outcome {
  kind: 'holed' | 'stop' | 'hazard';
  end: V2;
  /** 罚杆后放球的地方（hazard） */
  drop?: V2;
  lips: number;
  time: number;
}

/** 整杆模拟（测试、机器人用）：滚到停 / 进 / 出事为止 */
export function simulate(env: Env, at: V2, angle: number, k: number, maxT = 30): Outcome {
  const b = newBall(at);
  hit(b, angle, k);
  const dt = 1 / 60;
  let lips = 0;
  let t = 0;
  for (; t < maxT && b.moving; t += dt) {
    const ev = stepBall(b, dt, env);
    if (!ev) continue;
    if (ev.kind === 'lip') lips++;
    else if (ev.kind === 'hazard') return { kind: 'hazard', end: ev.at, drop: ev.drop, lips, time: t };
    else if (ev.kind === 'holed') return { kind: 'holed', end: ev.at, lips, time: t };
    else return { kind: 'stop', end: ev.at, lips, time: t };
  }
  return { kind: 'stop', end: [b.x, b.z], lips, time: t };
}

/** 找一杆最好的（网格搜方向和力度；机器人和测试用）：先求进，进不了就求停得最近 */
export function bestPutt(
  env: Env,
  at: V2,
  opts: { angleSpan?: number; angleN?: number; powerN?: number } = {},
): { angle: number; k: number; outcome: Outcome; dist: number } {
  const base = Math.atan2(env.cup[1] - at[1], env.cup[0] - at[0]);
  const span = opts.angleSpan ?? 0.5;
  const AN = opts.angleN ?? 41;
  const PN = opts.powerN ?? 40;
  const D = Math.hypot(env.cup[0] - at[0], env.cup[1] - at[1]);
  const k0 = powerFor(D * 0.5);
  const k1 = powerFor(D * 2.6 + 1.5);
  let best = { angle: base, k: powerFor(D), outcome: simulate(env, at, base, powerFor(D)), dist: 1e9 };
  let bestScore = -1e9;
  const grid = (a0: number, a1: number, an: number, kk0: number, kk1: number, pn: number) => {
    for (let i = 0; i < an; i++) {
      const a = a0 + ((a1 - a0) * i) / (an - 1);
      for (let j = 0; j < pn; j++) {
        const k = clamp(kk0 + ((kk1 - kk0) * j) / (pn - 1), 0.01, 1);
        const o = simulate(env, at, a, k);
        const dist = Math.hypot(o.end[0] - env.cup[0], o.end[1] - env.cup[1]);
        // 进了：越轻进越好（容错大）；没进：越近越好；出事最差
        const score = o.kind === 'holed' ? 100 - k : o.kind === 'hazard' ? -100 : -dist;
        if (score > bestScore) {
          bestScore = score;
          best = { angle: a, k, outcome: o, dist: o.kind === 'holed' ? 0 : dist };
        }
      }
    }
  };
  grid(base - span, base + span, AN, k0, k1, PN);
  // 在最好的那格附近再细搜两轮
  let da = (2 * span) / (AN - 1);
  let dk = (k1 - k0) / (PN - 1);
  for (let r = 0; r < 2; r++) {
    const { angle, k } = best;
    grid(angle - da, angle + da, 9, k - dk, k + dk, 9);
    da /= 4;
    dk /= 4;
  }
  return best;
}

// ── 分 ─────────────────────────────────────────────────

/** 一洞的分（杆数 → 分，不含快手奖励） */
export const holePoints = (par: number, strokes: number) => Math.max(0, PTS_PAR + PTS_STROKE * (par - strokes));

export type VerdictKey = 'ace' | 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'worse';
/** 这洞打得怎么样（记分卡的印章） */
export function verdict(par: number, strokes: number): { key: VerdictKey; name: string } {
  if (strokes === 1) return { key: 'ace', name: '一杆进洞' };
  const d = strokes - par;
  if (d <= -2) return { key: 'eagle', name: '老鹰' };
  if (d === -1) return { key: 'birdie', name: '小鸟' };
  if (d === 0) return { key: 'par', name: '标准杆' };
  if (d === 1) return { key: 'bogey', name: '柏忌' };
  if (d === 2) return { key: 'double', name: '双柏忌' };
  return { key: 'worse', name: `+${d}` };
}

/** 对标准杆：−2 / E / +3 */
export const toPar = (d: number) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `−${-d}`);

export interface HoleResult {
  par: number;
  strokes: number;
  penalties: number;
  quick: boolean;
  /** 捡起来了（没推进） */
  picked: boolean;
}

/** 结算卡：明细（分已经一洞一洞加过了，没有奖励项） */
export function settle(results: readonly HoleResult[], holes: number): { label: string; value: string }[] {
  const par = results.reduce((s, r) => s + r.par, 0);
  const strokes = results.reduce((s, r) => s + r.strokes, 0);
  const count = (k: VerdictKey[]) =>
    results.filter((r) => !r.picked && k.includes(verdict(r.par, r.strokes).key)).length;
  const lines = [
    { label: '打完', value: `${results.length} / ${holes} 洞` },
    { label: '总杆数', value: `${strokes}（标准杆 ${par}）` },
    { label: '对标准杆', value: toPar(strokes - par) },
  ];
  const under = count(['ace', 'eagle', 'birdie']);
  if (under) lines.push({ label: '小鸟以上', value: `${under} 洞` });
  lines.push({ label: '标准杆', value: `${count(['par'])} 洞` });
  const over = results.length - under - count(['par']);
  if (over) lines.push({ label: '柏忌以上', value: `${over} 洞` });
  const pen = results.reduce((s, r) => s + r.penalties, 0);
  if (pen) lines.push({ label: '罚杆（水、沙、界外）', value: `${pen}` });
  const q = results.filter((r) => r.quick).length;
  lines.push({ label: `快手奖励 × ${QUICK_BONUS}`, value: q ? `${q} 洞` : '—' });
  return lines;
}
