import {
  ADJ,
  LOUNGE,
  LOUNGE_SLOTS,
  lineLength,
  M_PER_MIN,
  NODES,
  nbrs,
  PID,
  POSTS,
  type PostDef,
  type PostId,
  route,
  SID,
  STAFF,
  type StaffDef,
} from './data';

/**
 * 08 拖人 2.0 的规则（纯数值，不碰画面）：岗位需求、匹配度、搭档、心情、罢工、每天一件急事。
 * 画面和界面只读这里的状态、订阅 emit 出来的事件；两种手感（新 / 旧）用的是同一套数值。
 */

export const DAY_START = 360;
export const DAY_END = 1320;
export const DAYS = 3;
/** 搭档加成只在头几圈：之后两人聊上了（×0.9），要拆开重排 */
export const PAIR_FRESH = 4;
export const PAIR_BONUS = 1.25;
export const PAIR_CHAT = 0.9;
export const FOE_MULT = 0.8;

type XZ = { x: number; z: number };
type WayPt = XZ & { node: string };

export type PState = 'idle' | 'walk' | 'work' | 'storm';
export interface Pp {
  id: string;
  s: StaffDef;
  state: PState;
  post: PostId | null;
  x: number;
  z: number;
  /** 最后经过的路网节点 */
  node: string;
  path: WayPt[];
  mood: number;
  /** 这一圈的进度 0..1 */
  prog: number;
  /** 罢工剩余游戏分钟 */
  storm: number;
  dayState: '' | '没睡好' | '精神好';
  slot: number;
}

export interface PostRt {
  def: PostDef;
  occ: Pp | null;
  /** 没人管的累计分钟（满 60 扣声望） */
  unc: number;
  /** 积沙 0..100 */
  sand: number;
  /** 需求暴涨到这个时刻（大巴） */
  spike: number;
  /** 临时岗位此刻开着 */
  active: boolean;
  sched: [number, number, number][];
}

export type EvKind = 'bus' | 'sand' | 'racket';
export interface ActiveEv {
  kind: EvKind;
  start: number;
  deadline: number;
  res: null | 'ok' | 'meh' | 'fail';
  text: string;
  cov: number;
  tot: number;
}
export const EVT: Record<EvKind, { post: PostId; title: string; line: string }> = {
  bus: { post: 'desk', title: '旅游大巴到了', line: '前台 + 导游都要人，3 小时' },
  sand: { post: 'court', title: '会员场积沙', line: '扫干净前不出钱' },
  racket: { post: 'string', title: '冠军急要拍线', line: '90 分钟内穿好' },
};

export type GameEvent =
  | { k: 'arrive'; p: Pp; post: PostId; stars: number; like: boolean; hate: boolean; mates: { p: Pp; rel: number }[] }
  | { k: 'rest'; p: Pp }
  | { k: 'pay'; p: Pp; post: PostId; pay: number; combo: number; chat: boolean; idle: boolean; rep: number }
  | { k: 'lost'; p: Pp; post: PostId; frac: number; money: number; why: 'drag' | 'bump' | 'storm' }
  | { k: 'bumped'; p: Pp; by: Pp }
  | { k: 'grumble'; p: Pp; line: string }
  | { k: 'storm'; p: Pp; post: PostId | null }
  | { k: 'calm'; p: Pp }
  | { k: 'uncovered'; post: PostId; loss: number }
  | { k: 'evStart'; ev: ActiveEv }
  | { k: 'evEnd'; ev: ActiveEv; money: number; rep: number }
  | { k: 'chat'; a: Pp; b: Pp }
  | { k: 'swept'; post: PostId };

export interface Stats {
  rev: number;
  dem: number;
  cov: number;
  combos: number;
  storms: number;
  lost: number;
  lostCyc: number;
  ev: ('ok' | 'meh' | 'fail')[];
}
const newStats = (): Stats => ({ rev: 0, dem: 0, cov: 0, combos: 0, storms: 0, lost: 0, lostCyc: 0, ev: [] });

export interface Preview {
  stars: number;
  rate: number;
  like: boolean;
  hate: boolean;
  skill: number;
  demand: number;
  next: number | null;
  mates: { name: string; rel: number; chat: boolean; left: number }[];
  walk: number;
  path: XZ[];
  /** 离开原岗位白干多少 */
  loss: { post: string; frac: number; money: number } | null;
  /** 会把谁换下来 */
  bump: { name: string; frac: number } | null;
  early: boolean;
  sweep: number | null;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export class Game {
  day = 1;
  t = DAY_START;
  money = 0;
  rep = 20;
  people: Pp[] = [];
  posts: Record<PostId, PostRt>;
  stats = newStats();
  dayStats = newStats();
  plan: { kind: EvKind; day: number; at: number; done: boolean }[] = [];
  ev: ActiveEv | null = null;
  /** 每一对搭档一起干了几圈（满 PAIR_FRESH 就聊上了） */
  pairs = new Map<string, number>();
  /** 谁被拿在手上（拿着的时候不会罢工） */
  held: string | null = null;
  private listeners: ((e: GameEvent) => void)[] = [];

  constructor(private rnd: () => number) {
    this.posts = Object.fromEntries(
      POSTS.map((d) => [d.id, { def: d, occ: null, unc: 0, sand: 0, spike: 0, active: !d.temp, sched: d.sched }]),
    ) as Record<PostId, PostRt>;
    this.people = STAFF.map((s, i) => {
      const sl = LOUNGE_SLOTS[i] as XZ;
      return {
        id: s.id,
        s,
        state: 'idle' as PState,
        post: null,
        x: sl.x,
        z: sl.z,
        node: 'lounge',
        path: [],
        mood: 58 + Math.floor(rnd() * 20),
        prog: 0,
        storm: 0,
        dayState: '' as const,
        slot: i,
      };
    });
    // 三天三件急事，顺序随机；时间落在上午十点到下午两点半之间
    const kinds: EvKind[] = ['bus', 'sand', 'racket'];
    for (let i = 2; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j] as EvKind, kinds[i] as EvKind];
    }
    this.plan = kinds.map((k, i) => ({ kind: k, day: i + 1, at: (10 + rnd() * 4.5) * 60, done: false }));
    this.startDay();
  }

  on(fn: (e: GameEvent) => void): void {
    this.listeners.push(fn);
  }
  private emit(e: GameEvent): void {
    for (const f of this.listeners) f(e);
  }
  rand(): number {
    return this.rnd();
  }

  startDay(): void {
    this.t = DAY_START;
    this.dayStats = newStats();
    for (const p of Object.values(this.posts)) {
      const sh = Math.floor(this.rnd() * 3) - 1;
      p.sched = p.def.sched.map(([a, b, l], i) => [
        i === 0 ? a : clamp(a + sh, 6, 22),
        i === p.def.sched.length - 1 ? b : clamp(b + sh, 6, 22),
        l,
      ]);
    }
    for (const p of this.people) {
      const r = this.rnd();
      p.dayState = r < 0.22 ? '没睡好' : r < 0.45 ? '精神好' : '';
      if (p.dayState === '没睡好') p.mood = clamp(p.mood - 15, 0, 100);
      if (p.dayState === '精神好') p.mood = clamp(p.mood + 10, 0, 100);
    }
  }

  get hour(): number {
    return this.t / 60;
  }
  baseDemand(p: PostRt, h = this.hour): number {
    for (const [a, b, l] of p.sched) if (h >= a && h < b) return l;
    return 0;
  }
  demand(id: PostId, h = this.hour): number {
    const p = this.posts[id];
    if (!p.active) return 0;
    if (p.spike && this.t < p.spike) return id === 'guide' ? 3 : 5;
    return this.baseDemand(p, h);
  }
  nextBusy(id: PostId): number | null {
    for (let h = Math.ceil(this.hour); h < 22; h++) if (this.baseDemand(this.posts[id], h + 0.01) >= 2) return h;
    return null;
  }
  working(p: Pp | null | undefined): p is Pp {
    return !!p && p.state === 'work';
  }
  relation(a: Pp, b: Pp): number {
    if (a.s.foe.includes(b.id) || b.s.foe.includes(a.id)) return -1;
    if (a.s.friend.includes(b.id) || b.s.friend.includes(a.id)) return 1;
    return 0;
  }
  /** 某人在某岗位上会挨着谁（hyp：假设他被派过去，路上的人也算） */
  neighbors(p: Pp, post: PostId, hyp = false): { post: PostId; p: Pp; rel: number }[] {
    const out: { post: PostId; p: Pp; rel: number }[] = [];
    for (const id of nbrs(post)) {
      const q = this.posts[id].occ;
      if (!q || q === p) continue;
      if (!hyp && !this.working(q)) continue;
      if (hyp && q.storm > 0) continue;
      const r = this.relation(p, q);
      if (r) out.push({ post: id, p: q, rel: r });
    }
    return out;
  }
  pairCount(a: Pp, b: Pp): number {
    return this.pairs.get(pairKey(a.id, b.id)) ?? 0;
  }
  fit(p: Pp, post: PostId): number {
    const d = PID[post];
    let v = p.s.st[d.skill];
    if (p.s.like.includes(post)) v += 25;
    if (p.s.hate.includes(post)) v -= 45;
    if (p.id === 'ben' && this.hour < 12) v += 10;
    return v;
  }
  stars(p: Pp, post: PostId): number {
    const v = this.fit(p, post);
    return v >= 80 ? 3 : v >= 50 ? 2 : 1;
  }
  rate(p: Pp, post: PostId, hyp = false): { v: number; combo: number; chat: boolean } {
    const d = PID[post];
    let m = clamp(p.s.st[d.skill] / 60, 0.4, 1.5);
    if (p.s.like.includes(post)) m *= 1.2;
    if (p.s.hate.includes(post)) m *= 0.6;
    m *= 0.6 + (0.4 * p.mood) / 100;
    if (p.id === 'ben' && this.hour < 12) m *= 1.2;
    let combo = 1;
    let chat = false;
    for (const n of this.neighbors(p, post, hyp)) {
      if (n.rel < 0) combo *= FOE_MULT;
      else if (this.pairCount(p, n.p) >= PAIR_FRESH) {
        combo *= PAIR_CHAT;
        chat = true;
      } else combo *= PAIR_BONUS;
    }
    const dem = this.demand(post);
    if (post === 'court' && this.posts.court.sand > 0) return { v: 0, combo, chat };
    return { v: d.base * (dem > 0 ? dem : 0.25) * m * combo, combo, chat };
  }

  /* ---------------- 走路 ---------------- */
  /** 从此刻的位置走到 target 节点的折线（走在半路上：回头或往前，取近的） */
  pathFor(p: Pp, target: string): WayPt[] {
    const here = { x: p.x, z: p.z };
    const named = (n: string): WayPt[] => {
      const r = route(n, target);
      // 路网节点名：route 只给坐标，按坐标对回节点名
      return r.map((q) => ({ ...q, node: nodeAt(q) }));
    };
    const opts: WayPt[][] = [];
    opts.push([{ ...here, node: '' }, ...named(p.node)]);
    const nx = p.path[0];
    if (p.state === 'walk' && nx?.node) opts.push([{ ...here, node: '' }, ...named(nx.node)]);
    let best = opts[0] as WayPt[];
    for (const o of opts) if (lineLength(o) < lineLength(best)) best = o;
    return best.filter(
      (q, i) => i === 0 || Math.hypot(q.x - (best[i - 1] as XZ).x, q.z - (best[i - 1] as XZ).z) > 0.01,
    );
  }
  walkMin(path: readonly XZ[]): number {
    return Math.round(lineLength(path) / M_PER_MIN);
  }
  targetNode(post: PostId | null): string {
    return post ? PID[post].node : 'lounge';
  }

  /* ---------------- 指派 ---------------- */
  private leave(p: Pp, why: 'drag' | 'bump' | 'storm'): void {
    const id = p.post;
    if (!id) return;
    if (p.state === 'work' && p.prog > 0.04) {
      const money = this.rate(p, id).v * p.prog;
      this.stats.lostCyc++;
      this.dayStats.lostCyc++;
      this.stats.lost += money;
      this.emit({ k: 'lost', p, post: id, frac: p.prog, money, why });
    }
    if (this.posts[id].occ === p) this.posts[id].occ = null;
    this.breakPairs(p);
    p.post = null;
    p.prog = 0;
  }
  private breakPairs(p: Pp): void {
    for (const k of [...this.pairs.keys()]) if (k.split('|').includes(p.id)) this.pairs.delete(k);
  }
  canPick(p: Pp): boolean {
    return p.storm <= 0;
  }
  /** 派到岗位（null = 休息区）。返回 false：没变化 */
  assign(p: Pp, post: PostId | null): boolean {
    if (p.storm > 0) return false;
    if (post && this.posts[post].occ === p) return false;
    if (!post && !p.post && p.state !== 'walk') return false;
    if (post && !this.posts[post].active) return false;
    const path = this.pathFor(p, this.targetNode(post));
    if (post) {
      const other = this.posts[post].occ;
      if (other) {
        this.leave(other, 'bump');
        this.sendLounge(other);
        this.emit({ k: 'bumped', p: other, by: p });
      }
    }
    this.leave(p, 'drag');
    if (post) {
      this.posts[post].occ = p;
      p.post = post;
    }
    if (!post) path.push({ ...(LOUNGE_SLOTS[p.slot] as XZ), node: 'lounge' });
    p.path = path.slice(1);
    p.state = 'walk';
    return true;
  }
  private sendLounge(p: Pp): void {
    p.post = null;
    const path = this.pathFor(p, 'lounge');
    path.push({ ...(LOUNGE_SLOTS[p.slot] as XZ), node: 'lounge' });
    p.path = path.slice(1);
    p.state = 'walk';
  }
  private arrive(p: Pp): void {
    if (!p.post) {
      p.state = p.storm > 0 ? 'storm' : 'idle';
      if (p.storm <= 0) this.emit({ k: 'rest', p });
      return;
    }
    p.state = 'work';
    p.prog = 0;
    const id = p.post;
    this.emit({
      k: 'arrive',
      p,
      post: id,
      stars: this.stars(p, id),
      like: p.s.like.includes(id),
      hate: p.s.hate.includes(id),
      mates: this.neighbors(p, id).map((n) => ({ p: n.p, rel: n.rel })),
    });
  }
  private stormOff(p: Pp): void {
    const post = p.post;
    this.leave(p, 'storm');
    p.storm = 120;
    this.stats.storms++;
    this.dayStats.storms++;
    this.emit({ k: 'storm', p, post });
    this.sendLounge(p);
  }

  /* ---------------- 一圈结算 ---------------- */
  private cycleDone(p: Pp): void {
    const id = p.post as PostId;
    const { v, combo, chat } = this.rate(p, id);
    const pay = Math.round(v);
    const stars = this.stars(p, id);
    const dem = this.demand(id);
    let dr = 0;
    if (!(id === 'court' && this.posts.court.sand > 0)) {
      this.money += pay;
      this.stats.rev += pay;
      this.dayStats.rev += pay;
      if (stars === 3 && dem >= 2) dr += 1;
      // 红土养护：养得好（★★ 以上）才涨声望
      if (PID[id].rep && stars >= 2) dr += PID[id].rep as number;
      this.rep += dr;
    }
    // 搭档：每一对一起干一圈记半次（两个人各结一次）
    for (const n of this.neighbors(p, id)) {
      if (n.rel <= 0) continue;
      const k = pairKey(p.id, n.p.id);
      const c = (this.pairs.get(k) ?? 0) + 0.5;
      this.pairs.set(k, c);
      if (c < PAIR_FRESH + 0.5) {
        this.stats.combos += 0.5;
        this.dayStats.combos += 0.5;
      }
      if (c === PAIR_FRESH) this.emit({ k: 'chat', a: p, b: n.p });
    }
    this.emit({ k: 'pay', p, post: id, pay, combo, chat, idle: dem === 0, rep: dr });
    if (combo < 0.85 && this.rnd() < 0.6)
      this.emit({ k: 'grumble', p, line: pick(['别在我旁边嚷嚷', '烦死了'], this.rnd) });
    else if (p.s.hate.includes(id) && this.rnd() < 0.6)
      this.emit({ k: 'grumble', p, line: pick(p.s.say.hate, this.rnd) });
    // 急单拍线
    const ev = this.ev;
    if (ev && ev.kind === 'racket' && id === 'string' && !ev.res) {
      if (p.s.st.craft >= 70) this.endEv('ok', `${p.s.name} 穿得完美`, 90, 5);
      else this.endEv('meh', `${p.s.name} 穿完了，线太松`, 35, -1);
    }
  }

  /* ---------------- 急事 ---------------- */
  private startEv(kind: EvKind): void {
    const ev: ActiveEv = { kind, start: this.t, deadline: this.t + 90, res: null, text: '', cov: 0, tot: 0 };
    this.ev = ev;
    if (kind === 'bus') {
      this.posts.desk.spike = this.t + 180;
      this.posts.guide.spike = this.t + 180;
      this.posts.guide.active = true;
      ev.deadline = this.t + 180;
    }
    if (kind === 'sand') {
      this.posts.court.sand = 100;
      ev.deadline = DAY_END;
    }
    this.emit({ k: 'evStart', ev });
  }
  private endEv(res: 'ok' | 'meh' | 'fail', text: string, money: number, rep: number): void {
    const ev = this.ev;
    if (!ev || ev.res) return;
    ev.res = res;
    ev.text = text;
    this.money += money;
    this.stats.rev += money;
    this.dayStats.rev += money;
    this.rep += rep;
    this.stats.ev.push(res);
    this.dayStats.ev.push(res);
    if (ev.kind === 'bus') {
      const g = this.posts.guide;
      g.active = false;
      g.spike = 0;
      this.posts.desk.spike = 0;
      if (g.occ) {
        const q = g.occ;
        this.leave(q, 'bump');
        this.sendLounge(q);
      }
    }
    this.emit({ k: 'evEnd', ev, money, rep });
  }
  private updateEv(): void {
    for (const e of this.plan)
      if (!e.done && e.day === this.day && this.t >= e.at && !this.ev) {
        e.done = true;
        this.startEv(e.kind);
      }
    const ev = this.ev;
    if (!ev || ev.res) return;
    if (ev.kind === 'bus' && this.t >= ev.deadline) {
      const ok = ev.cov / (ev.tot || 1);
      const pc = Math.round(ok * 100);
      if (ok >= 0.75) this.endEv('ok', `游客都接待好了（${pc}%）`, 60, 4);
      else if (ok >= 0.4) this.endEv('meh', `走了一半游客（${pc}%）`, 0, -1);
      else this.endEv('fail', `大巴客人全跑了（${pc}%）`, 0, -5);
    }
    if (ev.kind === 'sand' && this.posts.court.sand <= 0) {
      const hrs = (this.t - ev.start) / 60;
      this.endEv(hrs <= 3 ? 'ok' : 'meh', `扫干净了，用了 ${hrs.toFixed(1)} 小时`, 30, 4);
      this.emit({ k: 'swept', post: 'court' });
    }
    if (ev.kind === 'racket' && this.t >= ev.deadline) this.endEv('fail', '冠军等不及走了', 0, -6);
  }
  /** 急事结束 3.5 秒（真实）后由界面清掉 */
  clearEv(): void {
    if (this.ev?.res) this.ev = null;
  }

  /* ---------------- 推进 ---------------- */
  /** gm：游戏分钟 */
  tick(gm: number): void {
    this.t += gm;
    this.updateEv();
    for (const id of Object.keys(this.posts) as PostId[]) {
      const p = this.posts[id];
      if (!p.active) continue;
      const d = this.demand(id);
      const w = this.working(p.occ) && !(id === 'court' && p.sand > 0);
      if (d > 0) {
        this.stats.dem += d * gm;
        this.dayStats.dem += d * gm;
        if (w) {
          this.stats.cov += d * gm;
          this.dayStats.cov += d * gm;
        }
      }
      const ev = this.ev;
      if (ev && ev.kind === 'bus' && !ev.res && (id === 'desk' || id === 'guide')) {
        ev.tot += gm / 2;
        if (w) ev.cov += gm / 2;
      }
      if (id === 'court' && p.sand > 0) {
        if (this.working(p.occ)) {
          const m = p.occ.s.st.maint * 0.9 * (p.occ.id === 'rosa' ? 1.6 : 1);
          p.sand = Math.max(0, p.sand - (m / 60) * gm);
        }
        p.unc += gm;
        if (p.unc >= 60) {
          p.unc -= 60;
          this.rep -= 2;
          this.emit({ k: 'uncovered', post: id, loss: 2 });
        }
      } else if (d >= 2 && !w) {
        p.unc += gm;
        if (p.unc >= 60) {
          p.unc -= 60;
          const loss = d >= 5 ? 3 : d >= 3 ? 2 : 1;
          this.rep -= loss;
          this.emit({ k: 'uncovered', post: id, loss });
        }
      } else p.unc = Math.max(0, p.unc - gm * 0.5);
    }
    for (const p of this.people) {
      if (p.state === 'walk') {
        let step = M_PER_MIN * gm;
        while (step > 0 && p.path.length) {
          const tg = p.path[0] as WayPt;
          const dx = tg.x - p.x;
          const dz = tg.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d <= step) {
            p.x = tg.x;
            p.z = tg.z;
            if (tg.node) p.node = tg.node;
            p.path.shift();
            step -= d;
          } else {
            p.x += (dx / d) * step;
            p.z += (dz / d) * step;
            step = 0;
          }
        }
        p.mood = clamp(p.mood - (1 / 60) * gm, 0, 100);
        if (!p.path.length) {
          if (!p.post) p.node = 'lounge';
          this.arrive(p);
        }
      } else if (p.state === 'work') {
        const id = p.post as PostId;
        p.prog += gm / 60;
        let dm = -5;
        if (p.s.like.includes(id)) dm += 5;
        if (p.s.hate.includes(id)) dm -= 10;
        if (p.s.st[PID[id].skill] < 40) dm -= 3;
        for (const n of this.neighbors(p, id)) dm += n.rel > 0 ? 3 : -6;
        if (p.id === 'gus') dm -= 2;
        if (p.id === 'jess' && dm < 0) dm *= 0.6;
        p.mood = clamp(p.mood + (dm / 60) * gm, 0, 100);
        if (p.prog >= 1) {
          p.prog -= 1;
          this.cycleDone(p);
        }
        if (p.mood < 12 && this.held !== p.id) this.stormOff(p);
      } else if (p.state === 'storm') {
        p.storm -= gm;
        p.mood = clamp(p.mood + (12 / 60) * gm, 0, 100);
        if (p.storm <= 0) {
          p.storm = 0;
          p.state = 'idle';
          p.mood = Math.max(p.mood, 45);
          this.emit({ k: 'calm', p });
        }
      } else if (p.state === 'idle') p.mood = clamp(p.mood + (10 / 60) * gm, 0, 100);
    }
    // 搭档散了（有一方不在岗）就清掉记数
    for (const k of [...this.pairs.keys()]) {
      const [a, b] = k.split('|');
      const A = this.people.find((p) => p.id === a);
      const B = this.people.find((p) => p.id === b);
      const adj =
        A?.post && B?.post && ADJ.some(([x, y]) => (x === A.post && y === B.post) || (y === A.post && x === B.post));
      if (!adj) this.pairs.delete(k);
    }
  }

  /** 收工：急事没完的按结果算掉 */
  endDay(): void {
    this.t = DAY_END;
    const ev = this.ev;
    if (ev && !ev.res) {
      if (ev.kind === 'sand') this.endEv('fail', '到收工也没扫完', 0, -3);
      else this.endEv('meh', '收工了', 0, 0);
    }
    this.ev = null;
    for (const p of Object.values(this.posts)) p.spike = 0;
    this.posts.court.sand = 0;
  }
  nextDay(): void {
    this.day++;
    for (const p of this.people) {
      p.mood = clamp(p.mood + 15, 0, 100);
      if (p.storm > 0) {
        p.storm = 0;
        p.state = 'idle';
      }
    }
    this.startDay();
  }

  /* ---------------- 预览（松手前每个岗位显示的东西） ---------------- */
  preview(p: Pp, post: PostId | null): Preview {
    const path = this.pathFor(p, this.targetNode(post));
    if (!post) path.push({ ...(LOUNGE_SLOTS[p.slot] as XZ), node: 'lounge' });
    const loss =
      p.state === 'work' && p.post && p.post !== post && p.prog > 0.04
        ? { post: PID[p.post].name, frac: p.prog, money: this.rate(p, p.post).v * p.prog }
        : null;
    if (!post)
      return {
        stars: 0,
        rate: 0,
        like: false,
        hate: false,
        skill: 0,
        demand: 0,
        next: null,
        mates: [],
        walk: this.walkMin(path),
        path,
        loss,
        bump: null,
        early: false,
        sweep: null,
      };
    const o = this.posts[post].occ;
    const r = this.rate(p, post, true);
    return {
      stars: this.stars(p, post),
      rate: r.v,
      like: p.s.like.includes(post),
      hate: p.s.hate.includes(post),
      skill: p.s.st[PID[post].skill],
      demand: this.demand(post),
      next: this.demand(post) === 0 ? this.nextBusy(post) : null,
      mates: this.neighbors(p, post, true).map((n) => {
        const c = this.pairCount(p, n.p);
        return {
          name: n.p.s.name,
          rel: n.rel,
          chat: n.rel > 0 && c >= PAIR_FRESH,
          left: Math.max(0, Math.ceil(PAIR_FRESH - c)),
        };
      }),
      walk: this.walkMin(path),
      path,
      loss,
      bump: o && o !== p ? { name: o.s.name, frac: this.working(o) ? o.prog : 0 } : null,
      early: p.id === 'ben' && this.hour < 12,
      sweep:
        post === 'court' && this.posts.court.sand > 0
          ? Math.round(p.s.st.maint * 0.9 * (p.id === 'rosa' ? 1.6 : 1))
          : null,
    };
  }
  person(id: string): Pp {
    return this.people.find((p) => p.id === id) as Pp;
  }
  staff(id: string): StaffDef {
    return SID[id] as StaffDef;
  }
}

function nodeAt(q: XZ): string {
  for (const [k, v] of Object.entries(NODES)) if (Math.abs(v.x - q.x) < 1e-6 && Math.abs(v.z - q.z) < 1e-6) return k;
  return '';
}
export function pick<T>(a: readonly T[], rnd: () => number): T {
  return a[Math.floor(rnd() * a.length)] as T;
}
export { LOUNGE };
