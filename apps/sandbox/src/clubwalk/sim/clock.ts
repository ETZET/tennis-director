// 观察模式的时钟：引擎的分钟（整数，一步一分钟）+ 两步之间的零头（画面插值用），加速档位，跳到某个时刻。
// 引擎的分钟就是天光的时刻（clubsite/daylight）：中午最亮、傍晚开灯，见 mount.ts 的 syncDaylight。
import type { Minute } from '../../clubsite/sim/types';

/**
 * 加速档位（游戏分钟 / 真实秒）。默认 2×：一天（6:30–23:15）八分钟多放完，走路（引擎 12 米 / 游戏分钟）画面上 24 米 / 秒，
 * 像延时摄影，看得出谁从停车场走过来、谁去吃饭。0.2 = 慢放（跟着一个人看走路）；15×、60× 是快进（路上的人一晃而过）。
 * 路上的人怎么迈腿不看档位，看画面上真走多快（motion.ts 的 stepGait：慢放下小跑、2× 跑、15× 起冲，脚都不溜）。
 */
export const SPEEDS = [0.2, 1, 2, 5, 15, 60] as const;
export const SPEED_LABEL: Record<number, string> = { 0.2: '慢', 1: '1×', 2: '2×', 5: '5×', 15: '15×', 60: '60×' };
/** 观察的默认档 */
export const DEFAULT_SPEED = 2;
/** 到这一档就是快进：寻路、换装的预算收紧（人进出画面太快），路上的人借身子先不换装 */
export const FAST = 15;

/** 跳到的时刻（设计文档：7:00、12:00、16:00、19:00） */
export const JUMPS: readonly Minute[] = [7 * 60, 12 * 60, 16 * 60, 19 * 60];

/** 一个固定步长里最多推几步（卡了一下以后不追太多，免得一帧里算几十分钟） */
const MAX_STEPS = 3;

export class SimClock {
  /** 游戏分钟 / 真实秒 */
  speed = DEFAULT_SPEED;
  paused = false;
  /** 还没推的零头（0..1 分钟）：画面在两步之间插值 */
  frac = 0;

  /** 过了 dt 真实秒：这一下要推几步引擎 */
  tick(dt: number): number {
    if (this.paused) return 0;
    this.frac += dt * this.speed;
    const n = Math.min(MAX_STEPS, Math.floor(this.frac));
    this.frac -= Math.floor(this.frac);
    return n;
  }
}

export const hhmm = (m: number) => {
  const t = ((Math.floor(m) % 1440) + 1440) % 1440;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** 这个时辰在俱乐部里叫什么（设计文档第三节的节奏表） */
export function periodOf(m: number): string {
  const h = m / 60;
  if (h < 6.5) return '清早 · 员工到';
  if (h < 8.5) return '早场';
  if (h < 11.5) return '上午';
  if (h < 13.5) return '午饭';
  if (h < 15.5) return '午后 · 最热';
  if (h < 17) return '放学 · 青训';
  if (h < 20) return '晚场';
  if (h < 22) return '晚饭 · 酒吧';
  return '关门';
}
