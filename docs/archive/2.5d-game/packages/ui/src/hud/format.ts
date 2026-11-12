import type { Grade, Trend } from './types';

/** 项目质量 0..100 → 等级。 */
export const grade = (q: number): Grade => (q >= 85 ? 'A' : q >= 70 ? 'B' : q >= 55 ? 'C' : q >= 40 ? 'D' : 'F');

/** 等级底色（深字压在上面）。 */
export const GRADE_COLOR: Record<Grade, string> = {
  A: '#93c27a',
  B: '#c3d36a',
  C: '#e3b21a',
  D: '#f0913a',
  F: '#ff6b52',
};

/** 最近 10 个采样的走势；结束后固定为"见底"。 */
export function trend(history: readonly number[], ended: boolean): Trend {
  if (ended) return 'bottomed';
  if (history.length <= 10) return 'flat';
  const d = (history[history.length - 1] ?? 0) - (history[history.length - 11] ?? 0);
  return d < -0.2 ? 'falling' : d > 0.2 ? 'recovering' : 'flat';
}

/** 游戏内的分:秒，例如 45 → "0:45"。 */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 质量曲线的折线点（SVG 坐标，y 向下）。少于 60 个采样时按 60 个的宽度画，曲线从左边长出来。
 */
export function sparkPoints(history: readonly number[], w: number, h: number, pad = 4): string {
  const n = Math.max(60, history.length);
  const step = w / (n - 1);
  const y = (v: number) => (h - pad - (v / 100) * (h - 2 * pad)).toFixed(1);
  return history.map((v, i) => `${(i * step).toFixed(1)},${y(v)}`).join(' ');
}
