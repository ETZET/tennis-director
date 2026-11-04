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
  /** 选路卡（W2）：这条路开出什么、付出什么（各一句话） */
  opens?: string;
  costs?: string;
  /** 选路卡：点过一次，镜头转过去、场景里叠着预览；再点一次才定 */
  previewing?: boolean;
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
  /** 收起来（选路卡点过一项时）：只留标题、倒计时和选项，让出画面看预览 */
  compact?: boolean;
}

/** 底部员工条上的一个人（ADR 0012）：点一下拿起来，或者按住拖到场景里的岗位、工单上 */
export interface StaffToken {
  id: string;
  name: string;
  initials: string;
  color: string;
  /** 现在在干什么："1 号场 · 青少年课"、"闲着"、"走去红土场 · 12 分钟" */
  doing: string;
  state: 'working' | 'waiting' | 'idle' | 'walking' | 'errand';
  /** 三项能力 0..100：教学、维护、服务；球员还有球技 */
  skills: { teach: number; upkeep: number; service: number; play?: number };
  /** 正拿在手上 */
  picked?: boolean;
  /** 被事件叫去办事，叫不回来 */
  locked?: boolean;
}

/** 点了场景里一个岗位或工单（手上没拿人）时，底部弹出的说明和"派谁去" */
export interface TargetSheetData {
  id: string;
  kind: 'post' | 'order';
  title: string;
  note: string;
  /** 现在的状况："Dale 在上课 · 这一圈还要 20 分钟"、"没人 · 有客人在等" */
  status: string;
  chips: Chip[];
  /** 进度 0..1（持续岗位是这一圈，工单是总进度） */
  progress?: number;
  people: {
    id: string;
    name: string;
    initials: string;
    color: string;
    /** "教学 40 · 走过去 12 分钟" */
    fit: string;
    /** 已经派到这儿（here） */
    here?: boolean;
    /** 派到这儿了，但还在路上 */
    coming?: boolean;
    /** 不能派的原因 */
    disabled?: string;
  }[];
}

/** 地点清单的一行：这个地点的一项工作（ADR 0013） */
export interface PlaceRow {
  id: string;
  kind: 'post' | 'order';
  /** 要哪项能力（球员的活是 play） */
  skill: 'teach' | 'upkeep' | 'service' | 'play';
  title: string;
  /** 一行小字："Dale 在干 · 40%"、"没人 · 有客人在等"、"$300 · 4 小时" */
  line: string;
  /** 此刻缺人（有客人在等） */
  need?: boolean;
  progress?: number;
  /** 谁派到这儿了（coming：还在路上） */
  faces: { initials: string; color: string; coming?: boolean }[];
  /** 手上拿着人时：这个人去了怎样；blocked 是派不过去的原因；best 是这个人最拿手的能力 */
  fit?: { text: string; blocked?: boolean; here?: boolean; best?: boolean };
  /** 换来什么、花什么（最多三个，先代价后收益） */
  chips?: Chip[];
  /** 还没开出来的工单：line 是怎么开出来（"先把 1 号场的裂缝补好"） */
  locked?: boolean;
  /** 标题旁的小牌（赛事的临时岗位"今天"、报名工单"报名"） */
  badge?: string;
  /** 修复变体（UI-11）：一个变体一行；点一行开预览，把人拖到那一行开工 */
  variants?: VariantRow[];
}

/** 修复工单的一个变体（"保留红土"）：名字、取舍一句话、换来和付出 */
export interface VariantRow {
  id: string;
  name: string;
  /** 取舍一句话（"磨得慢、雨天不能打"） */
  line?: string;
  /** 换来什么、付出什么（各一句话） */
  gives?: string;
  costs?: string;
  chips?: Chip[];
  /** 玩家拖向的那一行（还没开工，可以改） */
  picked?: boolean;
  /** 已经锁定（第一个人到场、买了料） */
  locked?: boolean;
  /** 场景里正叠着这个变体的预览 */
  previewing?: boolean;
  /** 手上拿着人时：派到这一行会怎样；blocked 是派不过去的原因 */
  fit?: { text: string; blocked?: boolean };
}

/** 点了场景里的地点牌：这个地点的所有工作（ADR 0013） */
export interface PlaceSheetData {
  id: string;
  title: string;
  /** 拿着人时顶上的一句（"把 Dale 派到哪儿？"） */
  prompt?: string;
  rows: PlaceRow[];
  empty?: string;
  /** 这个地点的设施状况 0..100（"状况 23 · 没人维护就会掉档"） */
  condition?: { value: number; label: string };
  /** 正在这儿办的赛事（W2）：名字、一行状况、附加目标此刻的进度 */
  event?: { title: string; line: string; goals: { id: string; text: string; met: boolean; value?: string }[] };
  /** 分期筹备（W2，表演赛四期）：每一期的名字、花费、做完没有；foot 是还差多少 */
  prep?: { title: string; foot: string; phases: { id: string; name: string; cost: string; done: boolean }[] };
}

/** 季节栏上"接下来的节拍"（UI-9）：招聘日、赛事、投资方、结算；点一下镜头转到那一处的地点牌 */
export interface BeatItem {
  id: string;
  label: string;
  /** "周六 9:00"、"明天 10:00"、"进行中" */
  when: string;
  /** 那一处的锚点 */
  place: string;
  live?: boolean;
}

/** 季节、天气、本周服务率 */
export interface SeasonInfo {
  label: string;
  /** night：晴天但天已经黑了（画月亮，不画太阳） */
  weather: 'sun' | 'night' | 'cloud' | 'rain' | 'wind';
  weatherLabel: string;
  /** 本周服务率 0..100（有客人的时候有人在岗的比例）；null = 还没有客人，服务率无从谈起 */
  service: number | null;
  serviceLabel: string;
  /** 接下来的两个日历节拍（UI-9，只读） */
  beats?: readonly BeatItem[];
}

/** 「因为……所以……」：因果日志的一条，讲给玩家听 */
export interface StoryItem {
  id: number;
  time: string;
  because: string;
  so: string;
  tone?: Tone;
}

/** 状态条的星级格（UI-8）和点开后的明细（只读） */
export interface StarInfo {
  /** 现在几星、最多几星 */
  n: number;
  max: number;
  /** 格子下面的小字（"下一星差 2 项"） */
  label: string;
  /** 明细的标题（"升到 ★3 还要"） */
  title: string;
  /** 下一星的清单：每条满足没有、现在多少 / 要多少 */
  items: { id: string; text: string; met: boolean; value?: string }[];
  /** 升上来开出什么 */
  opens?: string;
  /** 明细最下面一行（投资方期限） */
  foot?: string;
  tone?: Tone;
}

export interface HudSnapshot {
  club: { badge: string; name: string; clock: string };
  quality: { value: number; grade: Grade; trend: Trend; history: readonly number[] };
  members: number;
  courts: { open: number; total: number };
  /** 有它时状态条第三格显示董事会信心（代替开放场地数） */
  board?: { value: number; label: string; tone?: Tone };
  /** 有它时第三格是星级（UI-8，代替复原进度和董事会信心） */
  stars?: StarInfo;
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
  /** 底部员工条 */
  staff?: readonly StaffToken[];
  /** 拿着人时顶上的一行提示（"点一个岗位，把 Dale 放上去"） */
  hint?: string | null;
  sheet?: TargetSheetData | null;
  place?: PlaceSheetData | null;
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
  /** 员工条：点一下拿起 / 放下（null） */
  pick?(person: string | null): void;
  /** 按住拖到屏幕上 (x, y) 放手：落在岗位或工单上就派过去 */
  drop?(person: string, x: number, y: number): void;
  /** 底部说明里点了某个人：派到这个岗位或工单上；target 为 null 是叫他停下来 */
  assign?(person: string, target: string | null): void;
  /** 关掉说明；all 为 false 时只关单项说明、回到地点清单 */
  closeSheet?(all?: boolean): void;
  /** 地点清单里点了一行：拿着人就派过去，没拿就打开这一项的说明 */
  target?(id: string): void;
  /** 地点清单里点了变体行：拿着人就按这个变体派过去，没拿就开 / 关这个变体的预览 */
  variant?(order: string, variant: string): void;
  /** 点了季节栏上的一个节拍：镜头转到那一处的地点牌、亮一下（UI-9，只读） */
  beat?(place: string): void;
}
