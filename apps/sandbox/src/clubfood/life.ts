// clubfood 的院子日常（演出，没有模拟；种子随机流，不用 Math.random）。clubfood.md「玩法计划」+ 用户 2026-11-09 定的 7 条：
// - 客人：从长廊（东 / 西）或会所拱廊进来 → 挑一家（队短的、自己爱吃的；孩子先去冰棍车）→ 排队 → 摊主出餐（feed / pour）
//   → 端着托盘（push 姿势，托盘在两手中间）或拿着杯子找座：凉棚下的长桌 → 野餐桌 → 站在花盆边吃 → 坐 25～50 秒（吃 = sip）
//   → 大部分人去回收站扔垃圾、把托盘放回回收台；三成的人把脏托盘留在桌上（总监的活）。
// - 八家：咖啡车、塔可车、窑烤披萨车、银色汉堡拖车（有存货，卖一份少一点；< 0.3 摊主喊缺货，卖光就关窗）、
//   鲜果水、冰棍三轮、吉事果车、奶茶三轮（小推车，不缺货）。
// - 午饭高峰（每 170 秒一轮，45～125 秒；开局那一波客人吃完才来）：来客变快、多数人要塔可；塔可车队伍 ≥ 5 → "人手不够！"。总监走进塔可车站到窗口后面按住"出餐" = 出餐快一倍。
// - 三色回收站慢慢满（每次扔垃圾）；满了盖子顶起来、地上掉垃圾、拟八哥来翻、客人皱眉。
// - 拟八哥 4 只：盯着桌上的脏托盘、满了的垃圾桶；有人走近 1.3 米 → 飞到凉棚梁上，10 秒后回来。
// - 孩子在草皮角扔沙包（serve 的低手扔，沙包沿抛物线落进洞 / 板上 / 草上），扔完四只去捡；另一个孩子偶尔推倒叠叠乐，家长去码好。
// - 球员出场：每 80 秒两个人从会所拱廊沿球员通道走到中心球场的球员拱门，长桌上的人转头看。
// 总监的活（倒垃圾、收托盘、补货、上塔可车帮忙）由 play.ts 登记成互动点，活本身在这里（jobs）；
// ?play=0&life=1 的看戏模式由这里的 directorDemo 自己走过去做（截图、连拍用）。
import * as THREE from 'three';
import { type Circle, NavMap } from '../clubsite/play';
import type { AssetCtx } from './ctx';
import {
  PERGOLA,
  PICNIC_XS,
  PICNIC_Z,
  PLAYERS_GATE,
  SPOTS,
  TABLE,
  TABLE_ROWS,
  TABLE_XS,
  TRUCKS,
  type V2,
} from './layout';
import { foodNavSpec, tacoInside, toWorld } from './navspec';

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const TAU = Math.PI * 2;
const turnTo = (a: number, b: number, k: number) => {
  let d = b - a;
  d -= Math.round(d / TAU) * TAU;
  return a + d * Math.min(1, k);
};
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(b.x - a.x, b.z - a.z);
const yawTo = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.atan2(b.x - a.x, b.z - a.z);
const smooth = (u: number) => {
  const k = clamp(u, 0, 1);
  return k * k * (3 - 2 * k);
};

type Co = Generator<void, void, number>;

// ── 对外的接口 ─────────────────────────────────────────
export interface LifeEnv {
  scene: THREE.Object3D;
  ctx: AssetCtx;
  slot(id: string): THREE.Object3D | undefined;
  make(asset: string, variant: number): THREE.Object3D;
  groundAt(x: number, z: number): number;
  /** 玩法模式：总监交给玩家（不跑 directorDemo） */
  play: boolean;
  /** 来客速度倍数（?guests=） */
  rate?: number;
  /** 玩法模式：气泡交给 play.say / play.bubble */
  say?(obj: THREE.Object3D, text: string, sec: number, dy: number): void;
  bubble?(key: string, anchor: THREE.Object3D | (() => THREE.Vector3 | null) | null, text?: string, dy?: number): void;
}

export type StallId = 'coffee' | 'taco' | 'pizza' | 'burger' | 'agua' | 'paleta' | 'churro' | 'boba';
export const STALL_ZH: Record<StallId, string> = {
  coffee: '咖啡车',
  taco: '塔可车',
  pizza: '披萨车',
  burger: '汉堡车',
  agua: '鲜果水',
  paleta: '冰棍车',
  churro: '吉事果',
  boba: '奶茶车',
};
/** 有存货的四辆车（补货的活） */
export const STOCKED: StallId[] = ['coffee', 'taco', 'pizza', 'burger'];

/** 桌上一只脏托盘（总监收） */
export interface DirtyRef {
  readonly id: number;
  readonly pos: V3;
}

export interface FoodState {
  sold: number;
  /** 满意度 0..100（演出用：脏托盘、满垃圾桶、卖光的车、长队、鸟在桌上） */
  mood: number;
  dirty: number;
  bins: number[];
  stock: Record<StallId, number>;
  tacoQueue: number;
  rush: boolean;
  helping: boolean;
  seated: number;
  guests: number;
  birdsOnFood: number;
}

export interface Jobs {
  director: THREE.Object3D;
  // 倒垃圾
  bins(): number[];
  binAt(): V3;
  /** 换袋子：把第 i 只（不给 = 最满的）倒空，返回倒了多满 */
  bagOut(i?: number): number;
  kitchenDoor(): V3;
  // 收托盘
  dirty(): DirtyRef[];
  nearestDirty(p: V3, max: number): DirtyRef | null;
  /** 收一只（返回成功）；收回来的叠在总监手上（stack） */
  collect(ref: DirtyRef): boolean;
  stack(): number;
  /** 放回回收台：返回放了几只 */
  returnStack(): number;
  trayReturnAt(): V3;
  /** 总监手上那摞托盘（玩法模式 post 里跟着手） */
  stackObj: THREE.Object3D;
  // 补货
  stock(id: StallId): number;
  /** 车后面卸货的地面点（世界） */
  backOf(id: StallId): V3;
  restock(id: StallId): void;
  handTruck: THREE.Object3D | null;
  truckLoad(): number;
  setTruckLoad(n: number): void;
  supplyAt(): V3;
  // 帮忙
  helperAt(): V3;
  setHelping(on: boolean): void;
  rush(): boolean;
  tacoQueue(): number;
  say(text: string, s?: number): void;
}

export interface FoodLife {
  update(dt: number): void;
  /** play.update 之后调（总监手上的托盘跟着手） */
  post(): void;
  state: FoodState;
  /** 会动的人（导航把他们当成圆） */
  people(): Circle[];
  debug(): unknown;
  jobs: Jobs;
  /** 测试 / 截图：马上开始一轮高峰 */
  startRush(): void;
}

// ── 实现 ─────────────────────────────────────────────
interface Actor {
  obj: THREE.Object3D;
  pos: V3;
  yaw: number;
  walkPh: number;
  name: string;
  kid: boolean;
  /** 端着的托盘（跟着两只手）/ 拿着的杯子 */
  tray: THREE.Object3D | null;
  cup: boolean;
  seat: Seat | null;
  /** 头转向（球员出场时） */
  looking: number;
  /** 调试：在干什么 */
  doing: string;
}
const pose = (a: Actor, n: string, ph?: number) => a.obj.userData.pose?.(n, ph);

interface Seat {
  pos: V3;
  yaw: number;
  /** 从哪走过去坐（长凳外侧的过道上） */
  stand: V3;
  /** 托盘放在桌上的哪 */
  trayAt: V3;
  table: number;
  h: number;
  who: Actor | null;
  /** 这个位子前面桌上有一只脏托盘 */
  dirty: Dirty | null;
}
interface Dirty extends DirtyRef {
  id: number;
  pos: V3;
  obj: THREE.Object3D;
  seat: Seat;
}

interface Stall {
  id: StallId;
  obj: THREE.Object3D | undefined;
  vendor: Actor | null;
  /** 客人点餐站的地面点 + 队伍往后排的折线（世界） */
  line: V3[];
  queue: Actor[];
  served: Set<Actor>;
  /** 给托盘（吃的，托盘变体）还是杯子 */
  gives: { tray: number } | 'cup';
  serveT: number;
  weight: number;
  stock: number;
  closed: boolean;
  /** 窗台（托盘从这里递出来） */
  sill: V3;
  back: V3;
  maxQ: number;
}

interface Bird {
  obj: THREE.Object3D;
  pos: V3;
  yaw: number;
  mode: 'ground' | 'fly' | 'perch';
  fly: { t: number; dur: number; from: V3; to: V3; arc: number; land: 'ground' | 'perch' } | null;
  timer: number;
  peck: number;
  /** 在啄哪个（脏托盘 / 垃圾桶 i / 地上） */
  on: Dirty | number | null;
  idx: number;
}

export function createLife(env: LifeEnv): FoodLife {
  const { scene, ctx } = env;
  const R = (k: string) => ctx.rng(`food-life:${k}`);
  const rG = R('guest');
  const rS = R('stall');
  const rB = R('bird');
  const rK = R('kid');
  const rnd = (r: () => number, a: number, b: number) => a + (b - a) * r();
  let now = 0;
  const rate = env.rate ?? 1;
  const drive = !env.play;

  // 客人的导航（塔可车整辆挡着）
  const nav = new NavMap(foodNavSpec(scene, env.groundAt, false));
  const free = (x: number, z: number): V3 => {
    const p = nav.nearestFree(x, z, 2.5);
    return p ? v(p[0], env.groundAt(p[0], p[1]), p[1]) : v(x, env.groundAt(x, z), z);
  };

  // ── 气泡 ─────────────────────────────────────────
  const say = (a: Actor | THREE.Object3D, text: string, s = 2.2, dy?: number) => {
    const obj = 'obj' in a ? a.obj : a;
    const h = dy ?? ('kid' in a && a.kid ? 1.55 : 'seat' in a && a.seat ? 1.75 : 2.15);
    env.say?.(obj, text, s, h);
  };

  // ── 人 ──────────────────────────────────────────
  const people: Actor[] = [];
  const mkActor = (obj: THREE.Object3D, name: string, kid = false): Actor => {
    const a: Actor = {
      obj,
      pos: obj.position.clone(),
      yaw: obj.rotation.y,
      walkPh: 0,
      name,
      kid,
      tray: null,
      cup: false,
      seat: null,
      looking: 0,
      doing: '',
    };
    people.push(a);
    return a;
  };
  const person = (id: string, name = id): Actor | null => {
    const o = env.slot(id);
    if (!o) return null;
    return mkActor(o, name, o.userData.asset === 'kid');
  };
  const sync = (a: Actor) => {
    a.obj.position.copy(a.pos);
    a.obj.rotation.y = a.yaw;
  };

  // 协程
  const bg: Co[] = [];
  const spawn = (c: Co) => {
    c.next(0);
    bg.push(c);
  };
  function* wait(s: number): Co {
    let t = 0;
    while (t < s) t += yield;
  }
  function* until(cond: () => boolean, max = 60): Co {
    let t = 0;
    while (!cond() && t < max) t += yield;
  }
  /** 沿折线走（米/秒）；走路姿势按步子；端着托盘 = push */
  function* walkPts(a: Actor, pts: V3[], speed = 1.25): Co {
    const stride = a.kid ? 0.9 : 1.25;
    for (const p of pts) {
      while (true) {
        const dt = yield;
        const dx = p.x - a.pos.x;
        const dz = p.z - a.pos.z;
        const L = Math.hypot(dx, dz);
        const step = speed * dt;
        if (L <= step) {
          a.pos.set(p.x, env.groundAt(p.x, p.z), p.z);
          break;
        }
        a.pos.x += (dx / L) * step;
        a.pos.z += (dz / L) * step;
        a.pos.y = env.groundAt(a.pos.x, a.pos.z);
        a.yaw = turnTo(a.yaw, Math.atan2(dx, dz), dt * 9);
        a.walkPh = (a.walkPh + step / stride) % 1;
        pose(a, a.tray ? 'push' : 'walk', a.walkPh);
      }
    }
  }
  /**
   * 寻路走到 (x, z)（导航网格的 A*）。起点离网格太远（findPath 只在 1.5 米内找起点，例如从中心球场那条观众路
   * 走进来的人）→ 先直着走到 6 米内最近的能站点，再从那里寻路；还是走不通才直着走。
   */
  function* goTo(a: Actor, to: V3, speed = 1.45): Co {
    a.doing = `go ${to.x.toFixed(1)},${to.z.toFixed(1)}`;
    let path = nav.findPath(a.pos.x, a.pos.z, to.x, to.z);
    if (!path) {
      const s = nav.nearestFree(a.pos.x, a.pos.z, 6);
      const rest = s && nav.findPath(s[0], s[1], to.x, to.z);
      if (s && rest) path = [s, ...rest];
    }
    const pts = path ? path.map(([x, z]) => v(x, 0, z)) : [];
    if (pts.length) pts[pts.length - 1] = to.clone();
    else pts.push(to.clone());
    yield* walkPts(a, pts, speed);
  }
  function* face(a: Actor, yaw: number, s = 0.3): Co {
    let t = 0;
    while (t < s) {
      const dt = yield;
      t += dt;
      a.yaw = turnTo(a.yaw, yaw, dt * 10);
    }
    a.yaw = yaw;
  }
  function* act(a: Actor, name: string, dur: number, from = 0, to = 0.99): Co {
    for (let t = 0; t < dur; ) {
      t += yield;
      pose(a, name, from + (to - from) * clamp(t / dur, 0, 1));
    }
  }

  // ── 托盘（吃的）：一池对象，用的时候拿 ─────────────────────
  const trayPool: THREE.Object3D[] = [];
  const takeTray = (variant: number) => {
    const o = env.make('food-tray', variant);
    o.name = `food-tray:${variant}`;
    scene.add(o);
    return o;
  };
  const getTray = (variant: number) => {
    const i = trayPool.findIndex((o) => o.name === `food-tray:${variant}`);
    const o = i >= 0 ? trayPool.splice(i, 1)[0] : takeTray(variant);
    o.visible = true;
    return o;
  };
  const putTray = (o: THREE.Object3D) => {
    o.visible = false;
    trayPool.push(o);
  };
  /** 端着的托盘跟着两只手（push 姿势的手在腰前） */
  const carryTray = (a: Actor) => {
    if (!a.tray) return;
    const hp = a.obj.userData.handPoint as ((s: 'R' | 'L') => V3) | undefined;
    if (hp) {
      const p = hp('R').add(hp('L')).multiplyScalar(0.5);
      a.tray.position.set(p.x, p.y + 0.02, p.z);
    } else a.tray.position.set(a.pos.x + Math.sin(a.yaw) * 0.38, a.pos.y + 0.95, a.pos.z + Math.cos(a.yaw) * 0.38);
    a.tray.rotation.set(0, a.yaw, 0);
  };

  // ── 座位：凉棚下 6 张长桌（每边 4 个位子）+ 3 张野餐桌（每边 2 个）────────────
  const seats: Seat[] = [];
  TABLE_ROWS.forEach((z, r) => {
    TABLE_XS.forEach((x, k) => {
      for (const side of [-1, 1])
        for (const dx of [-1.5, -0.5, 0.5, 1.5]) {
          const sz = z + side * TABLE.bench;
          seats.push({
            pos: v(x + dx, 0, sz),
            yaw: side < 0 ? 0 : Math.PI,
            stand: v(x + dx, 0, sz + side * 0.62),
            trayAt: v(x + dx, TABLE.h, z + side * 0.2),
            table: r * TABLE_XS.length + k,
            h: TABLE.seat + 0.02,
            who: null,
            dirty: null,
          });
        }
    });
  });
  PICNIC_XS.forEach((x, k) => {
    for (const side of [-1, 1])
      for (const dx of [-0.45, 0.45]) {
        const sz = PICNIC_Z + side * 0.62;
        seats.push({
          pos: v(x + dx, 0, sz),
          yaw: side < 0 ? 0 : Math.PI,
          stand: v(x + dx, 0, sz + side * 0.58),
          trayAt: v(x + dx * 0.9, 0.74, PICNIC_Z + side * 0.18),
          table: TABLE_ROWS.length * TABLE_XS.length + k,
          h: 0.47,
          who: null,
          dirty: null,
        });
      }
  });
  for (const s of seats) {
    const p = free(s.stand.x, s.stand.z);
    s.stand.copy(p);
  }
  const dirtyAt = (table: number) => seats.filter((s) => s.table === table && s.dirty).length;
  /** 一张桌子有 ≥ 2 只脏托盘 → 新来的人不坐那张 */
  const tableOk = (table: number) => dirtyAt(table) < 2;
  const freeSeat = (near: V3): Seat | null => {
    let best: Seat | null = null;
    let bd = Infinity;
    for (const s of seats) {
      if (s.who || s.dirty || !tableOk(s.table)) continue;
      // 先坐凉棚下（荫里），再野餐桌；离得近的优先，带一点随机
      const d = flat(s.stand, near) + (s.table >= 6 ? 6 : 0) + rS() * 4;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };
  const nearestSeat = (p: V3) => {
    let best = seats[0];
    let bd = Infinity;
    for (const s of seats) {
      const d = flat(s.pos, p);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };

  // 脏托盘
  const dirties: Dirty[] = [];
  let dirtyId = 0;
  /** 桌上留一只脏托盘：吃完的托盘换成脏的变体（v4）；keep = 原样留着（一开始那盘薯条，鸟来偷） */
  const leaveDirty = (s: Seat, obj?: THREE.Object3D, keep = false) => {
    if (s.dirty) {
      if (obj) putTray(obj);
      return;
    }
    let d: THREE.Object3D;
    if (obj && keep) d = obj;
    else {
      if (obj) putTray(obj);
      d = getTray(4);
    }
    d.position.copy(s.trayAt);
    d.rotation.set(0, s.yaw + (rS() - 0.5) * 0.5, 0);
    const ref: Dirty = { id: dirtyId++, pos: s.trayAt.clone(), obj: d, seat: s };
    s.dirty = ref;
    dirties.push(ref);
  };
  const removeDirty = (d: Dirty) => {
    const i = dirties.indexOf(d);
    if (i < 0) return false;
    dirties.splice(i, 1);
    d.seat.dirty = null;
    putTray(d.obj);
    return true;
  };

  // ── 回收站、回收台、补货堆、手推车 ─────────────────────────
  const binObj = env.slot('bin-station');
  const bins = [0.55, 0.35, 0.7];
  const setBins = () => binObj?.userData.setFill?.(bins.slice());
  setBins();
  const binFront = binObj
    ? (() => {
        const f = binObj.userData.spots?.front as [number, number] | undefined;
        const p = f ? toWorld(binObj, f[0], f[1]) : v(SPOTS.bins[0] + 1.7, 0, SPOTS.bins[1] + 0.55);
        return free(p.x, p.z);
      })()
    : free(SPOTS.bins[0] + 1.7, SPOTS.bins[1] + 0.55);
  const binLid = (i: number) => {
    const f = binObj?.userData.lid as ((i: number) => V3 | number[]) | undefined;
    if (binObj && f) {
      const l = f(i);
      const p = l instanceof THREE.Vector3 ? l.clone() : v(l[0], l[1], l[2]);
      binObj.updateMatrixWorld(true);
      return binObj.localToWorld(p);
    }
    const x = (binObj?.position.x ?? -37) + (i - 1) * 0.68;
    return v(x, 0.98, binObj?.position.z ?? -22.85);
  };

  // 满了：地上掉的垃圾（几块纸、杯子）
  const litter = new THREE.Group();
  litter.name = 'food-litter';
  {
    const paper = ctx.mat('clothWhite', { noShadowReceive: true, edge: 0.3, convex: 0 });
    const red = ctx.mat('flowerRed', { noShadowReceive: true, edge: 0.3, convex: 0 });
    const g = new THREE.BoxGeometry(0.22, 0.06, 0.18);
    const bx = binObj?.position.x ?? -37;
    const bz = binObj?.position.z ?? -22.85;
    const spots: [number, number, number][] = [
      [-0.55, 0.55, 0.3],
      [0.35, 0.7, -0.4],
      [1.15, 0.45, 0.9],
      [-1.2, 0.35, 1.2],
    ];
    spots.forEach(([dx, dz, r], i) => {
      const m = new THREE.Mesh(g, i % 3 === 1 ? red : paper);
      m.position.set(bx + dx, 0.03, bz + dz);
      m.rotation.y = r;
      m.castShadow = false;
      litter.add(m);
    });
    litter.visible = false;
    scene.add(litter);
  }
  const trayRet = env.slot('tray-return');
  let trayRetCount = 4;
  trayRet?.userData.setCount?.(trayRetCount);
  const trayRetFront = trayRet
    ? (() => {
        const f = trayRet.userData.spots?.front as [number, number] | undefined;
        const p = f ? toWorld(trayRet, f[0], f[1]) : v(SPOTS.trayReturn[0], 0, SPOTS.trayReturn[1]);
        return free(p.x, p.z);
      })()
    : free(SPOTS.trayReturn[0], SPOTS.trayReturn[1]);
  // 客人还托盘站在回收台南头（本地 −x 0.6 米），正中那个位子留给总监（trayReturnAt）
  const trayRetGuest = (() => {
    const f = trayRet?.userData.spots?.front as [number, number] | undefined;
    if (!trayRet || !f) return trayRetFront;
    const p = toWorld(trayRet, f[0] - 0.6, f[1]);
    return free(p.x, p.z);
  })();
  const handTruck = env.slot('hand-truck') ?? null;
  let truckLoad = 0;
  handTruck?.userData.setLoad?.(0);
  const supplyAt = free(SPOTS.supply[0] + 0.2, SPOTS.supply[1] + 0.85);
  const kitchenDoor = free(SPOTS.kitchenDoor[0] + 0.5, SPOTS.kitchenDoor[1]);

  // ── 八家 ─────────────────────────────────────────
  const T = TRUCKS;
  const spotW = (obj: THREE.Object3D | undefined, key: string, fb: V2): V3 => {
    const s = obj?.userData.spots?.[key] as [number, number] | undefined;
    if (obj && s) return toWorld(obj, s[0], s[1]);
    return v(fb[0], 0, fb[1]);
  };
  const sillW = (obj: THREE.Object3D | undefined, fb: V3): V3 => {
    const s = obj?.userData.sill as [number, number, number] | undefined;
    return obj && s ? toWorld(obj, s[0], s[2], s[1]) : fb;
  };
  /** 队伍：点餐点 + 往后的折线（相对点餐点的偏移，米），每 0.85 米一个位子 */
  const queueLine = (start: V3, bends: V2[], n: number): V3[] => {
    const pts: V3[] = [start];
    let last = start;
    for (const [dx, dz] of bends) {
      const p = v(last.x + dx, 0, last.z + dz);
      pts.push(p);
      last = p;
    }
    const out: V3[] = [];
    let seg = 0;
    let u = 0;
    for (let k = 0; k < n; k++) {
      // 第 k 个位子离起点 0.85·k 米（沿折线）
      let need = k === 0 ? 0 : 0.85;
      while (k > 0 && seg < pts.length - 1) {
        const L = flat(pts[seg], pts[seg + 1]);
        const left = L * (1 - u);
        if (need <= left) {
          u += need / L;
          break;
        }
        need -= left;
        seg++;
        u = 0;
      }
      const a = pts[Math.min(seg, pts.length - 1)];
      const b = pts[Math.min(seg + 1, pts.length - 1)];
      const p = v(a.x + (b.x - a.x) * u, 0, a.z + (b.z - a.z) * u);
      out.push(free(p.x, p.z));
    }
    return out;
  };
  const mkStall = (
    id: StallId,
    slotId: string,
    vendorId: string | null,
    fbWindow: V2,
    bends: V2[],
    o: { gives: Stall['gives']; serveT: number; weight: number; maxQ: number },
  ): Stall => {
    const obj = env.slot(slotId);
    const w = spotW(obj, 'window', fbWindow);
    const win = free(w.x, w.z);
    const vendor = vendorId ? person(vendorId, `${STALL_ZH[id]}摊主`) : null;
    const back = spotW(obj, 'back', [win.x, win.z - 3.2]);
    return {
      id,
      obj,
      vendor,
      line: queueLine(win, bends, o.maxQ),
      queue: [],
      served: new Set(),
      gives: o.gives,
      serveT: o.serveT,
      weight: o.weight,
      stock: STOCKED.includes(id) ? 1 : Number.POSITIVE_INFINITY,
      closed: false,
      sill: sillW(obj, v(win.x, 1.4, win.z - 0.5)),
      back: free(back.x, back.z),
      maxQ: o.maxQ,
    };
  };
  const stalls: Stall[] = [
    mkStall(
      'coffee',
      'truck-coffee',
      'vendor-coffee',
      SPOTS.orderCoffee,
      // 往南排、别贴着东翼墙拐：墙根那条是总监去厨房后门（kitchenDoor）的路，第 4 位以前正好站在门口
      [
        [-0.3, 0.9],
        [0, 1.2],
        [0.3, 1.6],
      ],
      { gives: 'cup', serveT: 6.3, weight: 1.0, maxQ: 5 },
    ),
    mkStall(
      'taco',
      'truck-taco',
      'vendor-taco',
      SPOTS.orderTaco,
      [
        [-0.4, 1.0],
        [-3.6, 0.2],
      ],
      { gives: { tray: 0 }, serveT: 8.2, weight: 1.4, maxQ: 8 },
    ),
    mkStall(
      'pizza',
      'truck-pizza',
      'vendor-pizza',
      SPOTS.orderPizza,
      [
        [-0.3, 1.0],
        [-2.4, 0.3],
      ],
      { gives: { tray: 1 }, serveT: 9.0, weight: 1.1, maxQ: 5 },
    ),
    mkStall(
      'burger',
      'trailer-burger',
      'vendor-burger',
      [-40.9, -22.6],
      [
        [0.3, 0.9],
        [0.2, 0.9],
        [0.2, 0.9],
      ],
      { gives: { tray: 2 }, serveT: 8.6, weight: 1.0, maxQ: 4 },
    ),
    mkStall(
      'agua',
      'agua',
      'vendor-agua',
      [-24.6, -33.1],
      [
        [-0.4, 0.8],
        [-0.4, 0.8],
      ],
      { gives: 'cup', serveT: 5.1, weight: 0.8, maxQ: 3 },
    ),
    mkStall(
      'paleta',
      'cart-paletas',
      'vendor-paleta',
      [-24.9, -28.3],
      [
        [-0.6, 0.6],
        [-0.6, 0.6],
      ],
      { gives: 'cup', serveT: 3.9, weight: 0.6, maxQ: 3 },
    ),
    mkStall(
      'churro',
      'cart-churros',
      'vendor-churro',
      [-26.6, -11.4],
      [
        [-0.4, 0.8],
        [-0.4, 0.7],
      ],
      { gives: 'cup', serveT: 4.7, weight: 0.7, maxQ: 3 },
    ),
    mkStall(
      'boba',
      'tuktuk-boba',
      'vendor-boba',
      [-39.6, -13.1],
      [
        [0.4, 0.8],
        [0.4, 0.7],
      ],
      { gives: 'cup', serveT: 5.4, weight: 0.8, maxQ: 3 },
    ),
  ];
  const stallOf = (id: StallId) => stalls.find((s) => s.id === id) as Stall;
  const syncStock = (s: Stall) => {
    if (Number.isFinite(s.stock)) s.obj?.userData.setStock?.(clamp(s.stock, 0, 1));
  };
  // 披萨窑一直冒烟；凉棚、串灯白天不亮
  stallOf('pizza').obj?.userData.setSmoke?.(1);
  scene.traverse((o) => {
    if (o.name === 'slot:pergola' || o.name.startsWith('slot:festoon')) o.userData.setLit?.(0);
  });

  // ── 高峰 ─────────────────────────────────────────
  const RUSH_CYCLE = 170;
  const RUSH: [number, number] = [45, 125];
  let rushOffset = 0;
  const rushNow = () => {
    const t = (now + rushOffset) % RUSH_CYCLE;
    return t >= RUSH[0] && t < RUSH[1];
  };
  let helping = false;
  const helpRate = () => (helping ? 2 : 1);

  // ── 摊主：等队头站到点餐点 → 出餐（feed / pour）→ 递出去 ──────────────
  function* vendorLoop(s: Stall): Co {
    const vd = s.vendor;
    if (vd) {
      vd.obj.userData.setProp?.(null);
      pose(vd, 'idle');
    }
    while (true) {
      yield* until(() => !!s.queue[0] && flat(s.queue[0].pos, s.line[0]) < 0.2 && !s.served.has(s.queue[0]), 9999);
      const buyer = s.queue[0];
      const cup = s.gives === 'cup';
      let t = 0;
      if (vd && cup) vd.obj.userData.setProp?.('cup');
      while (t < s.serveT) {
        const dt = yield;
        t += dt * (s.id === 'taco' ? helpRate() : 1);
        if (vd) pose(vd, cup ? 'pour' : 'feed', (((t / (cup ? 1.2 : 1.6)) % 1) + 1) % 1);
      }
      if (vd) {
        vd.obj.userData.setProp?.(null);
        pose(vd, 'idle');
      }
      handOut(s, buyer);
      yield* until(() => s.queue[0] !== buyer, 10);
      yield* wait(0.3);
    }
  }
  /** 递出去：托盘出现在窗台、再到客人手上；存货少一点 */
  const handOut = (s: Stall, buyer: Actor) => {
    if (s.gives === 'cup') {
      buyer.obj.userData.setProp?.('cup');
      buyer.cup = true;
    } else {
      buyer.obj.userData.setProp?.(null);
      buyer.tray = getTray(s.gives.tray);
    }
    if (Number.isFinite(s.stock)) {
      s.stock = Math.max(0, s.stock - (s.id === 'taco' ? 0.04 : 0.05));
      syncStock(s);
      if (s.stock <= 0) {
        s.closed = true;
        if (s.vendor) say(s.vendor, '卖光了！', 2.6);
      }
    }
    state.sold++;
    s.served.add(buyer);
  };
  // 高峰帮忙：总监站在塔可车窗口后面按住"出餐"（play.ts）或者看戏模式自己去

  // ── 客人 ─────────────────────────────────────────
  type Stage = 'hidden' | 'queue' | 'carry' | 'seated' | 'enter';
  const guests: Actor[] = [];
  const ENTRIES: V3[] = [
    free(-37.0, -6.6), // 长廊西（西步道口）
    free(-21.2, -6.8), // 长廊东（从中心球场、广场过来）
    free(-44.2, -22.6), // 会所拱廊
    free(-36.5, -3.4), // 西步道（泳池、会员场）
    free(-21.0, -21.0), // 球员通道东头（中心球场那边过来）
  ];
  const pickStall = (a: Actor): Stall | null => {
    const rush = rushNow();
    let total = 0;
    const w = stalls.map((s) => {
      if (s.closed || s.queue.length >= s.maxQ) return 0;
      let k = s.weight / (1 + 0.45 * s.queue.length);
      if (a.kid) k *= s.id === 'paleta' || s.id === 'churro' ? 3 : 0.4;
      if (rush) k *= s.id === 'taco' ? 3.2 : 0.7;
      total += k;
      return k;
    });
    if (total <= 0) return null;
    let x = rG() * total;
    for (let i = 0; i < stalls.length; i++) {
      x -= w[i];
      if (x <= 0 && w[i] > 0) return stalls[i];
    }
    return stalls.find((_, i) => w[i] > 0) ?? null;
  };
  function* queueAt(a: Actor, s: Stall): Co {
    // 先走到队尾附近再排进去（不然排在第一个的人还在长廊上，整队干等）
    if (!s.queue.includes(a)) {
      const tail = s.line[Math.min(s.queue.length, s.line.length - 1)];
      if (flat(a.pos, tail) > 1.5) yield* goTo(a, free(tail.x - 0.6, tail.z + 0.9), 1.35);
      if (s.closed || s.queue.length >= s.maxQ) return;
      s.queue.push(a);
    }
    while (true) {
      const i = s.queue.indexOf(a);
      if (i < 0) return;
      const spot = s.line[Math.min(i, s.line.length - 1)];
      if (flat(a.pos, spot) > 0.08) {
        yield* goTo(a, spot, 1.15);
        const look = s.queue[i - 1]?.pos ?? s.sill;
        yield* face(a, yawTo(a.pos, look), 0.25);
        pose(a, 'idle');
      }
      if (i === 0) break;
      // 车卖光了：队里的人散了
      if (s.closed) {
        s.queue.splice(s.queue.indexOf(a), 1);
        say(a, '卖光了？', 1.8);
        return;
      }
      yield* until(() => s.queue.indexOf(a) < i || s.closed, 40);
    }
    yield* until(() => s.served.has(a) || s.closed, 40);
    s.served.delete(a);
    const i = s.queue.indexOf(a);
    if (i >= 0) s.queue.splice(i, 1);
  }
  function* sitDown(a: Actor, s: Seat): Co {
    s.who = a;
    a.seat = s;
    yield* goTo(a, s.stand);
    yield* face(a, s.yaw, 0.3);
    a.pos.copy(s.pos);
    a.obj.userData.setSeat?.(s.h);
    if (a.tray) {
      a.tray.position.copy(s.trayAt);
      a.tray.rotation.set(0, s.yaw, 0);
    }
    state.seated++;
  }
  function* eating(a: Actor, dur: number): Co {
    let t = 0;
    let complained = false;
    pose(a, 'sip');
    while (t < dur) {
      const dt = yield;
      t += dt;
      // 一口一口：sip 一遍 4 秒，中间偶尔停下来坐着
      const ph = (t / 4) % 1;
      pose(a, t % 11 > 8 ? 'sit' : 'sip', t % 11 > 8 ? (t / 3.2) % 1 : ph);
      if (!complained && t > 4) {
        const s = a.seat;
        const birdNear = s && birds.some((b) => b.mode === 'ground' && flat(b.pos, s.pos) < 2.2);
        const dirtyNear = s && seats.some((o) => o.table === s.table && o.dirty);
        if (birdNear || (dirtyNear && rG() < 0.004) || (litter.visible && flat(a.pos, binFront) < 6 && rG() < 0.003)) {
          complained = true;
          say(a, birdNear ? '去！去！' : litter.visible && flat(a.pos, binFront) < 6 ? '好臭…' : '桌子好脏', 2.2);
        }
      }
    }
  }
  function* standUp(a: Actor, leaveTray: boolean): Co {
    const s = a.seat;
    a.obj.userData.setSeat?.(null);
    a.obj.userData.lookAt?.(null);
    if (s) {
      s.who = null;
      a.seat = null;
      state.seated--;
      a.pos.copy(s.stand);
      if (a.tray && leaveTray) {
        leaveDirty(s, a.tray);
        a.tray = null;
      }
    }
    pose(a, 'idle');
    yield* wait(0.25);
  }
  /** 扔垃圾、还托盘 */
  function* cleanUp(a: Actor): Co {
    const i = a.cup ? (rG() < 0.7 ? 1 : 0) : rG() < 0.6 ? 2 : 0;
    const lid = binLid(i);
    // 总监换袋子站在中间那只桶前（binFront）：客人往旁边让 0.6 米（伸手还够得着桶口），别占着那个位子
    let gx = lid.x + rnd(rG, -0.2, 0.2);
    const gz = lid.z + 0.75;
    if (Math.abs(gx - binFront.x) < 0.6 && Math.abs(gz - binFront.z) < 0.6)
      gx = binFront.x + (gx < binFront.x ? -0.6 : 0.6);
    yield* goTo(a, free(gx, gz));
    yield* face(a, Math.PI, 0.25);
    yield* act(a, 'dump', 1.1, 0, 0.99);
    bins[i] = Math.min(1.15, bins[i] + (a.cup ? 0.025 : 0.04));
    setBins();
    if (a.cup) {
      a.obj.userData.setProp?.(null);
      a.cup = false;
    }
    if (bins[i] >= 1 && rG() < 0.5) say(a, '桶满了…', 2);
    if (a.tray) {
      yield* goTo(a, trayRetGuest);
      yield* face(a, yawTo(a.pos, trayRet?.position ?? a.pos), 0.25);
      yield* act(a, 'pickup', 0.6, 0.2, 0.6);
      putTray(a.tray);
      a.tray = null;
      trayRetCount = Math.min(12, trayRetCount + 1);
      trayRet?.userData.setCount?.(trayRetCount);
    }
  }
  function* leave(a: Actor): Co {
    // 从最近的口出去（七成）或者随便一个口
    const near = ENTRIES.slice().sort((p, q) => flat(p, a.pos) - flat(q, a.pos))[0];
    const exit = rG() < 0.7 ? near : ENTRIES[Math.floor(rG() * ENTRIES.length)];
    yield* goTo(a, exit, 1.5);
    if (a.tray) {
      putTray(a.tray);
      a.tray = null;
    }
    a.obj.userData.setProp?.(null);
    a.cup = false;
    a.obj.visible = false;
  }
  /** 一个客人的一轮（从 start 那一步开始） */
  function* guestLoop(a: Actor, start: Stage, stall?: Stall): Co {
    let stage = start;
    while (true) {
      if (stage === 'hidden') {
        a.obj.visible = false;
        a.obj.userData.setSeat?.(null);
        yield* wait((rushNow() ? rnd(rG, 1, 4) : rnd(rG, 3, 10)) / rate);
        // 院子里同时最多 ~28 个客人；高峰时多来
        yield* until(() => guests.filter((x) => x.obj.visible).length < (rushNow() ? 42 : 32), 60);
        const e = ENTRIES[Math.floor(rG() * ENTRIES.length)];
        a.pos.copy(e);
        a.yaw = Math.PI;
        a.obj.visible = true;
        a.obj.userData.setProp?.(a.kid ? null : rG() < 0.25 ? 'racket' : null);
        stage = 'enter';
      }
      if (stage === 'enter') {
        const s = pickStall(a);
        if (!s) {
          // 都排满了：在花盆边站一会儿看看，再走
          yield* wait(rnd(rG, 2, 4));
          yield* leave(a);
          stage = 'hidden';
          continue;
        }
        a.obj.userData.setProp?.(null);
        stall = s;
        stage = 'queue';
      }
      if (stage === 'queue' && stall) {
        yield* queueAt(a, stall);
        if (!a.tray && !a.cup) {
          yield* leave(a);
          stage = 'hidden';
          continue;
        }
        stage = 'carry';
      }
      if (stage === 'carry') {
        const s = freeSeat(a.pos);
        if (s) {
          yield* sitDown(a, s);
          stage = 'seated';
        } else {
          // 没座位：找个花盆边站着吃
          const p = free(-25.4 + rG() * 2, -19.6 + rG() * 1.2);
          yield* goTo(a, p);
          pose(a, 'idle');
          yield* wait(rnd(rG, 6, 12));
          yield* cleanUp(a);
          yield* leave(a);
          stage = 'hidden';
          continue;
        }
      }
      if (stage === 'seated') {
        yield* eating(a, rnd(rG, 18, 36));
        // 三成的人把托盘留在桌上（总监的活）
        const lazy = !!a.tray && rG() < 0.2;
        yield* standUp(a, lazy);
        if (!lazy || a.cup) yield* cleanUp(a);
        yield* leave(a);
        stage = 'hidden';
      }
    }
  }
  /** 一开始已经坐着的：直接占最近的座位、托盘放在桌上 */
  const seatNow = (a: Actor) => {
    const s = nearestSeat(a.pos);
    if (s.who) return null;
    s.who = a;
    a.seat = s;
    a.pos.copy(s.pos);
    a.yaw = s.yaw;
    a.obj.userData.setSeat?.(s.h);
    state.seated++;
    return s;
  };

  // ── 状态 ─────────────────────────────────────────
  const state: FoodState = {
    sold: 0,
    mood: 100,
    dirty: 0,
    bins: bins.slice(),
    stock: Object.fromEntries(stalls.map((s) => [s.id, s.stock])) as Record<StallId, number>,
    tacoQueue: 0,
    rush: false,
    helping: false,
    seated: 0,
    guests: 0,
    birdsOnFood: 0,
  };

  // 白模里摆好的人 → 客人（排队的接着排、坐着的接着吃、端托盘的接着找座、长廊上的进来）
  // SLOTS 里桌上的托盘：坐着的人前面那只换成他们的，其余三只留成脏托盘
  const slotTrays: THREE.Object3D[] = [];
  env.scene.traverse((o) => {
    if (o.name.startsWith('slot:tray-') || o.name === 'slot:fam-tray' || o.name === 'slot:fries') slotTrays.push(o);
  });
  for (const o of slotTrays) o.visible = false;
  for (const id of ['walk-tray-1t', 'walk-tray-2t']) {
    const o = env.slot(id);
    if (o) o.visible = false;
  }

  const queueStart: [string, StallId][] = [
    ['q-coffee-1', 'coffee'],
    ['q-coffee-2', 'coffee'],
    ['q-taco-1', 'taco'],
    ['q-taco-2', 'taco'],
    ['q-taco-3', 'taco'],
    ['q-taco-kid', 'taco'],
    ['q-pizza-1', 'pizza'],
    ['q-pizza-2', 'pizza'],
    ['q-agua', 'agua'],
    ['kid-paleta', 'paleta'],
    ['parent-paleta', 'paleta'],
    ['q-burger', 'burger'],
    ['q-boba', 'boba'],
    ['q-churro', 'churro'],
  ];
  const qCount: Partial<Record<StallId, number>> = {};
  for (const [id, st] of queueStart) {
    const a = person(id, '客人');
    if (!a) continue;
    guests.push(a);
    const s = stallOf(st);
    a.obj.userData.setProp?.(null);
    // 直接站进队里（白模的位置差不多就是队伍）
    const i = qCount[st] ?? 0;
    qCount[st] = i + 1;
    a.pos.copy(s.line[Math.min(i, s.line.length - 1)]);
    a.yaw = yawTo(a.pos, i ? s.line[i - 1] : s.sill);
    spawn(guestLoop(a, 'queue', s));
  }
  // 坐着吃的（长桌 13 个 + 野餐桌 5 个）
  const seatedIds = [
    'd-0n1',
    'd-0n2',
    'd-0s1',
    'd-0n3',
    'd-0n4',
    'd-1n1',
    'd-1s1',
    'd-1s2',
    'd-1n2',
    'd-1n3',
    'd-2n1',
    'd-2s1',
    'd-2s2',
    'fam-1',
    'fam-kid1',
    'fam-kid2',
    'pic-1a',
    'pic-1b',
  ];
  seatedIds.forEach((id, k) => {
    const a = person(id, '客人');
    if (!a) return;
    guests.push(a);
    const s = seatNow(a);
    if (!s) {
      a.obj.visible = false;
      spawn(guestLoop(a, 'hidden'));
      return;
    }
    const sip = a.obj.userData.prop?.() === 'cup';
    a.cup = sip;
    if (!sip) {
      a.tray = getTray([0, 1, 2, 3][k % 4]);
      a.tray.position.copy(s.trayAt);
      a.tray.rotation.set(0, s.yaw, 0);
    }
    spawn(
      (function* (): Co {
        yield* eating(a, 5 + k * 3.4 + rG() * 8);
        const lazy = !!a.tray && rG() < 0.2;
        yield* standUp(a, lazy);
        if (!lazy || a.cup) yield* cleanUp(a);
        yield* leave(a);
        yield* guestLoop(a, 'hidden');
      })(),
    );
  });
  // 端着托盘找座的两个
  for (const [id, variant] of [
    ['walk-tray-1', 1],
    ['walk-tray-2', 2],
  ] as [string, number][]) {
    const a = person(id, '客人');
    if (!a) continue;
    guests.push(a);
    a.obj.userData.setProp?.(null);
    a.tray = getTray(variant);
    spawn(guestLoop(a, 'carry'));
  }
  // 长廊上的
  for (const id of ['prom-1', 'prom-2', 'stadium-walker']) {
    const a = person(id, '客人');
    if (!a) continue;
    guests.push(a);
    spawn(guestLoop(a, 'enter'));
  }
  // 一开始桌上留着的脏托盘：凉棚下两只、野餐桌（东边那张）一盘薯条
  for (const p of [v(-31.8, 0, TABLE_ROWS[1] - 0.2), v(-27.6, 0, TABLE_ROWS[2] + 0.2)]) {
    const s = nearestSeat(p);
    if (!s.who) leaveDirty(s);
  }
  {
    const s = nearestSeat(v(PICNIC_XS[2], 0, PICNIC_Z - 0.6));
    if (!s.who) {
      leaveDirty(s, getTray(3), true);
    }
  }
  // 多备几个客人（高峰）
  for (let i = 0; i < 16; i++) {
    const kid = i % 4 === 3;
    const o = env.make(kid ? 'kid' : 'player', i % (kid ? 3 : 4));
    o.name = `guest-extra-${i}`;
    o.userData.asset = kid ? 'kid' : 'player';
    scene.add(o);
    const a = mkActor(o, '客人', kid);
    guests.push(a);
    o.visible = false;
    spawn(guestLoop(a, 'hidden'));
  }
  for (const s of stalls) spawn(vendorLoop(s));
  // 塔可车第二个摊主（白模里有）：高峰帮手位让给总监
  {
    const o = env.slot('vendor-taco2');
    if (o) o.visible = false;
  }

  // ── 孩子：沙包投洞、叠叠乐 ──────────────────────────
  const lawn = env.slot('lawn-games');
  const bagObjs = (lawn?.userData.bags as THREE.Object3D[] | undefined) ?? [];
  const holes = (lawn?.userData.holes as number[][] | undefined) ?? [];
  const bagHome = (i: number): V3 => {
    const f = lawn?.userData.bagHome as ((i: number) => number[] | V3) | undefined;
    const h = f?.(i);
    if (h instanceof THREE.Vector3) return h.clone();
    if (Array.isArray(h)) return v(h[0], h[1], h[2]);
    return bagObjs[i]?.position.clone() ?? v(0, 0, 0);
  };
  const homes = bagObjs.map((_, i) => bagHome(i));
  const kidA = person('kid-throw', '孩子');
  const kidB = person('kid-wait', '孩子');
  const kidJ = person('kid-jenga', '孩子');
  const parentL = person('parent-lawn', '家长');
  interface Toss {
    i: number;
    t: number;
    dur: number;
    from: V3;
    to: V3;
    into: boolean;
  }
  const tosses: Toss[] = [];
  const toLawn = (p: V3) => (lawn ? p.clone().sub(lawn.position) : p.clone());
  function* lawnLoop(): Co {
    if (!lawn || !kidA || !kidB || !bagObjs.length || holes.length < 1) return;
    let thrower = kidA;
    let fetcher = kidB;
    while (true) {
      // 扔四只：从板 A 后面朝板 B（东边那块）扔
      const tgt = holes[1] ?? holes[0];
      const hole = lawn.localToWorld(v(tgt[0], tgt[1], tgt[2]));
      for (let i = 0; i < bagObjs.length; i++) {
        yield* face(thrower, yawTo(thrower.pos, hole), 0.3);
        for (let t = 0; t < 1.6; ) {
          const dt = yield;
          t += dt;
          pose(thrower, 'serve', clamp(t / 1.6, 0, 0.99));
          if (t >= 0.85 && t - dt < 0.85) {
            const hp = (thrower.obj.userData.handPoint as ((s: 'R' | 'L') => V3) | undefined)?.('R');
            const from = hp ?? thrower.pos.clone().setY(1.0);
            const r = rK();
            const into = r < 0.35;
            const to = into
              ? hole.clone()
              : r < 0.75
                ? hole.clone().add(v(rnd(rK, -0.35, 0.35), -0.04, rnd(rK, -0.2, 0.2)))
                : hole
                    .clone()
                    .add(v(rnd(rK, -0.9, 0.6), 0, rnd(rK, -0.7, 0.7)))
                    .setY(0.03);
            tosses.push({ i, t: 0, dur: 0.8, from: toLawn(from), to: toLawn(to), into });
          }
        }
        pose(thrower, 'idle');
        yield* wait(rnd(rK, 0.6, 1.4));
        if (rK() < 0.4) say(thrower, rK() < 0.5 ? '进了！' : '差一点！', 1.4);
      }
      yield* wait(1.0);
      // 另一个孩子去把沙包捡回来，换人扔
      const p0 = fetcher.pos.clone();
      yield* goTo(fetcher, free(hole.x - 0.2, hole.z + 0.6), 1.4);
      yield* act(fetcher, 'pickup', 1.2, 0, 0.99);
      bagObjs.forEach((b, i) => {
        b.visible = true;
        b.position.copy(homes[i]);
      });
      yield* goTo(fetcher, p0, 1.4);
      [thrower, fetcher] = [fetcher, thrower];
      const hb = holes[0];
      const h0 = lawn.localToWorld(v(hb[0], hb[1], hb[2]));
      void h0;
      pose(fetcher, 'idle');
      yield* face(fetcher, yawTo(fetcher.pos, hole), 0.3);
      yield* wait(1.2);
    }
  }
  const updateTosses = (dt: number) => {
    for (let k = tosses.length - 1; k >= 0; k--) {
      const q = tosses[k];
      q.t += dt;
      const u = Math.min(1, q.t / q.dur);
      const b = bagObjs[q.i];
      if (!b) {
        tosses.splice(k, 1);
        continue;
      }
      b.visible = true;
      b.position.lerpVectors(q.from, q.to, u);
      b.position.y += 4 * u * (1 - u) * 0.9;
      b.rotation.y += dt * 6;
      if (u >= 1) {
        if (q.into) b.visible = false;
        tosses.splice(k, 1);
      }
    }
  };
  function* jengaLoop(): Co {
    if (!lawn || !kidJ || !parentL) return;
    const top = lawn.userData.topple as ((k: number) => void) | undefined;
    if (!top) return;
    const home = parentL.pos.clone();
    const homeYaw = parentL.yaw;
    const tw = (lawn.userData.towerAt as [number, number] | undefined) ?? [3.4, -0.2];
    const tower = v(lawn.position.x + tw[0], 0, lawn.position.z + tw[1]);
    while (true) {
      yield* wait(rnd(rK, 14, 24));
      yield* act(kidJ, 'pickup', 0.9, 0, 0.6);
      // 哗啦
      for (let t = 0; t < 0.5; ) {
        t += yield;
        top(clamp(t / 0.5, 0, 1));
      }
      say(kidJ, '哗啦！', 1.6);
      yield* act(kidJ, 'clap', 1.0, 0, 0.99);
      pose(kidJ, 'idle');
      yield* wait(1.5);
      // 家长过去码好
      yield* goTo(parentL, free(tower.x - 0.3, tower.z + 0.75), 1.1);
      yield* face(parentL, yawTo(parentL.pos, tower), 0.3);
      for (let t = 0; t < 3.0; ) {
        const dt = yield;
        t += dt;
        pose(parentL, 'pickup', ((t / 1.0) % 1) * 0.8);
        top(clamp(1 - t / 3.0, 0, 1));
      }
      pose(parentL, 'idle');
      yield* goTo(parentL, home, 1.1);
      yield* face(parentL, homeYaw, 0.3);
      pose(parentL, 'idle');
    }
  }
  if (kidA && kidB) spawn(lawnLoop());
  spawn(jengaLoop());

  // ── 球员出场（会所拱廊 → 球员通道 → 球员拱门）─────────────────
  const walkers = ['player-out-1', 'player-out-2'].map((id) => person(id, '球员')).filter((a): a is Actor => !!a);
  const gate = free(PLAYERS_GATE.x - 1.0, PLAYERS_GATE.z);
  const arcade = free(SPOTS.arcade[0], SPOTS.arcade[1]);
  function* walkout(): Co {
    if (!walkers.length) return;
    while (true) {
      // 走到拱门、消失
      yield* (function* (): Co {
        const cos = walkers.map((a, i) =>
          (function* (): Co {
            yield* wait(i * 0.9);
            yield* walkPts(a, [v(gate.x, 0, gate.z + (i ? 0.5 : -0.4))], 1.15);
            a.obj.visible = false;
          })(),
        );
        for (const c of cos) c.next(0);
        while (true) {
          const dt = yield;
          let done = true;
          for (const c of cos) if (!c.next(dt).done) done = false;
          if (done) return;
        }
      })();
      yield* wait(rnd(rS, 50, 80));
      // 下一对从拱廊出来
      walkers.forEach((a, i) => {
        a.pos.copy(arcade).add(v(-i * 0.9, 0, i ? 0.5 : -0.3));
        a.yaw = Math.PI / 2;
        a.obj.visible = true;
        a.obj.userData.setProp?.('racket');
      });
      say(walkers[0], rS() < 0.5 ? '决赛！' : '上场了', 1.8);
    }
  }
  spawn(walkout());
  /** 坐着的人看走过去的球员 */
  const updateLooks = () => {
    const w = walkers.find((a) => a.obj.visible && a.pos.x < gate.x - 0.5);
    for (const a of guests) {
      if (!a.seat) continue;
      const near = w && flat(w.pos, a.pos) < 7 && Math.abs(w.pos.z - a.pos.z) < 9;
      if (near && !a.looking) {
        a.looking = 1;
        a.obj.userData.lookAt?.(w.pos.clone().setY(1.5));
      } else if (near) a.obj.userData.lookAt?.(w.pos.clone().setY(1.5));
      else if (a.looking) {
        a.looking = 0;
        a.obj.userData.lookAt?.(null);
      }
    }
  };

  // ── 拟八哥 ───────────────────────────────────────
  const birds: Bird[] = [];
  const addBird = (o: THREE.Object3D | undefined) => {
    if (!o) return;
    o.updateMatrixWorld(true);
    const wp = o.getWorldPosition(new THREE.Vector3());
    const q = o.getWorldQuaternion(new THREE.Quaternion());
    scene.attach(o);
    birds.push({
      obj: o,
      pos: wp,
      yaw: new THREE.Euler().setFromQuaternion(q, 'YXZ').y,
      mode: wp.y > 2 ? 'perch' : 'ground',
      fly: null,
      timer: rnd(rB, 2, 6),
      peck: rnd(rB, 0, 2),
      on: null,
      idx: birds.length,
    });
  };
  {
    const pair = env.slot('birds-fries');
    for (const b of (pair?.userData.birds as THREE.Object3D[] | undefined) ?? []) addBird(b);
    addBird(env.slot('bird-fly'));
    addBird(env.slot('bird-bin'));
    // 飞着的那只先落到凉棚梁上
    for (const b of birds) if (b.mode === 'perch') b.obj.userData.pose?.('stand');
  }
  const perchFor = (b: Bird) => {
    const x = PERGOLA.x0 + 0.8 + ((b.idx * 2.7 + rB() * 1.5) % (PERGOLA.x1 - PERGOLA.x0 - 1.6));
    return v(x, PERGOLA.h + 0.14, rB() < 0.5 ? PERGOLA.z0 : PERGOLA.z1);
  };
  /** 鸟想去啄的地方：桌上的脏托盘（没人坐的那张桌优先）、满了的垃圾桶盖、不然就是地上 */
  const pickFood = (b: Bird): { p: V3; on: Dirty | number | null } => {
    const taken = new Set(birds.filter((o) => o !== b && o.mode !== 'perch').map((o) => o.on));
    const ds = dirties.filter(
      (d) => !taken.has(d) && !seats.some((s) => s.table === d.seat.table && s.who && flat(s.pos, d.pos) < 1.4),
    );
    if (ds.length) {
      const d = ds[Math.floor(rB() * ds.length)];
      return { p: d.pos.clone().add(v(rnd(rB, -0.15, 0.15), 0.03, rnd(rB, -0.1, 0.1))), on: d };
    }
    const full = bins.map((f, i) => (f >= 1 && !taken.has(i) ? i : -1)).filter((i) => i >= 0);
    if (full.length) {
      const i = full[Math.floor(rB() * full.length)];
      return { p: binLid(i), on: i };
    }
    // 地上：野餐桌和回收站之间的碎花岗岩
    return { p: v(rnd(rB, -36, -27), 0, rnd(rB, -19, -18.2)), on: null };
  };
  const startFly = (b: Bird, to: V3, land: 'ground' | 'perch', dur = 1.2) => {
    b.mode = 'fly';
    b.fly = { t: 0, dur, from: b.pos.clone(), to: to.clone(), arc: 0.8 + 0.4 * rB(), land };
    b.obj.userData.pose?.('fly');
  };
  const disturbers = (): V3[] => [
    ...people.filter((a) => a.obj.visible && !a.seat).map((a) => a.pos),
    ...(director ? [director.position] : []),
  ];
  const near = (p: V3, r: number) => disturbers().some((q) => Math.hypot(q.x - p.x, q.z - p.z) < r);
  const updateBirds = (dt: number) => {
    for (const b of birds) {
      if (b.mode === 'ground') {
        // 有人走近（坐着的人不算，坐着吃饭的人旁边的托盘鸟本来就不去）
        if (near(b.pos, 1.3)) {
          startFly(b, perchFor(b), 'perch');
          b.timer = rnd(rB, 8, 14);
          b.on = null;
        } else {
          // 托盘被收走了 / 桶倒空了 → 换个地方
          const gone =
            (b.on && typeof b.on === 'object' && !dirties.includes(b.on)) ||
            (typeof b.on === 'number' && bins[b.on] < 1);
          if (gone) {
            b.on = null;
            startFly(b, perchFor(b), 'perch', 1.0);
            b.timer = rnd(rB, 4, 8);
          } else {
            b.peck -= dt;
            if (b.peck <= 0) {
              const pecking = b.on !== null && rB() < 0.7;
              b.obj.userData.pose?.(pecking ? 'drink' : 'stand');
              b.peck = pecking ? rnd(rB, 0.6, 1.4) : rnd(rB, 0.8, 2.2);
              if (!pecking && rB() < 0.4) b.yaw += rnd(rB, -1.2, 1.2);
            }
          }
        }
      } else if (b.mode === 'fly' && b.fly) {
        const f = b.fly;
        f.t += dt;
        const u = Math.min(1, f.t / f.dur);
        b.pos.lerpVectors(f.from, f.to, smooth(u));
        b.pos.y += 4 * u * (1 - u) * f.arc;
        b.yaw = turnTo(b.yaw, Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z), dt * 12);
        if (u >= 1) {
          b.fly = null;
          b.pos.copy(f.to);
          b.mode = f.land;
          b.obj.userData.pose?.('stand');
          b.peck = rnd(rB, 0.3, 1);
        }
      } else if (b.mode === 'perch') {
        b.timer -= dt;
        if (b.timer <= 0) {
          const f = pickFood(b);
          if (!near(f.p, 2.0)) {
            b.on = f.on;
            startFly(b, f.p, 'ground', 1.3);
          } else b.timer = rnd(rB, 2, 4);
        }
      }
      b.obj.position.copy(b.pos);
      b.obj.rotation.y = b.yaw;
    }
    state.birdsOnFood = birds.filter((b) => b.mode === 'ground' && b.on !== null).length;
  };

  // ── 总监 ─────────────────────────────────────────
  const dSlot = env.slot('director');
  const director = dSlot ?? new THREE.Object3D();
  const D = drive && dSlot ? mkActor(dSlot, '总监') : null;
  if (D) people.splice(people.indexOf(D), 1);
  // 手上那摞托盘（收回来的脏托盘，最多 4 只）
  const stackObj = new THREE.Group();
  stackObj.name = 'food-stack';
  const stackTrays: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const o = env.make('food-tray', 4);
    o.position.set(0, i * 0.05, 0);
    o.rotation.y = (i % 2 ? 0.12 : -0.08) * (i + 1);
    o.visible = false;
    stackObj.add(o);
    stackTrays.push(o);
  }
  stackObj.visible = false;
  // 每步按总监的手摆：渲染插值时跟着总监一起挪（clubsite/play/smooth.ts）
  stackObj.userData.followsDirector = true;
  scene.add(stackObj);
  let stack = 0;
  const setStack = (n: number) => {
    stack = n;
    stackTrays.forEach((o, i) => {
      o.visible = i < n;
    });
    stackObj.visible = n > 0;
  };
  const followStack = () => {
    if (!stack) return;
    const hp = director.userData.handPoint as ((s: 'R' | 'L') => V3) | undefined;
    const yaw = director.rotation.y;
    if (hp) {
      const p = hp('R').add(hp('L')).multiplyScalar(0.5);
      stackObj.position.set(p.x, p.y + 0.02, p.z);
    } else
      stackObj.position.set(
        director.position.x + Math.sin(yaw) * 0.4,
        director.position.y + 0.95,
        director.position.z + Math.cos(yaw) * 0.4,
      );
    stackObj.rotation.y = yaw;
  };

  const taco = stallOf('taco');
  const tin = tacoInside(taco.obj);
  const helperW = v(T.taco.x + tin.helper[0], tin.floor, T.taco.z + tin.helper[1]);

  const jobs: Jobs = {
    director,
    bins: () => bins.slice(),
    binAt: () => binFront.clone(),
    bagOut(i) {
      const k = i ?? bins.indexOf(Math.max(...bins));
      const f = bins[k];
      bins[k] = 0;
      setBins();
      return f;
    },
    kitchenDoor: () => kitchenDoor.clone(),
    dirty: () => dirties.slice(),
    nearestDirty(p, max) {
      let best: Dirty | null = null;
      let bd = max;
      for (const d of dirties) {
        const dd = flat(d.seat.stand, p);
        if (dd < bd) {
          bd = dd;
          best = d;
        }
      }
      return best;
    },
    collect(ref) {
      if (stack >= 4) return false;
      const d = dirties.find((x) => x.id === ref.id);
      if (!d || !removeDirty(d)) return false;
      setStack(stack + 1);
      return true;
    },
    stack: () => stack,
    returnStack() {
      const n = stack;
      setStack(0);
      trayRetCount = Math.min(12, trayRetCount + n);
      trayRet?.userData.setCount?.(trayRetCount);
      return n;
    },
    trayReturnAt: () => trayRetFront.clone(),
    stackObj,
    stock: (id) => stallOf(id).stock,
    backOf: (id) => stallOf(id).back.clone(),
    restock(id) {
      const s = stallOf(id);
      s.stock = 1;
      s.closed = false;
      syncStock(s);
      if (s.vendor) say(s.vendor, '谢啦！', 1.6);
    },
    handTruck,
    truckLoad: () => truckLoad,
    setTruckLoad(n) {
      truckLoad = n;
      handTruck?.userData.setLoad?.(n);
    },
    supplyAt: () => supplyAt.clone(),
    helperAt: () => helperW.clone(),
    setHelping(on) {
      helping = on;
    },
    rush: rushNow,
    tacoQueue: () => taco.queue.length,
    say: (text, s) => say(director, text, s ?? 2),
  };

  // ── 看戏模式：总监自己干活（?play=0&life=1）──────────────────
  let dnav: NavMap | null = null;
  function* dGo(to: V3, speed = 2.4): Co {
    if (!D) return;
    dnav ??= new NavMap(foodNavSpec(scene, env.groundAt, true));
    const path = dnav.findPath(D.pos.x, D.pos.z, to.x, to.z);
    const pts = path ? path.map(([x, z]) => v(x, 0, z)) : [to.clone()];
    const carry = (D.obj.userData.tool?.() as THREE.Object3D | null) === handTruck && handTruck;
    for (const p of pts) {
      while (true) {
        const dt = yield;
        const dx = p.x - D.pos.x;
        const dz = p.z - D.pos.z;
        const L = Math.hypot(dx, dz);
        const step = speed * dt;
        const h = dnav.height(D.pos.x, D.pos.z) ?? 0;
        if (L <= step) {
          D.pos.set(p.x, dnav.height(p.x, p.z) ?? h, p.z);
          break;
        }
        D.pos.x += (dx / L) * step;
        D.pos.z += (dz / L) * step;
        D.pos.y = dnav.height(D.pos.x, D.pos.z) ?? h;
        D.yaw = turnTo(D.yaw, Math.atan2(dx, dz), dt * 10);
        D.walkPh = (D.walkPh + step / 1.25) % 1;
        pose(D, carry || stack ? 'push' : 'walk', D.walkPh);
      }
    }
    pose(D, carry ? 'push' : 'idle', carry ? 0 : undefined);
  }
  function* directorDemo(): Co {
    if (!D) return;
    const bag = env.slot('trash-bag');
    D.obj.userData.setProp?.(null);
    yield* wait(2);
    while (true) {
      const lowest = STOCKED.map(stallOf).sort((a, b) => a.stock - b.stock)[0];
      if (dirties.length >= 2) {
        // 收托盘：一张张收（最多 4 只）→ 回收台
        while (stack < 4 && dirties.length) {
          const d = jobs.nearestDirty(D.pos, 99) as Dirty;
          yield* dGo(d.seat.stand);
          yield* face(D, yawTo(D.pos, d.pos), 0.25);
          yield* act(D, 'pickup', 0.6, 0, 0.6);
          jobs.collect(d);
        }
        yield* dGo(trayRetFront);
        yield* face(D, yawTo(D.pos, trayRet?.position ?? D.pos), 0.25);
        yield* act(D, 'pickup', 0.6, 0.6, 0.2);
        jobs.returnStack();
      } else if (Math.max(...bins) >= 0.85) {
        // 倒垃圾：换袋子 → 拎到厨房后门
        yield* dGo(binFront);
        yield* face(D, Math.PI, 0.25);
        yield* act(D, 'pickup', 1.6, 0, 0.99);
        jobs.bagOut();
        if (bag) {
          bag.visible = true;
          D.obj.userData.hold?.(bag, bag.userData.grip);
        }
        yield* dGo(kitchenDoor);
        yield* face(D, -Math.PI / 2, 0.25);
        yield* act(D, 'dump', 1.0, 0, 0.99);
        if (bag) {
          D.obj.userData.release?.(scene);
          bag.visible = false;
        }
      } else if (lowest.stock < 0.35 && handTruck) {
        // 补货：手推车 → 补货堆装货 → 车后门卸货 → 推回来
        const home = handTruck.position.clone();
        const homeYaw = handTruck.rotation.y;
        yield* dGo(free(home.x, home.z + 0.7));
        D.obj.userData.hold?.(handTruck, handTruck.userData.grip);
        yield* dGo(supplyAt, 1.9);
        yield* act(D, 'pickup', 1.2, 0, 0.99);
        jobs.setTruckLoad(2);
        yield* dGo(lowest.back, 1.9);
        yield* act(D, 'pickup', 1.2, 0, 0.99);
        jobs.setTruckLoad(1);
        jobs.restock(lowest.id);
        yield* dGo(free(home.x, home.z + 0.7), 1.9);
        D.obj.userData.release?.(scene);
        handTruck.position.copy(home);
        handTruck.rotation.set(0, homeYaw, 0);
        jobs.setTruckLoad(0);
      } else if (rushNow() && taco.queue.length >= 4) {
        // 高峰：从后门上塔可车，站到窗口后面出餐
        yield* dGo(v(T.taco.x + tin.back[0], 0, T.taco.z + tin.back[1]));
        yield* dGo(helperW, 1.6);
        yield* face(D, 0, 0.3);
        helping = true;
        for (let t = 0; t < 16 && rushNow(); ) {
          t += yield;
          pose(D, 'feed', (t / 1.6) % 1);
        }
        helping = false;
        yield* dGo(v(T.taco.x + tin.back[0], 0, T.taco.z + tin.back[1]), 1.6);
      } else {
        yield* dGo(free(binFront.x + 1.2, binFront.z + 0.8));
        pose(D, 'idle');
        yield* wait(3);
      }
    }
  }
  if (D) spawn(directorDemo());

  // ── 每步 ─────────────────────────────────────────
  let bubbleT = 0;
  const updateState = () => {
    state.dirty = dirties.length;
    state.bins = bins.slice();
    for (const s of stalls) state.stock[s.id] = s.stock;
    state.tacoQueue = taco.queue.length;
    state.rush = rushNow();
    state.helping = helping;
    state.guests = guests.filter((a) => a.obj.visible).length;
    const over = bins.filter((f) => f >= 1).length;
    const closed = stalls.filter((s) => s.closed).length;
    const target = clamp(
      100 -
        4 * dirties.length -
        10 * over -
        10 * closed -
        3 * Math.max(0, taco.queue.length - 4) -
        3 * state.birdsOnFood,
      0,
      100,
    );
    state.mood += (target - state.mood) * 0.004;
    litter.visible = over > 0;
    taco.obj?.userData.setRush?.(rushNow() && taco.queue.length >= 5 && !helping);
  };
  const updateBubbles = () => {
    if (!env.bubble) return;
    for (const s of stalls) {
      if (!Number.isFinite(s.stock) || !s.vendor) continue;
      const key = `stock-${s.id}`;
      if (s.closed) env.bubble(key, s.vendor.obj, '卖光了 · 补货！', 2.4);
      else if (s.stock < 0.3) env.bubble(key, s.vendor.obj, '快没货了！', 2.4);
      else env.bubble(key, null);
    }
    const vt = taco.vendor;
    if (vt) {
      if (rushNow() && taco.queue.length >= 5 && !helping) env.bubble('rush', vt.obj, '人手不够！', 2.4);
      else env.bubble('rush', null);
    }
    const over = bins.findIndex((f) => f >= 1);
    if (over >= 0) env.bubble('bins', () => binLid(over).add(v(0, 0.4, 0)), '垃圾满了', 0);
    else env.bubble('bins', null);
  };

  const life: FoodLife = {
    state,
    jobs,
    people: () =>
      people
        .filter((a) => a.obj.visible && !a.seat && a !== D)
        .map((a) => ({ x: a.pos.x, z: a.pos.z, r: a.kid ? 0.24 : 0.3 })),
    startRush() {
      const t = now % RUSH_CYCLE;
      rushOffset = RUSH[0] + 0.01 - t;
    },
    debug: () => ({
      now: +now.toFixed(1),
      rush: rushNow(),
      queues: Object.fromEntries(stalls.map((s) => [s.id, s.queue.length])),
      stock: Object.fromEntries(stalls.filter((s) => Number.isFinite(s.stock)).map((s) => [s.id, +s.stock.toFixed(2)])),
      dirty: dirties.map((d) => [d.id, +d.pos.x.toFixed(1), +d.pos.z.toFixed(1)]),
      bins: bins.map((b) => +b.toFixed(2)),
      birds: birds.map((b) => [b.mode, +b.pos.x.toFixed(1), +b.pos.y.toFixed(1), +b.pos.z.toFixed(1)]),
      guests: guests.filter((a) => a.obj.visible).length,
      where: guests
        .filter((a) => a.obj.visible)
        .map((a) => [
          +a.pos.x.toFixed(1),
          +a.pos.z.toFixed(1),
          a.tray ? 'T' : a.cup ? 'C' : '-',
          a.seat ? 'S' : '',
          a.doing,
        ]),
      seated: state.seated,
      stack,
      truckLoad,
      helping,
    }),
    post() {
      if (env.play) followStack();
    },
    update(dt) {
      now += dt;
      for (let i = bg.length - 1; i >= 0; i--) if (bg[i].next(dt).done) bg.splice(i, 1);
      updateTosses(dt);
      updateBirds(dt);
      updateLooks();
      for (const a of people) {
        sync(a);
        if (a.tray && !a.seat) carryTray(a);
      }
      if (D) {
        sync(D);
        followStack();
      }
      updateState();
      bubbleT -= dt;
      if (bubbleT <= 0) {
        bubbleT = 0.25;
        updateBubbles();
      }
    },
  };
  for (const a of people) sync(a);
  updateState();
  return life;
}
