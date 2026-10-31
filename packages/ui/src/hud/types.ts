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

/** 小标签：选项和动作的代价、收益、耗时、成功率…… */
export interface Chip {
  text: string;
  tone?: 'cost' | 'gain' | 'loss' | 'time' | 'energy' | 'risk' | 'info';
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
  /** 这个选项会动哪些数（从内容数据自动生成） */
  chips?: Chip[];
  /** 之后可能发生什么 */
  then?: string;
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
  /** 谁来找你 */
  who?: { name: string; role: string; initials: string; color: string };
  /** 此刻和这件事有关的局面 */
  context?: Chip[];
}

/** 会所公告板上的一种便条（一种能排进日程的活动） */
export interface PlannerNote {
  id: string;
  label: string;
  /** 格子里显示的短名 */
  short: string;
  color: string;
  /** 能钉在哪些时段 */
  parts: string[];
}

/** 会所公告板：拖便条排一季的周日程 */
export interface PlannerData {
  title: string;
  subtitle: string;
  parts: { id: string; label: string }[];
  /** 周一到周日的短名 */
  days: string[];
  grid: Record<string, (string | null)[]>;
  notes: PlannerNote[];
  /** 这样排每周会怎样（随拖动实时变） */
  projection: { label: string; value: string; tone?: Tone }[];
  /** 这时候改日程花不花精力 */
  costNote: string;
  trayLabel: string;
  lockLabel: string;
  /** 季初必须排（不能关掉），季中是自己打开的（可以关） */
  required: boolean;
}

/** 点场景里的地点或人以后，围着它展开的一圈动作 */
export interface RingAction {
  id: string;
  title: string;
  note: string;
  chips: Chip[];
  /** 不能做的原因（灰掉） */
  disabled?: string;
  icon: 'wrench' | 'eye' | 'talk' | 'racket' | 'coins' | 'spade' | 'sign' | 'board' | 'walk' | 'spark';
}

export interface RingData {
  /** 屏幕坐标（像素） */
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  actions: RingAction[];
  goLabel: string;
}

/** 季节、天气、总监精力 */
export interface SeasonInfo {
  label: string;
  weather: 'sun' | 'cloud' | 'rain' | 'wind';
  weatherLabel: string;
  energy: number;
  energyLabel: string;
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
  season?: SeasonInfo;
  planner?: PlannerData | null;
  ring?: RingData | null;
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
  /** 公告板：把便条钉到某个格子（null 拿掉） */
  plan?(part: string, weekday: number, note: string | null): void;
  lockPlan?(): void;
  closePlanner?(): void;
  /** 动作圈：做这件事 / 关掉 */
  act?(id: string): void;
  closeRing?(): void;
}
