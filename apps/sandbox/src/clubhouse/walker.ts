// 会所三层共用的 NPC 走路（stage 3）。一个 Walker 管一个 clubsite/people 的人：
//   沿一串 P3 点（routes.ts 的格式：[x, z, y?]）走：位置**一直在折线上**（不会被转弯半径带进墙里），起步 / 停下有加减速，
//   拐角前减速、身子按限定的角速度转过去（掉头：先停下转身再走），walk 的 phase 按走过的距离 ÷ strideOf 推（脚不溜）。
//   高度：脚下这一层导航的高度（楼梯段 = 梯段的坡），导航里没有就按两头的 y 线性插值；过了 floorFor 的阈值 → 换层 + setLevel 重新打 houseViews。
//   同一个 x、z 换 y 的一段 = 坐电梯：站着等 LIFT_WAIT 秒，然后出现在那一层。
//   让路：前面 YIELD_R 米以内有人（总监、别的 Walker，同一层）就停；等了 patience 秒还堵着 → 穿过去（passT 秒里不让），不会死锁。
// 脚本（协程，同 clubdesk / clubfood 的写法）：
//   w.run(function* (w) {
//     while (true) {
//       yield* w.go(ROUTE);            // 沿折线走到头
//       yield* w.wait(3);              // 站 3 秒（idle）
//       yield* w.act('pickup', 0.5);   // 做一遍姿势（phase 0 → 1，秒）；act('sip', 4, { loop: true }) = 按 period 循环 4 秒
//       yield* w.goTo('cafeCounter');  // 同一层：按导航 findPath 找路走过去（SPOTS 的名字或 [x, z]）
//       yield* w.face(-48.2, -27);     // 原地转身朝一个点
//     }
//   });
// 不用脚本也行：w.walkTo(pts) 之后每步看 w.walking。Walker 的 update(dt) 由 stage3.ts 的 createHouseLife 每步调（楼层模块不用自己调）。
import type * as THREE from 'three';
import { setStride, strideOf } from '../clubsite/people';
import type { NavMap } from '../clubsite/play/nav';
import { FLOOR_Y, FOOT } from './layout';
import { floorFor } from './nav';
import { type P3, SPOTS } from './routes';
import { FLOORS, type Floor, type HouseMode } from './view';

/** 协程：yield 一步，next(dt) 送进这一步的秒数 */
export type Co = Generator<void, void, number>;

export interface WalkOpts {
  /** 米/秒（默认 1.25） */
  speed?: number;
  /** walk 一个周期走多远（米，成人尺寸；不给 = 默认步幅 ≈ 0.92） */
  stride?: number;
  /** 走路的姿势（默认 'walk'；推车 'push'） */
  pose?: string;
  /** 到了以后的姿势（默认 'idle'；null = 不动，留着最后一帧） */
  endPose?: string | null;
}

export interface WalkerOpts extends WalkOpts {
  /** 加速度（米/秒²，默认 3.5） */
  accel?: number;
  /** 转身的角速度（弧度/秒，默认 7） */
  turn?: number;
  /** 让不让路（默认 true） */
  yields?: boolean;
  /** 等多久以后穿过去（秒，默认 1.5 + 每个人错开一点） */
  patience?: number;
  /** 在哪几种看法里显示：默认 = 会所里面 'in'（只在那一层的剖面），一层脚印外面 = null（外观里也看得见） */
  modeAt?(x: number, z: number, floor: Floor): HouseMode | null;
}

/** Walker 要从会所拿的东西（stage3.ts 给） */
export interface WalkerWorld {
  /** 某一层的导航（无画面的 NavMap） */
  navOf(f: Floor): NavMap;
  /** 重新打 houseViews 并马上按当前看法切 visible */
  setLevel(obj: THREE.Object3D, floor: Floor, mode?: HouseMode | null): void;
  /** 所有的 Walker（让路用） */
  walkers(): readonly Walker[];
  /** 总监（玩法模式、在会所里）：位置和所在的层；不用让 = null */
  director(): { x: number; z: number; floor: Floor } | null;
}

export interface Walker {
  readonly obj: THREE.Object3D;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 朝向（弧度，0 = 朝镜头 +z） */
  yaw: number;
  /** 现在在哪一层（导航、houseViews 按它） */
  readonly floor: Floor;
  /** 现在的速度（米/秒） */
  readonly speed: number;
  /** 正在走（含坐电梯、被挡住等着） */
  readonly walking: boolean;
  /** 正在坐电梯 */
  readonly riding: boolean;
  /** 有路要走但连续没挪地方多久了（秒；坐电梯不算） */
  readonly stuck: number;
  /** 一共走了多远（米）、walk 的 phase 一共推了几个周期（测试量脚溜不溜：dist ≈ cycles × strideOf） */
  readonly dist: number;
  readonly cycles: number;
  /** 这一步有没有被前面的人挡住 */
  readonly blocked: boolean;
  /** 放到一个点（瞬移）；层按高度找（哪一层的导航在这里的高度最接近 y） */
  place(p: P3, yaw?: number): void;
  /** 开始沿折线走（从现在的位置；第一个点不在脚下就先直线走过去） */
  walkTo(pts: readonly P3[], opts?: WalkOpts): void;
  stop(): void;
  /** 设姿势（循环）；走路时会被 walk 盖掉 */
  pose(name: string, phase?: number): void;
  /** 跑一段脚本（换掉原来的）；null = 停掉脚本 */
  run(script: ((w: Walker) => Co) | null): void;
  /** 每个模拟步（createHouseLife 调） */
  update(dt: number): void;

  // ── 脚本里用（yield*）──
  go(pts: readonly P3[], opts?: WalkOpts): Co;
  /** 同一层按导航找路走到一个站位（SPOTS 的名字）或点；走不到 = 原地不动，返回 */
  goTo(to: string | P3, opts?: WalkOpts): Co;
  wait(sec: number): Co;
  /** 做姿势 sec 秒：默认 phase 0 → 1 一遍；loop = 按姿势自己的 period 循环。完了回 idle（keep = 留着） */
  act(pose: string, sec: number, o?: { loop?: boolean; keep?: boolean }): Co;
  /** 原地转身朝 (x, z) */
  face(x: number, z: number): Co;
}

export const LIFT_WAIT = 1.0;
export const YIELD_R = 0.55;
const PASS_T = 2.0;
const EPS = 1e-3;

const yOf = (p: P3) => (p.length > 2 ? (p[2] as number) : 0);
const inFoot1 = (x: number, z: number) => FOOT[1].some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
const defaultMode = (x: number, z: number, f: Floor): HouseMode | null => (f !== 1 || inFoot1(x, z) ? 'in' : null);
const wrap = (a: number) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

/** 点的高度在哪一层的导航上（最接近的那层；都不沾 = 按高度就近） */
export function floorAt(navOf: (f: Floor) => NavMap, x: number, z: number, y: number): Floor {
  let best: Floor | null = null;
  let bd = 0.5;
  // 会所外面的地面三层的导航里都有（高度 0）：先看楼面高度离 y 最近的那层
  const order = [...FLOORS].sort((a, b) => Math.abs(FLOOR_Y[a] - y) - Math.abs(FLOOR_Y[b] - y));
  for (const f of order) {
    const h = navOf(f).height(x, z);
    if (h === null) continue;
    const d = Math.abs(h - y);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best ?? (y > 2 ? 2 : y < -2 ? -1 : 1);
}

/** 站位名 / 点 → P3 */
export const spotAt = (s: string | P3): P3 => {
  if (typeof s !== 'string') return s;
  const sp = SPOTS[s];
  if (!sp) throw new Error(`clubhouse: 没有站位 ${s}`);
  return sp.at;
};

/**
 * 同一层两点之间按导航找路（findPath：A* + 拉直），返回 P3 折线（每个点带这一层导航的高度）；走不通 = null。
 * a、b = SPOTS 的名字或点。楼层模块用它，不用手写每条路。
 */
export function routeBetween(nav: NavMap, a: string | P3, b: string | P3): P3[] | null {
  const pa = spotAt(a);
  const pb = spotAt(b);
  const path = nav.findPath(pa[0], pa[1], pb[0], pb[1]);
  if (!path?.length) return null;
  const fy = nav.height(pb[0], pb[1]) ?? yOf(pb);
  const out: P3[] = [];
  for (const [x, z] of path) {
    const last = out.at(-1);
    if (last && Math.hypot(last[0] - x, last[1] - z) < EPS) continue;
    out.push([x, z, nav.height(x, z) ?? fy]);
  }
  return out;
}

let serial = 0;

export function createWalker(world: WalkerWorld, obj: THREE.Object3D, o: WalkerOpts = {}): Walker {
  const ud = obj.userData;
  const id = serial++;
  const ACC = o.accel ?? 3.5;
  const TURN = o.turn ?? 7;
  const modeAt = o.modeAt ?? defaultMode;
  const patience = o.patience ?? 1.5 + (id % 5) * 0.37;

  let floor: Floor = floorAt(world.navOf, obj.position.x, obj.position.z, obj.position.y);
  let yaw = obj.rotation.y;
  let v = 0;
  let ph = 0;
  let dist = 0;
  let cycles = 0;
  let stuck = 0;
  let blocked = false;
  let blockT = 0;
  let passT = 0;
  let liftT = -1;
  /** 现在的路：pts[i] 是正在走向的点 */
  let pts: { x: number; z: number; y: number }[] = [];
  let i = 0;
  /** 这一段的起点高度（插值用） */
  let from = { x: 0, z: 0, y: 0 };
  let cur: WalkOpts = {};
  let moving = false;
  let script: Co | null = null;
  let lastMode: HouseMode | null | undefined;

  const setPose = (name: string, phase?: number) =>
    (ud.pose as ((n: string, p?: number) => void) | undefined)?.(name, phase);
  const tag = (force = false) => {
    const m = modeAt(obj.position.x, obj.position.z, floor);
    if (!force && m === lastMode) return;
    lastMode = m;
    world.setLevel(obj, floor, m);
  };
  tag(true);

  const isLift = (a: { x: number; z: number; y: number }, b: { x: number; z: number; y: number }) =>
    Math.hypot(b.x - a.x, b.z - a.z) < EPS && Math.abs(b.y - a.y) > 0.5;

  function finish() {
    moving = false;
    v = 0;
    pts = [];
    liftT = -1;
    if (cur.endPose !== null) setPose(cur.endPose ?? 'idle');
  }

  /** 前面 YIELD_R 米以内有没有人（同一层） */
  function someoneAhead(dx: number, dz: number): boolean {
    const p = obj.position;
    const hit = (x: number, z: number) => {
      const ex = x - p.x;
      const ez = z - p.z;
      const d = Math.hypot(ex, ez);
      return d < YIELD_R && d > 1e-4 && (ex * dx + ez * dz) / d > 0.35;
    };
    const D = world.director();
    if (D && D.floor === floor && hit(D.x, D.z)) return true;
    for (const w of world.walkers()) {
      if (w === api || w.floor !== floor) continue;
      // 对面走过来的两个人：序号小的先走（另一个等），免得两个一起等
      if (hit(w.x, w.z) && !(w.blocked && w.walking && id < (w as unknown as { id: number }).id)) return true;
    }
    return false;
  }

  /** 拐角的限速：转得越急越慢 */
  const cornerV = (vmax: number, k: number): number => {
    if (k + 1 >= pts.length) return 0;
    const a = k === i ? from : pts[k - 1];
    const b = pts[k];
    const c = pts[k + 1];
    if (isLift(b, c)) return 0;
    const ux = b.x - a.x;
    const uz = b.z - a.z;
    const wx = c.x - b.x;
    const wz = c.z - b.z;
    const lu = Math.hypot(ux, uz);
    const lw = Math.hypot(wx, wz);
    if (lu < EPS || lw < EPS) return vmax;
    const th = Math.acos(Math.min(1, Math.max(-1, (ux * wx + uz * wz) / (lu * lw))));
    return vmax * Math.min(1, Math.max(0.12, 1 - th / 1.7));
  };

  function stepWalk(dt: number) {
    const p = obj.position;
    const vmax = cur.speed ?? o.speed ?? 1.25;
    // 坐电梯：等一会儿，出现在那一层
    if (liftT >= 0) {
      liftT += dt;
      if (liftT >= LIFT_WAIT) {
        const t = pts[i];
        p.y = t.y;
        floor = floorAt(world.navOf, t.x, t.z, t.y);
        tag(true);
        from = t;
        liftT = -1;
        i++;
        if (i >= pts.length) finish();
      }
      return;
    }
    let t = pts[i];
    // 跳过脚下的点；到了电梯段就开始等
    while (Math.hypot(t.x - p.x, t.z - p.z) < EPS) {
      if (Math.abs(t.y - p.y) > 0.5) {
        liftT = 0;
        v = 0;
        setPose('idle');
        return;
      }
      from = t;
      i++;
      if (i >= pts.length) return finish();
      t = pts[i];
    }
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const L = Math.hypot(dx, dz);
    const ux = dx / L;
    const uz = dz / L;
    // 朝向：限角速度转过去；差得多（掉头、急拐）先停下转身
    const want = Math.atan2(ux, uz);
    const err = wrap(want - yaw);
    yaw += Math.sign(err) * Math.min(Math.abs(err), TURN * dt);
    obj.rotation.y = yaw;
    const facing = Math.abs(err) > 1.1 ? 0 : Math.cos(err);
    // 限速：这一段的终点（拐角 / 终点 / 电梯口）和后面几个拐角，按能刹得住算
    let vt = vmax * facing;
    let d = L;
    for (let k = i; k < pts.length; k++) {
      if (k > i) d += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
      const vc = cornerV(vmax, k);
      vt = Math.min(vt, Math.sqrt(vc * vc + 2 * ACC * 0.8 * d));
      if (vc === 0 || d > (vmax * vmax) / ACC) break;
    }
    // 让路
    passT = Math.max(0, passT - dt);
    blocked = o.yields !== false && passT <= 0 && someoneAhead(ux, uz);
    if (blocked) {
      vt = 0;
      blockT += dt;
      if (blockT > patience) {
        passT = PASS_T;
        blockT = 0;
      }
    } else blockT = Math.max(0, blockT - dt * 0.5);
    const was = v;
    v += Math.min(ACC * dt, Math.max(-ACC * dt * 2, vt - v));
    if (v < 0.02 && vt === 0) v = 0;
    let step = Math.min(v * dt, L);
    // 快到了、速度被限到很小：别在终点前磨蹭
    if (L - step < 0.004) step = L;
    if (step > 0) {
      const k = step / L;
      p.x += dx * k;
      p.z += dz * k;
      const seg = Math.hypot(t.x - from.x, t.z - from.z);
      const s = seg < EPS ? 1 : 1 - Math.hypot(t.x - p.x, t.z - p.z) / seg;
      const lin = from.y + (t.y - from.y) * Math.min(1, Math.max(0, s));
      const h = world.navOf(floor).height(p.x, p.z);
      p.y = h !== null && Math.abs(h - lin) < 0.5 ? h : lin;
      const nf = floorFor(floor, p.y);
      if (nf !== floor) {
        floor = nf;
        tag(true);
      } else tag();
      const len = strideOf(obj);
      ph += step / len;
      cycles += step / len;
      dist += step;
      setPose(cur.pose ?? o.pose ?? 'walk', ph % 1);
      stuck = 1e-9;
    } else {
      if (was > 0 || stuck === 0) setPose('idle');
      stuck += dt;
    }
  }

  const api: Walker & { id: number } = {
    id,
    obj,
    get x() {
      return obj.position.x;
    },
    get y() {
      return obj.position.y;
    },
    get z() {
      return obj.position.z;
    },
    get yaw() {
      return yaw;
    },
    set yaw(a: number) {
      yaw = a;
      obj.rotation.y = a;
    },
    get floor() {
      return floor;
    },
    get speed() {
      return v;
    },
    get walking() {
      return moving;
    },
    get riding() {
      return liftT >= 0;
    },
    get stuck() {
      return moving && liftT < 0 ? stuck : 0;
    },
    get dist() {
      return dist;
    },
    get cycles() {
      return cycles;
    },
    get blocked() {
      return blocked;
    },
    place(p, a) {
      obj.position.set(p[0], yOf(p), p[1]);
      floor = floorAt(world.navOf, p[0], p[1], yOf(p));
      if (a !== undefined) {
        yaw = a;
        obj.rotation.y = a;
      }
      v = 0;
      moving = false;
      pts = [];
      liftT = -1;
      tag(true);
    },
    walkTo(list, opts = {}) {
      cur = opts;
      setStride(obj, opts.stride ?? o.stride);
      pts = list.map((q) => ({ x: q[0], z: q[1], y: yOf(q) }));
      i = 0;
      from = { x: obj.position.x, z: obj.position.z, y: obj.position.y };
      liftT = -1;
      stuck = 0;
      blockT = 0;
      moving = pts.length > 0;
      if (!moving) finish();
    },
    stop() {
      if (moving) finish();
    },
    pose: setPose,
    run(s) {
      script = s ? s(api) : null;
    },
    update(dt) {
      if (script?.next(dt).done) script = null;
      blocked = false;
      if (moving) stepWalk(dt);
    },
    *go(list, opts) {
      api.walkTo(list, opts);
      while (moving) yield;
    },
    *goTo(to, opts) {
      const r = routeBetween(world.navOf(floor), [obj.position.x, obj.position.z, obj.position.y], to);
      if (!r) return;
      yield* api.go(r, opts);
    },
    *wait(sec) {
      let t = 0;
      while (t < sec) t += yield;
    },
    *act(name, sec, a = {}) {
      let t = 0;
      if (a.loop) setPose(name);
      while (t < sec) {
        if (!a.loop) setPose(name, Math.min(0.999, t / sec));
        t += yield;
      }
      if (!a.keep) setPose('idle');
    },
    *face(x, z) {
      const want = Math.atan2(x - obj.position.x, z - obj.position.z);
      while (true) {
        const err = wrap(want - yaw);
        if (Math.abs(err) < 0.02) break;
        const dt = yield;
        yaw += Math.sign(err) * Math.min(Math.abs(err), TURN * dt);
        obj.rotation.y = yaw;
      }
    },
  };
  return api;
}
