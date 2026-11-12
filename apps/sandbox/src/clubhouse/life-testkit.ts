// stage 3 的无画面测试工具（life.test.ts 和三层 agent 自己的测试用）：替身 ctx、摆好全部 SLOTS 的场景、createHouseLife、按 1/60 秒推、
// 量 Walker（在不在导航上、卡没卡住、脚溜不溜）。总监的活：testPlay(house) 建一个无画面的 clubsite/play（没有 HUD、没有相机输入）。
//   const h = testHouse();                 // 看图模式（没有总监）
//   const h = testHouse({ play: true });   // 玩法模式：h.play、h.jobs；h.ride(2) 坐电梯到二层；h.goTo(x, z) 传送
//   h.run(60);                              // 推 60 秒（每步：life.update → play.update → jobs.step → 换层检查）
//   expectWalkersOk(h, probe)               // probe = watchWalkers(h)，run 之前建
import * as THREE from 'three';
import { director as buildDirector, coach, player } from '../clubsite/people';
import { createPlay, type Play } from '../clubsite/play';
import { CLUBHOUSE, GROUNDS } from '../clubsite/world';
import type { AssetBuild, AssetCtx } from './ctx';
import { DOORS, FLOOR_Y, type Floor, FOOT, LIFT } from './layout';
import { floorFor, houseNav } from './nav';
import { PAL } from './palette';
import { gymPerson } from './people';
import { SLOTS } from './slots';
import { createHouseLife, type HouseLife, houseNavMap } from './stage3';
import { viewOf, viewsFor } from './view';
import type { Walker } from './walker';

export const DT = 1 / 60;

/** 替身 ctx：材质都是 MeshBasicMaterial，随机流是真的（mulberry），调色板是真的 */
export function stubCtx(variant = 0, q = ''): AssetCtx {
  const mk = () => new THREE.MeshBasicMaterial();
  return {
    variant,
    params: new URLSearchParams(q),
    pal: PAL,
    mat: mk,
    mats: { prepare() {}, toon: mk },
    rng: stubRng,
    texel: 0.09,
    layers: { FX: 1 },
    uniforms: { uTime: { value: 0 } },
  } as unknown as AssetCtx;
}
export function stubRng(stream: string) {
  let a = 17;
  for (let i = 0; i < stream.length; i++) a = Math.imul(a ^ stream.charCodeAt(i), 0x85ebca6b) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PEOPLE: Record<string, AssetBuild> = {
  player: player as unknown as AssetBuild,
  coach: coach as unknown as AssetBuild,
  director: buildDirector as unknown as AssetBuild,
};
/** 这个场景自己画的资产（要量 userData.setSignal 这类开关时用真的；建不出来 = 空 Group） */
const MODS = import.meta.glob<{ build: AssetBuild }>('./assets/*.ts');

/**
 * 建一个资产：人是真的（clubsite/people）；别的默认是空的 Group（快）。real 里列了名字的用真的资产文件（先 await loadAssets([...])）。
 */
const REAL: Record<string, AssetBuild> = {};
export async function loadAssets(ids: string[]) {
  for (const id of ids) {
    const m = await MODS[`./assets/${id}.ts`]?.();
    if (m) REAL[id] = m.build;
  }
}
export function stubMake(asset: string, variant = 0): THREE.Object3D {
  const b = PEOPLE[asset] ?? REAL[asset];
  if (b) return b(stubCtx(variant));
  const g = new THREE.Group();
  g.userData.stub = asset;
  return g;
}

export interface TestHouse {
  parent: THREE.Scene;
  life: HouseLife;
  /** 玩法模式才有 */
  play: Play | null;
  director: THREE.Object3D | null;
  t: number;
  inside(): boolean;
  floor(): Floor;
  /** 推 sec 秒；each 每步之后调 */
  run(sec: number, each?: (dt: number, t: number) => void): void;
  /** 玩法模式：坐电梯到某一层的电梯门口 */
  ride(f: Floor): void;
  /** 玩法模式：总监传送到这一层的 (x, z) */
  goTo(x: number, z: number): void;
  /** 看图模式：换看法 */
  setView(inside: boolean, floor: Floor): void;
}

/** 摆好全部 SLOTS（名字 slot:<id>、houseViews、姿势）+ createHouseLife；play = 玩法模式（无画面的 clubsite/play） */
export function testHouse(o: { play?: boolean } = {}): TestHouse {
  const parent = new THREE.Scene();
  for (const s of SLOTS) {
    if (o.play && s.id === 'director-in') continue;
    const obj = gymPerson(stubMake(s.asset, s.variant ?? 0), stubCtx(s.variant ?? 0), { loop: true });
    obj.position.set(s.x, s.y ?? FLOOR_Y[s.level ?? 1], s.z);
    obj.rotation.y = s.rotY ?? 0;
    obj.name = `slot:${s.id}`;
    obj.userData.houseViews = s.views ?? viewsFor(s.level ?? 1, s.mode);
    if (s.prop !== undefined) obj.userData.setProp?.(s.prop);
    if (s.pose) obj.userData.pose?.(s.pose[0], s.pose[1]);
    parent.add(obj);
  }
  let inside = false;
  let floor: Floor = 1;
  const director = o.play ? (parent.getObjectByName('slot:director') ?? null) : null;
  if (director) delete director.userData.houseViews;
  let play: Play | null = null;
  // clubsite/play 的相机读窗口的宽高（竖屏 / 横屏）：无画面时给个手机竖屏
  const g = globalThis as { innerWidth?: number; innerHeight?: number };
  g.innerWidth ??= 390;
  g.innerHeight ??= 844;
  let surface = houseNav(1).surface;
  if (director) {
    const n = houseNav(1);
    play = createPlay({
      scene: parent,
      pipe: {
        rig: { target: new THREE.Vector3(), yaw: 0, pitch: Math.PI / 4, metersPerTexel: 0.09 },
        px: 1,
        lowSize: new THREE.Vector2(390, 844),
        camera: new THREE.OrthographicCamera(),
        pickGround: () => null,
      },
      director,
      start: DOORS.main.out,
      yaw: -Math.PI / 2,
      nav: {
        groundAt: () => 0,
        bounds: { x0: GROUNDS.x0, x1: CLUBHOUSE.x1 + 0.5, z0: GROUNDS.z0, z1: -1 },
        walkable: n.walkable,
        blocked: n.blocked,
        surface: (x, z) => surface(x, z),
      },
    });
  }
  const life = createHouseLife({
    parent,
    ctxFor: (v) => stubCtx(v),
    rng: stubRng,
    texel: 0.09,
    make: stubMake,
    playing: !!play,
    director: () => director,
  });
  const jobs = play ? life.attach(play) : null;
  const apply = () => {
    const view = viewOf(inside, floor);
    parent.traverse((c) => {
      const vs = c.userData.houseViews as string[] | undefined;
      if (vs) c.visible = vs.includes(view);
    });
    life.setView(inside, floor);
  };
  const setNav = (f: Floor) => {
    if (!play) return;
    surface = houseNav(f).surface;
    play.nav.setBlocked(houseNav(f).blocked);
  };
  const inFoot = (x: number, z: number) =>
    FOOT[1].some((r) => x > r.x0 + 0.2 && x < r.x1 - 0.2 && z > r.z0 + 0.2 && z < r.z1 - 0.2);
  /** 同 main.ts 的 housePost：脚下高度换层、进出会所 */
  const post = () => {
    if (!director) return;
    const p = director.position;
    const next = floorFor(floor, p.y);
    const inHouse = next !== 1 || inFoot(p.x, p.z);
    if (next !== floor) setNav(next);
    if (next !== floor || inHouse !== inside) {
      floor = next;
      inside = inHouse;
      apply();
    }
  };
  apply();
  const h: TestHouse = {
    parent,
    life,
    play,
    director,
    t: 0,
    inside: () => inside,
    floor: () => floor,
    run(sec, each) {
      const n = Math.round(sec / DT);
      for (let i = 0; i < n; i++) {
        h.t += DT;
        life.update(DT, h.t);
        play?.update(DT, h.t);
        jobs?.step(DT);
        post();
        each?.(DT, h.t);
      }
    },
    ride(f) {
      if (!play) return;
      setNav(f);
      floor = f;
      inside = true;
      play.teleport(LIFT.door[0], LIFT.door[1], Math.PI / 2);
      apply();
    },
    goTo(x, z) {
      play?.teleport(x, z);
      post();
    },
    setView(on, f) {
      inside = on;
      floor = f;
      apply();
    },
  };
  return h;
}

export interface WalkerProbe {
  /** 每步之后调（传给 h.run 的 each） */
  each(): void;
  /** 每个 Walker：不在导航上的步数、离地面最远多少、最长卡了多久、脚溜的比例 */
  report(): { w: Walker; off: number; maxDy: number; maxStuck: number; slip: number; dist: number; where: string }[];
}

/** 量所有 Walker（每步：clearAt 这一层的导航、高度差；卡住的时间；走过的距离 vs phase 推过的周期 × 步幅） */
export function watchWalkers(h: TestHouse): WalkerProbe {
  const rec = new Map<Walker, { off: number; maxDy: number; maxStuck: number; where: string }>();
  return {
    each() {
      for (const w of h.life.walkers()) {
        let r = rec.get(w);
        if (!r) rec.set(w, (r = { off: 0, maxDy: 0, maxStuck: 0, where: '' }));
        r.maxStuck = Math.max(r.maxStuck, w.stuck);
        if (w.riding) continue;
        const y = houseNavMap(w.floor).clearAt(w.x, w.z);
        if (y === null) {
          if (!r.off) r.where = `${w.floor}F (${w.x.toFixed(2)}, ${w.z.toFixed(2)}, y ${w.y.toFixed(2)})`;
          r.off++;
        } else if (Math.abs(y - w.y) > r.maxDy) {
          r.maxDy = Math.abs(y - w.y);
          if (r.maxDy > 0.3)
            r.where = `${w.floor}F (${w.x.toFixed(2)}, ${w.z.toFixed(2)}, y ${w.y.toFixed(2)} vs ${y})`;
        }
      }
    },
    report: () =>
      [...rec].map(([w, r]) => ({
        w,
        ...r,
        dist: w.dist,
        // 步幅在走的过程中可能换（walkTo 的 stride）：按现在的步幅估，楼层模块中途换步幅的 Walker 自己量
        slip: w.dist > 0 ? Math.abs(w.dist - w.cycles * strideNow(w)) / w.dist : 0,
      })),
  };
}
const strideNow = (w: Walker) =>
  ((w.obj.userData.stride as number | undefined) ?? 4 * 0.44 * Math.sin(0.55)) *
  ((w.obj.userData.strideK as number | undefined) ?? 1);
