// 俱乐部的一天 · 排日程（startDay 用）：今天谁来、几点到、从哪进、和谁一起、想干什么；员工几点上班、几点歇、几点下班。
// 设计：docs/design/club-sim.md 第四节 4.1、4.2，第六节（周几、季节、天气）。
// 纯函数：同样的种子、天、天气、地点表、演员表 → 一模一样的日程（种子哈希，不用 Math.random）。
import { weekdayOf } from '../cast/casting';
import { makePerson } from '../cast/crowd';
import { chance, clamp, hashOf, int, normal, pick, type Rng, rngOf, weighted } from '../cast/rng';
import { isFixedRole, slotInfo } from '../cast/slots';
import type { CastPerson, Home, Role, SceneId, SlotInfo } from '../cast/types';
import type {
  Agent,
  CarMode,
  Doing,
  Intent,
  Minute,
  Party,
  Place,
  PlaceId,
  PlaceKind,
  SimConfig,
  Weather,
} from './types';

// ── 时钟、日历、天气 ─────────────────────────────────────────────────────────────

export const H = (h: number, m = 0): Minute => h * 60 + m;
/** startDay 的时刻（员工最早 5:30 到） */
export const DAY_START = H(5);
/** 营业（会员、客人能来的时间） */
export const OPEN = H(6, 30);
export const CLOSE = H(22);
/** 员工全走光以后（报告跑到这里） */
export const DAY_END = H(23, 15);

const pad = (n: number) => String(n).padStart(2, '0');
/** 分钟 → "07:40" */
export const hm = (t: Minute) => `${pad(Math.floor(t / 60))}:${pad(Math.floor(t) % 60)}`;

/** 第 1 天 = 2026-11-23（周一），旺季开头 */
const DAY1 = Date.UTC(2026, 10, 23);
export const WEEKDAY_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export type Season = 'peak' | 'shoulder' | 'summer';
export const SEASON_ZH: Record<Season, string> = { peak: '旺季', shoulder: '平季', summer: '夏天' };

export interface Calendar {
  dayNo: number;
  /** 0 = 周一 */
  weekday: number;
  weekend: boolean;
  month: number;
  date: string;
  season: Season;
  /** 今晚中心球场有表演赛（18:30） */
  exhibition: boolean;
  /** 青训课的开始时刻 */
  lessons: Minute[];
}

export function calendar(dayNo: number, weather?: Weather): Calendar {
  const d = new Date(DAY1 + (dayNo - 1) * 86400000);
  const month = d.getUTCMonth() + 1;
  const weekday = weekdayOf(dayNo);
  const weekend = weekday >= 5;
  const season: Season = [6, 7, 8, 9].includes(month) ? 'summer' : [5, 10].includes(month) ? 'shoulder' : 'peak';
  const rain = weather?.rain ?? false;
  const exhibition = !rain && (season === 'summer' ? weekday === 5 : weekday === 2 || weekday === 4 || weekday === 5);
  const lessons =
    season === 'summer' ? [H(8), H(9, 30)] : weekend ? [H(9), H(10, 30), H(15, 30)] : [H(15, 30), H(16, 30)];
  return {
    dayNo,
    weekday,
    weekend,
    month,
    date: `${d.getUTCFullYear()}-${pad(month)}-${pad(d.getUTCDate())}`,
    season,
    exhibition,
    lessons: rain ? [] : lessons,
  };
}

/** 每月的平均最高温（Indian Wells，摄氏） */
const HIGH = [0, 21, 23, 27, 31, 36, 41, 42, 41, 38, 32, 26, 21];

export function defaultWeather(seed: number, dayNo: number): Weather {
  const r = rngOf(seed, 'weather', dayNo);
  const m = calendar(dayNo).month;
  const high = Math.round(HIGH[m] + normal(r, 0, 2));
  const rain = r() < ([12, 1, 2].includes(m) ? 0.06 : [7, 8].includes(m) ? 0.04 : 0.02);
  const wind = r() < ([3, 4, 5].includes(m) ? 0.15 : 0.04);
  return { high, rain, wind };
}

/** 此刻的气温：清晨 5 点最低（比最高低 15 度），下午 3 点最高 */
export function tempAt(w: Weather, t: Minute): number {
  const ph = ((t - H(15)) / (24 * 60)) * Math.PI * 2;
  return w.high - 7.5 + 7.5 * Math.cos(ph) - (w.rain ? 5 : 0);
}

/** 热（0..1）：26 度以下不算热，40 度满 */
export const heatAt = (w: Weather, t: Minute) => clamp((tempAt(w, t) - 26) / 14, 0, 1);

/** 午后（13:00–15:30）：吃完饭最不想动的时候（0..1，两头半小时渐变） */
export function middayAt(t: Minute): number {
  if (t < H(12, 30) || t > H(16)) return 0;
  if (t < H(13)) return (t - H(12, 30)) / 30;
  if (t > H(15, 30)) return (H(16) - t) / 30;
  return 1;
}

/** 室外打球的意愿降多少（0..1）：午后 + 热；下雨、风沙全降 */
export function outdoorPenalty(w: Weather, t: Minute): number {
  if (w.rain) return 1;
  const heat = heatAt(w, t);
  const p = middayAt(t) * (0.35 + 0.65 * heat) + heat * 0.35;
  return clamp(p + (w.wind ? 0.4 : 0), 0, 1);
}

// ── 地点索引 ─────────────────────────────────────────────────────────────────────

const OUTDOOR_KINDS: readonly PlaceKind[] = [
  'court',
  'pickle',
  'golf',
  'pool',
  'lounger',
  'play',
  'seat',
  'stand',
  'table',
];
export const isOutdoor = (p: Place) => !p.shade && OUTDOOR_KINDS.includes(p.kind);
/** 有顶的（会所里头、凉亭、拱廊、凉棚）：伞下、帆下的长椅挡太阳不挡雨 */
export const roofed = (p: Place) => /凉亭|拱廊|凉棚/.test(p.name) || (p.scene === 'clubhouse' && !/露台/.test(p.name));
/** 下雨淋得到的（下雨天关）：室外的场、座、桌、池子，没有顶的 */
export const rainedOn = (p: Place) => OUTDOOR_KINDS.includes(p.kind) && !roofed(p);
/** 只能一伙人用的（场、桌、高尔夫）：不和陌生人拼。青训课、团课虽然标了 party，是好几家的孩子一起上，不算 */
export const isExclusive = (p: Place) =>
  (!!p.party && p.kind !== 'lesson' && p.kind !== 'gym') ||
  p.kind === 'court' ||
  p.kind === 'pickle' ||
  p.kind === 'golf';
/** 窗口（点单的摊位、咖啡吧台、果昔窗口，places.ts 里 doing 'order'） */
export const isCounter = (p: Place) => (p.kind === 'stall' || p.kind === 'cafe') && p.doing === 'order';
/** 自助饮水点（stall、doing 'drink'、不要摊主） */
export const isWater = (p: Place) => p.kind === 'stall' && p.doing === 'drink' && !p.needs;
/** 一伙人只要一个人去的（排队、服务时间短，完了去别处）：前台、窗口、饮水点 */
export const isService = (p: Place) =>
  p.kind === 'desk' || p.kind === 'stall' || isCounter(p) || (p.cap === 1 && (p.queue ?? 0) > 0 && !isExclusive(p));

const DRINK_RE = /coffee|agua|boba|smoothie|nutri|cart|drink|juice|lemon|咖啡|鲜果|奶茶|果昔|饮料|饮品|柠檬/i;
const FOOD_RE = /taco|pizza|burger|churro|paleta|grill|kitchen|snack|塔可|披萨|汉堡|吉事果|冰棍|烤|餐|厨/i;
/** 正餐（塔可、披萨、汉堡、会所厨房）和零食（吉事果、冰棍、奶茶、果昔）分开：零食不算一顿饭 */
const MEAL_RE = /taco|pizza|burger|grill|kitchen|塔可|披萨|汉堡|烤|厨/i;
const SNACK_RE = /churro|paleta|boba|smoothie|nutri|吉事果|冰棍|奶茶|果昔/i;
/** 能买喝的（窗口、饮水点、酒吧） */
export const servesDrink = (p: Place) =>
  p.kind === 'bar' || isWater(p) || (isCounter(p) && (p.kind === 'cafe' || DRINK_RE.test(`${p.id} ${p.name}`)));
/** 能买吃的（咖啡吧、酒吧也有简餐；饮水点不算） */
export const servesFood = (p: Place) =>
  p.kind === 'bar' ||
  (isCounter(p) &&
    (p.kind === 'cafe'
      ? !/果昔|nutri/i.test(`${p.id}${p.name}`)
      : FOOD_RE.test(`${p.id} ${p.name}`) || !DRINK_RE.test(`${p.id} ${p.name}`)));

/** 能吃一顿正餐的（塔可、披萨、汉堡、会所咖啡吧的简餐、酒吧） */
export const servesMeal = (p: Place) =>
  p.kind === 'bar' ||
  (isCounter(p) && (p.kind === 'cafe' ? !/果昔|nutri/i.test(`${p.id}${p.name}`) : MEAL_RE.test(`${p.id} ${p.name}`)));
/** 卖零食的（吉事果、冰棍、奶茶、果昔、咖啡吧的点心） */
export const servesSnack = (p: Place) => isCounter(p) && (p.kind === 'cafe' || SNACK_RE.test(`${p.id} ${p.name}`));

export interface PlaceIndex {
  list: readonly Place[];
  byId: Map<PlaceId, Place>;
  byKind: Map<PlaceKind, Place[]>;
  entries: Place[];
  /** 地点 → 在 list 里的序号（排序稳定） */
  order: Map<PlaceId, number>;
}

const IDX = new WeakMap<readonly Place[], PlaceIndex>();
export function indexPlaces(places: readonly Place[]): PlaceIndex {
  let idx = IDX.get(places);
  if (idx) return idx;
  const byKind = new Map<PlaceKind, Place[]>();
  for (const p of places) {
    let l = byKind.get(p.kind);
    if (!l) byKind.set(p.kind, (l = []));
    l.push(p);
  }
  idx = {
    list: places,
    byId: new Map(places.map((p) => [p.id, p])),
    byKind,
    entries: byKind.get('entry') ?? [],
    order: new Map(places.map((p, i) => [p.id, i])),
  };
  IDX.set(places, idx);
  return idx;
}

export const kindsOf = (idx: PlaceIndex, k: PlaceKind) => idx.byKind.get(k) ?? [];

/** 在场上"打着"的（看台、场边长椅上的人看的就是这些）：打球、上课、带课、热身、孩子玩 */
export const LIVE_DOING: ReadonlySet<Doing> = new Set<Doing>([
  'tennis',
  'pickle',
  'lesson',
  'coach',
  'warmup',
  'kidplay',
  'golf',
]);
/** 有人看的场（各处 faces 的并集） */
export function watchedPlaces(idx: PlaceIndex): PlaceId[] {
  const out = new Set<PlaceId>();
  for (const p of idx.list) for (const f of p.faces ?? []) out.add(f);
  return [...out];
}

/**
 * 引擎里走路的速度（米 / 游戏分钟）。真人 78 米 / 分钟，但观察的默认档是 2 游戏分钟 / 真实秒：
 * 照真人的速度，画面上一秒走 156 米，从停车场到前台一帧就过去了。12 米 / 分钟 → 画面上 24 米 / 秒（像延时摄影），
 * 看得出"一伙人刚下车往前台走"。代价：从停车场走到餐车院子 ≈ 15 分钟，日程按这个松（早点到、多待一会儿）。
 * 画面（clubwalk/sim）用同一个数插值路上的人。
 */
export const WALK_M_PER_MIN = 12;

/** 走过去要几分钟：直线 × 1.35 / 步速，向上取整，至少 1 */
export function travelMin(a: Place | undefined, b: Place | undefined, walk = WALK_M_PER_MIN): number {
  if (!a || !b || a === b) return a === b ? 0 : 1;
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  return Math.max(1, Math.ceil((d * 1.35) / walk));
}

type ForTag = NonNullable<Place['for']>[number];
export function forTag(role: Role): ForTag {
  if (role === 'vendor' || role === 'staff') return 'staff';
  return role;
}
/** 这个地方给不给这种人用（for 里的 'staff' = 所有固定岗位的人：员工、摊主、教练、球员） */
export const allows = (p: Place, role: Role) =>
  !p.for || p.for.includes(forTag(role)) || (isFixedRole(role) && p.for.includes('staff'));

// ── 人 ───────────────────────────────────────────────────────────────────────────

/** 等多久就不等了（分钟）：耐心属性折出来，急性子短，候鸟、老派长 */
export function patienceOf(p: CastPerson | undefined): number {
  if (!p) return 15;
  let m = 8 + p.attrs.patience * 0.3;
  if (p.traits.includes('impatient')) m *= 0.6;
  if (p.traits.includes('snowbird') || p.traits.includes('oldguard')) m *= 1.2;
  if (p.role === 'kid') m *= 0.8;
  return Math.round(m);
}

/** 饿得多快（每分钟，0..100 的刻度）：每个人不一样（种子定） */
export const hungerRate = (seed: number, id: string) => 0.2 + ((hashOf(seed, 'hunger', id) % 1000) / 1000) * 0.07;
/** 饿到多少就想吃 */
export function hungerLine(p: CastPerson | undefined): number {
  if (!p) return 72;
  if (p.traits.includes('foodie')) return 60;
  if (p.role === 'kid') return 66;
  return 72;
}

/** 上一顿饭的时刻（来之前在家吃的）：按到的时刻猜早饭 / 午饭 / 晚饭 */
function lastMeal(r: Rng, arrive: Minute): Minute {
  if (arrive < H(12, 15)) return Math.min(arrive - 20, H(7) + int(r, -45, 45));
  if (arrive < H(18)) return Math.min(arrive - 30, H(12, 30) + int(r, -30, 30));
  return arrive - int(r, 30, 90);
}

// ── 意图 ─────────────────────────────────────────────────────────────────────────

const I = (doing: Doing, minutes: number, o: Partial<Intent> = {}): Intent => ({ doing, minutes, ...o });
const K = (...k: PlaceKind[]): readonly PlaceKind[] => k;

export const intent = {
  checkin: () => I('checkin', 1, { kinds: K('desk') }),
  change: (r: Rng) => I('change', int(r, 5, 8), { kinds: K('locker') }),
  tennis: (r: Rng, long = false) => I('tennis', long ? int(r, 80, 110) : int(r, 60, 90), { kinds: K('court') }),
  pickle: (r: Rng) => I('pickle', int(r, 12, 18), { kinds: K('pickle') }),
  swim: (r: Rng, a = 20, b = 40) => I('swim', int(r, a, b), { kinds: K('pool') }),
  sun: (r: Rng, a = 40, b = 90) => I('sunbathe', int(r, a, b), { kinds: K('lounger') }),
  gym: (r: Rng) => I('gym', int(r, 40, 65), { kinds: K('gym') }),
  golf: (r: Rng) => I('golf', int(r, 22, 30), { kinds: K('golf') }),
  eat: (r: Rng, a = 25, b = 40) => I('eat', int(r, a, b), { kinds: K('stall', 'cafe', 'bar') }),
  snack: (r: Rng) => I('eat', int(r, 8, 14), { kinds: K('stall', 'cafe'), snack: true }),
  drink: (r: Rng, a = 8, b = 15) => I('drink', int(r, a, b), { kinds: K('stall', 'cafe', 'bar') }),
  bar: (r: Rng) => I('drink', int(r, 40, 75), { kinds: K('bar', 'cafe') }),
  lounge: (r: Rng) => I('drink', int(r, 25, 50), { kinds: K('cafe', 'bar', 'seat') }),
  watch: (r: Rng, a = 30, b = 60) => I('watch', int(r, a, b), { kinds: K('stand') }),
  rest: (r: Rng, a = 15, b = 30) => I('rest', int(r, a, b), { kinds: K('seat', 'stand') }),
  shop: (r: Rng) => I('shop', int(r, 10, 25), { kinds: K('shop') }),
  kidplay: (r: Rng, a = 20, b = 35) => I('kidplay', int(r, a, b), { kinds: K('play') }),
};

/** 一个人今天主要来干什么 */
export type Focus =
  | 'tennis'
  | 'clay'
  | 'pickle'
  | 'kidlesson'
  | 'swim'
  | 'sun'
  | 'gym'
  | 'golf'
  | 'eat'
  | 'bar'
  | 'lounge'
  | 'watch'
  | 'plaza'
  | 'shop'
  | 'kidplay';

const playsTennis = (p: CastPerson) => p.attrs.ntrp >= 2 && p.look.body === 'adult';

export function focusOf(home: Home | undefined, p: CastPerson, r: Rng): Focus {
  const s = home?.scene;
  const title = (home && slotInfo(home.scene, home.slot)?.title) ?? '';
  const plays = playsTennis(p) || (p.look.body === 'teen' && p.attrs.ntrp >= 2.5);
  // 有名有姓的人，身份里写着打什么（"晚场双打""匹克球迷""两边都打"）
  if (p.tier === 'named' && plays && (p.role === 'member' || p.role === 'guest')) {
    if (/两边都打/.test(p.title)) return chance(r, 0.5) ? 'pickle' : 'tennis';
    if (/匹克/.test(p.title)) return 'pickle';
    if (/双打|单打|网球/.test(p.title)) return s === 'clubclay' ? 'clay' : 'tennis';
  }
  if (p.role === 'kid' || p.role === 'parent') {
    if (s === 'clubcourts') return p.look.body === 'teen' && /练发球/.test(title) ? 'tennis' : 'kidlesson';
    if (s === 'clubpool') return 'swim';
    if (s === 'clubfood') return 'eat';
    if (s === 'clubstadium') return 'watch';
    return 'kidplay';
  }
  switch (s) {
    case 'clubclay':
      return /看/.test(title) || !plays ? 'watch' : 'clay';
    case 'clubcourts':
      return plays ? 'tennis' : 'watch';
    case 'clubpickle':
      return /看球|歇着/.test(title) && !chance(r, 0.5) ? 'watch' : plays || chance(r, 0.6) ? 'pickle' : 'watch';
    case 'clubplaza':
      return 'plaza';
    case 'clubstadium':
      return /观众|看球/.test(title) || !plays ? 'watch' : 'tennis';
    case 'clubhouse':
      if (/健身|卧推|深蹲|雪橇|沙袋|跑步|单车|划船|跟练|保护|理疗/.test(title)) return 'gym';
      if (/吧台|酒/.test(title)) return 'bar';
      if (/休息室|露台|拱廊/.test(title)) return 'lounge';
      if (/泳池/.test(title)) return 'swim';
      if (/拍子|球拍店|小卖部/.test(title)) return 'shop';
      return 'lounge';
    case 'clubpool':
      return /游泳|水里|来游泳/.test(title) ? 'swim' : 'sun';
    case 'clubgolf':
      return 'golf';
    case 'clubfood':
      return /路过|歇脚/.test(title) ? 'plaza' : 'eat';
    default:
      return plays ? (chance(r, 0.25) ? 'pickle' : 'tennis') : 'plaza';
  }
}

const OUTDOOR_FOCUS: readonly Focus[] = ['tennis', 'clay', 'pickle', 'golf', 'swim', 'sun', 'kidlesson', 'kidplay'];

/** 老伤（people.md："约他打会推掉，坐着聊最舒服"）：不上场，在场边看朋友打、聊天、喝咖啡 */
export const injured = (p: CastPerson) => p.traits.includes('oldinjury');
const isPlay = (i: Intent) => i.doing === 'tennis' || i.doing === 'pickle';

/** 主要的那一段 */
function mainBlock(f: Focus, r: Rng, p: CastPerson, budget: number): Intent[] {
  const sporty = p.traits.includes('sporty');
  if (injured(p) && (f === 'tennis' || f === 'clay' || f === 'pickle')) {
    // 场边坐着看（喜欢红土的去红土场边），喝一杯，再坐一会儿；不换衣服、不上场
    return [
      intent.watch(r, 40, 70),
      intent.lounge(r),
      chance(r, 0.5) ? I('rest', int(r, 25, 40), { kinds: K('gym', 'seat') }) : intent.rest(r, 15, 30),
    ];
  }
  switch (f) {
    case 'clay':
    case 'tennis': {
      const out = [intent.change(r), intent.tennis(r, sporty)];
      if (sporty && budget > 240) out.push(intent.drink(r), intent.tennis(r));
      if (chance(r, 0.55)) out.push(intent.change(r));
      return out;
    }
    case 'pickle': {
      // 一局 12–18 分钟，打完下场歇一口、喝口水，再排下一局（场让给拍架边等的人）
      const n = sporty ? int(r, 3, 5) : int(r, 2, 4);
      const out: Intent[] = [];
      for (let i = 0; i < n; i++) {
        if (i) out.push(I('rest', int(r, 3, 7), { kinds: K('stand', 'seat') }));
        out.push(intent.pickle(r));
      }
      return out;
    }
    case 'swim':
      return [intent.change(r), intent.swim(r), intent.sun(r), ...(chance(r, 0.5) ? [intent.swim(r, 15, 25)] : [])];
    case 'sun':
      return [intent.change(r), intent.sun(r, 60, 110), intent.swim(r, 15, 30)];
    case 'gym':
      return [intent.change(r), intent.gym(r), intent.change(r)];
    case 'golf': {
      // 一洞一洞地打：发球台、果岭轮着（每处 20–30 分钟）
      const out: Intent[] = [];
      for (let i = int(r, 3, 4); i > 0; i--) out.push(intent.golf(r));
      return out;
    }
    case 'eat':
      return [intent.eat(r, 35, 55)];
    case 'bar':
      return [intent.bar(r)];
    case 'lounge':
      return [intent.lounge(r)];
    case 'watch':
      return [intent.watch(r, 40, 70)];
    case 'plaza':
      return [intent.rest(r, 20, 40), intent.drink(r)];
    case 'shop':
      return [intent.shop(r)];
    default:
      return [intent.kidplay(r)];
  }
}

/** 路上平均要走几分钟（WALK_M_PER_MIN 下一处到下一处 60–90 米） */
const HOP = 7;
const planMinutes = (plan: readonly Intent[]) => plan.reduce((s, i) => s + i.minutes + HOP, 0);
const isMealTime = (t: Minute) => (t >= H(11, 30) && t <= H(13, 30)) || (t >= H(17, 45) && t <= H(20, 15));

/** 主要的干完以后，剩下的时间按性子、时辰挑几样 */
function fillUp(c: Ctx, plan: Intent[], r: Rng, p: CastPerson, start: Minute, end: Minute): void {
  const { cal, w } = c;
  let clock = start + planMinutes(plan);
  const t = p.traits;
  const calm = w.wind || w.rain;
  let ate = plan.some((x) => x.doing === 'eat' && !x.snack);
  for (let guard = 0; guard < 6 && end - clock > 35; guard++) {
    // 有表演赛的晚上：在场的人有三成去看（不是人人都去：酒吧、晚场照旧）
    if (cal.exhibition && clock >= H(17, 15) && clock <= H(19, 15) && end >= H(19) && chance(r, 0.35)) {
      plan.push(exhibitionWatch(c, r, p.id, end));
      break;
    }
    // 赶上饭点、还没吃：吃一顿（午饭、晚饭）
    if (!ate && isMealTime(clock) && end - clock > 50 && chance(r, t.includes('foodie') ? 0.95 : 0.7)) {
      plan.push(intent.eat(r));
      ate = true;
      clock += 40 + HOP;
      continue;
    }
    const hot = heatAt(w, clock) > 0.4 || middayAt(clock) > 0.5;
    const evening = clock >= H(17);
    const siesta = ate && clock >= H(12, 30) && clock < H(15, 30);
    const opts: [() => Intent, number][] = [
      [
        () => intent.lounge(r),
        2 + (t.includes('oldguard') ? 2 : 0) + (t.includes('chatty') ? 1.5 : 0) + (hot || calm ? 1.5 : 0),
      ],
      [() => intent.rest(r, 15, 30), 2 + (t.includes('gossip') ? 1 : 0)],
      [() => intent.watch(r, 25, 45), 1.5 + (t.includes('mentor') || t.includes('gossip') ? 2 : 0)],
      [() => intent.swim(r, 20, 35), calm ? 0 : (cal.season === 'summer' ? 3 : 0.8) + (hot ? 1.5 : 0)],
      [() => intent.sun(r, 30, 60), calm ? 0 : siesta ? 3 : hot && !evening ? 1.5 : 0.4],
      [() => intent.gym(r), t.includes('sporty') ? 2 : 0.5],
      [() => intent.shop(r), 0.6],
      [() => intent.bar(r), evening ? 3.5 : clock > H(15) ? 0.8 : 0],
    ];
    let next = weighted(r, opts)();
    // 健身一天一次就够了
    if (next.doing === 'gym' && plan.some((x) => x.doing === 'gym')) next = intent.lounge(r);
    // 换上泳衣（已经穿着就不再换）；从泳池出来去干别的，先换回来
    const wet = (x?: Intent) => x?.doing === 'swim' || x?.doing === 'sunbathe';
    const last = plan[plan.length - 1];
    if (wet(next) && !wet(last)) plan.push(intent.change(r));
    else if (!wet(next) && wet(last)) plan.push(intent.change(r));
    plan.push(next);
    clock += next.minutes + HOP;
  }
}

/** 看表演赛：中心球场的看台（按座位多少挑一面），18:30 开打 */
function exhibitionWatch(c: Ctx, r: Rng, who: string, end: Minute = H(20, 15)): Intent {
  const stands = kindsOf(c.idx, 'stand').filter((p) => p.scene === 'clubstadium');
  const at = stands.length
    ? weighted(
        rngOf(c.cfg.seed, 'stand', c.day, who),
        stands.map((p): [PlaceId, number] => [p.id, p.cap]),
      )
    : undefined;
  // 打完（≈ 20:05）前后十几分钟陆续起身：有人看到最后一分，有人赶在散场前走
  const minutes = clamp(end - H(18, 30), 40, int(r, 80, 110));
  return at
    ? I('watch', minutes, { at, after: H(18, 30), must: true })
    : I('watch', minutes, { kinds: K('stand'), after: H(18, 30) });
}

// ── 日程 ─────────────────────────────────────────────────────────────────────────

export interface DayPlan {
  agents: Record<string, Agent>;
  parties: Record<string, Party>;
  /** 模拟自己生成的人（客人、第二班顶岗） */
  people: Record<string, CastPerson>;
}

interface Visitor {
  p: CastPerson;
  arrive: Minute;
  leaveBy: Minute;
  focus: Focus;
  home?: Home;
  /** 已经分进哪伙人（索引） */
  group?: number;
}

interface Ctx {
  cfg: SimConfig;
  idx: PlaceIndex;
  day: number;
  cal: Calendar;
  w: Weather;
  agents: Record<string, Agent>;
  parties: Record<string, Party>;
  people: Record<string, CastPerson>;
  walk: number;
  /** 生成的客人编号（'guest:sim:<天>:<n>'） */
  n: number;
  /** 订好的场：场 → [开始, 结束][] */
  bookings: Map<PlaceId, [Minute, Minute][]>;
  /** 今天已经有人用了的名字（英文全名、中文名）：生成的人不撞名（不出第二个 Carmen） */
  names: Set<string>;
  zh: Set<string>;
  namedZh: Set<string>;
  /** 今天轮休的餐车（摊主的岗位） */
  closed: Set<PlaceId>;
  /** 夏天只开傍晚的餐车（中午没人吃，16:15 才来开窗） */
  evening: Set<PlaceId>;
  /** 每节青训课报了几个孩子（第几节 → 人数） */
  lessonKids: Map<number, number>;
}

/** 从 from 出发，按日程走到第 n 项之前要几分钟（每项去它种类里的第一个地点估：前台、更衣室只有一处） */
function leadIn(c: Ctx, from: Place | undefined, plan: readonly Intent[], n: number): [number, Place | undefined] {
  let m = 0;
  let at = from;
  for (let i = 0; i < n; i++) {
    const it = plan[i];
    const p = it.at ? c.idx.byId.get(it.at) : it.kinds?.length ? kindsOf(c.idx, it.kinds[0])[0] : undefined;
    m += travelMin(at, p, c.walk) + it.minutes;
    if (p) at = p;
  }
  return [m, at];
}

/** 约好的双打 / 单打提前订场：到了签到、换衣服，订的钟点上场（订不到 45 分钟以内的就到了再等） */
function bookCourt(
  c: Ctx,
  plan: Intent[],
  ids: readonly string[],
  arrive: Minute,
  leaveBy: Minute,
  clay: boolean,
  maxDelay = 45,
  entry?: PlaceId,
): number {
  const i = plan.findIndex((x) => x.doing === 'tennis' && !x.at);
  // 两个（单打）、四个（双打）；三个也订（一伙三个：缺的那个到了场边再凑，凑不上就三个人轮着打）
  if (i < 0 || ids.length < 2 || ids.length > 4) return -1;
  // 下车 → 签到 → 换衣服 → 走到场边（按走路的速度算，再留 5 分钟热身）
  const [pre, last] = leadIn(c, entry ? c.idx.byId.get(entry) : undefined, plan, i);
  const roles = ids.map((id) => c.agents[id]?.role ?? 'member');
  const courts = kindsOf(c.idx, 'court')
    .filter((p) => roles.every((r) => allows(p, r)) && !/发球机|machine/i.test(p.name))
    .sort((a, b) => (clay ? (a.scene === 'clubclay' ? 0 : 1) - (b.scene === 'clubclay' ? 0 : 1) : 0));
  const len = plan[i].minutes;
  for (let delay = 0; delay <= maxDelay; delay += 5) {
    const e0 = Math.ceil((arrive + pre + 5 + delay) / 5) * 5;
    if (e0 + len > leaveBy + 10 || e0 + len > CLOSE - 15) return -1;
    for (const p of courts) {
      const s = Math.ceil((e0 + travelMin(last, p, c.walk)) / 5) * 5;
      const e = s + len;
      const [a, b] = p.open ?? [OPEN, CLOSE];
      if (s < a || e > b) continue;
      // 挪钟点的不挪到午后最晒的时候
      if (
        maxDelay > 45 &&
        (middayAt(s) > 0 || middayAt(e - 30) > 0 || (c.cal.season === 'summer' && s > H(9) && s < H(17)))
      )
        continue;
      if (c.cal.weekday === 0 && p.scene === 'clubclay' && s < H(8)) continue;
      const l = c.bookings.get(p.id) ?? [];
      if (l.some(([x, y]) => s < y + 5 && e + 5 > x)) continue;
      l.push([s, e]);
      c.bookings.set(p.id, l);
      plan[i] = { ...plan[i], at: p.id, after: s, must: true };
      return delay;
    }
  }
  return -1;
}

const r$ = (c: Ctx, ...k: (string | number)[]) => rngOf(c.cfg.seed, 'plan', c.day, ...k);

function pickEntry(c: Ctx, p: CastPerson, how: 'car' | 'drop' | 'walk' | 'staff'): PlaceId {
  const es = c.idx.entries;
  if (!es.length) return c.idx.list[0]?.id ?? 'entry';
  const tag = (e: Place) => `${e.id} ${e.name}`;
  const drop = es.filter((e) => /drop|落客|valet|代客/i.test(tag(e)));
  const walk = es.filter((e) => /gate|walk|大门|路口|步行|走路/i.test(tag(e)));
  const lots = es.filter((e) => !drop.includes(e) && !walk.includes(e));
  const h = hashOf(c.cfg.seed, 'entry', p.id);
  // 孩子、少年（来当球童的也一样）不开车：大人在落客点放下
  if (p.look.body !== 'adult' || p.role === 'kid') how = 'drop';
  // 坐公交来的（Mateo："放学坐一小时公交来"）：车道东头的公交站走进来
  if (ridesBus(p)) how = 'walk';
  if (how === 'drop' && drop.length) return drop[h % drop.length].id;
  if (how === 'walk' && walk.length) return walk[h % walk.length].id;
  if (how === 'staff') {
    const s = lots.filter((e) => /南|south|lotS|staff|员工/i.test(tag(e)));
    if (s.length) return s[h % s.length].id;
  }
  const pool = lots.length ? lots : es;
  return pool[h % pool.length].id;
}

/** 坐公交来的（people.md 里写着坐公交） */
export const ridesBus = (p: CastPerson) => /公交/.test(p.bio) || p.likes.some((l) => /公交/.test(l));

const entryTag = (e: Place) => `${e.id} ${e.name}`;
export const isDropEntry = (e: Place) => /drop|落客|valet|代客/i.test(entryTag(e));
export const isWalkEntry = (e: Place) => /gate|walk|大门|路口|步行|走路/i.test(entryTag(e));
/** 停车场（有车位的出入口） */
export const isLot = (e: Place) => (e.stalls ?? 0) > 0;
/** 北 / 南停车场 → lotN / lotS */
export const lotMode = (e: Place): CarMode => (/北|north|lotN/i.test(entryTag(e)) ? 'lotN' : 'lotS');

/** 怎么来的（按出入口和这个人推）：员工停员工区；落客点 = 别人送（VIP 是代客泊车）；东头 = 走路；停车场 = 自己停 */
export function carOf(c: { idx: PlaceIndex }, p: CastPerson, entry: PlaceId): CarMode {
  const e = c.idx.byId.get(entry);
  if (!e) return 'walk';
  if (isDropEntry(e)) return p.traits.includes('vip') && p.look.body === 'adult' ? 'valet' : 'drop';
  if (isWalkEntry(e)) return 'walk';
  if (isFixedRole(p.role)) return 'staff';
  return lotMode(e);
}

function howCome(r: Rng, p: CastPerson, kids: boolean): 'car' | 'drop' | 'walk' {
  if (kids) return chance(r, 0.6) ? 'drop' : 'car';
  if (p.traits.includes('vip')) return 'drop';
  if (p.traits.includes('local') && chance(r, 0.35)) return 'walk';
  // 客人（不是会员）三成多叫车来（Palm Springs 的游客、住酒店的）；会员多半自己开（停车场 28 个车位，满了交代客）
  return chance(r, p.role === 'guest' ? 0.35 : 0.15) ? 'drop' : chance(r, 0.1) ? 'walk' : 'car';
}

function newAgent(c: Ctx, p: CastPerson, arrive: Minute, leaveBy: Minute, entry: PlaceId, plan: Intent[]): Agent {
  const r = r$(c, 'needs', p.id);
  const meal = lastMeal(r, arrive);
  const staff = isFixedRole(p.role);
  return {
    id: p.id,
    person: p.id,
    role: p.role,
    arrive,
    leaveBy,
    entry,
    plan,
    where: { kind: 'away' },
    doing: 'arrive',
    needs: {
      hunger: staff ? 10 : clamp(Math.round((arrive - meal) * hungerRate(c.cfg.seed, p.id)), 0, 80),
      thirst: int(r, 5, 30),
      tired: int(r, 0, 15),
    },
    patience: patienceOf(p),
    day: { waited: 0, gaveUp: 0, served: false, played: 0, ate: false },
    car: carOf(c, p, entry),
  };
}

// ── 员工 ─────────────────────────────────────────────────────────────────────────

interface Shift {
  start: Minute;
  end: Minute;
}

/** 按位置的名字（slots.ts 的 title）排班次：返回一班或两班（第二班由顶岗的人上） */
function shiftsFor(info: SlotInfo, p: CastPerson, c: Ctx, post: Place): Shift[] {
  const t = info.title;
  const ex = c.cal.exhibition;
  const S = (a: Minute, b: Minute): Shift => ({ start: a, end: b });
  let out: Shift[];
  // 跟着球员的教练：上午盯训练；有表演赛的日子下午来、盯到打完
  if (/跟着球员/.test(t)) out = [ex ? S(H(15, 15), H(20, 30)) : S(H(7, 45), H(11, 30))];
  // 两班的交接放在 15 点（午后最清静的 14 点那一个钟头不叠两个人）
  else if (/代客泊车|门童/.test(t)) out = [S(H(6), H(15)), S(H(15), H(22, 30))];
  else if (/救生员/.test(t)) out = [S(H(6, 40), H(13, 45)), S(H(13, 45), H(20, 15))];
  else if (/咖啡吧/.test(t)) out = [S(H(6), H(14, 30)), S(H(14), H(19, 15))];
  else if (/咖啡车/.test(t)) out = [S(H(6), H(14))];
  else if (/塔可|披萨|汉堡/.test(t)) out = [S(H(10, 30), H(21))];
  else if (/鲜果水/.test(t)) out = [S(H(10), H(19))];
  else if (/冰棍/.test(t)) out = [S(H(11), H(20))];
  else if (/奶茶|吉事果/.test(t)) out = [S(H(12), H(21))];
  else if (/饮料车/.test(t)) out = [S(H(9, 30), H(19))];
  // 看台卖水：只有表演赛的晚上看台上有人
  else if (/看台上卖水/.test(t)) out = ex ? [S(H(17), H(20, 30))] : [];
  else if (/主裁判/.test(t)) out = ex ? [S(H(18), H(20, 15))] : [];
  else if (/球童/.test(t))
    out = ex ? [S(H(18), H(20, 15))] : /网前/.test(t) && c.cal.season !== 'summer' ? [S(H(15, 15), H(17, 40))] : [];
  else if (/青训教练/.test(t)) {
    const ls = c.cal.lessons;
    out = ls.length ? [S(ls[0] - 45, ls[ls.length - 1] + 75)] : [S(H(9), H(13))];
  } else if (/红土场裁判/.test(t)) out = [S(H(7), H(12))];
  else if (/球拍店|纪念品/.test(t)) out = [S(H(9), H(18))];
  else if (/穿线/.test(t)) out = [S(H(9), H(17))];
  else if (/果昔/.test(t)) out = [S(H(8), H(16))];
  else if (/小卖部/.test(t)) out = [S(H(7), H(15)), S(H(15), H(21))];
  else if (/送货/.test(t)) out = [S(H(8), H(13))];
  else if (/酒保/.test(t)) out = [S(H(11), H(22, 30))];
  else if (/厨师/.test(t)) out = [S(H(10), H(21, 30))];
  else if (/团课/.test(t)) out = [S(H(6), H(13))];
  else if (/理疗/.test(t)) out = [S(H(9), H(17))];
  else if (/健身房前台/.test(t)) out = [S(H(5, 30), H(14, 30)), S(H(14, 30), H(21, 30))];
  else if (/洗衣/.test(t)) out = [S(H(7), H(15, 30))];
  else if (/服务员/.test(t)) out = [S(H(7), H(15)), S(H(15), H(22, 30))];
  else if (/高尔夫/.test(t)) out = [S(H(7), H(16))];
  else out = [S(H(8), H(17))];
  // 夏天（中午 42 度）：室外的班早上 11 点前下、傍晚再来；店中午关；只开傍晚的餐车 16:45 来（中午不排一屋子人守空店；
  // 傍晚的人 17:30 以后才来，晚班的员工也别赶在 16 点就到齐）
  let fixed = false;
  if (c.cal.season === 'summer') {
    const set = (l: Shift[]) => {
      out = l;
      fixed = true;
    };
    if (/门童/.test(t)) set([S(H(6), H(11)), S(H(17, 15), H(22, 30))]);
    else if (/球拍店|纪念品|穿线/.test(t)) set([S(H(7, 30), H(12)), S(H(17), H(20))]);
    else if (/饮料车/.test(t) || c.evening.has(post.id)) set([S(H(16, 45), H(21))]);
    else if (/高尔夫/.test(t)) set([S(H(6), H(11))]);
    else if (/红土场裁判/.test(t)) set([S(H(6, 30), H(10, 30))]);
    else if (/体能教练|团课/.test(t)) set([S(H(6), H(12))]);
    else if (/理疗/.test(t)) set([S(H(7), H(13))]);
    // 二楼酒吧、后厨、服务员傍晚才开（中午的简餐在咖啡吧）；小卖部中午关
    else if (/酒保|会所厨师/.test(t)) set([S(H(16, 30), H(22, 30))]);
    else if (/服务员/.test(t)) set([S(H(17), H(22, 30))]);
    else if (/小卖部/.test(t)) set([S(H(7), H(12)), S(H(17), H(21))]);
  }
  // 下雨、风沙：泳池、广场的饮料车（露天）整天不开，救生员、摊主不来
  if (
    (c.w.rain || c.w.wind) &&
    c.idx.list.some(
      (x) => x.needs === post.id && (x.kind === 'pool' || (x.scene === 'clubplaza' && x.kind === 'stall')),
    )
  )
    return [];
  if (fixed) return out;
  // 给客人开的地方（摊位、咖啡吧、酒吧、店、泳池）要这个岗有人才开：班次照着它的营业时间排，一个人太长就两班交接
  const served = c.idx.list.filter((x) => x.needs === post.id && x.kind !== 'lesson' && x.kind !== 'gym');
  if (served.length && out.length) {
    const a = Math.min(...served.map((x) => (x.open ?? [OPEN, CLOSE])[0])) - 15;
    const b = Math.max(...served.map((x) => (x.open ?? [OPEN, CLOSE])[1])) + 10;
    const max = p.role === 'vendor' ? 11.75 * 60 : 9 * 60;
    if (b - a <= max) out = [S(a, b)];
    else {
      // 早班长一点（八个半钟头以内），交接放到 14:30 以后（不在午后最清静的那个钟头叠两个人）
      const mid = clamp(
        Math.max(a + Math.round((b - a) / 2 / 15) * 15, H(15)),
        a + 4 * 60,
        Math.min(a + 9 * 60, b - 3 * 60),
      );
      out = [S(a, mid), S(mid, b)];
    }
  }
  // 有名有姓的人按自己的钟点（太长的不算：那是"一整天都可能在"）；后面没人的接一个顶岗的
  const wk = p.week?.hours;
  // 球童、裁判跟着比赛走，不按自己的钟点
  if (out.length && p.tier === 'named' && wk && !/球童|裁判|跟着球员|看台上卖水/.test(t)) {
    const first = out[0].start;
    const last = out[out.length - 1].end;
    // 摊主开门就在（自己的车）；员工按自己的钟点，前后没人的接顶岗的
    let a = p.role === 'vendor' && served.length ? first : Math.max(H(wk[0]), served.length ? first : 0);
    let b = Math.min(H(wk[1]), served.length ? last : 24 * 60);
    // 前后只差一个钟头以内的：自己多干一会儿（不叫一个顶岗的来站半小时，也不留空档）
    if (served.length && last - b <= 60) b = last;
    if (served.length && a - first <= 60) a = first;
    if (b - a >= 4 * 60 && b - a <= 11.75 * 60) {
      out = [S(a, b)];
      if (last - b > 0) out.push(S(b, last));
      if (served.length && a - first > 0) out.push(S(first, a));
    }
  }
  if (c.cal.season === 'summer') out = out.map((s) => (s.start > H(6) && s.start < H(9) ? S(s.start - 30, s.end) : s));
  // 岗位自己有开门时间的（送货的货梯 6–12 点）：班不排到岗位关了以后
  if (post.open) {
    const [o0, o1] = post.open;
    out = out.map((s) => S(Math.max(s.start, o0 - 15), Math.min(s.end, o1 + 15))).filter((s) => s.end - s.start >= 60);
  }
  return out;
}

/** 一班的工作段（中间歇一次 30 分钟，避开饭点） */
function shiftPlan(post: PlaceId, s: Shift, vendor: boolean, r: Rng): Intent[] {
  const len = s.end - s.start;
  const work = (a: Minute, b: Minute): Intent => I('work', b - a, { at: post, after: a, must: true });
  if (len < 6 * 60) return [work(s.start, s.end)];
  let b0 = s.start + Math.round(len / 2) + int(r, -30, 30);
  const rush: [Minute, Minute][] = vendor
    ? [
        [H(11, 15), H(13, 45)],
        [H(17, 15), H(19, 45)],
      ]
    : [[H(11, 45), H(13, 15)]];
  for (const [a, b] of rush) if (b0 + 30 > a && b0 < b) b0 = b0 - a < b - b0 && a - 30 > s.start + 60 ? a - 30 : b;
  b0 = clamp(b0, s.start + 90, s.end - 90);
  const out = [
    work(s.start, b0),
    I('break', 30, { kinds: K('staff', 'table', 'seat'), after: b0, must: true }),
    work(b0 + 30, s.end),
  ];
  // 八个半钟头以上的班：后半段再歇 15 分钟（不让一个人在岗位上一站五六个钟头）
  if (len > 8.5 * 60 && s.end - (b0 + 30) > 3.5 * 60) {
    let b1 = b0 + 30 + Math.round((s.end - b0 - 30) / 2) + int(r, -20, 20);
    for (const [a, b] of rush) if (b1 + 15 > a && b1 < b) b1 = b1 - a < b - b1 && a - 15 > b0 + 90 ? a - 15 : b;
    b1 = clamp(b1, b0 + 90, s.end - 60);
    out.splice(
      2,
      1,
      work(b0 + 30, b1),
      I('break', 15, { kinds: K('staff', 'seat'), after: b1, must: true }),
      work(b1 + 15, s.end),
    );
  }
  return out;
}

/** 生成一个模拟的人（客人、顶岗的）：名字不和今天已经在的人撞（英文全名一定不撞；中文名先试几次，名字池用完了才重） */
function freshPerson(c: Ctx, id: string, info: SlotInfo, tier: 'regular' | 'crowd', ok?: (p: CastPerson) => boolean) {
  let best: CastPerson | undefined;
  for (let k = 0; k < 40; k++) {
    const p = makePerson(c.cfg.seed, k ? `${id}#${k}` : id, info, tier);
    // 英文全名不撞、不和有名有姓的人同名（不出第二个 Carmen）
    if (c.names.has(p.name) || c.namedZh.has(p.nameZh) || (ok && !ok(p) && k < 30)) continue;
    // 中文名先试几次不重（名字池三百来个，一天来的人多了总会重：重了就算了，英文全名不重就行）
    if (best && (k >= 3 || c.zh.size > 240)) break;
    best ??= p;
    if (!c.zh.has(p.nameZh) || c.zh.size > 240) {
      best = p;
      break;
    }
  }
  const p = best ?? makePerson(c.cfg.seed, `${id}#x`, info, tier);
  p.id = id;
  c.names.add(p.name);
  c.zh.add(p.nameZh);
  return p;
}

function staffAgent(c: Ctx, person: CastPerson, post: Place, plan: Intent[], start: Minute, end: Minute, tag: string) {
  const r = r$(c, 'shift', person.id, tag);
  const entry = pickEntry(c, person, 'staff');
  const ep = c.idx.byId.get(entry);
  const lead = travelMin(ep, post, c.walk) + int(r, 4, 12);
  c.agents[person.id] = newAgent(c, person, start - lead, end + 25, entry, plan);
}

/** 每天早上扫一遍中心球场的台阶（Dale，people.md："关门十年没走，每天早上扫中心球场的台阶，没人付钱"） */
export const sweepsSteps = (p: CastPerson) => /扫.*中心球场的台阶/.test(p.bio);

/** 扫看台：南、东、北三面看台一面一面扫（钟点定死：t0 开始，每面 10–13 分钟） */
function sweepPlan(c: Ctx, r: Rng, t0: Minute): Intent[] {
  const stands = kindsOf(c.idx, 'stand')
    .filter((p) => p.scene === 'clubstadium')
    .sort((a, b) => b.z - a.z);
  const out: Intent[] = [];
  let t = t0;
  for (const p of stands) {
    const m = int(r, 10, 13);
    out.push(I('work', m, { at: p.id, after: t, must: true }));
    t += m + 1;
  }
  return out;
}

function addStaff(c: Ctx, p: CastPerson, post: Place, shifts: Shift[], tag: string, info: SlotInfo): void {
  const breaks: [Minute, Minute][] = [];
  shifts.forEach((s, k) => {
    let person = p;
    if (k > 0) {
      const id = `staff:sim:${info.scene}:${info.slot}:${k + 1}`;
      person = freshPerson(c, id, info, 'regular');
      person.homes = [{ scene: info.scene, slot: info.slot }];
      c.people[id] = person;
    }
    if (c.agents[person.id]) return;
    const plan = shiftPlan(post.id, s, person.role === 'vendor', r$(c, 'shift', person.id, tag));
    for (const it of plan)
      if (it.doing === 'break' && it.after !== undefined) breaks.push([it.after, it.after + it.minutes]);
    // 上班前先去扫中心球场的台阶（开班前三刻钟）
    if (k === 0 && sweepsSteps(person) && s.start >= H(6, 30)) {
      const sw = sweepPlan(c, r$(c, 'sweep', person.id), s.start - 45);
      const t0 = sw[0]?.after ?? s.start;
      staffAgent(c, person, post, [...sw, ...plan], t0, s.end, tag);
      return;
    }
    staffAgent(c, person, post, plan, s.start, s.end, tag);
  });
  // 泳池：救生员歇班的时候有个泳池助理顶上（池子营业时间里不关）：歇班前二十分钟到，收躺椅毛巾、擦池边，顶完班再收拾一会儿走
  const pool = c.idx.list.some((x) => x.needs === post.id && x.kind === 'pool');
  if (!pool) return;
  const spots = c.idx.list.filter(
    (x) => x.scene === post.scene && (x.kind === 'lounger' || x.kind === 'seat') && !x.party,
  );
  breaks.sort((a, b) => a[0] - b[0]);
  breaks.forEach(([a, b], i) => {
    const id = `staff:sim:${info.scene}:${info.slot}:relief${i + 1}`;
    const person = freshPerson(c, id, { ...info, title: '泳池助理（顶救生员歇班）' }, 'regular');
    person.homes = [{ scene: info.scene, slot: info.slot }];
    c.people[id] = person;
    const r = r$(c, 'relief', id);
    const plan: Intent[] = [];
    let clock = a - int(r, 20, 30);
    const start = clock;
    let n = int(r, 0, spots.length);
    const side = (m: number) => {
      // 收毛巾、摆躺椅、擦池边（钟点定死，路上耽误了也不往后拖）
      const at = spots.length ? { at: spots[n++ % spots.length].id } : { kinds: K('lounger', 'seat') };
      plan.push(I('work', m, { ...at, after: clock, must: true }));
      clock += m;
    };
    side(a - clock);
    // 多站几分钟，等救生员歇完走回来再交给他（他一到就交）
    plan.push(I('work', b - a + 10, { at: post.id, after: a, must: true }));
    clock = b + 10;
    side(int(r, 15, 25));
    c.agents[id] = newAgent(c, person, start - int(r, 8, 15), clock + 20, pickEntry(c, person, 'staff'), plan);
  });
}

/** 职业球员：上午练球、健身，下午再练，有表演赛的晚上打表演赛 */
function proPlan(c: Ctx, court: PlaceId, r: Rng): { arrive: Minute; leave: Minute; plan: Intent[] } {
  const summer = c.cal.season === 'summer';
  const ex = c.cal.exhibition;
  // 理疗床躺一会儿（拉伸、放松）
  const physio = I('rest', int(r, 25, 40), { kinds: K('gym', 'seat') });
  if (summer && ex) {
    // 夏天有表演赛：下午晚点来，健身、理疗，傍晚练一会儿，打表演赛
    const plan = [
      intent.change(r),
      intent.gym(r),
      physio,
      I('tennis', 60, { at: court, after: H(17), must: true }),
      intent.drink(r),
      I('tennis', 95, { at: court, after: H(18, 30), must: true }),
      intent.change(r),
    ];
    return { arrive: H(15, 15) + int(r, 0, 20), leave: H(20, 45), plan };
  }
  if (summer) {
    // 夏天：天一亮练，健身、理疗、吃了午饭回家（下午 42 度不练）
    const plan = [
      intent.change(r),
      I('tennis', 150, { at: court, after: H(6, 30), must: true }),
      intent.gym(r),
      physio,
      intent.eat(r),
      intent.change(r),
    ];
    return { arrive: H(6, 30) - int(r, 20, 35), leave: H(13, 30) + int(r, 0, 20), plan };
  }
  // 上午练、健身、理疗、吃午饭、歇一会儿，下午再练；有表演赛的晚上打表演赛
  const plan: Intent[] = [
    intent.change(r),
    I('tennis', 150, { at: court, after: H(8), must: true }),
    intent.gym(r),
    physio,
    intent.eat(r),
    intent.lounge(r),
    I('tennis', 120, { at: court, after: H(15, 30), must: true }),
  ];
  let leave = H(18, 15);
  if (ex) {
    plan.push(intent.drink(r), I('tennis', 95, { at: court, after: H(18, 30), must: true }));
    leave = H(20, 45);
  }
  plan.push(intent.change(r));
  return { arrive: H(8) - int(r, 20, 35), leave, plan };
}

/** 今天轮休的餐车（摊主的岗位）：平日、下雨只开四五家（正餐车至少两家），周末全开 */
function closedTrucks(c: Ctx): Set<PlaceId> {
  const out = new Set<PlaceId>();
  const summer = c.cal.season === 'summer';
  const bad = c.w.rain || c.w.wind;
  if (c.cal.weekend && !bad && !summer) return out;
  const posts = new Map<PlaceId, boolean>();
  for (const p of c.idx.list)
    if (p.scene === 'clubfood' && p.kind === 'stall' && p.needs) posts.set(p.needs, servesMeal(p));
  const r = r$(c, 'trucks');
  // 下雨、风沙、夏天平日只开三家；夏天周末五家
  const open = bad || (summer && !c.cal.weekend) ? 3 : summer ? 5 : int(r, 4, 5);
  const meals = [...posts.keys()].filter((k) => posts.get(k)).sort();
  const others = [...posts.keys()].filter((k) => !posts.get(k)).sort();
  const shuffle = (l: PlaceId[]) => {
    for (let i = l.length - 1; i > 0; i--) {
      const j = int(r, 0, i);
      [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
  };
  const keepMeals = Math.min(meals.length, open - 1, 3);
  const keep = new Set([...shuffle(meals).slice(0, keepMeals), ...shuffle(others).slice(0, open - keepMeals)]);
  for (const k of posts.keys()) if (!keep.has(k)) out.add(k);
  return out;
}

/** 夏天：开着的餐车里只留一家正餐车、一家卖冰的中午开，别的 16:45 才来（中午 42 度没人在院子里吃） */
function eveningTrucks(c: Ctx): Set<PlaceId> {
  const out = new Set<PlaceId>();
  if (c.cal.season !== 'summer') return out;
  const posts: Place[] = [];
  for (const p of c.idx.list)
    if (p.scene === 'clubfood' && p.kind === 'stall' && p.needs && !c.closed.has(p.needs) && !posts.includes(p))
      posts.push(p);
  posts.sort((a, b) => (a.needs as string).localeCompare(b.needs as string));
  const meal = posts.find((p) => servesMeal(p));
  const ice = posts.find((p) => /paleta|冰棍|agua|鲜果/i.test(`${p.id}${p.name}`));
  for (const p of posts) if (p !== meal && p !== ice) out.add(p.needs as PlaceId);
  return out;
}

/** 青训教练的一天：私教课（会员订的，60 分钟，在发球机那块场）+ 青训课；课前到、最后一节课完了走；空档收拾球筐、歇一会儿 */
function planCoach(c: Ctx, p: CastPerson, post: Place, r: Rng): void {
  const lessons = c.cal.lessons;
  const court = kindsOf(c.idx, 'court').find((x) => /发球机|machine/i.test(x.name) && allows(x, 'coach'));
  type Job = { at: Minute; len: number; kind: 'kids' | 'private' };
  const jobs: Job[] = lessons.map((L) => ({ at: L, len: 55, kind: 'kids' }));
  if (court && !c.w.rain) {
    const summer = c.cal.season === 'summer';
    const cands: Minute[] = summer
      ? [H(6, 45), H(10, 45)]
      : c.cal.weekend
        ? [H(7, 45), H(12), H(13, 45), H(17)]
        : [H(8), H(9, 15), H(10, 30), H(13, 15), H(14, 20), H(17, 45)];
    const free = cands.filter((t) => jobs.every((j) => t + 60 + 10 <= j.at || t >= j.at + j.len + 10));
    const n = Math.min(free.length, c.cal.weekend ? int(r, 1, 2) : int(r, 3, 4));
    for (let k = 0; k < n; k++) {
      const left = free.filter((t) => jobs.every((j) => t + 70 <= j.at || t >= j.at + j.len + 10));
      if (!left.length) break;
      jobs.push({ at: pick(r, left), len: 60, kind: 'private' });
    }
  }
  if (!jobs.length) return;
  jobs.sort((a, b) => a.at - b.at);
  const plan: Intent[] = [];
  const start = jobs[0].at - int(r, 25, 35);
  let clock = start;
  let rested = false;
  for (const j of jobs) {
    // 私教课在另一块场上：提前走过去（从教练位走过去要几分钟）
    const walkTo = j.kind === 'private' && court ? travelMin(post, court, c.walk) + 1 : 0;
    let gap = j.at - walkTo - clock;
    // 空档：收拾球筐、摆标志盘（每次 15–20 分钟）和歇着（场边坐坐；赶上午饭歇 40 分钟吃饭）轮着来，课前 10 分钟回到场上
    while (gap > 0) {
      const lunch = !rested && clock >= H(11, 15) && gap >= 55;
      if (gap <= 25) {
        plan.push(I('work', gap, { at: post.id, after: clock, must: true }));
        break;
      }
      const prep = int(r, 15, 20);
      plan.push(I('work', prep, { at: post.id, after: clock, must: true }));
      clock += prep;
      const sit = Math.min(gap - prep - 10, lunch ? 40 : 35);
      if (sit >= 10) {
        plan.push(
          lunch
            ? I('break', sit, { kinds: K('staff', 'table', 'seat'), after: clock, must: true })
            : I('rest', sit, { kinds: K('stand', 'seat'), after: clock, must: true }),
        );
        if (lunch) rested = true;
        clock += sit;
      }
      gap = j.at - walkTo - clock;
    }
    if (j.kind === 'kids') plan.push(I('coach', j.len, { at: post.id, after: j.at, must: true }));
    else {
      plan.push(I('coach', j.len, { at: (court as Place).id, after: j.at, must: true }));
      privateStudent(c, (court as Place).id, j.at, j.len);
    }
    clock = j.at + j.len;
  }
  plan.push(I('work', int(r, 10, 20), { at: post.id, after: clock, must: true }));
  const entry = pickEntry(c, p, 'staff');
  // 上课前先去扫中心球场的台阶（Dale 周日带课的日子也扫）
  let t0 = start;
  if (sweepsSteps(p) && start >= H(7)) {
    const sw = sweepPlan(c, r$(c, 'sweep', p.id), Math.max(H(6, 10), start - 50));
    plan.unshift(...sw);
    t0 = sw[0]?.after ?? start;
  }
  c.agents[p.id] = newAgent(c, p, t0 - int(r, 8, 15), clock + 40, entry, plan);
}

/** 订私教课的会员：签到、换衣服，订的钟点上课，下了课喝一口、换衣服回家 */
function privateStudent(c: Ctx, court: PlaceId, at: Minute, len: number): void {
  const p = guestPerson(c, 'clubcourts', 'member', 'player', '上私教课的会员', (x) => !injured(x) && x.attrs.ntrp >= 2);
  const r = r$(c, 'student', p.id);
  const plan: Intent[] = [
    intent.checkin(),
    intent.change(r),
    I('tennis', len, { at: court, after: at, must: true }),
    intent.drink(r),
    intent.change(r),
  ];
  const entry = pickEntry(c, p, howCome(r, p, false));
  const [pre] = leadIn(c, c.idx.byId.get(entry), plan, 2);
  const arrive = at - pre - travelMin(kindsOf(c.idx, 'locker')[0], c.idx.byId.get(court), c.walk) - int(r, 8, 15);
  const l = c.bookings.get(court) ?? [];
  l.push([at, at + len]);
  c.bookings.set(court, l);
  c.agents[p.id] = newAgent(c, p, Math.max(OPEN, arrive), at + len + int(r, 40, 60), entry, plan);
}

function planStaff(c: Ctx, assigned: Set<string>): void {
  const posts = c.cfg.posts ?? {};
  const lessonPlaces = kindsOf(c.idx, 'lesson');
  for (const key of Object.keys(posts)) {
    const i = key.indexOf(':');
    const scene = key.slice(0, i) as SceneId;
    const slot = key.slice(i + 1);
    const info = slotInfo(scene, slot);
    const post = c.idx.byId.get(posts[key]);
    if (!info || !post) continue;
    const p = c.cfg.cast.who(scene, slot, info.kind, c.day);
    if (assigned.has(p.id)) continue;
    const r = r$(c, 'staff', p.id);
    // 职业球员（中心球场的两个位置）
    if (info.role === 'pro' || post.doing === 'tennis') {
      if (c.w.rain) continue;
      const pp = proPlan(c, post.id, r);
      const entry = pickEntry(c, p, 'staff');
      c.agents[p.id] = newAgent(c, p, pp.arrive, pp.leave, entry, pp.plan);
      assigned.add(p.id);
      continue;
    }
    // 平日只开四五家餐车（摊主轮休，人集中在开着的车前才排得起队）
    if (c.closed.has(post.id)) {
      assigned.add(p.id);
      continue;
    }
    const shifts = shiftsFor(info, p, c, post);
    if (!shifts.length) continue;
    assigned.add(p.id);
    // 青训教练：上午、傍晚给会员上私教课，下午带青训课（课要他在教练位上才开），课和课之间收拾球筐、歇着
    if (/青训教练/.test(info.title) && lessonPlaces.length) {
      planCoach(c, p, post, r);
      continue;
    }
    addStaff(c, p, post, shifts, key, info);
  }
}

// ── 会员、常客、客人 ───────────────────────────────────────────────────────────

/** 到和走：week.hours ± 15 分钟；跨度很长的（"一整天都可能在"）挑一段 2.5–5 小时 */
function windowOf(p: CastPerson, r: Rng): [Minute, Minute] {
  const [h0, h1] = p.week?.hours ?? [9, 13];
  let a = H(h0);
  let b = H(h1);
  if (b - a > 4.5 * 60) {
    // 窗口很长（"8 点到 3 点之间都可能在"）：今天来其中一段。常来的人习惯固定，多半从窗口开头来
    const len = int(r, 150, Math.min(300, b - a));
    const night = p.traits.includes('nightowl') || /晚/.test(p.title);
    const early = p.traits.includes('earlybird') || /早/.test(p.title);
    const last = b - len;
    const starts: [Minute, number][] = [[a + int(r, 0, 40), early ? 8 : night ? 0.5 : 4]];
    if (last > H(10, 30)) starts.push([H(11) + int(r, 0, 45), 1.2]);
    if (last > H(16)) starts.push([H(17) + int(r, 0, 75), night ? 9 : 2]);
    const s = clamp(weighted(r, starts), a, Math.max(a, last));
    a = s;
    b = Math.min(b, s + len);
  }
  a += int(r, -15, 15);
  b += int(r, -15, 15);
  // 夏天：中午的来访挪到早上或傍晚（泳池的除外，由调用方决定）
  return [clamp(a, OPEN, CLOSE - 60), clamp(b, a + 60, CLOSE - 10)];
}

function summerShift(r: Rng, win: [Minute, Minute]): [Minute, Minute] {
  const [a, b] = win;
  if (b <= H(11) || a >= H(16, 30)) return win;
  const len = clamp(b - a, 90, 240);
  if (a < H(10)) return [Math.min(a, OPEN + int(r, 0, 75)), Math.min(b, H(11) + int(r, 0, 30))];
  const s = H(17) + int(r, 0, 90);
  return [s, Math.min(CLOSE - 10, s + len)];
}

/** 跟着谁来的孩子 → 一伙人；凑约好的双打 */
function groupVisitors(vs: Visitor[]): Visitor[][] {
  const byId = new Map(vs.map((v) => [v.p.id, v]));
  const overlap = (x: Visitor, y: Visitor) => Math.min(x.leaveBy, y.leaveBy) - Math.max(x.arrive, y.arrive) >= 45;
  const groups: Visitor[][] = [];
  const join = (a: Visitor, b: Visitor) => {
    if (a.group === undefined && b.group === undefined) {
      a.group = b.group = groups.length;
      groups.push([a, b]);
    } else if (a.group === undefined) {
      a.group = b.group;
      groups[b.group as number].push(a);
    } else if (b.group === undefined) {
      b.group = a.group;
      groups[a.group].push(b);
    } else if (a.group !== b.group) {
      const keep = groups[a.group];
      const gone = groups[b.group];
      for (const v of gone) {
        v.group = a.group;
        keep.push(v);
      }
      gone.length = 0;
    }
  };
  // 1. 一家人（family 牵连、时间对得上）
  for (const v of vs)
    for (const t of v.p.ties) {
      const o = byId.get(t.with);
      if (o && t.kind === 'family' && overlap(v, o)) join(v, o);
    }
  // 2. 落单的孩子（小孩、少年都算：孩子不自己来、不开车）跟熟的大人（"顺路捎他来"）
  for (const v of vs) {
    if (!isKid(v.p)) continue;
    const hasAdult = v.group !== undefined && groups[v.group].some((x) => x.p.look.body === 'adult');
    if (hasAdult) continue;
    for (const t of v.p.ties) {
      const o = byId.get(t.with);
      if (o && o.p.look.body === 'adult' && overlap(v, o) && (o.group === undefined || groups[o.group].length < 5)) {
        join(o, v);
        break;
      }
    }
  }
  // 3. 约好的双打：搭档、朋友、对手（都想打网球、时间差 45 分钟以内），最多四个人
  const sport = (v: Visitor) => (v.focus === 'clay' ? 'tennis' : v.focus);
  // 老伤的人不约球（跟着家里人来，坐场边看）
  const tennisy = (v: Visitor) =>
    (v.focus === 'tennis' || v.focus === 'clay' || v.focus === 'pickle') && v.p.look.body === 'adult' && !injured(v.p);
  // 一伙里上场的最多四个（坐场边看的老伤不算）
  const size = (v: Visitor) => (v.group === undefined ? 1 : groups[v.group].filter((x) => !injured(x.p)).length);
  const noKids = (v: Visitor) => v.group === undefined || groups[v.group].every((x) => x.p.look.body === 'adult');
  for (const v of vs) {
    if (!tennisy(v) || !noKids(v)) continue;
    for (const t of v.p.ties) {
      if (t.kind !== 'partner' && t.kind !== 'friend' && t.kind !== 'rival') continue;
      const o = byId.get(t.with);
      if (!o || !tennisy(o) || sport(o) !== sport(v) || !noKids(o) || Math.abs(o.arrive - v.arrive) > 45) continue;
      if (v.group !== undefined && v.group === o.group) continue;
      if (size(v) + size(o) > 4) continue;
      join(v, o);
    }
  }
  const out: Visitor[][] = groups.filter((g) => g.length);
  for (const v of vs) if (v.group === undefined) out.push([v]);
  return out;
}

/** 一个孩子没有大人陪 → 生成一个陪他的家长（客人） */
function guestPerson(
  c: Ctx,
  scene: SceneId,
  role: Role,
  kind: 'player' | 'kid',
  title: string,
  ok?: (p: CastPerson) => boolean,
): CastPerson {
  const n = c.n++;
  const id = `guest:sim:${c.day}:${n}`;
  const info: SlotInfo = { scene, slot: `sim${n}`, kind, role, title };
  const p = freshPerson(c, id, info, 'crowd', ok);
  p.homes = [{ scene, slot: info.slot }];
  c.people[id] = p;
  return p;
}

/** 大一点的孩子在围网外对着墙打（Tommy：Sofía 上课的时候） */
const wallKid = (p: CastPerson) => p.look.body === 'teen' && /围网外|对着墙/.test(p.title);

/** 家里有孩子的一伙人：按孩子的事排（上课 / 玩水 / 吃饭），大人陪着 */
function familyPlan(c: Ctx, g: Visitor[], r: Rng): Map<string, Intent[]> | null {
  const kids = g.filter((v) => isKid(v.p));
  if (!kids.length) return null;
  const lead = g.find((v) => !isKid(v.p)) as Visitor;
  const wall = c.idx.list.find((p) => p.kind === 'play' && p.doing === 'tennis');
  const lp = kindsOf(c.idx, 'lesson');
  // 上课的孩子（对着墙打的大孩子不占课的名额）；一节课满了（青训场 8 个）换另一节，都满了就不上课了
  const pupils = kids.filter((k) => !wallKid(k.p)).length;
  const room = (i: number) => (lp[i % lp.length]?.cap ?? 0) - (c.lessonKids.get(i) ?? 0) >= pupils;
  let focus = kids.find((k) => k.focus === 'kidlesson')?.focus ?? lead.focus;
  if (focus === 'kidlesson' && !c.cal.lessons.some((_, i) => room(i))) focus = 'kidplay';
  type Step = { adult: Intent; kid: Intent; wall?: Intent };
  const same = (i: Intent): Step => ({ adult: i, kid: i });
  const steps: Step[] = [same(intent.checkin())];
  if (focus === 'kidlesson' && lp.length && c.cal.lessons.length) {
    // 赶得上的第一节（还有名额的）课；赶不上的挪到课前到
    let li = c.cal.lessons.findIndex((L, i) => room(i) && L >= lead.arrive + 30 && L + 55 <= lead.leaveBy + 20);
    if (li < 0) {
      li = c.cal.lessons.reduce(
        (bi, L, i) =>
          room(i) && (!room(bi) || Math.abs(L - lead.arrive) < Math.abs(c.cal.lessons[bi] - lead.arrive)) ? i : bi,
        c.cal.lessons.findIndex((_, i) => room(i)),
      );
      const L = c.cal.lessons[li];
      for (const v of g) {
        v.arrive = L - int(r, 30, 45);
        v.leaveBy = Math.max(v.leaveBy, L + 55 + int(r, 30, 70));
      }
    }
    const L = c.cal.lessons[li];
    // 孩子提前半小时到（落客点走到青训场就要十分钟；不会提前一个多小时干等）
    if (L - lead.arrive > 55)
      for (const v of g) {
        v.arrive = L - int(r, 30, 45);
        v.leaveBy = Math.max(v.leaveBy, L + 55 + int(r, 30, 60));
      }
    const place = lp[li % lp.length].id;
    c.lessonKids.set(li, (c.lessonKids.get(li) ?? 0) + pupils);
    steps.push({
      adult: I('watch', 55, { kinds: K('stand', 'seat'), after: L }),
      kid: I('lesson', 55, { at: place, after: L, must: true }),
      wall: wall ? I('tennis', 55, { at: wall.id, after: L }) : I('watch', 55, { kinds: K('stand'), after: L }),
    });
    steps.push({ adult: intent.rest(r, 15, 25), kid: intent.kidplay(r, 15, 25), wall: intent.rest(r, 15, 25) });
    steps.push(same(intent.snack(r)));
  } else if (focus === 'swim' || focus === 'sun') {
    steps.push(same(intent.change(r)));
    steps.push({ adult: intent.swim(r, 25, 40), kid: intent.swim(r, 25, 40) });
    steps.push({ adult: intent.sun(r, 30, 60), kid: I('kidplay', int(r, 30, 50), { kinds: K('play', 'pool') }) });
    steps.push(same(intent.snack(r)));
    steps.push(same(intent.change(r)));
  } else if (focus === 'eat') {
    steps.push(same(intent.eat(r, 35, 50)));
    steps.push({ adult: intent.rest(r, 15, 25), kid: intent.kidplay(r, 15, 30) });
  } else if (focus === 'watch') {
    steps.push(same(intent.watch(r, 40, 70)));
    steps.push(same(intent.snack(r)));
  } else {
    steps.push({ adult: intent.rest(r, 25, 40), kid: intent.kidplay(r, 25, 40) });
    steps.push(same(intent.snack(r)));
    steps.push({ adult: intent.rest(r, 15, 25), kid: intent.kidplay(r, 15, 25) });
  }
  const out = new Map<string, Intent[]>();
  for (const v of g)
    out.set(
      v.p.id,
      steps.map((s) => (!isKid(v.p) ? s.adult : wallKid(v.p) ? (s.wall ?? s.kid) : s.kid)),
    );
  return out;
}

/** 老伤的人跟着一伙人来：别人上场他在场边坐着看（同样的钟点，一起走），别人换衣服他坐着等 */
function companionPlan(plan: readonly Intent[]): Intent[] {
  return plan.map((i) =>
    isPlay(i)
      ? I('watch', i.minutes, { kinds: K('stand', 'seat'), ...(i.after !== undefined ? { after: i.after } : {}) })
      : i.doing === 'change'
        ? I('rest', i.minutes, { kinds: K('seat', 'stand', 'cafe') })
        : i,
  );
}

function addGroup(c: Ctx, g: Visitor[], tag: string): void {
  const r = r$(c, 'group', tag);
  // 带头的：大人里最先到的（夫妻、一家人里第一个大人）；来打球的一伙由上场的人带头（老伤的坐场边）
  const adults = g.filter((v) => !isKid(v.p));
  const byArrive = adults.slice().sort((a, b) => a.arrive - b.arrive);
  const lead = byArrive.find((v) => !injured(v.p)) ?? byArrive[0] ?? g[0];
  const fam = familyPlan(c, g, r);
  let leaveBy = lead.leaveBy;
  if (fam) leaveBy = Math.max(...adults.map((v) => v.leaveBy));
  // 上午来的、本来午饭前后走的：多半留下来吃了午饭再走（午饭的人从这儿来）
  else if (lead.arrive < H(11) && leaveBy > H(11) && leaveBy < H(13) && chance(r, 0.65))
    leaveBy = Math.min(CLOSE - 10, H(13) + int(r, 0, 50));
  // 来吃午饭的一半吃完不急着走：在躺椅、树荫、会所里坐一会儿（午后的人从这儿来）
  else if (lead.focus === 'eat' && lead.arrive >= H(11) && lead.arrive < H(12, 30) && chance(r, 0.55))
    leaveBy = Math.min(CLOSE - 10, leaveBy + int(r, 40, 90));
  let plan: Intent[];
  if (fam) plan = fam.get(lead.p.id) as Intent[];
  else {
    plan = [];
    if (sweepsSteps(lead.p) && g.length === 1) plan.push(...sweepPlan(c, r$(c, 'sweep', lead.p.id), lead.arrive + 8));
    if (!isFixedRole(lead.p.role)) plan.push(intent.checkin());
    plan.push(...mainBlock(lead.focus, r, lead.p, leaveBy - lead.arrive));
    fillUp(c, plan, r, lead.p, lead.arrive, leaveBy);
  }
  const kids = g.some((v) => isKid(v.p));
  const entry = pickEntry(c, lead.p, howCome(r, lead.p, kids));
  const ids = [lead.p.id, ...g.filter((v) => v !== lead).map((v) => v.p.id)];
  const players = ids.filter((id) => !injured(g.find((v) => v.p.id === id)?.p as CastPerson));
  let arrive = lead.arrive;
  if (!fam && !c.w.rain) {
    const clay = lead.focus === 'clay' || lead.p.likes.some((l) => l.includes('红土'));
    // 订不到到了就能打的场：照订到的钟点晚点来（不是 named 的才挪：named 按自己的钟点来，到了再等）
    if (bookCourt(c, plan, players, arrive, leaveBy, clay, 45, entry) < 0 && lead.p.tier !== 'named') {
      const probe = plan.slice();
      const saved = new Map([...c.bookings].map(([k, v]) => [k, v.slice()]));
      const d = bookCourt(c, probe, players, arrive, leaveBy + 240, clay, 240, entry);
      if (d >= 0 && arrive + d < CLOSE - 150) {
        const shift = Math.max(0, d - 10);
        arrive += shift;
        leaveBy = Math.min(CLOSE - 10, leaveBy + shift);
        plan.splice(0, plan.length, ...probe);
      } else {
        if (d >= 0) c.bookings = saved;
        // 一整天都订不到场：两个、四个人的多半改约匹克球（一局一局轮着打）
        if (
          (players.length === 2 || players.length === 4) &&
          plan.some((x) => x.doing === 'tennis') &&
          chance(r, 0.6)
        ) {
          const at = plan.findIndex((x) => x.doing === 'tennis');
          const games: Intent[] = [];
          for (let i = int(r, 2, 4); i > 0; i--) {
            if (games.length) games.push(I('rest', int(r, 3, 7), { kinds: K('stand', 'seat') }));
            games.push(intent.pickle(r));
          }
          plan.splice(at, 1, ...games);
          for (let i = plan.length - 1; i > at + games.length; i--) if (plan[i].doing === 'tennis') plan.splice(i, 1);
        }
      }
    }
  }
  // 一伙人一起到、一起走（孩子跟着大人；老伤的跟着看）
  for (const v of g) {
    const own = fam ? (fam.get(v.p.id) as Intent[]) : injured(v.p) && v !== lead ? companionPlan(plan) : plan;
    c.agents[v.p.id] = newAgent(c, v.p, arrive, leaveBy, entry, own.slice());
  }
  if (ids.length > 1) {
    const pid = `party:${lead.p.id}`;
    c.parties[pid] = { id: pid, members: ids, lead: lead.p.id };
    // 一伙人坐一辆车来
    const car = c.agents[lead.p.id].car;
    for (const id of ids) c.agents[id] = { ...c.agents[id], party: pid, car };
  }
}

const PATRON: readonly Role[] = ['member', 'guest', 'kid', 'parent'];
/** 孩子（小孩、少年）：跟着大人来、跟着大人走，只去孩子能去的地方 */
export const isKid = (p: CastPerson) => p.role === 'kid' || p.look.body === 'kid';

/** 场地维护的一天：5:30 到，开门前把场一块块拖平、吹干净，开门后在广场、场边、餐车院子转着收拾，中间歇一次 */
function planGrounds(c: Ctx, p: CastPerson): void {
  const r = r$(c, 'grounds', p.id);
  // 夏天天一亮就干，11 点前收工（中午太晒，外面的活不干）
  const summer = c.cal.season === 'summer';
  const start = (summer ? H(5) : H(5, 30)) + int(r, -5, 10);
  const end = (summer ? H(11) : H(14)) + int(r, 0, summer ? 15 : 30);
  const plan: Intent[] = [];
  const courts = kindsOf(c.idx, 'court').length + kindsOf(c.idx, 'pickle').length;
  for (let i = 0; i < Math.min(4, courts); i++)
    plan.push(
      I('work', int(r, 10, 14), { kinds: K('court', 'pickle'), must: true, ...(i === 0 ? { after: start + 5 } : {}) }),
    );
  let clock = start + 60;
  let rested = false;
  while (clock < end - 30) {
    if (!rested && clock > H(9, 30)) {
      plan.push(I('break', 30, { kinds: K('staff', 'table'), must: true }));
      clock += 30;
      rested = true;
    }
    const m = int(r, 25, 40);
    plan.push(I('work', m, { kinds: K('seat', 'stand', 'play', 'table'), must: true }));
    clock += m + 3;
  }
  c.agents[p.id] = newAgent(c, p, start - int(r, 5, 10), end + 20, pickEntry(c, p, 'staff'), plan);
}

function planRegulars(c: Ctx, assigned: Set<string>): Visitor[] {
  const out: Visitor[] = [];
  const wd = c.cal.weekday;
  for (const p of c.cfg.cast.roster()) {
    if (assigned.has(p.id)) continue;
    const fixed = isFixedRole(p.role);
    if (!fixed && !PATRON.includes(p.role)) continue;
    const homes = c.cfg.cast.where(p.id, c.day);
    // 场地维护：没有固定岗位，天不亮就到，开门前拖场、吹叶子，白天在各处转
    if (fixed && p.role === 'staff' && /维护/.test(p.title) && homes.length && (!p.week || p.week.days.includes(wd))) {
      planGrounds(c, p);
      assigned.add(p.id);
      continue;
    }
    if (fixed) {
      // 员工、教练、球员不在岗的日子：有 week 才来（像会员一样逛）
      // （顶岗的常客员工没排班的日子不来）
      if (p.tier !== 'named' || !homes.length || !p.week || !p.week.days.includes(wd)) continue;
    } else if (!p.week?.days.includes(wd)) continue;
    const r = r$(c, 'visit', p.id);
    if (c.cal.season === 'summer' && p.traits.includes('snowbird')) continue;
    const home = homes[0];
    let focus = focusOf(home, p, r);
    if (fixed)
      focus = p.role === 'staff' ? 'plaza' : home?.scene === 'clubpool' ? 'swim' : chance(r, 0.5) ? 'watch' : 'lounge';
    // 下雨、风沙：去室外的多半不来了（named 一半，常客更多）
    if ((c.w.rain || c.w.wind) && OUTDOOR_FOCUS.includes(focus)) {
      if (chance(r, p.tier === 'named' ? 0.5 : 0.7)) continue;
      focus = chance(r, 0.5) ? 'lounge' : 'gym';
    }
    let win = windowOf(p, r);
    if (c.cal.season === 'summer' && focus !== 'swim' && focus !== 'sun') win = summerShift(r, win);
    // 不上班的日子也一早来扫台阶，扫完在会所、场边待一上午
    if (sweepsSteps(p)) win = [H(6, 5) + int(r, 0, 10), Math.max(win[1], H(11))];
    // 周一上午维护：红土场 10 点才开，一部分早上的人挪到下午
    if (wd === 0 && p.tier !== 'named' && win[0] < H(10) && chance(r, 0.4)) {
      const len = win[1] - win[0];
      win = [H(10) + int(r, 0, 90), Math.min(CLOSE - 10, H(10) + int(r, 0, 90) + len)];
    }
    // 周末：常客比平日晚一点来、多待一会儿
    if (c.cal.weekend && p.tier === 'regular' && win[0] < H(9))
      win = [win[0] + int(r, 30, 90), win[1] + int(r, 30, 60)];
    const arrive = Math.max(win[0], opensFor(c, focus) - 10);
    out.push({ p, arrive, leaveBy: Math.max(arrive + 60, Math.min(CLOSE - 10, win[1])), focus, home });
  }
  return out;
}

/** 想去的地方几点开（泳池 7 点、摊位 10 点、酒吧 11 点、店 8 点……）：没人在开门前到了干等 */
function opensFor(c: Ctx, f: Focus): Minute {
  const kinds: Partial<Record<Focus, PlaceKind[]>> = {
    swim: ['pool'],
    sun: ['lounger'],
    golf: ['golf'],
    bar: ['bar'],
    shop: ['shop'],
    eat: ['stall', 'cafe'],
    gym: ['gym'],
  };
  const ks = kinds[f];
  let t = OPEN;
  if (ks) {
    t = Number.POSITIVE_INFINITY;
    for (const k of ks) for (const p of kindsOf(c.idx, k)) t = Math.min(t, (p.open ?? [OPEN, CLOSE])[0]);
    if (!Number.isFinite(t)) t = OPEN;
  }
  // 周一上午红土维护（8 点开）
  if (f === 'clay' && c.cal.weekday === 0) t = Math.max(t, H(7, 45));
  return Math.max(t, OPEN);
}

/** 今天的客人：几伙、各来干什么、几点（people.md 第四节的表） */
type Purpose = 'play' | 'pickle' | 'eat' | 'swim' | 'watch' | 'lesson' | 'rest' | 'gym' | 'golf' | 'shop' | 'bar';

const PURPOSE: Record<Purpose, { scene: SceneId; title: string; focus: Focus }> = {
  play: { scene: 'clubcourts', title: '来打球的客人', focus: 'tennis' },
  pickle: { scene: 'clubpickle', title: '来打匹克球的客人', focus: 'pickle' },
  eat: { scene: 'clubfood', title: '来吃饭的客人', focus: 'eat' },
  swim: { scene: 'clubpool', title: '来游泳的客人', focus: 'swim' },
  watch: { scene: 'clubstadium', title: '来看球的客人', focus: 'watch' },
  lesson: { scene: 'clubcourts', title: '送孩子上课的家长', focus: 'kidlesson' },
  rest: { scene: 'clubplaza', title: '来逛逛的客人', focus: 'plaza' },
  gym: { scene: 'clubhouse', title: '来健身的客人', focus: 'gym' },
  golf: { scene: 'clubgolf', title: '来打高尔夫的客人', focus: 'golf' },
  shop: { scene: 'clubhouse', title: '来买东西的客人', focus: 'shop' },
  bar: { scene: 'clubhouse', title: '下班来喝一杯的客人', focus: 'bar' },
};

type Span = [Minute, Minute, number];
const pickT = (r: Rng, opts: readonly Span[]): Minute => {
  const [a, b] = weighted(
    r,
    opts.map((o): [[Minute, Minute], number] => [[o[0], o[1]], o[2]]),
  );
  return int(r, a, b);
};
/** 来吃饭的：午饭 11:25–12:05 到（走到餐车院子十来分钟，11:40–12:20 在窗口前），晚饭 17:45–19:45 */
const MEAL_SPANS = (we: boolean, summer = false): Span[] => [
  [H(11, 25), H(12, 5), summer ? 2 : 7],
  [H(17, 45), H(19, 45), summer ? 6 : 4],
  [H(8), H(10), we ? 0.6 : 0.2],
];

function guestTimes(c: Ctx, pu: Purpose, r: Rng): [Minute, number] {
  const summer = c.cal.season === 'summer';
  const we = c.cal.weekend;
  switch (pu) {
    case 'play':
    case 'pickle':
      return summer
        ? [
            pickT(r, [
              [OPEN, H(8, 30), 6],
              [H(17, 30), H(19, 30), 4],
            ]),
            int(r, 110, 170),
          ]
        : [
            pickT(r, [
              [OPEN, H(10, 30), we ? 6 : 5],
              [H(10, 30), H(11, 30), 1],
              [H(15), H(16, 30), 1],
              [H(16, 30), H(19, 15), 4.5],
            ]),
            int(r, 120, 190),
          ];
    case 'eat':
      return [pickT(r, MEAL_SPANS(we, summer)), int(r, 80, 150)];
    case 'bar':
      return [
        pickT(r, [
          [H(17, 30), H(19), 2],
          [H(19), H(20, 45), 2],
        ]),
        int(r, 70, 130),
      ];
    case 'swim':
      return summer
        ? [
            pickT(r, [
              [H(7), H(11), 2],
              [H(11), H(15), 5],
              [H(16), H(18), 2],
            ]),
            int(r, 120, 240),
          ]
        : [
            pickT(r, [
              [H(10), H(12, 30), 2],
              [H(12, 30), H(16), 5],
            ]),
            int(r, 110, 210),
          ];
    case 'watch':
      return [
        pickT(r, [
          [H(8, 30), H(11), 3],
          [H(13, 30), H(15, 15), 1],
          [H(15, 15), H(17, 30), 2],
          [H(17, 30), H(19), 1],
        ]),
        int(r, 50, 100),
      ];
    case 'lesson': {
      const L = c.cal.lessons.length ? pick(r, c.cal.lessons) : H(15, 30);
      return [L - int(r, 30, 45), int(r, 100, 150)];
    }
    case 'gym':
      return [
        pickT(r, [
          [OPEN, H(9), 5],
          [H(17), H(19, 30), 4],
          [H(11), H(13), 1],
        ]),
        int(r, 80, 120),
      ];
    case 'golf':
      return [
        summer
          ? OPEN + int(r, 0, 75)
          : pickT(r, [
              [H(7), H(10), 5],
              [H(13), H(15), 2],
            ]),
        int(r, 150, 210),
      ];
    default:
      return [
        pickT(r, [
          [H(9), H(12), 3],
          [H(13), H(16), 3],
          [H(16), H(18), 2],
          [H(18), H(20), 2],
        ]),
        int(r, 70, 130),
      ];
  }
}

const PLAYING: readonly Focus[] = ['tennis', 'clay', 'pickle'];

/** 今天来的会员（演员表的"人群"层：熟面孔以外的会员，同一天同一个人）：多数来打球，早上和傍晚；中午来吃饭的不少 */
function planDropIns(c: Ctx): Visitor[][] {
  const { cal, w } = c;
  const r0 = r$(c, 'dropins');
  let n = cal.weekend ? int(r0, 190, 230) : int(r0, 180, 220);
  if (cal.weekday === 0) n = Math.round(n * 0.85);
  if (cal.season === 'summer') n = Math.round(n * 0.6);
  if (w.rain) n = Math.round(n * 0.3);
  else if (w.wind) n = Math.round(n * 0.65);
  const outW = w.rain ? 0.1 : w.wind ? 0.4 : 1;
  // 风沙、下雨：泳池、躺椅、高尔夫关了，没人冲着它们来
  const openAir = w.rain || w.wind ? 0 : 1;
  const summer = cal.season === 'summer';
  const focus: [Focus, number][] = [
    ['tennis', 22 * outW],
    ['clay', 8 * outW],
    ['pickle', 13 * outW],
    ['gym', w.rain || w.wind ? 14 : 10],
    ['swim', (summer ? 35 : 6) * openAir],
    ['lounge', 11],
    ['plaza', 10 * (w.rain ? 0.2 : 1)],
    ['eat', 22],
    ['golf', 2 * openAir],
    ['watch', (cal.exhibition ? 4 : 3) * outW],
    ['bar', summer ? 2 : 5],
  ];
  const groups: Visitor[][] = [];
  let made = 0;
  for (let k = 0; made < n && k < 400; k++) {
    const r = r$(c, 'dropin', k);
    let f = weighted(r, focus);
    const size = PLAYING.includes(f)
      ? weighted(r, [
          [1, 4],
          [2, 4],
          [4, 2],
        ])
      : weighted(r, [
          [1, 3],
          [2, 2],
        ]);
    const times: Span[] = summer
      ? [
          [OPEN, H(8, 30), 6],
          [H(17, 30), H(19, 30), 4],
          [H(10), H(15), f === 'swim' ? 6 : 0.3],
        ]
      : [
          [OPEN, H(8), 3],
          [H(8), H(10), 4.5],
          [H(10), H(11, 30), 1.5],
          // 午后：游泳、躺椅、健身、会所里坐坐的（打球的到了这个点改主意，见下）
          [H(13), H(15, 30), PLAYING.includes(f) ? 0.4 : 5],
          [H(15, 30), H(17), 1],
          [H(17), H(19), 3.5],
        ];
    let arrive =
      f === 'eat'
        ? pickT(r, MEAL_SPANS(cal.weekend, summer))
        : f === 'bar'
          ? pickT(r, [
              [H(17, 30), H(19), 2],
              [H(19), H(20, 30), 2],
            ])
          : pickT(r, times);
    // 中午来的：游泳、健身、在会所坐坐（不顶着太阳打球）
    if (!summer && f !== 'eat' && f !== 'bar' && chance(r, 0.1)) arrive = int(r, H(11, 30), H(14));
    // 高尔夫天黑前打完（球道 18:30 关）
    if (f === 'golf' && arrive > H(15)) arrive = H(7) + int(r, 0, 150);
    const midday = arrive >= H(11, 30) && arrive < H(14, 30);
    if (midday && (PLAYING.includes(f) || f === 'golf'))
      f = weighted(r, [
        ['swim', 3 * openAir],
        ['lounge', 2],
        ['gym', 2],
        ['eat', 2],
      ] as [Focus, number][]);
    arrive = Math.max(arrive, opensFor(c, f) - 10);
    const stay =
      f === 'tennis' || f === 'clay' || f === 'golf'
        ? int(r, 140, 220)
        : f === 'bar'
          ? int(r, 70, 120)
          : f === 'eat'
            ? int(r, 80, 150)
            : int(r, 110, 190);
    const leaveBy = Math.min(CLOSE - 10, arrive + stay);
    const g: Visitor[] = [];
    for (let i = 0; i < size; i++) {
      // 来打球的不挑老伤的人（老伤的会员不约球）
      const ok = PLAYING.includes(f) ? (p: CastPerson) => !injured(p) && p.attrs.ntrp >= 2 : undefined;
      const p = guestPerson(c, PURPOSE_SCENE[f], 'member', 'player', '今天来的会员', ok);
      g.push({ p, arrive, leaveBy, focus: f });
    }
    made += g.length;
    groups.push(g);
  }
  return pairSingles(c, groups);
}

/** 一个人来打球的会员，七成出门前就约好了人（同一项、到的时间差半小时以内、水平差 ≤ 0.5）：两个人一起来 */
function pairSingles(c: Ctx, groups: Visitor[][]): Visitor[][] {
  const r = r$(c, 'pair');
  const singles = groups.filter((g) => g.length === 1 && PLAYING.includes(g[0].focus));
  const used = new Set<Visitor[]>();
  const sport = (v: Visitor) => (v.focus === 'clay' ? 'tennis' : v.focus);
  for (const a of singles) {
    if (used.has(a) || !chance(r, 0.7)) continue;
    let best: Visitor[] | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const b of singles) {
      if (b === a || used.has(b) || sport(b[0]) !== sport(a[0])) continue;
      const dt = Math.abs(b[0].arrive - a[0].arrive);
      const dn = Math.abs(b[0].p.attrs.ntrp - a[0].p.attrs.ntrp);
      if (dt > 30 || dn > 0.5) continue;
      if (dt + dn * 20 < bd) {
        bd = dt + dn * 20;
        best = b;
      }
    }
    if (!best) continue;
    used.add(a);
    used.add(best);
    const v = best[0];
    v.arrive = a[0].arrive;
    v.leaveBy = a[0].leaveBy;
    v.focus = a[0].focus;
    a.push(v);
    best.length = 0;
  }
  return groups.filter((g) => g.length);
}

const PURPOSE_SCENE: Record<Focus, SceneId> = {
  tennis: 'clubcourts',
  clay: 'clubclay',
  pickle: 'clubpickle',
  kidlesson: 'clubcourts',
  swim: 'clubpool',
  sun: 'clubpool',
  gym: 'clubhouse',
  golf: 'clubgolf',
  eat: 'clubfood',
  bar: 'clubhouse',
  lounge: 'clubhouse',
  watch: 'clubstadium',
  plaza: 'clubplaza',
  shop: 'clubhouse',
  kidplay: 'clubplaza',
};

/**
 * 表演赛的观众：17:25–18:25 陆续到（早到的多半先去餐车院子吃晚饭），18:30 开打；
 * 散场分几拨：一成多提前走，大半打完前后十几分钟走，四分之一留下来吃点、去酒吧坐坐，21 点前后走（不在前台签到：买的票）
 */
function planSpectators(c: Ctx): void {
  const { cal, w } = c;
  if (!cal.exhibition || w.rain) return;
  const r0 = r$(c, 'spectators');
  let n = cal.weekend ? int(r0, 110, 150) : int(r0, 55, 85);
  if (cal.season === 'summer') n = Math.round(n * 0.6);
  let made = 0;
  for (let k = 0; made < n && k < 200; k++) {
    const r = r$(c, 'spectator', k);
    const kids = chance(r, 0.2) ? int(r, 1, 2) : 0;
    const adults = weighted(r, [
      [1, 2],
      [2, 5],
      [3, 1],
      [4, 1],
    ] as [number, number][]);
    const member = chance(r, 0.35);
    const arrive = H(17, 25) + int(r, 0, 60);
    const wave = r();
    const stay = wave >= 0.75;
    const end = wave < 0.15 ? H(19, 30) + int(r, 0, 20) : H(19, 55) + int(r, 0, 25);
    const leaveBy = stay ? H(20, 40) + int(r, 0, 40) : end;
    const g: CastPerson[] = [];
    for (let i = 0; i < adults; i++)
      g.push(guestPerson(c, 'clubstadium', member ? 'member' : kids ? 'parent' : 'guest', 'player', '来看表演赛的人'));
    for (let i = 0; i < kids; i++) g.push(guestPerson(c, 'clubstadium', 'kid', 'kid', '跟大人来看球的孩子'));
    const lead = g[0];
    const plan: Intent[] = [];
    if (arrive < H(18) && chance(r, 0.5)) plan.push(intent.eat(r, 15, 25));
    else if (chance(r, 0.4)) plan.push(intent.drink(r, 5, 10));
    plan.push(exhibitionWatch(c, r, lead.id, end));
    if (stay) plan.push(kids ? intent.snack(r) : chance(r, 0.5) ? intent.bar(r) : intent.eat(r, 25, 40));
    // 看表演赛的四成叫车来（散场不用找车、能喝一杯）
    const entry = pickEntry(c, lead, chance(r, 0.4) ? 'drop' : 'car');
    for (const p of g) c.agents[p.id] = newAgent(c, p, arrive, leaveBy, entry, plan.slice());
    if (g.length > 1) {
      const pid = `party:${lead.id}`;
      c.parties[pid] = { id: pid, members: g.map((p) => p.id), lead: lead.id };
      const car = c.agents[lead.id].car;
      for (const p of g) c.agents[p.id] = { ...c.agents[p.id], party: pid, car };
    }
    made += g.length;
  }
}

function planGuests(c: Ctx): Visitor[][] {
  const { cal, w } = c;
  const r0 = r$(c, 'guests');
  let n = cal.weekend ? int(r0, 140, 180) : int(r0, 90, 120);
  if (cal.weekday === 0) n = Math.round(n * 0.85);
  if (cal.season === 'summer') n = Math.round(n * 0.5);
  if (w.rain) n = Math.round(n * 0.25);
  else if (w.wind) n = Math.round(n * 0.6);
  const outW = w.rain ? 0.15 : w.wind ? 0.4 : 1;
  const openAir = w.rain || w.wind ? 0 : 1;
  const summer = cal.season === 'summer';
  const weights: [Purpose, number][] = [
    ['play', 16 * outW],
    ['pickle', 6 * outW],
    ['eat', w.rain ? 30 : summer ? 14 : 45],
    ['swim', (summer ? 45 : 16) * openAir],
    ['watch', 5 * outW],
    ['lesson', cal.lessons.length ? (cal.weekend ? 6 : 9) : 0],
    ['rest', 15 * (w.rain ? 0.3 : 1)],
    ['gym', w.rain ? 10 : 6],
    ['golf', 2 * openAir],
    ['shop', 4],
    ['bar', summer ? 4 : 10],
  ];
  // 按时段补几拨不打球的客人（人数照"像一座真的俱乐部"定：上午 8–10 点、午后、傍晚都不能只剩员工）
  //   上午 7:45–10:15：喝咖啡、广场坐坐、健身、看练球；午后 13:15–15:45：泳池、躺椅、树荫、逛店；
  //   傍晚 17:00–19:30：下班来吃饭、喝一杯、健身
  const r1 = r$(c, 'cohorts');
  const k = (a: number, b: number, sm = 0.5) =>
    Math.round(int(r1, a, b) * (summer ? sm : 1) * (w.rain ? 0.3 : w.wind ? 0.7 : 1));
  const cohorts: { n: number; at: [Minute, Minute]; stay: [number, number]; w: [Purpose, number][] }[] = [
    {
      // 夏天趁早上凉快来的更多
      n: k(26, 36, 1.2),
      at: summer ? [OPEN, H(8, 30)] : [H(7, 45), H(10, 15)],
      stay: [80, 150],
      w: [
        ['rest', 4],
        ['gym', 3],
        ['watch', 2 * outW],
        ['shop', 1],
        ['swim', 1 * openAir],
      ],
    },
    summer
      ? {
          // 夏天的午后：冲着泳池来的（躺椅、凉亭、水里）和会所里吹空调健身的（外面的场、店、餐车院子都空着）
          n: k(16, 22, 1),
          at: [H(12, 30), H(15, 15)],
          stay: [100, 170],
          w: [
            ['swim', 6 * openAir],
            ['gym', 1.5],
          ],
        }
      : {
          n: k(16, 24),
          at: [H(13, 15), H(15, 45)],
          stay: [70, 130],
          w: [
            ['swim', 5 * openAir],
            ['rest', 4 * (w.rain ? 0.2 : 1)],
            ['watch', 2 * outW],
            ['shop', 1.5],
            ['gym', 1.5],
          ],
        },
    {
      n: k(24, 34),
      at: [H(17), H(19, 30)],
      stay: [90, 160],
      w: [
        ['bar', 4],
        ['eat', 4],
        ['gym', 1.5],
        ['rest', 1.5 * (w.rain ? 0.2 : 1)],
      ],
    },
  ];
  const total = n + cohorts.reduce((s, x) => s + x.n, 0);
  const groups: Visitor[][] = [];
  let made = 0;
  for (let k = 0; made < total && k < 700; k++) {
    const r = r$(c, 'guest', k);
    let cut = n;
    const co = made >= n ? cohorts.find((x) => made < (cut += x.n)) : undefined;
    const pu = weighted(r, co ? co.w : weights);
    const meta = PURPOSE[pu];
    let [arrive, stay] = co ? [int(r, co.at[0], co.at[1]), int(r, co.stay[0], co.stay[1])] : guestTimes(c, pu, r);
    arrive = Math.max(arrive, opensFor(c, meta.focus) - 10);
    const fam = cal.weekend || (summer && pu === 'swim') ? 0.45 : 0.2;
    let adults = 1;
    let kids = 0;
    if (pu === 'play')
      adults = weighted(r, [
        [1, 1],
        [2, 5],
        [4, 3],
      ]);
    else if (pu === 'pickle')
      adults = weighted(r, [
        [1, 2],
        [2, 5],
        [4, 2],
      ]);
    else if (pu === 'golf') adults = int(r, 2, 4);
    else if (pu === 'lesson')
      kids = weighted(r, [
        [1, 4],
        [2, 1],
      ]);
    else if (pu === 'bar')
      adults = weighted(r, [
        [1, 2],
        [2, 5],
        [3, 2],
      ]);
    else if (pu === 'eat' || pu === 'swim' || pu === 'watch' || pu === 'rest') {
      adults = weighted(r, [
        [1, 3],
        [2, 5],
        [3, 1],
      ]);
      if (chance(r, fam)) kids = int(r, 1, 2);
    } else if (pu === 'shop') adults = int(r, 1, 2);
    const g: Visitor[] = [];
    const leaveBy = Math.min(CLOSE - 10, arrive + stay);
    const play = pu === 'play' || pu === 'pickle';
    for (let i = 0; i < adults; i++) {
      const role: Role = kids ? 'parent' : 'guest';
      const ok = play ? (p: CastPerson) => !injured(p) && p.attrs.ntrp >= 2 : undefined;
      const p = guestPerson(c, meta.scene, role, 'player', kids ? '带孩子来的家长' : meta.title, ok);
      g.push({ p, arrive, leaveBy, focus: meta.focus });
    }
    for (let i = 0; i < kids; i++) {
      const p = guestPerson(c, meta.scene, 'kid', 'kid', pu === 'lesson' ? '来上青训课的孩子' : '跟大人来的孩子');
      g.push({ p, arrive, leaveBy, focus: pu === 'lesson' ? 'kidlesson' : meta.focus });
    }
    made += g.length;
    groups.push(g);
  }
  return groups;
}

// ── 入口 ─────────────────────────────────────────────────────────────────────────

export function planDay(cfg: SimConfig, dayNo: number, weather: Weather): DayPlan {
  const idx = indexPlaces(cfg.places);
  const c: Ctx = {
    cfg,
    idx,
    day: dayNo,
    cal: calendar(dayNo, weather),
    w: weather,
    agents: {},
    parties: {},
    people: {},
    walk: cfg.walk ?? WALK_M_PER_MIN,
    n: 0,
    bookings: new Map(),
    names: new Set(),
    zh: new Set(),
    namedZh: new Set(),
    closed: new Set(),
    evening: new Set(),
    lessonKids: new Map(),
  };
  // 演员表里的人（有名有姓的、常客）的名字先占上：生成的客人不叫 Carmen、不叫 Héctor
  for (const p of cfg.cast.roster()) {
    c.names.add(p.name);
    c.zh.add(p.nameZh);
    if (p.tier === 'named') c.namedZh.add(p.nameZh);
  }
  c.closed = closedTrucks(c);
  c.evening = eveningTrucks(c);
  const assigned = new Set<string>();
  planStaff(c, assigned);
  for (const id of Object.keys(c.agents)) assigned.add(id);

  // 会员、常客（named + regular）：分伙
  const regs = planRegulars(c, assigned);
  // 落单的孩子：生成陪他来的家长；常客家长没带孩子：生成一个孩子
  const byGroup = groupVisitors(regs);
  const groups: Visitor[][] = [];
  for (const g of byGroup) {
    // 孩子（小孩、少年）都要大人带：没有熟的大人顺路捎的，生成一个陪他来的家长
    const adult = g.some((v) => !isKid(v.p));
    const kid = g.some((v) => isKid(v.p));
    if (!adult) {
      const k = g[0];
      const p = guestPerson(c, k.home?.scene ?? 'clubcourts', 'parent', 'player', '带孩子来的家长');
      g.unshift({ p, arrive: k.arrive, leaveBy: k.leaveBy, focus: k.focus });
    } else if (!kid && g.length === 1 && g[0].p.role === 'parent') {
      const a = g[0];
      const p = guestPerson(c, a.home?.scene ?? 'clubcourts', 'kid', 'kid', '跟大人来的孩子');
      g.push({ p, arrive: a.arrive, leaveBy: a.leaveBy, focus: a.focus === 'plaza' ? 'kidplay' : a.focus });
    }
    groups.push(g);
  }
  groups.forEach((g, i) => {
    addGroup(c, g, `r${i}`);
  });
  planDropIns(c).forEach((g, i) => {
    addGroup(c, g, `d${i}`);
  });
  planGuests(c).forEach((g, i) => {
    addGroup(c, g, `g${i}`);
  });
  planSpectators(c);
  return { agents: c.agents, parties: c.parties, people: c.people };
}

/** 这个人今天主要在哪个场景（演员表的 homes；模拟生成的人看自己的 homes） */
export function homeScene(cfg: SimConfig, p: CastPerson | undefined, day: number): SceneId | undefined {
  if (!p) return undefined;
  if (p.tier === 'crowd' || p.id.startsWith('staff:sim:')) return p.homes[0]?.scene;
  return cfg.cast.where(p.id, day)[0]?.scene ?? p.homes[0]?.scene;
}
