// 观察模式的"跟着事件走"的画面（第一轮评审「要补的画面」、第二轮问题 1 / 3 / 5 / 11）：mount.ts 摆好每个人的身子和姿势以后，这里每帧再补一层。
//   food.ts    摊主做饭 / 摇饮料、点完单递出窗口（客人伸手接）、端着托盘 / 杯子走到桌边、桌上的托盘和吃饭的那一口
//   ball.ts    球：对打（网球、匹克球、表演赛）、教练喂球（青训课、私教课）、对着墙打；挥拍的姿势和球出自同一张时间表
//   cars.ts    车来车去：按引擎的车位停、代客 / 送人的车在落客点停一下就走、走的时候开回来接；车让车（跟车、倒车先看）
//   stalls.ts  关着的摊：拉下卷帘、收篷、收存货、窗口前拉一道红绳；摊主一到岗就打开
//   pool.ts    游泳的人在泳道里来回游
//   watch.ts   看球的人转头看着有人在打的那块场（Place.faces）
//   mood.ts    等烦了（排队、拍架边、场边等人凑场：站着跺脚看表 / 坐着抖腿看表）、放弃的那一下回头看一眼再走
// prewarm()：观察一打开，先把要用的道具、车、姿势建好画一遍（见 util.ts 的 SimFx.prewarm）。
// 规矩：只读引擎的状态（agents、occupants、queues、log），不改；随机一律按人的 id 哈希；道具用各场景的素材（clubfood 的托盘、
// clubpark 的车、clubsite 的球），材质跟着场景的调色和天光（各场景的 kit，同一套 uniforms）。
import type * as THREE from 'three';
import { createFoodKit } from '../../../clubfood/scene';
import { createParkKit } from '../../../clubpark/scene';
import { NEW_POSES } from '../../../clubsite/people';
import type { PeopleCtx } from '../../../clubsite/people/props';
import type { SharedUniforms } from '../../../clubsite/render/ctx';
import { createBalls } from './ball';
import { createCars } from './cars';
import { createFood } from './food';
import { createMood } from './mood';
import { createPool } from './pool';
import { createStalls } from './stalls';
import type { FxFrame, FxHost, FxKits, FxPart, SimFx } from './util';
import { createWatch } from './watch';

export type { FxFrame, SimFx } from './util';

/** 预热每帧最多花多少毫秒、要画几帧 */
const WARM_MS = 4;
const SHOW_FRAMES = 2;
/**
 * 替身：[身子, 姿势, phase, 道具, 座高]（覆盖各种道具、新姿势、新姿势自己带的小东西：左手的杯子、伞）。
 * mount 打开观察时先建好一批身子、每具新身子摆一遍 sit / eat / cook（锅铲、一口吃的在那里建）：这里不再重复那几个
 */
const STAND_INS: [kind: 'adult' | 'kid' | 'teen', pose: string, phase: number, prop: string | null, seat?: number][] = [
  ['adult', 'eat', 0.85, null, 0.52],
  ['adult', 'shake', 0.3, null],
  ['adult', 'carry', 0.2, null],
  ['adult', 'lie', 0.2, null, 0.4],
  ['adult', 'recline', 0.2, null, 0.44],
  ['adult', 'swim', 0.3, null],
  ['adult', 'tapSit', 0.7, null, 0.52],
  ['adult', 'drinkTap', 0.3, null],
  ['adult', 'sip', 0.5, 'cup', 0.52],
  ['adult', 'dink', 0.5, 'paddle'],
  ['adult', 'forehand', 0.5, 'racket'],
  ['adult', 'feed', 0.4, 'racket'],
  ['adult', 'sweep', 0.3, 'broom'],
  ['adult', 'blow', 0.3, 'blower'],
  ['adult', 'push', 0.3, 'picker'],
  ['adult', 'skim', 0.3, 'skim'],
  ['adult', 'water', 0.3, 'hose'],
  ['adult', 'squeegee', 0.3, 'squeegee'],
  ['adult', 'crank', 0.3, 'crank'],
  ['kid', 'forehand', 0.5, 'racket'],
  ['teen', 'bkUmbrella', 0.3, null],
  ['teen', 'bkRoll', 0.3, null],
];

export function createSimFx(host: FxHost): SimFx {
  let kits: FxKits | null = null;
  const food = createFood(host.scene);
  const cars = createCars(host.scene);
  const stalls = createStalls(host.scene);
  const ball = createBalls(host.scene);
  const parts: Record<string, FxPart> = {
    food,
    ball,
    cars,
    stalls,
    pool: createPool(),
    watch: createWatch(),
    mood: createMood(),
  };
  const perf = { ms: 0, frames: 0, max: 0 };
  /** 每一部分平均每帧多少毫秒（最近 120 帧） */
  const partMs: Record<string, number> = {};
  /** 每一部分最慢的一帧（找卡顿）；预热最慢的一步 */
  const partMax: Record<string, number> = {};
  /** 预热：分步做的活（生成器）、做完以后要画两帧的东西、替身 */
  const warm = {
    want: false,
    gen: null as Generator<void, void, void> | null,
    show: [] as THREE.Object3D[],
    dummies: [] as THREE.Object3D[],
    showLeft: 0,
    ms: 0,
    frames: 0,
    done: false,
  };

  /** 材质上下文从第一具身子上拿（clubsite/people 的 userData.peopleCtx = 总监那套 clubpark 的 ctx） */
  function kitsFrom(f: FxFrame): FxKits | null {
    if (kits) return kits;
    for (const a of f.actors.values()) {
      const ctx = a.body?.obj.userData.peopleCtx as
        | (PeopleCtx & { uniforms: SharedUniforms; texel: number })
        | undefined;
      if (!ctx) continue;
      const h = {
        uniforms: ctx.uniforms,
        params: ctx.params,
        texelMeters: () => host.pipe.rig.metersPerTexel,
        designTexel: ctx.texel,
      };
      kits = { people: ctx, food: createFoodKit(h), park: createParkKit(h) };
      return kits;
    }
    return null;
  }

  /**
   * 建好的一样东西：有 host.prewarm（pipe.prewarm：颜色、法线、投影三套着色器当场编好）就马上编（编的时候临时显示，编完放回去）；
   * 没有就攒起来，最后摆到镜头底下的地面以下画两帧
   */
  function add(o: THREE.Object3D) {
    if (!host.prewarm) {
      warm.show.push(o);
      return;
    }
    const v = o.visible;
    o.visible = true;
    o.updateMatrixWorld(true);
    void host.prewarm(o);
    o.visible = v;
  }
  function* warmSteps(k: FxKits): Generator<void, void, void> {
    // 托盘四种 × 8、杯子 × 8（一次建一个：一个托盘 ~2 毫秒）
    for (let i = 0; i < 8; i++)
      for (const kind of [0, 1, 2, 3, 'cup'] as const) {
        add(food.prewarm(k, kind));
        yield;
      }
    for (let i = 0; i < 14; i++) {
      add(cars.prewarm(k, i));
      yield;
    }
    for (const o of stalls.prewarm(k)) add(o);
    yield;
    for (const o of ball.prewarm(k)) add(o);
    yield;
    // 替身：每个摆一个姿势、拿一样东西（新姿势第一次跑、小道具第一次建在这里）
    const make = host.make;
    if (make) {
      let first: THREE.Object3D | null = null;
      for (const [kind, pose, ph, prop, seat] of STAND_INS) {
        const o = make(kind);
        o.name = 'sim:fx:warm';
        const ud = o.userData;
        if (seat !== undefined) ud.setSeat?.(seat);
        ud.setProp?.(prop);
        ud.pose?.(pose, ph);
        host.scene.add(o);
        warm.dummies.push(o);
        add(o);
        first ??= o;
        yield;
      }
      // 每个新姿势都在一个替身上跑一遍（第一次摆姿势的那点 JIT / 小网格）
      if (first) {
        for (const n of NEW_POSES) first.userData.pose?.(n, 0.5);
        first.userData.pose?.('drinkTap', 0.3);
      }
    }
  }

  function warmFrame(f: FxFrame) {
    if (warm.done || !warm.want) return;
    const k = kitsFrom(f);
    if (!k) return;
    const t0 = performance.now();
    warm.frames++;
    if (!warm.gen && !warm.showLeft) warm.gen = warmSteps(k);
    if (warm.gen) {
      while (performance.now() - t0 < WARM_MS) {
        if (warm.gen.next().done) {
          warm.gen = null;
          if (host.prewarm) {
            // 都当场编好了：替身收起来就完
            for (const o of warm.dummies) o.removeFromParent();
            warm.dummies = [];
            warm.done = true;
          } else warm.showLeft = SHOW_FRAMES + 1;
          break;
        }
      }
    }
    if (warm.showLeft > 0) {
      warm.showLeft--;
      const tg = host.pipe.rig.target;
      if (warm.showLeft > 0) {
        // 摆到镜头看的地方的地面以下（深度测试挡住、在视锥里 → 照样走一遍着色器编译和上传），排成一片
        warm.show.forEach((o, i) => {
          o.userData.__warmAt ??= o.position.clone();
          o.position.set(tg.x + ((i % 8) - 4) * 1.2, tg.y - 9, tg.z + (Math.floor(i / 8) - 3) * 1.2);
          o.visible = true;
          o.updateMatrixWorld(true);
        });
      } else {
        for (const o of warm.show) {
          // 放回原处（球的 InstancedMesh 按世界坐标摆实例：根节点得在原点）
          const p0 = o.userData.__warmAt as THREE.Vector3 | undefined;
          if (p0) o.position.copy(p0);
          delete o.userData.__warmAt;
          o.visible = false;
          o.updateMatrixWorld(true);
        }
        for (const o of warm.dummies) o.removeFromParent();
        warm.show = [];
        warm.dummies = [];
        warm.done = true;
      }
    }
    warm.ms += performance.now() - t0;
  }

  return {
    frame(f) {
      const t0 = performance.now();
      warmFrame(f);
      partMax.warm = Math.max(partMax.warm ?? 0, performance.now() - t0);
      const tk = performance.now();
      const k = kitsFrom(f);
      partMax.kits = Math.max(partMax.kits ?? 0, performance.now() - tk);
      if (!k) return;
      for (const [n, p] of Object.entries(parts)) {
        const t = performance.now();
        p.frame(f, k);
        const ms = performance.now() - t;
        partMs[n] = (partMs[n] ?? 0) * 0.98 + ms * 0.02;
        partMax[n] = Math.max(partMax[n] ?? 0, ms);
      }
      const ms = performance.now() - t0;
      perf.ms += ms;
      perf.frames++;
      perf.max = Math.max(perf.max, ms);
    },
    off() {
      for (const p of Object.values(parts)) p.off();
    },
    prewarm() {
      warm.want = true;
    },
    stats() {
      const out: Record<string, unknown> = {
        avgMs: perf.frames ? +(perf.ms / perf.frames).toFixed(3) : 0,
        maxMs: +perf.max.toFixed(2),
        partMs: Object.fromEntries(Object.entries(partMs).map(([n, v]) => [n, +v.toFixed(3)])),
        partMax: Object.fromEntries(Object.entries(partMax).map(([n, v]) => [n, +v.toFixed(1)])),
        warm: { done: warm.done, frames: warm.frames, ms: +warm.ms.toFixed(1) },
      };
      for (const [n, p] of Object.entries(parts)) if (p.stats) out[n] = p.stats();
      return out;
    },
  };
}
