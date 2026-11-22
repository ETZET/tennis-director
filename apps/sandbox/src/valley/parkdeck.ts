// 日出公园的台地（2026-11-18 公园美术返工 G4，docs/lab/2026-11-07-3d-pixel/valley-park.md「美术返工」）。
// 平地一整片亮绿没有骨架（lessons「沙漠失败复盘」第 2 条：暗带是免费的构图工具）→ 三处主角各抬成一个台：
// 朝南的挡土墙在太阳后方时永远落暗档（一条暗带），下面一条投影。台上能走，上下走台阶（clubsite/play 的 stepUp 0.36：墙沿自己挡住）。
// 这里只有数据和高度：nav.ts（能站多高）、build.ts（旗子立多高）、detail/east.ts（画台、东西放多高）三处读同一份。
// 坐标 = 旧坐标（压紧以前，park() 的代码照这个画）；世界坐标的查询（nav、build）走 parkDeckAt / parkDeckY（减掉 relocate.ts 的 MOVE.park）。
import { MOVE } from './relocate';

export interface DeckRect {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** 台面高（米） */
  h: number;
}
/** 台阶：从 top（台沿，高 h）往 dir 方向下到地面；每级 rise 米高、run 米深 */
export interface DeckStair {
  id: string;
  /** 台沿那一边的中点 */
  x: number;
  z: number;
  /** 往哪边下：s = +z（朝南）、e = +x（朝东） */
  dir: 's' | 'e';
  /** 宽（沿台沿） */
  w: number;
  h: number;
  steps: number;
  run: number;
}

/** 三个台：公共球场（1 米，南沿 = 一条 21 行的挡土墙）、对墙练习场（1 米）、公开课的草台（0.7 米，15 行） */
export const DECKS: DeckRect[] = [
  { id: 'courts', x0: 756.2, x1: 808.4, z0: -434.6, z1: -392.4, h: 1.0 },
  { id: 'wall', x0: 813.6, x1: 832.4, z0: -428.4, z1: -406.6, h: 1.0 },
  { id: 'clinic', x0: 757, x1: 786.6, z0: -386.6, z1: -359.6, h: 0.7 },
];

/** 台阶：球场南门（x 790.06）、东门（去对墙，z −399.45）、对墙练习场南沿（小路接上来那儿）、公开课草台南沿（正对两张小网） */
export const STAIRS: DeckStair[] = [
  { id: 'courts-s', x: 790.06, z: -392.4, dir: 's', w: 2.4, h: 1.0, steps: 5, run: 0.45 },
  { id: 'courts-e', x: 808.4, z: -399.45, dir: 'e', w: 2.0, h: 1.0, steps: 5, run: 0.45 },
  { id: 'wall-s', x: 821.5, z: -406.6, dir: 's', w: 2.4, h: 1.0, steps: 5, run: 0.45 },
  { id: 'clinic-s', x: 770, z: -359.6, dir: 's', w: 2.4, h: 0.7, steps: 4, run: 0.5 },
];

/** 公园台地的外框（快速排除：别处一律 null） */
const BOUND = { x0: 755, x1: 834, z0: -436, z1: -356 };

/** 台阶的占地（世界矩形）+ 在 (x, z) 的坡面高度（台阶画成一级一级，人走的是一条斜坡） */
export function stairRect(s: DeckStair): { x0: number; x1: number; z0: number; z1: number } {
  const L = s.steps * s.run;
  return s.dir === 's'
    ? { x0: s.x - s.w / 2, x1: s.x + s.w / 2, z0: s.z, z1: s.z + L }
    : { x0: s.x, x1: s.x + L, z0: s.z - s.w / 2, z1: s.z + s.w / 2 };
}

/** 旧坐标 (x, z) 在公园的台或台阶上 → 站的高度；不在 → null */
export function parkDeckAtSrc(x: number, z: number): number | null {
  if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return null;
  for (const d of DECKS) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d.h;
  for (const s of STAIRS) {
    const r = stairRect(s);
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    const t = s.dir === 's' ? (z - r.z0) / (r.z1 - r.z0) : (x - r.x0) / (r.x1 - r.x0);
    return s.h * (1 - t);
  }
  return null;
}

/** 旧坐标的地面高度（台外 = 0）：park() 的代码用 */
export const parkDeckYSrc = (x: number, z: number): number => parkDeckAtSrc(x, z) ?? 0;
/** 世界坐标：在公园的台或台阶上 → 站的高度；不在 → null */
export const parkDeckAt = (x: number, z: number): number | null => parkDeckAtSrc(x - MOVE.park[0], z - MOVE.park[1]);
/** 世界坐标的地面高度（台外 = 0） */
export const parkDeckY = (x: number, z: number): number => parkDeckAt(x, z) ?? 0;
