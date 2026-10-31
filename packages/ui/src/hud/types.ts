/**
 * HUD 读的状态快照。界面层只读快照、只发命令（HudActions），不碰画面层和演出。
 * M0 由 sandbox 的写死剧情拼出快照；M1 起由模拟核心的状态投影出来。
 */

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type Trend = 'falling' | 'recovering' | 'flat' | 'bottomed';
export type Tone = 'bad' | 'good' | 'pickle';

export interface StatRow {
  label: string;
  value: string;
  tone?: Tone;
}

export interface WireItem {
  id: number;
  /** 游戏内时间，例如 "4:12" */
  time: string;
  text: string;
  /** 要紧的事（会员退会、人事变动）高亮 */
  hot?: boolean;
}

export interface CardAnswer {
  /** 数字键 1、2、3 */
  key: 1 | 2 | 3;
  text: string;
  /** 已经选定（倒计时结束或玩家按了键） */
  chosen?: boolean;
  /** 不能选的选项（条件不满足、钱不够；演示里不走的那几项） */
  disabled?: boolean;
  /** 要先走过去才能选：按下去总监出发，到了自动选定 */
  walk?: boolean;
  /** 选项下面的一行小字：花费、成功率、要去哪儿 */
  hint?: string;
}

/** 转播下三分之一的事件卡：话题标签、地点标签、标题、倒计时、三个编号选项。 */
export interface EventCardData {
  id: string;
  topic: string;
  location: string;
  headline: string;
  body?: string;
  /** 剩余比例 0..1 和显示的剩余时间（游戏内时间） */
  countdown?: { ratio: number; label: string };
  /** 快讯卡自动收起前剩下的比例 0..1（卡片底部一条细线） */
  timer?: number;
  answers?: CardAnswer[];
  /** 选项下面的一行小字 */
  note?: string;
  /** 卡片上的主按钮（例如结束时的"重播"） */
  action?: { label: string; id: string };
  /** news：新闻快讯（没有选项）；decision：要你拍板 */
  kind: 'news' | 'decision';
  /** 后面还排着几张卡 */
  more?: number;
}

/** 「因为……所以……」：因果日志的一条，讲给玩家听 */
export interface StoryItem {
  id: number;
  time: string;
  because: string;
  so: string;
  tone?: Tone;
}

export interface HudSnapshot {
  club: { badge: string; name: string; clock: string };
  quality: { value: number; grade: Grade; trend: Trend; history: readonly number[] };
  members: number;
  courts: { open: number; total: number };
  /** 有它时状态条第三格显示董事会信心（代替开放场地数） */
  board?: { value: number; label: string; tone?: Tone };
  /** 状态条第四格；label 不填就是"你的薪水" */
  salary: { text: string; change?: string; label?: string; tone?: Tone };
  headCoach: { name: string; vacant: boolean };
  /** 点开状态条后看到的明细 */
  details: readonly StatRow[];
  /** 最新的在前 */
  wire: readonly WireItem[];
  card: EventCardData | null;
  /** 记分牌下面的一行状态，例如"正在走去 1 号场 · 还要 12 分钟" */
  status?: string | null;
  /** 俱乐部报告里的"来龙去脉"（最新的在前） */
  story?: readonly StoryItem[];
  controls: { paused: boolean; speed: string };
}

export interface HudActions {
  rotate(dir: -1 | 1): void;
  togglePause(): void;
  cycleSpeed(): void;
  /** 事件卡选项（数字键 1–3 也会走这里） */
  answer(key: 1 | 2 | 3): void;
  /** 事件卡上的主按钮 */
  cardAction(id: string): void;
}
