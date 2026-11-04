import {
  type CourtFrame,
  Custom,
  type DrawContext,
  EAST,
  type IsoWorld,
  type Person,
  type Scheduler,
  type Site,
  type Sprite,
  WEST,
} from '@td/iso';
import { clamp, type XZ } from '@td/shared';
import type { GameState } from '@td/sim';

/**
 * 园区的"日常"（准则 6：玩家不操作时世界照样在动）：
 * - 会员自己来打球：营业时间、不下雨、场地能用、没被活动占着时，一对一对地上场。人数跟着会员数和时段走，
 *   修好一块场地，那块场地上就开始有人打球（ADR 0015：修好就是解锁，画面也活过来）。
 * - 路人在修好的地方之间走来走去，会员越多人越多。
 * - 风沙：刮风天和春天的风季，沙子贴着地面吹过去。
 * - 等着的客人：有需求的岗位到了时段，有人在岗就有一位客人在跟他办事；没人在岗，客人就在那儿干等、摊手
 *   （和 HUD 上"有 N 处客人在等"是同一件事，只是画在场景里）。
 *
 * 只读模拟状态。谁在不在场按"哪天、哪个两小时段、哪块场地"算一个固定的值，同一时段里不会忽有忽无。
 */

interface Court {
  anchor: string;
  /** 这个地点的第几块场地 */
  k: number;
  readonly frame: CourtFrame;
}

const SAND = ['#e2c597', '#d9b98a', '#cfae7e', '#e8d0a6'];

/** 一个小整数哈希：同样的输入永远给同样的 0..1 */
function hash01(...n: number[]): number {
  let h = 2166136261;
  for (const x of n) {
    h ^= x | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface LifeDeps {
  world: IsoWorld;
  site: Site;
  /** 这个地点现在有几块能打的场地（看设施状态） */
  courtsAt: (s: GameState, anchor: string) => number;
  /** 这个地点开了没有（地块上的新地点要开了才去；不在地块上的一直 true；不给 = 都开着） */
  placeOpen?: (s: GameState, anchor: string) => boolean;
  sched: Scheduler;
  rnd: () => number;
  /** 一个藏着的路人（每个号码一个人） */
  person: (i: number) => Person;
  rally: (a: Person, b: Person, o?: { speed?: number; miss?: number }) => { stop(): void };
  /** 这块场地正被活动演出占着 */
  busy: (anchor: string) => boolean;
  /** 此刻有需求的岗位（按地点合并）：有没有人在接待、没接待的有几处 */
  waiting?: (s: GameState) => readonly { anchor: string; served: boolean; unserved: number }[];
}

export interface Life {
  update(s: GameState, dt: number): void;
  /** 读档、换内容之后全部重排 */
  reset(): void;
}

/** 背景人物现在在干什么：不在场、正走进来、到位了、正走出去 */
type Phase = 'off' | 'in' | 'here' | 'out';

/** 一个背景人物的走位状态（只管画面：进场、离场、掉头、溶解） */
interface Bg {
  p: Person;
  phase: Phase;
  /** 这一趟走的折线，以及已经走完了几个点（掉头时沿走过的路原路回去） */
  trip: XZ[];
  leg: number;
  /** 像素溶解：不透明度从 a 到 b，d 秒走完 */
  fade: { a: number; b: number; t: number; d: number; done: (() => void) | null } | null;
  /** 每排一趟新路就加一，旧路上的回调作废 */
  token: number;
}

/** 溶解一次要多久（秒，真实时间） */
const FADE = 0.6;
/**
 * 会员、客人走路的速度：和员工一样按游戏时间走（米/游戏分钟，比员工的 1.6 慢一点），换成真实米/秒后夹在
 * 这个范围里（最快的倍速下也不至于一帧跨出一米多，像瞬移）
 */
const WALK_PER_MIN = 1.2;
const WALK_MIN = 2;
const WALK_MAX = 20;
/** 来打球的会员最多提前多少游戏分钟出发；路太远走不完的那一截，改在半路溶解出现 */
const COURT_LEAD = 150;
/** 等着的客人最多走多少游戏分钟进场 */
const GUEST_LEAD = 60;
/** 游戏最快也就 4× 再加没事时的 2×（每秒 48 游戏分钟）；倍速估计不超过这个，免得一次补帧把路程算成零 */
const GMPS_MAX = 50;

const plen = (pts: readonly XZ[]) =>
  pts.reduce((n, q, i) => (i ? n + Math.hypot(q.x - (pts[i - 1] as XZ).x, q.z - (pts[i - 1] as XZ).z) : 0), 0);

/** 折线从头起最多 max 米的一截（离场用：先走这一截，再在终点溶解掉） */
function head(pts: readonly XZ[], max: number): XZ[] {
  const out: XZ[] = [];
  let left = max;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i] as XZ;
    if (i === 0) {
      out.push(q);
      continue;
    }
    const a = pts[i - 1] as XZ;
    const d = Math.hypot(q.x - a.x, q.z - a.z);
    if (d <= left) {
      out.push(q);
      left -= d;
      continue;
    }
    const f = d > 0 ? left / d : 0;
    out.push({ x: a.x + (q.x - a.x) * f, z: a.z + (q.z - a.z) * f });
    break;
  }
  return out;
}
/** 折线最后最多 max 米的一截（进场用：在这一截的起点溶解出现） */
const tail = (pts: readonly XZ[], max: number): XZ[] => head([...pts].reverse(), max).reverse();

export function createLife(d: LifeDeps): Life {
  const { site } = d;
  // 一块场地记"哪个地点的第 k 块"；frame 每次现读（site.courts 可能按变体换了一套，见 courts.ts）
  const COURTS: Court[] = Object.entries(site.courts).flatMap(([anchor, frames]) =>
    frames.map((base, k) => ({
      anchor,
      k,
      get frame() {
        return site.courts[anchor]?.[k] ?? base;
      },
    })),
  );
  const SPOTS = Object.keys(site.stands);
  const EXITS = ['entrance', 'parking'].filter((x) => site.stands[x]);
  /** 一个地点上第 k 块场地能不能打 */
  const open = (s: GameState, c: Court) => {
    // 这一套里没有第 k 块（换了变体、场地变少）就不打
    if (!site.courts[c.anchor]?.[c.k]) return 0;
    return c.k < d.courtsAt(s, c.anchor) ? 1 : 0;
  };
  /** 地块上的新地点（ADR 0021）：开了才去（那儿没有设施状态，开了就算开着） */
  const LAND = new Set(Object.keys(site.land?.stands ?? {}));
  /** 路人只去开着的地方（有场地能打的、或者设施修好了的），再加大门和停车场 */
  const spotOpen = (s: GameState, a: string) =>
    LAND.has(a)
      ? !!site.stands[a] && (d.placeOpen?.(s, a) ?? false)
      : a === 'entrance' || a === 'parking' || d.courtsAt(s, a) > 0 || s.facilities[a] === 'open';

  /* ---------- 走位的公共部分：进场、离场、掉头、溶解 ---------- */
  /** 游戏分钟 / 真实秒（按最近一段时间估，用来算"走得完走不完"） */
  let gmps = 6;
  /** 时间跳了（读档、夜里跳过、调试跳天、暂停时快进）：这一轮不演走路，直接在位置上溶解出现、原地溶解掉 */
  let snap = true;
  const walkSpeed = () => clamp(gmps * WALK_PER_MIN, WALK_MIN, WALK_MAX);
  const all: Bg[] = [];
  const bg = (p: Person): Bg => {
    const b: Bg = { p, phase: 'off', trip: [], leg: 0, fade: null, token: 0 };
    all.push(b);
    return b;
  };
  /** 身体、发型、覆盖物、手里的东西一起溶解（只改身体的话头发会一下子冒出来） */
  function setAlpha(p: Person, a: number): void {
    p.root.traverse((n) => {
      if (n.kind === 'sprite') (n as Sprite).opacity = a;
    });
  }
  const here = (b: Bg) => ({ x: b.p.pos.x, z: b.p.pos.z });
  function fadeTo(b: Bg, to: number, done: (() => void) | null = null): void {
    const vis = b.p.root.visible;
    const from = vis ? b.p.sprite.opacity : 0;
    b.p.root.visible = true;
    setAlpha(b.p, from);
    b.fade = { a: from, b: to, t: 0, d: FADE * Math.abs(to - from), done };
    if (b.fade.d <= 0) endFade(b);
  }
  function endFade(b: Bg): void {
    const f = b.fade;
    if (!f) return;
    b.fade = null;
    setAlpha(b.p, f.b);
    if (f.b <= 0) {
      b.p.root.visible = false;
      setAlpha(b.p, 1);
    }
    f.done?.();
  }
  function tickFades(dt: number): void {
    for (const b of all) {
      const f = b.fade;
      if (!f) continue;
      f.t += dt;
      if (f.t >= f.d) endFade(b);
      else setAlpha(b.p, f.a + (f.b - f.a) * (f.t / f.d));
    }
  }
  /** 立刻藏起来（只在读档、换内容时用） */
  function hideNow(b: Bg): void {
    b.token++;
    b.fade = null;
    b.p.clearMoves();
    b.p.root.visible = false;
    setAlpha(b.p, 1);
    b.phase = 'off';
  }
  /** 原地溶解掉（时间跳过去了，来不及走） */
  function vanish(b: Bg, then: () => void = () => {}): void {
    b.token++;
    b.p.clearMoves();
    b.phase = 'out';
    b.trip = [here(b)];
    b.leg = 1;
    fadeTo(b, 0, () => {
      if (b.phase !== 'out') return;
      b.phase = 'off';
      then();
    });
  }
  /** 沿折线走（第一个点是起点），走完调 then；中途记着走到第几个点 */
  function walk(b: Bg, pts: readonly XZ[], then: () => void, speed = walkSpeed()): void {
    const tok = ++b.token;
    b.p.clearMoves();
    b.p.base = 'relaxed';
    b.p.lock = null;
    b.p.seatY = null;
    b.p.idleFace = null;
    b.trip = [...pts];
    b.leg = 1;
    for (const q of pts.slice(1))
      b.p.go(q.x, q.z, speed).call(() => {
        if (tok === b.token) b.leg++;
      });
    b.p.call(() => {
      if (tok === b.token) then();
    });
  }
  /** 掉头：从现在的位置沿刚才走过的点原路回去 */
  const back = (b: Bg): XZ[] => [here(b), ...b.trip.slice(0, b.leg).reverse()];
  /**
   * 进场。不在场的人从 route 的起点（大门、停车场）溶解出现再走过去；路太远、倍速下走不完的，只走最后
   * budget 游戏分钟能走完的那一截（在半路溶解出现）。正在离场的人原路掉头回来。
   */
  function arrive(b: Bg, route: () => XZ[], budget: number, onHere: () => void): void {
    if (b.phase === 'in' || b.phase === 'here') return;
    const done = () => {
      b.phase = 'here';
      onHere();
    };
    if (b.phase === 'out') {
      b.phase = 'in';
      if (b.fade) fadeTo(b, 1);
      walk(b, back(b), done);
      return;
    }
    const full = route();
    const end = full[full.length - 1] as XZ;
    b.phase = 'in';
    if (snap) {
      // 时间跳过去了：直接在位置上溶解出现
      b.token++;
      b.p.clearMoves();
      b.p.pos.x = end.x;
      b.p.pos.z = end.z;
      b.trip = [end];
      b.leg = 1;
      fadeTo(b, 1);
      done();
      return;
    }
    const pts = tail(full, (budget / Math.max(gmps, 0.1)) * walkSpeed());
    const start = pts[0] ?? end;
    b.p.clearMoves();
    b.p.pos.x = start.x;
    b.p.pos.z = start.z;
    fadeTo(b, 1);
    walk(b, pts.length > 1 ? pts : [start], done);
  }
  /** 离场：沿 route 走出去（正在进场的原路掉头），到头了溶解掉；倍速下走不完就走一截再溶解 */
  function depart(b: Bg, route: () => XZ[], budget: number, onGone: () => void = () => {}): void {
    if (b.phase === 'off' || b.phase === 'out') return;
    if (snap) {
      vanish(b, onGone);
      return;
    }
    const full = b.phase === 'in' ? back(b) : [here(b), ...route()];
    b.phase = 'out';
    const pts = head(full, (budget / Math.max(gmps, 0.1)) * walkSpeed());
    walk(b, pts, () =>
      fadeTo(b, 0, () => {
        if (b.phase !== 'out') return;
        b.phase = 'off';
        b.p.clearMoves();
        onGone();
      }),
    );
  }

  /* ---------- 来打球的会员 ---------- */
  const players = COURTS.map((_, i) => [bg(d.person(i * 2)), bg(d.person(i * 2 + 1))] as const);
  const courts = COURTS.map(() => ({ want: false, rally: null as { stop(): void } | null }));

  /** t 这个时刻这块场地有没有人打（同一个两小时段里是固定的值） */
  function courtWanted(s: GameState, c: Court, i: number, t: number): boolean {
    const draw = open(s, c);
    if (!draw || d.busy(c.anchor)) return false;
    if (s.weather === 'rain') return false;
    const min = t % 1440;
    if (min < 7 * 60 || min > 20 * 60) return false;
    const day = Math.floor(t / 1440);
    const block = Math.floor(min / 120);
    const members = s.stats.members ?? 0;
    const weekend = day % 7 >= 5 ? 0.2 : 0;
    const p = clamp(members / 40 + weekend, 0.15, 0.9) * draw;
    return hash01(day, block, i) < p;
  }
  /** 场地上两个人的位置（底线后）和朝向 */
  const spotOf = (c: Court, k: number) => c.frame.w({ x: k ? 9.5 : -9.5, z: 0 });
  /** 这对会员从哪儿来、回哪儿去（每天每块场地固定一个） */
  const exitOf = (s: GameState, i: number) =>
    EXITS[Math.floor(hash01(Math.floor(s.t / 1440), i, 7) * EXITS.length)] ?? 'entrance';
  /** 从场地站位沿场边走到底线后的位置（不穿过球网中间） */
  function inner(c: Court, k: number): XZ[] {
    const st = site.stands[c.anchor];
    const spot = spotOf(c, k);
    if (!st) return [spot];
    const f = c.frame;
    const l = f.l(st);
    const lane = (l.z < 0 ? -1 : 1) * Math.max(0, f.hz - 1.6);
    const sx = k ? 9.5 : -9.5;
    const a = f.w({ x: clamp(l.x, -f.hx + 1.5, f.hx - 1.5), z: lane });
    const b = f.w({ x: sx, z: lane });
    return [st, a, b, spot];
  }
  /** 从大门或停车场走到这块场地的底线后 */
  function courtRoute(s: GameState, i: number, k: number): XZ[] {
    const c = COURTS[i] as Court;
    const line = site.routeLine(exitOf(s, i), c.anchor) ?? [];
    return [...line.slice(0, -1), ...inner(c, k)];
  }
  /** 从大门走过来要多少游戏分钟（不超过 COURT_LEAD） */
  const leadOf = (s: GameState, i: number) =>
    Math.min(COURT_LEAD, (plen(courtRoute(s, i, 0)) / walkSpeed()) * gmps) + 4;

  function onCourt(i: number, k: number): void {
    const c = COURTS[i] as Court;
    const p = (players[i] as readonly [Bg, Bg])[k] as Bg;
    const at = spotOf(c, k);
    p.p.clearMoves();
    p.p.go(at.x, at.z, walkSpeed());
    p.p.base = 'ready';
    p.p.lock = c.frame.yaw(k ? WEST : EAST);
    const pair = players[i] as readonly [Bg, Bg];
    const st = courts[i];
    if (st?.want && !st.rally && pair.every((x) => x.phase === 'here'))
      st.rally = d.rally(pair[0].p, pair[1].p, { speed: 8 + d.rnd() * 3, miss: 0.2 });
  }

  function syncCourts(s: GameState): void {
    COURTS.forEach((c, i) => {
      const st = courts[i];
      if (!st) return;
      // 提前出发：下一段要打的话，走过来要多久就提前多久动身；这段打完了再走（数值不变，只是演出）
      // 已经在来的路上就多留半小时余量，倍速估计抖一下不至于走到一半又掉头
      const lead = leadOf(s, i) + (st.want ? 30 : 0);
      const want = courtWanted(s, c, i, s.t) || courtWanted(s, c, i, s.t + lead);
      if (want === st.want) return;
      st.want = want;
      const pair = players[i] as readonly [Bg, Bg];
      pair.forEach((p, k) => {
        if (want)
          arrive(
            p,
            () => courtRoute(s, i, k),
            COURT_LEAD,
            () => onCourt(i, k),
          );
        else {
          st.rally?.stop();
          st.rally = null;
          depart(p, () => [...courtRoute(s, i, k)].reverse().slice(1), COURT_LEAD);
        }
      });
    });
  }

  /* ---------- 走来走去的人 ---------- */
  const walkers = [0, 1, 2, 3].map((k) => ({
    b: bg(d.person(COURTS.length * 2 + k)),
    on: false,
    /** 这一程从哪儿来、往哪儿去；到了以后歇一会儿 */
    from: 'entrance' as string,
    at: 'entrance' as string,
    resting: false,
  }));
  type Walker = (typeof walkers)[number];
  const routeLen = (a: string, b: string) => plen(site.routeLine(a, b) ?? []);
  const nearestExit = (a: string) =>
    EXITS.reduce((x, y) => (routeLen(a, y) < routeLen(a, x) ? y : x), EXITS[0] ?? 'entrance');

  /** 到了一个地方、歇完了，再挑一个开着的地方走过去 */
  function wander(w: Walker, s: GameState): void {
    if (!w.on) {
      leave(w);
      return;
    }
    const choices = SPOTS.filter((x) => x !== w.at && spotOpen(s, x));
    const to = choices[Math.floor(d.rnd() * choices.length)] ?? 'entrance';
    const line = site.routeLine(w.at, to) ?? [site.stands[to] as XZ];
    w.from = w.at;
    w.at = to;
    w.resting = false;
    w.b.phase = 'here';
    walk(
      w.b,
      [here(w.b), ...line],
      () => {
        w.resting = true;
        const tok = w.b.token;
        w.b.p.wait(2 + d.rnd() * 5).call(() => {
          if (tok === w.b.token && cur) wander(w, cur);
        });
      },
      1.1 + d.rnd() * 0.5,
    );
  }
  /**
   * 不该在了：从现在的位置走向最近的出口（走到一半的就看往前还是往回近），到了溶解掉，不在半路消失；
   * 倍速下路太远，就走一截再溶解。
   */
  function leave(w: Walker): void {
    const b = w.b;
    if (b.phase === 'off' || b.phase === 'out') return;
    const exitFrom = (a: string) => (site.routeLine(a, nearestExit(a)) ?? []).slice(1);
    let pts: XZ[];
    if (w.resting) pts = [here(b), ...exitFrom(w.at)];
    else {
      const ahead = [here(b), ...b.trip.slice(b.leg), ...exitFrom(w.at)];
      const behind = [...back(b), ...exitFrom(w.from)];
      pts = plen(ahead) <= plen(behind) ? ahead : behind;
    }
    b.phase = 'out';
    const speed = clamp(walkSpeed() * 0.5, 1.5, 8);
    walk(
      b,
      head(pts, (GUEST_LEAD / Math.max(gmps, 0.1)) * speed),
      () =>
        fadeTo(b, 0, () => {
          if (b.phase !== 'out') return;
          b.phase = 'off';
          b.p.clearMoves();
          // 走到门口时又该回来了（会员多了、雨停了）：从这儿重新出现
          if (w.on && cur) enter(w, cur, nearestExit(w.at));
        }),
      speed,
    );
  }
  /** 从大门或停车场溶解出现，开始逛 */
  function enter(w: Walker, s: GameState, from: string): void {
    const at = site.stands[from] as XZ;
    const p = w.b.p;
    w.at = from;
    w.resting = true;
    p.clearMoves();
    p.pos.x = at.x + (d.rnd() - 0.5) * 2;
    p.pos.z = at.z + (d.rnd() - 0.5) * 2;
    p.base = 'relaxed';
    p.lock = null;
    p.seatY = null;
    p.idleFace = null;
    fadeTo(w.b, 1);
    wander(w, s);
  }

  function syncWalkers(s: GameState): void {
    const min = s.t % 1440;
    const open = min >= 7 * 60 && min <= 21 * 60;
    const members = s.stats.members ?? 0;
    const want = !open ? 0 : clamp(Math.round(members / 20) - (s.weather === 'rain' ? 1 : 0), 0, walkers.length);
    walkers.forEach((w, k) => {
      const on = k < want;
      if (on === w.on) return;
      w.on = on;
      if (!on) {
        // 跳时间时直接收起来；平常从现在的位置走向最近的出口
        if (!snap) leave(w);
        else if (w.b.phase !== 'off' && w.b.phase !== 'out')
          vanish(w.b, () => {
            if (w.on && cur) enter(w, cur, nearestExit(w.at));
          });
        return;
      }
      // 正往外走的：到门口溶解完会看见 on，再回来
      if (w.b.phase === 'off') enter(w, s, EXITS[Math.floor(d.rnd() * EXITS.length)] ?? 'entrance');
    });
  }

  /* ---------- 等着的客人 ---------- */
  const guests = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => ({
    b: bg(d.person(COURTS.length * 2 + 4 + k)),
    /** 占着的位置（空 = 没在等，可能正往外走） */
    slot: '',
    anchor: '',
    exit: 'entrance',
    next: 0,
    mood: 'wait' as 'wait' | 'served',
  }));
  type Guest = (typeof guests)[number];
  /** 排队的几个固定位置（不随人数挪：人多了往两边加，原来的人不动） */
  const SIDE = [0, 1.2, -1.2];
  function guestRoute(g: Guest, at: XZ): XZ[] {
    const line = site.routeLine(g.exit, g.anchor) ?? [];
    return [...line.slice(0, -1), at];
  }
  function syncGuests(s: GameState): void {
    const want: { key: string; anchor: string; at: XZ; face: XZ; mood: 'wait' | 'served' }[] = [];
    const members = s.stats.members ?? 0;
    for (const x of d.waiting?.(s) ?? []) {
      const st = site.stands[x.anchor];
      if (!st) continue;
      const fr = site.courts[x.anchor]?.[0];
      const c = fr ? { x: fr.ox, z: fr.oz } : (site.anchors[x.anchor] ?? st);
      const L = Math.hypot(c.x - st.x, c.z - st.z) || 1;
      const ux = (c.x - st.x) / L;
      const uz = (c.z - st.z) / L;
      // 有人接待：一位客人站在员工跟前；没人接待：几位客人隔几步排着（会员越多人越多）
      if (x.served)
        want.push({
          key: `${x.anchor}:s`,
          anchor: x.anchor,
          at: { x: st.x - uz * 1.6, z: st.z + ux * 1.6 },
          face: st,
          mood: 'served',
        });
      const n = x.unserved ? Math.min(3, x.unserved + (members >= 15 ? 1 : 0) + (members >= 40 ? 1 : 0)) : 0;
      for (let k = 0; k < n; k++) {
        const side = SIDE[k] ?? 0;
        want.push({
          key: `${x.anchor}:w${k}`,
          anchor: x.anchor,
          at: { x: st.x - ux * 2.6 - uz * (side + 2.4), z: st.z - uz * 2.6 + ux * (side + 2.4) },
          face: st,
          mood: 'wait',
        });
      }
    }
    const keys = new Set(want.map((x) => x.key));
    // 不再需要的位置：客人沿来路走回大门（或停车场），到了再溶解掉
    for (const g of guests)
      if (g.slot && !keys.has(g.slot)) {
        g.slot = '';
        const st = site.stands[g.anchor];
        depart(g.b, () => [...(site.routeLine(g.anchor, g.exit) ?? (st ? [st] : []))].slice(1), GUEST_LEAD);
      }
    for (const x of want) {
      if (guests.some((g) => g.slot === x.key)) continue;
      // 同一个地点上刚让出位置、还没走远的客人直接走到新位置（不另找一个人从门口来）
      const g =
        guests.find((q) => !q.slot && q.b.phase === 'out' && q.anchor === x.anchor) ??
        guests.find((q) => !q.slot && q.b.phase === 'off');
      if (!g) continue;
      const turning = g.b.phase === 'out';
      g.slot = x.key;
      g.mood = x.mood;
      g.next = 0;
      if (!turning) {
        g.anchor = x.anchor;
        g.exit = EXITS[Math.floor(d.rnd() * EXITS.length)] ?? 'entrance';
      }
      const settle = () => {
        g.b.p.idleFace = Math.atan2(x.face.x - x.at.x, x.face.z - x.at.z);
        g.b.p.yaw = g.b.p.idleFace;
      };
      if (turning) {
        g.b.phase = 'in';
        if (g.b.fade) fadeTo(g.b, 1);
        walk(g.b, [here(g.b), x.at], () => {
          g.b.phase = 'here';
          settle();
        });
      } else arrive(g.b, () => guestRoute(g, x.at), GUEST_LEAD, settle);
    }
  }
  function animGuests(): void {
    const now = d.sched.now;
    for (const g of guests) {
      if (!g.slot || g.b.phase !== 'here' || now < g.next) continue;
      g.next = now + 2 + d.rnd() * 2.5;
      const pool =
        g.mood === 'served' ? (['talk', 'hand', 'point'] as const) : (['shrug', 'facepalm', 'shrug', 'hand'] as const);
      g.b.p.gesture(pool[Math.floor(d.rnd() * pool.length)] ?? 'shrug', now, 1.4);
    }
  }

  /* ---------- 风沙：贴着地面吹过去的沙粒（一粒一个像素点的 Custom 节点） ---------- */
  const leaves: { m: Custom; c: string; vy: number; ph: number; life: number; ground: number }[] = [];
  let leafT = 0;
  const { x0, x1, z0, z1 } = site.bounds;
  /** 一粒沙：1×1 缓冲像素（拉近时按精灵档位放大）；快消失时隔帧闪掉（像素版不做半透明） */
  const grain = (l: { c: string; life: number }) =>
    new Custom(
      (r: DrawContext, self: Custom) => {
        if (l.life < 1.5 && Math.floor(r.t * 12) % 3 === 0) return;
        const m = self.matrixWorld;
        const [sx, sy] = r.P(m[9] as number, m[10] as number, m[11] as number);
        const n = Math.max(1, r.spriteScale);
        r.rect(Math.round(sx), Math.round(sy), n, n, r.col(l.c));
      },
      { x0: -0.15, x1: 0.15, y0: 0, y1: 0.1, z0: -0.15, z1: 0.15 },
    );
  function spawnLeaf(): void {
    let l = leaves.find((q) => q.life <= 0);
    if (!l) {
      if (leaves.length >= 120) return;
      const rec = { c: SAND[leaves.length % SAND.length] as string, vy: 0, ph: 0, life: 0, ground: 0 };
      const m = grain(rec);
      d.world.scene.add(m);
      l = Object.assign(rec, { m });
      leaves.push(l);
    }
    const x = x0 + 4 + d.rnd() * (x1 - x0 - 8);
    const z = z0 + 4 + d.rnd() * (z1 - z0 - 8);
    l.ground = site.groundY(x, z) + 0.04;
    l.m.position.set(x, l.ground + 0.3 + d.rnd() * 1.2, z);
    l.vy = 0.15 + d.rnd() * 0.2;
    l.ph = d.rnd() * 6;
    l.life = 9;
    l.m.visible = true;
  }
  function updateLeaves(s: GameState, dt: number): void {
    const windy = s.weather === 'wind';
    const season = s.season === 'spring';
    if ((windy || season) && dt > 0) {
      leafT -= dt;
      if (leafT <= 0) {
        leafT = windy ? 0.05 : 0.3;
        spawnLeaf();
      }
    }
    const drift = windy ? 6 : 2.5;
    for (const l of leaves) {
      if (l.life <= 0) continue;
      l.life -= dt;
      const p = l.m.position;
      if (p.y > l.ground) {
        l.ph += dt * 3;
        p.y = Math.max(l.ground, p.y - l.vy * dt);
        p.x += (Math.sin(l.ph) * 0.6 + drift) * dt;
        p.z += Math.cos(l.ph * 0.7) * 0.4 * dt;
      }
      if (l.life <= 0) l.m.visible = false;
    }
  }

  let cur: GameState | null = null;
  let check = 0;
  let lastT: number | null = null;
  let real = 0;
  return {
    update(s, dt) {
      cur = s;
      check -= dt;
      real += dt;
      if (check <= 0) {
        check = 0.25;
        // 估一下现在的倍速；时间一下跳了很多（读档、调试跳天、暂停时快进）就不演走路
        if (lastT !== null) {
          const dT = s.t - lastT;
          if (dT < 0 || dT > Math.max(120, gmps * real * 6)) snap = true;
          else if (real > 0 && dT > 0) gmps += (Math.min(GMPS_MAX, dT / real) - gmps) * 0.3;
        }
        lastT = s.t;
        real = 0;
        syncCourts(s);
        syncWalkers(s);
        syncGuests(s);
        snap = false;
      }
      tickFades(dt);
      if (dt > 0) animGuests();
      updateLeaves(s, dt);
    },
    reset() {
      COURTS.forEach((_, i) => {
        const st = courts[i];
        st?.rally?.stop();
        if (st) {
          st.rally = null;
          st.want = false;
        }
      });
      for (const w of walkers) w.on = false;
      for (const g of guests) g.slot = '';
      for (const b of all) hideNow(b);
      check = 0;
      lastT = null;
      snap = true;
    },
  };
}
