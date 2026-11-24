// 俱乐部的一天 · 引擎（SimApi 的实现）：startDay 排日程，step 推一分钟，view 给画面的快照。
// 设计：docs/design/club-sim.md 第四节。纯函数：不改传进来的状态（写时复制：这一步动过的人、地点才复制一份），
// 不用 Math.random / Date.now（随机都按 种子 + 天 + 人 + 分钟 哈希），状态 JSON 往返不变。
//
// 一步里按这个顺序：
//   1. 需求（每 5 分钟涨一次：饿、渴、累）和耐心（排队、等凑人的每分钟扣 1）
//   2. 每一伙人（一伙 = 一个 Party，或者一个落单的人；带头的拿主意，其余的跟着）：
//      到点的从出入口出现 → 路上到了的进地方（排队 / 开始干）→ 干完的挑下一件（需求插队、太热不打、满了换地方）
//   3. 排队的：地方空出来、开着（摊主在岗、总监在前台……），队头进去；等不下去的放弃
//   4. 等着凑人打球的：水平差不多的凑成两个或四个，有空场就上
import { clamp, hashOf, int, rngOf } from '../cast/rng';
import { isFixedRole } from '../cast/slots';
import type { CastPerson } from '../cast/types';
import {
  allows,
  type Calendar,
  CLOSE,
  calendar,
  DAY_START,
  defaultWeather,
  H,
  heatAt,
  homeScene,
  hungerLine,
  hungerRate,
  indexPlaces,
  isCounter,
  isDropEntry,
  isExclusive,
  isLot,
  isOutdoor,
  isService,
  isWater,
  kindsOf,
  lotMode,
  OPEN,
  outdoorPenalty,
  type PlaceIndex,
  patienceOf,
  planDay,
  servesDrink,
  servesMeal,
  servesSnack,
  travelMin,
  WALK_M_PER_MIN,
} from './plan';
import type {
  Agent,
  AgentId,
  AgentView,
  Doing,
  EventKind,
  Intent,
  Minute,
  Place,
  PlaceId,
  PlaceKind,
  SimApi,
  SimConfig,
  SimEvent,
  SimInput,
  SimState,
  Weather,
} from './types';

export const DOING_ZH: Record<Doing, string> = {
  arrive: '到了',
  leave: '回家',
  travel: '在路上',
  queue: '排队',
  checkin: '签到',
  tennis: '打网球',
  pickle: '打匹克球',
  lesson: '上课',
  coach: '带课',
  warmup: '热身',
  watch: '看球',
  rest: '坐着歇',
  chat: '聊天',
  order: '点单',
  eat: '吃饭',
  drink: '喝东西',
  shop: '逛店',
  gym: '健身',
  change: '更衣',
  swim: '游泳',
  sunbathe: '晒太阳',
  golf: '打高尔夫',
  kidplay: '玩',
  work: '干活',
  break: '歇班',
};

const KIND_ZH: Partial<Record<PlaceKind, string>> = {
  pool: '泳池',
  stall: '摊位',
  cafe: '咖啡吧',
  bar: '酒吧',
  shop: '店',
  gym: '健身房',
  golf: '高尔夫',
  lounger: '躺椅',
  court: '球场',
  pickle: '匹克球场',
  locker: '更衣室',
  table: '桌子',
  seat: '长椅',
  stand: '看台',
  play: '玩的地方',
};

const PLAY: ReadonlySet<Doing> = new Set(['tennis', 'pickle', 'lesson', 'golf', 'gym', 'swim', 'coach', 'kidplay']);
const SIT: ReadonlySet<Doing> = new Set(['rest', 'chat', 'eat', 'drink', 'sunbathe', 'watch', 'break']);
/** 软的事（饿极了可以打断） */
const SOFT: ReadonlySet<Doing> = new Set(['rest', 'chat', 'watch', 'sunbathe', 'kidplay', 'shop']);
const COURTY: ReadonlySet<PlaceKind> = new Set(['court', 'pickle']);
const EMPTY: readonly AgentId[] = [];

/** 这个人是谁（演员表里的 named / regular，或者模拟生成的客人、顶岗） */
export function personOf(cfg: SimConfig, s: SimState, id: string): CastPerson | undefined {
  return s.people?.[id] ?? cfg.cast.get(id);
}

/** 还在上班的（员工、摊主、教练：日程里有必须的事）；职业球员算客人那样会饿 */
const worker = (a: Agent) =>
  isFixedRole(a.role) && a.role !== 'pro' && (a.plan.some((i) => i.must) || a.doing === 'work' || a.doing === 'coach');

const preDoing = (d: Doing): Doing =>
  d === 'tennis' || d === 'pickle' || d === 'lesson' || d === 'golf'
    ? 'warmup'
    : d === 'coach' || d === 'work'
      ? 'work'
      : d === 'watch'
        ? 'watch'
        : 'rest';

/** 正往这走、到了会占位置的（往外走的、去拍架边排队的不算） */
const occupies = (a: Agent) => a.doing !== 'leave' && a.plan[0]?.doing !== 'queue';

const isCourtPlay = (i: Intent | undefined) => !!i && (i.doing === 'tennis' || i.doing === 'pickle');
/** 坐在场边等凑人：日程第一项是看球（有指定位置），第二项是还没定场的打球 */
const isSeeking = (plan: readonly Intent[]) =>
  plan.length >= 2 &&
  (plan[0].doing === 'watch' || plan[0].doing === 'queue') &&
  !!plan[0].at &&
  isCourtPlay(plan[1]) &&
  !plan[1].at;
const eatish = (i: Intent | undefined) => !!i && (i.doing === 'eat' || i.doing === 'order');
const drinkish = (i: Intent | undefined) => !!i && (i.doing === 'drink' || i.doing === 'eat' || i.doing === 'order');

// ── 一步的工作区（写时复制） ─────────────────────────────────────────────────────

class Tick {
  readonly t: Minute;
  readonly idx: PlaceIndex;
  readonly cal: Calendar;
  readonly w: Weather;
  readonly walk: number;
  readonly agents: Record<AgentId, Agent>;
  readonly occ: Record<PlaceId, AgentId[]>;
  readonly q: Record<PlaceId, AgentId[]>;
  readonly inbound = new Map<PlaceId, number>();
  readonly events: SimEvent[] = [];
  private own = new Set<AgentId>();
  private ownOcc = new Set<PlaceId>();
  private ownQ = new Set<PlaceId>();
  private staffedCache = new Map<PlaceId, boolean>();
  private bookCache?: Map<PlaceId, [Minute, Minute, AgentId][]>;

  /** 订好的场（日程里有指定场地、指定钟点的打球）：场 → [开始, 结束, 谁][] */
  bookings(): Map<PlaceId, [Minute, Minute, AgentId][]> {
    if (this.bookCache) return this.bookCache;
    const m = new Map<PlaceId, [Minute, Minute, AgentId][]>();
    for (const id in this.agents) {
      const a = this.agents[id];
      if (!a.plan.length) continue;
      for (const it of a.plan) {
        if (!it.must || !it.at || it.after === undefined || !isCourtPlay(it)) continue;
        let l = m.get(it.at);
        if (!l) m.set(it.at, (l = []));
        l.push([it.after, it.after + it.minutes, id]);
      }
    }
    this.bookCache = m;
    return m;
  }

  constructor(
    readonly cfg: SimConfig,
    readonly s: SimState,
    readonly input: SimInput,
    /** 快进（stepMany）：s 的三张表是快进自己上一步做出来的，没交给过别人，直接改（省掉每步复制几百个人的表） */
    owned = false,
  ) {
    this.t = s.minute + 1;
    this.idx = indexPlaces(cfg.places);
    this.cal = calendar(s.dayNo, s.weather);
    this.w = s.weather;
    this.walk = cfg.walk ?? WALK_M_PER_MIN;
    this.agents = owned ? s.agents : { ...s.agents };
    this.occ = owned ? s.occupants : { ...s.occupants };
    this.q = owned ? s.queues : { ...s.queues };
    // 一遍扫完：在场的、在路上的、在场的员工、这一步要动的伙（带头的）。不在场、还没到点的人这一步不用看
    for (const id in s.agents) {
      const a = s.agents[id];
      const w = a.where;
      const lead = !a.party || s.parties[a.party]?.lead === id;
      if (w.kind === 'away') {
        if (lead && a.plan.length && this.t >= a.arrive) this.leads.push(id);
        continue;
      }
      this.present.push(id);
      if (lead) this.leads.push(id);
      if (isFixedRole(a.role)) this.staffHere.push(id);
      if (w.kind === 'travel') {
        this.travellers.push(id);
        if (occupies(a)) this.addIn(w.to, 1);
      }
    }
  }
  /** 这一步开始时在场的人、在路上的人、在场的员工、要动的伙的带头人（都按 agents 的顺序） */
  readonly present: AgentId[] = [];
  readonly travellers: AgentId[] = [];
  readonly staffHere: AgentId[] = [];
  readonly leads: AgentId[] = [];

  get(id: AgentId): Agent {
    return this.agents[id];
  }
  mut(id: AgentId): Agent {
    if (!this.own.has(id)) {
      this.agents[id] = { ...this.agents[id] };
      this.own.add(id);
    }
    return this.agents[id];
  }
  /** 改一个人（值是 undefined 的键删掉：JSON 往返后键的顺序还一样，往返前后接着走结果一模一样） */
  set(id: AgentId, patch: Partial<Agent>): void {
    const a = this.mut(id) as unknown as Record<string, unknown>;
    for (const k in patch) {
      const v = (patch as Record<string, unknown>)[k];
      if (v === undefined) delete a[k];
      else a[k] = v;
    }
  }
  place(id: PlaceId | undefined): Place | undefined {
    return id === undefined ? undefined : this.idx.byId.get(id);
  }
  person(id: AgentId): CastPerson | undefined {
    return personOf(this.cfg, this.s, id);
  }
  name(id: AgentId): string {
    const p = this.person(id);
    return p ? p.nameZh || p.name : id;
  }
  rng(id: string, tag: string) {
    return rngOf(this.cfg.seed, 'sim', this.s.dayNo, id, this.t, tag);
  }
  emit(kind: EventKind, agent: AgentId, at?: PlaceId, doing?: Doing, note?: string): void {
    const e: SimEvent = { t: this.t, kind, agent };
    if (at !== undefined) e.at = at;
    if (doing !== undefined) e.doing = doing;
    if (note !== undefined) e.note = note;
    this.events.push(e);
  }

  // 地点上的人、队
  occOf(pid: PlaceId): readonly AgentId[] {
    return this.occ[pid] ?? EMPTY;
  }
  qOf(pid: PlaceId): readonly AgentId[] {
    return this.q[pid] ?? EMPTY;
  }
  private occW(pid: PlaceId): AgentId[] {
    if (!this.ownOcc.has(pid) || !this.occ[pid]) {
      this.occ[pid] = (this.occ[pid] ?? []).slice();
      this.ownOcc.add(pid);
    }
    return this.occ[pid];
  }
  private qW(pid: PlaceId): AgentId[] {
    if (!this.ownQ.has(pid) || !this.q[pid]) {
      this.q[pid] = (this.q[pid] ?? []).slice();
      this.ownQ.add(pid);
    }
    return this.q[pid];
  }
  addIn(pid: PlaceId, d: number): void {
    this.inbound.set(pid, Math.max(0, (this.inbound.get(pid) ?? 0) + d));
  }
  inOf(pid: PlaceId): number {
    return this.inbound.get(pid) ?? 0;
  }
  /** 从现在的地方（在场、排队、路上）抽出来 */
  release(id: AgentId): void {
    const a = this.get(id);
    const w = a.where;
    if (w.kind === 'at') {
      const l = this.occW(w.at);
      const i = l.indexOf(id);
      if (i >= 0) l.splice(i, 1);
      if (!l.length) delete this.occ[w.at];
      if (this.idx.byId.get(w.at)?.kind === 'post') this.staffedCache.delete(w.at);
    } else if (w.kind === 'queue') {
      const l = this.qW(w.at);
      const i = l.indexOf(id);
      if (i >= 0) l.splice(i, 1);
      if (!l.length) delete this.q[w.at];
    } else if (w.kind === 'travel' && occupies(a)) this.addIn(w.to, -1);
  }
  pushOcc(pid: PlaceId, id: AgentId): void {
    this.occW(pid).push(id);
    if (this.idx.byId.get(pid)?.kind === 'post') this.staffedCache.delete(pid);
  }
  pushQ(pid: PlaceId, id: AgentId): void {
    this.qW(pid).push(id);
  }
  removeQ(pid: PlaceId, id: AgentId): void {
    const l = this.qW(pid);
    const i = l.indexOf(id);
    if (i >= 0) l.splice(i, 1);
    if (!l.length) delete this.q[pid];
  }

  /**
   * 岗位上有人在干活；或者交接的那一两分钟：下一个上岗的人已经在路上 / 在旁边等着（3 分钟以内就到岗），
   * 摊位、泳池不因为换班关一下（救生员换班时池子照开）
   */
  staffed(post: PlaceId): boolean {
    let v = this.staffedCache.get(post);
    if (v === undefined) {
      v = this.occOf(post).some((id) => {
        const d = this.get(id).doing;
        return d === 'work' || d === 'coach';
      });
      if (!v) v = this.handover().has(post);
      this.staffedCache.set(post, v);
    }
    return v;
  }
  /** 这一步里各停车场用着的车位（stallsUsed） */
  readonly stallCache = new Map<string, Set<number>>();
  private liveCache?: Set<string>;
  /** 这个场景里此刻有人在场上打球、上课 */
  live(scene: string): boolean {
    if (!this.liveCache) {
      const out = new Set<string>();
      for (const k of ['court', 'pickle', 'lesson', 'post'] as const)
        for (const p of kindsOf(this.idx, k))
          if (
            this.occOf(p.id).some((id) => {
              const d = this.get(id).doing;
              return d === 'tennis' || d === 'pickle' || d === 'lesson' || d === 'coach';
            })
          )
            out.add(p.scene);
      this.liveCache = out;
    }
    return this.liveCache.has(scene);
  }
  private handoverCache?: Set<PlaceId>;
  handover(): Set<PlaceId> {
    this.handoverCache ??= handoverPosts(this.agents, this.t, this.staffHere);
    return this.handoverCache;
  }

  /** 开着没有：营业时间、要员工的有人在岗、下雨室外关、周一上午红土维护 */
  isOpen(p: Place): boolean {
    const k = p.kind;
    if (k === 'post' || k === 'staff' || k === 'entry') return true;
    const [a, b] = p.open ?? [OPEN, CLOSE];
    if (this.t < a || this.t >= b) return false;
    if (p.needs && !this.staffed(p.needs)) return false;
    if (this.w.rain && isOutdoor(p)) return false;
    if (this.w.wind && (k === 'pool' || k === 'lounger' || k === 'golf')) return false;
    if (this.cal.weekday === 0 && p.scene === 'clubclay' && k === 'court' && this.t < H(8)) return false;
    return true;
  }

  /** 在 p 里干事的人数（窗口：只算在窗口前点单的，窗口边等餐的不算） */
  busy(p: Place): number {
    const l = this.occOf(p.id);
    if (!p.pickup) return l.length;
    let n = 0;
    for (const id of l) if ((this.get(id).spot ?? 0) < p.cap) n++;
    return n;
  }
  /** 窗口边等餐的人数 */
  waiting(p: Place): number {
    return this.occOf(p.id).length - this.busy(p);
  }

  /** 还能进几个人（在场的 + 正往这走的都算占着；self = 这伙人自己已经占着的） */
  room(p: Place, self: readonly AgentId[] = EMPTY): number {
    let mine = 0;
    for (const id of self) {
      const w = this.get(id).where;
      if ((w.kind === 'at' && w.at === p.id) || (w.kind === 'travel' && w.to === p.id)) mine++;
    }
    return p.cap - this.busy(p) - this.inOf(p.id) + mine;
  }

  /** 没人用（独占的场、桌） */
  vacant(p: Place, self: readonly AgentId[] = EMPTY): boolean {
    return this.room(p, self) === p.cap;
  }

  /** 进去时挑站位：场上两个人站两边（0、2），一对搭档站一边，别的挑最小的空位 */
  freeSpot(p: Place, unitSize: number, k: number): number {
    const used = new Set<number>();
    for (const o of this.occOf(p.id)) {
      const sp = this.get(o).spot;
      if (sp !== undefined) used.add(sp);
    }
    let order: number[];
    if (COURTY.has(p.kind) && p.cap === 4) {
      const expected = this.occOf(p.id).length + this.inOf(p.id) + 1;
      if (unitSize >= 2 && unitSize < 4 && expected > 2) order = [0, 1, 2, 3];
      else order = [0, 2, 1, 3];
      if (unitSize === 2 && expected > 2 && k === 1) {
        // 搭档挨着站：跟第一个人在同一边
        const first = [...used].find((x) => x === 0 || x === 2);
        if (first !== undefined && !used.has(first + 1)) return first + 1;
      }
    } else order = Array.from({ length: Math.max(1, p.cap) }, (_, i) => i);
    for (const i of order) if (!used.has(i)) return i;
    let i = 0;
    while (used.has(i)) i++;
    return i;
  }
}

/** 正在来接班的岗位（人在场、日程的头两项里有这个岗位的班，3 分钟以内开始）：交接的那一两分钟岗位算有人 */
export function handoverPosts(agents: Record<AgentId, Agent>, t: Minute, ids?: readonly AgentId[]): Set<PlaceId> {
  const out = new Set<PlaceId>();
  for (const id of ids ?? Object.keys(agents)) {
    const a = agents[id];
    if (a.where.kind === 'away' || !isFixedRole(a.role)) continue;
    for (let i = 0; i < 2 && i < a.plan.length; i++) {
      const it = a.plan[i];
      if (it.doing !== 'work' || !it.at || it.after === undefined) continue;
      if (it.after <= t + 3 && it.after + it.minutes > t) out.add(it.at);
    }
  }
  return out;
}

/** 岗位此刻有没有人守着（在岗干活的，或者交接中）：引擎和报告用同一个判断 */
export function postStaffed(s: SimState, post: PlaceId, handover?: ReadonlySet<PlaceId>): boolean {
  for (const id of s.occupants[post] ?? EMPTY) {
    const d = s.agents[id].doing;
    if (d === 'work' || d === 'coach') return true;
  }
  return (handover ?? handoverPosts(s.agents, s.minute)).has(post);
}

// ── 小工具 ───────────────────────────────────────────────────────────────────────

function membersOf(T: Tick, a: Agent): readonly AgentId[] {
  if (!a.party) return [a.id];
  const p = T.s.parties[a.party];
  return p ? p.members : [a.id];
}

const isLead = (T: Tick, a: Agent) => !a.party || T.s.parties[a.party]?.lead === a.id;

function curPlace(a: Agent): PlaceId {
  const w = a.where;
  if (w.kind === 'at' || w.kind === 'queue') return w.at;
  if (w.kind === 'travel') return w.to;
  return a.entry;
}

function unshiftAll(T: Tick, ms: readonly AgentId[], it: Intent): void {
  for (const id of ms) T.set(id, { plan: [it, ...T.get(id).plan] });
}
function popAll(T: Tick, ms: readonly AgentId[]): void {
  for (const id of ms) T.set(id, { plan: T.get(id).plan.slice(1) });
}
function setFirstAll(T: Tick, ms: readonly AgentId[], f: (it: Intent) => Intent): void {
  for (const id of ms) {
    const plan = T.get(id).plan;
    if (plan.length) T.set(id, { plan: [f(plan[0]), ...plan.slice(1)] });
  }
}

/** 站在原地等着跟大家一起走（不占位；同一步里 moveUnit / goLeave 马上把他带走） */
function standBy(T: Tick, id: AgentId, pid: PlaceId): void {
  T.release(id);
  T.set(id, { where: { kind: 'travel', from: pid, to: pid, t0: T.t, t1: T.t }, doing: 'travel', spot: undefined });
  T.addIn(pid, 1);
}

/** 这伙人眼下有必须的事（课、班、约好的场） */
const unitMust = (T: Tick, ms: readonly AgentId[]) => ms.some((id) => !!T.get(id).plan[0]?.must);

function doingAt(it: Intent, p: Place, partySize: number): Doing {
  const d = it.doing;
  if (d === 'rest' && (p.kind === 'cafe' || p.kind === 'bar')) return 'drink';
  if (d === 'rest' && p.kind === 'stand') return 'watch';
  if (d === 'rest' && partySize >= 2) return 'chat';
  if (d === 'kidplay' && p.kind === 'pool') return 'swim';
  if (d === 'tennis' && p.kind === 'pickle') return 'pickle';
  if (d === 'break' && p.kind === 'table') return 'eat';
  return d;
}

function likes(p: CastPerson | undefined, pl: Place): boolean {
  if (!p) return false;
  for (const l of p.likes) {
    if (pl.scene === 'clubclay' && l.includes('红土')) return true;
    if (pl.kind === 'pool' && l.includes('泳')) return true;
    if (pl.name.length >= 2 && l.includes(pl.name.slice(0, 2))) return true;
  }
  return false;
}
const prefersClay = (T: Tick, a: Agent) => {
  const p = T.person(a.id);
  return !!p && (p.likes.some((l) => l.includes('红土')) || homeScene(T.cfg, p, T.s.dayNo) === 'clubclay');
};

/** 中心球场上有职业球员在打 */
function proOnCourt(T: Tick): boolean {
  for (const p of kindsOf(T.idx, 'post'))
    if (p.doing === 'tennis' && T.occOf(p.id).some((id) => T.get(id).doing === 'tennis')) return true;
  return false;
}

const habit = (T: Tick, who: string, pid: string) => (hashOf(T.cfg.seed, T.s.dayNo, who, pid) % 1000) / 1000;

// ── 进出 ─────────────────────────────────────────────────────────────────────────

function enterRaw(T: Tick, id: AgentId, p: Place, until: Minute, doing: Doing, unitSize = 1, k = 0): void {
  // 原地换一件事：站位不变（没被别人占的话）
  const a = T.get(id);
  const keep = a.where.kind === 'at' && a.where.at === p.id && a.spot !== undefined ? a.spot : undefined;
  const taken = keep !== undefined && T.occOf(p.id).some((o) => o !== id && T.get(o).spot === keep);
  const spot = keep !== undefined && !taken ? keep : T.freeSpot(p, unitSize, k);
  T.set(id, { where: { kind: 'at', at: p.id, since: T.t, until }, doing, spot });
  T.pushOcc(p.id, id);
}

/** 一个停车场此刻用着的车位（一伙人一个；这一步里刚分出去的也算） */
function stallsUsed(T: Tick, mode: 'lotN' | 'lotS'): Set<number> {
  let used = T.stallCache.get(mode);
  if (!used) {
    used = new Set();
    for (const id of T.present) {
      const a = T.get(id);
      if (a.car === mode && a.stall !== undefined) used.add(a.stall);
    }
    T.stallCache.set(mode, used);
  }
  return used;
}

/**
 * 开车来的一伙人找车位：先自己想停的那个停车场，满了换另一个，都满了开到代客落客点把车交给泊车员（车开去场外）。
 * 车位从开头某一格往后找（按这伙人的种子），一伙人一个，走了才空出来。
 */
function park(T: Tick, ms: readonly AgentId[]): void {
  const L = T.get(ms[0]);
  if (L.car !== 'lotN' && L.car !== 'lotS') return;
  const lots = T.idx.entries.filter(isLot);
  const want = lots.find((e) => lotMode(e) === L.car);
  const order = want ? [want, ...lots.filter((e) => e !== want)] : lots;
  const h = hashOf(T.cfg.seed, T.s.dayNo, ms[0], 'stall');
  for (const lot of order) {
    const mode = lotMode(lot) as 'lotN' | 'lotS';
    const n = lot.stalls ?? 0;
    const used = stallsUsed(T, mode);
    for (let k = 0; k < n; k++) {
      const st = (h + k) % n;
      if (used.has(st)) continue;
      used.add(st);
      for (const id of ms) T.set(id, { car: mode, stall: st, entry: lot.id });
      return;
    }
  }
  const valet = T.idx.entries.find(isDropEntry);
  if (!valet) return;
  for (const id of ms) T.set(id, { car: 'valet', stall: undefined, entry: valet.id });
  const lotName = want ? shortName(want) : '停车场';
  T.emit('full', ms[0], valet.id, 'arrive', `${lotName}停满了，车交给代客泊车`);
}

function arriveUnit(T: Tick, ms: readonly AgentId[]): void {
  park(T, ms);
  const L = T.get(ms[0]);
  const e = T.place(L.entry);
  if (!e) return;
  // 出入口挤满了：晚一分钟。一伙人比出入口还大（五个人在落客点下车）：等它空了，先下来的站进去，其余的站在旁边，下一分钟一起走
  const fit = Math.min(ms.length, e.cap);
  if (T.room(e) < fit) return;
  const how = /停车|落客|lot|drop/i.test(`${e.id}${e.name}`) ? '下车' : '进门';
  ms.forEach((id, k) => {
    if (k < fit) enterRaw(T, id, e, T.t + 1, 'arrive', ms.length, k);
    else {
      T.set(id, {
        where: { kind: 'travel', from: e.id, to: e.id, t0: T.t, t1: T.t + 1 },
        doing: 'arrive',
        spot: undefined,
      });
      T.addIn(e.id, 1);
    }
    const a = T.get(id);
    T.emit('arrive', id, e.id, 'arrive', worker(a) ? `${e.name}${how}，来上班` : `${e.name}${how}`);
  });
}

function exitAgent(T: Tick, id: AgentId): void {
  const a = T.get(id);
  T.release(id);
  const e = T.place(a.entry);
  T.set(id, { where: { kind: 'away' }, doing: 'leave', spot: undefined, plan: [] });
  T.emit('leave', id, a.entry, 'leave', `从${e?.name ?? '出口'}离开`);
}

function goLeave(T: Tick, ms: readonly AgentId[], why: string): void {
  const L = T.get(ms[0]);
  const e = T.place(L.entry);
  let tmax = 0;
  for (const id of ms) tmax = Math.max(tmax, travelMin(T.place(curPlace(T.get(id))), e, T.walk));
  for (const id of ms) {
    const a = T.get(id);
    const from = curPlace(a);
    T.release(id);
    T.set(id, { plan: [], spot: undefined, entry: L.entry });
    T.emit('start', id, L.entry, 'leave', why);
    if (from === L.entry || tmax === 0) {
      const e0 = T.place(L.entry) as Place;
      T.set(id, {
        where: { kind: 'at', at: L.entry, since: T.t, until: T.t + 1 },
        doing: 'leave',
        spot: T.freeSpot(e0, 1, 0),
      });
      T.pushOcc(L.entry, id);
    } else T.set(id, { where: { kind: 'travel', from, to: L.entry, t0: T.t, t1: T.t + tmax }, doing: 'leave' });
  }
}

/** 一伙人往各自的地方走（一起走：路上的时间按最远的那个） */
function moveUnit(T: Tick, ms: readonly AgentId[], to: readonly PlaceId[]): void {
  let tmax = 0;
  ms.forEach((id, i) => {
    const from = curPlace(T.get(id));
    if (from !== to[i]) tmax = Math.max(tmax, travelMin(T.place(from), T.place(to[i]), T.walk));
  });
  ms.forEach((id, i) => {
    const a = T.get(id);
    const from = curPlace(a);
    if (from === to[i] && a.where.kind === 'at') {
      // 原地接着干下一件
      T.release(id);
      landAt(T, id, ms, to[i]);
      return;
    }
    T.release(id);
    T.set(id, {
      where: { kind: 'travel', from, to: to[i], t0: T.t, t1: T.t + Math.max(1, tmax) },
      doing: 'travel',
      spot: undefined,
    });
    if (occupies(T.get(id))) T.addIn(to[i], 1);
  });
}

/** 事情的说明（报告的时间线、画面的事件流） */
/** 地点的短名（去掉括号里的说明）："会所咖啡吧（点单）" → "会所咖啡吧" */
export const shortName = (p: Place) => p.name.replace(/（.*?）/g, '');

function startNote(T: Tick, id: AgentId, p: Place, d: Doing, minutes = 30): string {
  const n = shortName(p);
  if (p.kind === 'post' && (d === 'tennis' || d === 'warmup'))
    return `${n.replace('表演赛', '')}${d === 'warmup' ? '热身' : T.t < H(18) ? '练球' : '打表演赛'}`;
  if (d === 'change') return `${n}换衣服`;
  if (d === 'checkin') return `${n}签到`.replace('签到签到', '签到');
  if (d === 'order') return `${n}点单`;
  if (d === 'eat' && minutes <= 15) return `${n}吃点东西`;
  if (d === 'watch' && /看孩子/.test(p.name)) return `${n}看孩子玩`;
  if (n.includes(DOING_ZH[d])) return n;
  if (d === 'tennis' || d === 'pickle' || d === 'golf' || d === 'warmup') {
    const others: string[] = [];
    for (const o of T.occOf(p.id)) if (o !== id) others.push(T.name(o));
    for (const oid of T.travellers) {
      const w = T.agents[oid].where;
      if (oid !== id && w.kind === 'travel' && w.to === p.id && occupies(T.agents[oid])) others.push(T.name(oid));
    }
    return others.length ? `${n}${DOING_ZH[d]}（和${others.slice(0, 3).join('、')}）` : `${n}${DOING_ZH[d]}`;
  }
  return `${n}${DOING_ZH[d]}`;
}

/** 到了 pid（路上走到，或者原地）：排队、进去开始干、满了换地方 */
function landAt(T: Tick, id: AgentId, ms: readonly AgentId[], pid: PlaceId): void {
  const a = T.get(id);
  const p = T.place(pid);
  if (!p) return;
  const lead = ms[0] === id;
  if (a.doing === 'leave') {
    if (T.room(p) > 0) {
      T.set(id, {
        where: { kind: 'at', at: pid, since: T.t, until: T.t + 1 },
        doing: 'leave',
        spot: T.freeSpot(p, 1, 0),
      });
      T.pushOcc(pid, id);
    } else exitAgent(T, id);
    return;
  }
  const it = a.plan[0];
  if (!it) {
    goLeave(T, [id], '没事干了');
    return;
  }
  // 订的场上一组还没打完：在场边等一会儿
  const sameGame = (o: AgentId) => {
    const x = T.get(o).plan[0];
    // 同一场的（约好的四个人、私教课的教练和学员）
    return ms.includes(o) || (!!x && x.at === pid && x.after === it.after && (isCourtPlay(x) || x.doing === 'coach'));
  };
  if (COURTY.has(p.kind) && isCourtPlay(it) && it.at === pid && T.occOf(pid).some((o) => !sameGame(o))) {
    if (lead) {
      unshiftAll(T, ms, {
        doing: 'watch',
        minutes: Math.max(1, Math.min(5, (it.after ?? T.t) - T.t)),
        kinds: ['stand', 'seat'],
      });
      decide(T, ms);
    }
    return;
  }
  // 约好 / 凑好的场：已经占下了，直接上
  if (COURTY.has(p.kind) && isCourtPlay(it) && it.at === pid) {
    enterIntent(T, id, p, it, ms.length, ms.indexOf(id));
    return;
  }
  // 匹克球拍架边排队等下一局（凑人）
  if (it.doing === 'queue') {
    T.set(id, { where: { kind: 'queue', at: pid, since: T.t }, doing: 'queue', spot: undefined });
    T.pushQ(pid, id);
    if (lead) T.emit('queue', id, pid, 'queue', `${p.name}拍架边排队，等下一局`);
    return;
  }
  // 员工在场地、长椅边干活（拖场、扫地）：不排队
  if (it.doing === 'work' && p.kind !== 'post') {
    if (T.room(p) > 0) enterIntent(T, id, p, it, ms.length, ms.indexOf(id));
    else decide(T, ms, new Set([pid]));
    return;
  }
  const qcap = p.queue ?? 0;
  const qlen = T.qOf(pid).length;
  // 走到了才发现窗口关着（摊主歇班去了），一时半会儿回不来：不在关着的窗口前干排，换一家
  if (lead && qcap > 0 && !it.must && p.needs && !T.isOpen(p) && !backSoon(T, p.needs, 8)) {
    missOnce(T, id, it, pid, `${shortName(p)}关着（摊主歇班），换一家`, `closed:${pid}`);
    decide(T, ms, new Set([pid]));
    return;
  }
  if (qcap > 0 && (isService(p) || qlen > 0 || T.room(p) <= 0 || !T.isOpen(p))) {
    if (!lead) {
      // 跟着带头的排在后面（一伙人一个人点单 / 签到）
      T.set(id, { where: { kind: 'queue', at: pid, since: T.t }, doing: 'queue', spot: undefined });
      T.pushQ(pid, id);
      return;
    }
    if (isService(p) && qlen === 0 && T.busy(p) < p.cap && T.isOpen(p)) {
      serveEnter(T, id, p, ms.length);
      return;
    }
    if (qlen < qcap) {
      T.set(id, { where: { kind: 'queue', at: pid, since: T.t }, doing: 'queue', spot: undefined });
      T.pushQ(pid, id);
      T.emit('queue', id, pid, 'queue', qlen ? `${shortName(p)}排队（前面 ${qlen} 个人）` : `${shortName(p)}排队`);
      return;
    }
    if (p.kind === 'desk') {
      T.emit('gaveUp', id, pid, 'checkin', `${p.name}前面排了 ${qlen} 个人，不签了，直接进去`);
      for (const m of ms) T.set(m, { day: { ...T.get(m).day, gaveUp: T.get(m).day.gaveUp + 1 } });
      popAll(T, ms);
      decide(T, ms);
      return;
    }
    missOnce(T, id, it, pid, `${p.name}的队排满了，换一家`, `full:${pid}`);
    decide(T, ms, new Set([pid]));
    return;
  }
  // 岗位上还是上一班的人：在旁边（同一片最近的长椅、场边）等着交接；上一班一刻钟以内就完的，看到接班的来了就先走
  if (p.kind === 'post' && T.room(p) <= 0) {
    if (it.doing === 'work' && it.after !== undefined && it.after <= T.t + 2)
      for (const o of T.occOf(pid)) {
        const ow = T.get(o).where;
        if (o !== id && ow.kind === 'at' && T.get(o).doing === 'work' && ow.until - T.t <= 15)
          T.set(o, { where: { ...ow, until: T.t } });
      }
    const wait = Math.max(1, Math.min(5, (it.after ?? T.t) - T.t));
    let near: Place | undefined;
    let nd = Number.POSITIVE_INFINITY;
    for (const k of ['seat', 'stand', 'staff'] as const)
      for (const x of kindsOf(T.idx, k)) {
        if (x.scene !== p.scene || T.room(x) <= 0 || !allows(x, a.role)) continue;
        const d = Math.hypot(x.x - p.x, x.z - p.z);
        if (d < nd) {
          nd = d;
          near = x;
        }
      }
    unshiftAll(
      T,
      [id],
      near
        ? { doing: 'rest', minutes: wait, at: near.id }
        : { doing: 'rest', minutes: wait, kinds: ['staff', 'seat', 'stand'] },
    );
    decide(T, [id]);
    return;
  }
  // 约好钟点的（课）去早了、里面还是上一拨：在旁边等一会儿，不挤进去
  if (
    it.must &&
    it.after !== undefined &&
    T.t < it.after - 1 &&
    T.room(p) <= 0 &&
    p.kind !== 'entry' &&
    !COURTY.has(p.kind)
  ) {
    if (lead) {
      unshiftAll(T, ms, {
        doing: 'watch',
        minutes: Math.max(1, Math.min(5, it.after - T.t - 1)),
        kinds: ['stand', 'seat'],
      });
      decide(T, ms);
    } else standBy(T, id, pid); // 跟着来的（孩子等着上课）：在门口站一会儿，下一分钟再看
    return;
  }
  const leadHere = !lead && T.get(ms[0]).where.kind === 'at' && curPlace(T.get(ms[0])) === pid;
  if (T.room(p) > 0 || it.must || leadHere || p.kind === 'entry') {
    enterIntent(T, id, p, it, ms.length, ms.indexOf(id));
    return;
  }
  if (lead) {
    missOnce(T, id, it, pid, `${p.name}满了，换个地方`, `full:${pid}`);
    decide(T, ms, new Set([pid]));
  } else enterIntent(T, id, p, it, ms.length, ms.indexOf(id));
}

function enterIntent(T: Tick, id: AgentId, p: Place, it: Intent, size: number, k: number): void {
  const a = T.get(id);
  let minutes = it.minutes;
  // 地点的 stay 只管"最多待多久"（等人、等交接的短停不拉长）
  if (!it.must && !it.at && it.after === undefined && p.stay) minutes = Math.min(minutes, p.stay[1]);
  const until = Math.max(T.t + 1, (it.after ?? T.t) + minutes);
  const early = it.after !== undefined && T.t < it.after;
  const doing = early ? preDoing(it.doing) : doingAt(it, p, size);
  enterRaw(T, id, p, until, doing, size, k);
  if (!isSeeking(a.plan)) T.set(id, { patience: patienceOf(T.person(id)) });
  if (doing === 'work' && p.kind !== 'post')
    T.emit('start', id, p.id, 'work', `${shortName(p)}${COURTY.has(p.kind) ? '拖场、扫线' : '收拾、扫地'}`);
  else if (doing === 'work') T.emit('shift', id, p.id, 'work', `上岗（${p.name}）`);
  else if (doing === 'break') T.emit('shift', id, p.id, 'break', `歇班 ${until - T.t} 分钟（${p.name}）`);
  else if (!(doing === 'watch' && isSeeking(a.plan)))
    T.emit('start', id, p.id, doing, startNote(T, id, p, doing, until - T.t));
  else
    T.emit(
      'start',
      id,
      p.id,
      'watch',
      `${shortName(p)}坐着等，找人凑一场${a.plan[1].doing === 'pickle' ? '匹克球' : '球'}`,
    );
}

/** 在柜台、摊位前被服务：总监在前台 1 分钟；不在 → 队头等 4 分钟没人，自己按铃登记 3 分钟 */
function serveEnter(T: Tick, id: AgentId, p: Place, size: number): void {
  let m: number;
  let doing: Doing;
  if (p.kind === 'desk') {
    doing = 'checkin';
    m = p.director && T.input.director === p.id ? 1 + (size >= 3 ? 1 : 0) : 7;
  } else if (isWater(p)) {
    doing = 'drink';
    m = int(T.rng(id, 'order'), 1, 2);
  } else {
    // 点单：窗口前 2–4 分钟（地点的 stay），一伙人多的再多一分钟
    doing = 'order';
    const [a, b] = p.stay ?? [1, 3];
    m = int(T.rng(id, 'order'), a, b) + (size >= 3 ? 1 : 0);
  }
  enterRaw(T, id, p, T.t + m, doing);
  T.set(id, { patience: patienceOf(T.person(id)) });
  T.emit('start', id, p.id, doing, isWater(p) ? `${shortName(p)}接杯水喝` : startNote(T, id, p, doing));
}

// ── 每一伙人 ─────────────────────────────────────────────────────────────────────

function unitTick(T: Tick, leadId: AgentId): void {
  const L0 = T.get(leadId);
  const ms = membersOf(T, L0);
  if (L0.where.kind === 'away') {
    if (L0.plan.length && T.t >= L0.arrive) arriveUnit(T, ms);
    return;
  }
  for (const id of ms) {
    const a = T.get(id);
    // 刚下车站在出入口旁边的（一伙人比出入口大）：不自己落地，跟着带头的一起走
    if (a.where.kind === 'travel' && T.t >= a.where.t1 && a.doing !== 'arrive') {
      const to = a.where.to;
      T.release(id);
      landAt(T, id, ms, to);
    }
  }
  // 到点开始（热身 → 打球、等课 → 上课）
  for (const id of ms) {
    const a = T.get(id);
    const it = a.plan[0];
    if (a.where.kind !== 'at' || !it || it.after === undefined || T.t < it.after) continue;
    if (curPlace(a) !== (it.at ?? curPlace(a))) continue;
    const p = T.place(a.where.at);
    if (!p) continue;
    const d = doingAt(it, p, ms.length);
    if (a.doing !== d && a.doing === preDoing(it.doing) && a.doing !== 'arrive' && a.doing !== 'leave') {
      T.set(id, { doing: d });
      T.emit('start', id, p.id, d, startNote(T, id, p, d));
    }
  }
  const L = T.get(leadId);
  if (L.where.kind !== 'at') return;
  if (L.doing === 'leave') {
    if (T.t >= L.where.until)
      for (const id of ms) if (T.get(id).doing === 'leave' && T.get(id).where.kind === 'at') exitAgent(T, id);
    return;
  }
  if (L.doing === 'arrive') {
    if (T.t >= L.where.until) decide(T, ms);
    return;
  }
  if (T.t >= L.where.until) advance(T, ms, true);
  else if (interrupt(T, L, ms)) advance(T, ms, false);
}

function interrupt(T: Tick, L: Agent, ms: readonly AgentId[]): boolean {
  const w = L.where;
  if (w.kind !== 'at') return false;
  const p = T.place(w.at);
  if (!p) return false;
  if (L.doing === 'checkin' && p.director && T.input.director === p.id && T.t >= w.since + 1) return true;
  if (worker(L)) return false;
  if (!unitMust(T, ms) && T.t >= L.leaveBy) return true;
  if (T.t >= CLOSE - 10) return true;
  if ((p.kind === 'pool' || p.kind === 'play') && p.needs && !T.staffed(p.needs)) {
    // 池子暂停：先上来在池边坐着等，救生员回来接着游（不回家）
    const edge = kindsOf(T.idx, 'seat')
      .filter((x) => x.scene === p.scene)
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    const left = Math.max(5, w.until - T.t);
    for (const id of ms) {
      const a = T.get(id);
      const cur = a.plan[0];
      T.emit('end', id, p.id, a.doing, '救生员不在，池子暂停，先上来在池边等');
      if (!cur) continue;
      const wait: Intent = edge
        ? { doing: 'rest', minutes: 8, at: edge.id }
        : { doing: 'rest', minutes: 8, kinds: ['seat', 'lounger'] };
      const again: Intent = { doing: cur.doing, minutes: left, kinds: cur.kinds ?? [p.kind] };
      T.set(id, { plan: [cur, wait, again, ...a.plan.slice(1)] });
    }
    return true;
  }
  if (T.w.rain && isOutdoor(p) && p.kind !== 'entry') return true;
  // 地方到点关了（泳池、躺椅 20 点、摊位 21 点……）：起身去干下一件，不在关了的躺椅上躺到天黑
  if (p.open && T.t >= p.open[1] && p.kind !== 'entry' && p.kind !== 'post' && p.kind !== 'staff') return true;
  if (SOFT.has(L.doing) && !isSeeking(L.plan) && !unitMust(T, ms)) {
    let h = 0;
    for (const id of ms) h = Math.max(h, T.get(id).needs.hunger);
    if (h >= 92) return true;
  }
  return false;
}

/** 窗口边等餐的空位（spot = cap + k）；没有就 undefined */
function pickupSpot(T: Tick, p: Place): number | undefined {
  const used = new Set<number>();
  for (const o of T.occOf(p.id)) used.add(T.get(o).spot ?? -1);
  for (let k = 0; k < (p.pickup ?? 0); k++) if (!used.has(p.cap + k)) return p.cap + k;
  return undefined;
}

/** 干完一件（或被打断）：算账、拿掉这一项、挑下一件。done = 到点干完的（不是被打断的） */
function advance(T: Tick, ms: readonly AgentId[], done = true): void {
  const L = T.get(ms[0]);
  const it = L.plan[0];
  const w = L.where;
  const p = w.kind === 'at' ? T.place(w.at) : undefined;
  // 窗口前点完单：让出窗口，站到窗口边等取餐（饭 3–6 分钟，喝的 1–3 分钟），还在这个地点里
  if (done && it && w.kind === 'at' && p?.pickup && L.doing === 'order' && (L.spot ?? 0) < p.cap) {
    const k = pickupSpot(T, p);
    if (k === undefined) {
      // 窗口边站满了：在窗口前多站一分钟
      T.set(L.id, { where: { ...w, until: T.t + 1 } });
      return;
    }
    const r = T.rng(L.id, 'pickup');
    const m = servesMeal(p) ? int(r, 3, 6) : int(r, 1, 3);
    T.set(L.id, { where: { kind: 'at', at: p.id, since: T.t, until: T.t + m }, spot: k });
    T.emit('start', L.id, p.id, 'order', `${shortName(p)}窗口边等${servesMeal(p) ? '餐' : '着拿'}`);
    return;
  }
  if (it) {
    for (const id of ms) {
      const a = T.get(id);
      const d = a.doing;
      const n = { ...a.needs };
      const day = { ...a.day };
      if (d === 'eat' && a.plan[0]?.snack) {
        // 零食：垫一垫，不算一顿饭
        n.hunger = Math.max(0, n.hunger - 30);
        n.thirst = Math.min(n.thirst, 25);
      } else if (d === 'eat' || (d === 'break' && a.where.kind === 'at')) {
        n.hunger = Math.min(n.hunger, 5);
        n.thirst = Math.min(n.thirst, 10);
        if (d === 'eat') {
          day.ate = true;
          day.ateAt = T.t;
        }
      }
      if (d === 'drink' || (L.doing === 'drink' && p && isWater(p))) n.thirst = Math.min(n.thirst, 5);
      if ((d === 'tennis' || d === 'pickle' || d === 'golf' || d === 'lesson') && a.where.kind === 'at')
        day.played += T.t - a.where.since;
      if (d === 'checkin' && id === ms[0] && p?.director) {
        const byDirector = T.input.director === p.id;
        if (byDirector) day.served = true;
        T.emit('served', id, p.id, 'checkin', byDirector ? '总监帮着签了到' : '前台没人，等了 4 分钟自己按铃登记');
      } else if (d === 'order' && id === ms[0] && p) T.emit('served', id, p.id, 'order', `在${shortName(p)}拿到了`);
      else if (d !== 'arrive' && d !== 'leave' && a.where.kind === 'at') T.emit('end', id, a.where.at, d);
      T.set(id, { needs: n, day });
    }
    popAll(T, ms);
    // 跟着排队的（带头的点完单 / 签完到）出队
    for (const id of ms) {
      const a = T.get(id);
      if (a.where.kind === 'queue' && id !== ms[0]) standBy(T, id, a.where.at);
    }
  }
  decide(T, ms);
}

/** 需求插队：饿了吃、渴了喝、累了歇；快走了又饿了 → 回家吃 */
function needsInsert(T: Tick, ms: readonly AgentId[]): 'left' | 'added' | undefined {
  const L = T.get(ms[0]);
  const it = L.plan[0];
  if (!it || it.doing === 'checkin') return;
  for (const id of ms) {
    const o = T.get(id).plan[0];
    if (o?.must && o.after !== undefined && o.after - T.t < 45) return;
  }
  let hunger = 0;
  let thirst = 0;
  let tired = 0;
  let line = 100;
  for (const id of ms) {
    const n = T.get(id).needs;
    hunger = Math.max(hunger, n.hunger);
    thirst = Math.max(thirst, n.thirst);
    tired = Math.max(tired, n.tired);
    line = Math.min(line, hungerLine(T.person(id)));
  }
  const t = T.t;
  const r = T.rng(ms[0], 'need');
  // 等场、凑人的时候不走开（除非饿极了）
  if (isCourtPlay(it) && !it.at && hunger < 90) return;
  // 饭点大家一起饿：11:40–12:00 午饭的线一点点降下来（降 25），晚饭 18:00–18:30 降 20
  const pull =
    t >= H(11, 40) && t <= H(13, 30)
      ? Math.min(25, ((t - H(11, 40)) / 20) * 25)
      : t >= H(18) && t <= H(20)
        ? Math.min(20, ((t - H(18)) / 30) * 20)
        : 0;
  if (hunger >= line - pull && !eatish(it) && !L.plan.slice(1, 3).some(eatish) && !recentlyAte(T, ms)) {
    const meal = (t >= H(11) && t <= H(14)) || (t >= H(17) && t <= H(20, 30));
    const foodie = T.person(ms[0])?.traits.includes('foodie');
    // 快走了：四分之一回家吃，其余的吃了再走
    const home = hashOf(T.cfg.seed, T.s.dayNo, ms[0], 'eathome') % 100 < 25;
    if (meal && L.leaveBy - t < 50 && !foodie && !L.day.ate && home) {
      goLeave(T, ms, '饿了，回家吃饭');
      return 'left';
    }
    unshiftAll(T, ms, { doing: 'eat', minutes: int(r, 20, 35), kinds: ['stall', 'cafe', 'bar'] });
    return 'added';
  }
  if (thirst >= 65 && !drinkish(it)) {
    unshiftAll(T, ms, { doing: 'drink', minutes: int(r, 4, 14), kinds: ['stall', 'cafe', 'bar'] });
    return 'added';
  }
  if (tired >= 78 && it?.doing !== 'rest' && it?.doing !== 'sunbathe') {
    unshiftAll(T, ms, { doing: 'rest', minutes: int(r, 15, 25), kinds: ['seat', 'stand', 'cafe', 'lounger'] });
    return 'added';
  }
  return;
}

/** 太热（午后、夏天）、下雨：室外打球的改主意，一部分回家 */
function heatSkip(T: Tick, ms: readonly AgentId[], it: Intent): 'left' | 'changed' | undefined {
  if (it.must || it.at || (it.doing !== 'tennis' && it.doing !== 'pickle' && it.doing !== 'golf')) return;
  const pen = outdoorPenalty(T.w, T.t);
  if (pen <= 0.05) return;
  const r = T.rng(ms[0], 'heat');
  if (r() > pen * 0.85) return;
  const L = T.get(ms[0]);
  const why = T.w.rain ? '下雨了' : T.w.wind ? '起风沙了' : heatAt(T.w, T.t) > 0.3 ? '太热了' : '午后太晒';
  // 刚到的不掉头回家（来之前就知道天气）：改去干别的
  if (T.t - L.arrive >= 40 && (L.leaveBy - T.t < 100 || r() < 0.3)) {
    goLeave(T, ms, `${why}，不打了，回家歇着`);
    return 'left';
  }
  const pool = kindsOf(T.idx, 'pool').some((p) => T.isOpen(p));
  const sporty = T.person(ms[0])?.traits.includes('sporty');
  const alt: Intent = sporty
    ? { doing: 'gym', minutes: int(r, 40, 60), kinds: ['gym'] }
    : pool && (T.cal.season === 'summer' || r() < 0.4)
      ? { doing: 'swim', minutes: int(r, 25, 45), kinds: ['pool'] }
      : { doing: 'rest', minutes: int(r, 30, 50), kinds: ['cafe', 'bar', 'seat'] };
  T.emit(
    'end',
    ms[0],
    curPlace(L),
    it.doing,
    `${why}，不打${it.doing === 'golf' ? '高尔夫' : '球'}了，改去${DOING_ZH[alt.doing]}`,
  );
  setFirstAll(T, ms, () => alt);
  return 'changed';
}

/** 岗位上的人 within 分钟以内回来（歇完班、来接班） */
function backSoon(T: Tick, post: PlaceId, within: number): boolean {
  for (const id of T.staffHere) {
    const plan = T.get(id).plan;
    for (let i = 0; i < 3 && i < plan.length; i++) {
      const x = plan[i];
      if (x.at === post && x.doing === 'work' && x.after !== undefined && x.after <= T.t + within) return true;
    }
  }
  return false;
}

/** 要员工在岗的地方：岗上的人歇完回来是几点（没人要回来 = 无穷） */
function reopenAt(T: Tick, it: Intent): Minute {
  const posts = new Set<PlaceId>();
  for (const k of it.kinds ?? []) for (const p of kindsOf(T.idx, k)) if (p.needs) posts.add(p.needs);
  let back = Number.POSITIVE_INFINITY;
  if (!posts.size) return back;
  for (const id of T.staffHere) {
    const a = T.agents[id];
    if (a.doing !== 'break' && a.where.kind !== 'travel') continue;
    for (const x of a.plan)
      if (
        x.at &&
        posts.has(x.at) &&
        x.after !== undefined &&
        x.after > T.t &&
        (x.doing === 'work' || x.doing === 'coach')
      )
        back = Math.min(back, x.after + 2);
  }
  return back;
}

/** 挑下一件事，往那走 */
function decide(T: Tick, ms: readonly AgentId[], avoid?: ReadonlySet<PlaceId>): void {
  let skip = avoid;
  let inserted = false;
  for (let guard = 0; guard < 14; guard++) {
    const L = T.get(ms[0]);
    const staff = worker(L);
    if (!staff && (T.t >= L.leaveBy || T.t >= CLOSE - 10)) {
      goLeave(T, ms, T.t >= CLOSE - 10 ? '快关门了，回家' : '到点了，回家');
      return;
    }
    if (!L.plan.length) {
      const off = L.doing === 'work' || L.doing === 'coach';
      if (off) T.emit('shift', ms[0], curPlace(L), L.doing, '下班');
      // 离走还早（来了不到 40 分钟，或者离说好的走还有半个多钟头）：先去会所、阴凉处坐坐，不一下车就回家
      const fill = L.day.fill ?? 0;
      if (!off && !staff && fill < 2 && T.t < CLOSE - 50 && (T.t - L.arrive < 40 || L.leaveBy - T.t > 35)) {
        const r = T.rng(ms[0], 'fill');
        const m = Math.max(15, Math.min(int(r, 25, 45), L.leaveBy - T.t - 10));
        const kids = ms.some((id) => T.get(id).role === 'kid');
        for (const id of ms) T.set(id, { day: { ...T.get(id).day, fill: fill + 1 } });
        unshiftAll(T, ms, {
          doing: kids ? 'rest' : fill === 0 ? 'drink' : 'rest',
          minutes: m,
          kinds: kids ? ['seat', 'table', 'stand'] : ['cafe', 'bar', 'seat', 'table'],
        });
        continue;
      }
      goLeave(T, ms, off ? '下班回家' : '该玩的都玩了，回家');
      return;
    }
    if (!staff && !inserted) {
      inserted = true;
      const r = needsInsert(T, ms);
      if (r === 'left') return;
    }
    let it = T.get(ms[0]).plan[0];
    // 班上的一段（顶班、收拾）钟点已经过了：不补（人来晚了，别人已经接上了）
    if (staff && it.must && it.at && it.after !== undefined && it.after + it.minutes <= T.t && L.plan.length > 1) {
      popAll(T, ms);
      continue;
    }
    // 一顿正餐吃过两个钟头以内：这一顿改成吃点零食（不吃两顿午饭）
    if (!staff && it.doing === 'eat' && !it.snack && recentlyAte(T, ms)) {
      setFirstAll(T, ms, (i) => (i.doing === 'eat' ? { ...i, snack: true, minutes: Math.min(i.minutes, 15) } : i));
      it = T.get(ms[0]).plan[0];
    }
    if (!staff) {
      const h = heatSkip(T, ms, it);
      if (h === 'left') return;
      if (h === 'changed') continue;
    }
    // 换衣服是为了下一件：下一件来不及就都不做
    const next = T.get(ms[0]).plan[1];
    const need = it.doing === 'change' ? it.minutes + Math.min(next?.minutes ?? 99, 15) : Math.min(it.minutes, 15);
    if (!unitMust(T, ms) && T.t + need > L.leaveBy) {
      popAll(T, ms);
      continue;
    }
    if (isCourtPlay(it) && !it.at) {
      courtPlay(T, ms, it);
      continue;
    }
    // 离约好的钟点（课、订的场、表演赛、下午的训练）还早：先找个地方坐坐、喝点东西
    if (!staff && it.after !== undefined && it.after - T.t > 40) {
      const gap = it.after - T.t - 15;
      const evening = T.t >= H(17);
      unshiftAll(
        T,
        ms,
        evening
          ? { doing: 'drink', minutes: gap, kinds: ['stall', 'cafe', 'bar'] }
          : { doing: 'rest', minutes: gap, kinds: ['cafe', 'seat', 'lounger', 'bar'] },
      );
      continue;
    }
    const pick = choose(T, ms, skip);
    if (pick === 'none') {
      popAll(T, ms);
      continue;
    }
    if (pick === 'closed') {
      // 还没开 / 已经关了（泳池 7 点开、摊位 10 点开、摊主歇班……）
      // 快开了（泳池 7 点）：在旁边坐着等一会儿
      let opens = Number.POSITIVE_INFINITY;
      for (const k of it.kinds ?? [])
        for (const p of kindsOf(T.idx, k)) {
          const a = p.open?.[0] ?? OPEN;
          if (a > T.t) opens = Math.min(opens, a);
        }
      // 摊主、救生员在歇班：一会儿就回来
      const back = reopenAt(T, it);
      if (back - T.t <= 35 && back < opens) opens = back;
      if (it.must || opens - T.t <= 35) {
        const wait = it.must ? 5 : opens - T.t;
        unshiftAll(T, ms, { doing: 'rest', minutes: Math.max(1, wait), kinds: ['seat', 'stand', 'table', 'staff'] });
        continue;
      }
      if (it.doing !== 'change' && it.doing !== 'drink')
        missOnce(
          T,
          ms[0],
          it,
          curPlace(L),
          `想${DOING_ZH[it.doing]}，${(it.kinds ?? []).map((k) => KIND_ZH[k]).join('、')}没开，算了`,
        );
      popAll(T, ms);
      continue;
    }
    if (pick === 'full') {
      // 高尔夫：前面那组还没走 → 在这一洞多等几分钟；还没开打就不打了
      if (it.doing === 'golf') {
        const here = T.place(curPlace(L));
        if (here?.kind === 'golf' && L.where.kind === 'at') {
          setFirstAll(T, ms, (i) => ({ ...i, at: here.id, minutes: 5 }));
          continue;
        }
        missOnce(T, ms[0], it, curPlace(L), '球道上都有人，今天不打高尔夫了');
        for (const id of ms) T.set(id, { plan: T.get(id).plan.filter((x) => x.doing !== 'golf') });
        continue;
      }
      if (it.must) {
        unshiftAll(T, ms, { doing: 'rest', minutes: 5, kinds: ['seat', 'stand', 'table', 'staff'] });
        continue;
      }
      // 更衣室满了就不换了（穿着来的），不记一笔；同一件事只记一次
      if (it.doing !== 'change' && it.doing !== 'drink')
        missOnce(T, ms[0], it, it.at ?? curPlace(L), `想${DOING_ZH[it.doing]}，没有空地方，算了`);
      // 累了想坐没地方：站着缓一缓（不一分钟想一次）
      if (it.doing === 'rest')
        for (const id of ms) T.set(id, { needs: { ...T.get(id).needs, tired: Math.min(T.get(id).needs.tired, 55) } });
      popAll(T, ms);
      skip = undefined;
      continue;
    }
    const p0 = T.place(pick[0]) as Place;
    if (isCounter(p0) && (it.doing === 'eat' || it.doing === 'drink')) {
      // 摊位：先点单，拿了去桌边 / 长椅吃喝
      const then: Intent = {
        doing: it.doing,
        minutes: it.minutes,
        kinds: it.doing === 'eat' ? ['table', 'seat', 'stand'] : ['seat', 'table', 'stand'],
      };
      if (it.snack) then.snack = true;
      for (const id of ms) {
        const plan = T.get(id).plan;
        T.set(id, { plan: [{ doing: 'order', minutes: 2, at: p0.id }, then, ...plan.slice(1)] });
      }
      continue;
    }
    moveUnit(T, ms, pick);
    return;
  }
  goLeave(T, ms, '没什么想干的了，回家');
}

/** 这伙人里有人两个钟头以内吃过一顿正餐 */
function recentlyAte(T: Tick, ms: readonly AgentId[]): boolean {
  for (const id of ms) {
    const t = T.get(id).day.ateAt;
    if (t !== undefined && T.t - t < 120) return true;
  }
  return false;
}

/** "想干没干成"记一笔：同一个人同一件事（doing + 地点种类）一天只记一次（不在事件流里刷屏） */
function missOnce(T: Tick, id: AgentId, it: Intent, at: PlaceId, note: string, k?: string): void {
  const key = k ?? `${it.doing}:${it.at ?? (it.kinds ?? []).join(',')}`;
  const a = T.get(id);
  if (a.missed?.includes(key)) return;
  T.set(id, { missed: [...(a.missed ?? []), key] });
  T.emit('full', id, at, it.doing, note);
}

/** 候选地点：种类对、开着、给这种人用、吃喝的摊位卖对东西 */
function candidates(T: Tick, it: Intent, ids: readonly AgentId[], avoid?: ReadonlySet<PlaceId>): Place[] {
  const out: Place[] = [];
  const roles = ids.map((id) => T.get(id).role);
  for (const k of it.kinds ?? []) {
    for (const p of kindsOf(T.idx, k)) {
      // 员工干活不看营业时间（开门前拖场），但不占有人在用的独占地方
      const working = it.doing === 'work';
      if (avoid?.has(p.id) || (!working && !T.isOpen(p))) continue;
      if (working && (isExclusive(p) ? !T.vacant(p, ids) || (T.isOpen(p) && T.t >= OPEN) : false)) continue;
      // 孩子跟着家长排队签到（前台不给孩子单独签）
      if (!working && !roles.every((r) => allows(p, r) || (p.kind === 'desk' && r === 'kid'))) continue;
      // 孩子不进健身房、酒吧（酒吧的 for 里本来就没有孩子）
      if (!working && p.kind === 'gym' && roles.includes('kid')) continue;
      if (p.kind === 'stall' || p.kind === 'cafe') {
        // 正餐只去卖正餐的（塔可、披萨、汉堡、会所），零食只去卖零食的（吉事果、冰棍、奶茶、果昔）
        if (it.doing === 'eat' && !(it.snack ? servesSnack(p) : servesMeal(p))) continue;
        if ((it.doing === 'drink' || it.doing === 'rest') && !servesDrink(p)) continue;
      }
      if (p.kind === 'gym' && p.doing !== 'gym' && it.doing === 'gym') continue;
      // 小孩玩水、玩沙包不去围网外对着墙打的那块（那是大孩子打球的）
      if (it.doing === 'kidplay' && p.kind === 'play' && p.doing === 'tennis') continue;
      out.push(p);
    }
  }
  return out;
}

function score(T: Tick, lead: Agent, it: Intent, p: Place, from: Place | undefined): number {
  let s = from ? Math.hypot(p.x - from.x, p.z - from.z) / 6 : 0;
  const heat = heatAt(T.w, T.t);
  const pen = outdoorPenalty(T.w, T.t);
  if (isOutdoor(p) && !PLAY.has(it.doing)) s += pen * 8;
  if (p.shade) s -= heat * 3;
  s += habit(T, lead.id, p.id) * 5;
  const person = T.person(lead.id);
  if (homeScene(T.cfg, person, T.s.dayNo) === p.scene) s -= 2.5;
  if (likes(person, p)) s -= 4;
  if (p.queue) s += T.qOf(p.id).length * 1.2;
  // 渴了顺路喝口水；坐下来喝点什么才去窗口
  if (isWater(p)) s += it.minutes <= 6 ? -2 : 12;
  // 中心球场看台：有表演赛 / 球员在练的时候才去
  if (p.kind === 'stand' && p.scene === 'clubstadium' && !proOnCourt(T)) s += 12;
  // 看球：去有人在打的那几块场边（对着空场"看球"说不通）
  else if (it.doing === 'watch' && (p.kind === 'stand' || p.kind === 'seat') && !it.at) s += T.live(p.scene) ? -4 : 6;
  if (worker(lead)) {
    // 转着干活：换个地方，别在同一处待一上午
    s += T.rng(lead.id, `roam${p.id}`)() * 8;
    if (it.doing === 'work' && from && p.id === from.id) s += 30;
  }
  if (p.kind === 'bar' && T.t < H(16)) s += it.doing === 'eat' ? 3 : 6;
  // 端着饭找座：先坐看得见的伞下桌、野餐桌，凉棚底下的长桌后坐（画面上凉棚的影子压着看不清）；不端着饭坐到池边泡脚
  if (it.doing === 'eat' && p.kind === 'table' && /凉棚/.test(p.name)) s += 3;
  if (it.doing === 'eat' && p.kind === 'seat' && (p.scene === 'clubpool' || !from || p.scene !== from.scene)) s += 15;
  // 看台、场边长椅不是吃饭的地方（桌子、长椅都满了才去）
  if (it.doing === 'eat' && p.kind === 'stand') s += 25;
  if (p.kind === 'cafe' && T.t >= H(18)) s += 3;
  return s;
}

/** 给一伙人挑地方：一样的事去同一处（坐不下就分到旁边几处）；不一样的（孩子上课、家长坐场边）挑离带头的近的 */
function choose(T: Tick, ms: readonly AgentId[], avoid?: ReadonlySet<PlaceId>): PlaceId[] | 'none' | 'full' | 'closed' {
  const L = T.get(ms[0]);
  const it = L.plan[0];
  const out: PlaceId[] = new Array(ms.length);
  const same = (o: Intent | undefined) =>
    !!o && (o === it || (o.doing === it.doing && o.at === it.at && (o.kinds ?? []).join() === (it.kinds ?? []).join()));
  const group: number[] = [];
  ms.forEach((id, i) => {
    if (same(T.get(id).plan[0])) group.push(i);
  });
  const gids = group.map((i) => ms[i]);
  const taken = new Map<PlaceId, number>();
  // 别的人有指定的地方（孩子上课）：带头的挑离那儿近的（家长坐场边）
  const other = ms.map((id) => T.get(id).plan[0]?.at).find((x, i) => x && !group.includes(i));
  const from = T.place(other ?? curPlace(L));
  if (it.at) for (const i of group) out[i] = it.at;
  else {
    const cs = candidates(T, it, gids, avoid);
    if (!cs.length) {
      const all = (it.kinds ?? []).flatMap((k) => kindsOf(T.idx, k));
      if (!all.length) return 'none';
      return all.some((p) => T.isOpen(p)) ? 'full' : 'closed';
    }
    const scored = cs.map((p) => [p, score(T, L, it, p, from)] as const).sort((a, b) => a[1] - b[1]);
    const n = group.length;
    let done = false;
    for (const [p] of scored) {
      if (
        isExclusive(p)
          ? T.vacant(p, gids) && p.cap >= n
          : p.queue && !isService(p)
            ? T.room(p, gids) >= n || T.qOf(p.id).length < p.queue
            : isService(p)
              ? T.qOf(p.id).length < (p.queue ?? 0) || T.room(p, gids) > 0
              : T.room(p, gids) >= n
      ) {
        for (const i of group) out[i] = p.id;
        taken.set(p.id, n);
        done = true;
        break;
      }
    }
    if (!done) {
      // 一处坐不下：分到最近的几处
      let k = 0;
      for (const [p] of scored) {
        if (isService(p) || (isExclusive(p) && !T.vacant(p, gids))) continue;
        let free = T.room(p, gids);
        while (free > 0 && k < n) {
          out[group[k++]] = p.id;
          taken.set(p.id, (taken.get(p.id) ?? 0) + 1);
          free--;
        }
        if (k >= n) break;
      }
      if (k < n) return 'full';
    }
  }
  // 干别的事的人（孩子上课时家长坐场边）：挑离带头的那处近的
  const anchor = T.place(out[group[0] ?? 0]);
  for (let i = 0; i < ms.length; i++) {
    if (out[i] !== undefined) continue;
    const own = T.get(ms[i]).plan[0];
    if (!own) {
      out[i] = out[group[0] ?? 0];
      continue;
    }
    if (own.at) {
      out[i] = own.at;
      continue;
    }
    const cs = candidates(T, own, [ms[i]], avoid);
    let best: Place | undefined;
    let bs = Number.POSITIVE_INFINITY;
    for (const p of cs) {
      if (T.room(p, [ms[i]]) - (taken.get(p.id) ?? 0) <= 0) continue;
      const s = travelMin(anchor, p, T.walk) + habit(T, ms[i], p.id);
      if (s < bs) {
        bs = s;
        best = p;
      }
    }
    out[i] = best ? best.id : (anchor?.id ?? curPlace(L));
    taken.set(out[i], (taken.get(out[i]) ?? 0) + 1);
  }
  return out;
}

// ── 打球：凑人、等场 ─────────────────────────────────────────────────────────────

function freeCourt(
  T: Tick,
  kind: PlaceKind,
  from: Place | undefined,
  clay: boolean,
  ids: readonly AgentId[],
  who: string,
  minutes = 75,
): { court: Place; minutes: number } | undefined {
  let best: Place | undefined;
  let bm = minutes;
  let bs = Number.POSITIVE_INFINITY;
  const roles = ids.map((id) => T.get(id).role);
  const books = T.bookings();
  for (const p of kindsOf(T.idx, kind)) {
    if (!T.isOpen(p) || !roles.every((r) => allows(p, r)) || !T.vacant(p, ids) || p.cap < ids.length) continue;
    // 别人订了的钟点不占：下一个订场之前打得完一场短的（≥ 40 分钟）也行
    const start = T.t + travelMin(from, p, T.walk);
    let next = Number.POSITIVE_INFINITY;
    for (const [a, b, id] of books.get(p.id) ?? []) {
      if (ids.includes(id) || b <= T.t) continue;
      if (a <= start) next = -1;
      else next = Math.min(next, a);
    }
    const fit = Math.min(minutes, next - start - 5);
    if (fit < Math.min(40, minutes)) continue;
    let s = travelMin(from, p, T.walk) + habit(T, who, p.id) * 3;
    if (clay) s += p.scene === 'clubclay' ? -6 : 6;
    if (s < bs) {
      bs = s;
      best = p;
      bm = fit;
    }
  }
  return best ? { court: best, minutes: bm } : undefined;
}

function waitSeat(
  T: Tick,
  kind: PlaceKind,
  from: Place | undefined,
  ids: readonly AgentId[],
  clay: boolean,
): Place | undefined {
  // 离（最想去的）场地最近的看台 / 长椅
  let anchor: Place | undefined;
  let as = Number.POSITIVE_INFINITY;
  const roles = ids.map((id) => T.get(id).role);
  for (const p of kindsOf(T.idx, kind)) {
    if (!roles.every((r) => allows(p, r))) continue;
    const s = travelMin(from, p, T.walk) + (clay ? (p.scene === 'clubclay' ? -6 : 6) : 0);
    if (s < as) {
      as = s;
      anchor = p;
    }
  }
  if (!anchor) return undefined;
  let best: Place | undefined;
  let bs = Number.POSITIVE_INFINITY;
  for (const k of ['stand', 'seat'] as const)
    for (const p of kindsOf(T.idx, k)) {
      if (!T.isOpen(p) || !roles.every((r) => allows(p, r)) || T.room(p, ids) < ids.length) continue;
      const d = Math.hypot(p.x - anchor.x, p.z - anchor.z) + (p.scene === anchor.scene ? 0 : 25);
      if (d < bs) {
        bs = d;
        best = p;
      }
    }
  return best;
}

/** 这伙人里上场的（日程第一项是打球的；老伤的跟着坐场边，不算） */
const playersOf = (T: Tick, ms: readonly AgentId[], k = 0) => ms.filter((id) => isCourtPlay(T.get(id).plan[k]));

/** 离一块场最近的看台 / 长椅（坐场边看的人去那儿） */
function benchNear(T: Tick, c: Place, ids: readonly AgentId[]): Place | undefined {
  let best: Place | undefined;
  let bs = Number.POSITIVE_INFINITY;
  const roles = ids.map((id) => T.get(id).role);
  for (const k of ['stand', 'seat'] as const)
    for (const p of kindsOf(T.idx, k)) {
      if (!T.isOpen(p) || !roles.every((r) => allows(p, r)) || T.room(p, ids) < ids.length) continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z) + (p.scene === c.scene ? 0 : 25);
      if (d < bs) {
        bs = d;
        best = p;
      }
    }
  return best;
}

/** 坐场边看的人（老伤的）跟着去：他们的这一项（看球）定在场边的长椅 */
function seatWatchers(T: Tick, ms: readonly AgentId[], players: readonly AgentId[], c: Place, k = 0): void {
  const watchers = ms.filter((id) => !players.includes(id));
  if (!watchers.length) return;
  const b = benchNear(T, c, watchers);
  for (const id of watchers) {
    const plan = T.get(id).plan;
    if (plan[k]?.doing !== 'watch') continue;
    const np = plan.slice();
    np[k] = b ? { ...plan[k], at: b.id } : plan[k];
    T.set(id, { plan: np });
  }
}

/** 一块场这会儿到下一个订场之前能打多久（打不了 30 分钟 = 不行） */
function fitOn(T: Tick, p: Place, ids: readonly AgentId[], start: Minute, minutes: number): number {
  let next = Number.POSITIVE_INFINITY;
  for (const [a, b, id] of T.bookings().get(p.id) ?? []) {
    if (ids.includes(id) || b <= T.t) continue;
    if (a <= start) return 0;
    next = Math.min(next, a);
  }
  return Math.min(minutes, next - start - 5);
}

/** 想打球：人够了有空场就上；不够或没场 → 坐到场边等（看球），等不下去就去打发球机、改打匹克球、坐着喝点东西 */
function courtPlay(T: Tick, ms: readonly AgentId[], it: Intent): void {
  const L = T.get(ms[0]);
  const kind: PlaceKind = it.doing === 'pickle' ? 'pickle' : 'court';
  const pl = playersOf(T, ms);
  const size = pl.length;
  const from = T.place(curPlace(L));
  const clay = kind === 'court' && prefersClay(T, L);
  const enough = size === 4 || (kind === 'court' && size === 2) || (kind === 'pickle' && size >= 2 && size !== 3);
  // 匹克球轮换：拍架边有人排着，打完的这伙也去排（不霸着场）
  const waiting = kind === 'pickle' && kindsOf(T.idx, 'pickle').some((p) => T.qOf(p.id).length > 0);
  if (enough && !waiting) {
    const fc = freeCourt(T, kind, from, clay, pl, ms[0], it.minutes);
    if (fc) {
      const c = fc.court;
      let tmax = 0;
      for (const id of pl) tmax = Math.max(tmax, travelMin(T.place(curPlace(T.get(id))), c, T.walk));
      setFirstAll(T, pl, (i) => ({ ...i, at: c.id, after: T.t + tmax, minutes: fc.minutes }));
      seatWatchers(T, ms, pl, c);
      return;
    }
  }
  if (L.patience <= 0) {
    const waited = patienceOf(T.person(ms[0]));
    const r = T.rng(ms[0], 'alt');
    // 没凑上 / 没等到场：一个人的去发球机那块场自己练（不占别人订的钟点）
    if (kind === 'court' && size === 1 && ms.length === 1) {
      const machine = kindsOf(T.idx, 'court').find(
        (p) =>
          /发球机|machine/i.test(p.name) &&
          T.isOpen(p) &&
          T.vacant(p, ms) &&
          fitOn(T, p, ms, T.t + travelMin(from, p, T.walk), 45) >= 25,
      );
      if (machine) {
        const m = fitOn(T, machine, ms, T.t + travelMin(from, machine, T.walk), int(r, 30, 45));
        T.emit('end', ms[0], curPlace(L), 'watch', `等了 ${waited} 分钟没凑上人，去${shortName(machine)}自己练`);
        setFirstAll(T, ms, (i) => ({
          ...i,
          at: machine.id,
          minutes: m,
          after: T.t + travelMin(from, machine, T.walk),
        }));
        T.set(ms[0], { patience: patienceOf(T.person(ms[0])) });
        return;
      }
    }
    // 网球凑不上、等不到场：去拍架边排一局匹克球（会打的多半这么干，四个人正好一局双打）
    if (kind === 'court' && ms.length === size && size !== 3 && kindsOf(T.idx, 'pickle').length && r() < 0.8) {
      T.emit(
        'end',
        ms[0],
        curPlace(L),
        'watch',
        `等了 ${waited} 分钟没${enough ? '等到空场' : '凑上网球'}，去打匹克球`,
      );
      const games: Intent[] = [
        { doing: 'pickle', minutes: int(r, 12, 18), kinds: ['pickle'] },
        { doing: 'rest', minutes: int(r, 3, 7), kinds: ['stand', 'seat'] },
        { doing: 'pickle', minutes: int(r, 12, 18), kinds: ['pickle'] },
      ];
      for (const id of ms)
        T.set(id, {
          plan: [
            ...games,
            ...T.get(id)
              .plan.slice(1)
              .filter((x) => x.doing !== 'tennis'),
          ],
          patience: patienceOf(T.person(id)),
        });
      return;
    }
    // 头一回等不到：先去喝点东西、坐一会儿，过半个钟头再回来看看（一天只这么一回）
    const retry = `retry:${it.doing}`;
    if (!L.missed?.includes(retry) && L.leaveBy - T.t > 75) {
      const m = int(r, 20, 35);
      T.emit(
        'end',
        ms[0],
        curPlace(L),
        'watch',
        `等了 ${waited} 分钟${enough ? '没等到空场' : '没凑够人'}，先去喝点东西，过半个钟头再来看看`,
      );
      for (const id of ms)
        T.set(id, {
          missed: [...(T.get(id).missed ?? []), retry],
          patience: patienceOf(T.person(id)),
        });
      unshiftAll(T, ms, { doing: 'drink', minutes: m, kinds: ['stall', 'cafe', 'bar', 'seat'] });
      return;
    }
    for (const id of ms)
      T.emit(
        'gaveUp',
        id,
        curPlace(L),
        it.doing,
        `等了 ${waited} 分钟${enough ? '没等到空场' : '没凑够人'}，不打${kind === 'pickle' ? '匹克球' : '球'}了，坐着喝点东西`,
      );
    // 今天不打这个了：后面同样的打球也拿掉，换成坐着喝点东西；耐心回来（不打了，干别的不会马上又烦）
    for (const id of ms) {
      const a = T.get(id);
      T.set(id, {
        day: { ...a.day, gaveUp: a.day.gaveUp + 1 },
        plan: a.plan.filter((x, i) => i === 0 || x.doing !== it.doing || !!x.at),
        patience: patienceOf(T.person(id)),
      });
    }
    popAll(T, ms);
    unshiftAll(T, ms, { doing: 'drink', minutes: int(r, 15, 30), kinds: ['stall', 'cafe', 'bar', 'seat'] });
    return;
  }
  if (kind === 'pickle' && ms.length === size) {
    // 拍架边排队：挑队短的那块场
    let best: Place | undefined;
    for (const p of kindsOf(T.idx, 'pickle')) {
      if (!T.isOpen(p) || T.qOf(p.id).length + ms.length > (p.queue ?? 0)) continue;
      if (!best || T.qOf(p.id).length < T.qOf(best.id).length) best = p;
    }
    if (best) {
      // 匹克球是轮换的：知道要等一两局，多等一刻钟
      T.set(ms[0], { patience: L.patience + 15 });
      unshiftAll(T, ms, { doing: 'queue', minutes: L.patience + 15, at: best.id });
      return;
    }
  }
  const seat = waitSeat(T, kind, from, ms, clay);
  if (!seat) {
    missOnce(T, ms[0], it, curPlace(L), '场边连坐的地方都没有，不打了');
    popAll(T, ms);
    return;
  }
  unshiftAll(T, ms, { doing: 'watch', minutes: clamp(L.patience, 3, 10), at: seat.id });
}

interface Seeker {
  ms: readonly AgentId[];
  /** 上场的（老伤的跟着坐场边，不算） */
  pl: readonly AgentId[];
  kind: PlaceKind;
  ntrp: number;
  waited: number;
  tol: number;
  clay: boolean;
}

/** 场边等的人凑一场：水平差不多的凑够四个（网球两个也行，三个单打的拆出两个先打），有空场就一起上 */
function matchPass(T: Tick, leads: readonly AgentId[]): void {
  const seekers: Seeker[] = [];
  for (const id of leads) {
    const a = T.get(id);
    if ((a.where.kind !== 'at' && a.where.kind !== 'queue') || !isSeeking(a.plan) || a.where.at !== a.plan[0].at)
      continue;
    const ms = membersOf(T, a);
    const pl = playersOf(T, ms, 1);
    if (!pl.length) continue;
    let ntrp = 0;
    let comp = false;
    for (const m of pl) {
      const p = T.person(m);
      ntrp += p?.attrs.ntrp ?? 3;
      if (p?.traits.includes('competitive')) comp = true;
    }
    const waited = patienceOf(T.person(id)) - a.patience;
    const pickle = a.plan[1].doing === 'pickle';
    seekers.push({
      ms,
      pl,
      kind: pickle ? 'pickle' : 'court',
      ntrp: ntrp / pl.length,
      waited,
      // 等得越久越不挑：每等 5 分钟能差的水平多 0.25
      tol: (comp ? 0.5 : 1) + Math.floor(waited / 5) * 0.25 + (pickle ? 0.5 : 0),
      clay: prefersClay(T, a),
    });
  }
  if (!seekers.length) return;
  seekers.sort((a, b) => b.waited - a.waited);
  const used = new Set<Seeker>();
  for (const s of seekers) {
    if (used.has(s)) continue;
    let group = [s];
    let total = s.pl.length;
    for (const o of seekers) {
      if (o === s || used.has(o) || o.kind !== s.kind || total + o.pl.length > 4) continue;
      if (Math.abs(o.ntrp - s.ntrp) > Math.min(s.tol, o.tol)) continue;
      group.push(o);
      total += o.pl.length;
      if (total === 4) break;
    }
    // 三个一个人来的：先拆出两个打单打，第三个接着等
    if (total === 3 && s.kind === 'court' && group.length === 3 && group.every((g) => g.pl.length === 1)) {
      group = group.slice(0, 2);
      total = 2;
    }
    // 四个人最好；两个人等了几分钟也行（单打）；三个人（一伙三个）等久了也打
    const ok =
      total === 4 ||
      (total === 2 && group.every((g) => g.waited >= 3)) ||
      (total === 3 && group.every((g) => g.waited >= 10));
    if (!ok) continue;
    const pids = group.flatMap((g) => g.pl);
    const from = T.place(curPlace(T.get(s.ms[0])));
    const fc = freeCourt(T, s.kind, from, s.clay, pids, s.ms[0], T.get(s.pl[0]).plan[1].minutes);
    if (!fc) continue;
    const c = fc.court;
    let tmax = 0;
    for (const id of pids) tmax = Math.max(tmax, travelMin(T.place(curPlace(T.get(id))), c, T.walk));
    const minutes = fc.minutes;
    for (const g of group) {
      used.add(g);
      const names = pids.filter((x) => !g.ms.includes(x)).map((x) => T.name(x));
      const a = T.get(g.ms[0]);
      for (const m of g.ms)
        T.emit('end', m, curPlace(a), 'watch', names.length ? `凑齐了：和${names.join('、')}` : '等到空场了');
      for (const id of g.ms) {
        const plan = T.get(id).plan;
        T.set(id, {
          plan: g.pl.includes(id)
            ? [{ ...plan[1], at: c.id, after: T.t + tmax, minutes }, ...plan.slice(2)]
            : plan.slice(1),
        });
      }
      seatWatchers(T, g.ms, g.pl, c);
      moveUnit(
        T,
        g.ms,
        g.ms.map((id) => T.get(id).plan[0]?.at ?? c.id),
      );
    }
  }
}

// ── 排队 ─────────────────────────────────────────────────────────────────────────

function queuePass(T: Tick): void {
  for (const pid of Object.keys(T.q)) {
    const p = T.place(pid);
    if (!p) continue;
    // 等不下去的
    for (const id of T.qOf(pid).slice()) {
      const a = T.get(id);
      if (!isLead(T, a) || a.patience > 0 || a.where.kind !== 'queue') continue;
      const ms = membersOf(T, a);
      const waited = T.t - a.where.since;
      const seek = a.plan[0]?.doing === 'queue';
      // 拍架边头一回没轮上：先去喝点东西，过一会儿再来排（一天只这么一回）
      if (seek && !a.missed?.includes('retry:pickle') && a.leaveBy - T.t > 75) {
        T.emit('end', id, pid, 'queue', `拍架边排了 ${waited} 分钟没轮上，先去喝点东西，等会儿再来`);
        for (const m of ms) {
          const b = T.get(m);
          standBy(T, m, pid);
          T.set(m, {
            day: { ...b.day, waited: b.day.waited + waited },
            missed: [...(b.missed ?? []), 'retry:pickle'],
            patience: patienceOf(T.person(m)),
          });
        }
        popAll(T, ms);
        unshiftAll(T, ms, {
          doing: 'drink',
          minutes: int(T.rng(id, 'retry'), 15, 30),
          kinds: ['stall', 'cafe', 'seat'],
        });
        decide(T, ms);
        continue;
      }
      for (const m of ms) {
        const b = T.get(m);
        standBy(T, m, pid);
        T.set(m, { day: { ...b.day, gaveUp: b.day.gaveUp + 1, waited: b.day.waited + waited } });
      }
      for (const m of ms)
        T.emit(
          'gaveUp',
          m,
          pid,
          seek ? a.plan[1].doing : (a.plan[0]?.doing ?? 'queue'),
          seek
            ? `拍架边排了 ${waited} 分钟没轮上，不打了`
            : p.kind === 'desk'
              ? `前台排了 ${waited} 分钟没轮到，没签到就进去了`
              : `${p.name}排了 ${waited} 分钟${T.isOpen(p) ? '没轮到' : '一直没开'}，不等了`,
        );
      popAll(T, ms);
      for (const m of ms) {
        const b = T.get(m);
        T.set(m, { patience: patienceOf(T.person(m)) });
        if (seek) T.set(m, { plan: b.plan.filter((x) => !isCourtPlay(x) || !!x.at) });
      }
      decide(T, ms);
    }
    if (!T.isOpen(p)) continue;
    // 队头进去
    for (let guard = 0; guard < 20; guard++) {
      const l = T.qOf(pid);
      if (!l.length) break;
      const head = l.find((id) => isLead(T, T.get(id)) && T.get(id).plan[0]?.doing !== 'queue');
      if (!head) break;
      const a = T.get(head);
      const ms = membersOf(T, a);
      const need = isService(p) ? 1 : ms.length;
      // 队里的人已经到了：只看里面空没空（正往这走的人会排到后面；窗口边等餐的不占窗口）
      if (p.cap - T.busy(p) < need) break;
      const since = a.where.kind === 'queue' ? a.where.since : T.t;
      T.release(head);
      T.set(head, { day: { ...a.day, waited: a.day.waited + (T.t - since) } });
      if (isService(p)) serveEnter(T, head, p, ms.length);
      else {
        const it = a.plan[0];
        enterIntent(T, head, p, it, ms.length, 0);
        ms.forEach((m, k) => {
          if (m === head || T.get(m).where.kind !== 'queue') return;
          T.release(m);
          enterIntent(T, m, p, T.get(m).plan[0] ?? it, ms.length, k);
        });
      }
    }
  }
}

// ── 需求和耐心 ───────────────────────────────────────────────────────────────────

function needsPass(T: Tick, leads: readonly AgentId[]): void {
  const dt = 5;
  const doNeeds = T.t % dt === 0;
  const heat = heatAt(T.w, T.t);
  for (const id of T.present) {
    const a = T.get(id);
    if (a.where.kind === 'away') continue;
    if (doNeeds) {
      const d = a.doing;
      const play = PLAY.has(d);
      const fit = T.person(id)?.attrs.fitness ?? 50;
      const n = { ...a.needs };
      n.hunger += hungerRate(T.cfg.seed, id) * dt * (play ? 1.35 : 1);
      if (d === 'eat') n.hunger -= 5 * dt;
      n.thirst += 0.13 * dt * (1 + heat * 1.5) * (play ? 3 : 1);
      if (d === 'drink' || d === 'eat') n.thirst -= 6 * dt;
      if (play) n.tired += 0.45 * dt * (1.3 - fit / 100);
      else if (SIT.has(d)) n.tired -= 0.8 * dt;
      else n.tired += 0.03 * dt;
      n.hunger = clamp(Math.round(n.hunger * 10) / 10, 0, 100);
      n.thirst = clamp(Math.round(n.thirst * 10) / 10, 0, 100);
      n.tired = clamp(Math.round(n.tired * 10) / 10, 0, 100);
      T.set(id, { needs: n });
    }
  }
  for (const id of leads) {
    const a = T.get(id);
    if (a.where.kind === 'queue') {
      // 排着的窗口关了（摊主歇班）：等不了多久
      const p = T.place(a.where.at);
      const closed = !!p && !T.isOpen(p) && a.plan[0]?.doing !== 'queue';
      T.set(id, { patience: a.patience - (closed ? 4 : 1) });
    } else if (a.where.kind === 'at' && isSeeking(a.plan)) T.set(id, { patience: a.patience - 1 });
  }
}

// ── SimApi ───────────────────────────────────────────────────────────────────────

export function startDay(cfg: SimConfig, dayNo: number, weather?: Weather): SimState {
  const w = weather ?? defaultWeather(cfg.seed, dayNo);
  const plan = planDay(cfg, dayNo, w);
  return {
    seed: cfg.seed,
    dayNo,
    minute: DAY_START,
    weather: { ...w },
    agents: plan.agents,
    parties: plan.parties,
    queues: {},
    occupants: {},
    log: [],
    people: plan.people,
  };
}

function tick(cfg: SimConfig, s: SimState, input: SimInput, owned: boolean): Tick {
  const T = new Tick(cfg, s, input, owned);
  const leads = T.leads;
  needsPass(T, leads);
  for (const id of leads) unitTick(T, id);
  queuePass(T);
  matchPass(T, leads);
  return T;
}

export function step(cfg: SimConfig, s: SimState, input: SimInput): { state: SimState; events: SimEvent[] } {
  const T = tick(cfg, s, input, false);
  const state: SimState = {
    ...s,
    minute: T.t,
    agents: T.agents,
    occupants: T.occ,
    queues: T.q,
    log: T.events.length ? s.log.concat(T.events) : s.log,
  };
  return { state, events: T.events };
}

/**
 * 连走 n 步（换天、跳时刻的快进）：结果和连调 n 次 step 一模一样（测试守着），但中间的状态不交出去，
 * 所以人表、地点表、日志只在第一步复制一次，后面原地改 —— 快一倍多。不改传进来的 s。
 */
export function stepMany(
  cfg: SimConfig,
  s: SimState,
  n: number,
  input: SimInput | ((t: Minute) => SimInput),
): { state: SimState; events: SimEvent[] } {
  const inputAt = typeof input === 'function' ? input : () => input;
  if (n <= 0) return { state: s, events: [] };
  const first = step(cfg, s, inputAt(s.minute + 1));
  let cur: SimState = { ...first.state, log: first.state.log === s.log ? s.log.slice() : first.state.log };
  const events = first.events.slice();
  for (let i = 1; i < n; i++) {
    const T = tick(cfg, cur, inputAt(cur.minute + 1), true);
    for (const e of T.events) {
      cur.log.push(e);
      events.push(e);
    }
    cur = { ...cur, minute: T.t, agents: T.agents, occupants: T.occ, queues: T.q };
  }
  return { state: cur, events };
}

export function view(s: SimState): AgentView[] {
  const out: AgentView[] = [];
  for (const id of Object.keys(s.agents)) {
    const a = s.agents[id];
    const w = a.where;
    if (w.kind === 'away') continue;
    let spot = 0;
    let withIds: AgentId[] = [];
    if (w.kind === 'at') {
      spot = a.spot ?? 0;
      const occ = s.occupants[w.at] ?? [];
      const playing =
        a.doing === 'tennis' ||
        a.doing === 'pickle' ||
        a.doing === 'golf' ||
        a.doing === 'lesson' ||
        a.doing === 'coach' ||
        a.doing === 'warmup';
      withIds = occ.filter(
        (o) => o !== id && ((a.party && s.agents[o].party === a.party) || (playing && s.agents[o].doing === a.doing)),
      );
    } else if (w.kind === 'queue') {
      spot = Math.max(0, (s.queues[w.at] ?? []).indexOf(id));
      if (a.party) withIds = (s.queues[w.at] ?? []).filter((o) => o !== id && s.agents[o].party === a.party);
    } else if (a.party) {
      withIds = (s.parties[a.party]?.members ?? []).filter((o) => o !== id && s.agents[o].where.kind === 'travel');
    }
    const v: AgentView = { id, person: a.person, doing: a.doing, where: w, spot, with: withIds };
    if (a.party) v.party = a.party;
    out.push(v);
  }
  return out;
}

export const engine: SimApi & { stepMany: typeof stepMany } = { startDay, step, view, stepMany };
