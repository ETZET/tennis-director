// 一张图上的人怎么活（分图 clubvista 用；别的小图也能用，不绑任何场景）：
//   - 每个人有一天里在场的几段时间（windows，游戏分钟，clubsite/cast/presence.ts 的 visitWindows）。到点从图的出入口（gate）
//     走进来，到自己的位置（home：坐下 / 站着 / 打球），中间去兴趣点（poi：柜台、咖啡车、饮水点、空长椅）转一趟，到点走回出入口、消失。
//   - 没有固定位置的人（home = null）是路过的：进来 → 办一两件事（排队、坐一会儿）→ 从另一个口出去。
//   - 走路走导航网格（和总监同一张 NavMap：不穿墙、不下水）；最后半步"跨"到座位上（座位本身在挡路的家具里）。
//   - 状态只看时钟：换图回来、时钟跳了 → settle() 按这一刻该在哪直接摆好（换图不丢人）。
// 随机只用种子哈希（seed + 人位 + 天 + 第几段）；只决定画面（走哪个口、去哪个兴趣点），在场时段是 presence.ts 定的。
import * as THREE from 'three';
import type { VisitWindow } from '../cast/presence';
import { hashOf, mulberry32, type Rng } from '../cast/rng';
import { setStride, strideOf } from '../people';

export interface LifeSpot {
  x: number;
  z: number;
  /** 不贴地时的高度（泳池里、池沿） */
  y?: number;
  yaw: number;
  pose: string;
  prop?: string | null;
  seat?: readonly [number, number] | null;
  look?: readonly [number, number, number] | null;
}

export interface LifePerson {
  obj: THREE.Object3D;
  /** 人位的名字（演员表的 slot） */
  key: string;
  /** 固定位置；null = 路过的 */
  home: LifeSpot | null;
  /** 这一天在场的时段 */
  windows(day: number): readonly VisitWindow[];
  /** 当班的（员工）：优先走员工的口（LifeGate.staff），不去兴趣点闲逛 */
  staff?: boolean;
  /** 只走这几个口（不给 = 都行） */
  gates?: readonly string[];
  /** 走多快（米 / 秒，默认 1.35） */
  speed?: number;
}

export interface LifePoi {
  id: string;
  /** desk 柜台 · queue 排队买东西 · drink 饮水点 · sit 空座位 · look 站着看 */
  kind: 'desk' | 'queue' | 'drink' | 'sit' | 'look';
  spot: LifeSpot;
  /** 待多久（真实秒） */
  sec: readonly [number, number];
  /** 排队：后面的人沿这个方向一个个往后站（单位向量 × 间距），最多 n 个 */
  queue?: { dx: number; dz: number; n: number };
  /** 办完事手里多了什么（咖啡车：一杯） */
  gives?: string;
}

export interface LifeGate {
  id: string;
  x: number;
  z: number;
  /** 被挑中的权重（默认 1） */
  weight?: number;
  /** 员工的口（后门、球员通道） */
  staff?: boolean;
  /** 只进不出 / 只出不进 */
  dir?: 'in' | 'out';
}

export interface LifeNav {
  findPath(ax: number, az: number, bx: number, bz: number): [number, number][] | null;
  height(x: number, z: number): number | null;
  nearestFree(x: number, z: number, maxR?: number): [number, number] | null;
}

export type LifeEventType = 'spawn' | 'sit' | 'unsit' | 'gone' | 'served';
export interface LifeEvent {
  type: LifeEventType;
  actor: LifeActor;
  spot?: LifeSpot;
  poi?: LifePoi;
  gate?: LifeGate;
}

type Step =
  | { t: 'go'; x: number; z: number }
  | { t: 'sit'; spot: LifeSpot; poi?: LifePoi; home?: boolean }
  | { t: 'stay'; sec?: number; until?: number }
  | { t: 'queue'; poi: LifePoi }
  | { t: 'out'; gate: LifeGate }
  | { t: 'call'; fn: (a: LifeActor) => void };

export interface LifeActor {
  readonly person: LifePerson;
  readonly obj: THREE.Object3D;
  /** away 不在图上 · walk 在走 · hop 最后半步（上座 / 下座）· stay 待着 · queue 排队 */
  state: 'away' | 'walk' | 'hop' | 'stay' | 'queue';
  x: number;
  z: number;
  yaw: number;
  /** 现在占着的位置（坐着 / 站着的那个点） */
  spot: LifeSpot | null;
  poi: LifePoi | null;
  /** 这一趟的时段 */
  win: VisitWindow | null;
  /** 外面按住他（干活的演出：等总监来拿行李）：plan 不往下走 */
  hold: boolean;
  /** 走着没挪地方的秒数（验收：卡住） */
  still: number;
  /** 这一趟从哪个口进来的 */
  gateIn: LifeGate | null;
}

interface Act extends LifeActor {
  plan: Step[];
  rng: Rng;
  ph: number;
  pts: [number, number][];
  cum: number[];
  s: number;
  hopT: number;
  hopFrom: [number, number, number];
  hopTo: LifeSpot | null;
  hopSit: Extract<Step, { t: 'sit' }> | null;
  sec: number;
  until: number;
  /** 用过的时段（天 × 10000 + 开始的分钟） */
  used: number;
  tripT: number;
  yield: number;
  y: number;
  qi: number;
  lost: number;
  /** 这个人走路快慢（0.85..1.15）：一排人不再一个速度 */
  pace: number;
  /** 再走多少米考虑停一下（张望） */
  lookIn: number;
  /** 正停着张望的剩余秒数 */
  pauseT: number;
  pauseYaw: number;
}

export interface MapLifeOpts {
  id: string;
  seed: number;
  people: readonly LifePerson[];
  pois: readonly LifePoi[];
  gates: readonly LifeGate[];
  nav(): LifeNav;
  groundAt(x: number, z: number): number;
  /** 现在第几天、几分（分钟带小数） */
  clock(): { day: number; minute: number };
  director?: THREE.Object3D;
  on?(ev: LifeEvent): void;
  /** 没地方可去的路过的人走到这些点里的一个、站一会儿再走（图的入口点：不然只有一个出口的图上，人进来就走） */
  wander?: readonly [number, number][];
}

export interface MapLife {
  readonly actors: readonly LifeActor[];
  step(dt: number): void;
  /** 按这一刻该在哪直接摆好（进这张图、时钟跳了） */
  settle(): void;
  /** 在场的人（看得见的） */
  present(): LifeActor[];
  /** 在场的人的挡路圆（总监绕着走） */
  circles(): { x: number; z: number; r: number }[];
  /** 让一个待着的人马上去别处：走到 (x, z) 待 sec 秒（给了 pose = 摆这个姿势，例如对着发球机练），然后接着原来的打算 */
  send(
    a: LifeActor,
    x: number,
    z: number,
    sec: number,
    yaw?: number,
    pose?: { pose: string; prop?: string | null },
  ): void;
  /** 让他现在就离开（走到出口） */
  dismiss(a: LifeActor): void;
  debug(): {
    key: string;
    state: string;
    x: number;
    z: number;
    y: number;
    still: number;
    pose: string;
    hold: boolean;
  }[];
  stats: { pathFail: number; spawned: number; left: number };
}

const WALK = 1.35;
const HOP = 0.4;
const SEAT0: [number, number] = [0.52, 0];
/** 平常的时钟：2 游戏分钟 / 真实秒（daylight 的 tspeed 120）；比这快多少倍，人就走快多少倍（最多 8 倍） */
const NORMAL_RATE = 2;

export function createMapLife(o: MapLifeOpts): MapLife {
  const stats = { pathFail: 0, spawned: 0, left: 0 };
  const occupied = new Map<LifeSpot, Act>();
  const queues = new Map<LifePoi, Act[]>();
  const tv = new THREE.Vector3();
  let rate = NORMAL_RATE;
  let fast = 1;

  const actors: Act[] = o.people.map((person) => ({
    person,
    obj: person.obj,
    state: 'away',
    x: person.home?.x ?? 0,
    z: person.home?.z ?? 0,
    y: 0,
    yaw: person.home?.yaw ?? 0,
    spot: null,
    poi: null,
    win: null,
    hold: false,
    still: 0,
    gateIn: null,
    plan: [],
    rng: mulberry32(hashOf(o.seed, o.id, person.key)),
    ph: 0,
    pts: [],
    cum: [],
    s: 0,
    hopT: 0,
    hopFrom: [0, 0, 0],
    hopTo: null,
    hopSit: null,
    sec: 0,
    until: -1,
    used: -1,
    tripT: 0,
    yield: 0,
    qi: -1,
    lost: 0,
    pace: 1,
    lookIn: 6,
    pauseT: 0,
    pauseYaw: 0,
  }));
  for (const a of actors) {
    a.obj.visible = false;
    a.pace = 0.85 + a.rng() * 0.3;
    a.lookIn = 4 + a.rng() * 10;
  }

  const emit = (type: LifeEventType, actor: Act, extra: Partial<LifeEvent> = {}) => o.on?.({ type, actor, ...extra });
  const ud = (a: Act) => a.obj.userData;
  const groundY = (x: number, z: number) => o.nav().height(x, z) ?? o.groundAt(x, z);

  function place(a: Act) {
    a.obj.position.set(a.x, a.y, a.z);
    a.obj.rotation.y = a.yaw;
  }
  function setPose(a: Act, spot: LifeSpot | null) {
    const u = ud(a);
    if (spot) {
      if (spot.prop !== undefined) u.setProp?.(spot.prop);
      u.setSeat?.(...(spot.seat ?? SEAT0));
      // 坐、喝是循环的姿势（自己动）；别的摆在一个相位上，由人物的 update 呼吸
      if (spot.pose === 'idle') u.pose?.('idle');
      else if (spot.pose === 'sit' || spot.pose === 'sip' || spot.pose === 'drinkTap' || spot.pose === 'clap')
        u.pose?.(spot.pose === 'sit' && u.prop?.() === 'cup' ? 'sip' : spot.pose);
      else u.pose?.(spot.pose, 0.3);
      u.lookAt?.(spot.look ? tv.set(spot.look[0], spot.look[1], spot.look[2]) : null);
    } else {
      u.setSeat?.(...SEAT0);
      u.lookAt?.(null);
    }
  }
  function freeSpot(a: Act) {
    if (a.spot) {
      if (occupied.get(a.spot) === a) occupied.delete(a.spot);
      emit('unsit', a, { spot: a.spot, poi: a.poi ?? undefined });
    }
    if (a.poi) {
      const q = queues.get(a.poi);
      if (q) {
        const i = q.indexOf(a);
        if (i >= 0) q.splice(i, 1);
      }
    }
    a.spot = null;
    a.poi = null;
    a.qi = -1;
  }
  function vanish(a: Act) {
    freeSpot(a);
    // 预定了还没走到的位置也放掉
    for (const [k, v] of occupied) if (v === a) occupied.delete(k);
    a.state = 'away';
    a.plan = [];
    a.win = null;
    a.hold = false;
    a.obj.visible = false;
    a.still = 0;
  }

  // ── 口 ──
  function pickGate(a: Act, dir: 'in' | 'out', avoid: LifeGate | null): LifeGate {
    let list = o.gates.filter((g) => (!g.dir || g.dir === dir) && (!a.person.gates || a.person.gates.includes(g.id)));
    if (!list.length) list = o.gates.slice();
    if (a.person.staff && list.some((g) => g.staff)) list = list.filter((g) => g.staff);
    else if (list.some((g) => !g.staff)) list = list.filter((g) => !g.staff);
    if (avoid && list.length > 1 && a.rng() < 0.7) list = list.filter((g) => g !== avoid);
    let total = 0;
    for (const g of list) total += g.weight ?? 1;
    let x = a.rng() * total;
    for (const g of list) {
      x -= g.weight ?? 1;
      if (x < 0) return g;
    }
    return list[list.length - 1];
  }

  // ── 打算 ──
  function freePois(kinds: readonly LifePoi['kind'][]): LifePoi[] {
    return o.pois.filter((p) => {
      if (!kinds.includes(p.kind)) return false;
      if (p.queue) return (queues.get(p)?.length ?? 0) < p.queue.n;
      return !occupied.has(p.spot);
    });
  }
  const secOf = (a: Act, p: LifePoi) => p.sec[0] + a.rng() * (p.sec[1] - p.sec[0]);
  function visitPoi(a: Act, p: LifePoi): Step[] {
    if (p.queue) return [{ t: 'queue', poi: p }];
    // 先占上（别人不再挑它）
    occupied.set(p.spot, a);
    return [
      { t: 'go', x: p.spot.x, z: p.spot.z },
      { t: 'sit', spot: p.spot, poi: p },
      { t: 'stay', sec: secOf(a, p) },
    ];
  }
  function flowPlan(a: Act, gate: LifeGate): Step[] {
    const plan: Step[] = [];
    const errands = freePois(['desk', 'queue']);
    if (errands.length && a.rng() < 0.85) plan.push(...visitPoi(a, errands[Math.floor(a.rng() * errands.length)]));
    const rests = freePois(['sit', 'drink', 'look']);
    if (rests.length && a.rng() < 0.6) plan.push(...visitPoi(a, rests[Math.floor(a.rng() * rests.length)]));
    if (!plan.length && o.wander?.length) {
      const w = o.wander[Math.floor(a.rng() * o.wander.length)];
      plan.push(
        { t: 'go', x: w[0] + (a.rng() - 0.5) * 2, z: w[1] + (a.rng() - 0.5) * 2 },
        { t: 'stay', sec: 3 + a.rng() * 5 },
      );
    }
    plan.push({ t: 'out', gate: pickGate(a, 'out', gate) });
    return plan;
  }
  function homePlan(a: Act, w: VisitWindow): Step[] {
    const h = a.person.home as LifeSpot;
    return [
      { t: 'go', x: h.x, z: h.z },
      { t: 'sit', spot: h, home: true },
      { t: 'stay', until: w[1] },
      { t: 'out', gate: pickGate(a, 'out', null) },
    ];
  }
  const nextTrip = (a: Act) => 22 + a.rng() * 40;

  function begin(a: Act, w: VisitWindow, day: number, forced?: { gate: LifeGate; dx: number; dz: number }) {
    a.used = day * 10000 + w[0];
    a.win = w;
    const gate = forced?.gate ?? pickGate(a, 'in', null);
    a.gateIn = gate;
    const at = o.nav().nearestFree(gate.x + (forced?.dx ?? 0), gate.z + (forced?.dz ?? 0), 4) ?? [gate.x, gate.z];
    a.x = at[0];
    a.z = at[1];
    a.y = groundY(a.x, a.z);
    const tx = a.person.home?.x ?? a.x;
    const tz = a.person.home?.z ?? a.z + 1;
    a.yaw = Math.atan2(tx - a.x, tz - a.z);
    a.obj.visible = true;
    a.state = 'stay';
    a.sec = 0;
    a.until = -1;
    a.hold = false;
    a.still = 0;
    ud(a).setSeat?.(...SEAT0);
    ud(a).lookAt?.(null);
    if (!a.person.home) ud(a).setProp?.(null);
    else if (a.person.home.prop !== undefined)
      ud(a).setProp?.(a.person.home.prop === 'cup' ? null : a.person.home.prop);
    ud(a).pose?.('idle');
    place(a);
    a.plan = a.person.home ? homePlan(a, w) : flowPlan(a, gate);
    a.tripT = nextTrip(a);
    stats.spawned++;
    emit('spawn', a, { gate });
  }

  /** 已经在位置上（进图那一刻、时钟跳了以后） */
  function seatAt(a: Act, w: VisitWindow, day: number) {
    const h = a.person.home as LifeSpot;
    a.used = day * 10000 + w[0];
    a.win = w;
    a.x = h.x;
    a.z = h.z;
    a.y = h.y ?? o.groundAt(h.x, h.z);
    a.yaw = h.yaw;
    a.spot = h;
    occupied.set(h, a);
    a.obj.visible = true;
    setPose(a, h);
    place(a);
    a.state = 'stay';
    a.sec = 0;
    a.until = w[1];
    a.plan = [{ t: 'out', gate: pickGate(a, 'out', null) }];
    a.tripT = nextTrip(a) * a.rng();
    a.hold = false;
    a.still = 0;
  }

  /**
   * 接驳车到站（权重大的口）：接下来 40 分钟里要来的路过的人一起下车，站开一步，各走各的（一车人，不是一个一个冒出来）
   */
  function groupWith(lead: Act, day: number, minute: number) {
    let k = 0;
    for (const b of actors) {
      if (k >= 3) break;
      if (b === lead || b.state !== 'away' || b.person.home || b.person.staff) continue;
      const w = b.person.windows(day).find((x) => x[0] > minute && x[0] < minute + 40 && b.used !== day * 10000 + x[0]);
      if (!w) continue;
      k++;
      const side = k % 2 ? 1 : -1;
      begin(b, w, day, { gate: lead.gateIn as LifeGate, dx: side * 0.7 * Math.ceil(k / 2), dz: 0.3 * k });
    }
  }

  function windowAt(a: Act, day: number, minute: number): VisitWindow | null {
    for (const w of a.person.windows(day)) if (minute >= w[0] && minute < w[1]) return w;
    return null;
  }

  let lastDay = -1;
  let lastMin = -1;
  function settle() {
    const { day, minute } = o.clock();
    lastDay = day;
    lastMin = minute;
    occupied.clear();
    queues.clear();
    for (const a of actors) {
      a.spot = null;
      a.poi = null;
      vanish(a);
      a.used = -1;
    }
    for (const a of actors) {
      const w = windowAt(a, day, minute);
      if (!w) continue;
      if (a.person.home) seatAt(a, w, day);
      // 路过的：这一趟刚开始没多久的照常从口进来；早开始的当他已经走了
      else if (minute - w[0] > 6) a.used = day * 10000 + w[0];
    }
  }

  // ── 走 ──
  function setRoute(a: Act, pts: [number, number][]) {
    a.pts = pts;
    a.cum = [0];
    for (let i = 1; i < pts.length; i++)
      a.cum.push(a.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    a.s = 0;
    a.state = 'walk';
    a.yield = 0;
    setStride(a.obj);
  }
  function startGo(a: Act, x: number, z: number): boolean {
    const nav = o.nav();
    // 起点在座位上（挡路的家具里）：从旁边能站的点起步，第一段是从座位上下来
    const from = nav.height(a.x, a.z) === null ? nav.nearestFree(a.x, a.z, 2) : null;
    const path = nav.findPath(from?.[0] ?? a.x, from?.[1] ?? a.z, x, z);
    if (!path?.length) {
      stats.pathFail++;
      return false;
    }
    const pts: [number, number][] = [[a.x, a.z]];
    if (from) pts.push(from);
    for (const p of path) {
      const l = pts[pts.length - 1];
      if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.05) pts.push([p[0], p[1]]);
    }
    if (pts.length < 2) return true;
    freeSpot(a);
    setPose(a, null);
    setRoute(a, pts);
    return true;
  }
  const turn = (from: number, to: number, k: number) => {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return from + d * Math.min(1, k);
  };
  function walk(a: Act, dt: number): boolean {
    const len = a.cum[a.cum.length - 1] ?? 0;
    // 停下来张望一下（快进时不停）：转头看一眼，再接着走
    if (a.pauseT > 0) {
      a.pauseT -= dt * fast;
      a.yaw = turn(a.yaw, a.pauseYaw, dt * 4);
      place(a);
      return false;
    }
    if (a.lookIn <= 0) {
      a.lookIn = 6 + a.rng() * 12;
      if (fast < 1.5 && len - a.s > 3 && a.rng() < 0.35) {
        a.pauseT = 0.6 + a.rng() * 0.9;
        a.pauseYaw = a.yaw + (a.rng() < 0.5 ? -1 : 1) * (0.5 + a.rng() * 0.6);
        ud(a).pose?.('idle');
        return false;
      }
    }
    const v = (a.person.speed ?? WALK) * a.pace * fast;
    // 前面半米是总监：停一下（1.5 秒以后挤过去）
    const D = o.director;
    if (D && a.yield < 1.5) {
      const dx = D.position.x - a.x;
      const dz = D.position.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.8 && dx * Math.sin(a.yaw) + dz * Math.cos(a.yaw) > 0.2) {
        a.yield += dt;
        a.still += dt;
        ud(a).pose?.('idle');
        return false;
      }
    }
    const s = Math.min(len, a.s + v * dt);
    const step = s - a.s;
    a.s = s;
    a.lookIn -= step;
    let i = 1;
    while (i < a.cum.length - 1 && a.cum[i] < s) i++;
    const p0 = a.pts[i - 1];
    const p1 = a.pts[i];
    const seg = a.cum[i] - a.cum[i - 1] || 1;
    const k = (s - a.cum[i - 1]) / seg;
    a.x = p0[0] + (p1[0] - p0[0]) * k;
    a.z = p0[1] + (p1[1] - p0[1]) * k;
    a.y = groundY(a.x, a.z);
    a.yaw = turn(a.yaw, Math.atan2(p1[0] - p0[0], p1[1] - p0[1]), dt * 9);
    a.ph = (a.ph + step / strideOf(a.obj)) % 1;
    ud(a).pose?.('walk', a.ph);
    a.still = step > 1e-4 ? 0 : a.still + dt;
    if (step > 1e-4) a.yield = Math.max(0, a.yield - dt * 0.5);
    place(a);
    return s >= len - 1e-4;
  }
  function startHop(a: Act, st: Extract<Step, { t: 'sit' }>) {
    a.state = 'hop';
    a.hopT = 0;
    a.hopFrom = [a.x, a.y, a.z];
    a.hopTo = st.spot;
    a.hopSit = st;
  }
  function hop(a: Act, dt: number): boolean {
    const to = a.hopTo as LifeSpot;
    a.hopT += dt;
    const k = Math.min(1, a.hopT / HOP);
    const ty = to.y ?? o.groundAt(to.x, to.z);
    a.x = a.hopFrom[0] + (to.x - a.hopFrom[0]) * k;
    a.y = a.hopFrom[1] + (ty - a.hopFrom[1]) * k;
    a.z = a.hopFrom[2] + (to.z - a.hopFrom[2]) * k;
    a.yaw = turn(a.yaw, to.yaw, dt * 12);
    place(a);
    if (k < 1) return false;
    a.yaw = to.yaw;
    place(a);
    return true;
  }

  // ── 排队 ──
  function queuePos(p: LifePoi, i: number): [number, number] {
    const q = p.queue as NonNullable<LifePoi['queue']>;
    return [p.spot.x + q.dx * i, p.spot.z + q.dz * i];
  }
  function stepQueue(a: Act, dt: number): boolean {
    const p = a.poi as LifePoi;
    const q = queues.get(p) as Act[];
    const i = q.indexOf(a);
    if (i !== a.qi) {
      // 往前挪一格：直着走过去
      a.qi = i;
      const [tx, tz] = queuePos(p, i);
      if (Math.hypot(tx - a.x, tz - a.z) > 0.05) {
        a.pts = [
          [a.x, a.z],
          [tx, tz],
        ];
        a.cum = [0, Math.hypot(tx - a.x, tz - a.z)];
        a.s = 0;
      } else a.pts = [];
    }
    if (a.pts.length) {
      const len = a.cum[1];
      const s = Math.min(len, a.s + WALK * 0.8 * fast * dt);
      const step = s - a.s;
      a.s = s;
      const k = len > 0 ? s / len : 1;
      a.x = a.pts[0][0] + (a.pts[1][0] - a.pts[0][0]) * k;
      a.z = a.pts[0][1] + (a.pts[1][1] - a.pts[0][1]) * k;
      a.y = groundY(a.x, a.z);
      a.ph = (a.ph + step / strideOf(a.obj)) % 1;
      ud(a).pose?.('walk', a.ph);
      a.yaw = turn(a.yaw, Math.atan2(a.pts[1][0] - a.pts[0][0], a.pts[1][1] - a.pts[0][1]), dt * 9);
      place(a);
      if (s >= len - 1e-4) {
        a.pts = [];
        ud(a).pose?.('idle');
      }
      return false;
    }
    a.yaw = turn(a.yaw, p.spot.yaw, dt * 8);
    place(a);
    if (i > 0) return false;
    // 排到了：办事
    a.sec -= dt * fast;
    if (a.sec > 0) return false;
    if (p.gives) ud(a).setProp?.(p.gives);
    emit('served', a, { poi: p });
    return true;
  }

  // ── 一步 ──
  function advance(a: Act, minute: number) {
    // 当前这一步做完了：取下一步
    while (true) {
      const st = a.plan.shift();
      if (!st) {
        // 没有打算了：路过的走人；有位置的待到点
        if (a.win && minute < a.win[1] && a.person.home && a.spot === a.person.home) {
          a.state = 'stay';
          a.until = a.win[1];
          a.sec = 0;
          a.plan = [{ t: 'out', gate: pickGate(a, 'out', null) }];
          return;
        }
        a.plan = [{ t: 'out', gate: pickGate(a, 'out', a.gateIn) }];
        continue;
      }
      if (st.t === 'call') {
        st.fn(a);
        // 回调把他送去排队 / 送走了：这一步到此为止
        if (a.state === 'queue' || a.state === 'away') return;
        continue;
      }
      if (st.t === 'go') {
        if (!startGo(a, st.x, st.z)) {
          a.lost++;
          const nx = a.plan[0];
          // 走不到自己的位置（位置在水里、台子上，离能走的地方太远）：直接出现在位置上
          if (nx?.t === 'sit' && nx.home) {
            a.x = nx.spot.x;
            a.z = nx.spot.z;
            a.y = nx.spot.y ?? o.groundAt(a.x, a.z);
            continue;
          }
          // 别的走不到：这一趟不演了（藏起来，不穿墙）
          vanish(a);
          return;
        }
        if (a.state === 'walk') return;
        continue;
      }
      if (st.t === 'sit') {
        startHop(a, st);
        return;
      }
      if (st.t === 'stay') {
        a.state = 'stay';
        a.sec = st.sec ?? 0;
        a.until = st.until ?? -1;
        if (!a.spot) ud(a).pose?.('idle');
        return;
      }
      if (st.t === 'queue') {
        const q = queues.get(st.poi) ?? [];
        queues.set(st.poi, q);
        if (q.length >= (st.poi.queue?.n ?? 1)) continue; // 队满了：不排了
        q.push(a);
        const [tx, tz] = queuePos(st.poi, q.length - 1);
        a.plan.unshift({
          t: 'call',
          fn: (b) => {
            const act = b as Act;
            act.state = 'queue';
            act.poi = st.poi;
            act.qi = -1;
            act.pts = [];
            act.sec = secOf(act, st.poi);
          },
        });
        if (!startGo(a, tx, tz)) {
          q.splice(q.indexOf(a), 1);
          a.plan.shift();
          continue;
        }
        if (a.state === 'walk') return;
        continue;
      }
      // out
      if (!startGo(a, st.gate.x, st.gate.z) || a.state !== 'walk') {
        stats.left++;
        emit('gone', a, { gate: st.gate });
        vanish(a);
        return;
      }
      a.plan.unshift({
        t: 'call',
        fn: (b) => {
          stats.left++;
          emit('gone', b as Act, { gate: st.gate });
          vanish(b as Act);
        },
      });
      return;
    }
  }

  function trip(a: Act) {
    // 有位置的人待久了去转一趟：饮水点、柜台、咖啡车……回来接着待
    const h = a.person.home as LifeSpot;
    const list = freePois(a.person.staff ? ['drink'] : ['drink', 'queue', 'look', 'desk']);
    if (!list.length) return;
    const p = list[Math.floor(a.rng() * list.length)];
    const until = a.until;
    a.plan = [
      ...visitPoi(a, p),
      { t: 'go', x: h.x, z: h.z },
      { t: 'sit', spot: h, home: true },
      { t: 'stay', until },
      ...a.plan,
    ];
    a.until = -1;
    a.sec = 0;
  }

  function step(dt: number) {
    const { day, minute } = o.clock();
    // 时钟走多快（游戏分钟 / 真实秒，平滑）：快进时人走得快、待得短（像延时摄影），不然一趟路走完半天过去了
    if (day === lastDay && dt > 0) {
      const r = Math.max(0, Math.min(200, (minute - lastMin) / dt));
      rate += (r - rate) * Math.min(1, dt * 2);
    }
    fast = Math.min(8, Math.max(1, rate / NORMAL_RATE));
    if (day !== lastDay || minute < lastMin - 1 || minute > lastMin + 45) settle();
    lastDay = day;
    lastMin = minute;
    for (const a of actors) {
      if (a.state === 'away') {
        const w = windowAt(a, day, minute);
        if (w && a.used !== day * 10000 + w[0]) {
          begin(a, w, day);
          if (!a.person.home && a.gateIn && (a.gateIn.weight ?? 1) >= 3) groupWith(a, day, minute);
        }
        if (a.state === 'away') continue;
      }
      if (a.hold) {
        a.still = 0;
        continue;
      }
      if (a.state === 'walk') {
        if (walk(a, dt)) {
          ud(a).pose?.('idle');
          advance(a, minute);
        }
      } else if (a.state === 'hop') {
        if (hop(a, dt)) {
          const st = a.hopSit as Extract<Step, { t: 'sit' }>;
          a.spot = st.spot;
          a.poi = st.poi ?? null;
          occupied.set(st.spot, a);
          setPose(a, st.spot);
          emit('sit', a, { spot: st.spot, poi: st.poi });
          advance(a, minute);
        }
      } else if (a.state === 'queue') {
        if (stepQueue(a, dt)) {
          freeSpot(a);
          advance(a, minute);
        }
      } else {
        // stay
        if (a.until >= 0) {
          if (minute >= a.until) advance(a, minute);
          else if (a.person.home && a.spot === a.person.home && !a.person.staff) {
            a.tripT -= dt * fast;
            if (a.tripT <= 0) {
              a.tripT = nextTrip(a) + 20;
              // 快到点了不去；一半的时候去
              if (a.until - minute > 25 && a.rng() < 0.5) {
                trip(a);
                advance(a, minute);
              }
            }
          }
        } else {
          a.sec -= dt * fast;
          if (a.sec <= 0) advance(a, minute);
        }
      }
    }
  }

  return {
    actors,
    step,
    settle,
    stats,
    present: () => actors.filter((a) => a.state !== 'away'),
    circles: () => actors.filter((a) => a.state !== 'away').map((a) => ({ x: a.x, z: a.z, r: 0.3 })),
    send(actor, x, z, sec, yaw, pose) {
      const a = actor as Act;
      const back: Step[] = [];
      if (a.state === 'stay' && a.until >= 0) back.push({ t: 'stay', until: a.until });
      else if (a.state === 'stay' && a.sec > 0) back.push({ t: 'stay', sec: a.sec });
      const home = a.person.home;
      const ret: Step[] =
        home && a.spot === home
          ? [
              { t: 'go', x: home.x, z: home.z },
              { t: 'sit', spot: home, home: true },
            ]
          : [];
      const there: Step[] = pose
        ? [{ t: 'sit', spot: { x, z, yaw: yaw ?? a.yaw, pose: pose.pose, prop: pose.prop, seat: null } }]
        : [
            {
              t: 'call',
              fn: (b) => {
                if (yaw !== undefined) (b as Act).yaw = yaw;
                place(b as Act);
              },
            },
          ];
      a.plan = [{ t: 'go', x, z }, ...there, { t: 'stay', sec }, ...ret, ...back, ...a.plan];
      a.hold = false;
      a.until = -1;
      a.sec = 0;
      advance(a, o.clock().minute);
    },
    dismiss(actor) {
      const a = actor as Act;
      a.plan = [{ t: 'out', gate: pickGate(a, 'out', a.gateIn) }];
      a.hold = false;
      a.until = -1;
      a.sec = 0;
      if (a.state === 'stay' || a.state === 'queue') {
        freeSpot(a);
        advance(a, o.clock().minute);
      }
    },
    debug: () =>
      actors.map((a) => ({
        key: a.person.key,
        state: a.state,
        x: a.x,
        z: a.z,
        y: a.y,
        still: a.still,
        pose: (ud(a).poseName?.() as string | undefined) ?? '',
        hold: a.hold,
      })),
  };
}
