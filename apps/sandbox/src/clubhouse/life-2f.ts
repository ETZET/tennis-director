// 二层（会员层 + 后厨）的演出 + 总监的活（stage 3）。接口见 stage3.ts（FloorEnv / FloorModule）和 walker.ts；
// 规矩见 docs/lab/2026-11-07-3d-pixel/clubhouse.md「stage 3 的框架」。
//
// ── 演出 ──
//   酒保（slot 2f-bartender）：吧台后面来回 —— 后吧拿瓶子 → 吧台东头倒酒 → 回原位。
//   厨师（slot 2f-cook）：备餐台 ↔ 灶台。
//   服务员（新加的一个人）：后厨 → 宴会厅摆台 → 酒吧后面送一杯 → 回后厨（ROUTES 'service'）。
//   来访的会员（新加的一个人）：正门 → 楼梯上二层 → 吧台前要一杯 → 壁炉烧着就去壁炉前站一会儿，不然去露台 → 原路下楼出门（ROUTES 'memberUp'）。
//   坐着 / 站着的六个会员（slot 2f-lounge-a/b、2f-bar-sit、2f-bar-stand、2f-terrace-a/b）照旧循环；钟响、壁炉点着时鼓掌（react）。
//
// ── 总监的活（信号 → 动手 → 信号消失 + 回报 → 冷却后再出）──
//   id        信号（画面）                         怎么干                                   回报
//   cups      茶几上的空杯（slot 2f-cups）          拿起（收杯子）→ 端到吧台东头放下          酒保道谢
//   fire      壁炉凉了（fireplace v1 换掉 v0）      从 B1 储藏扛 firewood… 来，壁炉前"添柴"   火烧起来，休息室的会员鼓掌；来访的会员改去壁炉前
//   umbrella  露台第三把伞收着                      按住 2.5 秒撑开                          旁边的会员说话
//   money     办公桌上的钱袋（slot 2f-money）       拿起 → 走到保险柜放进去                   提示
//   chairs    宴会厅叠着的椅子（slot 2f-chairs）    按住 3 秒摆开                            椅子堆消失
//   pans      备餐台上的脏锅（slot 2f-pans）        按住 3 秒刷                              厨师道谢
//   backbar   后吧空了一格（up-back-bar v1 换 v0）  从 1F 货梯厅 / B1 扛 stock-box… 来"补酒"  酒保说话
//   另外：钟绳按住 2 秒拉钟（随时能拉；会员抬头鼓掌）；后厨备餐台西头的冰桶 = ice-bucket… 的来源（空手随时能拿，B1 冰浴收）。
//   没做：拖把车推回清洁间（h）、椅子摆到桌边的样子（只是椅子堆消失）。
//   看图模式（没有总监）：信号照 stage 2 摆好的样子不动（杯子、钱袋、椅子、脏锅、收着的伞都在；壁炉烧着、后吧满的）。
//   玩法模式：开局只有空杯和收着的伞，别的按种子随机错开着出；没人管的信号就一直在（准则 5）。
//   调试：debug.jobs() → [{ id, state, wait }]；debug.force(id) 马上出信号；debug.stands[id] 干这个活站哪。
import * as THREE from 'three';
import type { Play } from '../clubsite/play';
import { FLOOR_Y } from './layout';
import { type P3, ROUTES, SPOTS } from './routes';
import { SLOTS_2F } from './slots-2f';
import type { FloorEnv, FloorModule } from './stage3';
import type { HouseView } from './view';
import type { Walker } from './walker';

const F = FLOOR_Y[2];
const RING_HOLD = 2;
const at2 = (x: number, z: number): P3 => [x, z, F];

export type JobId = 'cups' | 'fire' | 'umbrella' | 'money' | 'chairs' | 'pans' | 'backbar';
/** idle = 没事（wait 秒后出信号）；signal = 信号在场景里；carry = 东西在总监手里 / 被放在半路 */
export type JobState = 'idle' | 'signal' | 'carry';
interface Job {
  id: JobId;
  state: JobState;
  wait: number;
  /** 干完以后隔多久再出（秒，[最少, 最多]） */
  cool: [number, number];
  /** 信号的样子开 / 关 */
  show(on: boolean): void;
}

/** 干每个活时总监站哪（都在二层的导航上：life-2f.test.ts 守着） */
export const STANDS_2F = {
  cups: [-58.0, -25.3],
  bar: [-47.8, -26.5],
  fire: [SPOTS.fireplace.at[0], SPOTS.fireplace.at[1]],
  umbrella: [-50.4, -12.8],
  money: [-57.5, -35.6],
  safe: [-61.0, -38.2],
  chairs: [-52.5, -32.9],
  pans: [-41.9, -34.5],
  ice: [-43.1, -34.5],
  backbar: [-48.6, -28.7],
  bell: [SPOTS.bellRope.at[0], SPOTS.bellRope.at[1]],
} as const satisfies Record<string, readonly [number, number]>;

/** 冰桶（后厨的来源 + 拿在手里的）：蓝桶 + 一堆冰。提手在桶口上面（握点） */
function buildIceBucket(env: FloorEnv): THREE.Object3D {
  const ctx = env.ctxFor(0);
  const g = new THREE.Group();
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, edge: 0.5 };
  const tub = new THREE.CylinderGeometry(0.17, 0.13, 0.26, 6).translate(0, 0.13, 0);
  g.add(new THREE.Mesh(tub, ctx.mat('clothBlue', { ...face, ramp: [0x4a8ae8, 0x3a62c0, 0x2c3680] })));
  const ice = new THREE.CylinderGeometry(0.1, 0.16, 0.08, 6).translate(0, 0.3, 0);
  g.add(new THREE.Mesh(ice, ctx.mat('clothWhite', { ...face, ramp: [0xf0f6ff, 0xb8d0f0, 0x7890c8] })));
  ctx.mats.prepare(g, { cast: false, receive: false });
  return g;
}

export function createFloorLife(env: FloorEnv): FloorModule {
  const rnd = env.rng('2f-life');
  const jrnd = env.rng('2f-jobs');
  const between = (r: () => number, a: number, b: number) => a + r() * (b - a);

  // ── 显示 / 藏起一件摆好的东西：藏 = houseViews 清空（换看法时 applyView 不会把它放出来）──
  const show = (o: THREE.Object3D | null, on: boolean) => {
    if (!o) return;
    const ud = o.userData;
    if (ud.viewsOn === undefined) ud.viewsOn = ud.houseViews ?? null;
    const vs = ud.viewsOn as HouseView[] | null;
    if (vs) ud.houseViews = on ? vs : [];
    o.visible = on && (vs ? vs.includes(env.view()) : true);
  };
  /** 在一个 slot 的位置上建它的另一个样子（先藏着） */
  const twin = (slot: THREE.Object3D | null, asset: string, variant: number, mode: 'in' | null) => {
    if (!slot) return null;
    const o = env.make(asset, variant);
    o.position.copy(slot.position);
    o.rotation.copy(slot.rotation);
    o.scale.copy(slot.scale);
    env.add(o, { mode });
    show(o, false);
    return o;
  };

  const cups = env.slot('2f-cups');
  const money = env.slot('2f-money');
  const chairs = env.slot('2f-chairs');
  const pans = env.slot('2f-pans');
  const fireLit = env.slot('2f-fireplace');
  const fireCold = twin(fireLit, 'fireplace', 1, 'in');
  const barFull = env.slot('2f-back-bar');
  const barEmpty = twin(barFull, 'up-back-bar', 1, 'in');
  const brollyShut = env.slot('2f-umbrella-closed');
  const brollyOpen = twin(brollyShut, 'up-umbrella', 0, null);
  const swap = (sig: THREE.Object3D | null, ok: THREE.Object3D | null) => (on: boolean) => {
    show(sig, on);
    show(ok, !on);
  };

  // ── 活（状态机）──
  const P = env.playing;
  const job = (id: JobId, start: 'signal' | number, cool: [number, number], showFn: (on: boolean) => void): Job => {
    const j: Job = { id, state: 'idle', wait: Number.POSITIVE_INFINITY, cool, show: showFn };
    if (start === 'signal') j.state = 'signal';
    else if (P) j.wait = start;
    showFn(j.state === 'signal');
    return j;
  };
  // 看图模式：摆好的样子；玩法模式：开局只有空杯和收着的伞，别的错开着出
  const J: Record<JobId, Job> = {
    cups: job('cups', 'signal', [90, 150], (on) => show(cups, on)),
    umbrella: job('umbrella', 'signal', [150, 240], swap(brollyShut, brollyOpen)),
    money: job('money', P ? between(jrnd, 40, 70) : 'signal', [120, 200], (on) => show(money, on)),
    pans: job('pans', P ? between(jrnd, 75, 110) : 'signal', [100, 160], (on) => show(pans, on)),
    fire: job('fire', between(jrnd, 110, 160), [200, 300], swap(fireCold, fireLit)),
    chairs: job('chairs', P ? between(jrnd, 150, 200) : 'signal', [240, 360], (on) => show(chairs, on)),
    backbar: job('backbar', between(jrnd, 200, 270), [240, 360], swap(barEmpty, barFull)),
  };
  const jobs = Object.values(J);
  const raise = (j: Job) => {
    if (j.state !== 'idle') return false;
    j.state = 'signal';
    j.wait = 0;
    j.show(true);
    return true;
  };
  const clear = (j: Job) => {
    j.state = 'idle';
    j.wait = P ? between(jrnd, j.cool[0], j.cool[1]) : Number.POSITIVE_INFINITY;
    j.show(false);
  };

  // ── 坐着 / 站着的会员：反应（鼓掌、抬头），完了回到摆好的姿势 ──
  interface Sitter {
    obj: THREE.Object3D;
    pose: [string, number];
    t: number;
  }
  const sitters = new Map<string, Sitter>();
  for (const id of ['2f-lounge-a', '2f-lounge-b', '2f-bar-sit', '2f-bar-stand', '2f-terrace-a', '2f-terrace-b']) {
    const obj = env.slot(id);
    const pose = SLOTS_2F.find((s) => s.id === id)?.pose;
    if (obj && pose) sitters.set(id, { obj, pose, t: 0 });
  }
  const lookV = new THREE.Vector3();
  const react = (ids: readonly string[], pose: string, sec: number, look?: readonly [number, number, number]) => {
    for (const id of ids) {
      const s = sitters.get(id);
      if (!s) continue;
      s.t = sec + rnd() * 0.6;
      s.obj.userData.pose?.(pose);
      if (look) s.obj.userData.lookAt?.(lookV.set(look[0], look[1], look[2]).clone());
    }
  };
  const LOUNGE = ['2f-lounge-a', '2f-lounge-b'];
  const BELL_TOP: [number, number, number] = [-48.0, F + 5, -17.6];

  // ── 走动的人 ──
  const walkers: Record<string, Walker> = {};
  const bartenderObj = env.slot('2f-bartender');
  if (bartenderObj) {
    const home = at2(bartenderObj.position.x, bartenderObj.position.z);
    const w = (walkers.bartender = env.walker(bartenderObj, { speed: 0.9 }));
    w.run(function* (w) {
      while (true) {
        yield* w.face(home[0], home[1] + 2);
        yield* w.wait(between(rnd, 3, 6));
        // 后吧拿瓶子
        yield* w.goTo(at2(-49.9, -28.75));
        yield* w.face(-49.9, -30);
        yield* w.act('pickup', 0.7);
        yield* w.wait(0.6);
        // 吧台东头倒一杯
        yield* w.goTo(at2(-48.9, -28.45));
        yield* w.face(-48.9, -27);
        yield* w.act('pour', 1.4);
        yield* w.wait(between(rnd, 2, 4));
        yield* w.goTo(home);
      }
    });
  }
  const cookObj = env.slot('2f-cook');
  if (cookObj) {
    const home = at2(cookObj.position.x, cookObj.position.z);
    const w = (walkers.cook = env.walker(cookObj, { speed: 1.0 }));
    w.run(function* (w) {
      while (true) {
        // 备餐台：切、摆
        yield* w.face(home[0], home[1] + 2);
        for (let i = 0; i < 3; i++) {
          yield* w.act('pickup', 0.7);
          yield* w.wait(between(rnd, 0.5, 1.5));
        }
        // 灶台：颠两下锅
        yield* w.goTo(at2(-42.3, -37.9));
        yield* w.face(-42.3, -40);
        yield* w.act('pour', 3.6, { loop: true });
        yield* w.wait(between(rnd, 1, 2));
        yield* w.goTo(home);
      }
    });
  }
  const service = ROUTES.find((r) => r.id === 'service')?.pts;
  if (service && service.length >= 9) {
    const obj = env.add(env.make('coach', 0));
    obj.userData.setProp?.(null);
    const w = (walkers.waiter = env.walker(obj, { speed: 1.15 }));
    const barBack = at2(-48.1, -28.6);
    w.place(service[1], Math.PI);
    w.run(function* (w) {
      yield* w.wait(between(rnd, 2, 8));
      while (true) {
        // 出菜架上端一杯
        yield* w.face(service[1][0], service[1][1] + 3);
        yield* w.act('pickup', 0.6);
        obj.userData.setProp?.('cup');
        // 宴会厅：摆台
        yield* w.go(service.slice(1, 6));
        yield* w.face(-50.0, -35);
        yield* w.act('pickup', 0.8);
        yield* w.wait(between(rnd, 1.5, 3));
        // 酒吧后面：把杯子交给酒保
        yield* w.go(service.slice(5, 9));
        yield* w.goTo(barBack);
        yield* w.face(barBack[0] - 2, barBack[1]);
        yield* w.act('pickup', 0.6);
        obj.userData.setProp?.(null);
        yield* w.wait(between(rnd, 2, 4));
        // 回后厨
        yield* w.goTo(service[8]);
        yield* w.go([service[7], service[2], service[1]]);
        yield* w.wait(between(rnd, 8, 16));
      }
    });
  }
  const up = ROUTES.find((r) => r.id === 'memberUp')?.pts;
  if (up && up.length >= 17) {
    const obj = env.add(env.make('player', 1), { level: 1, mode: null });
    obj.userData.setProp?.(null);
    const w = (walkers.member = env.walker(obj));
    w.place(up[0], -Math.PI / 2);
    const back = up.slice(0, 12).reverse();
    w.run(function* (w) {
      yield* w.wait(between(rnd, 4, 10));
      while (true) {
        // 上楼，吧台前要一杯
        yield* w.go(up.slice(0, 13));
        yield* w.face(up[12][0] - 0.4, up[12][1] - 2);
        yield* w.wait(between(rnd, 3, 5));
        obj.userData.setProp?.('cup');
        yield* w.go([up[13]]);
        if (J.fire.state === 'idle' && rnd() < 0.7) {
          // 壁炉烧着：去壁炉前站一会儿
          yield* w.goTo('lounge');
          yield* w.face(SPOTS.fireplace.at[0], SPOTS.fireplace.at[1] - 2);
          yield* w.act('sip', between(rnd, 12, 20), { loop: true });
          yield* w.goTo(up[13]);
        } else {
          yield* w.go(up.slice(14));
          yield* w.face(up[16][0], up[16][1] + 3);
          yield* w.act('sip', between(rnd, 12, 20), { loop: true });
          yield* w.go([up[15], up[14], up[13]]);
        }
        // 杯子还到吧台，下楼出门
        yield* w.go([up[12]]);
        yield* w.face(up[12][0] - 0.4, up[12][1] - 2);
        yield* w.act('pickup', 0.6);
        obj.userData.setProp?.(null);
        yield* w.go([up[13]]);
        yield* w.go(back);
        yield* w.wait(between(rnd, 10, 20));
      }
    });
  }

  const state = { rings: 0, held: 0 };
  const rope = env.slot('2f-bell-rope');

  return {
    update(dt) {
      for (const j of jobs) {
        if (j.state !== 'idle' || !Number.isFinite(j.wait)) continue;
        j.wait -= dt;
        if (j.wait <= 0) raise(j);
      }
      for (const s of sitters.values()) {
        if (s.t <= 0) continue;
        s.t -= dt;
        if (s.t <= 0) {
          s.obj.userData.pose?.(s.pose[0], s.pose[1]);
          s.obj.userData.lookAt?.(null);
        }
      }
    },

    attach(play) {
      const v = (x: number, y: number, z: number) => new THREE.Vector3(x, F + y, z);
      const stand = (k: keyof typeof STANDS_2F) => () => STANDS_2F[k];
      let serial = 0;
      const person = (id: string) => sitters.get(id)?.obj ?? null;

      /** 按住干的活：按住 dur 秒 → done */
      const holdJob = (
        j: Job,
        o: { at: THREE.Vector3; stand: keyof typeof STANDS_2F; label: string; pose: string; dur: number },
        done: () => void,
      ) => {
        let acc = 0;
        play.add({
          id: j.id,
          at: () => o.at,
          radius: 1.5,
          stand: stand(o.stand),
          label: () => (j.state === 'signal' ? o.label : ''),
          canUse: () => j.state === 'signal',
          pose: o.pose,
          onHold(dt) {
            acc += dt;
            if (acc < o.dur) return;
            acc = 0;
            clear(j);
            done();
            return false;
          },
          onRelease() {
            acc = 0;
          },
        });
      };
      /** 拿起来送到别处的活：信号处拿起（slot 藏起来，手里多一件）→ 收的地方放下 */
      const carryJob = (
        j: Job,
        o: {
          from: THREE.Vector3;
          stand: keyof typeof STANDS_2F;
          pickLabel: string;
          item: () => Parameters<Play['addItem']>[0];
          to: THREE.Vector3;
          toStand: keyof typeof STANDS_2F;
          toId: string;
          putLabel: string;
        },
        done: () => void,
      ) => {
        play.add({
          id: j.id,
          at: () => o.from,
          radius: 1.5,
          stand: stand(o.stand),
          pickLabel: () => (j.state === 'signal' ? o.pickLabel : ''),
          canPickUp: () => j.state === 'signal',
          onPickUp(p) {
            if (j.state !== 'signal') return;
            j.show(false);
            j.state = 'carry';
            p.give(play.addItem(o.item()));
          },
        });
        play.add({
          id: o.toId,
          at: () => o.to,
          radius: 1.5,
          stand: stand(o.toStand),
          accepts: (it) => it.id.startsWith(`${j.id}-2f`),
          putLabel: o.putLabel,
          onPutDown(it) {
            it.remove();
            clear(j);
            done();
          },
        });
      };
      /** 收别的层扛来的东西：信号在时才收 */
      const sinkJob = (
        j: Job,
        o: { at: THREE.Vector3; stand: keyof typeof STANDS_2F; prefix: string; putLabel: string },
        done: () => void,
      ) => {
        play.add({
          id: j.id,
          at: () => o.at,
          radius: 1.5,
          stand: stand(o.stand),
          accepts: (it) => j.state === 'signal' && it.id.startsWith(o.prefix),
          putLabel: o.putLabel,
          onPutDown(it) {
            it.remove();
            clear(j);
            done();
          },
        });
      };

      // (a) 空杯 → 吧台
      carryJob(
        J.cups,
        {
          from: v(-57.75, 0.5, -26.3),
          stand: 'cups',
          pickLabel: '收杯子',
          item: () => ({
            id: `cups-2f-${serial++}`,
            name: '空杯',
            obj: env.make('up-empty-cups'),
            prop: 'cup',
            groundY: 0.02,
            radius: 0.9,
          }),
          to: v(-48.3, 1.1, -27.6),
          toStand: 'bar',
          toId: 'bar',
          putLabel: '放吧台',
        },
        () => {
          play.toast('空杯收了 ✓');
          if (walkers.bartender) play.say(walkers.bartender.obj, '谢了');
        },
      );
      // (b) 壁炉凉了 → B1 的柴
      sinkJob(J.fire, { at: v(-58.0, 0.6, -29.3), stand: 'fire', prefix: 'firewood', putLabel: '添柴' }, () => {
        play.toast('壁炉烧起来了 ✓');
        react(LOUNGE, 'clap', 2.4);
        const a = person('2f-lounge-a');
        if (a) play.say(a, '暖和了');
      });
      // (c) 第三把伞 → 撑开
      holdJob(
        J.umbrella,
        { at: v(-51.8, 1.5, -12.8), stand: 'umbrella', label: '撑伞', pose: 'crank', dur: 2.5 },
        () => {
          play.toast('伞撑开了 ✓');
          const b = person('2f-terrace-b');
          if (b) play.say(b, '凉快多了');
        },
      );
      // (d) 钱袋 → 保险柜
      carryJob(
        J.money,
        {
          from: v(-57.45, 0.9, -36.45),
          stand: 'money',
          pickLabel: '拿钱袋',
          item: () => ({
            id: `money-2f-${serial++}`,
            name: '钱袋',
            obj: env.make('up-money-bags'),
            grip: { at: [0, 0.3, 0] },
            carrySpeed: 2.6,
            radius: 0.9,
          }),
          to: v(-61.05, 0.6, -39.1),
          toStand: 'safe',
          toId: 'safe',
          putLabel: '锁进保险柜',
        },
        () => play.toast('钱袋锁好了 ✓'),
      );
      // (e) 叠着的椅子 → 摆开
      holdJob(J.chairs, { at: v(-52.6, 0.8, -31.9), stand: 'chairs', label: '摆椅子', pose: 'dump', dur: 3 }, () =>
        play.toast('宴会厅布置好了 ✓'),
      );
      // (f) 脏锅 → 刷
      holdJob(J.pans, { at: v(-41.9, 1.0, -35.6), stand: 'pans', label: '刷锅', pose: 'pour', dur: 3 }, () => {
        play.toast('锅刷干净了 ✓');
        if (walkers.cook) play.say(walkers.cook.obj, '谢谢总监');
      });
      // 后吧空了一格 → 1F / B1 的箱子
      sinkJob(J.backbar, { at: v(-49.2, 1.6, -29.5), stand: 'backbar', prefix: 'stock-box', putLabel: '补酒' }, () => {
        play.toast('后吧补满了 ✓');
        if (walkers.bartender) play.say(walkers.bartender.obj, '酒齐了');
      });

      // 冰桶的来源（后厨备餐台西头）：空手随时能拿；不想要了放回来
      const bucket = env.add(buildIceBucket(env));
      bucket.position.set(-43.1, F + 0.9, -35.6);
      const iceAt = v(-43.1, 1.0, -35.6);
      play.add({
        id: 'ice',
        at: () => iceAt,
        radius: 1.4,
        stand: stand('ice'),
        pickLabel: '拿冰桶',
        onPickUp(p) {
          p.give(
            play.addItem({
              id: `ice-bucket-2f-${serial++}`,
              name: '冰桶',
              obj: buildIceBucket(env),
              grip: { at: [0, 0.36, 0] },
              carrySpeed: 2.6,
              radius: 0.9,
            }),
          );
        },
        accepts: (it) => it.id.startsWith('ice-bucket'),
        putLabel: '放回冰桶',
        onPutDown: (it) => it.remove(),
      });

      // (g) 钟绳：按住 2 秒 → 会员抬头鼓掌
      const bellAt = new THREE.Vector3(rope?.position.x ?? -48.6, F + 1.1, rope?.position.z ?? -16.6);
      play.add({
        id: 'bell',
        at: () => bellAt,
        radius: 1.1,
        stand: stand('bell'),
        label: '拉钟',
        pose: 'crank',
        onHold(dt, p) {
          state.held += dt;
          if (state.held < RING_HOLD) return;
          state.held = 0;
          state.rings++;
          p.toast('当——当——');
          react([...sitters.keys()], 'clap', 2.6, BELL_TOP);
          return false;
        },
        onRelease() {
          state.held = 0;
        },
      });

      // 顶栏：二层还有几件事；壁炉凉着时休息室的人嘀咕
      let shown = -1;
      let cold = false;
      return {
        step() {
          let n = 0;
          for (const j of jobs) if (j.state !== 'idle') n++;
          if (n !== shown) {
            shown = n;
            play.stat('todo', '二层的活', n ? `${n} 件` : null);
          }
          const c = J.fire.state === 'signal';
          if (c !== cold) {
            cold = c;
            play.bubble('cold', c ? person('2f-lounge-b') : null, '有点冷…');
          }
        },
      };
    },

    debug: {
      state,
      jobs: () => jobs.map((j) => ({ id: j.id, state: j.state, wait: j.wait })),
      /** 马上出信号（已经在 / 东西在手里 = false） */
      force: (id: JobId) => (J[id] ? raise(J[id]) : false),
      stands: STANDS_2F,
      walkers,
      sitters,
    },
  };
}
