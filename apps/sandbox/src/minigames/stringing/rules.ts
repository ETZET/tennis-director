// 穿线（小游戏 5）的规则：纯函数（不碰 three、DOM、Math.random），main.ts 只负责演和收输入。
// 一把拍子三步：① 竖线（光标来回扫，落在目标区里点）→ ② 拉力（按住拉，指针进客人要的磅数区间松手；混穿要拉两次）→
// ③ 横线（左 / 右交替的节拍，踩着点按）。三步的准度加权 = 这把拍子的质量；分 = 小费 × 质量 × 10。
// 客人带着取拍时限来排队，越往后来得越密；时限到了还没轮上就走人（扣分）。职业球员赶时间、小费翻倍；混穿多拉一次线、小费多一半。

/** 一局几秒 */
export const DURATION = 120;
/**
 * 一 / 二 / 三星。bot 调的（bot.ts，三个种子，穿一把 ≈ 12 秒 → 一局 8～9 把）：
 * pro（几乎全完美）2450～2710 · good（质量 ~92%）2240～2530 · ok（~75%）1720～1880 · bad（~55%）1240～1370。
 * 一星 = 手潮也能拿；二星 = 手稳；三星 = 九成以上的质量、几乎没人走。
 */
export const STARS: [number, number, number] = [1000, 1700, 2200];
/** 连击的时间窗（秒）：三步之间有交接，放宽一点 */
export const COMBO_WINDOW = 3.2;
/** 排队最多几个人（再来的就不进店了） */
export const QUEUE_MAX = 5;
/** 等不及走掉的扣分 */
export const LEAVE_PENALTY = 30;
/** 没有人走掉、至少穿好这么多把：零流失奖励 */
export const CLEAN_MIN = 4;
export const CLEAN_BONUS = 150;

export type Grade = 'perfect' | 'good' | 'miss';
export type Kind = 'normal' | 'hybrid' | 'pro';
export type Side = 'L' | 'R';
export type Phase = 'mains' | 'tension' | 'tension2' | 'crosses';

/** 每种客人：小费（元）、取拍时限（秒）、标签 */
export const KIND: Record<Kind, { tip: number; patience: number; label: string }> = {
  normal: { tip: 20, patience: 52, label: '' },
  hybrid: { tip: 30, patience: 60, label: '混穿' },
  // 职业球员：赶着上场，时限短，小费翻倍
  pro: { tip: 40, patience: 36, label: '职业·急' },
};

export interface Customer {
  id: number;
  name: string;
  kind: Kind;
  /** 竖线磅数 */
  tension: number;
  /** 横线磅数（混穿 = 竖线 − 2，别的同竖线） */
  crossTension: number;
  /** 取拍时限（秒，开始排队时） */
  patience: number;
  /** 人物变体（0..3） */
  variant: number;
}

/** 难度 0..1：随这局过去的时间涨 */
export const difficulty = (elapsed: number) => Math.min(1, Math.max(0, elapsed / DURATION));

/** 下一位客人隔几秒来：开头 13 秒一位，最后 6.5 秒一位（穿一把要十秒出头：越往后队越长，得挑着接） */
export const arrivalGap = (elapsed: number) => 13 - 6.5 * difficulty(elapsed);

/** 开局就在排的（第一位马上到，第二位 2.5 秒后） */
export const OPENING: number[] = [0, 2.5];

/** 来一位客人。rng 是种子随机流（0..1）；names 是名字池（按 id 轮着取，免得重名） */
export function makeCustomer(rng: () => number, elapsed: number, id: number, names: readonly string[]): Customer {
  const r = rng();
  // 头 15 秒只有普通客人（先学会）；之后职业 22%、混穿 25%
  const kind: Kind = elapsed < 15 ? 'normal' : r < 0.22 ? 'pro' : r < 0.47 ? 'hybrid' : 'normal';
  const tension = kind === 'pro' ? 54 + Math.floor(rng() * 9) : 46 + Math.floor(rng() * 13);
  return {
    id,
    name: names.length ? names[id % names.length] : `客人${id + 1}`,
    kind,
    tension,
    crossTension: kind === 'hybrid' ? tension - 2 : tension,
    patience: KIND[kind].patience,
    variant: Math.floor(rng() * 4),
  };
}

/** 这把拍子要走的步骤 */
export const phasesOf = (kind: Kind): Phase[] =>
  kind === 'hybrid' ? ['mains', 'tension', 'tension2', 'crosses'] : ['mains', 'tension', 'crosses'];
/** 竖线 / 横线各几根 */
export const mainsCount = (kind: Kind) => (kind === 'pro' ? 10 : 8);
export const crossCount = (kind: Kind) => (kind === 'pro' ? 10 : 8);

// ── ① 竖线：光标在 0..1 的条上来回扫 ──

export interface SweepSpec {
  /** 从一头扫到另一头几秒 */
  period: number;
  /** 目标区半宽（good）、正中半宽（perfect） */
  good: number;
  perfect: number;
}
export const sweepSpec = (d: number): SweepSpec => ({
  period: 1.05 - 0.4 * d,
  good: 0.13 - 0.04 * d,
  perfect: 0.045 - 0.012 * d,
});
/** 光标位置（三角波：0 → 1 → 0） */
export function sweepPos(t: number, period: number): number {
  const k = (((t / period) % 2) + 2) % 2;
  return k <= 1 ? k : 2 - k;
}
/** 下一根竖线的目标区中心（贴边留一点，免得扫到头才到） */
export const zoneCenter = (rng: () => number, s: SweepSpec) => {
  const m = s.good + 0.05;
  return m + rng() * (1 - 2 * m);
};
export function judgeSweep(pos: number, center: number, s: SweepSpec): Grade {
  const d = Math.abs(pos - center);
  return d <= s.perfect ? 'perfect' : d <= s.good ? 'good' : 'miss';
}

// ── ② 拉力：按住，指针从 GAUGE.min 往上走；过了 max 线就断（miss）──

export const GAUGE = { min: 30, max: 72 };
/** 磅 / 秒：越往后拉得越快 */
export const tensionRate = (d: number) => 22 + 10 * d;
/** 按住 hold 秒时的读数：先慢后快（手感：起步好控制，越拉越猛） */
export function tensionAt(hold: number, rate: number): number {
  const v = GAUGE.min + rate * (hold * 0.8 + 0.2 * hold * hold);
  return Math.min(GAUGE.max, v);
}
/** 准度：±1 磅完美、±2.5 磅还行 */
export const TENSION_OK = { perfect: 1, good: 2.5 };
export function judgeTension(v: number, target: number): Grade {
  const d = Math.abs(v - target);
  return d <= TENSION_OK.perfect ? 'perfect' : d <= TENSION_OK.good ? 'good' : 'miss';
}

// ── ③ 横线：一上一下地编，左 / 右交替的节拍 ──

/** 两拍间隔（秒） */
export const beatGap = (d: number) => 0.56 - 0.16 * d;
/** 第一拍前留多久（看清楚） */
export const BEAT_LEAD = 1.1;
/** 节拍判定窗（秒）：±0.075 完美、±0.15 还行；离最近的拍还差 0.3 以上 = 没按到点上（不算） */
export const BEAT_OK = { perfect: 0.075, good: 0.15, ignore: 0.3 };
/** 左右的顺序：一左一右交替（一上一下地编）；越往后越常插一个"连着同边"（跳一格，考反应） */
export function crossPattern(rng: () => number, n: number, d: number): Side[] {
  const out: Side[] = [];
  let s: Side = rng() < 0.5 ? 'L' : 'R';
  for (let i = 0; i < n; i++) {
    out.push(s);
    const repeat = i > 0 && out[i - 1] !== s && rng() < 0.32 * d;
    if (!repeat) s = s === 'L' ? 'R' : 'L';
  }
  return out;
}
/** 按早了 / 晚了多少秒 → 判定；null = 离得太远，不算这一拍 */
export function judgeBeat(err: number): Grade | null {
  const a = Math.abs(err);
  if (a <= BEAT_OK.perfect) return 'perfect';
  if (a <= BEAT_OK.good) return 'good';
  return null;
}

// ── 质量和收钱 ──

export const GRADE_VALUE: Record<Grade, number> = { perfect: 1, good: 0.6, miss: 0 };
export const accuracy = (gs: readonly Grade[]) =>
  gs.length ? gs.reduce((a, g) => a + GRADE_VALUE[g], 0) / gs.length : 0;
/** 质量 0..1：竖线 40%、拉力 25%、横线 35% */
export function quality(mains: readonly Grade[], tension: readonly Grade[], crosses: readonly Grade[]): number {
  return 0.4 * accuracy(mains) + 0.25 * accuracy(tension) + 0.35 * accuracy(crosses);
}
export function qualityLabel(q: number): { grade: 'S' | 'A' | 'B' | 'C'; text: string } {
  if (q >= 0.9) return { grade: 'S', text: '完美！' };
  if (q >= 0.75) return { grade: 'A', text: '很好' };
  if (q >= 0.5) return { grade: 'B', text: '还行' };
  return { grade: 'C', text: '太松了…' };
}

/** 交拍子：小费 = 底价（+5 快的：取拍时限还剩一半以上；超时 = 减半）；分 = 小费 × 质量 × 10 */
export function payout(
  kind: Kind,
  q: number,
  left: number,
  patience: number,
): { tip: number; points: number; fast: boolean; late: boolean } {
  const late = left <= 0;
  const fast = !late && left >= patience * 0.5;
  let tip = KIND[kind].tip + (fast ? 5 : 0);
  if (late) tip = Math.round(tip / 2);
  return { tip, points: Math.round(tip * q * 10), fast, late };
}

export interface Stats {
  done: number;
  tips: number;
  qualitySum: number;
  perfects: number;
  left: number;
  pros: number;
  bestCombo: number;
}
export function settle(s: Stats): {
  lines: { label: string; value: string | number }[];
  bonus: { label: string; value: number }[];
} {
  const avg = s.done ? Math.round((s.qualitySum / s.done) * 100) : 0;
  const lines = [
    { label: '穿好的拍子', value: `${s.done} 把` },
    { label: '平均质量', value: `${avg}%` },
    { label: '小费合计', value: `¥${s.tips}` },
    { label: '完美次数', value: s.perfects },
    { label: '职业球员', value: s.pros },
    { label: '最长连击', value: s.bestCombo },
    { label: '等不及走掉', value: s.left ? `${s.left} 位（−${s.left * LEAVE_PENALTY}）` : '0' },
  ];
  const bonus = s.left === 0 && s.done >= CLEAN_MIN ? [{ label: '零流失', value: CLEAN_BONUS }] : [];
  return { lines, bonus };
}
