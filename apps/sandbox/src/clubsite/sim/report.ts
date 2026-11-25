// 俱乐部的一天 · 报告：把引擎跑一整天，数每小时在场的人、各地点用了多少、排队等了多久、谁放弃了、午饭的人、
// 抽几个人读他的一天（"07:40 北停车场下车 → 07:46 前台排队 …"），再查不变式（club-sim.md 第六点五节）。
// 纯函数（命令行 docs/lab/2026-11-24-clubsim/tools/simday.ts 和测试都用它）。
import { isFixedRole } from '../cast/slots';
import { SCENE_NAME, SCENES, type SceneId } from '../cast/types';
import { DOING_ZH, handoverPosts, personOf, postStaffed, startDay, step } from './engine';
import {
  CLOSE,
  calendar,
  DAY_END,
  H,
  hm,
  indexPlaces,
  isCounter,
  isWater,
  LIVE_DOING,
  OPEN,
  type PlaceIndex,
  ridesBus,
  SEASON_ZH,
  servesMeal,
  WEEKDAY_ZH,
  watchedPlaces,
} from './plan';
import type { Agent, AgentId, Doing, Minute, PlaceId, SimConfig, SimEvent, SimState, Weather } from './types';

// ── 不变式 ───────────────────────────────────────────────────────────────────────

/** 一个状态里的不变式：一人一处、地点人数 ≤ cap、站位不重、关门半小时后没有客人。返回违反的说明（空 = 都对） */
export function checkState(cfg: SimConfig, s: SimState): string[] {
  const out: string[] = [];
  const idx = indexPlaces(cfg.places);
  const seen = new Map<AgentId, string>();
  const note = (id: AgentId, where: string) => {
    const prev = seen.get(id);
    if (prev) out.push(`${hm(s.minute)} ${id} 同时在 ${prev} 和 ${where}`);
    else seen.set(id, where);
  };
  for (const pid of Object.keys(s.occupants)) {
    const l = s.occupants[pid];
    const p = idx.byId.get(pid);
    if (!p) out.push(`${hm(s.minute)} 不认识的地点 ${pid}`);
    else if (l.length > p.cap + (p.pickup ?? 0))
      out.push(
        `${hm(s.minute)} ${p.name}（${pid}）${l.length} 人 > cap ${p.cap}${p.pickup ? ` + 等餐 ${p.pickup}` : ''}`,
      );
    const spots = new Set<number>();
    for (const id of l) {
      note(id, pid);
      const a = s.agents[id];
      if (a?.where.kind !== 'at' || a.where.at !== pid)
        out.push(`${hm(s.minute)} ${id} 在 ${pid} 的名单里，人却不在那`);
      const sp = a?.spot;
      if (sp !== undefined) {
        if (spots.has(sp)) out.push(`${hm(s.minute)} ${pid} 的站位 ${sp} 有两个人`);
        spots.add(sp);
      }
    }
  }
  for (const pid of Object.keys(s.queues))
    for (const id of s.queues[pid]) {
      note(id, `${pid} 的队`);
      const a = s.agents[id];
      if (a?.where.kind !== 'queue' || a.where.at !== pid)
        out.push(`${hm(s.minute)} ${id} 在 ${pid} 的队里，人却不在队里`);
    }
  // 车位：一伙人一个，同一个车位不停两伙，停的车不超过车位数
  const stallOwner = new Map<string, string>();
  for (const id of Object.keys(s.agents)) {
    const a = s.agents[id];
    if (a.where.kind === 'away' || (a.car !== 'lotN' && a.car !== 'lotS')) continue;
    if (a.stall === undefined) {
      out.push(`${hm(s.minute)} ${id} 开车停在 ${a.car}，没有车位`);
      continue;
    }
    const k = `${a.car}#${a.stall}`;
    const owner = a.party ?? id;
    const prev = stallOwner.get(k);
    if (prev && prev !== owner) out.push(`${hm(s.minute)} ${a.car} 的车位 ${a.stall} 停了两伙（${prev}、${owner}）`);
    stallOwner.set(k, owner);
    const lot = idx.entries.find(
      (e) => (e.stalls ?? 0) > 0 && (/北|lotN/i.test(e.id + e.name) ? 'lotN' : 'lotS') === a.car,
    );
    if (lot && a.stall >= (lot.stalls ?? 0)) out.push(`${hm(s.minute)} ${id} 的车位 ${a.stall} 超出 ${lot.name}`);
  }
  for (const id of Object.keys(s.agents)) {
    const a = s.agents[id];
    const w = a.where;
    if ((w.kind === 'at' || w.kind === 'queue') && !seen.has(id))
      out.push(`${hm(s.minute)} ${id} 说在 ${w.at}，名单里没有他`);
    if (s.minute >= CLOSE + 30 && w.kind !== 'away' && !isFixedRole(a.role))
      out.push(`${hm(s.minute)} 关门半小时了，${id} 还在（${a.doing}）`);
  }
  return out;
}

// ── 跑一天 ───────────────────────────────────────────────────────────────────────

export interface RunOptions {
  weather?: Weather;
  /** 总监在哪（固定一个地点，或者按时刻给）；默认在前台 */
  director?: PlaceId | null | ((t: Minute) => PlaceId | null);
  /** 跑到几点（默认 DAY_END） */
  until?: Minute;
  /** 每步都查不变式（慢一点；默认查） */
  check?: boolean;
}

/** 每分钟记下来的数（报告用） */
interface Rec {
  minutes: Minute[];
  present: number[];
  staff: number[];
  members: number[];
  guests: number[];
  kids: number[];
  byScene: Record<string, number[]>;
  byGroup: Record<Group, number[]>;
  /** 地点的占用：人·分钟、最多几个人、开着的分钟 */
  placeMin: Map<PlaceId, number>;
  placePeak: Map<PlaceId, number>;
  queuePeak: Map<PlaceId, number>;
  /** 要员工在岗才开的地点：营业时间里有人的分钟 / 营业分钟 */
  staffedMin: Map<PlaceId, [number, number]>;
  /** 午饭时段（11:45–13:15）：上午就来了的非员工在场几分钟；11:00–13:30 吃过的 */
  lunchPresent: Map<AgentId, number>;
  lunchAte: Set<AgentId>;
  /** 室外网球场、匹克球场的占用（人·分钟）：早上 8–10、午后 13–15 */
  /** 在吃（点单、吃）的人数 */
  eating: number[];
  /** 客人（不算员工）里在泳池、会所里的；在室外别处（场、广场、餐车院子）的 */
  shelter: number[];
  outside: number[];
  /** 11:50–12:30 每个餐车窗口的队最长几个人 */
  lunchQueue: Map<PlaceId, number>;
  courtsMorning: number;
  courtsNoon: number;
  /** 看球：每个有 faces 的地方每分钟有几个人在看；被看的场每分钟有没有人在打 */
  watchers: Map<PlaceId, number[]>;
  live: Map<PlaceId, boolean[]>;
  /** 今天排了班的岗位：岗位 → 排班的时段（开门开多久按它算，夏天的店中午关） */
  shifts: Map<PlaceId, [Minute, Minute][]>;
  violations: string[];
}

type Group = 'play' | 'food' | 'queue' | 'sit' | 'sport' | 'work' | 'move';
const GROUP_OF: Record<Doing, Group> = {
  arrive: 'move',
  leave: 'move',
  travel: 'move',
  queue: 'queue',
  checkin: 'queue',
  tennis: 'play',
  pickle: 'play',
  lesson: 'play',
  coach: 'work',
  warmup: 'play',
  watch: 'sit',
  rest: 'sit',
  chat: 'sit',
  order: 'food',
  eat: 'food',
  drink: 'food',
  shop: 'sit',
  gym: 'sport',
  change: 'sport',
  swim: 'sport',
  sunbathe: 'sit',
  golf: 'play',
  kidplay: 'sport',
  work: 'work',
  break: 'work',
};
const GROUP_ZH: Record<Group, string> = {
  play: '打球',
  food: '吃喝',
  queue: '排队',
  sit: '歇看',
  sport: '游健',
  work: '干活',
  move: '路上',
};

export interface DayRun {
  cfg: SimConfig;
  final: SimState;
  rec: Rec;
  /** 引擎跑了多少毫秒 */
  ms: number;
  director: string;
}

/** 员工（球员不算：他们是来练球、打表演赛的，算在会员那一栏） */
const isStaff = (a: Agent) => isFixedRole(a.role) && a.role !== 'pro';

export function runDay(cfg: SimConfig, dayNo: number, opts: RunOptions = {}): DayRun {
  const idx = indexPlaces(cfg.places);
  const dir = opts.director === undefined ? 'desk.counter' : opts.director;
  const dirAt = typeof dir === 'function' ? dir : () => dir;
  const until = opts.until ?? DAY_END;
  const check = opts.check ?? true;
  const rec: Rec = {
    minutes: [],
    present: [],
    staff: [],
    members: [],
    guests: [],
    kids: [],
    byScene: Object.fromEntries([...SCENES, 'travel'].map((k) => [k, []])),
    byGroup: { play: [], food: [], queue: [], sit: [], sport: [], work: [], move: [] },
    placeMin: new Map(),
    placePeak: new Map(),
    queuePeak: new Map(),
    staffedMin: new Map(),
    lunchPresent: new Map(),
    lunchAte: new Set(),
    eating: [],
    shelter: [],
    outside: [],
    lunchQueue: new Map(),
    courtsMorning: 0,
    courtsNoon: 0,
    watchers: new Map(),
    live: new Map(),
    shifts: new Map(),
    violations: [],
  };
  let s = startDay(cfg, dayNo, opts.weather);
  // 今天有人上班的岗位和时段（轮休的餐车、夏天中午关的店不算"没守住"）
  rec.shifts = shiftSpans(s);
  const watchPlaces = cfg.places.filter((p) => p.faces?.length);
  const watched = watchedPlaces(idx);
  for (const p of watchPlaces) rec.watchers.set(p.id, []);
  for (const f of watched) rec.live.set(f, []);
  let ms = 0;
  while (s.minute < until) {
    const t0 = performance.now();
    s = step(cfg, s, { director: dirAt(s.minute + 1) }).state;
    ms += performance.now() - t0;
    const t = s.minute;
    rec.minutes.push(t);
    let present = 0;
    let staff = 0;
    let members = 0;
    let guests = 0;
    let kids = 0;
    let eat = 0;
    let shelter = 0;
    let outside = 0;
    const scene: Record<string, number> = {};
    const group: Record<string, number> = {};
    for (const id of Object.keys(s.agents)) {
      const a = s.agents[id];
      const w = a.where;
      if (w.kind === 'away') continue;
      present++;
      if (isStaff(a)) staff++;
      else if (a.role === 'kid') kids++;
      else if (a.role === 'guest' || id.startsWith('guest:')) guests++;
      else members++;
      const sc = w.kind === 'travel' ? 'travel' : (idx.byId.get(w.at)?.scene ?? 'travel');
      scene[sc] = (scene[sc] ?? 0) + 1;
      if (a.doing === 'eat' || a.doing === 'order') eat++;
      const g = GROUP_OF[a.doing];
      group[g] = (group[g] ?? 0) + 1;
      // 午饭：11:45 以前就到了、11:45–13:15 在场的人，11:00–13:30 之间吃没吃
      if (!isStaff(a) && a.arrive < H(11, 45) && t >= H(11, 45) && t < H(13, 15))
        rec.lunchPresent.set(id, (rec.lunchPresent.get(id) ?? 0) + 1);
      if (!isStaff(a) && t >= H(11) && t < H(13, 30) && (a.doing === 'eat' || a.doing === 'order'))
        rec.lunchAte.add(id);
      if (w.kind === 'at' && !isStaff(a)) {
        const p = idx.byId.get(w.at);
        if (p && (p.scene === 'clubhouse' || p.scene === 'clubpool')) shelter++;
        else if (p && p.kind !== 'entry') outside++;
      }
      if (w.kind === 'at') {
        const p = idx.byId.get(w.at);
        if (p && (p.kind === 'court' || p.kind === 'pickle')) {
          if (t >= H(8) && t < H(10)) rec.courtsMorning++;
          if (t >= H(13) && t < H(15)) rec.courtsNoon++;
        }
      }
    }
    rec.present.push(present);
    rec.eating.push(eat);
    rec.shelter.push(shelter);
    rec.outside.push(outside);
    rec.staff.push(staff);
    rec.members.push(members);
    rec.guests.push(guests);
    rec.kids.push(kids);
    for (const k of Object.keys(rec.byScene)) rec.byScene[k].push(scene[k] ?? 0);
    for (const k of Object.keys(rec.byGroup) as Group[]) rec.byGroup[k].push(group[k] ?? 0);
    for (const pid of Object.keys(s.occupants)) {
      const n = s.occupants[pid].length;
      rec.placeMin.set(pid, (rec.placeMin.get(pid) ?? 0) + n);
      rec.placePeak.set(pid, Math.max(rec.placePeak.get(pid) ?? 0, n));
    }
    for (const pid of Object.keys(s.queues)) {
      rec.queuePeak.set(pid, Math.max(rec.queuePeak.get(pid) ?? 0, s.queues[pid].length));
      if (t >= H(11, 50) && t <= H(12, 30) && idx.byId.get(pid)?.scene === 'clubfood')
        rec.lunchQueue.set(pid, Math.max(rec.lunchQueue.get(pid) ?? 0, s.queues[pid].length));
    }
    for (const p of watchPlaces) {
      let n = 0;
      for (const id of s.occupants[p.id] ?? []) if (s.agents[id].doing === 'watch') n++;
      rec.watchers.get(p.id)?.push(n);
    }
    for (const f of watched)
      rec.live.get(f)?.push((s.occupants[f] ?? []).some((id) => LIVE_DOING.has(s.agents[id].doing)));
    let hand: Set<PlaceId> | undefined;
    for (const p of cfg.places) {
      // 守岗只看给客人开的窗口、吧台、店、泳池（课、团课、理疗按排的钟点，不算）；只看今天排了班的钟点
      if (!p.needs || p.kind === 'lesson' || p.kind === 'gym') continue;
      const spans = rec.shifts.get(p.needs);
      if (!spans) continue;
      const [a, b] = p.open ?? [OPEN, CLOSE];
      if (t < a || t >= b || !spans.some(([x, y]) => t >= x && t < y)) continue;
      const v = rec.staffedMin.get(p.id) ?? [0, 0];
      hand ??= handoverPosts(s.agents, s.minute);
      const on = postStaffed(s, p.needs, hand);
      rec.staffedMin.set(p.id, [v[0] + (on ? 1 : 0), v[1] + 1]);
    }
    if (check && rec.violations.length < 50)
      rec.violations.push(...checkState(cfg, s).slice(0, 50 - rec.violations.length));
  }
  return { cfg, final: s, rec, ms, director: dir === null ? '不在' : typeof dir === 'string' ? dir : '按时刻' };
}

/** 今天排的班：岗位 → 时段（几个人的班连起来、交接的地方并成一段） */
export function shiftSpans(s: SimState): Map<PlaceId, [Minute, Minute][]> {
  const raw = new Map<PlaceId, [Minute, Minute][]>();
  for (const a of Object.values(s.agents))
    for (const it of a.plan) {
      if (it.doing !== 'work' || !it.at || it.after === undefined) continue;
      let l = raw.get(it.at);
      if (!l) raw.set(it.at, (l = []));
      l.push([it.after, it.after + it.minutes]);
    }
  const out = new Map<PlaceId, [Minute, Minute][]>();
  for (const [k, l] of raw) {
    l.sort((x, y) => x[0] - y[0]);
    const m: [Minute, Minute][] = [];
    // 歇班（半小时以内的空）也算在班里：歇班的时候窗口关着，算"没守住"
    for (const [a, b] of l) {
      const last = m[m.length - 1];
      if (last && a <= last[1] + 45) last[1] = Math.max(last[1], b);
      else m.push([a, b]);
    }
    out.set(k, m);
  }
  return out;
}

// ── 人在打转、对着空场看、饮水点 ─────────────────────────────────────────────────

/** 来玩的人（员工、摊主、教练不算；职业球员算） */
const patronish = (a: Agent | undefined) => !!a && (!isFixedRole(a.role) || a.role === 'pro');

/** 打转不算的地方：出入口、岗位、场地（一局一局轮着打）、高尔夫的洞、员工休息处 */
const LOOP_EXEMPT = new Set(['entry', 'post', 'court', 'pickle', 'lesson', 'golf', 'staff']);

export interface Loops {
  /** 同一个人两小时里进同一处三次以上（更衣室四小时三次） */
  places: { who: AgentId; at: PlaceId; times: Minute[] }[];
  /** 同一个窗口一小时里点两次（正餐窗口吃饭的除外） */
  counters: { who: AgentId; at: PlaceId; times: Minute[] }[];
}

/** 每个人去过哪儿（换了地方才算一次；窗口按"拿到了"算一次）。场边长椅在两局之间歇（前后都在它看的场上打）不算 */
export function visitsOf(idx: PlaceIndex, s: SimState): Map<AgentId, { at: PlaceId; t: Minute }[]> {
  const out = new Map<AgentId, { at: PlaceId; t: Minute }[]>();
  const cur = new Map<AgentId, PlaceId>();
  for (const e of s.log) {
    if (!e.at || !patronish(s.agents[e.agent])) continue;
    if (e.kind === 'leave') {
      cur.delete(e.agent);
      continue;
    }
    if (e.kind !== 'start' && e.kind !== 'queue' && e.kind !== 'served') continue;
    if (e.doing === 'leave' || e.doing === 'arrive') continue;
    const p = idx.byId.get(e.at);
    if (!p) continue;
    let l = out.get(e.agent);
    if (!l) out.set(e.agent, (l = []));
    if (isCounter(p)) {
      if (e.kind === 'served') l.push({ at: e.at, t: e.t });
      cur.set(e.agent, e.at);
      continue;
    }
    if (e.kind === 'served') continue;
    if (cur.get(e.agent) !== e.at) l.push({ at: e.at, t: e.t });
    cur.set(e.agent, e.at);
  }
  return out;
}

export function findLoops(cfg: SimConfig, s: SimState): Loops {
  const idx = indexPlaces(cfg.places);
  const out: Loops = { places: [], counters: [] };
  for (const [who, vs] of visitsOf(idx, s)) {
    const by = new Map<PlaceId, Minute[]>();
    vs.forEach((v, i) => {
      const p = idx.byId.get(v.at);
      if (!p || LOOP_EXEMPT.has(p.kind)) return;
      // 两局之间在场边歇（前一处或后一处是它看的场）；打完一局在场边饮水点接杯水
      const faces = p.faces ?? [];
      if (faces.includes(vs[i - 1]?.at ?? '') || faces.includes(vs[i + 1]?.at ?? '')) return;
      const prev = idx.byId.get(vs[i - 1]?.at ?? '');
      if (isWater(p) && prev && (LOOP_EXEMPT.has(prev.kind) || prev.doing === 'tennis')) return;
      let l = by.get(v.at);
      if (!l) by.set(v.at, (l = []));
      l.push(v.t);
    });
    for (const [at, ts] of by) {
      const p = idx.byId.get(at);
      const win = p?.kind === 'locker' ? 240 : 120;
      for (let i = 0; i + 2 < ts.length; i++)
        if (ts[i + 2] - ts[i] < win) {
          out.places.push({ who, at, times: ts });
          break;
        }
      if (p && isCounter(p) && !servesMeal(p))
        for (let i = 0; i + 1 < ts.length; i++)
          if (ts[i + 1] - ts[i] < 60) {
            out.counters.push({ who, at, times: ts });
            break;
          }
    }
  }
  return out;
}

/** 看球的人分钟里，看的场前 10 分钟到后 20 分钟都没人在打的（对着空场"看球"）：总数、按地方 */
function emptyWatch(rec: Rec, cfg: SimConfig): { total: number; empty: number; by: Map<PlaceId, [number, number]> } {
  const B = 10;
  const A = 20;
  const pre = new Map<PlaceId, number[]>();
  for (const [f, l] of rec.live) {
    const ps = [0];
    for (const x of l) ps.push(ps[ps.length - 1] + (x ? 1 : 0));
    pre.set(f, ps);
  }
  let total = 0;
  let empty = 0;
  const by = new Map<PlaceId, [number, number]>();
  for (const p of cfg.places) {
    const ws = rec.watchers.get(p.id);
    if (!ws) continue;
    const v: [number, number] = [0, 0];
    ws.forEach((n, i) => {
      if (!n) return;
      v[0] += n;
      const lo = Math.max(0, i - B);
      const hi = Math.min(ws.length, i + A + 1);
      const live = (p.faces ?? []).some((f) => {
        const ps = pre.get(f);
        return !!ps && ps[hi] - ps[lo] > 0;
      });
      if (!live) v[1] += n;
    });
    total += v[0];
    empty += v[1];
    by.set(p.id, v);
  }
  return { total, empty, by };
}

/** 饮水点：接了几杯（按地点） */
export function waterSips(cfg: SimConfig, s: SimState): Map<PlaceId, number> {
  const idx = indexPlaces(cfg.places);
  const out = new Map<PlaceId, number>();
  for (const p of cfg.places) if (isWater(p)) out.set(p.id, 0);
  for (const e of s.log) {
    if (e.kind !== 'start' || !e.at || e.doing !== 'drink') continue;
    const p = idx.byId.get(e.at);
    if (p && isWater(p)) out.set(p.id, (out.get(p.id) ?? 0) + 1);
  }
  return out;
}

// ── 报告 ─────────────────────────────────────────────────────────────────────────

export interface HourRow {
  hour: number;
  present: number;
  staff: number;
  members: number;
  guests: number;
  kids: number;
  byScene: Record<string, number>;
  byGroup: Record<Group, number>;
}
export interface PlaceRow {
  id: PlaceId;
  name: string;
  kind: string;
  scene: SceneId;
  cap: number;
  /** 营业时间里平均坐满了几成 */
  util: number;
  peak: number;
  queuePeak: number;
}
export interface WaitRow {
  id: PlaceId;
  name: string;
  served: number;
  avg: number;
  max: number;
  gaveUp: number;
}
export interface Check {
  name: string;
  ok: boolean;
  /** 今天不适用（下雨天不看午饭高峰……）：排版打"—"，不打 ✓ */
  na?: boolean;
  detail: string;
}
export interface DayReport {
  title: string;
  counts: { total: number; staff: number; members: number; guests: number; kids: number; parties: number };
  peak: { t: Minute; n: number };
  hourly: HourRow[];
  places: PlaceRow[];
  waits: WaitRow[];
  /** 凑人打球：等了的人、凑上了的、平均等了几分钟 */
  seek: { waited: number; matched: number; gaveUp: number; avg: number };
  gaveUps: { t: Minute; who: string; note: string }[];
  lunchShare: number;
  courts: { morning: number; noon: number };
  coverage: { id: PlaceId; name: string; share: number }[];
  samples: { id: string; name: string; title: string; lines: string[] }[];
  /** 人在打转（同一处两小时三次、同一个零食窗口一小时两次） */
  loops: Loops;
  /** 看球的人分钟、其中对着空场的、按地方 [看的人·分钟, 对着空场的] */
  watch: { total: number; empty: number; by: { id: PlaceId; name: string; total: number; empty: number }[] };
  /** 饮水点接了几杯 */
  water: { id: PlaceId; name: string; sips: number }[];
  checks: Check[];
  violations: string[];
  ms: number;
}

const avgOf = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** 一个人的一天（事件 → 一行一行的"07:40 北停车场下车"） */
export function personDay(cfg: SimConfig, s: SimState, id: AgentId, log: readonly SimEvent[] = s.log): string[] {
  const out: string[] = [];
  const name = (pid: PlaceId | undefined) => (pid ? (indexPlaces(cfg.places).byId.get(pid)?.name ?? pid) : '');
  // 同一处接着坐（喝着、聊着、歇着）只写一行
  const calm = (d?: Doing) => d === 'rest' || d === 'chat' || d === 'drink';
  let sat: { at?: PlaceId; d?: Doing } = {};
  for (const e of log) {
    if (e.agent !== id) continue;
    const at = hm(e.t);
    if (e.kind === 'start' && e.doing !== 'leave') {
      if (calm(e.doing) && calm(sat.d) && sat.at === e.at) continue;
      sat = { at: e.at, d: e.doing };
    }
    switch (e.kind) {
      case 'arrive':
        out.push(`${at} ${e.note ?? `${name(e.at)}到了`}`);
        break;
      case 'queue':
        out.push(`${at} ${e.note ?? `${name(e.at)}排队`}`);
        break;
      case 'start':
        if (e.doing === 'checkin' || e.doing === 'order') break;
        if (e.doing === 'leave') out.push(`${at} 往外走（${e.note ?? '回家'}）`);
        else out.push(`${at} ${e.note ?? `${name(e.at)}${DOING_ZH[e.doing ?? 'rest']}`}`);
        break;
      case 'served':
        if (e.note) out.push(`${at} ${e.note}`);
        break;
      case 'end':
        if (e.note) out.push(`${at} ${e.note}`);
        break;
      case 'gaveUp':
      case 'full':
        out.push(`${at} ✗ ${e.note ?? '放弃了'}`);
        break;
      case 'shift':
        if (e.note !== '下班') out.push(`${at} ${e.note ?? '上岗'}`);
        break;
      case 'leave':
        out.push(`${at} ${e.note ?? '走了'}`);
        break;
    }
  }
  // 连着的一样的行（"上岗"两次之间没别的）合并
  return out.filter((l, i) => i === 0 || l.slice(6) !== out[i - 1].slice(6));
}

const SAMPLE_PREF = [
  'hector',
  'harold',
  'raj',
  'hannah',
  'marcus',
  'linh',
  'omar',
  'hal',
  'deb',
  'curtis',
  'tina',
  'rex',
];

function pickSamples(s: SimState, want?: readonly string[]): string[] {
  const here = (id: string) => !!s.agents[id] && s.log.some((e) => e.agent === id && e.kind === 'arrive');
  if (want?.length) return want.filter((id) => s.agents[id]);
  const out: string[] = [];
  for (const id of SAMPLE_PREF) if (out.length < 4 && here(id)) out.push(id);
  const ids = Object.keys(s.agents);
  const add = (f: (a: Agent) => boolean, n = 1) => {
    for (const id of ids) {
      if (n <= 0) break;
      if (!out.includes(id) && here(id) && f(s.agents[id])) {
        out.push(id);
        n--;
      }
    }
  };
  add((a) => a.role === 'member' && a.person.startsWith('reg:'));
  add((a) => a.role === 'kid');
  add((a) => a.person.startsWith('guest:sim:') && a.role === 'guest', 2);
  add((a) => a.role === 'vendor');
  add((a) => a.role === 'staff');
  while (out.length < 10) {
    const before = out.length;
    add((a) => !isStaff(a));
    if (out.length === before) break;
  }
  return out.slice(0, Math.max(10, want?.length ?? 0));
}

export function buildReport(run: DayRun, opts: { people?: readonly string[] } = {}): DayReport {
  const { cfg, final: s, rec } = run;
  const idx = indexPlaces(cfg.places);
  const cal = calendar(s.dayNo, s.weather);
  const w = s.weather;
  const sky = w.rain ? '雨' : w.wind ? '风沙' : '晴';
  const title =
    `第 ${s.dayNo} 天 ${cal.date} ${WEEKDAY_ZH[cal.weekday]} · ${SEASON_ZH[cal.season]} · 最高 ${w.high}°C ${sky}` +
    `${cal.exhibition ? ' · 晚上有表演赛' : ''} · 总监${run.director === 'desk.counter' ? '在前台' : run.director === '不在' ? '不在前台' : run.director}`;
  // 来了的人
  const came = Object.values(s.agents).filter((a) => s.log.some((e) => e.agent === a.id && e.kind === 'arrive'));
  const counts = {
    total: came.length,
    staff: came.filter(isStaff).length,
    members: came.filter((a) => !isStaff(a) && a.role !== 'kid' && a.role !== 'guest' && !a.id.startsWith('guest:'))
      .length,
    guests: came.filter((a) => !isStaff(a) && a.role !== 'kid' && (a.role === 'guest' || a.id.startsWith('guest:')))
      .length,
    kids: came.filter((a) => a.role === 'kid').length,
    parties: Object.keys(s.parties).length,
  };
  let peak = { t: 0, n: 0 };
  rec.present.forEach((n, i) => {
    if (n > peak.n) peak = { t: rec.minutes[i], n };
  });
  // 每小时（这一小时里的平均）
  const hourly: HourRow[] = [];
  for (let h = 5; h <= 23; h++) {
    const is = rec.minutes.map((t, i) => [t, i] as const).filter(([t]) => t >= h * 60 && t < h * 60 + 60);
    if (!is.length) continue;
    const av = (xs: number[]) => Math.round(avgOf(is.map(([, i]) => xs[i])));
    hourly.push({
      hour: h,
      present: av(rec.present),
      staff: av(rec.staff),
      members: av(rec.members),
      guests: av(rec.guests),
      kids: av(rec.kids),
      byScene: Object.fromEntries(Object.keys(rec.byScene).map((k) => [k, av(rec.byScene[k])])),
      byGroup: Object.fromEntries(Object.keys(rec.byGroup).map((k) => [k, av(rec.byGroup[k as Group])])) as Record<
        Group,
        number
      >,
    });
  }
  // 地点
  const places: PlaceRow[] = cfg.places
    .filter((p) => p.kind !== 'post' && p.kind !== 'entry')
    .map((p) => {
      const [a, b] = p.open ?? [OPEN, CLOSE];
      const open = Math.max(1, b - a);
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        scene: p.scene,
        cap: p.cap,
        util: (rec.placeMin.get(p.id) ?? 0) / (p.cap * open),
        peak: rec.placePeak.get(p.id) ?? 0,
        queuePeak: rec.queuePeak.get(p.id) ?? 0,
      };
    });
  // 排队（事件：排上 → 轮到 / 放弃）
  const qStart = new Map<string, number>();
  const waitAcc = new Map<PlaceId, { served: number; sum: number; max: number; gaveUp: number }>();
  const acc = (pid: PlaceId) => {
    let v = waitAcc.get(pid);
    if (!v) waitAcc.set(pid, (v = { served: 0, sum: 0, max: 0, gaveUp: 0 }));
    return v;
  };
  const gaveUps: DayReport['gaveUps'] = [];
  let seekWaited = 0;
  let seekMatched = 0;
  let seekGave = 0;
  let seekSum = 0;
  const seekStart = new Map<string, number>();
  for (const e of s.log) {
    const k = `${e.agent}@${e.at}`;
    if (e.kind === 'queue' && e.at && e.doing === 'queue' && !/拍架边/.test(e.note ?? '')) qStart.set(k, e.t);
    if (
      e.kind === 'start' &&
      e.at &&
      (e.doing === 'checkin' || e.doing === 'order' || e.doing === 'drink' || e.doing === 'shop')
    ) {
      const p = idx.byId.get(e.at);
      if (p && (p.queue ?? 0) > 0) {
        const t0 = qStart.get(k);
        const v = acc(e.at);
        v.served++;
        const wt = t0 === undefined ? 0 : e.t - t0;
        v.sum += wt;
        v.max = Math.max(v.max, wt);
        qStart.delete(k);
      }
    }
    if (e.kind === 'gaveUp' || e.kind === 'full') {
      gaveUps.push({ t: e.t, who: personOf(cfg, s, e.agent)?.nameZh ?? e.agent, note: e.note ?? '' });
      if (e.kind === 'gaveUp' && e.at && qStart.has(k)) {
        acc(e.at).gaveUp++;
        qStart.delete(k);
      }
    }
    // 凑人打球
    if (e.kind === 'start' && /找人凑/.test(e.note ?? '')) {
      if (!seekStart.has(e.agent)) seekStart.set(e.agent, e.t);
    }
    if (e.kind === 'queue' && /拍架边/.test(e.note ?? '') && !seekStart.has(e.agent)) seekStart.set(e.agent, e.t);
    if (e.kind === 'end' && /凑齐了/.test(e.note ?? '') && seekStart.has(e.agent)) {
      seekWaited++;
      seekMatched++;
      seekSum += e.t - (seekStart.get(e.agent) ?? e.t);
      seekStart.delete(e.agent);
    }
    if (e.kind === 'gaveUp' && /没凑够|没等到空场|没轮上/.test(e.note ?? '') && seekStart.has(e.agent)) {
      seekWaited++;
      seekGave++;
      seekStart.delete(e.agent);
    }
  }
  const waits: WaitRow[] = [...waitAcc.entries()]
    .map(([id, v]) => ({
      id,
      name: idx.byId.get(id)?.name ?? id,
      served: v.served,
      avg: v.served ? v.sum / v.served : 0,
      max: v.max,
      gaveUp: v.gaveUp,
    }))
    .sort((a, b) => b.avg * b.served - a.avg * a.served);
  // 午饭
  let lunchN = 0;
  let lunchAte = 0;
  for (const [id, m] of rec.lunchPresent) {
    if (m < 30) continue;
    lunchN++;
    if (rec.lunchAte.has(id)) lunchAte++;
  }
  const lunchShare = lunchN ? lunchAte / lunchN : 0;
  const coverage = [...rec.staffedMin.entries()]
    .map(([id, [on, all]]) => ({ id, name: idx.byId.get(id)?.name ?? id, share: on / Math.max(1, all) }))
    .sort((a, b) => a.share - b.share);
  // 抽样
  const samples = pickSamples(s, opts.people).map((id) => {
    const p = personOf(cfg, s, id);
    const a = s.agents[id];
    const party = a.party ? s.parties[a.party] : undefined;
    const withWho = party
      ? `，和${party.members
          .filter((m) => m !== id)
          .map((m) => personOf(cfg, s, m)?.nameZh ?? m)
          .join('、')}一起`
      : '';
    return {
      id,
      name: p ? `${p.nameZh}（${p.name}）` : id,
      title: `${p?.title ?? a.role}${withWho}`,
      lines: personDay(cfg, s, id),
    };
  });
  // 节奏
  const at = (h: number, m = 30) => rec.present[rec.minutes.indexOf(H(h, m))] ?? 0;
  const patrons = rec.present.map((n, i) => n - rec.staff[i]);
  const maxIn = (a: Minute, b: Minute, xs: number[] = patrons) =>
    Math.max(0, ...rec.minutes.map((t, i) => (t >= a && t < b ? xs[i] : 0)));
  const minIn = (a: Minute, b: Minute, xs: number[] = patrons) =>
    Math.min(...rec.minutes.map((t, i) => (t >= a && t < b ? xs[i] : Number.POSITIVE_INFINITY)));
  const morning = maxIn(H(7), H(11));
  const dip = minIn(H(13, 30), H(15, 30));
  const evening = maxIn(H(17), H(20, 30));
  const food = rec.eating;
  const lunchFood = maxIn(H(11, 30), H(13, 30), food);
  const midFood = maxIn(H(9), H(10, 30), food);
  const summer = cal.season === 'summer';
  const noonIdx = rec.minutes.map((t, i) => [t, i] as const).filter(([t]) => t >= H(12) && t < H(15));
  const patronsNoon = avgOf(noonIdx.map(([, i]) => patrons[i]));
  const poolNoon = avgOf(noonIdx.map(([, i]) => rec.byScene.clubpool[i]));
  // 夏天午饭以后（13–16 点）：凉棚下吃午饭的散了，外面最热的时候
  const hotIdx = rec.minutes.map((t, i) => [t, i] as const).filter(([t]) => t >= H(13) && t < H(16));
  const shelterNoon = avgOf(hotIdx.map(([, i]) => rec.shelter[i]));
  const outsideNoon = avgOf(hotIdx.map(([, i]) => rec.outside[i]));
  const poolHot = avgOf(hotIdx.map(([, i]) => rec.byScene.clubpool[i]));
  const late = [21, 21.5, 22, 22.5].map((x) => at(Math.floor(x), x % 1 ? 30 : 0));
  const named = Object.values(s.agents).filter((a) => cfg.cast.get(a.id)?.tier === 'named' && !isStaff(a));
  const namedMissing = cfg.cast
    .roster()
    .filter((p) => p.tier === 'named' && !isFixedRole(p.role) && p.week?.days.includes(cal.weekday))
    .filter((p) => !(cal.season === 'summer' && p.traits.includes('snowbird')) && !w.rain && !w.wind)
    .filter((p) => !came.some((a) => a.id === p.id))
    .map((p) => p.id);
  // ── 人物照着设定过（第 1 轮 critique 的几条）──
  const fair = !w.rain && !w.wind;
  const busyDay = fair && !summer;
  // 员工占在场的比例（8–20 点每小时）：晴天旺季 ≤ 35%；夏天 11–18 点（最热的时候只剩泳池、会所；外面的班 11 点下、
  // 店和二楼中午关、只开傍晚的餐车 16:45 才来）≤ 55%，早晚 ≤ 35%；下雨、风沙（室外的都关了，客人少一大半）≤ 60%
  // （下雨、风沙天客人不到 10 个的钟点不看：俱乐部几乎没人，留守的员工比客人多是正常的）
  const staffCap = (h: number) => (!fair ? 0.6 : summer && h >= 11 && h < 18 ? 0.55 : 0.35);
  const staffCapZh = !fair
    ? '下雨 / 风沙天 ≤ 60%（客人不到 10 个的钟点不看）'
    : summer
      ? '夏天 11–18 点 ≤ 55%、别的钟点 ≤ 35%'
      : '≤ 35%';
  const hourly0 = r0Hourly(rec, 8, 20);
  const staffShare = hourly0.map(([h, st, all]) => [h, all ? st / all : 0] as const);
  const worstStaff = staffShare.reduce((m, x) => (x[1] > m[1] ? x : m), [0, 0] as readonly [number, number]);
  const staffOver = staffShare.filter(([h, x], i) => x > staffCap(h) && (fair || hourly0[i][2] - hourly0[i][1] >= 10));
  const loops = findLoops(cfg, s);
  const loopList = [...loops.places, ...loops.counters]
    .slice(0, 4)
    .map((l) => `${l.who} ${idx.byId.get(l.at)?.name ?? l.at} ${l.times.map(hm).join(' ')}`)
    .join('；');
  const ew = emptyWatch(rec, cfg);
  const water = [...waterSips(cfg, s).entries()].map(([id, sips]) => ({
    id,
    name: idx.byId.get(id)?.name ?? id,
    sips,
  }));
  const sipTotal = water.reduce((a, x) => a + x.sips, 0);
  const sipPlaces = water.filter((x) => x.sips > 0).length;
  // 平日午饭：12 点前后三家以上的餐车前排着 ≥ 4 个人
  const longQ = [...rec.lunchQueue.values()].filter((n) => n >= 4).length;
  // 晚上 20–21 点还有人（酒吧、露台、晚场）
  const patronsAt = (t: Minute) => {
    const i = rec.minutes.indexOf(t);
    return i < 0 ? 0 : rec.present[i] - rec.staff[i];
  };
  const eveningN = Math.min(patronsAt(H(20)), patronsAt(H(20, 30)));
  // 老伤的人不上场
  const hurtPlayed = [
    ...new Set(
      s.log
        .filter((e) => e.kind === 'start' && (e.doing === 'tennis' || e.doing === 'pickle'))
        .filter((e) => !isFixedRole(s.agents[e.agent].role) && personOf(cfg, s, e.agent)?.traits.includes('oldinjury'))
        .map((e) => e.agent),
    ),
  ];
  // 孩子不自己来：跟着大人一伙（来当球童的从落客点进）
  const working = new Set(s.log.filter((e) => e.kind === 'shift').map((e) => e.agent));
  const loneKids = came
    .filter((a) => a.role === 'kid' || personOf(cfg, s, a.id)?.look.body === 'kid')
    .filter((a) => {
      if (isStaff(a) || working.has(a.id)) {
        // 来上班的孩子从落客点进（家里送）；坐公交来的（Mateo）从车道东头走进来
        const p = personOf(cfg, s, a.id);
        return !/drop|valet|落客/.test(a.entry) && !(p && ridesBus(p) && /walk|走路/.test(a.entry));
      }
      const party = a.party ? s.parties[a.party] : undefined;
      if (!party || party.lead === a.id) return true;
      return !party.members.some((m) => {
        const p = personOf(cfg, s, m);
        return p?.look.body === 'adult' && p.role !== 'kid';
      });
    })
    .map((a) => a.id);
  // 一天里不撞名（英文全名不重；不出第二个和有名有姓的人同名的）
  const fullNames = new Map<string, number>();
  const namedZh = new Set(
    cfg.cast
      .roster()
      .filter((p) => p.tier === 'named')
      .map((p) => p.nameZh),
  );
  let zhClash = 0;
  for (const a of came) {
    const p = personOf(cfg, s, a.id);
    if (!p) continue;
    fullNames.set(p.name, (fullNames.get(p.name) ?? 0) + 1);
    if ((a.id.startsWith('guest:sim:') || a.id.startsWith('staff:sim:')) && namedZh.has(p.nameZh)) zhClash++;
  }
  const dupNames = [...fullNames.values()].filter((n) => n > 1).length;
  // 凑人打球放弃的比例
  const giveUpRate = seekWaited ? seekGave / seekWaited : 0;
  // 来了不到半小时就走的（不算下雨、起风沙这种有原因的）
  const firstSeen = new Map<AgentId, Minute>();
  let shortVisits = 0;
  const shortWho: string[] = [];
  for (const e of s.log) {
    if (e.kind === 'arrive') firstSeen.set(e.agent, e.t);
    if (e.kind === 'start' && e.doing === 'leave') {
      const a = s.agents[e.agent];
      const t0 = firstSeen.get(e.agent);
      if (!a || isStaff(a) || t0 === undefined || e.t - t0 >= 30 || /下雨|风沙|关门/.test(e.note ?? '')) continue;
      shortVisits++;
      if (shortWho.length < 4) shortWho.push(`${e.agent}（${e.note ?? ''}）`);
    }
  }
  // 一个饭点只吃一顿正餐（在塔可、披萨、汉堡这种正餐车拿了两次饭、隔了不到两个钟头）
  const mealAt = new Map<AgentId, Minute>();
  let twoMeals = 0;
  for (const e of s.log) {
    if (e.kind !== 'served' || e.doing !== 'order' || !e.at) continue;
    const p = idx.byId.get(e.at);
    if (!p || !/taco|pizza|burger|塔可|披萨|汉堡/i.test(`${p.id}${p.name}`)) continue;
    const prev = mealAt.get(e.agent);
    if (prev !== undefined && e.t - prev < 120) twoMeals++;
    mealAt.set(e.agent, e.t);
  }
  const poolCover = coverage.filter((c) => idx.byId.get(c.id)?.kind === 'pool');
  const checks: Check[] = [
    {
      name: '早高峰',
      ok: w.rain || morning > dip * 1.2,
      na: w.rain,
      detail: `7–11 点最多 ${morning} 位客人 / 午后最少 ${dip}${w.rain ? '（下雨天不看）' : ''}`,
    },
    summer
      ? {
          // 夏天中午外面 40 多度：客人在泳池（水里、躺椅、凉亭）和会所里吹空调，室外的场、广场、餐车院子几乎没人
          name: '夏天中午只剩泳池和会所',
          ok: !fair || (shelterNoon >= outsideNoon * 3 && poolHot >= 5),
          na: !fair,
          detail:
            `13–16 点在泳池、会所里的客人平均 ${shelterNoon.toFixed(0)}（泳池 ${poolHot.toFixed(0)}，含员工），室外别处 ${outsideNoon.toFixed(0)}；` +
            `要求泳池和会所 ≥ 室外的三倍、泳池 ≥ 5（夏天不看午饭高峰；12–15 点平均 ${patronsNoon.toFixed(0)} 位客人、泳池 ${poolNoon.toFixed(0)}）`,
        }
      : {
          name: '午饭高峰',
          ok: lunchFood > midFood * 1.5,
          detail: `11:30–13:30 在吃的最多 ${lunchFood} 人 / 9–10:30 ${midFood}`,
        },
    {
      name: '午饭的人吃了',
      ok: summer || lunchN < 5 || lunchShare >= 0.6,
      na: summer || lunchN < 5,
      detail: `上午就来、午饭时段还在（≥30 分钟）的 ${lunchN} 人里 ${(lunchShare * 100).toFixed(0)}% 在俱乐部吃了`,
    },
    {
      name: '午后低谷',
      ok: w.rain || dip < morning * 0.85,
      na: w.rain,
      detail: `13:30–15:30 最少 ${dip} / 早上最多 ${morning}`,
    },
    {
      name: '晚场高峰',
      ok: w.rain || evening > dip * 1.2,
      na: w.rain,
      detail: `17–20:30 最多 ${evening} / 午后最少 ${dip}`,
    },
    {
      name: '中午室外场空一半',
      ok: !fair || rec.courtsNoon < rec.courtsMorning * 0.5,
      na: !fair,
      detail: `场地占用（人·分钟）8–10 点 ${rec.courtsMorning}，13–15 点 ${rec.courtsNoon}`,
    },
    { name: '21 点以后只减不增', ok: late.every((x, i) => i === 0 || x <= late[i - 1]), detail: late.join(' → ') },
    {
      name: 'named 会员按 week 来',
      ok: namedMissing.length === 0,
      detail: namedMissing.length ? `没来：${namedMissing.join('、')}` : `${named.length} 位都来了`,
    },
    {
      name: '员工守住营业时间',
      ok: coverage.every((c) => c.share >= 0.75),
      detail:
        coverage
          .filter((c) => c.share < 0.9)
          .map((c) => `${c.name} ${(c.share * 100).toFixed(0)}%`)
          .join('、') || '都 ≥ 90%',
    },
    {
      name: '员工占比',
      ok: staffOver.length === 0,
      detail:
        `8–20 点员工占在场的比例最高 ${(worstStaff[1] * 100).toFixed(0)}%（${worstStaff[0]} 点）；要求 ${staffCapZh}` +
        (staffOver.length ? `；超了：${staffOver.map(([h, x]) => `${h} 点 ${(x * 100).toFixed(0)}%`).join('、')}` : ''),
    },
    {
      name: '人不打转',
      ok: loops.places.length === 0 && loops.counters.length === 0,
      detail: loopList
        ? `${loopList}（共 ${loops.places.length + loops.counters.length} 处）`
        : '同一处两小时最多两回（更衣室四小时），零食窗口一小时最多一回',
    },
    {
      name: '看球看有人打的',
      ok: ew.total < 200 || ew.empty / ew.total < 0.03,
      detail: `看球 ${ew.total} 人·分钟，对着空场（前 10 后 20 分钟都没人打）${ew.empty}（${((ew.empty / Math.max(1, ew.total)) * 100).toFixed(1)}%）`,
    },
    {
      name: '饮水点有人用',
      ok: !busyDay || (sipTotal >= 40 && sipPlaces >= 5),
      na: !busyDay,
      detail: `${sipTotal} 杯，${sipPlaces}/${water.length} 处有人接过（${water.map((x) => `${x.name.replace(/（.*?）/g, '')} ${x.sips}`).join('、')}）`,
    },
    {
      name: '平日午饭排队',
      ok: !busyDay || cal.weekend || longQ >= 3,
      na: !busyDay || cal.weekend,
      detail: `11:50–12:30 队排到 ≥ 4 人的餐车 ${longQ} 家（${[...rec.lunchQueue.entries()].map(([k, n]) => `${idx.byId.get(k)?.name ?? k} ${n}`).join('、') || '没有队'}）`,
    },
    {
      name: '晚上 20 点还有人',
      ok: !busyDay || eveningN >= 25,
      na: !busyDay,
      detail: `20:00、20:30 在场的客人（不算员工）最少 ${eveningN}`,
    },
    {
      name: '老伤的不上场',
      ok: hurtPlayed.length === 0,
      detail: hurtPlayed.length ? `打了球：${hurtPlayed.join('、')}` : '都只在场边看、坐着聊',
    },
    {
      name: '孩子不自己来',
      ok: loneKids.length === 0,
      detail: loneKids.length
        ? `自己来的：${loneKids.join('、')}`
        : '都跟着大人（当球童的从落客点进，坐公交的从车道东头走进来）',
    },
    {
      name: '不撞名',
      ok: dupNames === 0 && zhClash === 0,
      detail: `英文全名重的 ${dupNames} 个；和有名有姓的人同名的生成的人 ${zhClash} 个`,
    },
    {
      name: '凑人打球少放弃',
      ok: seekWaited < 6 || giveUpRate < 0.15,
      na: seekWaited < 6,
      detail: `坐场边 / 拍架边等的 ${seekWaited} 伙里没凑上的 ${seekGave}（${(giveUpRate * 100).toFixed(0)}%）`,
    },
    {
      name: '不一来就走',
      ok: !fair || shortVisits === 0,
      na: !fair,
      detail: shortVisits ? `${shortVisits} 个人来了不到半小时就走：${shortWho.join('、')}` : '没有来了半小时内就走的',
    },
    {
      name: '一顿饭只吃一次',
      ok: twoMeals === 0,
      detail: twoMeals ? `${twoMeals} 次两个钟头内又去正餐车买饭` : '没有',
    },
    {
      name: '泳池营业不关',
      ok: !fair || poolCover.every((c) => c.share >= 0.99),
      na: !fair,
      detail: poolCover.map((c) => `${c.name} ${(c.share * 100).toFixed(1)}%`).join('、') || '泳池不开',
    },
    {
      name: '不变式',
      ok: rec.violations.length === 0,
      detail: rec.violations.length ? `${rec.violations.length} 条（见下）` : '没有违反',
    },
  ];
  return {
    title,
    counts,
    peak,
    hourly,
    places,
    waits,
    seek: { waited: seekWaited, matched: seekMatched, gaveUp: seekGave, avg: seekMatched ? seekSum / seekMatched : 0 },
    gaveUps,
    lunchShare,
    courts: { morning: rec.courtsMorning, noon: rec.courtsNoon },
    coverage,
    samples,
    loops,
    watch: {
      total: ew.total,
      empty: ew.empty,
      by: [...ew.by.entries()].map(([id, [total, empty]]) => ({
        id,
        name: idx.byId.get(id)?.name ?? id,
        total,
        empty,
      })),
    },
    water,
    checks,
    violations: rec.violations,
    ms: run.ms,
  };
}

/** 每小时（这一小时的平均）[时, 员工, 在场] */
function r0Hourly(rec: Rec, h0: number, h1: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let h = h0; h <= h1; h++) {
    let st = 0;
    let all = 0;
    let n = 0;
    rec.minutes.forEach((t, i) => {
      if (t < h * 60 || t >= h * 60 + 60) return;
      st += rec.staff[i];
      all += rec.present[i];
      n++;
    });
    if (n) out.push([h, st / n, all / n]);
  }
  return out;
}

// ── 排版 ─────────────────────────────────────────────────────────────────────────

/** 显示宽度（中文两格） */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-￿]/.test(ch) && !/[─-▟]/.test(ch) ? 2 : 1;
  return w;
}
const padE = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - textWidth(s)));
const padS = (s: string, n: number) => ' '.repeat(Math.max(0, n - textWidth(s))) + s;

const SCENE_SHORT: Record<string, string> = {
  clubpark: '停车',
  clubdesk: '前台',
  clubpickle: '匹克',
  clubplaza: '广场',
  clubstadium: '中心',
  clubcourts: '会员',
  clubclay: '红土',
  clubhouse: '会所',
  clubpool: '泳池',
  clubgolf: '球道',
  clubfood: '美食',
  travel: '路上',
};

function wrap(parts: readonly string[], width: number, indent: string): string[] {
  const out: string[] = [];
  let line = '';
  for (const p of parts) {
    const next = line ? `${line} → ${p}` : p;
    if (line && textWidth(indent + next) > width) {
      out.push(indent + line);
      line = `→ ${p}`;
    } else line = next;
  }
  if (line) out.push(indent + line);
  return out;
}

export function formatReport(r: DayReport, opts: { samples?: number } = {}): string {
  const L: string[] = [];
  L.push(`══ 俱乐部的一天 · ${r.title} ══`);
  const c = r.counts;
  L.push(
    `今天来了 ${c.total} 人：员工 ${c.staff}、会员和常客 ${c.members}、客人 ${c.guests}、孩子 ${c.kids}（${c.parties} 伙一起来的）；` +
      `最多同时 ${r.peak.n} 人（${hm(r.peak.t)}）。引擎一整天 ${r.ms.toFixed(0)} ms。`,
  );
  L.push('');
  // 每小时
  const scenes = [...SCENES, 'travel'];
  const maxP = Math.max(1, ...r.hourly.map((h) => h.present));
  const groups = Object.keys(GROUP_ZH) as Group[];
  const head =
    `${padE('时刻', 6)}${padS('在场', 5)}${padS('员工', 5)}${padS('会员', 5)}${padS('客人', 5)}${padS('孩子', 5)} │` +
    groups.map((g) => padS(GROUP_ZH[g], 5)).join('') +
    ' │' +
    scenes.map((k) => padS(SCENE_SHORT[k], 5)).join('') +
    '  在场人数';
  L.push('【每小时在场（这一小时的平均）】');
  L.push(head);
  for (const h of r.hourly) {
    const bar = '█'.repeat(Math.round((h.present / maxP) * 30));
    L.push(
      `${padE(`${String(h.hour).padStart(2, '0')}:00`, 6)}${padS(String(h.present), 5)}${padS(String(h.staff), 5)}${padS(String(h.members), 5)}${padS(String(h.guests), 5)}${padS(String(h.kids), 5)} │` +
        groups.map((g) => padS(String(h.byGroup[g] || '·'), 5)).join('') +
        ' │' +
        scenes.map((k) => padS(String(h.byScene[k] || '·'), 5)).join('') +
        `  ${bar}`,
    );
  }
  L.push('');
  L.push('【节奏检查】');
  for (const k of r.checks) L.push(`  ${k.na ? '—' : k.ok ? '✓' : '✗'} ${padE(k.name, 20)} ${k.detail}`);
  L.push(
    `  看球对着空场：${r.watch.by
      .filter((x) => x.total)
      .map((x) => `${x.name.replace(/（.*?）/g, '')} ${x.empty}/${x.total}`)
      .join('、')}`,
  );
  L.push('');
  // 各场景的地点
  L.push('【地点（营业时间里平均坐满几成 · 最多几个人 / 容量 · 队最长）】');
  const byScene = new Map<string, PlaceRow[]>();
  for (const p of r.places) {
    let l = byScene.get(p.scene);
    if (!l) byScene.set(p.scene, (l = []));
    l.push(p);
  }
  for (const sc of SCENES) {
    const l = byScene.get(sc);
    if (!l?.length) continue;
    L.push(`  ${SCENE_NAME[sc]}`);
    for (const p of l) {
      const bar = '▇'.repeat(Math.round(Math.min(1, p.util) * 10)).padEnd(10, '·');
      L.push(
        `    ${padE(p.name, 34)} ${bar} ${padS(`${Math.round(p.util * 100)}%`, 4)}  最多 ${padS(String(p.peak), 3)}/${padE(String(p.cap), 4)}${p.queuePeak ? ` 队 ${p.queuePeak}` : ''}`,
      );
    }
  }
  L.push('');
  L.push('【排队（排了多久才轮到）】');
  L.push(`  ${padE('地点', 30)}${padS('人次', 6)}${padS('平均', 7)}${padS('最长', 7)}${padS('放弃', 6)}`);
  for (const w of r.waits.slice(0, 14))
    L.push(
      `  ${padE(w.name, 30)}${padS(String(w.served), 6)}${padS(`${w.avg.toFixed(1)}分`, 7)}${padS(`${w.max}分`, 7)}${padS(String(w.gaveUp), 6)}`,
    );
  L.push(
    `  凑人打球：坐在场边 / 拍架边等的 ${r.seek.waited} 伙，凑上了 ${r.seek.matched}（平均等 ${r.seek.avg.toFixed(1)} 分钟），没凑上走了 ${r.seek.gaveUp}`,
  );
  L.push('');
  L.push(`【放弃、换地方（${r.gaveUps.length} 次，按时刻）】`);
  const why = new Map<string, number>();
  for (const g of r.gaveUps) {
    const k = g.note.replace(/\d+/g, 'N').replace(/（.*?）/g, '');
    why.set(k, (why.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...why.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10))
    L.push(`  ${padS(String(n), 4)} × ${k}`);
  for (const g of r.gaveUps.slice(0, 8)) L.push(`    ${hm(g.t)} ${g.who}：${g.note}`);
  L.push('');
  L.push('【员工守岗（要人在岗才开的地方：营业时间里有人的比例，最低的几个）】');
  L.push(
    `  ${r.coverage
      .slice(0, 8)
      .map((c) => `${c.name} ${(c.share * 100).toFixed(0)}%`)
      .join(' · ')}`,
  );
  L.push('');
  L.push('【抽几个人的一天】');
  for (const sm of r.samples.slice(0, opts.samples ?? 10)) {
    L.push(`  ◆ ${sm.name} · ${sm.title}`);
    L.push(...wrap(sm.lines, 118, '      '));
  }
  L.push('');
  L.push(`【不变式】${r.violations.length ? `${r.violations.length} 条` : '没有违反'}`);
  for (const v of r.violations.slice(0, 12)) L.push(`  ✗ ${v}`);
  return L.join('\n');
}

export { CLOSE, DAY_END, hm };
