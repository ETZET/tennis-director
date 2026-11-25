// 车来车去（第一轮评审「要补的画面」4、第二轮问题 3 / 要补的画面 2）：观察模式里停车场、落客点的车按引擎摆。
// 每伙开车来的人一辆车，怎么来按引擎的 Agent.car（club-sim.md 4.1「停车」）：
//   lotN / lotS：从东边的车道开进来，停进引擎分的那个车位（Agent.stall 0..13 = 那个停车场里第几个车位，下面的 LOT_STALLS），
//       一停下车门打开、人站在车尾后面的通道上（引擎的"刚到"）；走的时候这伙人走回自己的车，上车 → 倒出车位、从车道往东开出画。
//       车位在引擎里是"到的那一分钟"才分的：车要提前开进来，所以照引擎的分法（同一个种子、同样的先后）先猜一个，到了以后对一下，
//       猜错了还没拐进停车场就改道（极少）。
//   valet：开到落客点停下，人从路边那侧下车走开 → 代客把车往西开、在大门外的院子掉头、从往东的车道开出画（车停在场外，不占车位）；
//       这伙人往落客点走的时候，代客从东边把车开回落客点，人走到正好到。
//   drop：别人开车送来：落客点停下、人下车、车掉头开走；接的时候同样从东边开来。
//   walk / staff：没有车（员工的车停在画外的员工区）。
// 车让车：每辆车一条路、按真实时间开（加速档越快开得越快，"一趟 3 秒左右"），每一小步先看前面：
//   车身往前（倒车往后）多量 1.2 米的框碰到别的车就停下等（跟车、路口让车）；倒出车位前先看整段倒车的路上和通道上过来的车，
//   都空了才倒；落客点两个车位排队（后面的等前面的走）。先出发的先走；两辆车互相挡住超过 3 秒（不该有），先出发的那辆硬走，记一笔 ghost。
// 场景自己的车（clubpark 的停着的车、life.ts 开来开去的车）在观察时藏起来，关掉观察放回来。
// 车只在取景附近有身子（clubpark 的 car / suv，一辆 5 个 draw call）；远的只算位置（让车照样算）。
import * as THREE from 'three';
import { AISLE_Z, CAR_EDGE_X, ENTRY, SPOTS as PARK_SPOTS, ROWS, STALL, stallCenter } from '../../../clubpark/layout';
import { CAR_PAINTS } from '../../../clubpark/palette';
import { hashOf as seedHash } from '../../../clubsite/cast/rng';
import type { Agent, AgentId, PlaceId, SimState } from '../../../clubsite/sim/types';
import { PLACES } from '../deps';
import { type FxActor, type FxFrame, type FxKits, type FxPart, hashOf, inRect } from './util';

type V2 = [number, number];
const LANE = 1.1;
/** 车道：往西开（进来）的车道、往东开（出去）的车道 */
const IN_Z = PARK_SPOTS.edgeIn[1];
const OUT_Z = PARK_SPOTS.edgeOut[1];
const EDGE = CAR_EDGE_X;
const GAP_X = (ENTRY.x0 + ENTRY.x1) / 2;
/**
 * 落客点两个车位（往西开的车道上，门口那个 + 后面一个；车尾不伸进停车场进出口那一截 x 74 以东）；
 * 两个都占着的车在进出口东边排着（QUEUE_X，不堵进出口），空出来一个再开过去
 */
const DROP_X = [PARK_SPOTS.dropoff[0] - 1, PARK_SPOTS.dropoff[0] + 3.4];
const QUEUE_X = 84;
/** 落客区掉头的那一列（大门外的连锁砖院子 x 60.4–64.9） */
const UTURN_X = 63.2;
/** 车身半宽、半长（米）：clubpark vehicle/specs 的 halfW、车头车尾 */
const DIM = { car: { hw: 0.95, hl: 2.2 }, suv: { hw: 1.0, hl: 2.42 } } as const;
/** 让车：往前多看几米、两边多留多少 */
const BUF = 1.2;
const SIDE_M = 0.05;
/** 碰撞检查的步长（米） */
const SUB = 0.8;

const LOTS = PLACES.filter((p) => (p.stalls ?? 0) > 0);
const lotOfPlace = (id: PlaceId | undefined): 'n' | 's' | null =>
  id === 'park.lotN' ? 'n' : id === 'park.lotS' ? 's' : null;
const DROP_ENTRY: PlaceId = 'park.valet';

interface Stall {
  id: string;
  lot: 'n' | 's';
  /** 这个停车场里第几个车位（= 引擎的 Agent.stall） */
  idx: number;
  row: number;
  c: V2;
  /** 车头朝哪边（停好以后）：−1 北、+1 南 */
  nose: -1 | 1;
  aisleZ: number;
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
  /** 第几段、这一段走了多远 */
  i: number;
  s: number;
  /** 这一趟按多少秒开（真实秒，开起来的最高速 = 路长 / 它 × 1.3） */
  secs: number;
}

interface Unit {
  key: string;
  lead: AgentId;
  members: readonly AgentId[];
  mode: 'lot' | 'drop';
  trip: 'arrive' | 'depart';
  stall: Stall | null;
  /** 车位是照引擎的分法猜的（还没到），到了以后对一下 */
  guessed: boolean;
  slot: number;
  /** 'in' 开过来（出发前还在画外，不算在路上）· 'stop' 停着（车位 / 落客点）· 'out' 开走 */
  phase: 'in' | 'stop' | 'out';
  /** 开过来的车出发了（到了 t0、画外的车道口也空着） */
  started: boolean;
  /** 上一帧被别的车（不是进出口的牌子）挡着 */
  hit: boolean;
  drive: Drive | null;
  /** 游戏分钟：几点出发（开过来的车） */
  t0: number;
  /** 谁先走（出发早的先走） */
  prio: number;
  x: number;
  z: number;
  rot: number;
  /** 真实秒的速度（米/秒）、在倒车、被谁挡着、挡了多久 */
  v: number;
  rev: boolean;
  by: Unit | null;
  blocked: number;
  kind: 'car' | 'suv';
  paint: number;
  car: Car | null;
  door: boolean;
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

/**
 * 开一趟要多少游戏分钟：真实 2 秒左右（2× = 4 分钟），快进时最多 8 分钟（一晃而过）。
 * 停车场里一次只开一辆（牌子）：开得太慢早高峰、散场时车会在车道上排起长队
 */
const driveMin = (speed: number) => THREE.MathUtils.clamp(2 * speed, 0.6, 8);

// ── 车位 ──
/** 每个停车场的车位（按 ROWS 的顺序、跳过进出口；下标 = 引擎的 Agent.stall） */
const LOT_STALLS: Record<'n' | 's', Stall[]> = { n: [], s: [] };
ROWS.forEach((row, ri) => {
  const lot = ri < 2 ? 'n' : 's';
  for (let i = 0; i < STALL.n; i++) {
    if (row.gap && i >= row.gap[0] && i <= row.gap[1]) continue;
    LOT_STALLS[lot].push({
      id: `${row.id}-${i}`,
      lot,
      idx: LOT_STALLS[lot].length,
      row: ri,
      c: stallCenter(row, i) as V2,
      nose: row.nose,
      aisleZ: ri < 2 ? AISLE_Z.n : AISLE_Z.s,
    });
  }
});
const stallPose = (st: Stall) => ({ x: st.c[0], z: st.c[1], rot: st.nose < 0 ? 0 : Math.PI });
const slotPose = (slot: number) => ({ x: DROP_X[Math.max(0, slot)], z: IN_Z, rot: Math.PI / 2 });

/** 从车道东头开进车位（车头朝里） */
/**
 * 通道里的车道：进出口两边各是一截死胡同，每一截里进来的车走一条、出去的车走另一条（相隔 2.2 米），
 * 而且同一条线上的车都朝一个方向开（西半截出去的和东半截进来的同一条线、同向）—— 通道里没有迎面顶牛，只有横穿和倒车要让。
 */
function lanesOf(st: Stall) {
  const north = st.lot === 'n';
  const off = (st.c[0] < GAP_X ? -LANE : LANE) * (north ? 1 : -1);
  return {
    // 进来的都走进出口东半（北停车场往北拐、南停车场往南拐），出去的都走西半：落客点排着的车在西边，不挡拐弯
    gIn: GAP_X + LANE,
    gOut: GAP_X - LANE,
    inLane: st.aisleZ + off,
    outLane: st.aisleZ - off,
  };
}
function pathIn(st: Stall, from: V2 = [EDGE, IN_Z]): Path[] {
  const { gIn: gx, inLane: lane } = lanesOf(st);
  return [mkPath([from, [gx, IN_Z], [gx, lane], [st.c[0], lane], [st.c[0], st.c[1]]])];
}
/** 倒出车位（车尾朝离出口远的那边甩）→ 通道 → 进出口 → 往东的车道 → 出画 */
function pathOut(st: Stall): Path[] {
  const { gOut: gx, outLane: lane } = lanesOf(st);
  const d = Math.sign(gx - st.c[0]) || 1;
  const toAisle = Math.sign(st.aisleZ - st.c[1]);
  const end: V2 = [st.c[0] - d * 3.2, lane];
  const back = bezier(st.c, [st.c[0], st.c[1] + toAisle * 2.6], [st.c[0] - d * 0.6, lane], end, true);
  const fwd = mkPath([end, [gx, lane], [gx, OUT_Z], [EDGE, OUT_Z]]);
  return [back, fwd];
}
const pathDropIn = (slot: number, from: V2 = [EDGE, IN_Z]): Path[] => [
  mkPath([from, [slot < 0 ? QUEUE_X : DROP_X[slot], IN_Z]]),
];
/** 落客点 → 往西开到大门外的院子掉头 → 往东的车道 → 出画 */
const pathDropOut = (slot: number): Path[] => [
  mkPath(
    [
      [DROP_X[slot], IN_Z],
      [UTURN_X, IN_Z],
      [UTURN_X, OUT_Z],
      [EDGE, OUT_Z],
    ],
    false,
    2,
  ),
];

/** 下车 / 上车的人站哪（车的本地，车头 = 本地 −z）。停车场：车尾后面的通道上（车位之间只有 0.4 米，站在车门边会叠到隔壁的车上） */
const LOT_DOORS: V2[] = [
  [-0.75, 2.75],
  [0.75, 2.75],
  [-0.75, 3.5],
  [0.75, 3.5],
  [0, 4.2],
  [-1.5, 3.2],
];
/** 落客点：路边那一侧（车头朝西，本地 +x = 北 = 路边），一排站开 */
const DROP_DOORS: V2[] = [
  [1.55, -0.7],
  [1.55, 0.35],
  [1.55, 1.4],
  [2.3, -0.2],
  [2.3, 0.85],
  [2.3, 1.9],
];
function local(p: { x: number; z: number; rot: number }, lx: number, lz: number): V2 {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}

// ── 车身的框（有向矩形，分离轴） ──
interface Box {
  x: number;
  z: number;
  /** 车头方向（单位） */
  fx: number;
  fz: number;
  hw: number;
  hl: number;
}
function overlap(a: Box, b: Box): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (dx * dx + dz * dz > (a.hl + a.hw + b.hl + b.hw) ** 2) return false;
  // 四根轴：a 的前、侧，b 的前、侧
  const axes: [number, number][] = [
    [a.fx, a.fz],
    [-a.fz, a.fx],
    [b.fx, b.fz],
    [-b.fz, b.fx],
  ];
  for (const [ux, uz] of axes) {
    const ra = a.hl * Math.abs(a.fx * ux + a.fz * uz) + a.hw * Math.abs(-a.fz * ux + a.fx * uz);
    const rb = b.hl * Math.abs(b.fx * ux + b.fz * uz) + b.hw * Math.abs(-b.fz * ux + b.fx * uz);
    if (Math.abs(dx * ux + dz * uz) > ra + rb) return false;
  }
  return true;
}
/** 一辆车在 (x, z, rot) 的框；ahead = 往运动方向多量几米（倒车往后），side = 两边多留 */
function boxOf(u: Unit, x: number, z: number, rot: number, ahead = 0, back = false, side = 0): Box {
  const d = DIM[u.kind];
  const fx = -Math.sin(rot);
  const fz = -Math.cos(rot);
  const m = back ? -1 : 1;
  return {
    x: x + fx * m * (ahead / 2),
    z: z + fz * m * (ahead / 2),
    fx,
    fz,
    hw: d.hw + side,
    hl: d.hl + ahead / 2,
  };
}

export function createCars(scene: THREE.Scene): FxPart & { prewarm(k: FxKits, i: number): THREE.Object3D } {
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
  /** 车位猜过的（这一帧里按到的先后猜：后到的不跟先到的抢） */
  const st = {
    units: 0,
    parked: 0,
    moving: 0,
    waiting: 0,
    cars: 0,
    guessMiss: 0,
    ghost: 0,
    hidden: 0,
    overlaps: 0,
    /** 累计：有车叠在一起的帧数、叠过的车对（自检，应该一直是 0）、停在车位上和引擎的车位对不上的 */
    overlapFrames: 0,
    overlapPairs: [] as string[],
    mismatch: 0,
  };

  // ── 场景的车：visible 换成"场景想不想显示 && 不在观察" ──
  function hideSceneCars(on: boolean) {
    sceneHidden = on;
    if (!on) {
      for (const o of hiddenCars) {
        const want = (o.userData.__simWant as () => boolean)();
        delete (o as unknown as Record<string, unknown>).visible;
        o.visible = want;
        delete o.userData.__simWant;
      }
      hiddenCars.clear();
    }
  }
  function scanScene() {
    // 区域的根是 scene 的直接子节点（walk.ts）：不用整棵树找
    const root = scene.children.find((o) => o.name === 'region:clubpark');
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

  // ── 车位：照引擎的 park() 猜（同一个种子、同样的先后；到了以后用引擎的） ──
  function guessStall(s: SimState, lead: Agent): Stall | null {
    const want = lead.car === 'lotN' ? 'n' : lead.car === 'lotS' ? 's' : null;
    if (!want) return null;
    const order: ('n' | 's')[] = want === 'n' ? ['n', 's'] : ['s', 'n'];
    const h = seedHash(s.seed, s.dayNo, lead.id, 'stall');
    for (const lot of order) {
      const place = LOTS.find((p) => lotOfPlace(p.id) === lot);
      const n = Math.min(place?.stalls ?? 0, LOT_STALLS[lot].length);
      const used = new Set<number>();
      for (const id of drivers) {
        const a = s.agents[id];
        if (a && a.where.kind !== 'away' && a.car === (lot === 'n' ? 'lotN' : 'lotS') && a.stall !== undefined)
          used.add(a.stall);
      }
      for (const u of units.values()) if (u.stall?.lot === lot && u.phase !== 'out') used.add(u.stall.idx);
      for (let k = 0; k < n; k++) {
        const i = (h + k) % (place?.stalls ?? n);
        if (i >= n || used.has(i)) continue;
        return LOT_STALLS[lot][i];
      }
    }
    return null;
  }
  const engineStall = (a: Agent): Stall | null => {
    const lot = a.car === 'lotN' ? 'n' : a.car === 'lotS' ? 's' : null;
    return lot && a.stall !== undefined ? (LOT_STALLS[lot][a.stall] ?? null) : null;
  };
  /** 落客点哪个位置空着（别的车在开来、停着）；都占着 / 前面还有排着的 = −1（去 QUEUE_X 排着） */
  function freeSlot(u: Unit): number {
    const used = new Set<number>();
    for (const o of units.values()) {
      if (o === u || o.mode !== 'drop') continue;
      // 还在画外没出发的不占（出发了、开到排队的地方才分车位）
      if (o.phase === 'stop' || (o.phase === 'in' && o.started)) used.add(o.slot);
      // 先来的还在排着：轮不到
      if (o.phase === 'in' && o.slot < 0 && o.prio < u.prio && o.started) return -1;
      // 刚开走、还没离开车位的：车位还占着
      if (o.phase === 'out' && o.drive && o.drive.s < 6) used.add(o.slot);
    }
    for (let i = 0; i < DROP_X.length; i++) if (!used.has(i)) return i;
    return -1;
  }
  /** 落客点的车开过来：排着的等空出车位再开过去；到了停下 */
  function dropIn(u: Unit, f: FxFrame, dt: number) {
    if (u.phase !== 'in') return;
    if (u.slot < 0 && u.started) {
      const sl = freeSlot(u);
      if (sl >= 0) {
        u.slot = sl;
        const t0 = u.started ? f.now : u.t0;
        go(u, pathDropIn(sl, u.started ? [u.x, IN_Z] : [EDGE, IN_Z]), t0, f);
      }
    }
    drive(u, f, dt);
    if (!u.drive && f.now >= u.t0 && u.slot >= 0) {
      u.phase = 'stop';
      u.v = 0;
    }
  }

  function newUnit(
    key: string,
    lead: Agent,
    members: readonly AgentId[],
    mode: Unit['mode'],
    trip: Unit['trip'],
  ): Unit {
    const h = hashOf(key.replace(/:(in|out)$/, ''));
    const u: Unit = {
      key,
      lead: lead.id,
      members,
      mode,
      trip,
      stall: null,
      guessed: false,
      slot: 0,
      phase: 'stop',
      started: false,
      hit: false,
      drive: null,
      t0: 0,
      prio: 0,
      x: 0,
      z: 0,
      rot: 0,
      v: 0,
      rev: false,
      by: null,
      blocked: 0,
      kind: hashOf(`${key}:kind`) < 0.3 ? 'suv' : 'car',
      paint: Math.floor(h * CAR_PAINTS.length) % CAR_PAINTS.length,
      car: null,
      door: false,
      seen: true,
    };
    units.set(key, u);
    return u;
  }
  function freeUnit(u: Unit) {
    dropGap(u);
    if (u.car) release(u.car);
    u.car = null;
    units.delete(u.key);
  }
  const place = (u: Unit, p: { x: number; z: number; rot: number }) => {
    u.x = p.x;
    u.z = p.z;
    u.rot = p.rot;
  };
  /** 出发：t0（游戏分钟）开始开这几段路，按 secs 真实秒开完 */
  function go(u: Unit, paths: Path[], t0: number, f: FxFrame) {
    u.drive = { paths, i: 0, s: 0, secs: driveMin(f.speed || 2) / Math.max(f.speed || 2, 0.05) };
    u.t0 = t0;
    u.prio = t0 + hashOf(u.key) * 0.01;
    u.v = 0;
    u.blocked = 0;
    at(paths[0], 0, tmp);
    if (u.phase === 'in') place(u, tmp);
  }
  /** 在路上（算让车的）：开过来的车出发了才算；停着的、开走的一直算 */
  const present = (u: Unit, _now?: number) => u.phase !== 'in' || u.started;

  // ── 车的身子（取景附近才建） ──
  /** 这一帧还能新建几辆（建一辆 ~1 毫秒：一下子进到停满的停车场时分几帧建） */
  let makeBudget = 0;
  function makeCar(k: FxKits, kind: 'car' | 'suv', paint: number): Car {
    const obj = k.park.makeAsset(kind, paint).obj;
    obj.name = 'sim:fx:car';
    obj.visible = false;
    scene.add(obj);
    st.cars++;
    return { obj, kind, door: false };
  }
  function acquire(k: FxKits, u: Unit): Car | null {
    const i = pool.findIndex((c) => c.kind === u.kind);
    let c: Car;
    if (i >= 0) c = pool.splice(i, 1)[0];
    else {
      if (makeBudget <= 0) return null;
      makeBudget--;
      c = makeCar(k, u.kind, u.paint);
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

  // ── 让车 ──
  /** 这辆车在 (x, z, rot) 往前开会不会碰到别的车（返回挡着的那辆） */
  function blocker(u: Unit, x: number, z: number, rot: number, rev: boolean, now: number, strict = false): Unit | null {
    const me = boxOf(u, x, z, rot, BUF, rev, SIDE_M);
    const tight = boxOf(u, x, z, rot, 0.1, rev, 0.05);
    const cur = boxOf(u, u.x, u.z, u.rot);
    for (const o of units.values()) {
      if (o === u || !present(o, now)) continue;
      if (Math.abs(o.x - x) > 9 || Math.abs(o.z - z) > 9) continue;
      const ob = boxOf(o, o.x, o.z, o.rot);
      // 停在车位里的车：只要不蹭上（拐进隔壁车位时车头离它不到一米）；路上的车（停着排队的也算）：留出跟车的距离
      // 停在车位里的车（包括等着倒出来、还没动的）
      const od = o.drive;
      const parked =
        o.mode === 'lot' && (o.phase === 'stop' || (o.phase === 'out' && !!od && od.i === 0 && od.s === 0));
      // 互相挡住了（两秒以上、它也在等自己）：跟车的距离不留了，只要不蹭上就往前挪
      const stuck = u.blocked > 2 && o.by === u;
      if (!overlap(parked || stuck ? tight : me, ob)) continue;
      // 已经叠在一起的（跳时刻刚摆出来的）：只许往分开的方向挪
      if (!strict && overlap(cur, ob) && Math.hypot(x - o.x, z - o.z) > Math.hypot(u.x - o.x, u.z - o.z)) continue;
      // 最后一招（应该用不上）：挡了 6 秒以上、它也被自己挡着，先出发的硬走，记一笔
      if (u.blocked > 6 && o.by === u && u.prio < o.prio) {
        st.ghost++;
        continue;
      }
      return o;
    }
    return null;
  }
  /** 倒出车位前：整段倒车的路上没有车，通道上也没有车往这边开过来 */
  function clearToBack(u: Unit, p: Path, now: number): Unit | null {
    const mine: Box[] = [];
    for (let s = 0; s <= p.len; s += SUB) {
      at(p, s, tmp);
      mine.push(boxOf(u, tmp.x, tmp.z, tmp.rot, 0, false, 0.3));
    }
    for (const o of units.values()) {
      if (o === u || !present(o, now)) continue;
      if (Math.abs(o.x - u.x) > 16 || Math.abs(o.z - u.z) > 16) continue;
      const ob = boxOf(o, o.x, o.z, o.rot);
      if (mine.some((m) => overlap(m, ob))) return o;
      // 正在开的车：往前看 14 米。也在等着倒出来的车：出发早的先倒，晚的只算它停着的车身
      const d = o.drive;
      if (!d || o.phase === 'stop') continue;
      if (d.i === 0 && d.s === 0 && d.paths[0].rev && o.prio > u.prio) continue;
      // 等着停进我这个车位的车：它在让我，只算它的车身
      if (o.phase === 'in' && o.stall === u.stall) continue;
      // 往前看 14 米（跨过这一段的尽头：倒出来以后接着往前开的那段也算）
      let left = 14;
      for (let i = d.i, s0 = d.s; i < d.paths.length && left > 0; i++, s0 = 0) {
        const op = d.paths[i];
        const s1 = Math.min(op.len, s0 + left);
        for (let s = s0; s <= s1; s += SUB) {
          at(op, s, tmp);
          const ob2 = boxOf(o, tmp.x, tmp.z, tmp.rot);
          if (mine.some((m) => overlap(m, ob2))) return o;
        }
        left -= s1 - s0;
      }
    }
    return null;
  }
  /**
   * 牌子（第 2 轮车穿车、互相让不开）：每个停车场一块（那个停车场里一次只开一辆：通道两头是死胡同、倒车会横过两条车道），
   * 进出口横过车道的那一截一块（南北停车场进出的车在这里交叉、并道）。
   * 进来的车要进那一截之前同时拿到"那一截 + 自己的停车场"两块（拿不到就在车道上进出口东边等），出了那一截交那一截的，停好交停车场的；
   * 出去的车倒车前拿停车场的（拿不到就在车位里等），开到那一截跟前再拿那一截的（拿着停车场的牌子等），开上车道交掉。
   * 停车场的牌子排队先来先拿（排头三秒拿了不动的挪到队尾）；拿着牌子四秒没挪窝又不是被车挡着的收回。落客点的车不拿牌子（碰撞照样让）。
   */
  interface Token {
    holder: Unit | null;
    queue: Unit[];
    headAt: number;
    movedAt: number;
  }
  const mkTok = (): Token => ({ holder: null, queue: [], headAt: 0, movedAt: 0 });
  const TOK: Record<'n' | 's' | 'x', Token> = { n: mkTok(), s: mkTok(), x: mkTok() };
  let clock = 0;
  const inLot = (lot: 'n' | 's', x: number, z: number) => x > 63 && x < 89 && (lot === 'n' ? z < -4.2 : z > 4.2);
  const inCross = (x: number, z: number) => x > 72.4 && x < 79.6 && Math.abs(z) <= 4.2;
  /** 车身（车头、车中、车尾三点）有没有一点在这一片里 */
  function bodyHits(u: Unit, x: number, z: number, rot: number, test: (x: number, z: number) => boolean): boolean {
    const hl = DIM[u.kind].hl;
    const fx = -Math.sin(rot) * hl;
    const fz = -Math.cos(rot) * hl;
    return test(x, z) || test(x + fx, z + fz) || test(x - fx, z - fz);
  }
  function tidy(t: Token) {
    if (t.holder && (!units.has(t.holder.key) || clock - t.movedAt > 4)) t.holder = null;
    for (let k = t.queue.length - 1; k >= 0; k--) if (!units.has(t.queue[k].key)) t.queue.splice(k, 1);
  }
  /** 能不能拿到（排上队；排头三秒没来拿的挪到队尾） */
  function canTake(t: Token, u: Unit, queued: boolean): boolean {
    tidy(t);
    if (t.holder === u) return true;
    if (!queued) return !t.holder;
    if (!t.queue.includes(u)) {
      t.queue.push(u);
      if (t.queue.length === 1) t.headAt = clock;
    }
    if (!t.holder && t.queue[0] !== u && clock - t.headAt > 3) {
      t.queue.push(t.queue.shift() as Unit);
      t.headAt = clock;
    }
    if (!t.holder && t.queue[0] === u) return true;
    u.by = t.holder ?? t.queue[0] ?? null;
    return false;
  }
  function take(t: Token, u: Unit) {
    if (t.holder === u) return;
    const i = t.queue.indexOf(u);
    if (i >= 0) t.queue.splice(i, 1);
    if (i === 0) t.headAt = clock;
    t.holder = u;
    t.movedAt = clock;
  }
  function giveUp(t: Token, u: Unit) {
    const i = t.queue.indexOf(u);
    if (i >= 0) t.queue.splice(i, 1);
    if (t.holder === u) t.holder = null;
  }
  function dropGap(u: Unit) {
    for (const t of Object.values(TOK)) giveUp(t, u);
  }
  /** 这一步最多走多远（要进的那一片的牌子不在自己手里：走到边上为止） */
  function gapLimit(u: Unit, p: Path, s0: number, ds: number): number {
    const st0 = u.stall;
    if (u.mode !== 'lot' || !st0) return ds;
    const L = TOK[st0.lot];
    const X = TOK.x;
    const lotT = (x: number, z: number) => inLot(st0.lot, x, z);
    /** 车身到 (x, z, rot) 要哪几块：拿得到就拿上 */
    const ok = (x: number, z: number, rot: number): boolean => {
      const needL = L.holder !== u && bodyHits(u, x, z, rot, lotT);
      const needX = X.holder !== u && bodyHits(u, x, z, rot, inCross);
      if (!needL && !needX) return true;
      // 进来的车进那一截：两块一起拿（拿着那一截等停车场的牌子会把出来的车堵死）
      const wantL = needL || (needX && u.phase === 'in' && L.holder !== u);
      const gotL = !wantL || canTake(L, u, true);
      const gotX = !needX || canTake(X, u, false);
      if (!gotL || !gotX) return false;
      if (wantL) take(L, u);
      if (needX) take(X, u);
      return true;
    };
    if (!ok(u.x, u.z, u.rot)) return 0;
    let last = 0;
    for (let s = 0.4; ; s = Math.min(s + 0.4, ds)) {
      at(p, s0 + s, tmp);
      if (!ok(tmp.x, tmp.z, tmp.rot)) return last;
      last = s;
      if (s >= ds) return ds;
    }
  }
  /** 挪完一步：出了那一截交那一截的；出去的车出了停车场交停车场的 */
  function afterMove(u: Unit, moved: boolean) {
    const st0 = u.stall;
    if (u.mode !== 'lot' || !st0) return;
    const L = TOK[st0.lot];
    const X = TOK.x;
    if (moved) {
      if (L.holder === u) L.movedAt = clock;
      if (X.holder === u) X.movedAt = clock;
    }
    if (
      X.holder === u &&
      !bodyHits(u, u.x, u.z, u.rot, inCross) &&
      (u.phase === 'out' || bodyHits(u, u.x, u.z, u.rot, (x, z) => inLot(st0.lot, x, z)))
    )
      X.holder = null;
    if (L.holder === u && u.phase === 'out' && !bodyHits(u, u.x, u.z, u.rot, (x, z) => inLot(st0.lot, x, z)))
      L.holder = null;
  }
  /** 要停的车位里还停着上一辆（它的人刚走、还没倒出来）：先在车道上进出口东边等 */
  function stallTaken(u: Unit, now: number): boolean {
    if (!u.stall) return false;
    for (const o of units.values())
      if (
        o !== u &&
        o.stall === u.stall &&
        present(o, now) &&
        o.phase !== 'in' &&
        Math.hypot(o.x - u.stall.c[0], o.z - u.stall.c[1]) < 5
      )
        return true;
    return false;
  }
  /** 开一帧：按真实时间推，前面有车就停 */
  function drive(u: Unit, f: FxFrame, dt: number) {
    const d = u.drive;
    if (!d || dt <= 0) return;
    if (f.now < u.t0) return;
    let p = d.paths[d.i];
    if (u.phase === 'in' && !u.started) {
      // 从画外开进来：车道口（第一步要占的地方）有车就晚一点出发（排在画外，看不见）
      at(p, 0, tmp);
      if (blocker(u, tmp.x, tmp.z, tmp.rot, false, f.now, true)) {
        st.waiting++;
        return;
      }
      u.started = true;
    }
    // 起步前：倒车出位先拿牌子（停车场里一次一辆），再看清楚（落客点开过来的车）
    if (d.s === 0 && p.rev) {
      if (u.mode === 'lot' && u.stall && gapLimit(u, p, 0, 0.01) <= 0) {
        st.waiting++;
        u.v = 0;
        return;
      }
      const o = clearToBack(u, p, f.now);
      u.hit = !!o;
      if (o) {
        st.waiting++;
        u.v = 0;
        u.by = o;
        u.blocked += dt;
        return;
      }
    }
    const total = d.paths.reduce((a, q) => a + q.len, 0);
    const vmax = Math.max(4, (total / Math.max(d.secs, 0.05)) * 1.3) * (p.rev ? 0.45 : 1);
    const acc = vmax / Math.max(0.12, d.secs * 0.18);
    const rem = p.len - d.s;
    const vStop = Math.sqrt(2 * acc * Math.max(rem, 0)) + 0.4;
    let v = Math.min(u.v + acc * dt, vmax, vStop);
    let ds = Math.min(v * dt, rem);
    // 车位还被上一辆占着：开到进出口东边就停（不进通道，免得堵住它倒出来）
    if (u.phase === 'in' && u.mode === 'lot' && u.stall && stallTaken(u, f.now)) {
      // 还在车道上：停在进出口东边；已经进了停车场：停在离车位 7.5 米的通道上（不挡它倒车甩尾），把牌子让给它
      const before = Math.max(0, p.pts[0][0] - (GAP_X + LANE + 5));
      const inner = p.len - (Math.abs(u.stall.c[1] - lanesOf(u.stall).inLane) + 7.5);
      const inside = bodyHits(u, u.x, u.z, u.rot, (x, z) => !!u.stall && inLot(u.stall.lot, x, z));
      const gate = inside ? inner : before;
      ds = Math.max(0, Math.min(ds, gate - d.s));
      if (!inside || ds <= 1e-4) dropGap(u);
      if (ds <= 1e-4) {
        st.waiting++;
        u.v = 0;
        return;
      }
    }
    // 进出口一次一辆
    const lim = gapLimit(u, p, d.s, ds);
    if (lim < ds) {
      st.waiting++;
      ds = lim;
    }
    // 一小步一小步看前面
    let ok = 0;
    let by: Unit | null = null;
    for (let s = Math.min(SUB, ds); ; s = Math.min(s + SUB, ds)) {
      at(p, d.s + s, tmp);
      by = blocker(u, tmp.x, tmp.z, tmp.rot, p.rev, f.now);
      if (by) break;
      ok = s;
      if (s >= ds) break;
    }
    u.hit = !!by;
    if (by) {
      u.blocked += dt;
      u.by = by;
      st.waiting++;
    } else {
      u.blocked = 0;
      u.by = null;
    }
    ds = ok;
    v = by ? 0 : ds / dt;
    d.s += ds;
    at(p, d.s, tmp);
    const x0 = u.x;
    const z0 = u.z;
    place(u, tmp);
    // 牌子：出了那一截交那一截的，出去的车出了停车场交停车场的（进来的车停好了交，见 frame）
    afterMove(u, ds > 0.01);
    u.rev = p.rev;
    u.v = Math.hypot(u.x - x0, u.z - z0) / dt;
    if (d.s >= p.len - 1e-3) {
      // 这一段走完：换下一段（倒车 → 往前要停一下：速度清零）
      if (d.i < d.paths.length - 1) {
        d.i++;
        d.s = 0;
        u.v = 0;
        p = d.paths[d.i];
      } else u.drive = null;
    } else if (!by) u.v = v;
  }

  /** 一伙人的带头的、成员 */
  function unitOf(s: SimState, a: Agent): { key: string; lead: Agent; members: AgentId[] } | null {
    const party = a.party ? s.parties[a.party] : undefined;
    const lead = party ? s.agents[party.lead] : a;
    if (!lead || lead.id !== a.id) return null;
    return { key: party?.id ?? a.id, lead, members: party?.members ?? [a.id] };
  }
  const modeOf = (a: Agent): Unit['mode'] | null => {
    if (a.car === 'lotN' || a.car === 'lotS') return 'lot';
    if (a.car === 'valet' || a.car === 'drop') return 'drop';
    if (a.car === undefined && lotOfPlace(a.entry)) return 'lot';
    if (a.car === undefined && a.entry === DROP_ENTRY) return 'drop';
    return null;
  };

  /** 停着的车边上：这伙人的第 j 个人站哪（停车场：车尾后面；落客点：路边那侧） */
  function doorAt(u: Unit, j: number): V2 {
    const pose = u.mode === 'lot' ? (u.stall ? stallPose(u.stall) : u) : slotPose(u.slot);
    const D = u.mode === 'lot' ? LOT_DOORS : DROP_DOORS;
    const [lx, lz] = D[j % D.length];
    return local(pose, lx, lz);
  }
  /** 这伙人在出入口（刚到 / 要走）：站到车边；车还没开到就先不露面（刚到的） */
  function standAtCar(f: FxFrame, u: Unit, entry: PlaceId) {
    let j = 0;
    for (const id of u.members) {
      const ag = f.s.agents[id];
      const a = f.actors.get(id) as FxActor | undefined;
      if (!ag || !a) continue;
      const w = ag.where;
      // 去出入口（要走）的路：终点换成车边（每段路只换一次，换了让 mount 重新规划）
      if (
        w.kind === 'travel' &&
        w.to === entry &&
        ag.doing === 'leave' &&
        a.leg &&
        !patched.has(a.leg) &&
        Array.isArray(a.leg.way)
      ) {
        patched.add(a.leg);
        const p = doorAt(u, j);
        const way = a.leg.way;
        way[way.length - 1] = [p[0], p[1]];
        if (way.length > 1) a.leg.route = null;
      }
      if (w.kind === 'at' && w.at === entry) {
        const o = a.body?.obj;
        if (u.trip === 'arrive' && u.phase === 'in') {
          // 车还在路上：人还在车里
          if (o?.visible) {
            o.visible = false;
            st.hidden++;
          }
        } else {
          const p = doorAt(u, j);
          a.x = p[0];
          a.z = p[1];
          if (o) {
            o.position.x = p[0];
            o.position.z = p[1];
          }
        }
      }
      j++;
    }
  }

  return {
    frame(f, k) {
      const { s } = f;
      // 新的一天 / 跳时刻：全部重排（按到的先后，同样的状态排出同样的车）
      // 刚重排（换天、跳时刻、刚打开）：已经在落客点的人，车直接摆在那儿；平时车一律从画外开过来
      const fresh = s.dayNo !== day || Math.abs(f.now - lastNow) > 20;
      if (fresh) {
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
      const dmin = driveMin(f.speed || 2);
      const dt = f.speed > 0 ? f.dt : 0;
      clock += dt;
      for (const u of units.values()) u.seen = false;
      st.waiting = st.hidden = st.guessMiss = 0;
      if (s !== lastS) {
        lastS = s;
        drivers = Object.values(s.agents)
          .filter((a) => modeOf(a) !== null)
          .sort((a, b) => a.arrive - b.arrive || (a.id < b.id ? -1 : 1))
          .map((a) => a.id);
      }
      // ── 每伙人：该有车的给车，状态往前走 ──
      for (const id of drivers) {
        const a0 = s.agents[id];
        if (!a0) continue;
        const un = unitOf(s, a0);
        if (!un) continue;
        const { key, lead, members } = un;
        const mode = modeOf(lead);
        if (!mode) continue;
        const w = lead.where;
        const away = w.kind === 'away';
        const gone = away && lead.doing === 'leave';
        const entry = lead.entry;
        const atEntry = members.some((m) => {
          const x = s.agents[m]?.where;
          return x?.kind === 'at' && x.at === entry;
        });
        const leaving = members.some((m) => {
          const a = s.agents[m];
          const x = a?.where;
          return (
            a?.doing === 'leave' && ((x?.kind === 'travel' && x.to === entry) || (x?.kind === 'at' && x.at === entry))
          );
        });
        if (mode === 'lot') {
          let u = units.get(key);
          if (!u) {
            if (gone) continue;
            if (away) {
              // 快到了（一趟的时间以内）：照引擎的分法猜车位，开进来
              if (lead.arrive - f.now > dmin * 1.2 || !lead.plan.length || f.now > lead.arrive + 15) continue;
              const stall = guessStall(s, lead);
              if (!stall) continue;
              u = newUnit(key, lead, members, 'lot', 'arrive');
              u.stall = stall;
              u.guessed = true;
              u.phase = 'in';
              go(u, pathIn(stall), lead.arrive - dmin * 1.1, f);
            } else {
              const stall = engineStall(lead);
              if (!stall) continue;
              u = newUnit(key, lead, members, 'lot', 'arrive');
              u.stall = stall;
              if (fresh) {
                // 刚重排：已经停好了
                u.phase = 'stop';
                place(u, stallPose(stall));
              } else {
                // 平时（人到了才轮到建车，比如快进时一下跳过了开进来的那一段）：照样从画外开进来，不凭空出现在车位上
                u.phase = 'in';
                go(u, pathIn(stall), f.now, f);
              }
            }
          }
          u.seen = true;
          // 到了：车位对一下（猜错了、改成代客的：还在车道上就改道，拐进去了就停在猜的那个上）
          if (u.guessed && !away) {
            u.guessed = false;
            const real = engineStall(lead);
            if (real !== u.stall) {
              st.guessMiss++;
              const d = u.drive;
              const onDrive = !d || (d.i === 0 && u.x > GAP_X + 3 && Math.abs(u.z - IN_Z) < 0.3);
              if (real && onDrive && u.phase === 'in') {
                u.stall = real;
                if (d) go(u, pathIn(real, [u.x, IN_Z]), Math.min(u.t0, f.now), f);
              } else if (!real && onDrive && u.phase === 'in' && modeOf(lead) === 'drop') {
                // 两个停车场都满了：改去落客点（交给代客）
                freeUnit(u);
                continue;
              }
            }
          }
          if (u.phase === 'in') {
            drive(u, f, dt);
            if (!u.drive && f.now >= u.t0) {
              u.phase = 'stop';
              u.v = 0;
              dropGap(u);
            }
          }
          if (gone && u.phase === 'stop' && u.stall) {
            // 上车走了：倒出车位开走
            u.phase = 'out';
            go(u, pathOut(u.stall), f.now, f);
          }
          if (u.phase === 'out') {
            drive(u, f, dt);
            if (!u.drive) {
              freeUnit(u);
              continue;
            }
          }
          u.door = atEntry && u.phase === 'stop';
          standAtCar(f, u, entry);
          continue;
        }
        // ── 落客点（代客 / 送人）：来的一趟、走的一趟各一辆（中间车在场外） ──
        const kIn = `${key}:in`;
        const kOut = `${key}:out`;
        let ui = units.get(kIn);
        if (
          !ui &&
          away &&
          !gone &&
          lead.plan.length &&
          lead.arrive - f.now <= dmin * 1.2 &&
          f.now <= lead.arrive + 15
        ) {
          ui = newUnit(kIn, lead, members, 'drop', 'arrive');
          ui.phase = 'in';
          ui.slot = -1;
          go(ui, pathDropIn(-1), lead.arrive - dmin * 1.1, f);
        } else if (fresh && !ui && !away && atEntry && !leaving && !units.has(kOut)) {
          // 跳时刻进来的：人刚下车，车停在落客点
          ui = newUnit(kIn, lead, members, 'drop', 'arrive');
          ui.slot = Math.max(0, freeSlot(ui));
          ui.phase = 'stop';
          place(ui, slotPose(ui.slot));
        }
        if (ui) {
          ui.seen = true;
          // 一直没能从画外开出来（车道排满了），人已经下车走开了：这一趟不用画了
          if (ui.phase === 'in' && !ui.started && f.now > ui.t0 && !away && !atEntry) {
            freeUnit(ui);
            ui = undefined;
          } else dropIn(ui, f, dt);
        }
        if (ui) {
          // 人都下车走开了（或者一直没进来）：开走
          const stuck = away && f.now > lead.arrive + 15;
          if (ui.phase === 'stop' && ((!atEntry && !away) || stuck || gone || leaving)) {
            ui.phase = 'out';
            go(ui, pathDropOut(ui.slot), f.now, f);
          }
          if (ui.phase === 'out') {
            drive(ui, f, dt);
            if (!ui.drive) {
              freeUnit(ui);
              ui = undefined;
            }
          }
          if (ui) {
            ui.door = atEntry && ui.phase === 'stop' && ui.trip === 'arrive' && !leaving;
            if (!leaving) standAtCar(f, ui, entry);
          }
        }
        // 要走：从东边开来接（人走到落客点的时候正好到）
        let uo = units.get(kOut);
        if (!uo && leaving && !gone) {
          uo = newUnit(kOut, lead, members, 'drop', 'depart');
          uo.phase = 'in';
          uo.slot = -1;
          const t1 = w.kind === 'travel' ? w.t1 : f.now;
          if (fresh && w.kind === 'at' && w.at === entry) {
            // 跳时刻进来的：车已经在等
            uo.slot = Math.max(0, uo.slot);
            uo.phase = 'stop';
            place(uo, slotPose(uo.slot));
          } else go(uo, pathDropIn(-1), Math.max(f.now, t1 - dmin * 1.1), f);
        }
        if (uo) {
          uo.seen = true;
          // 一直没能从画外开出来，人已经走了（引擎里上了车）：这一趟不用画了
          if (uo.phase === 'in' && !uo.started && gone) {
            freeUnit(uo);
            continue;
          }
          dropIn(uo, f, dt);
          if (gone && uo.phase === 'stop') {
            uo.phase = 'out';
            go(uo, pathDropOut(uo.slot), f.now, f);
          }
          if (uo.phase === 'out') {
            drive(uo, f, dt);
            if (!uo.drive) {
              freeUnit(uo);
              continue;
            }
          }
          uo.door = atEntry && uo.phase === 'stop';
          standAtCar(f, uo, entry);
        }
      }
      // 状态里没有了的（换天以后的残余）
      for (const u of [...units.values()]) if (!u.seen) freeUnit(u);

      // ── 画：取景附近的车给身子 ──
      const big = f.view.x1 - f.view.x0 > 140;
      makeBudget = 1;
      st.units = units.size;
      st.parked = st.moving = st.overlaps = 0;
      const list = [...units.values()];
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (!present(u, f.now)) continue;
        if (u.phase === 'stop') st.parked++;
        else st.moving++;
        // 自检：叠在一起的车（应该一直是 0）
        for (let j = i + 1; j < list.length; j++) {
          const o = list[j];
          if (!present(o, f.now) || Math.abs(o.x - u.x) > 6 || Math.abs(o.z - u.z) > 6) continue;
          if (overlap(boxOf(u, u.x, u.z, u.rot), boxOf(o, o.x, o.z, o.rot))) {
            st.overlaps++;
            if (st.overlapPairs.length < 12)
              st.overlapPairs.push(
                `${u.key}/${u.phase}@${u.x.toFixed(1)},${u.z.toFixed(1)} × ${o.key}/${o.phase}@${o.x.toFixed(1)},${o.z.toFixed(1)}`,
              );
          }
        }
      }
      if (st.overlaps) st.overlapFrames++;
      st.mismatch = 0;
      for (const u of list) {
        const L = s.agents[u.lead];
        if (u.mode === 'lot' && u.phase === 'stop' && L && L.where.kind !== 'away' && engineStall(L) !== u.stall)
          st.mismatch++;
      }
      for (const u of units.values()) {
        const want = !big && present(u, f.now) && inRect(f.view, u.x, u.z, 6);
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
      const s0 = lastS;
      const drops = [...units.values()].filter((u) => u.mode === 'drop').map((u) => `${u.key}:${u.phase}:${u.slot}`);
      // 在等的车：谁、在哪、等谁（查堵车）
      const jam = [...units.values()]
        .filter((u) => u.by || (u.drive && u.v === 0 && present(u)))
        .sort((a, b) => +(b === TOK.x.holder) - +(a === TOK.x.holder))
        .slice(0, 16)
        .map(
          (u) =>
            `${u.key.slice(-8)}/${u.phase}${u.drive ? `#${u.drive.i}${u.drive.paths[u.drive.i]?.rev ? 'R' : ''}@${u.drive.s.toFixed(1)}` : ''} (${u.x.toFixed(1)},${u.z.toFixed(1)}) by ${u.by?.key.slice(-8) ?? '-'} ${u.blocked.toFixed(1)}s`,
        );
      const gap = Object.entries(TOK).map(([k, t]) => {
        const g = t.holder;
        return `${k}: ${g ? `${g.key.slice(-8)}/${g.phase} (${g.x.toFixed(1)},${g.z.toFixed(1)}) by ${g.by?.key.slice(-8) ?? '-'}` : '-'} q${t.queue.length}`;
      });
      const slots = [...units.values()]
        .filter((u) => u.mode === 'drop' && u.slot >= 0 && u.phase !== 'out')
        .map(
          (u) =>
            `${u.key.slice(-10)}:${u.phase}:${u.slot}:${s0?.agents[u.lead]?.where.kind ?? '?'}/${s0?.agents[u.lead]?.doing ?? '?'}`,
        );
      return {
        ...st,
        overlapPairs: [...st.overlapPairs],
        pool: pool.length,
        live: live.length,
        drops: drops.length,
        slots,
        jam,
        gap,
      };
    },
    /** 预热：先建一辆放进池子（第 i 辆：三辆里一辆 SUV，车漆轮着来；建一辆 ~1 毫秒），给 fx 的 prewarm 摆到画面里渲染一次 */
    prewarm(k, i) {
      const c = makeCar(k, i % 3 === 2 ? 'suv' : 'car', i);
      pool.push(c);
      return c.obj;
    },
  };
}
