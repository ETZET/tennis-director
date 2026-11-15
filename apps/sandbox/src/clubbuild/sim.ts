// clubbuild 的模拟：纯函数式状态机（照 CLAUDE.md 的模拟规则写，虽然只是 sandbox 的思想实验）。
// 输入状态 + 命令 / 时间，输出新状态 + 领域事件；状态可序列化（只有数字、字符串、数组、普通对象），
// 不碰 three、DOM，不用 Math.random —— 随机数的种子在状态里（state.rng，mulberry32 一步一步往下走）。
//
// ═══ 对外接口（UI / 美术照这个写）═══════════════════════════════════════════════
//
// 状态 State（新加的）
//   lotRows: number          开放了南边几行（大门在南边）；openRowStart(s) = LOT_D − lotRows，row ≥ 它的才能建
//   members: number          会员数（每天收盘结算：+今天办卡的 −2% 流失）；会员每天交会费、30% 的人每天来打球
//   fame: number             名气（俱乐部赛办成一次 +1，每点每天多来 FAME_VISITORS 位）
//   bestNet: number          历史最好的单日净收入（星级目标看它）
//   buzz: number             今天的口碑乘数（昨天客满走掉 >30% 时 0.9，否则 1）
//   Placed.lv: 1|2|3         设施等级；Placed.served: 累计接过几位客人（到了、花了钱才算）
//
// 命令 Command
//   {type:'place', id, col, row, rot?}      摆（扣建造费）
//   {type:'remove', uid}                    拆（退一半）；大石头 = 清理（花 clearCost，退负数）；绿洲、老棕榈拆不掉
//   {type:'clear', uid}                     清理大石头（同上，只认能清的地形）
//   {type:'upgrade', uid}                   升级（看 upgradeInfo）
//
// 事件 SimEvent（新加的 / 改了的）
//   rejected      { reason: 旧的代码集合, text: 中文原因 }（没开放的地也报 reason 'bounds'，text 写清楚）
//   upgraded      { uid, lv, cost }
//   memberJoined  { count: 1, vid }         一位客人逛满两处、办了卡（实时，按人发；会员数收盘时才加进 state.members）
//   parcelOpened  { rows: [from, to], features: uid[] }   升星时地块往北开放；rows 含两端；features = 新开放行里的地形
//   starUp        { star, unlocked, rows }  rows = 升星后的 lotRows
//   clubCup       { day, held, fans, prize, fame, need }  周日收盘时发：办成没有（need = 没办成的原因）
//   daySettled    旧字段不变，另加：
//                 prize        俱乐部赛奖金（平常 0；已经算进 money，不算进 net）
//                 dues         会费 = 会员 × MEMBER_FEE（已经算进 income 和 net）
//                 members      { joined, left, total }
//                 forecast     明天的预计 Forecast（= min(吸引来的, 接得下的)）
//                 diff         和昨天比 { income, net, visitors, items: {label, amount, text}[] }（最多 3 条，按变化大小）；第一天 null
//                 blocking     true = 要弹整张卡（每 7 天的周报、升星、亏钱、发现新组合）；false = 不挡游戏的日报条
//                 hint         离下一颗星最近的一项（= nextGoalHint）
//
// 函数
//   placeError(s, def, col, row, rot, free?) → string | null    中文短句："被占了"、"钱不够 $X"、"★N 解锁"、"这块地还没开放 · ★N"……
//   placeErrorCode(...) / canPlace(s, id, col, row, rot) → PlaceError | null   代码（'bounds' | 'parcel' | 'overlap' | 'locked' | 'money' | 'unknown' | 'terrain'）
//   comboPreview(s, id, col, row, rot) → {name, known, combo, uid}[]   name 没发现过 = '？？？'；位置不合法（出界/没开放/被占）= []
//   upgradeInfo(s, uid) → {can, cost, nextLv, need?} | null            null = 不能升级（不是接客设施 / 已满级 / 没这个 uid）
//   starProgress(s) → {star, next: {key, label, have, need, done}[], done, goal, items} | null   star = 下一颗星；满星 null
//   nextGoalHint(s) → string                                            下一颗星第一个没完成的项，一句能照做的话
//   openRowStart(s) → number；rowOpen(s, row) → boolean；starForRow(row) → 哪一星开放这一行
//   forecast(s) → {demand, capacity, visitors, away}                    visitorsPerDay(s) = forecast(s).visitors；demandPerDay(s) 没取整的吸引来的
//   dayInfo(s, day?) → {dow, name, tag, cup, cupReady, need}            一周日历（周三青训日、周末家庭日、周日俱乐部赛）
//   capOf(p) / spendOf(s, p) / appealOf(s, p) / activeComboKinds(s)
//   terrainVariant(seed)、TERRAIN_VARIANTS（地形的几套摆法）
//
// ═══ 规则（开罗式）═══════════════════════════════════════════════════════════
// - 摆设施：在开放的地块里、不压别的东西、星级够、钱够；当场扣钱。步道 1×1，可以连刷。拆掉退一半。
// - 建造：BUILD_SECONDS 秒建好（'built'）；建好时看相邻的组合（catalog COMBOS），第一次凑成的组合 = 新发现。
// - 客人：每天来多少 = (基础 + 会员 × 0.3 + 名气 + 吸引力总和) × 停车场 × 口碑 × 赛事日；吸引力 = 设施的 appeal + 组合 + 等级
//   + 装饰光环（2 格内的装饰/地形，最多 +4）。客人类型按"能当第一站"的设施吸引的客群加权抽，再乘一周的客群倍数。
//   第一站只能是球场、泳池（赛事日加上看台）；餐饮、球具店、会所、看台只接"顺路"的第二站（SECOND_STOP 的概率）。
//   每位客人挑一个吸引他、有空位、走得到的设施（占一个位子，从走过去起就占），到了就花钱（'visitorSpend'），待一会儿。
//   逛满两处的客人有 MEMBER_P 的概率办卡成会员。
// - 走得到：设施的门格旁边（门格四邻、在占地外面）有一块步道，这块步道沿着步道连到大门（地块南边正中）。
// - 钱只在三处变：客人花钱（马上进账）、每天收盘（会费、扣维护费、俱乐部赛奖金）、玩家自己的建造 / 拆除 / 升级 / 清理。
// - 每天收盘（'daySettled'）后看星级目标（STAR_GOALS），够了就升星（'starUp'），解锁新设施、地块往北开放（'parcelOpened'）。
import {
  type AnyDef,
  BUILDINGS,
  COMBOS,
  type Combo,
  DAY_SECONDS,
  DEFS,
  type Guest,
  LOT_D,
  LOT_ROWS_BY_STAR,
  LOT_W,
  LV_APPEAL,
  LV_AT,
  LV_CAP,
  LV_COST,
  LV_MUL,
  MAX_LV,
  STAR_GOALS,
  START_MONEY,
  type StarGoal,
  TILE,
  WEEK_MIX,
  WEEK_TAG,
  WEEKDAYS,
} from './catalog';

export type Rot = 0 | 1 | 2 | 3;
export type Tile = [number, number];

/** 大门：南边正中两格（row LOT_D-1），永远算步道、不能建东西 */
export const GATE_ROW = LOT_D - 1;
export const GATE_COLS = [LOT_W / 2 - 1, LOT_W / 2] as const;
/** 建一座设施要几秒（游戏秒） */
export const BUILD_SECONDS = 2;
/** 客人走路：每秒几格（游戏秒；演出按同样的速度走，到门口正好赶上花钱） */
export const WALK_TPS = 2.5;
/** 大门外那段路（格）：客人从画面下沿走进来、走出去，走路时间算上它 */
export const ROAD_TILES = 5;
/** 一天（time 0..1）对应的钟点：7:00 开门，18:00 收盘（再晚天就暗了） */
export const DAY_START_HOUR = 7;
export const DAY_HOURS = 11;
export const hourOf = (time: number) => DAY_START_HOUR + time * DAY_HOURS;
/** 一天里开门迎客的时段（一天 0..1）：这之外不来新客人 */
export const OPEN_FROM = 0.03;
export const OPEN_TO = 0.82;
/** 迎客的秒数（估容量用） */
const OPEN_SEC = (OPEN_TO - OPEN_FROM) * DAY_SECONDS;
/** 每天的客人数 = (BASE_VISITORS + 会员 × MEMBER_VISIT + 名气 × FAME_VISITORS + 吸引力总和 × APPEAL_K) × 乘数 */
export const BASE_VISITORS = 4;
export const APPEAL_K = 0.5;
/** 去第二个地方的概率 */
export const SECOND_STOP = 0.7;
/** 拆除退款比例 */
export const REFUND = 0.5;
/** 装饰光环：多远（格，切比雪夫间隔）、每座设施最多加多少 */
export const AURA_RANGE = 2;
export const AURA_CAP = 4;
/** 停车场：每个让当天客人 ×(1 + PARKING_MUL)，最多算 PARKING_MAX 个 */
export const PARKING_MUL = 0.08;
export const PARKING_MAX = 3;
/** 客满走掉的超过当天客人的这个比例 → 明天口碑 BUZZ_BAD */
export const AWAY_SHARE = 0.3;
export const BUZZ_BAD = 0.9;
/** 会员：逛满两处的客人办卡概率、每位会员每天来的概率、每天流失 */
export const MEMBER_P = 0.15;
export const MEMBER_VISIT = 0.3;
export const MEMBER_CHURN = 0.02;
/** 会费：每位会员每天交多少（收盘时进账，算进当天收入；会员越多越稳 —— Hot Springs 式的复利） */
export const MEMBER_FEE = 5;
/** 名气：每点每天多来几位 */
export const FAME_VISITORS = 2;
/** 俱乐部赛（周日）：要几片正式球场（不算练习墙）+ 看台；客人倍数；奖金 = 底 + 每位球迷 */
export const CUP_COURTS = 2;
export const CUP_MUL = 1.3;
export const CUP_PRIZE = 300;
export const CUP_PER_FAN = 15;
/** 日志最多留几条 */
const LOG_MAX = 40;

/** 在一处待多久（游戏秒），按标签 */
const STAY_BY_TAG: Record<string, number> = {
  court: 9,
  pool: 9,
  stand: 8,
  house: 6,
  shop: 4,
  food: 5,
};
export function stayOf(def: AnyDef): number {
  for (const t of def.tags) if (STAY_BY_TAG[t] !== undefined) return STAY_BY_TAG[t];
  return 5;
}

export interface Placed {
  uid: number;
  id: string;
  col: number;
  row: number;
  rot: Rot;
  /** 第几天放下的 */
  builtAt: number;
  /** 建造进度 0..1（1 = 建好） */
  build: number;
  /** 等级 1..MAX_LV */
  lv: number;
  /** 累计接过几位客人（到了、花了钱的） */
  served: number;
}

export interface Visitor {
  vid: number;
  guest: Guest;
  /** 要去的设施（uid），stops[i] 是现在这一站 */
  stops: number[];
  i: number;
  /** walk = 正往 stops[i] 走；stay = 在 stops[i] 待着；out = 往大门走 */
  stage: 'walk' | 'stay' | 'out';
  /** 这一段还剩几秒 */
  t: number;
}

export interface DayStats {
  income: number;
  visitors: number;
  /** 来了但没位子走掉的 */
  turnedAway: number;
  /** 每个设施今天赚了多少 / 接了几位 */
  byUid: Record<number, { income: number; guests: number }>;
  /** 组合加成（和等级加成）多赚的 */
  comboBonus: number;
  /** 今天办卡的 */
  joined: number;
  /** 今天来的球迷 */
  fans: number;
  /** 今天第一次发现的组合数 */
  found: number;
}

/** 昨天的账（和今天比用） */
export interface DayBook {
  income: number;
  /** 会费 */
  dues: number;
  upkeep: number;
  net: number;
  visitors: number;
  /** 按设施种类：收入、建好的座数 */
  byId: Record<string, { income: number; n: number }>;
}

export interface LogEntry {
  day: number;
  text: string;
}

export interface State {
  seed: number;
  /** mulberry32 的内部状态（32 位） */
  rng: number;
  money: number;
  day: number;
  /** 一天里的时刻 0..1（1 = 收盘） */
  time: number;
  star: number;
  totalVisitors: number;
  nextUid: number;
  nextVid: number;
  placed: Placed[];
  /** 发现过的组合 id（揭晓过名字的；星级目标不看它，看 activeComboKinds） */
  combos: string[];
  /** 凑成的每一对：`${combo}:${aUid}:${bUid}` */
  pairs: string[];
  visitors: Visitor[];
  today: DayStats;
  /** 来客的累加器（满 1 来一位） */
  arrivalAcc: number;
  log: LogEntry[];
  /** 开放了南边几行 */
  lotRows: number;
  members: number;
  /** 会员流失的小数累加器 */
  memberAcc: number;
  fame: number;
  bestNet: number;
  /** 今天的口碑乘数 */
  buzz: number;
  yesterday: DayBook | null;
}

export type Command =
  | { type: 'place'; id: string; col: number; row: number; rot?: Rot }
  | { type: 'remove'; uid: number }
  | { type: 'clear'; uid: number }
  | { type: 'upgrade'; uid: number };

/** 摆放校验的代码（placeError 给中文，这里给代码） */
export type PlaceError = 'unknown' | 'terrain' | 'bounds' | 'parcel' | 'overlap' | 'locked' | 'money';
/** rejected 事件的 reason（旧代码集合；没开放的地报 'bounds'，地形报 'gate'，详细原因看 text） */
export type RejectReason = 'unknown' | 'bounds' | 'overlap' | 'locked' | 'money' | 'missing' | 'gate';

export interface Forecast {
  /** 吸引来的 */
  demand: number;
  /** 一天大约接得下的（第一站的位子 × 翻台次数） */
  capacity: number;
  /** 预计 = min(demand, capacity) */
  visitors: number;
  /** 预计客满走掉的 */
  away: number;
}

export interface DiffItem {
  label: string;
  amount: number;
  /** "新的球具店 +$280" */
  text: string;
}

export type SimEvent =
  | { type: 'placed'; uid: number; id: string; cost: number }
  | { type: 'rejected'; reason: RejectReason; text: string }
  | { type: 'removed'; uid: number; id: string; refund: number }
  | { type: 'built'; uid: number; id: string }
  | { type: 'upgraded'; uid: number; lv: number; cost: number }
  | { type: 'comboFound'; combo: string; uids: [number, number]; first: boolean }
  | { type: 'visitorArrive'; vid: number; guest: Guest; to: number }
  | { type: 'visitorSpend'; vid: number; uid: number; amount: number; bonus: number }
  | { type: 'visitorGo'; vid: number; from: number; to: number | null }
  | { type: 'visitorLeave'; vid: number }
  | { type: 'turnedAway'; guest: Guest }
  | { type: 'memberJoined'; count: number; vid: number }
  | {
      type: 'daySettled';
      day: number;
      income: number;
      upkeep: number;
      net: number;
      visitors: number;
      turnedAway: number;
      reasons: string[];
      prize: number;
      /** 会费（已经算进 income） */
      dues: number;
      members: { joined: number; left: number; total: number };
      forecast: Forecast;
      diff: { income: number; net: number; visitors: number; items: DiffItem[] } | null;
      blocking: boolean;
      hint: string;
    }
  | { type: 'clubCup'; day: number; held: boolean; fans: number; prize: number; fame: number; need: string }
  | { type: 'starUp'; star: number; unlocked: string[]; rows: number }
  | { type: 'parcelOpened'; rows: [number, number]; features: number[] };

export interface Result {
  state: State;
  events: SimEvent[];
}

// ── 随机数（种子在状态里） ──────────────────────────────

/** mulberry32 走一步：返回 [0,1) 并更新 s.rng（s 是已经复制过的状态） */
function rand(s: State): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let r = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

function pickWeighted<T>(s: State, items: T[], w: (t: T) => number): T | null {
  let sum = 0;
  for (const it of items) sum += Math.max(0, w(it));
  if (sum <= 0) return null;
  let x = rand(s) * sum;
  for (const it of items) {
    x -= Math.max(0, w(it));
    if (x < 0) return it;
  }
  return items[items.length - 1] ?? null;
}

// ── 地块开放 ────────────────────────────────────────────

export const rowsForStar = (star: number) => LOT_ROWS_BY_STAR[Math.min(star, LOT_ROWS_BY_STAR.length - 1)] ?? LOT_D;
/** 开放的第一行（北边的界）：row ≥ 它的才能建 */
export const openRowStart = (s: State) => LOT_D - s.lotRows;
export const rowOpen = (s: State, row: number) => row >= openRowStart(s);
/** 这一行几星开放 */
export function starForRow(row: number): number {
  for (let k = 0; k < LOT_ROWS_BY_STAR.length; k++) if (row >= LOT_D - LOT_ROWS_BY_STAR[k]) return k;
  return LOT_ROWS_BY_STAR.length;
}

// ── 地形（按 seed 选一套）─────────────────────────────────

type Item = { id: string; col: number; row: number; rot?: Rot };

/**
 * 地形的几套摆法（手摆的）：大多在北边锁着的地里，开放时才"露出来"能用；南边开局那块地里放一块大石头，
 * 挡着第二片球场的好位置（清掉 $400，或者绕开它）。不和 STARTER 重叠。
 */
export const TERRAIN_VARIANTS: Item[][] = [
  [
    // 东边的绿洲、西边一排老棕榈（都在 ★2 那片）；石头一块在开局地里（挡着第二片球场）、一块在 ★3 那片（挡着横放的红土）
    { id: 'oasis', col: 12, row: 6 },
    { id: 'old-palm', col: 2, row: 8 },
    { id: 'old-palm', col: 3, row: 8 },
    { id: 'old-palm', col: 4, row: 8 },
    { id: 'boulder', col: 12, row: 12 },
    { id: 'boulder', col: 6, row: 1 },
  ],
  [
    // 西边的绿洲（★2），东边一列老棕榈（★2）
    { id: 'oasis', col: 2, row: 6 },
    { id: 'old-palm', col: 16, row: 6 },
    { id: 'old-palm', col: 16, row: 7 },
    { id: 'old-palm', col: 16, row: 8 },
    { id: 'boulder', col: 11, row: 14 },
    { id: 'boulder', col: 13, row: 1 },
  ],
  [
    // 绿洲在东北角（★3 才开放），老棕榈在 ★2 那片的南沿，★2 那片还有一块石头
    { id: 'oasis', col: 15, row: 0 },
    { id: 'old-palm', col: 11, row: 9 },
    { id: 'old-palm', col: 12, row: 9 },
    { id: 'old-palm', col: 13, row: 9 },
    { id: 'boulder', col: 14, row: 16 },
    { id: 'boulder', col: 3, row: 6 },
  ],
];
export const terrainVariant = (seed: number) =>
  (((Math.floor(seed) % TERRAIN_VARIANTS.length) + TERRAIN_VARIANTS.length) % TERRAIN_VARIANTS.length) as number;

// ── 开局 ────────────────────────────────────────────────

const emptyDay = (): DayStats => ({
  income: 0,
  visitors: 0,
  turnedAway: 0,
  byUid: {},
  comboBonus: 0,
  joined: 0,
  fans: 0,
  found: 0,
});

export function newState(
  seed = 23,
  opts: { money?: number; day?: number; star?: number; terrain?: boolean; lotRows?: number } = {},
): State {
  const star = opts.star ?? 0;
  const s: State = {
    seed,
    rng: (seed * 2654435761) >>> 0,
    money: opts.money ?? START_MONEY,
    day: opts.day ?? 1,
    time: 0,
    star,
    totalVisitors: 0,
    nextUid: 1,
    nextVid: 1,
    placed: [],
    combos: [],
    pairs: [],
    visitors: [],
    today: emptyDay(),
    arrivalAcc: 0,
    log: [],
    lotRows: opts.lotRows ?? rowsForStar(star),
    members: 0,
    memberAcc: 0,
    fame: 0,
    bestNet: 0,
    buzz: 1,
    yesterday: null,
  };
  if (opts.terrain === false) return s;
  return withLayout(s, TERRAIN_VARIANTS[terrainVariant(seed)]);
}

/**
 * 开局的小布局（都在南边开放的地里）：一片硬地 + 从大门进来的步道 + 门口几棵棕榈 + 一辆咖啡车
 * （离球场远，组合留给玩家发现）。不花钱、直接建好。
 */
export const STARTER: Item[] = [
  { id: 'court-hard', col: 1, row: 11 },
  { id: 'cafe', col: 16, row: 22 },
  { id: 'palm', col: 7, row: 24 },
  { id: 'palm', col: 7, row: 20 },
  { id: 'palm', col: 10, row: 21 },
  ...pathLine(8, 16, 8, 24),
  ...pathLine(9, 16, 9, 24),
  ...pathLine(4, 23, 7, 23),
  ...pathLine(10, 24, 17, 24),
];

/** 一段直的步道（含两端） */
export function pathLine(c0: number, r0: number, c1: number, r1: number): { id: string; col: number; row: number }[] {
  const out: { id: string; col: number; row: number }[] = [];
  const n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
  for (let i = 0; i <= n; i++)
    out.push({
      id: 'path',
      col: c0 + Math.round(((c1 - c0) * i) / Math.max(1, n)),
      row: r0 + Math.round(((r1 - r0) * i) / Math.max(1, n)),
    });
  return out;
}

/** 把一组设施直接摆好建好（开局、地形、测试用）：不扣钱、不看星级和开放的地、不发事件；组合也直接算上（不算"发现"） */
export function withLayout(state: State, items: Item[]): State {
  const s = clone(state);
  for (const it of items) {
    const def = DEFS[it.id];
    if (!def) continue;
    const rot = it.rot ?? 0;
    if (placeErrorCode(s, def, it.col, it.row, rot, true)) continue;
    s.placed.push({
      uid: s.nextUid++,
      id: it.id,
      col: it.col,
      row: it.row,
      rot,
      builtAt: s.day,
      build: 1,
      lv: 1,
      served: 0,
    });
  }
  for (const p of s.placed) for (const e of newPairs(s, p)) s.pairs.push(e.key);
  return s;
}

// ── 网格几何 ────────────────────────────────────────────

/** 转过以后的占地（格） */
export function footprint(def: AnyDef, rot: Rot): { w: number; d: number } {
  return rot % 2 ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
}

export interface Rect {
  c0: number;
  r0: number;
  /** 不含 */
  c1: number;
  r1: number;
}
export function rectOf(def: AnyDef, col: number, row: number, rot: Rot): Rect {
  const { w, d } = footprint(def, rot);
  return { c0: col, r0: row, c1: col + w, r1: row + d };
}

/** 占地里相对中心的偏移（格，rot 0 的本地 x/z）转 rot 次 90°（three 的 rotation.y：+z → +x） */
export function rotXZ(x: number, z: number, rot: Rot): [number, number] {
  let a = x;
  let b = z;
  for (let i = 0; i < rot; i++) [a, b] = [b, -a];
  return [a, b];
}

/** 门格（转过以后的地块坐标） */
export function doorTile(p: { id: string; col: number; row: number; rot: Rot }): Tile {
  const def = DEFS[p.id];
  const ox = def.door[0] + 0.5 - def.w / 2;
  const oz = def.door[1] + 0.5 - def.d / 2;
  const [x, z] = rotXZ(ox, oz, p.rot);
  const { w, d } = footprint(def, p.rot);
  return [Math.round(p.col + x + w / 2 - 0.5), Math.round(p.row + z + d / 2 - 0.5)];
}

/** 格子中心 → 世界坐标（米，地块中心是原点） */
export function tileCenter(col: number, row: number): [number, number] {
  return [(col + 0.5 - LOT_W / 2) * TILE, (row + 0.5 - LOT_D / 2) * TILE];
}
/** 设施占地中心 → 世界坐标 */
export function placedCenter(p: { id: string; col: number; row: number; rot: Rot }): [number, number] {
  const { w, d } = footprint(DEFS[p.id], p.rot);
  return [(p.col + w / 2 - LOT_W / 2) * TILE, (p.row + d / 2 - LOT_D / 2) * TILE];
}
/** 世界坐标 → 格子（不管出没出界） */
export function worldToTile(x: number, z: number): Tile {
  return [Math.floor(x / TILE + LOT_W / 2), Math.floor(z / TILE + LOT_D / 2)];
}

export const inLot = (c: number, r: number) => c >= 0 && r >= 0 && c < LOT_W && r < LOT_D;
export const isGate = (c: number, r: number) => r === GATE_ROW && (GATE_COLS as readonly number[]).includes(c);

/** 占用表：每格 = 占着它的 uid，0 = 空，-1 = 大门（地形也占格） */
export function occupancy(state: State): Int32Array {
  const occ = new Int32Array(LOT_W * LOT_D);
  for (const c of GATE_COLS) occ[GATE_ROW * LOT_W + c] = -1;
  for (const p of state.placed) {
    const r = rectOf(DEFS[p.id], p.col, p.row, p.rot);
    for (let y = r.r0; y < r.r1; y++) for (let x = r.c0; x < r.c1; x++) if (inLot(x, y)) occ[y * LOT_W + x] = p.uid;
  }
  return occ;
}

const byUid = (s: State, uid: number) => s.placed.find((p) => p.uid === uid);
const isTerrainDef = (def: AnyDef) => def.cat === 'terrain';
const nameOf = (id: string) => DEFS[id]?.name ?? id;

// ── 摆放 ────────────────────────────────────────────────

/** 能不能放（代码；null = 能）；free = 不看钱、星级、开放的地（开局布局、地形） */
export function placeErrorCode(
  state: State,
  def: AnyDef | undefined,
  col: number,
  row: number,
  rot: Rot,
  free = false,
): PlaceError | null {
  if (!def) return 'unknown';
  if (!free && def.buildable === false) return 'terrain';
  const r = rectOf(def, col, row, rot);
  if (r.c0 < 0 || r.r0 < 0 || r.c1 > LOT_W || r.r1 > LOT_D) return 'bounds';
  if (!free && r.r0 < openRowStart(state)) return 'parcel';
  const occ = occupancy(state);
  for (let y = r.r0; y < r.r1; y++) for (let x = r.c0; x < r.c1; x++) if (occ[y * LOT_W + x] !== 0) return 'overlap';
  if (!free && def.star > state.star) return 'locked';
  if (!free && state.money < def.cost) return 'money';
  return null;
}

/** 能不能放（中文短句；null = 能）："被占了"、"钱不够 $X"、"★N 解锁"、"这块地还没开放 · ★N" */
export function placeError(
  state: State,
  def: AnyDef | undefined,
  col: number,
  row: number,
  rot: Rot,
  free = false,
): string | null {
  const code = placeErrorCode(state, def, col, row, rot, free);
  if (!code || !def) return code ? '没有这种设施' : null;
  return placeErrorText(code, def, row);
}

function placeErrorText(code: PlaceError, def: AnyDef, row: number): string {
  switch (code) {
    case 'unknown':
      return '没有这种设施';
    case 'terrain':
      return '这个不能建';
    case 'bounds':
      return '超出地块';
    case 'parcel':
      return `这块地还没开放 · ★${starForRow(row)}`;
    case 'overlap':
      return '被占了';
    case 'locked':
      return `★${def.star} 解锁`;
    case 'money':
      return `钱不够 $${def.cost}`;
  }
}

export function canPlace(state: State, id: string, col: number, row: number, rot: Rot = 0): PlaceError | null {
  return placeErrorCode(state, DEFS[id], col, row, rot);
}

const reject = (state: State, reason: RejectReason, text: string): Result => ({
  state,
  events: [{ type: 'rejected', reason, text }],
});

/** 执行一条命令（摆 / 拆 / 清理 / 升级） */
export function apply(state: State, cmd: Command): Result {
  if (cmd.type === 'place') {
    const def = DEFS[cmd.id];
    const rot = cmd.rot ?? 0;
    const err = placeErrorCode(state, def, cmd.col, cmd.row, rot);
    if (err || !def) {
      const reason: RejectReason = err === 'parcel' ? 'bounds' : err === 'terrain' || !err ? 'unknown' : err;
      return reject(state, reason, def && err ? placeErrorText(err, def, cmd.row) : '没有这种设施');
    }
    const s = clone(state);
    const p: Placed = {
      uid: s.nextUid++,
      id: def.id,
      col: cmd.col,
      row: cmd.row,
      rot,
      builtAt: s.day,
      build: 0,
      lv: 1,
      served: 0,
    };
    s.money -= def.cost;
    s.placed.push(p);
    // 步道当场铺好（不算建造、不凑组合）
    if (def.cat === 'road') p.build = 1;
    return { state: s, events: [{ type: 'placed', uid: p.uid, id: p.id, cost: def.cost }] };
  }
  if (cmd.type === 'upgrade') {
    const info = upgradeInfo(state, cmd.uid);
    if (!info) return reject(state, 'missing', '不能升级');
    if (!info.can) return reject(state, state.money < info.cost ? 'money' : 'locked', info.need ?? '还不能升级');
    const s = clone(state);
    const p = byUid(s, cmd.uid) as Placed;
    s.money -= info.cost;
    p.lv = info.nextLv;
    log(s, `${nameOf(p.id)}升到 Lv${p.lv}（$${info.cost}）`);
    return { state: s, events: [{ type: 'upgraded', uid: p.uid, lv: p.lv, cost: info.cost }] };
  }
  // remove / clear
  const p0 = byUid(state, cmd.uid);
  if (!p0) return reject(state, 'missing', '已经没了');
  const def = DEFS[p0.id];
  let refund = Math.floor(def.cost * REFUND);
  if (isTerrainDef(def)) {
    const cc = def.cat === 'terrain' ? def.clearCost : undefined;
    if (cc === undefined) return reject(state, 'gate', `${def.name}拆不掉`);
    if (!rowOpen(state, p0.row)) return reject(state, 'bounds', `这块地还没开放 · ★${starForRow(p0.row)}`);
    if (state.money < cc) return reject(state, 'money', `钱不够 $${cc}`);
    refund = -cc;
  } else if (cmd.type === 'clear') return reject(state, 'missing', '这个不用清理');
  const s = clone(state);
  const p = byUid(s, cmd.uid) as Placed;
  const events: SimEvent[] = [];
  s.money += refund;
  s.placed = s.placed.filter((q) => q.uid !== p.uid);
  s.pairs = s.pairs.filter((k) => {
    const [, a, b] = k.split(':');
    return Number(a) !== p.uid && Number(b) !== p.uid;
  });
  events.push({ type: 'removed', uid: p.uid, id: p.id, refund });
  if (refund < 0) log(s, `清掉了${def.name}（$${-refund}）`);
  // 正往这里走 / 在这里待着的客人：直接回家
  for (const v of s.visitors) {
    if (v.stage !== 'out' && v.stops[v.i] === p.uid) {
      v.stage = 'out';
      v.t = 4;
      events.push({ type: 'visitorGo', vid: v.vid, from: p.uid, to: null });
    }
    // 计划里的后一站被拆了：去掉
    v.stops = v.stops.filter((u, k) => k <= v.i || u !== p.uid);
  }
  return { state: s, events };
}

// ── 升级 ────────────────────────────────────────────────

/** 能不能升级：null = 不能升（不是接客设施 / 已满级 / 没这个 uid）；need = 还差什么（中文） */
export function upgradeInfo(
  s: State,
  uid: number,
): { can: boolean; cost: number; nextLv: number; need?: string } | null {
  const p = byUid(s, uid);
  if (!p) return null;
  const def = DEFS[p.id];
  if (def.cap <= 0 || isTerrainDef(def) || p.lv >= MAX_LV) return null;
  const nextLv = p.lv + 1;
  const cost = Math.round(def.cost * LV_COST[nextLv - 1]);
  let need: string | undefined;
  if (p.build < 1) need = '还在建';
  else if (p.served < LV_AT[nextLv - 1]) need = `再接 ${LV_AT[nextLv - 1] - p.served} 位客人`;
  else if (s.money < cost) need = `钱不够 $${cost}`;
  return { can: !need, cost, nextLv, ...(need ? { need } : {}) };
}

// ── 路 ──────────────────────────────────────────────────

/** 设施要不要连到路才能营业（有客位的、停车场） */
export function needsPath(def: AnyDef): boolean {
  return def.cap > 0 || def.tags.includes('parking');
}

/** 步道格（含大门）：1 = 是 */
function pathGrid(state: State): Uint8Array {
  const g = new Uint8Array(LOT_W * LOT_D);
  for (const c of GATE_COLS) g[GATE_ROW * LOT_W + c] = 1;
  for (const p of state.placed) if (p.id === 'path') g[p.row * LOT_W + p.col] = 1;
  return g;
}

const N4: Tile[] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** 设施门口能进出的步道格（门格的四邻，在占地外面、是步道） */
function entries(p: Placed, grid: Uint8Array): Tile[] {
  const [dc, dr] = doorTile(p);
  const r = rectOf(DEFS[p.id], p.col, p.row, p.rot);
  const out: Tile[] = [];
  for (const [ax, ay] of N4) {
    const c = dc + ax;
    const w = dr + ay;
    if (!inLot(c, w)) continue;
    if (c >= r.c0 && c < r.c1 && w >= r.r0 && w < r.r1) continue;
    if (grid[w * LOT_W + c]) out.push([c, w]);
  }
  return out;
}

/** 步道上 BFS：从 sources 到最近的 goal，返回经过的格（含两端）；走不通 null */
function bfs(grid: Uint8Array, sources: Tile[], goals: Tile[]): Tile[] | null {
  if (!sources.length || !goals.length) return null;
  const goal = new Set(goals.map(([c, r]) => r * LOT_W + c));
  const prev = new Int32Array(LOT_W * LOT_D).fill(-2);
  const q: number[] = [];
  for (const [c, r] of sources) {
    const k = r * LOT_W + c;
    if (prev[k] !== -2) continue;
    prev[k] = -1;
    q.push(k);
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    if (goal.has(k)) {
      const path: Tile[] = [];
      for (let x = k; x !== -1; x = prev[x]) path.push([x % LOT_W, Math.floor(x / LOT_W)]);
      return path.reverse();
    }
    const c = k % LOT_W;
    const r = Math.floor(k / LOT_W);
    for (const [ax, ay] of N4) {
      const nc = c + ax;
      const nr = r + ay;
      if (!inLot(nc, nr)) continue;
      const nk = nr * LOT_W + nc;
      if (prev[nk] !== -2 || !grid[nk]) continue;
      prev[nk] = k;
      q.push(nk);
    }
  }
  return null;
}

const gateTiles = (): Tile[] => GATE_COLS.map((c) => [c, GATE_ROW] as Tile);

/**
 * 路线（格）：from / to = 设施 uid，null = 大门。设施那头从门格算起 / 到门格为止。走不通 null。
 * 模拟按它的长度算走多久；演出按它走 —— 两边用同一条路。
 */
export function route(state: State, from: number | null, to: number | null): Tile[] | null {
  const grid = pathGrid(state);
  const ends = (uid: number | null): { tiles: Tile[]; door: Tile | null } => {
    if (uid === null) return { tiles: gateTiles(), door: null };
    const p = byUid(state, uid);
    if (!p) return { tiles: [], door: null };
    return { tiles: entries(p, grid), door: doorTile(p) };
  };
  const a = ends(from);
  const b = ends(to);
  const mid = bfs(grid, a.tiles, b.tiles);
  if (!mid) return null;
  return [...(a.door ? [a.door] : []), ...mid, ...(b.door ? [b.door] : [])];
}

/** 从大门走得到的设施（uid；不含步道和地形） */
export function reachableSet(state: State): Set<number> {
  const grid = pathGrid(state);
  // 从大门洪泛一遍
  const seen = new Uint8Array(LOT_W * LOT_D);
  const q: number[] = [];
  for (const [c, r] of gateTiles()) {
    seen[r * LOT_W + c] = 1;
    q.push(r * LOT_W + c);
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    const c = k % LOT_W;
    const r = Math.floor(k / LOT_W);
    for (const [ax, ay] of N4) {
      const nc = c + ax;
      const nr = r + ay;
      if (!inLot(nc, nr)) continue;
      const nk = nr * LOT_W + nc;
      if (seen[nk] || !grid[nk]) continue;
      seen[nk] = 1;
      q.push(nk);
    }
  }
  const out = new Set<number>();
  for (const p of state.placed) {
    if (p.id === 'path' || isTerrainDef(DEFS[p.id])) continue;
    if (entries(p, grid).some(([c, r]) => seen[r * LOT_W + c])) out.add(p.uid);
  }
  return out;
}

/** 建好了、要路却走不到的设施（头上显示"没有路"） */
export function unreachable(state: State): number[] {
  const ok = reachableSet(state);
  return state.placed
    .filter((p) => p.build >= 1 && p.id !== 'path' && needsPath(DEFS[p.id]) && !ok.has(p.uid))
    .map((p) => p.uid);
}

// ── 组合 ────────────────────────────────────────────────

/** 两块占地之间隔几格（切比雪夫；贴着 = 0） */
export function gap(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.c0 - b.c1, b.c0 - a.c1);
  const dy = Math.max(0, a.r0 - b.r1, b.r0 - a.r1);
  return Math.max(dx, dy);
}

const rectP = (p: { id: string; col: number; row: number; rot: Rot }) => rectOf(DEFS[p.id], p.col, p.row, p.rot);

/** combo 在 (x 当 a, y 当 b) 这一对上成立吗 */
function comboHolds(c: Combo, x: { id: string }, y: { id: string }, g: number): boolean {
  return DEFS[x.id].tags.includes(c.a) && DEFS[y.id].tags.includes(c.b) && g <= (c.range ?? 1);
}

const pairKey = (c: Combo, a: number, b: number) =>
  c.a === c.b ? `${c.id}:${Math.min(a, b)}:${Math.max(a, b)}` : `${c.id}:${a}:${b}`;

/** p 和别的已建好的设施新凑成的组合（还没记进 state.pairs 的） */
function newPairs(s: State, p: Placed): { key: string; combo: Combo; a: number; b: number }[] {
  const out: { key: string; combo: Combo; a: number; b: number }[] = [];
  if (p.id === 'path') return out;
  const rp = rectP(p);
  for (const q of s.placed) {
    if (q.uid === p.uid || q.build < 1 || q.id === 'path') continue;
    const g = gap(rp, rectP(q));
    if (g > 2) continue;
    for (const c of COMBOS) {
      for (const [x, y] of [
        [p, q],
        [q, p],
      ] as const) {
        if (!comboHolds(c, x, y, g)) continue;
        const key = pairKey(c, x.uid, y.uid);
        if (s.pairs.includes(key) || out.some((o) => o.key === key)) continue;
        out.push({ key, combo: c, a: x.uid, b: y.uid });
      }
    }
  }
  return out;
}

/**
 * 摆在这里会凑成哪些组合（放置时的提示）：每个（组合, 对方设施）一条。
 * name = 没发现过的组合是 '？？？'（光圈照样亮，名字建好那一刻揭晓）；combo 是真身（演出要用，别显示它的名字）。
 * 位置不合法（出界 / 没开放 / 被占 / 地形）时为空；钱不够、星级不够照样预览。
 */
export function comboPreview(
  state: State,
  id: string,
  col: number,
  row: number,
  rot: Rot,
): { name: string; known: boolean; combo: Combo; uid: number }[] {
  const def = DEFS[id];
  if (!def || def.cat === 'road') return [];
  const err = placeErrorCode(state, def, col, row, rot);
  if (err && err !== 'money' && err !== 'locked') return [];
  const ghost = { uid: -1, id, col, row, rot };
  const rp = rectP(ghost);
  const out: { name: string; known: boolean; combo: Combo; uid: number }[] = [];
  for (const q of state.placed) {
    if (q.id === 'path') continue;
    const g = gap(rp, rectP(q));
    if (g > 2) continue;
    for (const c of COMBOS)
      if (comboHolds(c, ghost, q, g) || comboHolds(c, q, ghost, g))
        if (!out.some((o) => o.uid === q.uid && o.combo.id === c.id)) {
          const known = state.combos.includes(c.id);
          out.push({ name: known ? c.name : '？？？', known, combo: c, uid: q.uid });
        }
  }
  return out;
}

/** 每个设施身上生效的组合（作为 a 那边；同一个组合只算一次） */
export function activeCombos(state: State, uid: number): Combo[] {
  const ids = new Set<string>();
  for (const k of state.pairs) {
    const [cid, a, b] = k.split(':');
    const c = COMBOS.find((x) => x.id === cid);
    if (!c) continue;
    // 同标签的组合（美食街）两边都算 a
    if (Number(a) === uid || (c.a === c.b && Number(b) === uid)) ids.add(cid);
  }
  return COMBOS.filter((c) => ids.has(c.id));
}

/** 现在场上成立的组合种类（星级目标看它：拆掉就掉） */
export function activeComboKinds(state: State): string[] {
  return [...new Set(state.pairs.map((k) => k.split(':')[0]))];
}

// ── 收费、吸引力、客流 ──────────────────────────────────

/** 设施现在的容量（等级加） */
export function capOf(p: Placed): number {
  const def = DEFS[p.id];
  return def.cap > 0 ? def.cap + (p.lv - 1) * LV_CAP : 0;
}

/** 设施的实际收费（等级 × 组合乘数） */
export function spendOf(state: State, p: Placed): { amount: number; base: number } {
  const def = DEFS[p.id];
  let k = LV_MUL[p.lv - 1] ?? 1;
  for (const c of activeCombos(state, p.uid)) k *= c.spend;
  return { amount: Math.round(def.spend * k), base: def.spend };
}

/** 光环：2 格内建好的装饰 / 地形的吸引力之和（最多 AURA_CAP） */
export function auraOf(state: State, p: Placed): number {
  const rp = rectP(p);
  let a = 0;
  for (const q of state.placed) {
    const d = DEFS[q.id];
    if (q.build < 1 || d.appeal <= 0 || (d.cat !== 'deco' && d.cat !== 'terrain')) continue;
    if (gap(rp, rectP(q)) <= AURA_RANGE) a += d.appeal;
  }
  return Math.min(AURA_CAP, a);
}

/**
 * 设施的实际吸引力：appeal + 组合 + 等级 + 光环（只有能接客的设施有）。
 * 没建好 = 0，要路却走不到 = 0；装饰、地形、停车场自己 = 0（装饰的作用在光环里）。
 */
export function appealOf(state: State, p: Placed, reach?: Set<number>): number {
  const def = DEFS[p.id];
  if (p.build < 1 || def.cap <= 0) return 0;
  if (!(reach ?? reachableSet(state)).has(p.uid)) return 0;
  let a = def.appeal + (p.lv - 1) * LV_APPEAL;
  for (const c of activeCombos(state, p.uid)) a += c.appeal;
  return a + auraOf(state, p);
}

/** 能当第一站吗（客人为球场、泳池来；餐饮、球具店、会所是顺路消费；看台只在俱乐部赛那天） */
export function firstStopOk(def: AnyDef, cupDay = false): boolean {
  if (def.cap <= 0) return false;
  const t = def.tags;
  if (t.includes('food') || t.includes('shop') || t.includes('house')) return false;
  if (t.includes('stand')) return cupDay;
  return true;
}

/** 一处位子一天大约能翻几次台（估容量用；走路时间按 6 秒估） */
const turnsOf = (def: AnyDef) => OPEN_SEC / (stayOf(def) + 6);

/** 一个 tick 里不变的东西（布局只在命令和建好时变）：走得到的、各设施的吸引力 */
interface Ctx {
  reach: Set<number>;
  appeal: Map<number, number>;
  cup: boolean;
}
function makeCtx(s: State): Ctx {
  const reach = reachableSet(s);
  const appeal = new Map<number, number>();
  for (const p of s.placed) appeal.set(p.uid, appealOf(s, p, reach));
  return { reach, appeal, cup: cupHeld(s, reach) };
}

/** 吸引来的客人数（今天，按现在的布局；没有能当第一站的设施 = 0） */
function demandOf(s: State, ctx: Ctx): number {
  let sum = 0;
  let parking = 0;
  let hosts = false;
  for (const p of s.placed) {
    sum += ctx.appeal.get(p.uid) ?? 0;
    const def = DEFS[p.id];
    if (p.build < 1 || !ctx.reach.has(p.uid)) continue;
    if (def.tags.includes('parking')) parking++;
    if (firstStopOk(def, ctx.cup)) hosts = true;
  }
  if (!hosts) return 0;
  const base = BASE_VISITORS + s.members * MEMBER_VISIT + s.fame * FAME_VISITORS + sum * APPEAL_K;
  const park = 1 + PARKING_MUL * Math.min(PARKING_MAX, parking);
  return base * park * s.buzz * (ctx.cup ? CUP_MUL : 1);
}

/** 一天大约接得下几位（第一站的位子 × 翻台次数） */
function capacityOf(s: State, ctx: Ctx): number {
  let c = 0;
  for (const p of s.placed) {
    const def = DEFS[p.id];
    if (p.build < 1 || !ctx.reach.has(p.uid) || !firstStopOk(def, ctx.cup)) continue;
    c += capOf(p) * turnsOf(def);
  }
  return c;
}

/** 预计客人：吸引来的、接得下的、预计 = 两者小的那个、预计客满走掉的 */
export function forecast(s: State): Forecast {
  const ctx = makeCtx(s);
  const demand = Math.round(demandOf(s, ctx));
  const capacity = Math.round(capacityOf(s, ctx));
  const visitors = Math.min(demand, capacity);
  return { demand, capacity, visitors, away: demand - visitors };
}

/** 吸引来的客人数（没取整、没和容量比；客人按这个速度来） */
export function demandPerDay(s: State): number {
  return demandOf(s, makeCtx(s));
}

/** 今天的预计客人数（= forecast(s).visitors：吸引来的和接得下的取小） */
export function visitorsPerDay(state: State): number {
  return forecast(state).visitors;
}

/** 设施现在占了几个位子（正往这走 + 在这待着的） */
export function occupantsOf(state: State, uid: number): number {
  let n = 0;
  for (const v of state.visitors) if (v.stage !== 'out' && v.stops[v.i] === uid) n++;
  return n;
}

// ── 一周 ────────────────────────────────────────────────

/** 正式球场（不算练习墙）和看台都够 → 周日能办俱乐部赛 */
function cupNeed(s: State, reach: Set<number>): string {
  let courts = 0;
  let stands = 0;
  for (const p of s.placed) {
    if (p.build < 1 || !reach.has(p.uid)) continue;
    const t = DEFS[p.id].tags;
    if (t.includes('court') && !t.includes('training')) courts++;
    if (t.includes('stand')) stands++;
  }
  const need: string[] = [];
  if (courts < CUP_COURTS) need.push(`再建 ${CUP_COURTS - courts} 片球场`);
  if (stands < 1) need.push('建一座看台');
  return need.join('，');
}

const dowOf = (day: number) => (((day - 1) % 7) + 7) % 7;
function cupHeld(s: State, reach: Set<number>): boolean {
  return dowOf(s.day) === 6 && !cupNeed(s, reach);
}

/** 一周日历（day 默认今天）：dow 0 = 周一；tag = 青训日 / 家庭日 / 俱乐部赛；cupReady = 现在的布局够不够办赛 */
export function dayInfo(
  s: State,
  day = s.day,
): { dow: number; name: string; tag: string | null; cup: boolean; cupReady: boolean; need: string } {
  const dow = dowOf(day);
  const need = cupNeed(s, reachableSet(s));
  return { dow, name: WEEKDAYS[dow], tag: WEEK_TAG[dow], cup: dow === 6, cupReady: !need, need };
}

// ── 星级 ────────────────────────────────────────────────

/** 设施数（星级目标用）：建好的、不算步道、装饰、地形 */
export function facilityCount(s: State): number {
  return s.placed.filter((p) => {
    const c = DEFS[p.id].cat;
    return p.build >= 1 && c !== 'road' && c !== 'deco' && c !== 'terrain';
  }).length;
}

export interface GoalItem {
  /** 'money' 是旧的"手上的钱"，已经不会出现（留着让旧的 hud 比较能编译） */
  key: 'visitors' | 'buildings' | 'combos' | 'net' | 'members' | 'money';
  label: string;
  have: number;
  need: number;
  done: boolean;
}

/** 下一颗星的目标进度；满星 null。star = 下一颗星；next = 各项（items 是旧名字），goal = 原表的一行（旧接口） */
export function starProgress(
  state: State,
): { star: number; next: GoalItem[]; done: boolean; goal: StarGoal; items: GoalItem[] } | null {
  const goal = STAR_GOALS.find((g) => g.star === state.star + 1);
  if (!goal) return null;
  const raw: (Omit<GoalItem, 'done' | 'key'> & { key: Exclude<GoalItem['key'], 'money'> })[] = [
    { key: 'visitors', label: '累计客人', have: state.totalVisitors, need: goal.visitors },
    { key: 'buildings', label: '设施（不算装饰）', have: facilityCount(state), need: goal.buildings },
    { key: 'combos', label: '场上的组合', have: activeComboKinds(state).length, need: goal.combos },
    { key: 'net', label: '单日净收入', have: state.bestNet, need: goal.net },
    { key: 'members', label: '会员', have: state.members, need: goal.members },
  ];
  const next = raw.filter((i) => i.need > 0).map((i) => ({ ...i, done: i.have >= i.need }));
  return { star: goal.star, next, done: next.every((i) => i.done), goal, items: next };
}

/** 有这个标签的设施名：先找场上已经有的（含地形），再找解锁了的 */
function nameForTag(s: State, tag: string): { name: string; placed: boolean } | null {
  const open = openRowStart(s);
  const onLot = s.placed.find((p) => p.build >= 1 && p.row >= open && DEFS[p.id].tags.includes(tag));
  if (onLot) return { name: nameOf(onLot.id), placed: true };
  const b = BUILDINGS.find((d) => d.tags.includes(tag) && d.star <= s.star && d.cat !== 'road');
  return b ? { name: b.name, placed: false } : null;
}

/** 下一颗星第一个没完成的项，一句能照做的话 */
export function nextGoalHint(s: State): string {
  const sp = starProgress(s);
  if (!sp) return '满星了！升级设施、办俱乐部赛，把俱乐部经营得更热闹';
  const g = sp.next.find((i) => !i.done);
  if (!g) return `★${sp.star} 的目标都够了，今天收盘就升星`;
  const n = g.need - g.have;
  switch (g.key) {
    case 'visitors': {
      const f = forecast(s);
      if (f.away > 0) return `还差 ${n} 位客人：客满会有人走掉，多建能接客的球场`;
      return `还差 ${n} 位客人：多放能吸引人的设施，凑组合`;
    }
    case 'buildings': {
      const opts = BUILDINGS.filter((d) => d.star <= s.star && d.cat !== 'road' && d.cat !== 'deco').sort(
        (a, b) => a.cost - b.cost,
      );
      const pick = opts.find((d) => d.cost <= s.money) ?? opts[0];
      return `还差 ${n} 座设施（装饰不算）${pick ? `：比如${pick.name} $${pick.cost}` : ''}`;
    }
    case 'combos': {
      const active = new Set(activeComboKinds(s));
      for (const c of COMBOS) {
        if (active.has(c.id)) continue;
        const a = nameForTag(s, c.a);
        const b = nameForTag(s, c.b);
        if (!a || !b) continue;
        const [x, y] = b.placed && !a.placed ? [a, b] : [b, a];
        return `还差 ${n} 个组合：把${x.name}放在${y.name}旁边试试`;
      }
      return `还差 ${n} 个组合：试试把不同的设施挨着放`;
    }
    case 'net':
      return `单日净收入还差 $${n}：球场边开店、升级常客多的设施`;
    default:
      return `会员还差 ${n} 位：客人逛满两处才会办卡，球场边放咖啡车、球具店`;
  }
}

// ── 时间 ────────────────────────────────────────────────

/** 时间往前走 dt 游戏秒（已经乘过速度） */
export function tick(state: State, dt: number): Result {
  const s = clone(state);
  const events: SimEvent[] = [];
  buildStep(s, dt, events);
  const ctx = makeCtx(s);

  const t0 = s.time;
  s.time = Math.min(1, s.time + dt / DAY_SECONDS);

  // 来客
  if (s.time > OPEN_FROM && t0 < OPEN_TO) {
    const per = demandOf(s, ctx);
    const span = (OPEN_TO - OPEN_FROM) * DAY_SECONDS;
    const used = Math.min(s.time, OPEN_TO) - Math.max(t0, OPEN_FROM);
    if (per > 0 && used > 0) s.arrivalAcc += (per * used * DAY_SECONDS) / span;
    while (s.arrivalAcc >= 1) {
      s.arrivalAcc -= 1 + (rand(s) - 0.5) * 0.6;
      spawnVisitor(s, ctx, events);
    }
  }

  // 客人
  for (const v of [...s.visitors]) {
    v.t -= dt;
    if (v.t > 0) continue;
    const p = byUid(s, v.stops[v.i]);
    if (v.stage === 'walk') {
      if (!p) {
        goOut(s, v, null, events);
        continue;
      }
      // 到了：花钱
      const { amount, base } = spendOf(s, p);
      s.money += amount;
      s.today.income += amount;
      s.today.comboBonus += amount - base;
      p.served++;
      const st = (s.today.byUid[p.uid] ??= { income: 0, guests: 0 });
      st.income += amount;
      st.guests += 1;
      events.push({ type: 'visitorSpend', vid: v.vid, uid: p.uid, amount, bonus: amount - base });
      // 逛满两处：可能办卡
      if (v.i === 1 && rand(s) < MEMBER_P) {
        s.today.joined++;
        events.push({ type: 'memberJoined', count: 1, vid: v.vid });
      }
      v.stage = 'stay';
      v.t = stayOf(DEFS[p.id]) * (0.85 + rand(s) * 0.3);
    } else if (v.stage === 'stay') {
      // 再去一个地方？
      let next: Placed | null = null;
      if (v.stops.length === 1 && s.time < 0.9 && rand(s) < SECOND_STOP) {
        next = pickTarget(s, ctx, v.guest, v.stops);
      }
      if (next && p) {
        const r = route(s, p.uid, next.uid);
        if (r) {
          v.stops.push(next.uid);
          v.i++;
          v.stage = 'walk';
          v.t = Math.max(0.5, (r.length - 1) / WALK_TPS);
          events.push({ type: 'visitorGo', vid: v.vid, from: p.uid, to: next.uid });
          continue;
        }
      }
      goOut(s, v, p ?? null, events);
    } else {
      s.visitors = s.visitors.filter((x) => x !== v);
      events.push({ type: 'visitorLeave', vid: v.vid });
    }
  }

  // 收盘
  if (s.time >= 1) settle(s, ctx, events);
  return { state: s, events };
}

/** 只推建造进度（暂停时也能建：开罗式，停着时间照样能摆东西、看它建好） */
export function tickBuild(state: State, dt: number): Result {
  if (!state.placed.some((p) => p.build < 1)) return { state, events: [] };
  const s = clone(state);
  const events: SimEvent[] = [];
  buildStep(s, dt, events);
  return { state: s, events };
}

function buildStep(s: State, dt: number, events: SimEvent[]) {
  for (const p of s.placed) {
    if (p.build >= 1) continue;
    p.build = Math.min(1, p.build + dt / BUILD_SECONDS);
    if (p.build >= 1) {
      events.push({ type: 'built', uid: p.uid, id: p.id });
      for (const np of newPairs(s, p)) {
        s.pairs.push(np.key);
        const first = !s.combos.includes(np.combo.id);
        if (first) {
          s.combos.push(np.combo.id);
          s.today.found++;
          log(s, `发现组合「${np.combo.name}」：${nameOf(byUid(s, np.a)?.id ?? '')} 收入 ×${np.combo.spend}`);
        }
        events.push({ type: 'comboFound', combo: np.combo.id, uids: [np.a, np.b], first });
      }
    }
  }
}

function goOut(s: State, v: Visitor, from: Placed | null, events: SimEvent[]) {
  const r = from ? route(s, from.uid, null) : null;
  v.stage = 'out';
  v.t = r ? Math.max(0.5, (r.length - 1 + ROAD_TILES) / WALK_TPS) : 3;
  events.push({ type: 'visitorGo', vid: v.vid, from: from?.uid ?? -1, to: null });
}

/** 给这位客人挑一个地方：吸引他、建好了、走得到、有空位（第一站还要能当第一站）；按吸引力加权 */
function pickTarget(s: State, ctx: Ctx, guest: Guest, exclude: number[] = []): Placed | null {
  const first = exclude.length === 0;
  const cands = s.placed.filter((p) => {
    const def = DEFS[p.id];
    return (
      p.build >= 1 &&
      def.cap > 0 &&
      def.guests.includes(guest) &&
      ctx.reach.has(p.uid) &&
      (!first || firstStopOk(def, ctx.cup)) &&
      !exclude.includes(p.uid) &&
      occupantsOf(s, p.uid) < capOf(p)
    );
  });
  return pickWeighted(s, cands, (p) => (ctx.appeal.get(p.uid) ?? 0) + 1);
}

function spawnVisitor(s: State, ctx: Ctx, events: SimEvent[]) {
  // 客群权重：能当第一站的设施吸引的客群（不管有没有空位），乘一周的客群倍数；会员按比例多一些
  const w: Record<Guest, number> = { member: 0, junior: 0, family: 0, fan: 0 };
  for (const p of s.placed) {
    const def = DEFS[p.id];
    if (p.build < 1 || !ctx.reach.has(p.uid) || !firstStopOk(def, ctx.cup)) continue;
    const a = (ctx.appeal.get(p.uid) ?? 0) + 1;
    for (const g of def.guests) w[g] += a / def.guests.length;
  }
  const mix = WEEK_MIX[dowOf(s.day)];
  for (const g of Object.keys(w) as Guest[]) w[g] *= mix[g] ?? 1;
  if (w.member > 0 && s.members > 0) {
    const sum = w.member + w.junior + w.family + w.fan;
    const share = Math.min(0.6, (s.members * MEMBER_VISIT) / Math.max(1, demandOf(s, ctx)));
    w.member += sum * share;
  }
  const guest = pickWeighted(s, Object.keys(w) as Guest[], (g) => w[g]);
  if (!guest) return;
  const target = pickTarget(s, ctx, guest);
  if (!target) {
    s.today.turnedAway++;
    events.push({ type: 'turnedAway', guest });
    return;
  }
  const r = route(s, null, target.uid);
  if (!r) return;
  const v: Visitor = {
    vid: s.nextVid++,
    guest,
    stops: [target.uid],
    i: 0,
    stage: 'walk',
    t: Math.max(0.5, (r.length - 1 + ROAD_TILES) / WALK_TPS),
  };
  s.visitors.push(v);
  s.today.visitors++;
  s.totalVisitors++;
  if (guest === 'fan') s.today.fans++;
  events.push({ type: 'visitorArrive', vid: v.vid, guest, to: target.uid });
}

const money = (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(n)}`;

/** 按设施种类记账（收入、建好的座数） */
function bookById(s: State): Record<string, { income: number; n: number }> {
  const out: Record<string, { income: number; n: number }> = {};
  for (const p of s.placed) {
    const def = DEFS[p.id];
    if (p.build < 1 || def.cat === 'road' || def.cat === 'terrain') continue;
    (out[p.id] ??= { income: 0, n: 0 }).n++;
  }
  for (const [uid, st] of Object.entries(s.today.byUid)) {
    const p = byUid(s, Number(uid));
    if (p) (out[p.id] ??= { income: 0, n: 0 }).income += st.income;
  }
  return out;
}

/** 和昨天比：按设施种类的收入变化 + 维护费变化，挑变化最大的 3 条 */
function diffItems(today: DayBook, y: DayBook): DiffItem[] {
  const items: DiffItem[] = [];
  for (const id of new Set([...Object.keys(today.byId), ...Object.keys(y.byId)])) {
    const a = today.byId[id] ?? { income: 0, n: 0 };
    const b = y.byId[id] ?? { income: 0, n: 0 };
    const amount = a.income - b.income;
    if (!amount) continue;
    const name = nameOf(id);
    const label =
      b.n === 0 && a.n > 0 ? `新的${name}` : a.n > b.n ? `多建的${name}` : a.n < b.n ? `拆掉的${name}` : name;
    items.push({ label, amount, text: `${label} ${money(amount)}` });
  }
  const dd = today.dues - (y.dues ?? 0);
  if (dd) items.push({ label: '会费', amount: dd, text: `会费 ${money(dd)}` });
  const du = -(today.upkeep - y.upkeep);
  if (du) items.push({ label: '维护费', amount: du, text: `维护费 ${money(du)}` });
  items.sort((p, q) => Math.abs(q.amount) - Math.abs(p.amount));
  return items.slice(0, 3);
}

function settle(s: State, ctx: Ctx, events: SimEvent[]) {
  for (const v of s.visitors) events.push({ type: 'visitorLeave', vid: v.vid });
  s.visitors = [];
  const day = s.day;
  const t = s.today;
  const built = s.placed.filter((p) => p.build >= 1 && !isTerrainDef(DEFS[p.id]));
  const upkeep = built.reduce((a, p) => a + DEFS[p.id].upkeep, 0);
  // 会费（按昨天收盘时的会员数）：算进今天的收入
  const dues = s.members * MEMBER_FEE;
  s.money += dues - upkeep;
  t.income += dues;
  const net = t.income - upkeep;
  s.bestNet = Math.max(s.bestNet, net);
  const reasons: string[] = [];

  // 和昨天比
  const book: DayBook = { income: t.income, dues, upkeep, net, visitors: t.visitors, byId: bookById(s) };
  const y = s.yesterday;
  const diff = y
    ? { income: t.income - y.income, net: net - y.net, visitors: t.visitors - y.visitors, items: diffItems(book, y) }
    : null;
  if (diff?.items.length) reasons.push(`比昨天 ${money(diff.net)}：${diff.items.map((i) => i.text).join('，')}`);
  else {
    const top = Object.entries(book.byId).sort((a, b) => b[1].income - a[1].income)[0];
    if (top && top[1].income > 0) reasons.push(`${nameOf(top[0])}赚得最多：$${top[1].income}`);
  }
  if (dues > 0) reasons.push(`会费：${s.members} 位会员 $${dues}`);
  if (t.comboBonus > 0) reasons.push(`组合和等级加成多赚了 $${t.comboBonus}`);
  if (t.turnedAway > 0) reasons.push(`${t.turnedAway} 位客人没位子，扭头走了 —— 多建几个能接客的球场`);
  const lost = unreachable(s);
  if (lost.length) {
    const names = [...new Set(lost.map((u) => nameOf(byUid(s, u)?.id ?? '')))].join('、');
    reasons.push(`${names}没有路通到大门，一分钱没赚`);
  }
  if (t.visitors === 0) {
    const hosts = s.placed.some((p) => p.build >= 1 && firstStopOk(DEFS[p.id]));
    if (!hosts) reasons.push('今天没有客人：先建一座球场，客人是冲着球场来的');
    else if (lost.length) reasons.push('今天没有客人：球场要连上步道，客人才进得来');
  }

  // 会员：今天办卡的加进来，流失 2%
  s.memberAcc += s.members * MEMBER_CHURN;
  const left = Math.floor(s.memberAcc);
  s.memberAcc -= left;
  s.members = Math.max(0, s.members - left + t.joined);
  if (t.joined || left) reasons.push(`会员 ${s.members} 位（今天办卡 ${t.joined}，流失 ${left}）`);

  // 俱乐部赛（周日）
  let prize = 0;
  if (dowOf(day) === 6) {
    const need = cupNeed(s, ctx.reach);
    if (ctx.cup) {
      prize = CUP_PRIZE + CUP_PER_FAN * t.fans;
      s.money += prize;
      s.fame++;
      reasons.push(`俱乐部赛办成了：来了 ${t.fans} 位球迷，奖金 $${prize}，名气 +1`);
      log(s, `第 ${day} 天俱乐部赛：球迷 ${t.fans} 位，奖金 $${prize}`);
    } else reasons.push(`这周的俱乐部赛没办成：${need}`);
    events.push({ type: 'clubCup', day, held: ctx.cup, fans: t.fans, prize, fame: s.fame, need });
  }

  // 口碑：客满走掉太多，明天少来一点
  s.buzz = t.turnedAway >= 3 && t.turnedAway > t.visitors * AWAY_SHARE ? BUZZ_BAD : 1;
  if (s.buzz < 1) reasons.push('口碑：客满走掉的人太多，明天来的人少一点');
  reasons.push(`维护费 ${built.filter((p) => p.id !== 'path').length} 处设施共 $${upkeep}`);

  log(s, `第 ${day} 天收盘：收入 $${t.income}，维护 $${upkeep}，客人 ${t.visitors} 位`);
  s.yesterday = book;

  // 升星（一天最多升一颗）
  const sp = starProgress(s);
  const up = !!sp?.done;
  const oldStart = openRowStart(s);
  let unlocked: string[] = [];
  if (sp?.done) {
    s.star = sp.star;
    s.lotRows = Math.max(s.lotRows, rowsForStar(s.star));
    unlocked = BUILDINGS.filter((b) => b.star === s.star).map((b) => b.id);
    log(s, `升到 ★${s.star}！解锁：${unlocked.map(nameOf).join('、')}`);
  }

  // 明天
  s.day++;
  s.time = 0;
  s.arrivalAcc = 0;
  s.today = emptyDay();
  const hint = nextGoalHint(s);
  reasons.push(sp?.done ? `升到 ★${s.star}！` : `离 ★${s.star + 1}：${hint}`);
  const fc = forecast(s);
  events.push({
    type: 'daySettled',
    day,
    income: t.income,
    upkeep,
    net,
    visitors: t.visitors,
    turnedAway: t.turnedAway,
    reasons,
    prize,
    dues,
    members: { joined: t.joined, left, total: s.members },
    forecast: fc,
    diff,
    blocking: day % 7 === 0 || up || net < 0 || t.found > 0,
    hint,
  });
  if (up) {
    events.push({ type: 'starUp', star: s.star, unlocked, rows: s.lotRows });
    const start = openRowStart(s);
    if (start < oldStart) {
      const features = s.placed
        .filter((p) => isTerrainDef(DEFS[p.id]) && p.row >= start && p.row < oldStart)
        .map((p) => p.uid);
      events.push({ type: 'parcelOpened', rows: [start, oldStart - 1], features });
      log(s, `地块往北开放了 ${oldStart - start} 行`);
    }
  }
}

function log(s: State, text: string) {
  s.log.push({ day: s.day, text });
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
}

function clone(s: State): State {
  return structuredClone(s);
}
