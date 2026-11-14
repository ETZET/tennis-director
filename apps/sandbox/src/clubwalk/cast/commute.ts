// 通勤：人从真的出入口来、到真的出入口去，不在路中间凭空出现 / 消失。
//
// 为什么要有：各场景的演出（life.ts）是按"单独一个场景"写的 —— 人从画面边上走进来、走到画面边上藏起来，过一会儿再从那儿出来。
// 连成整座俱乐部以后，那些"画面边"落在了地图中间（广场长廊两头、前台西边、美食广场的几个口子……），人就在路中间凭空出现、消失。
// 场景的演出不改（单独的场景页面还要它），在大世界这一层接管：
//   - 消失：演出把一个人藏起来的那一刻，如果那里不是出入口，就放一个长得一样的替身接着走 —— 沿整座俱乐部的导航走到最近的出入口
//     （停车场里一辆停着的车边上、会所的门），到了再消失（上车 / 进门）。
//   - 出现：演出把一个人亮出来的那一刻，如果那里不是出入口，先把他藏着，替身从最近的出入口出来，追上他（他照演出继续走）再换回真人。
// 出入口：停车场的停着的车边上（车尾那一侧的通道）、会所的门。停车场里、落客点（人上下车、代客泊车）、会所里面（楼层、电梯、
// 楼梯）出现 / 消失本来就合理，不管；离总监太远（看不见）的也不管。消失的人往他前进方向上的出入口走（进了大门的接着往里走到会所）。
//
// 怎么知道演出藏 / 亮了一个人：给每个人的 visible 装一个访问器（hook）—— 演出写 visible 时记下"演出想要的"并发事件，
// 渲染读 visible 时 = 演出想要的 && 没被通勤藏着。不碰演出代码，也不用每帧比对。
import * as THREE from 'three';
import { AISLE_Z, DRIVE_EAST_END, PARKED, ROWS, SPOTS, STALL, stallCenter } from '../../clubpark/layout';
import { DECK, GATES as POOL_GATES } from '../../clubpool/layout';
import type { CastPerson, PersonKind } from '../../clubsite/cast/types';
import { setStride, strideOf } from '../../clubsite/people';
import type { NavMap } from '../../clubsite/play';
import { CLUBHOUSE, CLUBHOUSE_DOORS, LOT_N, LOT_S } from '../../clubsite/world';

type XZ = { x: number; z: number };

export interface Dresser {
  dress(obj: THREE.Object3D, look: CastPerson['look']): void;
}

export interface CommuteOpts {
  scene: THREE.Scene;
  director: THREE.Object3D;
  nav: () => NavMap;
  dresser: Dresser | null;
  /** 建一个替身（大人 / 孩子）：clubsite/people 的 player / kid，用总监那套材质 */
  make: (kind: 'adult' | 'kid') => THREE.Object3D;
  /** 今天这个人是谁（替身照他换装） */
  person: (obj: THREE.Object3D) => CastPerson | null;
}

/** 离总监多远以内才接管（米）：再远就不在画面里了 */
const CARE_R = 46;
/** 离出入口多近算"在出入口"（米） */
const AT_EXIT = 2.2;
/** 替身的速度（米/秒）：离开时慢慢走，赶来时快一点（要追上照常走着的真人） */
const LEAVE_V = 1.35;
const CHASE_V = 1.8;
/** 追上：替身离真人多近换回来（米） */
const CATCH = 0.7;
/** 追太久就算了（秒）：直接亮出来 */
const CHASE_MAX = 150;
/** 出现了却没有路去接（区域还没建）：最多等几秒 */
const WAIT_TRIES = 20;
/** 一步挪出去多远算瞬移（米） */
const JUMP = 2;
/** 替身池上限 */
const POOL_MAX = 32;
/** 池满时能借走的替身离总监至少多远（米）：不在画面里 */
const STEAL_R = 26;
/** 追的人落后很多时加快（每落后 1 米 +0.1 米/秒），最快小跑 */
const CHASE_VMAX = 3.2;

interface Hooked {
  obj: THREE.Object3D;
  scene: string;
  /** 演出想要的 visible */
  want: boolean;
  /** 被通勤藏着（等替身追上） */
  held: boolean;
  /** 上一步看得见时在哪儿（演出常常先挪走再藏，消失的地方按这个算） */
  last: XZ | null;
  /** 往哪儿走（最近几步的平均位移，米/步）：消失时挑前面的出入口 */
  dir: XZ;
  /** 出现了但这会儿没有路去接他：还要等几秒再试、试了几次 */
  wait: number;
  tries: number;
}

interface Walker {
  obj: THREE.Object3D;
  kind: 'adult' | 'kid';
  busy: boolean;
  mode: 'leave' | 'chase';
  /** chase：追的是谁 */
  target: Hooked | null;
  path: [number, number][];
  /** 离开：要去的出入口 */
  goal: XZ | null;
  replanT: number;
  t: number;
  phase: number;
  yaw: number;
}

/** 出入口：停着的车尾那一侧（通道里）+ 会所的门（门外半米）+ 泳池的门 */
function exits(): XZ[] {
  const out: XZ[] = [];
  for (const [r, i] of PARKED) {
    const row = ROWS[r];
    const [cx, cz] = stallCenter(row, i);
    const aisle = r < 2 ? AISLE_Z.n : AISLE_Z.s;
    const s = Math.sign(aisle - cz);
    out.push({ x: cx + STALL.w * 0.32, z: cz + s * (STALL.d / 2 + 0.45) });
  }
  const D = CLUBHOUSE_DOORS;
  out.push({ x: D.main.x + 0.8, z: D.main.z });
  out.push({ x: D.south.x, z: D.south.z + 0.8 });
  out.push({ x: D.kitchen.x, z: D.kitchen.z + 0.8 });
  out.push({ x: D.kitchenBack.x + 0.8, z: D.kitchenBack.z });
  // 泳池围栏的三道门（门外台阶下）：泳池的客人从这里进出泳池
  out.push({ x: POOL_GATES.north.at, z: DECK.z0 - 1.2 });
  out.push({ x: DECK.x1 + 1.2, z: POOL_GATES.east.at });
  out.push({ x: DECK.x0 - 1.0, z: POOL_GATES.service.at });
  return out;
}

const inLot = (x: number, z: number) => [LOT_N, LOT_S].some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
/** 东边的路（停车场再往东，车从画外开来） */
const DRIVE_EAST = Math.min(DRIVE_EAST_END, 100);
/** 会所里面和外墙一圈（拱门、门洞：从外面看时楼里的人藏着，走出门才显示，这一下是合理的进出门） */
const HOUSE_EDGE = 1.5;
const inHouse = (x: number, z: number) =>
  x > CLUBHOUSE.x0 - HOUSE_EDGE &&
  x < CLUBHOUSE.x1 + HOUSE_EDGE &&
  z > CLUBHOUSE.z0 - HOUSE_EDGE &&
  z < CLUBHOUSE.z1 + HOUSE_EDGE;

export class Commute {
  private hooked = new Map<THREE.Object3D, Hooked>();
  private walkers: Walker[] = [];
  private exits: XZ[] = exits();
  private appeared: Hooked[] = [];
  private v = new THREE.Vector3();
  /** 调试：接管过多少次 */
  stats = { leave: 0, chase: 0, caught: 0, gaveUp: 0, legit: 0, offscreen: 0 };

  constructor(private o: CommuteOpts) {}

  /** 给一个人装 visible 的访问器（Binder 扫描时调；重复调没事） */
  hook(obj: THREE.Object3D, scene: string) {
    if (this.hooked.has(obj)) return;
    const h: Hooked = {
      obj,
      scene,
      want: obj.visible,
      held: false,
      last: null,
      dir: { x: 0, z: 0 },
      wait: 0,
      tries: 0,
    };
    this.hooked.set(obj, h);
    Object.defineProperty(obj, 'visible', {
      configurable: true,
      enumerable: true,
      get: () => h.want && !h.held,
      set: (v: boolean) => {
        v = !!v;
        if (v === h.want) return;
        h.want = v;
        if (v) this.onAppear(h);
        else this.onVanish(h);
      },
    });
  }

  /** 这个人被通勤藏着（名字小牌、点人跳过他） */
  isHeld(obj: THREE.Object3D) {
    return this.hooked.get(obj)?.held ?? false;
  }

  private shownParents(obj: THREE.Object3D) {
    for (let q = obj.parent; q; q = q.parent) if (!q.visible) return false;
    return true;
  }

  private near(p: XZ) {
    const d = this.o.director.position;
    return Math.hypot(p.x - d.x, p.z - d.z) <= CARE_R;
  }

  private legit(p: XZ) {
    if (inHouse(p.x, p.z)) return true;
    // 停车场里（车边上下车、代客泊车）、落客点、东边的路（车从画外来）
    if (inLot(p.x, p.z) || p.x > DRIVE_EAST) return true;
    if (Math.hypot(p.x - SPOTS.dropoff[0], p.z - SPOTS.dropoff[1]) <= 2.6) return true;
    for (const e of this.exits) if (Math.hypot(e.x - p.x, e.z - p.z) <= AT_EXIT) return true;
    return false;
  }

  private where(obj: THREE.Object3D): XZ {
    obj.updateWorldMatrix(true, false);
    this.v.setFromMatrixPosition(obj.matrixWorld);
    return { x: this.v.x, z: this.v.z };
  }

  // ── 消失：替身接着走到出入口 ──
  private onVanish(h: Hooked) {
    // 正藏着等替身：替身改成离开（它就是这个人，转身走掉）
    if (h.held) {
      h.held = false;
      const w = this.walkers.find((q) => q.busy && q.target === h);
      if (w) this.toLeave(w);
      return;
    }
    if (!this.shownParents(h.obj)) return;
    const p = h.last ?? this.where(h.obj);
    const dir = { ...h.dir };
    h.last = null;
    if (!this.near(p)) return;
    if (this.legit(p)) {
      this.stats.legit++;
      return;
    }
    const w = this.spawn(h.obj, p);
    if (!w) return;
    this.stats.leave++;
    this.toLeave(w, dir);
  }

  // ── 瞬移：旧地方放一个替身走掉，新地方藏着等替身从出入口赶来 ──
  private onJump(h: Hooked, from: XZ, to: XZ) {
    if (!this.shownParents(h.obj)) return;
    if (this.near(from) && !this.legit(from)) {
      const w = this.spawn(h.obj, from);
      if (w) {
        this.stats.leave++;
        this.toLeave(w, { ...h.dir });
      }
    }
    h.dir.x = 0;
    h.dir.z = 0;
    if (this.near(to) && !this.legit(to)) {
      h.held = true;
      this.appeared.push(h);
    }
  }

  // ── 出现：先藏着，下一步看他在哪儿，再决定要不要替身从出入口赶来 ──
  private onAppear(h: Hooked) {
    if (!this.shownParents(h.obj)) return;
    h.held = true;
    // 他刚走开（替身正往出入口去）又被演出叫回来：替身掉头追回去交接，不另起一个
    const id = h.obj.userData.castId;
    const w = id && this.walkers.find((q) => q.busy && q.mode === 'leave' && q.obj.userData.castId === id);
    if (w) {
      w.mode = 'chase';
      w.target = h;
      w.goal = null;
      w.path = [];
      w.replanT = 0;
      return;
    }
    this.appeared.push(h);
  }

  private settleAppeared(dt: number) {
    const later: Hooked[] = [];
    for (const h of this.appeared.splice(0)) {
      if (!h.held || !h.want) continue;
      if (h.wait > 0) {
        h.wait -= dt;
        later.push(h);
        continue;
      }
      const p = this.where(h.obj);
      if (!this.near(p) || this.legit(p)) {
        if (this.legit(p)) this.stats.legit++;
        h.held = false;
        continue;
      }
      const exit = this.nearestExit(p);
      // 这会儿没有路（他在还没建好的区域里）：先藏着，隔一秒再试，等他走进有路的地方；太久就算了
      if (!exit && h.tries < WAIT_TRIES) {
        h.tries++;
        h.wait = 1;
        later.push(h);
        continue;
      }
      const w = exit && this.spawn(h.obj, exit.at);
      if (!w || !exit) {
        h.held = false;
        continue;
      }
      h.tries = 0;
      this.stats.chase++;
      w.mode = 'chase';
      w.target = h;
      w.goal = null;
      w.path = exit.path.slice().reverse();
      w.replanT = 0.5;
    }
    this.appeared.push(...later);
  }

  /**
   * 最近的出入口（按路的长度，先按直线挑 4 个再规划）。给了 dir（他正往哪儿走）：只挑前面的（夹角 < 100°），
   * 前面一个都没有才挑全部 —— 从停车场走进大门的人接着往里走到会所，不掉头回停车场。
   */
  private nearestExit(p: XZ, dir?: XZ): { at: XZ; path: [number, number][] } | null {
    const nav = this.o.nav();
    const dl = dir ? Math.hypot(dir.x, dir.z) : 0;
    const ahead = (e: XZ) => {
      if (dl < 1e-4 || !dir) return true;
      const ex = e.x - p.x;
      const ez = e.z - p.z;
      return (ex * dir.x + ez * dir.z) / (Math.hypot(ex, ez) * dl + 1e-9) > -0.17;
    };
    const all = this.exits.map((e) => ({ e, d: Math.hypot(e.x - p.x, e.z - p.z) }));
    const front = all.filter(({ e }) => ahead(e));
    const cand = (front.length ? front : all).sort((a, b) => a.d - b.d).slice(0, 4);
    let best: { at: XZ; path: [number, number][]; len: number } | null = null;
    for (const { e } of cand) {
      const path = nav.findPath(p.x, p.z, e.x, e.z);
      if (!path?.length) continue;
      let len = 0;
      let a: [number, number] = [p.x, p.z];
      for (const q of path) {
        len += Math.hypot(q[0] - a[0], q[1] - a[1]);
        a = q;
      }
      if (!best || len < best.len) best = { at: e, path, len };
    }
    return best;
  }

  private toLeave(w: Walker, dir?: XZ) {
    const p = { x: w.obj.position.x, z: w.obj.position.z };
    const exit = this.nearestExit(p, dir);
    w.mode = 'leave';
    w.target = null;
    if (!exit) {
      this.release(w, 'noexit');
      return;
    }
    w.goal = exit.at;
    w.path = exit.path;
  }

  private spawn(like: THREE.Object3D, at: XZ): Walker | null {
    const person = this.o.person(like);
    if (!person) return null;
    const kindOf = (like.userData.personKind as PersonKind | undefined) ?? 'player';
    const kind: 'adult' | 'kid' = kindOf === 'kid' ? 'kid' : 'adult';
    let w = this.walkers.find((q) => !q.busy && q.kind === kind);
    if (!w) {
      if (this.walkers.length >= POOL_MAX) {
        // 池满了：借离总监最远、已经不在画面里的那个（它要替的真人照演出来，反正看不见）
        const d0 = this.o.director.position;
        const dist = (q: Walker) => Math.hypot(q.obj.position.x - d0.x, q.obj.position.z - d0.z);
        const far = this.walkers
          .filter((q) => q.kind === kind && dist(q) > STEAL_R)
          .sort((a, b) => dist(b) - dist(a))[0];
        if (!far) return null;
        if (far.target) far.target.held = false;
        this.release(far, 'stolen');
        w = far;
      }
    }
    if (!w) {
      const obj = this.o.make(kind);
      obj.name = 'commuter';
      obj.userData.setProp?.(null);
      this.o.scene.add(obj);
      w = {
        obj,
        kind,
        busy: false,
        mode: 'leave',
        target: null,
        path: [],
        goal: null,
        replanT: 0,
        t: 0,
        phase: 0,
        yaw: 0,
      };
      this.walkers.push(w);
    }
    if (w.obj.userData.castDressed !== person.id) {
      try {
        this.o.dresser?.dress(w.obj, person.look);
      } catch (e) {
        console.warn('[cast] commuter dress failed', person.id, e);
      }
      w.obj.userData.castDressed = person.id;
    }
    w.obj.userData.castId = person.id;
    w.busy = true;
    w.t = 0;
    w.obj.visible = true;
    w.obj.position.set(at.x, this.o.nav().height(at.x, at.z) ?? 0, at.z);
    w.yaw = like.rotation.y;
    w.obj.rotation.y = w.yaw;
    w.obj.userData.setProp?.(null);
    w.obj.userData.setSeat?.(null);
    return w;
  }

  private release(w: Walker, why = '') {
    w.obj.userData.commuteWhy = why;
    w.busy = false;
    w.target = null;
    w.path = [];
    w.obj.visible = false;
  }

  /** 每个模拟步（cast.step 里） */
  step(dt: number) {
    this.settleAppeared(dt);
    // 看得见、离总监不远的人：记下这一步在哪儿
    const d0 = this.o.director.position;
    for (const h of this.hooked.values()) {
      if (!h.want || h.held) continue;
      const q = h.obj.position;
      if (Math.abs(q.x - d0.x) > CARE_R + 10 || Math.abs(q.z - d0.z) > CARE_R + 10) {
        h.last = null;
        continue;
      }
      const p = this.where(h.obj);
      // 演出一步把人挪出去好几米（循环路线走完了直接放回起点）：当成在旧地方消失、在新地方出现
      if (h.last && Math.hypot(p.x - h.last.x, p.z - h.last.z) > JUMP) {
        this.onJump(h, h.last, p);
        h.last = null;
        continue;
      }
      if (h.last) {
        // 走的方向：位移的指数平均（站着不动时慢慢归零，坐着的人消失时就挑最近的）
        h.dir.x = h.dir.x * 0.9 + (p.x - h.last.x) * 0.1;
        h.dir.z = h.dir.z * 0.9 + (p.z - h.last.z) * 0.1;
        h.last.x = p.x;
        h.last.z = p.z;
      } else h.last = p;
    }
    const nav = this.o.nav();
    for (const w of this.walkers) {
      if (!w.busy) continue;
      w.t += dt;
      const pos = w.obj.position;
      // 不在画面里了（总监走远了、真人所在的区域藏起来了）：直接收工，真人照演出来
      // 追人的替身看被追的人（替身可能从画面外的出入口出发），离开的替身看它自己
      const ref = w.mode === 'chase' && w.target ? this.where(w.target.obj) : pos;
      const far = Math.hypot(ref.x - this.o.director.position.x, ref.z - this.o.director.position.z) > CARE_R + 15;
      if (far || (w.mode === 'chase' && w.target && !this.shownParents(w.target.obj))) {
        if (w.target) w.target.held = false;
        this.stats.offscreen++;
        this.release(w, 'offscreen');
        continue;
      }
      if (w.mode === 'chase') {
        const h = w.target as Hooked;
        const tp = this.where(h.obj);
        const d = Math.hypot(tp.x - pos.x, tp.z - pos.z);
        if (d <= CATCH || w.t > CHASE_MAX || !h.held) {
          if (w.t > CHASE_MAX) this.stats.gaveUp++;
          else this.stats.caught++;
          h.held = false;
          this.release(w, w.t > CHASE_MAX ? 'gaveup' : 'caught');
          continue;
        }
        // 他照演出在走：隔一会儿按他现在的位置重新规划
        w.replanT -= dt;
        if (w.replanT <= 0 || !w.path.length) {
          w.replanT = 0.6;
          w.path = nav.findPath(pos.x, pos.z, tp.x, tp.z) ?? [[tp.x, tp.z]];
        }
      }
      // 沿路走
      let v = LEAVE_V;
      if (w.mode === 'chase' && w.target) {
        const tp = this.where(w.target.obj);
        const gap = Math.hypot(tp.x - pos.x, tp.z - pos.z);
        v = Math.min(CHASE_VMAX, CHASE_V + Math.max(0, gap - 6) * 0.1);
      }
      let step = v * dt;
      let moved = 0;
      let dx = 0;
      let dz = 0;
      while (step > 1e-6 && w.path.length) {
        const [tx, tz] = w.path[0];
        const ex = tx - pos.x;
        const ez = tz - pos.z;
        const l = Math.hypot(ex, ez);
        if (l <= step) {
          pos.x = tx;
          pos.z = tz;
          step -= l;
          moved += l;
          w.path.shift();
        } else {
          pos.x += (ex / l) * step;
          pos.z += (ez / l) * step;
          moved += step;
          step = 0;
        }
        dx += ex;
        dz += ez;
      }
      pos.y = nav.height(pos.x, pos.z) ?? pos.y;
      if (moved > 1e-4) {
        const want = Math.atan2(dx, dz);
        let a = want - w.yaw;
        a -= Math.round(a / (Math.PI * 2)) * Math.PI * 2;
        w.yaw += a * Math.min(1, dt * 10);
        w.obj.rotation.y = w.yaw;
        const stride = setStride(w.obj);
        w.phase = (w.phase + moved / (stride || strideOf(w.obj))) % 1;
        w.obj.userData.pose?.('walk', w.phase);
      } else w.obj.userData.pose?.('idle', (w.t / 3) % 1);
      if (w.mode === 'leave' && !w.path.length) this.release(w, 'exit');
    }
  }

  /** 调试 */
  debug() {
    return {
      hooked: this.hooked.size,
      walking: this.walkers
        .filter((w) => w.busy)
        .map((w) => ({ id: w.obj.userData.castId, mode: w.mode, path: w.path.length })),
      pool: this.walkers.length,
      held: [...this.hooked.values()].filter((h) => h.held).length,
      ...this.stats,
    };
  }
}
