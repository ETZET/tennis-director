// clubbuild 的模拟：纯函数式状态机（照 CLAUDE.md 的模拟规则写，虽然只是 sandbox 的思想实验）。
// 输入状态 + 命令 / 时间，输出新状态 + 领域事件；状态可序列化（只有数字、字符串、数组、普通对象），
// 不碰 three、DOM，不用 Math.random —— 随机数的种子在状态里（state.rng，mulberry32 一步一步往下走）。
//
// ═══ 对外接口（UI / 美术照这个写）═══════════════════════════════════════════════
//
// 地块：LOT_W 26 × LOT_D 31。大门在南边正中（row 30，cols 12–13）。开局开放南边 16 行（rows 15–30）、中间 18 列（cols 4–21）。
//   北边按星级开放（LOT_ROWS_BY_STAR = [16,16,20,26,31]）；东西两边各 4 列，★4 以后花钱买（$15k、$30k）。
//
// 状态 State
//   lotRows: number          开放了南边几行；openRowStart(s) = LOT_D − lotRows，row ≥ 它的才能建
//   lotCols: [c0, c1]        开放的列（含两端）；openColRange(s)、colOpen(s, col)
//   members / fame / bestNet / buzz    会员、名气、最好的单日净收入、今天的口碑乘数
//   dayHours: 11 | 14        这一天几个小时（有装灯的球场以后 14 = 到 21:00）；clockHour(s)、dayEndHour(s)、dayLength(s)
//   offer: {id, day} | null  这周的比赛邀请（周四来）；cup: {id, day} | null 承办了的；cupsWon: string[] 办成过的
//   Placed.lv / served / lights? / coach?
//
// 命令 Command
//   {type:'place', id, col, row, rot?}      摆（扣建造费）
//   {type:'remove', uid, refund?:'full'}    拆（退一半）；'full' = 反悔：今天放下、没接过客人的全额退（canFullRefund），不满足照样退一半。
//                                           大石头 = 清理（花 clearCost，退负数）；绿洲、老棕榈拆不掉
//   {type:'move', uid, col, row, rot?}      挪（免费）：uid、lv、served、灯、教练都不变；地形、步道不能挪；挪完重算组合
//   {type:'clear', uid}                     清理大石头
//   {type:'upgrade', uid}                   升级（upgradeInfo）
//   {type:'lights', uid}                    球场装夜场灯（lightsInfo）：当场生效，今天就拉长到 21:00（time 按钟点换算，不跳）
//   {type:'hireCoach', uid}                 正式球场请教练（coachInfo）
//   {type:'buyLand', side:'west'|'east'}    买地（landInfo）
//   {type:'enterCup'} / {type:'declineCup'} 承办 / 不办这周邀请的比赛（承办当场扣报名费）
//
// 事件 SimEvent
//   rejected      { reason: 旧的代码集合, text: 中文原因 }（没开放 / 没买的地都报 reason 'bounds'，text 写清楚）
//   placed / removed / built / comboFound / visitor* / turnedAway   （同前）
//   upgraded { uid, lv, cost } · moved { uid, from, to } · lightsOn { uid, cost } · coachHired { uid, cost }
//   landBought    { side, cols: [c0, c1], cost, features: uid[] }   features = 新买的地里的地形
//   memberJoined  { count: 1, vid }         一位客人逛到第二处、办了卡（实时；会员数收盘时才加进 state.members）
//   parcelOpened  { rows: [from, to], features: uid[] }   升星时地块往北开放；rows 含两端
//   starUp        { star, unlocked, rows }  ★2 起每升一星名气 +STAR_FAME
//   cupOffer      { offer: CupOffer }       周三收盘后（周四）主办方来邀请
//   cupEntered    { id, day, fee } · cupDeclined { id }
//   cupResult     { day, id, name, held, fans, prize, bonus, bonusText, fameGain, fame, standFill, food, why }   比赛日收盘时
//   clubCup       旧事件（兼容），和 cupResult 一起发
//   seasonScore   { day, total, parts: {label, value, points}[] }   第 SCORE_DAY（30）天收盘时发一次，之后照样经营
//   daySettled    { day, income, upkeep, net, visitors, turnedAway, reasons, prize, dues, members, forecast, diff, blocking, hint }
//                 diff = { income, net, visitors, items: {label, amount, text}[], weekday: string | null } | null（第一天 null）
//                   items 只讲"有原因"的变化（座数 / 等级 / 组合 / 灯 / 教练变了，或者超过 max($120, 昨天的 25%)）
//                   weekday = 星期的原因（"周日俱乐部赛：看台 +$364"、"今天周一，比赛日的球迷走了"），也是 reasons 第一条
//                 blocking = 周报（每 7 天）、升星、亏钱、发现新组合、比赛日、评分日；reasons 里不再有"离 ★N"（看 hint）
//
// 函数
//   placeError(s, def, col, row, rot, free?) → string | null    "被占了"、"钱不够 $X"、"★N 解锁"、"✕ 北边没开放 · ★N"、
//                                                               "✕ 这块地还没买 · $15k"（★4 以前 "· ★4 以后"）
//   placeErrorCode / canPlace → PlaceError | null               'bounds'|'parcel'|'land'|'overlap'|'locked'|'money'|'unknown'|'terrain'
//   moveError(s, uid, col, row, rot) · removeRefund(s, uid, full?) · canFullRefund(s, uid)
//   comboPreview(s, id, col, row, rot) → {name, known, combo, uid}[]   没发现过 name = '？？？'
//   upgradeInfo / lightsInfo / coachInfo (s, uid) → {can, cost, need?, (nextLv)} | null   null = 这里不能
//   landInfo(s, side) → {can, cost, cols, need?} | null          null = 已经买了；landPrice(s) → 下一块的价钱 | null
//   starProgress(s) → {star, next: GoalItem[], done, goal, items} | null   GoalItem.key 加了 'has'（建一座某设施，id = 哪种）
//   nextGoalHint(s)：按 设施 → 建某座 → 组合 → 会员 → 净收入 → 客人 挑；只推荐放得下的；满星后指向比赛阶梯
//   turnAwayAdvice(s)：客满时一句能做的事（升级 → 装灯 → 再建 → 买地 → 放顺路设施等场）
//   fitsSomewhere(s, def)：开放的地里放不放得下
//   forecast(s) / demandPerDay(s) / visitorsPerDay(s)
//   dayInfo(s, day?) → {dow, name, tag, cup, cupReady, need, cupName, entered, offered}   周日那格的 tag = 这周的比赛名；★2 以前 need '★2 开放'
//   offerInfo(s) → CupOffer | null（这周的邀请或承办了的：{id, name, day, fee, prize, perFan, fameGain, needs, missing, bonusText, bonusMul, entered}）
//   bestCup(s) → CupDef | null；cupNeeds(cup) → string[]
//   clockHour(s) / dayEndHour(s) / dayLength(s)；hourOf(time, hours?)（老写法 hourOf(time) 只对 11 小时的一天对，有灯的日子用 clockHour）
//   capOf(p) / spendOf(s, p) / appealOf(s, p) / upkeepOf(p) / activeComboKinds(s) / facilityCount(s)
//   terrainVariant(seed)、TERRAIN_VARIANTS（地形的几套摆法，含 ★4 那片和东西两边的地里各一样）

// ═══ 规则（开罗式）═══════════════════════════════════════════════════════════
// - 摆设施：在开放的地块里、不压别的东西、星级够、钱够；当场扣钱。步道 1×1，可以连刷。拆掉退一半。
// - 建造：BUILD_SECONDS 秒建好（'built'）；建好时看相邻的组合（catalog COMBOS），第一次凑成的组合 = 新发现。
// - 客人：每天来多少 = (基础 + 会员 × 0.3 + 名气 + 吸引力总和) × 停车场 × 口碑 × 赛事日；吸引力 = 设施的 appeal + 组合 + 等级
//   + 装饰光环（2 格内的装饰/地形，最多 +4）。客人类型按"能当第一站"的设施吸引的客群加权抽，再乘一周的客群倍数。
//   第一站只能是球场、泳池（比赛日加上看台；16 点以后只有装了灯的球场）；第一站都满了，先去餐饮、球具店、会所"等场"，
//   两处都没位子才算走掉。之后再去第二处（SECOND_STOP）、第三处（THIRD_STOP），最多三处。
//   每位客人挑一个吸引他、有空位、走得到的设施（占一个位子，从走过去起就占），到了就花钱（'visitorSpend'），待一会儿。
//   逛到第二处的客人有 MEMBER_P 的概率办卡成会员。
// - 走得到：设施的门格旁边（门格四邻、在占地外面）有一块步道，这块步道沿着步道连到大门（地块南边正中）。
// - 钱只在三处变：客人花钱（马上进账）、每天收盘（会费、扣维护费、俱乐部赛奖金）、玩家自己的建造 / 拆除 / 升级 / 清理。
// - 每天收盘（'daySettled'）后看星级目标（STAR_GOALS），够了就升星（'starUp'），解锁新设施、地块往北开放（'parcelOpened'）。
import {
  type AnyDef,
  BUILDINGS,
  COACH,
  COMBOS,
  type Combo,
  CUP_OFFER_DAYS,
  CUPS,
  type CupDef,
  DAY_SECONDS,
  DEFS,
  type Guest,
  LAND_COLS,
  LAND_PRICES,
  LAND_STAR,
  LIGHTS,
  LOT_D,
  LOT_ROWS_BY_STAR,
  LOT_W,
  LV_APPEAL,
  LV_AT,
  LV_CAP,
  LV_COST,
  LV_MUL,
  LV_UPKEEP,
  MAX_LV,
  SCORE_DAY,
  STAR_FAME,
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
/**
 * 一天（time 0..1）对应的钟点：7:00 开门，平常 18:00 收盘；有一片装了灯的球场以后一天拉长到 21:00（state.dayHours 11 → 14）。
 * 1 游戏秒永远 = DAY_HOURS / DAY_SECONDS 小时，所以拉长的一天在画面上也更长（60 秒 → 76 秒）。
 */
export const DAY_START_HOUR = 7;
export const DAY_HOURS = 11;
export const NIGHT_END_HOUR = 21;
/** time → 钟点（hours = 这一天有几个小时，默认 11；有灯的日子用 s.dayHours，或者直接用 clockHour(s)） */
export const hourOf = (time: number, hours: number = DAY_HOURS) => DAY_START_HOUR + time * hours;
/** 一天里开门迎客的时段（平常一天 0..1 的比例；钟点是 7:20–16:01） */
export const OPEN_FROM = 0.03;
export const OPEN_TO = 0.82;
const H_OPEN = DAY_START_HOUR + OPEN_FROM * DAY_HOURS;
const H_CLOSE = DAY_START_HOUR + OPEN_TO * DAY_HOURS;
/** 夜场：H_CLOSE 到这个钟点，只有装了灯的球场能当第一站 */
const H_NIGHT_CLOSE = 20.5;
/** 1 小时 = 几游戏秒 */
const SEC_PER_HOUR = DAY_SECONDS / DAY_HOURS;
/** 迎客的秒数（估容量用） */
const OPEN_SEC = (H_CLOSE - H_OPEN) * SEC_PER_HOUR;
const NIGHT_SEC = (H_NIGHT_CLOSE - H_CLOSE) * SEC_PER_HOUR;
/** 每天的客人数 = (BASE_VISITORS + 会员 × MEMBER_VISIT + 名气 × FAME_VISITORS + 吸引力换算的客人) × 乘数 */
export const BASE_VISITORS = 4;
export const APPEAL_K = 0.5;
/** 吸引力的边际递减：总吸引力超过 APPEAL_KNEE 的部分只算 APPEAL_K2（后期再堆组合，客流涨得慢一些） */
export const APPEAL_KNEE = 80;
export const APPEAL_K2 = 0.25;
const appealVisitors = (a: number) => Math.min(a, APPEAL_KNEE) * APPEAL_K + Math.max(0, a - APPEAL_KNEE) * APPEAL_K2;
/** 去第二个地方的概率、第三个地方的概率（一位客人最多逛 3 处） */
export const SECOND_STOP = 0.7;
export const THIRD_STOP = 0.3;
export const MAX_STOPS = 3;
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
export const MEMBER_P = 0.1;
export const MEMBER_VISIT = 0.2;
export const MEMBER_CHURN = 0.02;
/** 会费：每位会员每天交多少（收盘时进账，算进当天收入；会员越多越稳 —— Hot Springs 式的复利） */
export const MEMBER_FEE = 4;
/** 名气：每点每天多来几位 */
export const FAME_VISITORS = 2;
/** 旧的俱乐部赛常数（兼容；现在看 catalog 的 CUPS） */
export const CUP_COURTS = CUPS[0].need.courts ?? 2;
export const CUP_MUL = CUPS[0].mul;
export const CUP_PRIZE = CUPS[0].prize;
export const CUP_PER_FAN = CUPS[0].perFan;
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
  /** 装了夜场灯（球场） */
  lights?: boolean;
  /** 请了教练（正式球场） */
  coach?: boolean;
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
  /** 按设施种类：收入、建好的座数、样子（座数/等级/组合/灯/教练，变了收入变化才算有原因） */
  byId: Record<string, { income: number; n: number; sig: string }>;
  /** 这天办的比赛名（没有 null） */
  cup?: string | null;
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
  /** 开放的列（含两端）：开局 [LAND_COLS, LOT_W − 1 − LAND_COLS]，买地往两边扩 */
  lotCols: [number, number];
  /** 这一天有几个小时（11 = 7:00–18:00；有灯的球场以后 14 = 到 21:00） */
  dayHours: number;
  /** 这周的比赛邀请（周四来，周日前没回就作废） */
  offer: { id: string; day: number } | null;
  /** 承办了的比赛（day = 哪个周日） */
  cup: { id: string; day: number } | null;
  /** 办成过的比赛（按顺序，可以重复） */
  cupsWon: string[];
}

export type Command =
  | { type: 'place'; id: string; col: number; row: number; rot?: Rot }
  | { type: 'remove'; uid: number; refund?: 'full' }
  | { type: 'clear'; uid: number }
  | { type: 'upgrade'; uid: number }
  | { type: 'move'; uid: number; col: number; row: number; rot?: Rot }
  | { type: 'lights'; uid: number }
  | { type: 'hireCoach'; uid: number }
  | { type: 'buyLand'; side: 'west' | 'east' }
  | { type: 'enterCup' }
  | { type: 'declineCup' };

/** 摆放校验的代码（placeError 给中文，这里给代码） */
export type PlaceError = 'unknown' | 'terrain' | 'bounds' | 'parcel' | 'land' | 'overlap' | 'locked' | 'money';
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

/** 比赛邀请（cupOffer 事件、offerInfo(s)） */
export interface CupOffer {
  id: string;
  name: string;
  /** 比赛那个周日 */
  day: number;
  fee: number;
  prize: number;
  perFan: number;
  fameGain: number;
  /** 要求（一条一句） */
  needs: string[];
  /** 现在缺什么（'' = 都够了） */
  missing: string;
  bonusText: string;
  bonusMul: number;
  /** 已经承办了（报名费扣过了） */
  entered: boolean;
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
  | {
      type: 'moved';
      uid: number;
      from: { col: number; row: number; rot: Rot };
      to: { col: number; row: number; rot: Rot };
    }
  | { type: 'built'; uid: number; id: string }
  | { type: 'upgraded'; uid: number; lv: number; cost: number }
  | { type: 'lightsOn'; uid: number; cost: number }
  | { type: 'coachHired'; uid: number; cost: number }
  | { type: 'landBought'; side: 'west' | 'east'; cols: [number, number]; cost: number; features: number[] }
  | { type: 'cupOffer'; offer: CupOffer }
  | { type: 'cupEntered'; id: string; day: number; fee: number }
  | { type: 'cupDeclined'; id: string }
  | {
      type: 'cupResult';
      day: number;
      id: string;
      name: string;
      /** false = 承办了但周日条件不够，比赛取消（报名费不退） */
      held: boolean;
      fans: number;
      prize: number;
      bonus: boolean;
      bonusText: string;
      fameGain: number;
      fame: number;
      /** 看台坐满几成（0..1，估算）、餐饮今天赚的 */
      standFill: number;
      food: number;
      why: string;
    }
  | { type: 'seasonScore'; day: number; total: number; parts: { label: string; value: number; points: number }[] }
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
      /** weekday = 星期的原因（"周日俱乐部赛：看台 +$364"、"今天周一，比赛日的球迷走了"），没有 null */
      diff: { income: number; net: number; visitors: number; items: DiffItem[]; weekday: string | null } | null;
      blocking: boolean;
      hint: string;
    }
  /** 旧事件（兼容）：比赛日收盘时和 cupResult 一起发 */
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
/** 开放的列（含两端） */
export const openColRange = (s: State): [number, number] => [s.lotCols[0], s.lotCols[1]];
export const colOpen = (s: State, col: number) => col >= s.lotCols[0] && col <= s.lotCols[1];
/** 下一块地的价钱（两边都买了 = null） */
export function landPrice(s: State): number | null {
  const bought = (s.lotCols[0] === 0 ? 1 : 0) + (s.lotCols[1] === LOT_W - 1 ? 1 : 0);
  return LAND_PRICES[bought] ?? null;
}
/** 能不能买这一边的地：need = 还差什么（中文） */
export function landInfo(
  s: State,
  side: 'west' | 'east',
): { can: boolean; cost: number; cols: [number, number]; need?: string } | null {
  const cols: [number, number] = side === 'west' ? [0, LAND_COLS - 1] : [LOT_W - LAND_COLS, LOT_W - 1];
  if (colOpen(s, cols[0])) return null;
  const cost = landPrice(s) ?? 0;
  const need = s.star < LAND_STAR ? `★${LAND_STAR} 以后能买` : s.money < cost ? `钱不够 $${cost}` : undefined;
  return { can: !need, cost, cols, ...(need ? { need } : {}) };
}

/** 开局布局 / 地形的坐标偏移：中间那块地从第 LAND_COLS 列、第 5 行开始（原来 18×26 的图往右下挪） */
const OX = LAND_COLS;
const OY = LOT_D - 26;
const at = (it: Item): Item => ({ ...it, col: it.col + OX, row: it.row + OY });

// ── 地形（按 seed 选一套）─────────────────────────────────

type Item = { id: string; col: number; row: number; rot?: Rot };

/**
 * 地形的几套摆法（手摆的）：大多在北边锁着的地里，开放时才"露出来"能用；南边开局那块地里放一块大石头，
 * 挡着第二片球场的好位置（清掉 $400，或者绕开它）。不和 STARTER 重叠。
 */
export const TERRAIN_VARIANTS: Item[][] = [
  [
    // 东边的绿洲、西边一排老棕榈（★2 那片）；石头一块在开局地里（挡着第二片球场）、一块在 ★3 那片（挡着横放的红土）
    ...[
      { id: 'oasis', col: 12, row: 6 },
      { id: 'old-palm', col: 2, row: 8 },
      { id: 'old-palm', col: 3, row: 8 },
      { id: 'old-palm', col: 4, row: 8 },
      { id: 'boulder', col: 12, row: 12 },
      { id: 'boulder', col: 6, row: 1 },
    ].map(at),
    // ★4 那片：一排老棕榈（泳池放旁边成"棕榈泳池"）；东西两边的邻居空地各一样
    { id: 'old-palm', col: 15, row: 1 },
    { id: 'old-palm', col: 16, row: 1 },
    { id: 'old-palm', col: 17, row: 1 },
    { id: 'boulder', col: 1, row: 20 },
    { id: 'oasis', col: 23, row: 17 },
  ],
  [
    // 西边的绿洲（★2），东边一列老棕榈（★2）
    ...[
      { id: 'oasis', col: 2, row: 6 },
      { id: 'old-palm', col: 16, row: 6 },
      { id: 'old-palm', col: 16, row: 7 },
      { id: 'old-palm', col: 16, row: 8 },
      { id: 'boulder', col: 11, row: 14 },
      { id: 'boulder', col: 13, row: 1 },
    ].map(at),
    { id: 'old-palm', col: 6, row: 2 },
    { id: 'old-palm', col: 7, row: 2 },
    { id: 'old-palm', col: 8, row: 2 },
    { id: 'oasis', col: 0, row: 22 },
    { id: 'boulder', col: 23, row: 13 },
  ],
  [
    // 绿洲在 ★3 那片的东北角，老棕榈在 ★2 那片的南沿，★2 那片还有一块石头
    ...[
      { id: 'oasis', col: 15, row: 0 },
      { id: 'old-palm', col: 11, row: 9 },
      { id: 'old-palm', col: 12, row: 9 },
      { id: 'old-palm', col: 13, row: 9 },
      { id: 'boulder', col: 14, row: 16 },
      { id: 'boulder', col: 3, row: 6 },
    ].map(at),
    { id: 'boulder', col: 10, row: 1 },
    { id: 'old-palm', col: 1, row: 10 },
    { id: 'old-palm', col: 1, row: 11 },
    { id: 'old-palm', col: 1, row: 12 },
    { id: 'boulder', col: 23, row: 24 },
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
    lotCols: [LAND_COLS, LOT_W - 1 - LAND_COLS],
    dayHours: DAY_HOURS,
    offer: null,
    cup: null,
    cupsWon: [],
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
].map(at);

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
  /** 挪动时：不算这个 uid 自己占的格 */
  ignore = 0,
): PlaceError | null {
  if (!def) return 'unknown';
  if (!free && def.buildable === false) return 'terrain';
  const r = rectOf(def, col, row, rot);
  if (r.c0 < 0 || r.r0 < 0 || r.c1 > LOT_W || r.r1 > LOT_D) return 'bounds';
  if (!free && r.r0 < openRowStart(state)) return 'parcel';
  if (!free && (r.c0 < state.lotCols[0] || r.c1 - 1 > state.lotCols[1])) return 'land';
  const occ = occupancy(state);
  for (let y = r.r0; y < r.r1; y++)
    for (let x = r.c0; x < r.c1; x++) {
      const u = occ[y * LOT_W + x];
      if (u !== 0 && (ignore === 0 || u !== ignore)) return 'overlap';
    }
  if (!free && def.star > state.star) return 'locked';
  if (!free && state.money < def.cost) return 'money';
  return null;
}

/** 能不能放（中文短句；null = 能）："被占了"、"钱不够 $X"、"★N 解锁"、"✕ 北边没开放 · ★N" */
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
  return placeErrorText(code, def, row, state);
}

/** 没开放的地（人话）："✕ 北边没开放 · ★2" */
export const lockedRowText = (row: number) => `✕ 北边没开放 · ★${starForRow(row)}`;

const kMoney = (n: number) => (n >= 1000 && n % 1000 === 0 ? `$${n / 1000}k` : `$${n}`);
/** 没买的地（人话）："✕ 这块地还没买 · $15k" / "✕ 这块地还没买 · ★4 以后" */
export function lockedLandText(s: State): string {
  const price = landPrice(s);
  if (s.star < LAND_STAR) return `✕ 这块地还没买 · ★${LAND_STAR} 以后`;
  return `✕ 这块地还没买 · ${price === null ? '' : kMoney(price)}`;
}

function placeErrorText(code: PlaceError, def: AnyDef, row: number, s: State): string {
  switch (code) {
    case 'unknown':
      return '没有这种设施';
    case 'terrain':
      return '这个不能建';
    case 'bounds':
      return '超出地块';
    case 'parcel':
      return lockedRowText(row);
    case 'land':
      return lockedLandText(s);
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

/** 能不能把 uid 挪到 (col,row,rot)（中文短句；null = 能）：和 placeError 一样的校验，不算自己原来的占地、不看钱和星级 */
export function moveError(s: State, uid: number, col: number, row: number, rot: Rot): string | null {
  const p = byUid(s, uid);
  if (!p) return '已经没了';
  const def = DEFS[p.id];
  if (isTerrainDef(def)) return `${def.name}挪不动`;
  if (def.cat === 'road') return '步道不能挪，拆了重铺';
  const code = placeErrorCode(s, def, col, row, rot, false, uid);
  if (code === 'locked' || code === 'money') return null;
  return code ? placeErrorText(code, def, row, s) : null;
}

/** 能全额退吗：今天放下的、还没接过客人（摆错了反悔）；地形不算 */
export function canFullRefund(s: State, uid: number): boolean {
  const p = byUid(s, uid);
  return !!p && !isTerrainDef(DEFS[p.id]) && p.builtAt === s.day && p.served === 0;
}

/**
 * 拆掉能拿回多少（UI 显示"↶ 退$900"用）：full = 要全额退（canFullRefund 不成立时照样按一半算）。
 * 大石头 = 负数（清理费）；拆不掉的地形、没这个 uid = 0。
 */
export function removeRefund(s: State, uid: number, full = false): number {
  const p = byUid(s, uid);
  if (!p) return 0;
  const def = DEFS[p.id];
  if (def.cat === 'terrain') return def.clearCost === undefined ? 0 : -def.clearCost;
  if (full && canFullRefund(s, uid)) return def.cost;
  return Math.floor(def.cost * REFUND);
}

/** 客人正往 uid 走 / 在 uid 待着：直接回家（拆掉、挪走时） */
function sendHome(s: State, uid: number, events: SimEvent[]) {
  for (const v of s.visitors)
    if (v.stage !== 'out' && v.stops[v.i] === uid) {
      v.stage = 'out';
      v.t = 4;
      events.push({ type: 'visitorGo', vid: v.vid, from: uid, to: null });
    }
}

/** 记下新凑成的组合（建好、挪动时），第一次凑成的算发现 */
function addPairs(s: State, p: Placed, events: SimEvent[]) {
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
      const reason: RejectReason =
        err === 'parcel' || err === 'land' ? 'bounds' : err === 'terrain' || !err ? 'unknown' : err;
      return reject(state, reason, def && err ? placeErrorText(err, def, cmd.row, state) : '没有这种设施');
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
  if (cmd.type === 'move') {
    const rot = cmd.rot ?? 0;
    const err = moveError(state, cmd.uid, cmd.col, cmd.row, rot);
    if (err) {
      const p = byUid(state, cmd.uid);
      const code = p && placeErrorCode(state, DEFS[p.id], cmd.col, cmd.row, rot, false, cmd.uid);
      const reason: RejectReason = !p
        ? 'missing'
        : code === 'parcel' || code === 'land'
          ? 'bounds'
          : code === 'bounds' || code === 'overlap'
            ? code
            : 'gate';
      return reject(state, reason, err);
    }
    const s = clone(state);
    const p = byUid(s, cmd.uid) as Placed;
    const from = { col: p.col, row: p.row, rot: p.rot };
    const events: SimEvent[] = [];
    if (from.col === cmd.col && from.row === cmd.row && from.rot === rot) return { state, events: [] };
    p.col = cmd.col;
    p.row = cmd.row;
    p.rot = rot;
    s.pairs = s.pairs.filter((k) => {
      const [, a, b] = k.split(':');
      return Number(a) !== p.uid && Number(b) !== p.uid;
    });
    events.push({ type: 'moved', uid: p.uid, from, to: { col: p.col, row: p.row, rot } });
    sendHome(s, p.uid, events);
    // 建好的马上按新位置凑组合；还在建的等建好再算
    if (p.build >= 1) addPairs(s, p, events);
    return { state: s, events };
  }
  if (cmd.type === 'lights' || cmd.type === 'hireCoach') {
    const lights = cmd.type === 'lights';
    const info = lights ? lightsInfo(state, cmd.uid) : coachInfo(state, cmd.uid);
    if (!info) return reject(state, 'missing', lights ? '这里装不了灯' : '这里请不了教练');
    if (!info.can) return reject(state, state.money < info.cost ? 'money' : 'locked', info.need ?? '还不行');
    const s = clone(state);
    const p = byUid(s, cmd.uid) as Placed;
    s.money -= info.cost;
    if (lights) {
      p.lights = true;
      // 一天马上拉长到 21:00（钟点不跳：按现在几点换算 time）
      const hours = hoursFor(s);
      if (hours !== s.dayHours) {
        const h = clockHour(s);
        s.dayHours = hours;
        s.time = (h - DAY_START_HOUR) / hours;
      }
      log(s, `${nameOf(p.id)}装了夜场灯（$${info.cost}）`);
      return { state: s, events: [{ type: 'lightsOn', uid: p.uid, cost: info.cost }] };
    }
    p.coach = true;
    log(s, `${nameOf(p.id)}请了教练（$${info.cost}）`);
    return { state: s, events: [{ type: 'coachHired', uid: p.uid, cost: info.cost }] };
  }
  if (cmd.type === 'buyLand') {
    const info = landInfo(state, cmd.side);
    if (!info) return reject(state, 'missing', '这边已经买了');
    if (!info.can) return reject(state, state.money < info.cost ? 'money' : 'locked', info.need ?? '还不能买');
    const s = clone(state);
    s.money -= info.cost;
    s.lotCols = cmd.side === 'west' ? [0, s.lotCols[1]] : [s.lotCols[0], LOT_W - 1];
    const features = s.placed
      .filter((p) => isTerrainDef(DEFS[p.id]) && p.col >= info.cols[0] && p.col <= info.cols[1])
      .map((p) => p.uid);
    log(s, `买下了${cmd.side === 'west' ? '西' : '东'}边的地（$${info.cost}）`);
    return {
      state: s,
      events: [{ type: 'landBought', side: cmd.side, cols: info.cols, cost: info.cost, features }],
    };
  }
  if (cmd.type === 'enterCup') {
    const o = offerInfo(state);
    if (!o || o.entered) return reject(state, 'missing', '这周没有比赛邀请');
    if (state.money < o.fee) return reject(state, 'money', `钱不够 $${o.fee}`);
    const s = clone(state);
    s.money -= o.fee;
    s.cup = { id: o.id, day: o.day };
    s.offer = null;
    log(s, `承办${o.name}（第 ${o.day} 天，报名费 $${o.fee}）`);
    return { state: s, events: [{ type: 'cupEntered', id: o.id, day: o.day, fee: o.fee }] };
  }
  if (cmd.type === 'declineCup') {
    if (!state.offer) return reject(state, 'missing', '这周没有比赛邀请');
    const s = clone(state);
    const id = s.offer?.id ?? '';
    s.offer = null;
    return { state: s, events: [{ type: 'cupDeclined', id }] };
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
  let refund = removeRefund(state, cmd.uid, cmd.type === 'remove' && cmd.refund === 'full');
  if (isTerrainDef(def)) {
    const cc = def.cat === 'terrain' ? def.clearCost : undefined;
    if (cc === undefined) return reject(state, 'gate', `${def.name}拆不掉`);
    if (!rowOpen(state, p0.row)) return reject(state, 'bounds', lockedRowText(p0.row));
    if (!colOpen(state, p0.col)) return reject(state, 'bounds', lockedLandText(state));
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
  // 正往这里走 / 在这里待着的客人：直接回家；计划里的后一站被拆了：去掉
  sendHome(s, p.uid, events);
  for (const v of s.visitors) v.stops = v.stops.filter((u, k) => k <= v.i || u !== p.uid);
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

/** 能不能装夜场灯：null = 这里装不了（不是硬地 / 红土 / 匹克，或者已经装了）；need = 还差什么 */
export function lightsInfo(s: State, uid: number): { can: boolean; cost: number; need?: string } | null {
  const p = byUid(s, uid);
  if (!p || p.lights) return null;
  const cost = LIGHTS.cost[p.id];
  if (cost === undefined) return null;
  let need: string | undefined;
  if (p.build < 1) need = '还在建';
  else if (s.star < LIGHTS.star) need = `★${LIGHTS.star} 以后能装`;
  else if (s.money < cost) need = `钱不够 $${cost}`;
  return { can: !need, cost, ...(need ? { need } : {}) };
}

/** 能不能请教练：null = 这里请不了（不是正式球场，或者已经有了）；need = 还差什么（会所 Lv3 以后才有教练肯来） */
export function coachInfo(s: State, uid: number): { can: boolean; cost: number; need?: string } | null {
  const p = byUid(s, uid);
  if (!p || p.coach) return null;
  const t = DEFS[p.id].tags;
  if (!t.includes('court') || t.includes('training')) return null;
  const house = s.placed.some((q) => DEFS[q.id].tags.includes('house') && q.lv >= COACH.houseLv && q.build >= 1);
  let need: string | undefined;
  if (p.build < 1) need = '还在建';
  else if (!house) need = `会所升到 Lv${COACH.houseLv} 以后才有教练肯来`;
  else if (s.money < COACH.cost) need = `钱不够 $${COACH.cost}`;
  return { can: !need, cost: COACH.cost, ...(need ? { need } : {}) };
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

/** 设施每天的维护费（等级越高越贵，加上灯和教练） */
export function upkeepOf(p: Placed): number {
  const def = DEFS[p.id];
  return (
    Math.round(def.upkeep * (LV_UPKEEP[p.lv - 1] ?? 1)) + (p.lights ? LIGHTS.upkeep : 0) + (p.coach ? COACH.upkeep : 0)
  );
}

/** 设施的实际收费（等级 × 教练 × 组合乘数） */
export function spendOf(state: State, p: Placed): { amount: number; base: number } {
  const def = DEFS[p.id];
  // 组合的加成相加（不连乘，免得后期一座设施叠出好几倍）
  let combo = 1;
  for (const c of activeCombos(state, p.uid)) combo += c.spend - 1;
  const k = (LV_MUL[p.lv - 1] ?? 1) * (p.coach ? COACH.spend : 1) * combo;
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

/** 能当第一站吗（客人为球场、泳池来；餐饮、球具店、会所是顺路消费；看台只在比赛日） */
export function firstStopOk(def: AnyDef, cupDay = false): boolean {
  if (def.cap <= 0) return false;
  const t = def.tags;
  if (t.includes('food') || t.includes('shop') || t.includes('house')) return false;
  if (t.includes('stand')) return cupDay;
  return true;
}

/** 一处位子一天大约能翻几次台（估容量用；走路时间按 6 秒估）；夜场另算 */
const turnsOf = (def: AnyDef) => OPEN_SEC / (stayOf(def) + 6);
const nightTurnsOf = (def: AnyDef) => NIGHT_SEC / (stayOf(def) + 6);

// ── 钟点 ────────────────────────────────────────────────

/** 现在几点（小数；有灯的日子一天 14 小时） */
export const clockHour = (s: State) => hourOf(s.time, s.dayHours);
/** 今天几点收盘：18 或 21（有装了灯的球场） */
export const dayEndHour = (s: State) => DAY_START_HOUR + s.dayHours;
/** 今天这一天有几游戏秒（1× 速度） */
export const dayLength = (s: State) => s.dayHours * SEC_PER_HOUR;
const hasLitCourt = (s: State) => s.placed.some((p) => p.lights && p.build >= 1);
const hoursFor = (s: State) => (hasLitCourt(s) ? NIGHT_END_HOUR - DAY_START_HOUR : DAY_HOURS);

/** 一个 tick 里不变的东西（布局只在命令和建好时变）：走得到的、各设施的吸引力、今天的比赛、是不是夜场 */
interface Ctx {
  reach: Set<number>;
  appeal: Map<number, number>;
  /** 今天办成的比赛（条件够） */
  cup: CupDef | null;
  night: boolean;
  /** 夜场的客流比例 = 有灯的第一站位子 / 全部第一站位子 */
  nightShare: number;
}
function makeCtx(s: State): Ctx {
  const reach = reachableSet(s);
  const appeal = new Map<number, number>();
  for (const p of s.placed) appeal.set(p.uid, appealOf(s, p, reach));
  const cup = cupToday(s, reach);
  let lit = 0;
  let all = 0;
  for (const p of s.placed) {
    if (p.build < 1 || !reach.has(p.uid) || !firstStopOk(DEFS[p.id], !!cup)) continue;
    all += capOf(p);
    if (p.lights) lit += capOf(p);
  }
  return { reach, appeal, cup, night: false, nightShare: all ? lit / all : 0 };
}

/** 能当这一刻的第一站吗（夜场只有装了灯的） */
const firstOk = (p: Placed, ctx: Ctx) => firstStopOk(DEFS[p.id], !!ctx.cup) && (!ctx.night || !!p.lights);

/** 白天吸引来的客人数（今天，按现在的布局；没有能当第一站的设施 = 0） */
function demandOf(s: State, ctx: Ctx): number {
  let sum = 0;
  let parking = 0;
  let hosts = false;
  for (const p of s.placed) {
    sum += ctx.appeal.get(p.uid) ?? 0;
    const def = DEFS[p.id];
    if (p.build < 1 || !ctx.reach.has(p.uid)) continue;
    if (def.tags.includes('parking')) parking++;
    if (firstStopOk(def, !!ctx.cup)) hosts = true;
  }
  if (!hosts) return 0;
  const base = BASE_VISITORS + s.members * MEMBER_VISIT + s.fame * FAME_VISITORS + appealVisitors(sum);
  const park = 1 + PARKING_MUL * Math.min(PARKING_MAX, parking);
  return base * park * s.buzz * (ctx.cup ? ctx.cup.mul : 1);
}
/** 加上夜场的一整天 */
const demandDay = (s: State, ctx: Ctx) =>
  demandOf(s, ctx) * (1 + (s.dayHours > DAY_HOURS ? (NIGHT_SEC / OPEN_SEC) * ctx.nightShare : 0));

/** 一天大约接得下几位：第一站的位子 × 翻台次数（有灯的加夜场），顺路设施的位子算一半（客满的人在那里等场） */
function capacityOf(s: State, ctx: Ctx): number {
  let c = 0;
  for (const p of s.placed) {
    const def = DEFS[p.id];
    if (p.build < 1 || def.cap <= 0 || !ctx.reach.has(p.uid)) continue;
    if (firstStopOk(def, !!ctx.cup)) {
      c += capOf(p) * turnsOf(def);
      if (p.lights && s.dayHours > DAY_HOURS) c += capOf(p) * nightTurnsOf(def);
    } else c += 0.5 * capOf(p) * turnsOf(def);
  }
  return c;
}

/** 预计客人：吸引来的、接得下的、预计 = 两者小的那个、预计客满走掉的 */
export function forecast(s: State): Forecast {
  const ctx = makeCtx(s);
  const demand = Math.round(demandDay(s, ctx));
  const capacity = Math.round(capacityOf(s, ctx));
  const visitors = Math.min(demand, capacity);
  return { demand, capacity, visitors, away: demand - visitors };
}

/** 吸引来的客人数（一整天、没取整、没和容量比） */
export function demandPerDay(s: State): number {
  return demandDay(s, makeCtx(s));
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

// ── 一周、比赛阶梯 ──────────────────────────────────────

const dowOf = (day: number) => (((day - 1) % 7) + 7) % 7;
const cupById = (id: string) => CUPS.find((c) => c.id === id) ?? null;

/** 场上（建好、走得到）的家底：比赛的条件看它 */
function assets(s: State, reach: Set<number>) {
  const a = { courts: 0, clay: 0, pool: 0, houseLv: 0, stands: 0, standLv: 0, lights: 0 };
  for (const p of s.placed) {
    if (p.build < 1 || !reach.has(p.uid)) continue;
    const t = DEFS[p.id].tags;
    if (t.includes('court') && !t.includes('training')) a.courts++;
    if (t.includes('clay')) a.clay++;
    if (t.includes('pool')) a.pool++;
    if (t.includes('house')) a.houseLv = Math.max(a.houseLv, p.lv);
    if (t.includes('stand')) {
      a.stands++;
      a.standLv = Math.max(a.standLv, p.lv);
    }
    if (p.lights) a.lights++;
  }
  return a;
}

/** 比赛的要求（一条一句） */
export function cupNeeds(cup: CupDef): string[] {
  const n = cup.need;
  const out: string[] = [];
  if (n.courts) out.push(`${n.courts} 片正式球场${n.clay ? `（其中 ${n.clay} 片红土）` : ''}`);
  if (n.pool) out.push('泳池');
  if (n.houseLv) out.push(`会所 Lv${n.houseLv}`);
  if (n.stands || n.standLv)
    out.push(`看台${n.stands && n.stands > 1 ? ` ${n.stands} 座` : ''}${n.standLv ? ` Lv${n.standLv}` : ''}`);
  if (n.lights) out.push(`${n.lights} 片球场装夜场灯`);
  return out;
}

/** 现在还缺什么（'' = 都够了） */
function cupMissing(s: State, cup: CupDef, reach: Set<number>): string {
  const a = assets(s, reach);
  const n = cup.need;
  const out: string[] = [];
  if ((n.courts ?? 0) > a.courts) out.push(`再建 ${(n.courts ?? 0) - a.courts} 片球场`);
  if ((n.clay ?? 0) > a.clay) out.push(`${(n.clay ?? 0) - a.clay} 片红土`);
  if ((n.pool ?? 0) > a.pool) out.push('泳池');
  if ((n.houseLv ?? 0) > a.houseLv) out.push(a.houseLv ? `会所升到 Lv${n.houseLv}` : `会所（Lv${n.houseLv}）`);
  if ((n.stands ?? 0) > a.stands) out.push(a.stands ? `再建 ${(n.stands ?? 0) - a.stands} 座看台` : '一座看台');
  else if ((n.standLv ?? 0) > a.standLv) out.push(a.stands ? `看台升到 Lv${n.standLv}` : `看台（Lv${n.standLv}）`);
  if ((n.lights ?? 0) > a.lights) out.push(`${(n.lights ?? 0) - a.lights} 片球场装灯`);
  return out.join('，');
}

/** 名气、星级都够的比赛（低到高） */
const openCups = (s: State) => CUPS.filter((c) => s.fame >= c.fame && s.star >= c.star);

/**
 * 这周来邀请的比赛：条件已经够的里面最高的一档；一档都不够就是开放了的最高一档（让玩家看到要准备什么）。★2 以前 null
 */
export function bestCup(s: State): CupDef | null {
  const open = openCups(s);
  if (!open.length) return null;
  const reach = reachableSet(s);
  const ready = open.filter((c) => !cupMissing(s, c, reach));
  return ready[ready.length - 1] ?? open[open.length - 1];
}

/** 今天办的比赛（承办了、今天就是那个周日、条件够） */
function cupToday(s: State, reach: Set<number>): CupDef | null {
  if (!s.cup || s.cup.day !== s.day) return null;
  const c = cupById(s.cup.id);
  return c && !cupMissing(s, c, reach) ? c : null;
}

function offerOf(s: State, id: string, day: number, entered: boolean): CupOffer | null {
  const c = cupById(id);
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    day,
    fee: c.fee,
    prize: c.prize,
    perFan: c.perFan,
    fameGain: c.fameGain,
    needs: cupNeeds(c),
    missing: cupMissing(s, c, reachableSet(s)),
    bonusText: c.bonus.text,
    bonusMul: c.bonus.mul,
    entered,
  };
}

/** 这周的比赛：承办了的（entered true）或者还没回的邀请；都没有 null。日历条的倒计时、"缺什么"用它 */
export function offerInfo(s: State): CupOffer | null {
  if (s.cup) return offerOf(s, s.cup.id, s.cup.day, true);
  if (s.offer) return offerOf(s, s.offer.id, s.offer.day, false);
  return null;
}

/**
 * 一周日历（day 默认今天）：dow 0 = 周一；tag = 青训日 / 家庭日 / 比赛名；
 * 周日那格：cupName = 这周的比赛（承办了的、邀请的或者能接的最高一档），cupReady / need = 现在的布局够不够；★2 以前 need = "★2 开放"。
 */
export function dayInfo(
  s: State,
  day = s.day,
): {
  dow: number;
  name: string;
  tag: string | null;
  cup: boolean;
  cupReady: boolean;
  need: string;
  cupName: string | null;
  entered: boolean;
  offered: boolean;
} {
  const dow = dowOf(day);
  const id = s.cup?.id ?? s.offer?.id ?? bestCup(s)?.id ?? null;
  const c = id ? cupById(id) : null;
  const need = c ? cupMissing(s, c, reachableSet(s)) : `★${CUPS[0].star} 开放`;
  return {
    dow,
    name: WEEKDAYS[dow],
    tag: dow === 6 ? (c?.name ?? WEEK_TAG[dow]) : WEEK_TAG[dow],
    cup: dow === 6,
    cupReady: !!c && !need,
    need,
    cupName: c?.name ?? null,
    entered: !!s.cup,
    offered: !!s.offer,
  };
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
  /** 'money' 是旧的"手上的钱"，已经不会出现（留着让旧的 hud 比较能编译）；'has' = 建一座某设施（id 是哪种） */
  key: 'visitors' | 'buildings' | 'combos' | 'net' | 'members' | 'has' | 'money';
  label: string;
  have: number;
  need: number;
  done: boolean;
  id?: string;
}

/** 下一颗星的目标进度；满星 null。star = 下一颗星；next = 各项（items 是旧名字），goal = 原表的一行（旧接口） */
export function starProgress(
  state: State,
): { star: number; next: GoalItem[]; done: boolean; goal: StarGoal; items: GoalItem[] } | null {
  const goal = STAR_GOALS.find((g) => g.star === state.star + 1);
  if (!goal) return null;
  const raw: Omit<GoalItem, 'done'>[] = [
    { key: 'visitors', label: '累计客人', have: state.totalVisitors, need: goal.visitors },
    { key: 'buildings', label: '设施（不算装饰）', have: facilityCount(state), need: goal.buildings },
    { key: 'combos', label: '场上的组合', have: activeComboKinds(state).length, need: goal.combos },
    { key: 'net', label: '单日净收入', have: state.bestNet, need: goal.net },
    { key: 'members', label: '会员', have: state.members, need: goal.members },
    ...(goal.has ?? []).map((id) => ({
      key: 'has' as const,
      id,
      label: `建一座${nameOf(id)}`,
      have: state.placed.filter((p) => p.id === id && p.build >= 1).length,
      need: 1,
    })),
  ];
  const next = raw.filter((i) => i.need > 0).map((i) => ({ ...i, done: i.have >= i.need }));
  return { star: goal.star, next, done: next.every((i) => i.done), goal, items: next };
}

/** 有这个标签的设施名：先找场上已经有的（含地形），再找解锁了的 */
function nameForTag(s: State, tag: string): { name: string; placed: boolean } | null {
  const open = openRowStart(s);
  const onLot = s.placed.find(
    (p) => p.build >= 1 && p.row >= open && colOpen(s, p.col) && DEFS[p.id].tags.includes(tag),
  );
  if (onLot) return { name: nameOf(onLot.id), placed: true };
  const b = BUILDINGS.find((d) => d.tags.includes(tag) && d.star <= s.star && d.cat !== 'road');
  return b ? { name: b.name, placed: false } : null;
}

/** 开放的地里还有没有地方放得下（只看占地，不看钱、星级、路） */
export function fitsSomewhere(s: State, def: AnyDef): boolean {
  const occ = occupancy(s);
  const r0 = openRowStart(s);
  const [c0, c1] = s.lotCols;
  for (const [w, d] of [
    [def.w, def.d],
    [def.d, def.w],
  ])
    for (let row = r0; row + d <= LOT_D; row++)
      for (let col = c0; col + w - 1 <= c1; col++) {
        let ok = true;
        for (let y = row; y < row + d && ok; y++)
          for (let x = col; x < col + w; x++)
            if (occ[y * LOT_W + x] !== 0) {
              ok = false;
              break;
            }
        if (ok) return true;
      }
  return false;
}

/** 下一颗星第一个没完成的项（按 设施 → 建某座 → 组合 → 会员 → 净收入 → 客人 的顺序，客人放最后因为它自己会涨），一句能照做的话 */
export function nextGoalHint(s: State): string {
  const sp = starProgress(s);
  if (!sp) {
    const offer = offerInfo(s);
    if (offer && !offer.entered) return `满星了！${offer.name}来邀请了，承办它`;
    const next = CUPS.find((c) => c.fame > s.fame);
    return next ? `满星了！名气到 ${next.fame} 解锁${next.name}（现在 ${s.fame}）` : '满星了！每周日办冬季巡回赛';
  }
  const order: GoalItem['key'][] = ['buildings', 'has', 'combos', 'members', 'net', 'visitors'];
  const g = order.map((k) => sp.next.find((i) => i.key === k && !i.done)).find((i) => !!i);
  if (!g) return `★${sp.star} 的目标都够了，今天收盘就升星`;
  const n = g.need - g.have;
  switch (g.key) {
    case 'visitors': {
      const f = forecast(s);
      if (f.away > 0) return `还差 ${n} 位客人：客满会有人走掉，${turnAwayAdvice(s)}`;
      return `还差 ${n} 位客人：多放能吸引人的设施，凑组合`;
    }
    case 'buildings': {
      const opts = BUILDINGS.filter(
        (d) => d.star <= s.star && d.cat !== 'road' && d.cat !== 'deco' && fitsSomewhere(s, d),
      ).sort((a, b) => a.cost - b.cost);
      if (!opts.length) return `还差 ${n} 座设施，可地块满了：拆掉小的换大的${s.star >= LAND_STAR ? '，或者买地' : ''}`;
      const pick = opts.find((d) => d.cost <= s.money) ?? opts[0];
      return `还差 ${n} 座设施（装饰不算）：比如${pick.name} $${pick.cost}`;
    }
    case 'has': {
      const def = DEFS[g.id ?? ''];
      if (!def) return g.label;
      if (fitsSomewhere(s, def)) return `${g.label}（刚开放的北边那片正好放得下）`;
      return `${g.label}：先在开放的地里腾出 ${def.w}×${def.d} 的地方`;
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

/** 客满走人时能做什么（一句）：能升级的接客设施 → 装灯 → 再建一片 → 放顺路设施等场 */
export function turnAwayAdvice(s: State): string {
  const hosts = s.placed.filter((p) => p.build >= 1 && firstStopOk(DEFS[p.id]));
  for (const p of hosts) {
    const u = upgradeInfo(s, p.uid);
    if (u && p.served >= LV_AT[u.nextLv - 1]) return `把${nameOf(p.id)}升到 Lv${u.nextLv}（+${LV_CAP} 客位）`;
  }
  for (const p of hosts) if (lightsInfo(s, p.uid)?.can) return `给${nameOf(p.id)}装夜场灯（营业到 21:00）`;
  const more = s.star >= 1 ? DEFS.pickle : DEFS['practice-wall'];
  if (fitsSomewhere(s, more)) return `再建一片${more.name}`;
  if (s.star >= LAND_STAR && landPrice(s) !== null) return '买下旁边的地，再建球场';
  return '在球场旁边放咖啡车、球具店，客满的人会去那里等场';
}

// ── 时间 ────────────────────────────────────────────────

/** 时间往前走 dt 游戏秒（已经乘过速度） */
export function tick(state: State, dt: number): Result {
  const s = clone(state);
  const events: SimEvent[] = [];
  buildStep(s, dt, events);
  const ctx = makeCtx(s);

  const h0 = clockHour(s);
  s.time = Math.min(1, s.time + dt / dayLength(s));
  const h1 = clockHour(s);

  // 来客：白天按吸引力；夜场（有灯）按有灯的位子占的比例
  const dayH = Math.max(0, Math.min(h1, H_CLOSE) - Math.max(h0, H_OPEN));
  const nightH = s.dayHours > DAY_HOURS ? Math.max(0, Math.min(h1, H_NIGHT_CLOSE) - Math.max(h0, H_CLOSE)) : 0;
  if (dayH > 0 || nightH > 0) {
    const per = demandOf(s, ctx);
    ctx.night = h1 > H_CLOSE;
    const k = (dayH + nightH * ctx.nightShare) * SEC_PER_HOUR;
    if (per > 0 && k > 0) s.arrivalAcc += (per * k) / OPEN_SEC;
    while (s.arrivalAcc >= 1) {
      s.arrivalAcc -= 1 + (rand(s) - 0.5) * 0.6;
      spawnVisitor(s, ctx, events);
    }
  }
  ctx.night = h1 > H_CLOSE;
  const lastStop = dayEndHour(s) - 1.1;

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
      // 再去一个地方？（第二处 0.7，第三处 0.45）
      let next: Placed | null = null;
      const k = v.stops.length;
      if (k < MAX_STOPS && h1 < lastStop && rand(s) < (k === 1 ? SECOND_STOP : THIRD_STOP)) {
        next = pickTarget(s, ctx, v.guest, 'next', v.stops);
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
      addPairs(s, p, events);
    }
  }
}

function goOut(s: State, v: Visitor, from: Placed | null, events: SimEvent[]) {
  const r = from ? route(s, from.uid, null) : null;
  v.stage = 'out';
  v.t = r ? Math.max(0.5, (r.length - 1 + ROAD_TILES) / WALK_TPS) : 3;
  events.push({ type: 'visitorGo', vid: v.vid, from: from?.uid ?? -1, to: null });
}

/**
 * 给这位客人挑一个地方：吸引他、建好了、走得到、有空位；按吸引力加权（教练的球场对青少年 ×1.5）。
 * mode：first = 第一站（球场、泳池；夜场只有装灯的）；side = 第一站客满时先去顺路设施"等场"；next = 下一处（哪都行）
 */
function pickTarget(
  s: State,
  ctx: Ctx,
  guest: Guest,
  mode: 'first' | 'side' | 'next',
  exclude: number[] = [],
): Placed | null {
  const cands = s.placed.filter((p) => {
    const def = DEFS[p.id];
    return (
      p.build >= 1 &&
      def.cap > 0 &&
      def.guests.includes(guest) &&
      ctx.reach.has(p.uid) &&
      (mode !== 'first' || firstOk(p, ctx)) &&
      (mode !== 'side' || !firstStopOk(def, !!ctx.cup)) &&
      !exclude.includes(p.uid) &&
      occupantsOf(s, p.uid) < capOf(p)
    );
  });
  return pickWeighted(
    s,
    cands,
    (p) => ((ctx.appeal.get(p.uid) ?? 0) + 1) * (p.coach && guest === 'junior' ? COACH.junior : 1),
  );
}

function spawnVisitor(s: State, ctx: Ctx, events: SimEvent[]) {
  // 客群权重：能当第一站的设施吸引的客群（不管有没有空位），乘一周的客群倍数；会员按比例多一些；教练多招青少年
  const w: Record<Guest, number> = { member: 0, junior: 0, family: 0, fan: 0 };
  for (const p of s.placed) {
    const def = DEFS[p.id];
    if (p.build < 1 || !ctx.reach.has(p.uid) || !firstOk(p, ctx)) continue;
    const a = (ctx.appeal.get(p.uid) ?? 0) + 1;
    for (const g of def.guests) w[g] += ((g === 'junior' && p.coach ? COACH.junior : 1) * a) / def.guests.length;
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
  // 第一站客满：先去能接的顺路设施等场；两处都没位子才算走掉
  const target = pickTarget(s, ctx, guest, 'first') ?? pickTarget(s, ctx, guest, 'side');
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

/** 按设施种类记账：收入、建好的座数、"样子"（座数、等级、组合、灯、教练，变了才算有原因） */
function bookById(s: State): DayBook['byId'] {
  const out: DayBook['byId'] = {};
  const sig: Record<string, number[]> = {};
  for (const p of s.placed) {
    const def = DEFS[p.id];
    if (p.build < 1 || def.cat === 'road' || def.cat === 'terrain') continue;
    const b = (out[p.id] ??= { income: 0, n: 0, sig: '' });
    b.n++;
    const g = (sig[p.id] ??= [0, 0, 0, 0]);
    g[0] += p.lv;
    g[1] += activeCombos(s, p.uid).length;
    g[2] += p.lights ? 1 : 0;
    g[3] += p.coach ? 1 : 0;
  }
  for (const [id, g] of Object.entries(sig)) out[id].sig = `${out[id].n}/${g.join('/')}`;
  for (const [uid, st] of Object.entries(s.today.byUid)) {
    const p = byUid(s, Number(uid));
    if (p) (out[p.id] ??= { income: 0, n: 0, sig: '' }).income += st.income;
  }
  return out;
}

/** 某种设施收入变化的一条（不管是不是噪音） */
function diffItemOf(id: string, a: DayBook['byId'][string], b: DayBook['byId'][string]): DiffItem {
  const amount = a.income - b.income;
  const name = nameOf(id);
  const label = b.n === 0 && a.n > 0 ? `新的${name}` : a.n > b.n ? `多建的${name}` : a.n < b.n ? `拆掉的${name}` : name;
  return { label, amount, text: `${label} ${money(amount)}` };
}

/**
 * 和昨天比：按设施种类的收入变化 + 会费 + 维护费，挑变化最大的 3 条。
 * 只讲"有原因"的变化：这种设施的座数 / 等级 / 组合 / 灯 / 教练变了，或者变化超过 max($120, 昨天的 25%)；其余算随机波动。
 */
function diffItems(today: DayBook, y: DayBook): DiffItem[] {
  const items: DiffItem[] = [];
  const zero = { income: 0, n: 0, sig: '' };
  for (const id of new Set([...Object.keys(today.byId), ...Object.keys(y.byId)])) {
    const a = today.byId[id] ?? zero;
    const b = y.byId[id] ?? zero;
    const amount = a.income - b.income;
    if (!amount) continue;
    const changed = a.sig !== b.sig;
    if (!changed && Math.abs(amount) <= Math.max(120, 0.25 * b.income)) continue;
    items.push(diffItemOf(id, a, b));
  }
  const dd = today.dues - (y.dues ?? 0);
  if (Math.abs(dd) >= 50) items.push({ label: '会费', amount: dd, text: `会费 ${money(dd)}` });
  const du = -(today.upkeep - y.upkeep);
  if (du) items.push({ label: '维护费', amount: du, text: `维护费 ${money(du)}` });
  items.sort((p, q) => Math.abs(q.amount) - Math.abs(p.amount));
  return items.slice(0, 3);
}

/** 星期的原因（放在收盘理由第一条）：今天是青训日 / 家庭日 / 比赛日，或者昨天是 */
function weekdayLine(day: number, today: DayBook, y: DayBook | null, cupName: string | null): string | null {
  const dow = dowOf(day);
  const tag = dow === 6 ? cupName : WEEK_TAG[dow];
  const yTag = dowOf(day - 1) === 6 ? (y?.cup ?? null) : WEEK_TAG[dowOf(day - 1)];
  const top = () => {
    if (!y) return '';
    const zero = { income: 0, n: 0, sig: '' };
    const best = Object.keys(today.byId)
      .map((id) => diffItemOf(id, today.byId[id], y.byId[id] ?? zero))
      .sort((a, b) => b.amount - a.amount)[0];
    return best && best.amount > 0 ? `：${best.text}` : '';
  };
  if (tag) return `${WEEKDAYS[dow]}${tag}${top()}`;
  if (yTag) return `今天${WEEKDAYS[dow]}，${dowOf(day - 1) === 6 ? '比赛日的球迷' : `${yTag}的客人`}走了`;
  return null;
}

function settle(s: State, ctx: Ctx, events: SimEvent[]) {
  for (const v of s.visitors) events.push({ type: 'visitorLeave', vid: v.vid });
  s.visitors = [];
  const day = s.day;
  const t = s.today;
  const built = s.placed.filter((p) => p.build >= 1 && !isTerrainDef(DEFS[p.id]));
  const upkeep = built.reduce((a, p) => a + upkeepOf(p), 0);
  // 会费（按昨天收盘时的会员数）：算进今天的收入
  const dues = s.members * MEMBER_FEE;
  s.money += dues - upkeep;
  t.income += dues;
  const net = t.income - upkeep;
  s.bestNet = Math.max(s.bestNet, net);
  const reasons: string[] = [];

  // 比赛日（承办了的那个周日）
  let prize = 0;
  let cupName: string | null = null;
  if (s.cup && s.cup.day === day) {
    const c = cupById(s.cup.id);
    if (c) {
      cupName = c.name;
      const held = !!ctx.cup;
      const why = held ? '' : cupMissing(s, c, ctx.reach);
      let bonus = false;
      let fameGain = 0;
      let standFill = 0;
      let food = 0;
      if (held) {
        bonus =
          c.bonus.kind === 'noAway'
            ? t.turnedAway === 0
            : c.bonus.kind === 'fans'
              ? t.fans >= c.bonus.n
              : activeComboKinds(s).length >= c.bonus.n;
        prize = Math.round((c.prize + c.perFan * t.fans) * (bonus ? c.bonus.mul : 1));
        fameGain = c.fameGain;
        s.money += prize;
        s.fame += fameGain;
        s.cupsWon.push(c.id);
        let seats = 0;
        let fill = 0;
        for (const p of s.placed) {
          const d = DEFS[p.id];
          if (p.build < 1) continue;
          if (d.tags.includes('stand')) {
            seats += capOf(p) * turnsOf(d);
            fill += t.byUid[p.uid]?.guests ?? 0;
          }
          if (d.tags.includes('food')) food += t.byUid[p.uid]?.income ?? 0;
        }
        standFill = seats ? Math.min(1, fill / seats) : 0;
        reasons.push(
          `${c.name}办成了：${t.fans} 位球迷，奖金 $${prize}${bonus ? `（${c.bonus.text}，×${c.bonus.mul}）` : ''}，名气 +${fameGain}`,
        );
        log(s, `第 ${day} 天${c.name}：球迷 ${t.fans} 位，奖金 $${prize}`);
      } else reasons.push(`${c.name}没办成（报名费不退）：还缺${why}`);
      events.push({
        type: 'cupResult',
        day,
        id: c.id,
        name: c.name,
        held,
        fans: t.fans,
        prize,
        bonus,
        bonusText: c.bonus.text,
        fameGain,
        fame: s.fame,
        standFill,
        food,
        why,
      });
      events.push({ type: 'clubCup', day, held, fans: t.fans, prize, fame: s.fame, need: why });
    }
    s.cup = null;
  }
  if (s.offer && s.offer.day <= day) s.offer = null;

  // 和昨天比
  const book: DayBook = {
    income: t.income,
    dues,
    upkeep,
    net,
    visitors: t.visitors,
    byId: bookById(s),
    cup: cupName,
  };
  const y = s.yesterday;
  const items = y ? diffItems(book, y) : [];
  const weekday = weekdayLine(day, book, y, cupName);
  const diff = y
    ? {
        income: t.income - y.income,
        net: net - y.net,
        visitors: t.visitors - y.visitors,
        items,
        weekday,
      }
    : null;
  if (weekday) reasons.push(weekday);
  if (diff) {
    if (items.length) reasons.push(`比昨天 ${money(diff.net)}：${items.map((i) => i.text).join('，')}`);
    else if (!weekday) reasons.push('和昨天差不多（每天的客人有点随机）');
  } else {
    const top = Object.entries(book.byId).sort((a, b) => b[1].income - a[1].income)[0];
    if (top && top[1].income > 0) reasons.push(`${nameOf(top[0])}赚得最多：$${top[1].income}`);
  }
  if (dues > 0) reasons.push(`会费：${s.members} 位会员 $${dues}`);
  if (t.comboBonus > 0) reasons.push(`组合和等级加成多赚了 $${t.comboBonus}`);
  if (t.turnedAway > 0) reasons.push(`${t.turnedAway} 位客人连等场的地方都没有，走了 —— ${turnAwayAdvice(s)}`);
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

  // 口碑：连等场的地方都满了、走掉太多，明天少来一点
  s.buzz = t.turnedAway >= 3 && t.turnedAway > t.visitors * AWAY_SHARE ? BUZZ_BAD : 1;
  if (s.buzz < 1) reasons.push('口碑：客满走掉的人太多，明天来的人少一点');
  const lit = built.filter((p) => p.lights).length;
  const coaches = built.filter((p) => p.coach).length;
  reasons.push(
    `维护费 ${built.filter((p) => p.id !== 'path').length} 处设施${lit ? `、${lit} 套灯` : ''}${coaches ? `、${coaches} 位教练` : ''}共 $${upkeep}`,
  );

  log(s, `第 ${day} 天收盘：收入 $${t.income}，维护 $${upkeep}，客人 ${t.visitors} 位`);
  s.yesterday = book;

  // 开业一个月：评分卡（PLS 式），之后照样经营
  let scored = false;
  if (day === SCORE_DAY) {
    const parts = [
      { label: '累计客人 ÷ 50', value: s.totalVisitors, points: Math.floor(s.totalVisitors / 50) },
      { label: '会员 × 2', value: s.members, points: s.members * 2 },
      { label: '场上的组合 × 20', value: activeComboKinds(s).length, points: activeComboKinds(s).length * 20 },
      { label: '办成的比赛 × 100', value: s.cupsWon.length, points: s.cupsWon.length * 100 },
      { label: '名气 × 30', value: s.fame, points: s.fame * 30 },
    ];
    events.push({ type: 'seasonScore', day, total: parts.reduce((a, p) => a + p.points, 0), parts });
    scored = true;
  }

  // 升星（一天最多升一颗）
  const sp = starProgress(s);
  const up = !!sp?.done;
  const oldStart = openRowStart(s);
  let unlocked: string[] = [];
  if (sp?.done) {
    s.star = sp.star;
    s.lotRows = Math.max(s.lotRows, rowsForStar(s.star));
    unlocked = BUILDINGS.filter((b) => b.star === s.star).map((b) => b.id);
    if (s.star >= 2) s.fame += STAR_FAME;
    log(s, `升到 ★${s.star}！解锁：${unlocked.map(nameOf).join('、')}`);
  }

  // 明天
  s.day++;
  s.time = 0;
  s.arrivalAcc = 0;
  s.today = emptyDay();
  s.dayHours = hoursFor(s);
  const hint = nextGoalHint(s);
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
    blocking: day % 7 === 0 || up || net < 0 || t.found > 0 || !!cupName || scored,
    hint,
  });
  if (up) {
    events.push({ type: 'starUp', star: s.star, unlocked, rows: s.lotRows });
    const start = openRowStart(s);
    if (start < oldStart) {
      const features = s.placed
        .filter((p) => isTerrainDef(DEFS[p.id]) && p.row >= start && p.row < oldStart && colOpen(s, p.col))
        .map((p) => p.uid);
      events.push({ type: 'parcelOpened', rows: [start, oldStart - 1], features });
      log(s, `地块往北开放了 ${oldStart - start} 行`);
    }
  }
  // 比赛邀请：周日前 CUP_OFFER_DAYS 天（周四）主办方来
  if (dowOf(s.day) === 6 - CUP_OFFER_DAYS && !s.cup) {
    const c = bestCup(s);
    if (c) {
      s.offer = { id: c.id, day: s.day + CUP_OFFER_DAYS };
      const offer = offerInfo(s);
      if (offer) events.push({ type: 'cupOffer', offer });
      log(s, `${c.name}邀请你承办（第 ${s.offer.day} 天，报名费 $${c.fee}）`);
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
