// 座位：看台的座椅条和观众都按这里的格子排（座位边 = 0.56 米的整数倍，座椅条的板缝正好落在两人之间）。
// 世界坐标；北看台的人朝 +z（镜头），东看台朝 −x（场地），南看台朝 −z（背对镜头）。
import { CROWD, northTread, STANDS, tier } from '../../layout';

export const P = STANDS.seatPitch;
/** 座椅条（每级踏面后半，靠着上一级的立面）：座面 0.4 高、0.38 深；靠背 0.12 厚、0.78 高 */
export const SEAT = { panH: 0.4, panD: 0.38, backT: 0.12, backH: 0.78 } as const;
/** 人坐在座面中间：离踏面后沿多远 */
export const SIT_BACK = SEAT.backT + SEAT.panD / 2;

export type StandId = 'north' | 'east' | 'south';

/** 一段连续的座位（同一排，被走道 / 看台两头截断）：沿 a 轴从 a0 到 a1（座位边，0.56 的整数倍） */
export interface SeatRun {
  stand: StandId;
  row: number;
  a0: number;
  a1: number;
  /** 座面高（踏面高） */
  y: number;
  /** 踏面后沿（北：z；东：x；南：z） */
  back: number;
}

/** 北看台走道的半宽 */
export const AISLE_HALF = STANDS.aisleW / 2;

/** x0…x1 去掉北看台走道以后的几段 */
export function northRuns(x0: number, x1: number): [number, number][] {
  const out: [number, number][] = [];
  let a = x0;
  for (const c of STANDS.aisles) {
    if (c - AISLE_HALF > a) out.push([a, c - AISLE_HALF]);
    a = c + AISLE_HALF;
  }
  if (x1 > a) out.push([a, x1]);
  return out;
}

/** 把一段 [a, b] 缩到整座位（边落在 0.56 的整数倍上，两头留 ≥ 0.1 米） */
const snap = (a: number, b: number): [number, number] => [Math.ceil((a + 0.1) / P) * P, Math.floor((b - 0.1) / P) * P];

/** 所有座椅条 */
export function seatRuns(): SeatRun[] {
  const out: SeatRun[] = [];
  const N = STANDS.north;
  for (let k = 0; k < N.n; k++) {
    const t = northTread(k);
    for (const [a, b] of northRuns(N.x0, N.x1)) {
      const [a0, a1] = snap(a, b);
      if (a1 - a0 >= P) out.push({ stand: 'north', row: k, a0, a1, y: t.y, back: t.zb });
    }
  }
  const E = STANDS.east;
  for (let k = 0; k < E.n; k++) {
    const t = tier(k, E.rise, E.deep);
    // 东看台南头（z −12）留 0.6 米给端部，北头（z −30）贴着北看台留 0.6
    const [a0, a1] = snap(E.z0 + 0.5, E.z1 - 0.5);
    out.push({ stand: 'east', row: k, a0, a1, y: t.top, back: E.front + t.b });
  }
  const S = STANDS.south;
  for (let k = 0; k < S.n; k++) {
    const t = tier(k, S.rise, S.deep);
    const [a0, a1] = snap(S.x0 + 0.5, S.x1 - 0.5);
    out.push({ stand: 'south', row: k, a0, a1, y: t.top, back: S.front + t.b });
  }
  return out;
}

/** 一个座位（人坐的位置：座面中心，世界坐标）+ 它属于 CROWD 的哪一块（−1 = 不在任何块里，空着） */
export interface Seat {
  x: number;
  y: number;
  z: number;
  rotY: number;
  stand: StandId;
  row: number;
  /** CROWD 的块号 */
  block: number;
  /** 这一段里的第几个座位（成组用） */
  i: number;
  /** 这一段的编号 */
  run: number;
}

export function seatList(runs = seatRuns()): Seat[] {
  const out: Seat[] = [];
  runs.forEach((r, ri) => {
    const n = Math.round((r.a1 - r.a0) / P);
    for (let i = 0; i < n; i++) {
      const a = r.a0 + (i + 0.5) * P;
      const block = CROWD.findIndex((b) => b.stand === r.stand && a >= b.a0 && a < b.a1 && (b.fill[r.row] ?? 0) > 0);
      const y = r.y + SEAT.panH;
      if (r.stand === 'north')
        out.push({ x: a, y, z: r.back + SIT_BACK, rotY: 0, stand: r.stand, row: r.row, block, i, run: ri });
      else if (r.stand === 'east')
        out.push({ x: r.back - SIT_BACK, y, z: a, rotY: -Math.PI / 2, stand: r.stand, row: r.row, block, i, run: ri });
      else out.push({ x: a, y, z: r.back - SIT_BACK, rotY: Math.PI, stand: r.stand, row: r.row, block, i, run: ri });
    }
  });
  return out;
}

/**
 * 人浪的坐标（米）：沿马蹄形绕一圈 —— 北看台从西往东（x −20 → 20 = 0…40），东看台从北往南（42…60），
 * 南看台从东往西（62…98）。人浪按这个坐标往前推，竖屏里正好横着扫过北看台。
 */
export const WAVE_LOOP = 100;
export function waveCoord(s: Seat): number {
  if (s.stand === 'north') return s.x + 20;
  if (s.stand === 'east') return 42 + (s.z + 30);
  return 62 + (18 - s.x);
}
