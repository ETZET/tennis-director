// 谁在哪张图、什么时候来什么时候走、谁在找总监。纯数据 + 纯函数（种子哈希，不碰 three / DOM）。
//
// 图（map）= 玩家看到的一张地图：分图（clubvista 的 arrive / court / oasis / practice……）或者内场 'club'（clubwalk 的整座俱乐部）。
// 一张图对上演员表的一个场景（SceneId）：declareMap('arrive', 'clubdesk', 这张图用到的人位)。没声明过的场景都算在 'club'。
//
// 一个人位一天里有几段"在场"（VisitWindow，游戏分钟）：员工一整天，会员 / 客人来一两个钟头，中心球场跟着比赛走。
// 分图的演出（clubsite/life）按它让人从出口进来、到点离开；界面（名册、小地图）用 presenceOf() 问"他现在在哪张图"。
//
// 找总监（Seek）：每天有几个人有事找总监——等着被接待、要投诉、想约场。在他在场的一段时间里挂着，
// 总监当面搭上话（或者做了他等的那件事）就算接上了（resolveSeek）；没接上，过点了他自己走，好感掉一点（expireSeeks）。
import { hashOf, mulberry32, type Rng } from './rng';
import { guessRole, isFixedRole, slotInfo } from './slots';
import { memOf } from './state';
import type { Cast, CastState, MemoryEntry, PersonKind, Role, SceneId } from './types';

/** 开门、关门（游戏分钟）：6:00–22:00，和日钟外圈（clubsite/hud/clock.ts）一样 */
export const DAY_OPEN = 6 * 60;
export const DAY_CLOSE = 22 * 60;

export type VisitWindow = readonly [from: number, to: number];

export interface MapSlot {
  slot: string;
  kind: PersonKind;
  /** 路过的人（进来 → 办件事 → 走）：一天来好几趟，每趟很短；false = 有固定位置的人（坐着的、打球的、当班的） */
  flow: boolean;
}

interface MapDecl {
  map: string;
  scene: SceneId;
  slots: Map<string, MapSlot>;
}
const MAPS = new Map<string, MapDecl>();
const BY_SCENE = new Map<SceneId, MapDecl>();

/** 声明一张图：它对上哪个场景、用到哪些人位（再声明一次 = 换掉） */
export function declareMap(map: string, scene: SceneId, slots: readonly MapSlot[]): void {
  const d: MapDecl = { map, scene, slots: new Map(slots.map((s) => [s.slot, s])) };
  MAPS.set(map, d);
  BY_SCENE.set(scene, d);
}
/** 这个场景在哪张图（没声明过 = 内场 'club'） */
export const mapOfScene = (scene: SceneId): string => BY_SCENE.get(scene)?.map ?? 'club';
export const sceneOfMap = (map: string): SceneId | null => MAPS.get(map)?.scene ?? null;
export const declaredMaps = (): string[] => [...MAPS.keys()];

// ── 比赛（中心球场）──────────────────────────────────────────────────────────────

/** 这一天中心球场的比赛时段：上午、下午、晚场各一场（周末上午加一场早的），每场 80～100 分钟，开始时间按天挪一点 */
export function matchWindows(seed: number, day: number): VisitWindow[] {
  const r = mulberry32(hashOf(seed, 'match', day));
  const wd = (((day - 1) % 7) + 7) % 7;
  const starts = [10 * 60, 14 * 60 + 30, 18 * 60 + 30];
  if (wd >= 5) starts.unshift(7 * 60 + 45);
  return starts.map((s): VisitWindow => {
    const a = s + Math.round((r() - 0.5) * 4) * 10;
    return [a, a + 80 + Math.round(r() * 2) * 10];
  });
}
/** 这一刻有没有比赛（0 = 没有；有 = 第几场，从 1 数） */
export function matchAt(seed: number, day: number, minute: number): number {
  const w = matchWindows(seed, day);
  for (let i = 0; i < w.length; i++) if (minute >= w[i][0] && minute < w[i][1]) return i + 1;
  return 0;
}

// ── 在场的时段 ───────────────────────────────────────────────────────────────────

/** 什么时候人多（每小时的权重，6..21 点）：球场早晚两头，泳池中午到下午，别处平一点 */
const CURVE: Record<'court' | 'pool' | 'flat', readonly number[]> = {
  //       6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21
  court: [2, 5, 6, 5, 4, 3, 2, 2, 2, 3, 5, 6, 6, 5, 3, 1],
  pool: [0, 1, 2, 3, 4, 5, 6, 6, 6, 6, 5, 4, 3, 2, 1, 0],
  flat: [2, 4, 5, 5, 5, 5, 4, 4, 4, 5, 5, 5, 5, 4, 3, 1],
};
const curveOf = (scene: SceneId) =>
  scene === 'clubpool'
    ? CURVE.pool
    : scene === 'clubcourts' || scene === 'clubclay' || scene === 'clubpickle'
      ? CURVE.court
      : CURVE.flat;

function drawStart(r: Rng, curve: readonly number[]): number {
  let total = 0;
  for (const w of curve) total += w;
  let x = r() * total;
  for (let h = 0; h < curve.length; h++) {
    x -= curve[h];
    if (x < 0) return (6 + h) * 60 + Math.floor(r() * 6) * 10;
  }
  return 12 * 60;
}

/**
 * 这个人位这一天在场的时段（按开始时间排好、不重叠）。同样的输入永远同样的结果。
 * role 不给 = 查人位表（slots.ts），表里没有按 kind 猜。
 */
export function visitWindows(
  seed: number,
  scene: SceneId,
  slot: string,
  day: number,
  o: { kind?: PersonKind; role?: Role; flow?: boolean } = {},
): VisitWindow[] {
  const info = slotInfo(scene, slot);
  const kind = o.kind ?? info?.kind ?? 'player';
  const role = o.role ?? info?.role ?? guessRole(kind);
  const flow = o.flow ?? BY_SCENE.get(scene)?.slots.get(slot)?.flow ?? false;
  const r = mulberry32(hashOf(seed, 'visit', scene, slot, day));
  const jit = (n: number) => Math.floor(r() * (n + 1));

  // 中心球场：坐着看的、当班的跟着比赛走；路过的（flow）照平常的钟点来（两场之间也有人在场边走、去饮水点）
  if (scene === 'clubstadium' && !flow) {
    const ms = matchWindows(seed, day);
    // 当班的（裁判、球童、司线）和球员：每场都在，赛前到、赛后走；卖水的整天；观众挑一两场
    if (role === 'vendor') return [[ms[0][0] - 40, ms[ms.length - 1][1] + 20]];
    if (isFixedRole(role)) {
      const early = role === 'pro' ? 8 : 18;
      return ms.map((m): VisitWindow => [m[0] - early - jit(6), m[1] + 4 + jit(8)]);
    }
    const out = ms.filter(() => r() < 0.7).map((m): VisitWindow => [m[0] - 25 + jit(20), m[1] + jit(15)]);
    return out.length ? out : [[ms[0][0] - 20, ms[0][1] + 10]];
  }
  if (isFixedRole(role) && !flow) return [[DAY_OPEN + 10 + jit(30), DAY_CLOSE - 5 - jit(30)]];

  const curve = curveOf(scene);
  const wins: VisitWindow[] = [];
  if (flow) {
    // 路过的：一趟只是"几点出发"（走完要多久看画面里的路），一天来很多趟——人多的钟点隔得近，人少的钟点隔得远
    let t = 6 * 60 + 40 + jit(30);
    while (t < DAY_CLOSE - 40) {
      wins.push([t, t + 20]);
      const w = curve[Math.min(curve.length - 1, Math.max(0, Math.floor(t / 60) - 6))] ?? 3;
      t += Math.round((150 / (1 + w)) * (0.7 + r() * 0.6)) + 20;
    }
    return wins;
  }
  const n = 1 + (r() < 0.55 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const a = drawStart(r, curve);
    const len = 100 + jit(14) * 10;
    wins.push([a, Math.min(DAY_CLOSE - 10, a + len)]);
  }
  wins.sort((a, b) => a[0] - b[0]);
  // 叠在一起的并掉（路过的：挨得太近的那趟往后挪）
  const out: VisitWindow[] = [];
  for (const w of wins) {
    const last = out[out.length - 1];
    if (!last || w[0] >= last[1] + (flow ? 10 : 30)) out.push(w);
    else if (!flow) out[out.length - 1] = [last[0], Math.max(last[1], w[1])];
  }
  return out;
}

// ── 现在在哪 ─────────────────────────────────────────────────────────────────────

export interface Presence {
  /** 今天该在哪张图（分图的 id，或内场 'club'） */
  map: string;
  scene: SceneId;
  slot: string;
  /** here = 这会儿在那张图上；later = 今天晚些时候来；gone = 今天来过、走了 */
  status: 'here' | 'later' | 'gone';
  /** here：待到几点（分钟）；later：几点来 */
  at: number;
}

/** 这个人今天、这一刻的行踪；今天不来 = null */
export function presenceOf(cast: Cast, s: Pick<CastState, 'day' | 'minute' | 'seed'>, id: string): Presence | null {
  const homes = cast.where(id, s.day);
  if (!homes.length) return null;
  let best: Presence | null = null;
  for (const h of homes) {
    const wins = visitWindows(cast.seed, h.scene, h.slot, s.day);
    const map = mapOfScene(h.scene);
    let p: Presence = { map, scene: h.scene, slot: h.slot, status: 'gone', at: 0 };
    for (const w of wins) {
      if (s.minute >= w[0] && s.minute < w[1]) {
        p = { ...p, status: 'here', at: w[1] };
        break;
      }
      if (s.minute < w[0]) {
        p = { ...p, status: 'later', at: w[0] };
        break;
      }
    }
    if (p.status === 'here') return p;
    if (!best || (p.status === 'later' && (best.status !== 'later' || p.at < best.at))) best = p;
  }
  return best;
}

/** 这张图上这一刻该有多少人在场（验收、小地图上的人数） */
export function headcount(cast: Cast, s: Pick<CastState, 'day' | 'minute'>, map: string): number {
  const d = MAPS.get(map);
  if (!d) return 0;
  let n = 0;
  for (const m of d.slots.values())
    if (
      visitWindows(cast.seed, d.scene, m.slot, s.day, { kind: m.kind }).some(
        (w) => s.minute >= w[0] && s.minute < w[1],
      )
    )
      n++;
  return n;
}

// ── 找总监 ───────────────────────────────────────────────────────────────────────

/** reception 等着被接待（刚到，拖着行李 / 第一次来）· complaint 有意见要说 · booking 想约个场 */
export type SeekKind = 'reception' | 'complaint' | 'booking';

export interface Seek {
  /** 谁（演员表的 id） */
  id: string;
  kind: SeekKind;
  /** 他在哪张图等 */
  map: string;
  scene: SceneId;
  slot: string;
  /** 从几点等到几点（游戏分钟） */
  from: number;
  until: number;
}

/** 接上了给什么：好感、小费（投诉听完没有钱，但好感回得多） */
export const SEEK_REWARD: Record<SeekKind, { favor: number; money: number }> = {
  reception: { favor: 0.4, money: 6 },
  complaint: { favor: 0.8, money: 0 },
  booking: { favor: 0.5, money: 12 },
};
/** 没接上：他自己走了，好感掉这么多 */
export const SEEK_MISS = 0.3;
const SEEK_MEMO: Record<SeekKind, [done: string, missed: string]> = {
  reception: ['一到就被总监接待了', '到了以后在门口等了半天没人管'],
  complaint: ['找总监提了意见，总监认真听了', '想找总监提意见，没找着人'],
  booking: ['找总监约到了场地', '想找总监约场，没约上'],
};

/** 这一天谁会找总监（声明过的分图里的客人 / 会员，3～5 个）；按开始时间排好 */
export function seeksOfDay(cast: Cast, day: number): Seek[] {
  const r = mulberry32(hashOf(cast.seed, 'seek', day));
  const cands: Seek[] = [];
  for (const d of MAPS.values()) {
    for (const m of d.slots.values()) {
      if (m.flow || m.kind === 'kid' || m.kind === 'ball-kid' || m.kind === 'umpire') continue;
      const info = slotInfo(d.scene, m.slot);
      const role = info?.role ?? guessRole(m.kind);
      if (isFixedRole(role) || role === 'kid') continue;
      const p = cast.who(d.scene, m.slot, m.kind, day);
      if (p.look.body !== 'adult') continue;
      for (const w of visitWindows(cast.seed, d.scene, m.slot, day, { kind: m.kind })) {
        if (w[1] - w[0] < 50) continue;
        const from = w[0] + 8 + Math.floor(r() * 3) * 5;
        const kind: SeekKind =
          d.scene === 'clubdesk'
            ? r() < 0.6
              ? 'reception'
              : 'booking'
            : (['complaint', 'booking', 'complaint'] as const)[Math.floor(r() * 3)];
        cands.push({ id: p.id, kind, map: d.map, scene: d.scene, slot: m.slot, from, until: Math.min(w[1] - 5, from + 75) });
      }
    }
  }
  // 洗一遍，挑时间错开的几个（一小时内最多一个），同一个人一天只找一次
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }
  const out: Seek[] = [];
  const want = 3 + Math.floor(r() * 3);
  for (const c of cands) {
    if (out.length >= want) break;
    if (out.some((o) => o.id === c.id || Math.abs(o.from - c.from) < 60)) continue;
    out.push(c);
  }
  return out.sort((a, b) => a.from - b.from);
}

const seekKey = (day: number, id: string) => `${day}:${id}`;

/** 这一刻正在找总监的人（还没接上、还没过点的） */
export function seekersNow(cast: Cast, s: CastState): Seek[] {
  return seeksOfDay(cast, s.day).filter(
    (k) => s.minute >= k.from && s.minute < k.until && !s.seeks?.[seekKey(s.day, k.id)],
  );
}
/** 这个人这一刻是不是在找总监 */
export const seekOf = (cast: Cast, s: CastState, id: string): Seek | null =>
  seekersNow(cast, s).find((k) => k.id === id) ?? null;

function seekMark(s: CastState, k: Seek, done: boolean): CastState {
  const mem = memOf(s, k.id);
  const dFavor = done ? SEEK_REWARD[k.kind].favor : -SEEK_MISS;
  const favor = Math.round(Math.min(10, Math.max(0, mem.favor + dFavor)) * 10) / 10;
  const memo = SEEK_MEMO[k.kind][done ? 0 : 1];
  const entry: MemoryEntry = { day: s.day, minute: s.minute, text: `第 ${s.day} 天 · ${memo}`, favor: favor - mem.favor };
  return {
    ...s,
    money: s.money + (done ? SEEK_REWARD[k.kind].money : 0),
    seeks: { ...pruneSeeks(s), [seekKey(s.day, k.id)]: done ? 'done' : 'missed' },
    people: {
      ...s.people,
      [k.id]: {
        ...mem,
        favor,
        met: mem.met || done,
        mood: Math.min(100, Math.max(0, mem.mood + (done ? 8 : -6))),
        memory: [...mem.memory, entry].slice(-8),
      },
    },
  };
}
/** 只留今天的记号（存档不越攒越大） */
function pruneSeeks(s: CastState): Record<string, 'done' | 'missed'> {
  const out: Record<string, 'done' | 'missed'> = {};
  for (const [key, v] of Object.entries(s.seeks ?? {})) if (key.startsWith(`${s.day}:`)) out[key] = v;
  return out;
}

/** 总监接上了：记一笔，给好感和小费。这个人这会儿没在找 = null */
export function resolveSeek(cast: Cast, s: CastState, id: string): { state: CastState; seek: Seek } | null {
  const k = seekOf(cast, s, id);
  if (!k) return null;
  const p = cast.get(id);
  const base = memOf(s, id, p);
  const s1: CastState = s.people[id] ? s : { ...s, people: { ...s.people, [id]: base } };
  return { state: seekMark(s1, k, true), seek: k };
}

/**
 * 过点了还没接上的：记成错过（好感掉一点）。只算 since 分以后才过点的（开局就在下午：上午那几个不算在总监头上）。
 * 返回新状态和这次错过的人（没有 = 原样返回）
 */
export function expireSeeks(cast: Cast, s: CastState, since: number): { state: CastState; missed: Seek[] } {
  const missed = seeksOfDay(cast, s.day).filter(
    (k) => s.minute >= k.until && k.until > since && !s.seeks?.[seekKey(s.day, k.id)],
  );
  if (!missed.length) return { state: s, missed };
  let st = s;
  for (const k of missed) {
    const p = cast.get(k.id);
    if (!st.people[k.id]) st = { ...st, people: { ...st.people, [k.id]: memOf(st, k.id, p) } };
    st = seekMark(st, k, false);
  }
  return { state: st, missed };
}

// ── 干活的收入 ───────────────────────────────────────────────────────────────────

/** 总监干了一件活（收杯子、帮拎行李……）：钱进账，记一笔今天干了几件 */
export function earn(s: CastState, money: number): CastState {
  const day = s.chores?.day === s.day ? s.chores : { day: s.day, n: 0, money: 0 };
  return { ...s, money: s.money + money, chores: { day: s.day, n: day.n + 1, money: day.money + money } };
}
