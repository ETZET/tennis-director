// 一层（商店层）的演出 + 信号（总监的活在 play-1f.ts）。接口见 stage3.ts（FloorEnv / FloorModule）、walker.ts。
//
// ── 人 ──（摆好的人接管过来；走路的是 Walker，站岗的是下面的 actor：只转身、做姿势，不挪地方）
//   逛街的（新加一个）  正门外 → shopper 路线，在咖啡吧台前 / 穿线窗口 / 专卖店 / 纪念品店 / 运动营养各停一会儿；在咖啡吧台买一杯带走
//   专卖店的客人（shop-queue）  在收银台前等 → 结了账出正门 → 过一阵再来
//   专卖店店员（shop-clerk）    在收银台后面收银；隔一阵去北墙的拍子墙理货（这时候有人等 = "收银"的信号），回来接着收
//   泳池的客人（新加一个）      泳池北门 ↔ 拱廊 ↔ 运动营养的柜台窗（买一杯）↔ 钟楼门厅的毛巾格
//   送货的（delivery）          后门口接一只箱子 → 码到货箱垛上（垛多一只）；垛满了（或者隔几趟）就送去便利店（kioskRestock 路线）
//   咖啡师、穿线师、纪念品店店员、饮品师、便利店店员：在自己的岗位上转身、弯腰、递东西
//
// ── 信号（jobs）── 状态：idle → signal（画面上的信号道具出来）→（doing：杯子在总监手里）→ cooldown → idle
//   hooks / soldout / row / kiosk  四个补货点（空挂钩、卖空的一格、冷柜空了一排、空货格）：货箱垛的 stock-box 补上
//   cups    咖啡吧后段小圆桌上的脏杯子：收到吧台
//   prints  正门里的沙脚印：拖；mat 钟楼南门里沙垫上的沙：抖
//   till    店员走开了、有人在收银台前等：替他收银（不管也行：店员回来自己收）
//   boxes   货箱垛堆满了（5 只）：搬走去补货就少了
//   玩法模式：开局都是好的，过几秒起隔一阵亮一个（种子随机，错开）；没人管就一直亮着，什么都不会坏。
//   看图模式（没有总监）：信号都亮着（= stage 2 摆好的样子），货箱垛满的。
//   调试：debug.jobs() → { id, state }[]；debug.force(id) 现在就亮；debug.boxes()；debug.people。
import * as THREE from 'three';
import { attachShopPlay, buildCarryBox, type JobState, type Shop1F } from './play-1f';
import { type P3, ROUTES } from './routes';
import type { FloorEnv, FloorModule } from './stage3';
import type { Co, Walker } from './walker';

interface Job {
  id: string;
  state: JobState;
  /** cooldown 还剩几秒 */
  t: number;
  /** 由调度器按时间点亮（till、boxes 是算出来的） */
  auto: boolean;
  show(on: boolean): void;
}

/** 站岗的人：只转身、做姿势（不挪地方，所以不用 Walker；Walker 的测试要求每个都走够 20 米） */
interface Actor {
  obj: THREE.Object3D;
  run(script: (a: Actor) => Co): void;
  update(dt: number): void;
  wait(sec: number): Co;
  act(pose: string, sec: number, loop?: boolean): Co;
  turn(yaw: number): Co;
}
const wrap = (a: number) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
function actor(obj: THREE.Object3D): Actor {
  const pose = (n: string, p?: number) => (obj.userData.pose as ((n: string, p?: number) => void) | undefined)?.(n, p);
  let script: Co | null = null;
  const a: Actor = {
    obj,
    run(s) {
      script = s(a);
    },
    update(dt) {
      if (script?.next(dt).done) script = null;
    },
    *wait(sec) {
      let t = 0;
      while (t < sec) t += yield;
    },
    *act(name, sec, loop = false) {
      let t = 0;
      if (loop) pose(name);
      while (t < sec) {
        if (!loop) pose(name, Math.min(0.999, t / sec));
        t += yield;
      }
      pose('idle');
    },
    *turn(yaw) {
      while (true) {
        const err = wrap(yaw - obj.rotation.y);
        if (Math.abs(err) < 0.02) break;
        const dt = yield;
        obj.rotation.y += Math.sign(err) * Math.min(Math.abs(err), 5 * dt);
      }
    },
  };
  return a;
}

const SIGNAL_SLOT: Record<string, string> = {
  hooks: 'shop-empty-hooks',
  soldout: 'shop-soldout',
  row: 'shop-empty-row',
  kiosk: 'kiosk-empty',
  cups: 'shop-dirty-cups',
  prints: 'shop-sand-prints',
  mat: 'shop-sand-mat',
};
/** 互动点的位置（没有摆件时的后备）和总监站的地方 */
const AT: Record<string, { at: [number, number, number]; stand?: [number, number] }> = {
  hooks: { at: [-58.6, 1.5, -39.1], stand: [-58.6, -38.2] },
  soldout: { at: [-57.5, 1.1, -19.0], stand: [-57.5, -18.2] },
  row: { at: [-54.8, 0.9, -18.8], stand: [-54.8, -17.9] },
  kiosk: { at: [-41.2, 0.9, -29.1], stand: [-41.2, -28.4] },
  cups: { at: [-48.9, 0.85, -37.0], stand: [-48.9, -36.1] },
  cafeBar: { at: [-47.95, 1.1, -25.75] },
  prints: { at: [-47.2, 0.05, -21.4] },
  mat: { at: [-47.25, 0.05, -17.2] },
  // 站在垛的东边（站正前面的话草帽把垛挡住）
  boxes: { at: [-43.0, 0.9, -38.95], stand: [-42.0, -38.7] },
  till: { at: [-60.2, 1.0, -27.25], stand: [-60.2, -28.0] },
};
const WHO: Record<string, string> = {
  hooks: 'shop-clerk',
  soldout: 'merch-clerk',
  row: 'nutri-clerk',
  kiosk: 'kiosk-clerk',
  cups: 'shop-barista',
  till: 'shop-queue',
};
const BOX_MAX = 5;
/** shopper 路线上停下来看的几个点（ROUTES 里的下标）：咖啡吧台前、穿线窗口、专卖店、纪念品店、运动营养 */
const SHOP_STOPS = [3, 5, 7, 10, 13];
const CAFE_STOP = 3;
/** 停下来时朝哪看（店里的柜台 / 货架） */
const SHOP_LOOK: Record<number, [number, number]> = {
  3: [-48.2, -26.0],
  5: [-55.3, -25.6],
  7: [-60.4, -28.0],
  10: [-60.6, -16.6],
  13: [-54.8, -19.1],
};
/** poolGuest 路线上的下标：柜台窗、拱廊东头（门厅南门外） */
const POOL_WINDOW = 5;

export function createFloorLife(env: FloorEnv): FloorModule {
  const sched = env.rng('1f-signals');
  const live = env.playing;

  // ═════ 信号 ═════
  /** 摆好的信号道具：开关 = 它下面的网格的 visible（根的 visible 归 houseViews 管，换层会被盖掉） */
  const showKids = (o: THREE.Object3D | null, on: boolean) => {
    if (!o) return;
    for (const c of o.children) c.visible = on;
    o.userData.signalOn = on;
  };
  const jobs = new Map<string, Job>();
  for (const [id, slot] of Object.entries(SIGNAL_SLOT)) {
    const o = env.slot(slot);
    const show =
      id === 'mat'
        ? (on: boolean) => {
            (o?.userData.setSignal as ((on: boolean) => void) | undefined)?.(on);
            if (o) o.userData.signalOn = on;
          }
        : (on: boolean) => showKids(o, on);
    jobs.set(id, { id, state: 'signal', t: 0, auto: true, show });
  }
  jobs.set('till', { id: 'till', state: 'idle', t: 0, auto: false, show() {} });
  jobs.set('boxes', { id: 'boxes', state: 'idle', t: 0, auto: false, show() {} });
  const job = (id: string) => {
    const j = jobs.get(id);
    if (!j) throw new Error(`clubhouse 1F: 没有这个活 ${id}`);
    return j;
  };

  // 货箱垛
  const stack = env.slot('shop-box-stack');
  let boxes = BOX_MAX;
  const setBoxes = (n: number) => {
    boxes = Math.max(0, Math.min(BOX_MAX, n));
    (stack?.userData.setLevel as ((n: number) => void) | undefined)?.(boxes);
  };

  // 收银台（店员、等着的客人、总监之间的小黑板）
  const till = {
    /** 店员在收银台后面 */
    clerkAt: true,
    /** 客人在台前等着 */
    waiting: false,
    /** 这一位结完账了（店员或总监） */
    served: false,
    /** debug.force('till')：店员现在就走开，等到有人被收了银才回来 */
    force: false,
    /** 咖啡吧台 / 营养柜台窗前有人等着买 */
    cafeOrder: false,
    nutriOrder: false,
  };

  const shop: Shop1F = {
    state: (id) => job(id).state,
    clear(id) {
      const j = job(id);
      j.state = 'cooldown';
      j.t = 40 + sched() * 40;
      j.show(false);
    },
    begin(id) {
      const j = job(id);
      j.state = 'doing';
      j.show(false);
    },
    raise,
    at: (id) => at[id],
    stand: (id) => stand[id] ?? null,
    boxes: () => boxes,
    setBoxes,
    serveTill() {
      till.served = true;
    },
    who: (id) => (WHO[id] ? env.slot(WHO[id]) : null),
    onRaise: null,
    makeBox: () => buildCarryBox(env.ctxFor(0)),
    makeCups: () => env.make('shop-dirty-cups'),
  };
  function raise(id: string) {
    const j = job(id);
    if (j.state === 'signal') return;
    j.state = 'signal';
    j.show(true);
    shop.onRaise?.(id);
  }

  const at: Record<string, THREE.Vector3> = {};
  const stand: Record<string, readonly [number, number] | null> = {};
  for (const [id, a] of Object.entries(AT)) {
    at[id] = new THREE.Vector3(...a.at);
    stand[id] = a.stand && env.nav.standAt(a.stand[0], a.stand[1]) !== null ? a.stand : null;
  }

  // 开局：玩法模式都是好的（过一会儿一个一个亮）；看图模式 = 摆好的样子（都亮着、垛是满的）
  if (live) {
    for (const j of jobs.values()) {
      if (!j.auto) continue;
      j.state = 'idle';
      j.show(false);
    }
    setBoxes(3);
  } else for (const j of jobs.values()) j.show(true);
  let nextSignal = 5 + sched() * 4;

  function updateJobs(dt: number) {
    for (const j of jobs.values()) {
      if (j.state !== 'cooldown' || !j.auto) continue;
      j.t -= dt;
      if (j.t <= 0) j.state = 'idle';
    }
    // 调度：隔一阵挑一个闲着的亮起来（一次一个，错开）
    if (live) {
      nextSignal -= dt;
      if (nextSignal <= 0) {
        const idle = [...jobs.values()].filter((j) => j.auto && j.state === 'idle');
        if (idle.length) raise(idle[Math.floor(sched() * idle.length) % idle.length].id);
        nextSignal = 16 + sched() * 20;
      }
    }
    // 收银：店员不在、有人等着
    const tj = job('till');
    const need = !till.clerkAt && till.waiting && !till.served;
    if (need) {
      if (tj.state !== 'signal') raise('till');
    } else if (tj.state === 'signal') tj.state = 'cooldown';
    else if (tj.state === 'cooldown' && till.clerkAt) tj.state = 'idle';
    // 货箱垛：满了
    const bj = job('boxes');
    if (boxes >= BOX_MAX) {
      if (bj.state !== 'signal') raise('boxes');
    } else bj.state = 'idle';
  }

  // ═════ 人 ═════
  const actors: Actor[] = [];
  const people: Record<string, Walker | Actor> = {};
  const setProp = (o: THREE.Object3D, p: string | null) =>
    (o.userData.setProp as ((p: string | null) => void) | undefined)?.(p);
  const route = (id: string): P3[] => ROUTES.find((r) => r.id === id)?.pts ?? [];
  const p3 = (a: readonly number[]): P3 => [a[0], a[1], a[2] ?? 0];
  /** 导航找的路（建的时候找一次）；找不到 = 两点直连（测试会抓出来） */
  const path = (a: P3, b: P3): P3[] => env.nav.route(a, b) ?? [b];
  const back = (pts: readonly P3[], from: P3): P3[] => [...pts].reverse().slice(1).concat([from]);

  // ── 逛街的 ──
  {
    const pts = route('shopper');
    if (pts.length > SHOP_STOPS[SHOP_STOPS.length - 1]) {
      const obj = env.add(env.make('player', 1), { mode: null });
      setProp(obj, null);
      const w = env.walker(obj);
      people.shopper = w;
      w.place(pts[0], -Math.PI / 2);
      const r = env.rng('1f-shopper');
      w.run(function* (w) {
        yield* w.wait(r() * 3);
        while (true) {
          let from = 1;
          for (const stop of SHOP_STOPS) {
            yield* w.go(pts.slice(from, stop + 1));
            from = stop + 1;
            const look = SHOP_LOOK[stop];
            if (look) yield* w.face(look[0], look[1]);
            if (stop === CAFE_STOP) {
              // 买一杯：等咖啡师递过来（最多 8 秒）
              till.cafeOrder = true;
              let t = 0;
              while (till.cafeOrder && t < 8) t += yield;
              till.cafeOrder = false;
              setProp(obj, 'cup');
            } else if (r() < 0.75) yield* w.wait(2 + r() * 3);
          }
          yield* w.go(pts.slice(from));
          setProp(obj, null);
          yield* w.wait(6 + r() * 10);
        }
      });
    }
  }

  // ── 专卖店：等着结账的客人 + 店员 ──
  {
    const cObj = env.slot('shop-queue');
    const kObj = env.slot('shop-clerk');
    if (cObj && kObj) {
      const r = env.rng('1f-proshop');
      const front: P3 = [cObj.position.x, cObj.position.z];
      const post: P3 = [kObj.position.x, kObj.position.z];
      const out: P3 = [-43.6, -22.2];
      const wall: P3 = [-59.8, -37.6];
      const leave = path(front, out);
      const come = back(leave, front);
      const toWall = path(post, wall);
      const toPost = back(toWall, post);

      const cust = env.walker(cObj);
      people.customer = cust;
      cust.run(function* (w) {
        while (true) {
          yield* w.face(post[0], post[1]);
          till.served = false;
          till.waiting = true;
          while (!till.served) yield;
          till.waiting = false;
          yield* w.act('pickup', 0.6);
          yield* w.go(leave);
          yield* w.wait(10 + r() * 14);
          yield* w.go(come);
        }
      });

      const clerk = env.walker(kObj);
      people.clerk = clerk;
      clerk.run(function* (w) {
        while (true) {
          // 在收银台后面：有人等了 3 秒多就收银
          let stay = 30 + r() * 25;
          let seen = 0;
          while (stay > 0 && !till.force) {
            const dt = yield;
            stay -= dt;
            if (till.waiting && !till.served) {
              seen += dt;
              if (seen > 3) {
                yield* w.act('feed', 1.4);
                till.served = true;
                seen = 0;
              }
            } else seen = 0;
          }
          // 去北墙理货
          const forced = till.force;
          till.force = false;
          till.clerkAt = false;
          yield* w.go(toWall);
          yield* w.face(wall[0], wall[1] - 2);
          let away = 22 + r() * 14;
          // 调试强制的：等到真有人等过、而且被收了银才回来（最多 150 秒）
          let cap = 150;
          let sawNeed = false;
          while (away > 0 || (forced && cap > 0 && !(sawNeed && till.served))) {
            if (till.waiting && !till.served) sawNeed = true;
            yield* w.act('pickup', 0.7);
            const p = 1.5 + r() * 2;
            yield* w.wait(p);
            away -= 0.7 + p;
            cap -= 0.7 + p;
          }
          yield* w.go(toPost);
          yield* w.face(post[0], post[1] + 2);
          till.clerkAt = true;
        }
      });
    }
  }

  // ── 泳池的客人 ──
  {
    const pts = route('poolGuest');
    if (pts.length > POOL_WINDOW + 5) {
      const obj = env.add(env.make('player', 3), { mode: null });
      setProp(obj, null);
      const w = env.walker(obj);
      people.poolGuest = w;
      const gate = pts[pts.length - 1];
      w.place(gate, Math.PI);
      const r = env.rng('1f-pool');
      const win = pts[POOL_WINDOW];
      // 泳池北门 → 拱 → 柜台窗；柜台窗 → 拱廊东头 → 门厅（南门 → 里面）；门厅 → 毛巾格；回去 = 门厅 → 拱廊 → 拱 → 北门
      const toWindow = [...pts.slice(POOL_WINDOW + 1)].reverse().slice(1).concat([win]);
      const toHall = [...pts.slice(2, POOL_WINDOW)].reverse();
      const hall = toHall[toHall.length - 1];
      const towel: P3 = [-48.2, -17.4];
      const toTowel = path(hall, towel);
      const fromTowel = back(toTowel, hall);
      const arcade = pts[POOL_WINDOW - 1];
      const home = [...pts.slice(3, POOL_WINDOW), ...path(arcade, pts[POOL_WINDOW + 1]), ...pts.slice(POOL_WINDOW + 2)];
      const clerk = env.slot('nutri-clerk');
      let trip = 0;
      w.run(function* (w) {
        yield* w.wait(4 + r() * 6);
        while (true) {
          yield* w.go(toWindow);
          yield* w.face(clerk?.position.x ?? win[0], clerk?.position.z ?? win[1] - 2);
          till.nutriOrder = true;
          let t = 0;
          while (till.nutriOrder && t < 8) t += yield;
          till.nutriOrder = false;
          setProp(obj, 'cup');
          yield* w.wait(1 + r() * 2);
          if (trip++ % 2 === 0) {
            // 进门厅拿条毛巾
            yield* w.go(toHall);
            yield* w.go(toTowel);
            yield* w.face(towel[0] - 1, towel[1] + 0.4);
            yield* w.act('pickup', 0.7);
            yield* w.go(fromTowel);
            yield* w.go(home);
          } else yield* w.go(pts.slice(POOL_WINDOW + 1));
          setProp(obj, null);
          yield* w.wait(14 + r() * 16);
        }
      });
    }
  }

  // ── 送货的 ──
  {
    const obj = env.slot('delivery');
    const kiosk = route('kioskRestock');
    if (obj && kiosk.length) {
      const r = env.rng('1f-delivery');
      const home: P3 = [obj.position.x, obj.position.z];
      const door: P3 = p3(kiosk[0]);
      const front: P3 = [-42.4, -38.0];
      const toDoor = path(home, door);
      const toStack = path(door, front);
      const toHome = path(front, home);
      const fromKiosk = back(kiosk, door);
      const box = buildCarryBox(env.ctxFor(0));
      const hold = (on: boolean) => {
        if (on) (obj.userData.hold as ((o: THREE.Object3D, g?: unknown) => void) | undefined)?.(box, box.userData.grip);
        else setProp(obj, null);
      };
      const w = env.walker(obj);
      people.delivery = w;
      let trip = 0;
      w.run(function* (w) {
        while (true) {
          yield* w.wait(14 + r() * 14);
          // 后门口接一只箱子（车停在门外）
          yield* w.go(toDoor);
          yield* w.face(door[0] + 2, door[1]);
          yield* w.act('pickup', 0.8);
          hold(true);
          trip++;
          if (boxes >= BOX_MAX || trip % 3 === 0) {
            // 垛满了 / 隔几趟：直接送去便利店
            yield* w.go(kiosk.slice(1));
            yield* w.act('pickup', 0.8);
            hold(false);
            yield* w.wait(1.5);
            yield* w.go(fromKiosk);
            yield* w.go(path(door, home));
          } else {
            yield* w.go(toStack);
            yield* w.face(-43.0, -38.95);
            yield* w.act('pickup', 0.8);
            hold(false);
            setBoxes(boxes + 1);
            yield* w.wait(1);
            yield* w.go(toHome);
          }
          yield* w.face(home[0] - 2, home[1]);
        }
      });
    }
  }

  // ── 站岗的：咖啡师、穿线师、三个店员 ──
  const post = (id: string, seed: string, script: (a: Actor, r: () => number, home: number) => Co) => {
    const obj = env.slot(id);
    if (!obj) return;
    const a = actor(obj);
    const r = env.rng(seed);
    const home = obj.rotation.y;
    a.run((a) => script(a, r, home));
    actors.push(a);
    people[id] = a;
  };
  /** 柜台后面的小循环：等着；有人要买（order）就弯腰拿、递出去；闲了转身理一下货架 */
  const counterLoop = (order: (() => boolean) | null, done: () => void, back: number) =>
    function* (a: Actor, r: () => number, home: number): Co {
      yield* a.wait(r() * 4);
      while (true) {
        let t = 3 + r() * 5;
        while (t > 0) {
          t -= yield;
          if (order?.()) {
            yield* a.wait(0.6);
            yield* a.act('pickup', 0.7);
            yield* a.act('feed', 1.3);
            done();
          }
        }
        if (r() < 0.55) {
          yield* a.turn(home + back);
          yield* a.act('pickup', 0.7);
          yield* a.wait(0.8 + r() * 1.5);
          yield* a.turn(home);
        } else yield* a.act('pickup', 0.7);
      }
    };
  post(
    'shop-barista',
    '1f-barista',
    counterLoop(
      () => till.cafeOrder,
      () => {
        till.cafeOrder = false;
      },
      Math.PI * 0.6,
    ),
  );
  post(
    'nutri-clerk',
    '1f-nutri',
    counterLoop(
      () => till.nutriOrder,
      () => {
        till.nutriOrder = false;
      },
      Math.PI,
    ),
  );
  post(
    'merch-clerk',
    '1f-merch',
    counterLoop(null, () => {}, -Math.PI * 0.7),
  );
  post(
    'kiosk-clerk',
    '1f-kiosk',
    counterLoop(null, () => {}, Math.PI * 0.8),
  );
  // 穿线师：转身到背后的穿线机上拉一会儿线，再转回柜台
  post('shop-stringer', '1f-stringer', function* (a, r, home) {
    const m = env.slot('shop-stringing-machine');
    const toMachine = m ? Math.atan2(m.position.x - a.obj.position.x, m.position.z - a.obj.position.z) : home + Math.PI;
    yield* a.wait(r() * 3);
    while (true) {
      yield* a.wait(3 + r() * 4);
      yield* a.turn(toMachine);
      for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
        yield* a.act('pickup', 0.9);
        yield* a.wait(0.5 + r());
      }
      yield* a.turn(home);
      if (r() < 0.5) yield* a.act('feed', 1.3);
    }
  });

  return {
    update(dt) {
      updateJobs(dt);
      for (const a of actors) a.update(dt);
    },
    attach: (play) => attachShopPlay(play, shop),
    debug: {
      jobs: () => [...jobs.values()].map((j) => ({ id: j.id, state: j.state })),
      /** 现在就亮（till：店员现在走开；boxes：垛堆满） */
      force(id: string) {
        if (id === 'till') till.force = true;
        else if (id === 'boxes') setBoxes(BOX_MAX);
        else raise(id);
      },
      boxes: () => boxes,
      till,
      people,
      shop,
    },
  };
}
