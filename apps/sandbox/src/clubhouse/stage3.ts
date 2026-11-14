// 会所 stage 3（演出 + 总监的活）的框架：三层各一个模块（life-1f.ts / life-2f.ts / life-b1.ts），这里把它们拼起来。
// 两个入口（独立页面 main.ts、大世界 scene.ts）都只做四件事：
//   const life = createHouseLife(host);            // 建场景之后
//   life.update(dt, t);                            // 每个模拟步，play.update 之前
//   const jobs = life.attach(play); jobs.step(dt); // 玩法模式：登记一次；step 在 play.update 之后
//   life.setView(inside, floor);                   // 看法变了（进出会所、换层）
//
// 楼层模块拿到的 FloorEnv（见下面的接口）：这一层的导航、摆件、建资产、往场景里加东西（自动打 houseViews）、Walker、看法。
// 楼层模块登记的互动点 / 气泡 / 顶栏 / 挡路圆只在**总监在会所里、而且在这一层**时生效（floorPlay：三层的 x、z 是叠着的，
//   互动点按平面距离算，不分层就会在一层按到二层的钟绳）；id 自动加前缀（'2f:bell'）。play.addItem 的东西是全局的（能带着换层）：
//   框架每步看着它们 —— 拿在手里 = 哪一层都显示；放在地上 = 按高度归层（别的层看不见、也拿不到）。
// Walker（walker.ts）由这里统一推（楼层模块建了就不用管 update）；总监走不穿同一层的 Walker（attach 里登记的挡路圆）。
import type * as THREE from 'three';
import type { Anchor, Circle, Interactable, Item, Play } from '../clubsite/play';
import { NavMap } from '../clubsite/play/nav';
import { CLUBHOUSE, GROUNDS } from '../clubsite/world';
import type { AssetCtx } from './ctx';
import { FOOT } from './layout';
import { createFloorLife as createLife1F } from './life-1f';
import { createFloorLife as createLife2F } from './life-2f';
import { createFloorLife as createLifeB1 } from './life-b1';
import { houseNav } from './nav';
import { gymPerson } from './people';
import type { P3 } from './routes';
import { type Floor, type HouseMode, type HouseView, tagViews, viewOf, viewsFor, visibleIn } from './view';
import { createWalker, floorAt, routeBetween, type Walker, type WalkerOpts, type WalkerWorld } from './walker';

/** 入口（main.ts / scene.ts）给框架的东西 */
export interface HouseHost {
  /** 会所的东西加到哪（独立页面 = scene；大世界 = 会所这个区域的 Group） */
  parent: THREE.Object3D;
  ctxFor(variant: number): AssetCtx;
  /** 种子随机流（ctx.rng） */
  rng(stream: string): () => number;
  /** 设计纹素（米） */
  texel: number;
  /** 建一个资产（自己画的 → 复用的 → 占位），不加进场景 */
  make(asset: string, variant: number): THREE.Object3D;
  /** 玩法模式（总监归玩家；演出不碰总监） */
  playing: boolean;
  /** 玩家的总监（看图模式 = null） */
  director(): THREE.Object3D | null;
}

export interface AddOpts {
  /** 在哪一层（默认 = 这个模块的层） */
  level?: Floor;
  /** 'in' = 只在那一层的剖面（默认）；'out' = 只在外观；null = 都在 */
  mode?: HouseMode | null;
  /** 直接指定看法（盖掉 level / mode） */
  views?: HouseView[];
}

/** 这一层的导航小工具（无画面的 NavMap，和总监用的那张同一份数据） */
export interface FloorNav {
  readonly map: NavMap;
  /** 能站（含家具）：高度或 null */
  standAt(x: number, z: number): number | null;
  /** 两点之间找路（A* + 拉直），不带高度 */
  findPath(ax: number, az: number, bx: number, bz: number): [number, number][] | null;
  /** 同一层两个站位（SPOTS 的名字）/ 点之间的路线（带高度的 P3，直接给 Walker）；走不通 = null */
  route(a: string | P3, b: string | P3): P3[] | null;
  /** (x, z) 附近 r 米以内最近的能站的点 */
  nearestFree(x: number, z: number, r?: number): [number, number] | null;
}

export interface FloorEnv {
  /** 这个模块管哪一层 */
  readonly floor: Floor;
  readonly parent: THREE.Object3D;
  ctxFor(variant: number): AssetCtx;
  /** 种子随机流：env.rng('1f-shopper')()；只决定画面 */
  rng(stream: string): () => number;
  readonly texel: number;
  /** 摆好的东西 slot:<id>（没有 = null） */
  slot(id: string): THREE.Object3D | null;
  /** 建一个资产（自己画的 → 复用的 → 占位；人自动带健身姿势），还没进场景：用 add 加 */
  make(asset: string, variant?: number): THREE.Object3D;
  /** 加进场景：打上这一层的 houseViews（默认只在这一层的剖面）、马上按当前看法切 visible、userData.update 每步会被调。返回 obj */
  add<T extends THREE.Object3D>(obj: T, opts?: AddOpts): T;
  /** 从场景拿掉（add 的反操作） */
  drop(obj: THREE.Object3D): void;
  /** 换层 / 换显示规则（上下楼的 NPC、放到别的层的东西）：重新打 houseViews 并马上切 visible。mode 默认 'in'，null = 外观里也在 */
  setLevel(obj: THREE.Object3D, floor: Floor, mode?: HouseMode | null): void;
  /** 去掉 houseViews（哪种看法都显示：拿在总监手里的东西） */
  untag(obj: THREE.Object3D): void;
  /** 现在的看法 'out' | 'b1' | '1f' | '2f' */
  view(): HouseView;
  /** 总监在会所里、而且在这一层（看图模式 = 正在看这一层的剖面） */
  onFloor(): boolean;
  /** 总监在哪一层（不在会所里 = null） */
  directorFloor(): Floor | null;
  /** 这一层的导航 */
  readonly nav: FloorNav;
  /** 别的层的导航（NPC 上下楼以后找路） */
  navOf(f: Floor): FloorNav;
  /** 玩法模式（总监归玩家） */
  readonly playing: boolean;
  /** 玩家的总监（看图模式 = null）。演出不要摆他的姿势 */
  director(): THREE.Object3D | null;
  /** 建一个 Walker（walker.ts）：obj 要先 add 进场景；框架每步推它，总监走不穿它 */
  walker(obj: THREE.Object3D, opts?: WalkerOpts): Walker;
  /** 拿掉一个 Walker（不再推；obj 还在场景里） */
  dropWalker(w: Walker): void;
  /** 三层共用的一块小黑板（跨层的状态：'b1.firewood' 这种，键带上自己层的前缀） */
  readonly shared: Record<string, unknown>;
}

export interface FloorModule {
  /** 每个模拟步（play.update 之前）：NPC 的逻辑、信号。Walker 不用在这里推 */
  update(dt: number, t: number): void;
  /** 登记总监的活（一次）。play = 这一层的（见文件头）；返回的 step 每个模拟步在 play.update 之后调 */
  attach?(play: Play): { step(dt: number): void } | null;
  /** 调试钩子（window.__house.life.debug['1f']） */
  debug?: Record<string, unknown>;
}

export interface HouseLife {
  update(dt: number, t: number): void;
  attach(play: Play): { step(dt: number): void };
  /** 看法变了：inside = 总监在会所里（看图模式 = 剖面），floor = 他在哪一层（看的哪一层） */
  setView(inside: boolean, floor: Floor): void;
  /** 所有的 Walker（测试、调试） */
  walkers(): readonly Walker[];
  readonly debug: Record<string, unknown>;
}

export const FLOOR_KEY: Record<Floor, 'b1' | '1f' | '2f'> = { [-1]: 'b1', 1: '1f', 2: '2f' };

// ── 每层一张无画面的导航（同 main.ts 总监用的范围；第一次用才建，三层共 ≈ 几十毫秒）──
const NAV_BOUNDS = { x0: GROUNDS.x0, x1: CLUBHOUSE.x1 + 0.5, z0: GROUNDS.z0, z1: -1 };
const navMaps = new Map<Floor, NavMap>();
/** 某一层的 NavMap（缓存；SLOTS 是静态的） */
export function houseNavMap(f: Floor): NavMap {
  let n = navMaps.get(f);
  if (!n) navMaps.set(f, (n = new NavMap({ groundAt: () => 0, bounds: NAV_BOUNDS, ...houseNav(f) })));
  return n;
}
const floorNavs = new Map<Floor, FloorNav>();
function floorNav(f: Floor): FloorNav {
  let n = floorNavs.get(f);
  if (!n) {
    const lazy = () => houseNavMap(f);
    n = {
      get map() {
        return lazy();
      },
      standAt: (x, z) => lazy().standAt(x, z),
      findPath: (ax, az, bx, bz) => lazy().findPath(ax, az, bx, bz),
      route: (a, b) => routeBetween(lazy(), a, b),
      nearestFree: (x, z, r = 2) => lazy().nearestFree(x, z, r),
    };
    floorNavs.set(f, n);
  }
  return n;
}

const inFoot1 = (x: number, z: number) => FOOT[1].some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);

interface Scoped {
  play: Play;
  setActive(on: boolean): void;
}
type BubbleRec = { anchor: Anchor; text: string; dy?: number };

/**
 * 一层的 play：互动点、常驻气泡、顶栏、挡路圆只在 active（总监在会所里、在这一层）时挂到真的 play 上；id / key 加前缀。
 * say / toast 不在这一层时丢掉。addItem 照旧是全局的（onItem 让框架记下来）。别的方法原样透传。
 */
function floorPlay(p: Play, key: string, onItem: (it: Item) => void): Scoped {
  const inters = new Map<string, Interactable>();
  const stats = new Map<string, { label: string; value: string | number }>();
  const bubbles = new Map<string, BubbleRec>();
  let active = false;
  const pre = (id: string) => `${key}:${id}`;
  const w: Play = Object.create(p);
  w.add = (it) => {
    const x = { ...it, id: pre(it.id) };
    inters.set(it.id, x);
    if (active) p.add(x);
    return () => {
      if (inters.get(it.id) === x) {
        inters.delete(it.id);
        p.remove(x.id);
      }
    };
  };
  w.remove = (id) => {
    inters.delete(id);
    p.remove(pre(id));
  };
  w.get = (id) => inters.get(id);
  w.addItem = (spec) => {
    const it = p.addItem(spec);
    onItem(it);
    return it;
  };
  w.addBlocker = (fn) => p.addBlocker(() => (active ? fn() : null));
  w.blockPerson = (obj, r = 0.3) => {
    const c: Circle = { x: 0, z: 0, r };
    return w.addBlocker(() => {
      if (!obj.visible || !obj.parent || obj === p.director) return null;
      c.x = obj.matrixWorld.elements[12] || obj.position.x;
      c.z = obj.matrixWorld.elements[14] || obj.position.z;
      return c;
    });
  };
  w.stat = (k, label, value) => {
    if (value === null) stats.delete(k);
    else stats.set(k, { label, value });
    if (active || value === null) p.stat(pre(k), label, value);
  };
  w.bubble = (k, anchor, text = '', dy) => {
    if (!anchor || !text) bubbles.delete(k);
    else bubbles.set(k, { anchor, text, dy });
    if (active || !anchor || !text) p.bubble(pre(k), anchor, text, dy);
  };
  w.say = (anchor, text, sec, dy) => {
    if (active) p.say(anchor, text, sec, dy);
  };
  w.toast = (text, sec) => {
    if (active) p.toast(text, sec);
  };
  return {
    play: w,
    setActive(on) {
      if (on === active) return;
      active = on;
      for (const x of inters.values()) {
        if (on) p.add(x);
        else p.remove(x.id);
      }
      for (const [k, b] of bubbles) p.bubble(pre(k), on ? b.anchor : null, b.text, b.dy);
      for (const [k, s] of stats) p.stat(pre(k), s.label, on ? s.value : null);
    },
  };
}

export function createHouseLife(host: HouseHost): HouseLife {
  let inside = false;
  let floor: Floor = 1;
  const view = () => viewOf(inside, floor);
  const dirFloor = (): Floor | null => (inside ? floor : null);

  // ── 加进场景的东西：houseViews、userData.update ──
  const updaters = new Map<THREE.Object3D, ((dt: number, t: number) => void)[]>();
  const applyVis = (obj: THREE.Object3D) => {
    obj.visible = visibleIn(obj.userData, view()) ?? true;
  };
  const setLevel = (obj: THREE.Object3D, f: Floor, mode: HouseMode | null = 'in') => {
    tagViews(obj, viewsFor(f, mode ?? undefined));
    // mode null = 会所外面（外观里也在）：进楼是沉浸式的，看剖面时藏起来
    obj.userData.houseOutside = mode === null;
    applyVis(obj);
  };
  const untag = (obj: THREE.Object3D) => {
    delete obj.userData.houseViews;
    delete obj.userData.houseOutside;
    obj.visible = true;
  };
  const make = (asset: string, variant = 0) =>
    gymPerson(host.make(asset, variant), host.ctxFor(variant), { loop: true });

  // ── Walker ──
  const walkers: Walker[] = [];
  const dirAt = { x: 0, z: 0, floor: 1 as Floor };
  const world: WalkerWorld = {
    navOf: houseNavMap,
    setLevel,
    walkers: () => walkers,
    director() {
      const D = host.playing && inside ? host.director() : null;
      if (!D) return null;
      dirAt.x = D.position.x;
      dirAt.z = D.position.z;
      dirAt.floor = floor;
      return dirAt;
    },
  };

  const shared: Record<string, unknown> = {};
  const envFor = (f: Floor): FloorEnv => ({
    floor: f,
    parent: host.parent,
    ctxFor: host.ctxFor,
    rng: host.rng,
    texel: host.texel,
    slot: (id) => host.parent.getObjectByName(`slot:${id}`) ?? null,
    make,
    add(obj, o = {}) {
      host.parent.add(obj);
      if (o.views) tagViews(obj, o.views);
      else tagViews(obj, viewsFor(o.level ?? f, (o.mode === undefined ? 'in' : o.mode) ?? undefined));
      applyVis(obj);
      const us: ((dt: number, t: number) => void)[] = [];
      obj.traverse((c) => {
        const u = c.userData.update as ((dt: number, t: number) => void) | undefined;
        if (u) us.push(u);
      });
      if (us.length) updaters.set(obj, us);
      return obj;
    },
    drop(obj) {
      obj.removeFromParent();
      updaters.delete(obj);
    },
    setLevel,
    untag,
    view,
    onFloor: () => inside && floor === f,
    directorFloor: dirFloor,
    nav: floorNav(f),
    navOf: floorNav,
    playing: host.playing,
    director: () => (host.playing ? host.director() : null),
    walker(obj, opts) {
      const w = createWalker(world, obj, opts);
      walkers.push(w);
      return w;
    },
    dropWalker(w) {
      const i = walkers.indexOf(w);
      if (i >= 0) walkers.splice(i, 1);
    },
    shared,
  });

  const floors: { f: Floor; mod: FloorModule; scoped?: Scoped; jobs?: { step(dt: number): void } | null }[] = [
    { f: 1, mod: createLife1F(envFor(1)) },
    { f: 2, mod: createLife2F(envFor(2)) },
    { f: -1, mod: createLifeB1(envFor(-1)) },
  ];

  // ── 手里拿的 / 放在地上的东西（全局）：按高度归层 ──
  const items: Item[] = [];
  /** 在别的层的地上、暂时拿不到的（where 被这里改成 'away'）：记下当时挂在谁下面、在哪，别人动过就不管了 */
  const parked = new Map<Item, { parent: THREE.Object3D | null; x: number; y: number; z: number }>();
  function syncItems() {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const o = it.obj;
      if (it.where === 'gone') {
        items.splice(i, 1);
        parked.delete(it);
        continue;
      }
      const pk = parked.get(it);
      if (pk) {
        const moved =
          it.where !== 'away' ||
          o.parent !== pk.parent ||
          Math.abs(o.position.x - pk.x) + Math.abs(o.position.y - pk.y) + Math.abs(o.position.z - pk.z) > 1e-6;
        if (moved) parked.delete(it);
        else if (floorAt(houseNavMap, o.position.x, o.position.z, o.position.y) === dirFloor()) {
          parked.delete(it);
          it.where = 'ground';
        } else continue;
      }
      if (it.where === 'held' || it.where === 'loose') {
        // 只去掉标记，不碰 visible（用人物内置道具的东西拿着时 play 把它藏着）
        delete o.userData.houseViews;
        delete o.userData.houseOutside;
      } else if (it.where === 'ground') {
        const f = floorAt(houseNavMap, o.position.x, o.position.z, o.position.y - (it.spec.groundY ?? 0));
        const out = f === 1 && !inFoot1(o.position.x, o.position.z);
        setLevel(o, f, out ? null : 'in');
        // 会所里别的层地上的东西：这一层拿不到（互动按平面距离算）
        if (!out && f !== dirFloor()) {
          it.where = 'away';
          parked.set(it, { parent: o.parent, x: o.position.x, y: o.position.y, z: o.position.z });
        }
      }
    }
  }
  const applyItems = () => {
    for (const it of items) if (it.obj.userData.houseViews) applyVis(it.obj);
  };

  const circles: Circle[] = [];
  const debug: Record<string, unknown> = { walkers, shared, items, view };
  for (const { f, mod } of floors) debug[FLOOR_KEY[f]] = mod.debug ?? {};

  return {
    update(dt, t) {
      for (const us of updaters.values()) for (const u of us) u(dt, t);
      for (const { mod } of floors) mod.update(dt, t);
      for (const w of walkers) w.update(dt);
    },
    attach(play) {
      for (const fl of floors) {
        fl.scoped = floorPlay(play, FLOOR_KEY[fl.f], (it) => items.push(it));
        fl.jobs = fl.mod.attach?.(fl.scoped.play) ?? null;
        fl.scoped.setActive(inside && floor === fl.f);
      }
      // 总监走不穿同一层的 Walker
      play.addBlocker(() => {
        if (!inside) return null;
        let n = 0;
        for (const w of walkers) {
          if (w.floor !== floor || !w.obj.visible) continue;
          const c = circles[n] ?? { x: 0, z: 0, r: 0.3 };
          circles[n++] = c;
          c.x = w.x;
          c.z = w.z;
        }
        circles.length = n;
        return circles;
      });
      return {
        step(dt) {
          for (const fl of floors) fl.jobs?.step(dt);
          syncItems();
        },
      };
    },
    setView(on, f) {
      if (on === inside && f === floor) return;
      inside = on;
      floor = f;
      for (const fl of floors) fl.scoped?.setActive(inside && floor === fl.f);
      syncItems();
      applyItems();
    },
    walkers: () => walkers,
    debug,
  };
}
