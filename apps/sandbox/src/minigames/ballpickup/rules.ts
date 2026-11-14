// 捡球冲刺的规则（纯函数，不碰 three / DOM；rules.test.ts 测）：分数、星级线、课后的球怎么散。

/** 一局几秒 */
export const DURATION = 90;
/** 场上几个球 */
export const BALLS = 40;
/** 捡球器装几个就满 */
export const CAP = 12;
/** 连击的时间窗（秒）：上一个球之后这么快捡到下一个算连着 */
export const COMBO_WINDOW = 1.3;
/** 星级线 */
export const STARS: [number, number, number] = [400, 800, 1200];

/** 捡一个球的分：10 分底 + 连击（第 2 个起每多连一个 +5，最多 +20） */
export const pickPoints = (combo: number) => 10 + 5 * Math.min(Math.max(combo - 1, 0), 4);
/** 倒进球车：每个球 +5 */
export const DUMP_PER_BALL = 5;
/** 结算：每倒一趟 +30 */
export const TRIP_BONUS = 30;
/** 结算：全部进车（清场）+150，剩下的每秒 +5 */
export const CLEAR_BONUS = 150;
export const CLEAR_PER_SEC = 5;

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * 课后的球：一团一团的（喂球练习打回来的球滚到一起、停在网前和底线后），再撒几个零散的。
 * rng 给 [0, 1)；ok(x, z) = 这里能放球（能走到、不压着网和杆、离球车够远）。球和球至少隔 minGap 米。
 */
export function scatterBalls(
  rng: () => number,
  area: Rect,
  ok: (x: number, z: number) => boolean,
  n = BALLS,
  opts: { clumps?: number; perClump?: [number, number]; minGap?: number; netX?: number } = {},
): [number, number][] {
  const out: [number, number][] = [];
  const gap = opts.minGap ?? 0.34;
  const far = (x: number, z: number) => out.every(([a, b]) => Math.hypot(a - x, b - z) >= gap);
  const tryPut = (x: number, z: number) => {
    if (x < area.x0 || x > area.x1 || z < area.z0 || z > area.z1) return false;
    if (!ok(x, z) || !far(x, z)) return false;
    out.push([x, z]);
    return true;
  };
  const W = area.x1 - area.x0;
  const D = area.z1 - area.z0;
  const clumps = opts.clumps ?? 6;
  const [lo, hi] = opts.perClump ?? [3, 6];
  // 团：一半贴着网（喂球练习的球多停在网前），一半在两边的场地里
  for (let c = 0; c < clumps && out.length < n; c++) {
    let cx = area.x0 + rng() * W;
    const cz = area.z0 + 0.8 + rng() * (D - 1.6);
    if (opts.netX !== undefined && c % 2 === 0) cx = opts.netX + (rng() < 0.5 ? -1 : 1) * (0.7 + rng() * 1.4);
    const k = lo + Math.floor(rng() * (hi - lo + 1));
    let put = 0;
    for (let t = 0; t < k * 12 && put < k && out.length < n; t++) {
      const a = rng() * Math.PI * 2;
      const r = 0.25 + rng() * 1.1;
      if (tryPut(cx + Math.cos(a) * r * 1.3, cz + Math.sin(a) * r * 0.8)) put++;
    }
  }
  // 零散的
  for (let t = 0; t < n * 60 && out.length < n; t++) tryPut(area.x0 + rng() * W, area.z0 + rng() * D);
  return out;
}

export interface Tally {
  picked: number;
  delivered: number;
  trips: number;
  bestCombo: number;
  total: number;
  timeLeft: number;
}

/** 结算：明细 + 奖励 */
export function settle(t: Tally): {
  lines: { label: string; value: string }[];
  bonus: { label: string; value: number }[];
} {
  const bonus: { label: string; value: number }[] = [];
  if (t.trips > 0) bonus.push({ label: `倒车 ${t.trips} 趟 × ${TRIP_BONUS}`, value: t.trips * TRIP_BONUS });
  if (t.delivered >= t.total) {
    bonus.push({ label: '清场奖励', value: CLEAR_BONUS });
    const s = Math.floor(Math.max(0, t.timeLeft));
    if (s > 0) bonus.push({ label: `剩 ${s} 秒 × ${CLEAR_PER_SEC}`, value: s * CLEAR_PER_SEC });
  }
  const lines = [
    { label: '捡起', value: `${t.picked} / ${t.total}` },
    { label: '进了球车', value: `${t.delivered}` },
    { label: '最长连击', value: t.bestCombo >= 2 ? `×${t.bestCombo}` : '—' },
  ];
  if (t.picked > t.delivered) lines.push({ label: '捡球器里没倒的', value: `${t.picked - t.delivered}（不算）` });
  return { lines, bonus };
}
