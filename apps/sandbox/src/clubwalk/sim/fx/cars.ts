// 车来车去（第一轮评审「要补的画面」4、问题 11）：观察模式里停车场的车按引擎摆 —— 每伙开车来的人一辆车。
//   来：到之前从东边的车道开进来（进出口 → 通道 → 车头朝里停进一个空车位），一停下车门打开，人站在车门边（引擎的"刚到"），
//       走开以后车门关上；
//   走：这伙人走回自己的车（去停车场的那段路的终点换成自己的车门），上车（引擎的"回家"）→ 倒出车位、开出去、从车道往东出画；
//   落客点（代客 / 送人）：车停在落客点，人从两边下车；大人来的车由代客开去南停车场停好，走的时候代客先把车开回落客点；
//       只是把孩子放下的车直接开走，接的时候再从东边开来。
//   停车场满了：这伙人没有车（停在路边更远的地方），从车道东头走进来、走回去。
// 场景自己的车（clubpark 的停着的车、life.ts 开来开去的车）在观察时藏起来，关掉观察放回来。
// 车的时间按游戏分钟走（加速就开得快），开一趟用的游戏分钟按"真实 3 秒左右"定：drive = clamp(3 秒 × 加速档, 0.6, 8)。
// 车只在取景附近建（clubpark 的 car / suv，一辆 5 个 draw call）；远的只算时间表。
import * as THREE from 'three';
import { AISLE_Z, CAR_EDGE_X, ENTRY, SPOTS as PARK_SPOTS, ROWS, STALL, stallCenter } from '../../../clubpark/layout';
import { CAR_PAINTS } from '../../../clubpark/palette';
import type { Agent, AgentId, PlaceId, SimState } from '../../../clubsite/sim/types';
import { type FxActor, type FxFrame, type FxKits, type FxPart, hashOf, inRect } from './util';

type V2 = [number, number];
const LANE = 1.1;
/** 车道：往西开（进来）的车道、往东开（出去）的车道 */
const IN_Z = PARK_SPOTS.edgeIn[1];
const OUT_Z = PARK_SPOTS.edgeOut[1];
const EDGE = CAR_EDGE_X;
const GAP_X = (ENTRY.x0 + ENTRY.x1) / 2;
const DROP = PARK_SPOTS.dropoff as V2;
/** 落客区掉头的那一列（大门外的连锁砖院子 x 60.4–64.9） */
const UTURN_X = 63.2;
/** 车位满了的人：车停在路边更远的地方，从车道东头的人行道走进来 */
const SHOULDER: V2[] = [
  [94, 3.6],
  [96, -3.6],
  [98, 3.6],
  [100, -3.6],
  [102, 3.6],
  [104, -3.6],
];
const ENTRIES = new Set<PlaceId>(['park.lotN', 'park.lotS', 'park.valet']);
const STAFF = new Set(['staff', 'coach', 'vendor']);

interface Stall {
  id: string;
  lot: 'n' | 's';
  row: number;
  c: V2;
  /** 车头朝哪边（停好以后）：−1 北、+1 南 */
  nose: -1 | 1;
  aisleZ: number;
  unit: string | null;
}

/** 一条路：折线圆角 + 按弧长取点；rev = 倒车（车头朝运动的反方向） */
interface Path {
  pts: V2[];
  cum: number[];
  len: number;
  rev: boolean;
}

interface Drive {
  paths: Path[];
  len: number;
  t0: number;
  dur: number;
}

interface Unit {
  key: string;
  lead: AgentId;
  entry: PlaceId;
  stall: Stall | null;
  shoulder: V2;
  kind: 'car' | 'suv';
  paint: number;
  /** 'in' 开进来 · 'drop' 停在落客点 · 'valet' 代客开去车位 · 'parked' 停着 · 'fetch' 代客开回落客点 · 'out' 开走 */
  phase: 'in' | 'drop' | 'valet' | 'parked' | 'fetch' | 'out';
  drive: Drive | null;
  /** 停着的位置和朝向（车头朝向的 yaw，同 rotation.y） */
  x: number;
  z: number;
  rot: number;
  /** 这一帧的速度（米 / 真实秒，轮子转）、在倒车 */
  v: number;
  rev: boolean;
  car: Car | null;
  /** 车门开着（有人在车边上下车） */
  door: boolean;
  /** 停在落客点的第几个位置（0 = 门口那个） */
  slot: number;
  /** 代客已经把车开回来接人了（别再开回车位） */
  fetched: boolean;
  /** 送孩子的车（放下就走，接的时候再来） */
  dropOnly: boolean;
  seen: boolean;
}

interface Car {
  obj: THREE.Object3D;
  kind: 'car' | 'suv';
  door: boolean;
}

// ── 路 ──
function mkPath(raw: V2[], rev = false, r = 2.6): Path {
  const pts: V2[] = [raw[0]];
  for (let i = 1; i < raw.length - 1; i++) {
    const [a, b, c] = [raw[i - 1], raw[i], raw[i + 1]];
    const li = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lo = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const rr = Math.min(r, li / 2, lo / 2);
    if (rr < 0.05) {
      pts.push(b);
      continue;
    }
    const p0: V2 = [b[0] - ((b[0] - a[0]) / li) * rr, b[1] - ((b[1] - a[1]) / li) * rr];
    const p2: V2 = [b[0] + ((c[0] - b[0]) / lo) * rr, b[1] + ((c[1] - b[1]) / lo) * rr];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const w0 = (1 - u) * (1 - u);
      const w1 = 2 * u * (1 - u);
      const w2 = u * u;
      pts.push([w0 * p0[0] + w1 * b[0] + w2 * p2[0], w0 * p0[1] + w1 * b[1] + w2 * p2[1]]);
    }
  }
  pts.push(raw[raw.length - 1]);
  return finish(pts, rev);
}
function bezier(p0: V2, c1: V2, c2: V2, p3: V2, rev: boolean): Path {
  const pts: V2[] = [];
  for (let k = 0; k <= 16; k++) {
    const u = k / 16;
    const a = (1 - u) ** 3;
    const b = 3 * u * (1 - u) ** 2;
    const c = 3 * u * u * (1 - u);
    const d = u ** 3;
    pts.push([a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]]);
  }
  return finish(pts, rev);
}
function finish(pts: V2[], rev: boolean): Path {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1], rev };
}
/** 路上第 s 米：位置 + 车头朝向（rotation.y：车头 = 本地 −z） */
function at(p: Path, s: number, out: { x: number; z: number; rot: number }) {
  const t = Math.min(Math.max(s, 0), p.len);
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < t) i++;
  const a = p.pts[i - 1];
  const b = p.pts[i];
  const seg = p.cum[i] - p.cum[i - 1] || 1;
  const u = (t - p.cum[i - 1]) / seg;
  out.x = a[0] + (b[0] - a[0]) * u;
  out.z = a[1] + (b[1] - a[1]) * u;
  let dx = b[0] - a[0];
  let dz = b[1] - a[1];
  if (p.rev) {
    dx = -dx;
    dz = -dz;
  }
  if (Math.hypot(dx, dz) > 1e-5) out.rot = Math.atan2(-dx, -dz);
  return out;
}

/** 开一趟要多少游戏分钟：真实 3 秒左右（2× = 6 分钟），快进时最多 8 分钟（一晃而过） */
const driveMin = (speed: number) => THREE.MathUtils.clamp(3 * speed, 0.6, 8);
/** 一趟里第 f（0..1）时走到多远（0..1）：起步加速、到了减速 */
function ease(f: number) {
  const a = 0.18;
  const d = 0.3;
  const v = 1 / (1 - a / 2 - d / 2);
  if (f < a) return (v * f * f) / (2 * a);
  if (f < 1 - d) return v * (a / 2 + (f - a));
  const g = 1 - f;
  return 1 - (v * g * g) / (2 * d);
}

// ── 车位 ──
const STALLS: Stall[] = ROWS.flatMap((row, ri) => {
  const out: Stall[] = [];
  for (let i = 0; i < STALL.n; i++) {
    if (row.gap && i >= row.gap[0] && i <= row.gap[1]) continue;
    const c = stallCenter(row, i) as V2;
    out.push({
      id: `${row.id}-${i}`,
      lot: ri < 2 ? 'n' : 's',
      row: ri,
      c,
      nose: row.nose,
      aisleZ: ri < 2 ? AISLE_Z.n : AISLE_Z.s,
      unit: null,
    });
  }
  return out;
});

/** 从车道东头开进车位（车头朝里） */
function pathIn(st: Stall): Path[] {
  const north = st.lot === 'n';
  const gx = GAP_X + (north ? LANE : -LANE);
  const west = st.c[0] < gx;
  const lane = st.aisleZ + (west ? -LANE : LANE) * (north ? 1 : -1);
  return [
    mkPath([
      [EDGE, IN_Z],
      [gx, IN_Z],
      [gx, lane],
      [st.c[0], lane],
      [st.c[0], st.c[1]],
    ]),
  ];
}
/** 倒出车位（车尾朝离出口远的那边甩）→ 通道 → 进出口 → 往东的车道 → 出画 */
function pathOut(st: Stall): Path[] {
  const north = st.lot === 'n';
  const gx = GAP_X + (north ? -LANE : LANE);
  const d = Math.sign(gx - st.c[0]) || 1;
  const lane = st.aisleZ + (st.c[1] < st.aisleZ ? LANE : -LANE) * 0.6;
  const toAisle = Math.sign(st.aisleZ - st.c[1]);
  const end: V2 = [st.c[0] - d * 3.2, lane];
  const back = bezier(st.c, [st.c[0], st.c[1] + toAisle * 2.6], [st.c[0] - d * 0.6, lane], end, true);
  const fwd = mkPath([end, [gx, lane], [gx, OUT_Z], [EDGE, OUT_Z]]);
  return [back, fwd];
}
/** 落客点 → 掉头 → 进南停车场的车位（代客停车） */
function pathValet(st: Stall, drop: V2): Path[] {
  const north = st.lot === 'n';
  const gx = GAP_X + (north ? LANE : -LANE);
  const west = st.c[0] < gx;
  const lane = st.aisleZ + (west ? -LANE : LANE) * (north ? 1 : -1);
  return [
    mkPath([drop, [UTURN_X, IN_Z], [UTURN_X, OUT_Z], [gx, OUT_Z], [gx, lane], [st.c[0], lane], [st.c[0], st.c[1]]]),
  ];
}
/** 车位 → 倒出来 → 进出口 → 拐上往西的车道 → 停在落客点（车头朝西，同来的时候） */
function pathFetch(st: Stall, drop: V2): Path[] {
  const [back, fwd] = pathOut(st);
  const end = fwd.pts[0];
  const gx = GAP_X + (st.lot === 'n' ? -LANE : LANE);
  return [back, mkPath([end, [gx, end[1]], [gx, IN_Z], drop])];
}
const pathDropIn = (drop: V2): Path[] => [mkPath([[EDGE, IN_Z], drop])];
/** 落客点 → 往东开走（车头朝西停着的：掉头；朝东的：直接走） */
const pathDropOut = (facingEast: boolean, drop: V2): Path[] =>
  facingEast
    ? [mkPath([drop, [GAP_X, IN_Z], [GAP_X + 4, OUT_Z], [EDGE, OUT_Z]])]
    : [mkPath([drop, [UTURN_X, IN_Z], [UTURN_X, OUT_Z], [EDGE, OUT_Z]])];
/** 落客点一次停得下三辆：后来的停在前一辆后面（东边）5.6 米 */
const DROP_SLOTS = 3;
const dropAt = (slot: number): V2 => [DROP[0] + 5.6 * slot, DROP[1]];

/** 下车 / 上车的人站哪（车的本地，车头 = 本地 −z 朝车位里）：车尾后面的通道上 —— 车位之间只有 0.4 米，站在车门边会叠到隔壁的车上 */
const DOORS: V2[] = [
  [-0.75, 2.75],
  [0.75, 2.75],
  [-0.75, 3.5],
  [0.75, 3.5],
  [0, 4.2],
  [-1.5, 3.2],
];
const local = (u: Unit, lx: number, lz: number): V2 => {
  const c = Math.cos(u.rot);
  const s = Math.sin(u.rot);
  return [u.x + lx * c + lz * s, u.z - lx * s + lz * c];
};

export function createCars(scene: THREE.Scene): FxPart {
  const units = new Map<string, Unit>();
  const pool: Car[] = [];
  const live: Car[] = [];
  const tmp = { x: 0, z: 0, rot: 0 };
  let day = -1;
  let lastNow = -1;
  /** 场景的车（clubpark）：观察时藏起来 */
  let sceneHidden = false;
  const hiddenCars = new Set<THREE.Object3D>();
  let scanT = 0;
  const patched = new WeakSet<object>();
  let lastS: SimState | null = null;
  let drivers: AgentId[] = [];
  const st = { units: 0, parked: 0, moving: 0, cars: 0, overflow: 0 };

  // ── 场景的车：visible 换成"场景想不想显示 && 不在观察" ──
  function hideSceneCars(on: boolean) {
    sceneHidden = on;
    if (!on) {
      for (const o of hiddenCars) {
        const want = (o.userData.__simWant as () => boolean)();
        // 去掉换上的 visible 访问器，恢复成普通属性
        delete (o as unknown as Record<string, unknown>).visible;
        o.visible = want;
        delete o.userData.__simWant;
      }
      hiddenCars.clear();
    }
  }
  function scanScene() {
    const root = scene.getObjectByName('region:clubpark');
    if (!root) return;
    for (const o of root.children) {
      const k = o.userData.kind;
      if ((k !== 'car' && k !== 'suv') || hiddenCars.has(o)) continue;
      let want = o.visible;
      Object.defineProperty(o, 'visible', {
        configurable: true,
        enumerable: true,
        get: () => want && !sceneHidden,
        set: (v: boolean) => {
          want = v;
        },
      });
      o.userData.__simWant = () => want;
      hiddenCars.add(o);
    }
  }

  // ── 车位 ──
  function pickStall(u: Unit, lot: 'n' | 's'): Stall | null {
    let best: Stall | null = null;
    let bs = Number.POSITIVE_INFINITY;
    for (const lotTry of [lot, lot === 'n' ? 's' : 'n'] as const) {
      for (const s of STALLS) {
        if (s.lot !== lotTry || s.unit) continue;
        // 离大门近的先停（x 小、近排），每伙人按 id 错开一点
        const sc = s.c[0] + (s.row === 1 || s.row === 2 ? 0 : 3) + hashOf(`${u.key}:${s.id}`) * 7;
        if (sc < bs) {
          bs = sc;
          best = s;
        }
      }
      if (best) break;
    }
    if (best) best.unit = u.key;
    return best;
  }
  function freeUnit(u: Unit) {
    if (u.stall) u.stall.unit = null;
    if (u.car) release(u.car);
    u.car = null;
    units.delete(u.key);
  }
  function park(u: Unit) {
    if (!u.stall) return;
    u.x = u.stall.c[0];
    u.z = u.stall.c[1];
    // 车头朝里：近排（车头朝南 / 北）—— rotation.y 0 = 车头朝北
    u.rot = u.stall.nose < 0 ? 0 : Math.PI;
  }
  /** 落客点空着的位置（别的车在开来、停着、代客开回来的占着） */
  function freeSlot(u: Unit): number {
    const used = new Set<number>();
    for (const o of units.values())
      if (o !== u && o.entry === 'park.valet' && (o.phase === 'in' || o.phase === 'drop' || o.phase === 'fetch'))
        used.add(o.slot);
    for (let i = 0; i < DROP_SLOTS; i++) if (!used.has(i)) return i;
    return DROP_SLOTS - 1;
  }
  function startDrive(u: Unit, paths: Path[], t0: number, dur: number) {
    u.drive = { paths, len: paths.reduce((a, p) => a + p.len, 0), t0, dur };
  }

  /** 一伙人的带头的、成员、出入口 */
  function unitOf(s: SimState, a: Agent): { key: string; lead: Agent; members: AgentId[] } | null {
    const party = a.party ? s.parties[a.party] : undefined;
    const lead = party ? s.agents[party.lead] : a;
    if (!lead || lead.id !== a.id) return null;
    return { key: party?.id ?? a.id, lead, members: party?.members ?? [a.id] };
  }

  function newUnit(f: FxFrame, key: string, lead: Agent, members: readonly AgentId[]): Unit {
    const h = hashOf(key);
    const kids = members.every((id) => {
      const r = f.s.agents[id]?.role;
      return r === 'kid';
    });
    const u: Unit = {
      key,
      lead: lead.id,
      entry: lead.entry,
      stall: null,
      shoulder: SHOULDER[Math.floor(h * SHOULDER.length) % SHOULDER.length],
      kind: hashOf(`${key}:kind`) < 0.3 ? 'suv' : 'car',
      paint: Math.floor(hashOf(`${key}:paint`) * CAR_PAINTS.length),
      phase: 'parked',
      drive: null,
      x: 0,
      z: 0,
      rot: 0,
      v: 0,
      rev: false,
      car: null,
      door: false,
      slot: 0,
      fetched: false,
      dropOnly: lead.entry === 'park.valet' && kids,
      seen: true,
    };
    units.set(key, u);
    return u;
  }

  // ── 车的身子（取景附近才建） ──
  /** 这一帧还能新建几辆（建一辆 ~1 毫秒：一下子进到停满的停车场时分几帧建） */
  let makeBudget = 0;
  function acquire(k: FxKits, u: Unit): Car | null {
    const i = pool.findIndex((c) => c.kind === u.kind);
    let c: Car;
    if (i >= 0) c = pool.splice(i, 1)[0];
    else {
      if (makeBudget <= 0) return null;
      makeBudget--;
      const obj = k.park.makeAsset(u.kind, u.paint).obj;
      obj.name = 'sim:fx:car';
      scene.add(obj);
      c = { obj, kind: u.kind, door: false };
      st.cars++;
    }
    c.obj.userData.setPaint?.(u.paint);
    c.obj.userData.setDoor?.(false, 'both', true);
    c.door = false;
    c.obj.visible = true;
    live.push(c);
    return c;
  }
  function release(c: Car) {
    c.obj.visible = false;
    c.obj.userData.setSpeed?.(0);
    const i = live.indexOf(c);
    if (i >= 0) live.splice(i, 1);
    pool.push(c);
  }

  /** 一趟走到哪：现在的位置、朝向、速度 */
  function follow(u: Unit, f: FxFrame) {
    const d = u.drive;
    if (!d) return;
    const fr = THREE.MathUtils.clamp((f.now - d.t0) / d.dur, 0, 1);
    let s = ease(fr) * d.len;
    const x0 = u.x;
    const z0 = u.z;
    for (const p of d.paths) {
      if (s <= p.len || p === d.paths[d.paths.length - 1]) {
        at(p, s, tmp);
        u.rev = p.rev;
        break;
      }
      s -= p.len;
    }
    u.x = tmp.x;
    u.z = tmp.z;
    u.rot = tmp.rot;
    u.v = f.dt > 0 ? Math.hypot(u.x - x0, u.z - z0) / f.dt : 0;
  }

  /** 这伙人在出入口（刚到 / 要走）：站到车门边（mount 的站位是出入口的第几个位置，不是他们的车） */
  function standAtCar(f: FxFrame, u: Unit, members: readonly AgentId[]) {
    let j = 0;
    for (const id of members) {
      const ag = f.s.agents[id];
      const a = f.actors.get(id) as FxActor | undefined;
      if (!ag || !a) continue;
      const w = ag.where;
      const target = u.stall || u.entry === 'park.valet' ? null : u.shoulder;
      // 去停车场的路：终点换成车门（每段路只换一次，换了让 mount 重新规划）
      if (w.kind === 'travel' && w.to === u.entry && a.leg && !patched.has(a.leg) && Array.isArray(a.leg.way)) {
        patched.add(a.leg);
        if (u.entry !== 'park.valet') {
          const p = target ?? local(u, ...DOORS[j % DOORS.length]);
          const way = a.leg.way;
          way[way.length - 1] = [p[0], p[1]];
          if (way.length > 1) a.leg.route = null;
        }
      }
      if (w.kind === 'at' && w.at === u.entry && u.entry !== 'park.valet') {
        const p = target ?? local(u, ...DOORS[j % DOORS.length]);
        // 一伙人站在路边：一个挨一个
        const px = target ? p[0] + (j % 3) * 0.8 : p[0];
        a.x = px;
        a.z = p[1];
        const o = a.body?.obj;
        if (o) {
          o.position.x = px;
          o.position.z = p[1];
        }
      }
      j++;
    }
  }

  return {
    frame(f, k) {
      const { s } = f;
      // 新的一天 / 跳时刻：全部重排（按到的先后，同样的状态排出同样的车位）
      if (s.dayNo !== day || Math.abs(f.now - lastNow) > 20) {
        day = s.dayNo;
        for (const u of [...units.values()]) freeUnit(u);
      }
      lastNow = f.now;
      if (!sceneHidden) hideSceneCars(true);
      scanT -= f.dt;
      if (scanT <= 0) {
        scanT = 1;
        scanScene();
      }
      const dmin = driveMin(f.speed);
      for (const u of units.values()) u.seen = false;
      st.overflow = 0;
      // 开车来的人（按到的先后：同样的状态排出同样的车位）；状态换了才重排
      if (s !== lastS) {
        lastS = s;
        drivers = Object.values(s.agents)
          .filter((a) => ENTRIES.has(a.entry))
          .sort((a, b) => a.arrive - b.arrive || (a.id < b.id ? -1 : 1))
          .map((a) => a.id);
      }
      for (const id of drivers) {
        const a = s.agents[id];
        if (!a) continue;
        const un = unitOf(s, a);
        if (!un) continue;
        const { key, lead, members } = un;
        let u = units.get(key);
        const w = lead.where;
        const away = w.kind === 'away';
        const gone = away && lead.doing === 'leave';
        const valet = lead.entry === 'park.valet';
        if (!u) {
          if (gone) continue;
          if (away && lead.arrive - f.now > dmin) continue;
          if (away && !lead.plan.length) continue;
          // 过了点还没进来（引擎里卡在门外）：不再派车
          if (away && f.now > lead.arrive + 15) continue;
          u = newUnit(f, key, lead, members);
          // 员工的车停在员工停车场（画外），从车道东头走进来；车位留给会员和客人
          if (!(valet && u.dropOnly) && !STAFF.has(lead.role))
            u.stall = pickStall(u, lead.entry === 'park.lotN' ? 'n' : 's');
          if (away) {
            // 开进来：到的时候正好停下
            const dur = Math.min(dmin, Math.max(0.3, lead.arrive - f.now + dmin * 0.02));
            u.phase = 'in';
            if (valet) u.slot = freeSlot(u);
            startDrive(u, valet ? pathDropIn(dropAt(u.slot)) : u.stall ? pathIn(u.stall) : [], lead.arrive - dur, dur);
            if (!valet && !u.stall) u.drive = null;
          } else if (valet && w.kind === 'at' && w.at === lead.entry) {
            u.phase = 'drop';
            u.x = dropAt(u.slot)[0];
            u.z = dropAt(u.slot)[1];
            u.rot = Math.PI / 2;
          } else {
            u.phase = 'parked';
            park(u);
          }
        }
        u.seen = true;
        if (!u.stall && !valet && !STAFF.has(lead.role)) st.overflow++;
        // ── 状态往前走 ──
        const atEntry = members.some((id) => {
          const m = s.agents[id]?.where;
          return m?.kind === 'at' && m.at === lead.entry;
        });
        const toEntry = members.some((id) => {
          const m = s.agents[id]?.where;
          return m?.kind === 'travel' && m.to === lead.entry;
        });
        if (u.phase === 'in') {
          if (u.drive) follow(u, f);
          if (!u.drive || f.now >= u.drive.t0 + u.drive.dur) {
            u.drive = null;
            u.v = 0;
            if (valet) {
              u.phase = 'drop';
              u.x = dropAt(u.slot)[0];
              u.z = dropAt(u.slot)[1];
              u.rot = Math.PI / 2;
            } else {
              u.phase = 'parked';
              park(u);
            }
          }
        }
        // 到了点人却一直没下车（引擎里这伙人进不来）：车不一直堵在落客点，先开走
        const stuck = away && !gone && f.now > lead.arrive + 15;
        if (u.phase === 'drop' && ((!atEntry && !toEntry && !away && !u.fetched) || stuck)) {
          // 人都走开了：代客开去停车位 / 送人的车开走
          if (u.stall && !u.dropOnly && !stuck) {
            u.phase = 'valet';
            startDrive(u, pathValet(u.stall, dropAt(u.slot)), f.now, dmin * 1.4);
          } else {
            u.phase = 'out';
            startDrive(u, pathDropOut(false, dropAt(u.slot)), f.now, dmin);
          }
        }
        if (u.phase === 'valet') {
          follow(u, f);
          if (u.drive && f.now >= u.drive.t0 + u.drive.dur) {
            u.drive = null;
            u.phase = 'parked';
            park(u);
          }
        }
        // 要走了：代客把车开回落客点（人走到的时候正好到）/ 送人的车从东边开来接
        if (valet && (u.phase === 'parked' || u.phase === 'out') && (toEntry || atEntry) && !away) {
          if (u.phase === 'parked' && u.stall) {
            const t1 = w.kind === 'travel' ? w.t1 : f.now;
            u.phase = 'fetch';
            u.fetched = true;
            u.slot = freeSlot(u);
            // 人走到落客点的时候车正好到（路上的人还远就先不动）
            startDrive(u, pathFetch(u.stall, dropAt(u.slot)), Math.max(f.now, t1 - dmin * 1.4), dmin * 1.4);
          }
        }
        if (u.phase === 'fetch') {
          follow(u, f);
          if (u.drive && f.now >= u.drive.t0 + u.drive.dur) {
            u.drive = null;
            u.phase = 'drop';
            u.x = dropAt(u.slot)[0];
            u.z = dropAt(u.slot)[1];
            u.rot = Math.PI / 2;
          }
        }
        if (gone && u.phase !== 'out') {
          // 上车走了：倒出车位开走（落客点的直接开走）
          u.phase = 'out';
          if (u.stall && !valet) startDrive(u, pathOut(u.stall), f.now, dmin);
          else if (valet) startDrive(u, pathDropOut(u.rot < 0, dropAt(u.slot)), f.now, dmin);
          else u.drive = null;
          if (u.stall) u.stall.unit = null;
        }
        if (u.phase === 'out') {
          if (!u.drive || f.now >= u.drive.t0 + u.drive.dur) {
            freeUnit(u);
            continue;
          }
          follow(u, f);
        }
        u.door = atEntry && (u.phase === 'parked' || u.phase === 'drop');
        if (!valet && (atEntry || toEntry)) standAtCar(f, u, members);
      }
      // 状态里没有了的（换天以后的残余）
      for (const u of [...units.values()]) if (!u.seen) freeUnit(u);

      // ── 画：取景附近的车给身子 ──
      const big = f.view.x1 - f.view.x0 > 140;
      makeBudget = 1;
      st.units = units.size;
      st.parked = st.moving = 0;
      for (const u of units.values()) {
        const has = (u.stall || u.phase !== 'parked') && (u.phase !== 'in' || !!u.drive);
        if (u.phase === 'parked') st.parked++;
        else st.moving++;
        const want = !big && has && inRect(f.view, u.x, u.z, 6);
        if (!want) {
          if (u.car) release(u.car);
          u.car = null;
          continue;
        }
        if (!u.car) u.car = acquire(k, u);
        const c = u.car;
        if (!c) continue;
        c.obj.position.set(u.x, 0, u.z);
        c.obj.rotation.y = u.rot;
        const moving = !!u.drive && u.v > 0.05;
        c.obj.userData.setSpeed?.(moving ? (u.rev ? -u.v : u.v) : 0);
        c.obj.userData.setBrake?.(!!u.drive && !moving);
        if (c.door !== u.door) {
          c.door = u.door;
          c.obj.userData.setDoor?.(u.door, 'both');
        }
        c.obj.userData.update?.(f.dt);
      }
    },
    off() {
      for (const u of [...units.values()]) freeUnit(u);
      for (const c of [...live]) release(c);
      hideSceneCars(false);
    },
    stats() {
      const drops = [...units.values()]
        .filter((u) => u.entry === 'park.valet' && u.phase !== 'parked')
        .map((u) => `${u.key}:${u.phase}:${u.slot}`);
      return { ...st, pool: pool.length, live: live.length, drops };
    },
  };
}
