// 俱乐部的一天：人物模拟的契约（冻结；改之前先改 docs/design/club-sim.md）。
//
// 这一层回答"这个人今天来不来、几点到、在哪、干什么、几点走"。纯数据 + 纯函数（规则 clubsim-is-pure）：
// 不碰 three / DOM / Math.random / Date.now；状态可序列化（JSON 往返不变）；同样的种子 + 同样的输入 → 一模一样的一天。
// 画面（clubwalk/sim）只读快照、只订阅事件：人走到哪、摆什么姿势由画面决定，人在不在、在干什么由这里决定。
//
// 时间单位：游戏分钟（一天里的第几分钟，0 = 00:00）。一步 = 1 分钟。营业 OPEN..CLOSE，员工早到晚走。
// 地点只按名字（PlaceId）引用；x/z 只用来估路上走多久，画面的站位在 clubwalk/sim/spots.ts。
import type { Activity, CastPerson, SceneId } from '../cast/types';

export type Minute = number;
export type PlaceId = string;
export type AgentId = string;

// ── 地点 ──────────────────────────────────────────────────────────────────────────

/**
 * 地点的种类（决定谁会来、来了干什么、要不要人服务）。
 * entry 出入口（停车场的车、落客点、走路来的路口）· desk 前台签到 · court 网球场 · pickle 匹克球场 · lesson 青训 / 课
 * stand 看台 / 场边座 · seat 长椅、树荫、喷泉边 · stall 摊位（点单处）· table 吃饭的座 · cafe 咖啡吧 · bar 酒吧 · shop 店（专卖、纪念品、穿线、便利）
 * gym 健身房 · locker 更衣室 · pool 泳池（水里）· lounger 躺椅 · golf 高尔夫 · play 孩子玩的地方（喷泉、池边）
 * post 员工的岗位 · staff 员工休息处（不对客人开放）
 */
export type PlaceKind =
  | 'entry'
  | 'desk'
  | 'court'
  | 'pickle'
  | 'lesson'
  | 'stand'
  | 'seat'
  | 'stall'
  | 'table'
  | 'cafe'
  | 'bar'
  | 'shop'
  | 'gym'
  | 'locker'
  | 'pool'
  | 'lounger'
  | 'golf'
  | 'play'
  | 'post'
  | 'staff';

/** 模拟里的"在干什么"（比 cast 的 Activity 细；toCastActivity 折回去给"在想什么"挑台词） */
export type Doing =
  | 'arrive' // 下车 / 进门的那一下
  | 'leave' // 往出入口走、上车
  | 'travel' // 在路上
  | 'queue' // 排队（签到、点单、等场）
  | 'checkin' // 在柜台签到
  | 'tennis' // 打网球（单打 / 双打）
  | 'pickle' // 打匹克球
  | 'lesson' // 上课（学员）
  | 'coach' // 上课（教练）
  | 'warmup' // 拉伸、热身、换鞋
  | 'watch' // 看球
  | 'rest' // 坐着歇
  | 'chat' // 站着 / 坐着聊天（一伙人）
  | 'order' // 在摊位前点单、取餐
  | 'eat' // 坐着吃
  | 'drink' // 喝（站着 / 坐着）
  | 'shop' // 逛店、买东西、取拍子
  | 'gym' // 健身
  | 'change' // 更衣、冲澡
  | 'swim' // 游泳
  | 'sunbathe' // 躺椅上晒太阳
  | 'golf' // 打高尔夫
  | 'kidplay' // 孩子玩（喷泉拨水、池边）
  | 'work' // 员工在岗位上干活
  | 'break'; // 员工歇班、吃饭

export interface Place {
  id: PlaceId;
  scene: SceneId;
  kind: PlaceKind;
  /** 中文名（调试、报告、名册"在哪儿"）："2 号红土场""塔可车" */
  name: string;
  /** 世界坐标（米，clubsite/world.ts 那一套）：只用来估走路的时间 */
  x: number;
  z: number;
  /** 同时能有几个人在这里"干这件事"（场 = 4，长椅 = 2，桌 = 4，摊位窗口 = 1……） */
  cap: number;
  /** 能排几个人的队（0 / 不给 = 不排队：满了就去别处） */
  queue?: number;
  /** 在这里默认干什么 */
  doing: Doing;
  /** 要员工在岗才开（摊位、咖啡吧、救生员不在泳池关）：岗位地点的 id */
  needs?: PlaceId;
  /** 要总监在才服务（前台签到）：不在就慢慢自己来（见 club-sim.md「总监」） */
  director?: boolean;
  /**
   * 窗口边等餐的位置（摊位、咖啡吧这种点单的窗口才有）：点完单（spot 0，doing 'order'）站到窗口旁边等取餐，
   * 还在 occupants 里、doing 还是 'order'，spot = cap + k（k = 0..pickup−1，画面按 k 挑窗口边的站位）。不给 = 点完直接拿走
   */
  pickup?: number;
  /** 停车场（entry）的车位数：开车来的一伙人占一个车位，从下车到开走（见 club-sim.md「停车」） */
  stalls?: number;
  /** 一个人在这里待多久（分钟，[最少, 最多]；不给按 doing 的默认） */
  stay?: [number, number];
  /** 几点到几点开（不给 = 营业时间） */
  open?: [Minute, Minute];
  /** 只给谁用（员工的岗位、休息处 = 'staff'；青训 = 'kid'……） */
  for?: readonly ('staff' | 'member' | 'guest' | 'kid' | 'parent' | 'coach' | 'pro')[];
  /** 室内 / 有遮阴（中午热的时候人往这儿去） */
  shade?: boolean;
  /** 一伙人一起用（场地、桌子）：一伙人占一个，不和陌生人拼 */
  party?: boolean;
  /**
   * 看台、场边长椅看得到的场（看球的人只在这几处此刻有人在打、或者马上开打的时候来；没人打了就起身）。
   * 没有 faces 的地方不能"看球"（在那儿只是坐着歇）
   */
  faces?: readonly PlaceId[];
}

// ── 人 ────────────────────────────────────────────────────────────────────────────

/**
 * 怎么来的（一伙人一样）：lotN / lotS 自己停在北 / 南停车场（占一个车位，stall 是第几个）；
 * valet 停车场满了或者 VIP，在代客落客点把车交给泊车员（车开去场外）；drop 别人开车送到落客点放下（孩子、家长送）；
 * walk 走路来（东头车道）；staff 员工、摊主、球员停在员工区（画面上不占客人的车位，从南停车场那边走进来）
 */
export type CarMode = 'lotN' | 'lotS' | 'valet' | 'drop' | 'walk' | 'staff';

/** 一伙一起来、一起走的人（夫妻、一家人、约好的双打四个人） */
export interface Party {
  id: string;
  members: AgentId[];
  /** 谁拿主意（大人）：一伙人跟着他走 */
  lead: AgentId;
}

/** 日程里的一项：想去哪类地方、干什么、大概几点、待多久 */
export interface Intent {
  doing: Doing;
  /** 指定的地方（员工岗位、约好的场）；不给 = 到时候按 kinds 挑一个合适的 */
  at?: PlaceId;
  kinds?: readonly PlaceKind[];
  /** 最早几点开始（约好的课、比赛）；不给 = 上一项完了就去 */
  after?: Minute;
  /** 想待多久（分钟） */
  minutes: number;
  /** 必须的（员工的班、约好的课）：满了就等；不是必须的满了就跳过 */
  must?: boolean;
  /** 吃点零食（吉事果、冰棍、奶茶、果昔）：只去卖零食的窗口，不算一顿饭 */
  snack?: boolean;
}

/** 人此刻的处境 */
export type Where =
  | { kind: 'away' } // 不在俱乐部
  | { kind: 'travel'; from: PlaceId; to: PlaceId; t0: Minute; t1: Minute } // 在路上（t0 出发，t1 到）
  | { kind: 'queue'; at: PlaceId; since: Minute } // 在某处排队（队里第几个看 Snapshot）
  | { kind: 'at'; at: PlaceId; since: Minute; until: Minute }; // 在某处干事

export interface Needs {
  /** 0..100：饿、渴、累（越大越想吃 / 喝 / 歇）；热 = 外面的热（天和时辰算的，不在人身上） */
  hunger: number;
  thirst: number;
  tired: number;
}

export interface Agent {
  id: AgentId;
  /** cast 里的人（named / regular 的 id，客人是模拟生成的 'guest:sim:<day>:<n>'） */
  person: string;
  role: CastPerson['role'];
  party?: string;
  /** 今天几点到、最晚几点走 */
  arrive: Minute;
  leaveBy: Minute;
  /** 从哪个出入口来、回哪去（停车场满了到的时候会改成代客落客点） */
  entry: PlaceId;
  /** 怎么来的（一伙人一样）；停车场停满了，到的那一分钟改成 valet */
  car?: CarMode;
  /** 停在 lotN / lotS 的第几个车位（0..stalls−1，一伙人同一个；到的时候分，走了就空出来） */
  stall?: number;
  /** 剩下的日程（第一项是正在做的或下一件） */
  plan: Intent[];
  where: Where;
  doing: Doing;
  needs: Needs;
  /** 还能等几分钟（排队、等场；用完就放弃这一项） */
  patience: number;
  /** 今天的经历（报告、以后的心情）：等了多久、放弃了几次、被总监接待了没有 */
  day: {
    waited: number;
    gaveUp: number;
    served: boolean;
    played: number;
    ate: boolean;
    /** 上一顿正餐吃完的时刻（两小时里不再吃正餐，只买零食、饮料） */
    ateAt?: Minute;
    /** 日程空了、离走还早，补了几次"去会所 / 阴凉处坐坐"（最多两次，之后才回家） */
    fill?: number;
  };
  /** 今天已经记过一笔的"想干没干成"（doing + 地点种类）：同一件事只记一次，不刷屏 */
  missed?: string[];
  /** 在 at 地点里占的第几个位置（0..cap−1；进去时挑最小的空位，待到走都不变，画面按它站）。排队、路上不用 */
  spot?: number;
  /**
   * 最近去过的地方 [地点, 几点进去的]（客人、球员；只留四个钟头以内的）：同一处两小时最多去两回、
   * 零食窗口一小时一回，不在一个窗口前打转（第 2 轮 critique 7）
   */
  visits?: [PlaceId, Minute][];
}

// ── 状态、输入、输出 ──────────────────────────────────────────────────────────────

export interface Weather {
  /** 摄氏度（中午最高；沙漠的夏天 40+，冬天 20 出头） */
  high: number;
  /** 下雨 / 起风沙：室外的场、泳池没人 */
  rain: boolean;
  wind: boolean;
}

export interface SimState {
  seed: number;
  /** 第几天（从 1 开始，第 1 天是周一） */
  dayNo: number;
  minute: Minute;
  weather: Weather;
  agents: Record<AgentId, Agent>;
  parties: Record<string, Party>;
  /** 每个地点的队（按先来后到，AgentId） */
  queues: Record<PlaceId, AgentId[]>;
  /** 每个地点此刻有谁（在这里干事的，不含排队的） */
  occupants: Record<PlaceId, AgentId[]>;
  /** 今天的事件（报告用；画面也可以订阅 step 的返回） */
  log: SimEvent[];
  /** 模拟自己生成的人（今天的客人 'guest:sim:<天>:<n>'、第二班顶岗 'staff:sim:…'）：CAST.get 找不到他们，画面换装从这里拿（engine 的 personOf） */
  people?: Record<string, import('../cast/types').CastPerson>;
}

/** 每一步的输入：总监在哪（只有站在会因为他而变的地方才算，比如前台），以后加命令 */
export interface SimInput {
  director: PlaceId | null;
}

export type EventKind =
  | 'arrive' // 进了俱乐部
  | 'leave' // 走了
  | 'start' // 开始干一件事（at、doing）
  | 'end' // 干完
  | 'queue' // 排上了队
  | 'served' // 被服务（签到、拿到餐）
  | 'gaveUp' // 等不下去，放弃了这一项
  | 'full' // 想去的地方满了，换了地方 / 跳过
  | 'shift'; // 员工上岗 / 下岗

export interface SimEvent {
  t: Minute;
  kind: EventKind;
  agent: AgentId;
  at?: PlaceId;
  doing?: Doing;
  /** 一句话（报告、因果日志）："等了 14 分钟没人签到，自己按了铃" */
  note?: string;
}

/** 画面读的一个人此刻的样子（模拟每一步算一次） */
export interface AgentView {
  id: AgentId;
  person: string;
  party?: string;
  doing: Doing;
  where: Where;
  /** 在 at 地点里是第几个位置（0..cap−1，画面按它挑站位）；排队的 = 队里第几个 */
  spot: number;
  /** 一起干这件事的人（同一块场上的、同一张桌的） */
  with: AgentId[];
}

export interface SimConfig {
  seed: number;
  places: readonly Place[];
  /** 演员表（clubsite/cast 的 CAST）：named、regular 从这里拿；客人用 makePerson 生成 */
  cast: import('../cast/types').Cast;
  /** 走路速度（米 / 游戏分钟，默认 WALK_M_PER_MIN = 12：观察 2× 时画面上 24 米 / 秒，看得见人走）；路程 = 直线距离 × 1.35 */
  walk?: number;
  /** 员工位置 → 岗位（places.ts 的 POST_OF_SLOT，键 '<scene>:<slot>'）：员工、摊主、教练上哪个岗 */
  posts?: Readonly<Record<string, PlaceId>>;
}

/** 引擎（sim/engine.ts 实现） */
export interface SimApi {
  /** 新的一天：按种子、周几、天气给每个人排日程（谁来、几点、一伙人、想干什么）；minute = 员工最早到之前 */
  startDay(cfg: SimConfig, dayNo: number, weather?: Weather): SimState;
  /** 推一分钟：返回新状态（不改传进来的）和这一分钟的事件 */
  step(cfg: SimConfig, s: SimState, input: SimInput): { state: SimState; events: SimEvent[] };
  /** 画面要的快照 */
  view(s: SimState): AgentView[];
}

/** 折回 cast 的 Activity（"在想什么"挑台词） */
export const TO_CAST_ACTIVITY: Record<Doing, Activity> = {
  arrive: 'walk',
  leave: 'walk',
  travel: 'walk',
  queue: 'wait',
  checkin: 'wait',
  tennis: 'play',
  pickle: 'play',
  lesson: 'play',
  coach: 'work',
  warmup: 'idle',
  watch: 'watch',
  rest: 'rest',
  chat: 'idle',
  order: 'wait',
  eat: 'eat',
  drink: 'eat',
  shop: 'idle',
  gym: 'gym',
  change: 'idle',
  swim: 'swim',
  sunbathe: 'swim',
  golf: 'play',
  kidplay: 'idle',
  work: 'work',
  break: 'rest',
};
