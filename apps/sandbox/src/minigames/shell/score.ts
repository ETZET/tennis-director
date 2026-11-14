// 小游戏壳的纯函数（不碰 DOM、three）：星级、时间格式、连击、最高分存档。score.test.ts 测它们。

/** 星级：分数够到几档阈值（[一星, 二星, 三星]，从小到大）→ 0..3 */
export function starsFor(score: number, thresholds: readonly [number, number, number]): 0 | 1 | 2 | 3 {
  let n = 0;
  for (const t of thresholds) if (score >= t) n++;
  return n as 0 | 1 | 2 | 3;
}

/** 倒计时的字：65.2 → "1:06"（向上取整，0 秒那一下才显示 0:00） */
export function clockOf(sec: number): string {
  const s = Math.max(0, Math.ceil(sec - 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 连击：上一下之后 window 秒内再来一下 → 连击数 +1，不然从 1 重新数。
 * 时间用模拟时间（mg.t），和 __mg.step 一致。
 */
export class Combo {
  value = 0;
  private last = Number.NEGATIVE_INFINITY;
  constructor(public window = 1.5) {}
  /** 来了一下（now = 模拟时间）→ 现在的连击数 */
  hit(now: number): number {
    this.value = now - this.last <= this.window ? this.value + 1 : 1;
    this.last = now;
    return this.value;
  }
  /** 断了 */
  reset() {
    this.value = 0;
    this.last = Number.NEGATIVE_INFINITY;
  }
  /** 还在不在连击的时间窗里（HUD 上显示不显示） */
  alive(now: number): boolean {
    return this.value >= 2 && now - this.last <= this.window;
  }
  /** 时间窗还剩几成（0..1，HUD 的小进度条用） */
  left(now: number): number {
    return Math.max(0, Math.min(1, 1 - (now - this.last) / this.window));
  }
}

/** 最高分存在 localStorage 的键（hub 页也读它） */
export const bestKey = (id: string) => `td-mg-${id}-best`;

/** 读最高分（隐私模式 / 存储关掉 → null） */
export function loadBest(id: string): { score: number; stars: number } | null {
  try {
    const raw = localStorage.getItem(bestKey(id));
    if (!raw) return null;
    const v = JSON.parse(raw) as { score?: unknown; stars?: unknown };
    if (typeof v.score !== 'number') return null;
    return { score: v.score, stars: typeof v.stars === 'number' ? v.stars : 0 };
  } catch {
    return null;
  }
}

/** 记最高分：比原来高才写；返回是不是新纪录 */
export function saveBest(id: string, score: number, stars: number): boolean {
  const old = loadBest(id);
  if (old && old.score >= score) return false;
  try {
    localStorage.setItem(bestKey(id), JSON.stringify({ score, stars }));
  } catch {}
  return true;
}
