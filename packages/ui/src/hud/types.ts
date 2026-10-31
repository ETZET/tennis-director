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
  /** 演示里不能选的选项 */
  disabled?: boolean;
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
  answers?: CardAnswer[];
  /** 选项下面的一行小字 */
  note?: string;
  /** 卡片上的主按钮（例如结束时的"重播"） */
  action?: { label: string; id: string };
  /** news：新闻快讯（没有选项）；decision：要你拍板 */
  kind: 'news' | 'decision';
}

export interface HudSnapshot {
  club: { badge: string; name: string; clock: string };
  quality: { value: number; grade: Grade; trend: Trend; history: readonly number[] };
  members: number;
  courts: { open: number; total: number };
  salary: { text: string; change?: string };
  headCoach: { name: string; vacant: boolean };
  /** 点开状态条后看到的明细 */
  details: readonly StatRow[];
  /** 最新的在前 */
  wire: readonly WireItem[];
  card: EventCardData | null;
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
