// clubfood 的玩法接线：导航（navspec.ts，塔可车能走进去）+ 总监的活（互动点、手里的东西）。
// 活本身（垃圾桶满、脏托盘、存货、高峰的队伍）在 life.ts；这里只管"什么时候能干、按哪个键、站哪"。
//
//   倒垃圾   回收站（凉棚西南角外）：桶满了按"换垃圾袋" → 拎着袋子走到会所厨房后门（东翼东墙）按拿/放键"扔掉垃圾"
//            （开局回收站旁边就有一袋扎好的，先把它拎过去）
//   收托盘   走到桌上有脏托盘的位子按"收托盘"（一次一只，最多叠 4 只，端着走）→ 回收台（凉棚西边）按拿/放键"放回回收台"
//   补货     手推车（补货堆旁边）：空手按拿/放键"拿起 手推车" → 补货堆按"装货" → 推到缺货那辆车的后面按"补货"（一车两箱）
//   帮忙出餐 午饭高峰塔可车排长队、摊主喊"人手不够"：从车后门的铁台阶上去，站到窗口后面按住"出餐"（出餐快一倍）
// 放着不管：桌上的脏托盘多了没人坐那张桌、鸟来翻；桶满了地上掉垃圾、客人嫌臭；车卖光了关窗、队伍散了 —— 满意度往下掉。
// 总监在这里干活，外面球场的活就没人做（玩法准则 2 的取舍，和 clubdesk / clubplaza 一样）。
import * as THREE from 'three';
import { type Hud, type Item, mountPlay, type Play, type PlayState } from '../clubsite/play';
import type { FoodLife, StallId } from './life';
import { STALL_ZH, STOCKED } from './life';
import { foodNavSpec } from './navspec';

export interface FoodPlayEnv {
  scene: THREE.Scene;
  // biome-ignore lint/suspicious/noExplicitAny: 场景自己那份 PixelPipeline（结构同 clubsite/play 的 PipeLike）
  pipe: any;
  canvas: HTMLCanvasElement;
  groundAt(x: number, z: number): number;
}

/** 第一步：导航 + 相机（life 建好之前；life 的气泡要用 play.say / play.bubble） */
export function mountFoodPlay(env: FoodPlayEnv): Play & { hud: Hud } {
  const { scene } = env;
  const director = scene.getObjectByName('slot:director') as THREE.Object3D;
  return mountPlay({
    scene,
    pipe: env.pipe,
    canvas: env.canvas,
    director,
    start: [director.position.x, director.position.z],
    yaw: director.rotation.y,
    nav: foodNavSpec(scene, env.groundAt, true),
    // 横屏的取景就是白模的横屏（左边会所、右边中心球场西头）：横屏相机基本不动，竖屏跟着总监
    camera: { lead: { portrait: 1.4, landscape: 0.5 }, view: { x0: -64, x1: -2, z0: -62, z1: 18 } },
    hint: '拖动走路 · 点地面走过去',
  });
}

/** 第二步：总监的活（互动点 + 手里的东西），life 建好之后 */
export function registerFoodJobs(play: Play, life: FoodLife) {
  const J = life.jobs;
  const { scene } = play;
  const up = (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy);
  // 收起来不用的东西挂在这里（看不见）
  const away = new THREE.Group();
  away.name = 'food-away';
  away.visible = false;
  scene.add(away);

  // 客人当挡路圆
  play.addBlocker(() => life.people());

  // ── 手里的东西 ──
  // 垃圾袋：开局回收站旁边有一袋扎好的（白模里的那袋）
  const bagSlot = scene.getObjectByName('slot:trash-bag');
  const bag = bagSlot
    ? play.addItem({
        id: 'bag',
        name: '垃圾袋',
        obj: bagSlot,
        grip: bagSlot.userData.grip,
        carrySpeed: 2.6,
        radius: 1.5,
      })
    : null;
  if (bag && bagSlot) bag.place(bagSlot.position.x, bagSlot.position.z, bagSlot.rotation.y);
  // 一摞托盘：手里"拿着"一个看不见的把手（push 姿势 = 两手在身前端着）；看得见的那摞由 life.post 跟到两手中间
  const handle = new THREE.Group();
  handle.name = 'stack-handle';
  const stack = play.addItem({
    id: 'stack',
    name: '托盘',
    obj: handle,
    grip: { at: [0, 0, 0], axis: [0, 0, 1], up: [0, 1, 0] },
    carryPose: 'push',
    carrySpeed: 2.4,
    droppable: false,
  });
  stack.stow(away);
  // 手推车（补货）
  const truck = J.handTruck
    ? play.addItem({
        id: 'truck',
        name: '手推车',
        obj: J.handTruck,
        grip: J.handTruck.userData.grip,
        carryPose: 'push',
        carrySpeed: 2.1,
        radius: 1.2,
      })
    : null;
  if (truck && J.handTruck) truck.place(J.handTruck.position.x, J.handTruck.position.z, J.handTruck.rotation.y);

  const holding = (s: PlayState, id: string) => s.held?.id === id;

  // ── 倒垃圾：回收站 → 厨房后门 ──
  const binAt = up(J.binAt(), 0);
  play.add({
    id: 'bins',
    at: () => binAt,
    radius: 2.0,
    priority: 1,
    stand: () => [binAt.x, binAt.z],
    label: (s) => (!s.held && Math.max(...J.bins()) >= 0.3 ? '换垃圾袋' : ''),
    canUse: (s) => !s.held && Math.max(...J.bins()) >= 0.3,
    onUse: (p) =>
      p.busy({
        name: 'bag',
        dur: 1.6,
        pose: 'pickup',
        face: binAt.clone().setZ(binAt.z - 1),
        mid: () => {
          const f = J.bagOut();
          if (bag) {
            bag.obj.visible = true;
            p.give(bag);
          }
          p.toast(f >= 1 ? '换好了 · 拎到会所厨房后门' : '换了新袋子 · 拎到厨房后门');
        },
      }),
  });
  const door = J.kitchenDoor();
  play.add({
    id: 'kitchen',
    at: () => up(door, 1.0),
    radius: 1.6,
    stand: () => [door.x, door.z],
    accepts: (it) => it.id === 'bag',
    putLabel: '扔掉垃圾',
    onPutDown: (it, p) => {
      it.stow(away);
      p.toast('垃圾扔进厨房后门的大桶');
    },
    pickBusy: { pose: 'dump', dur: 0.9 },
  });

  // ── 收托盘：离总监最近的脏托盘 → 回收台 ──
  const target = new THREE.Vector3(1e4, 0, 1e4);
  let tgt: ReturnType<typeof J.nearestDirty> = null;
  const pickTarget = () => {
    const s = play.state();
    tgt = J.nearestDirty(new THREE.Vector3(s.x, 0, s.z), 12);
    if (tgt) target.copy(tgt.pos);
    else target.set(1e4, 0, 1e4);
  };
  play.add({
    id: 'tray',
    at: () => target,
    radius: 1.35,
    priority: 2,
    label: (s) => {
      if (!tgt) return '';
      if (s.held && !holding(s, 'stack')) return '';
      return J.stack() >= 4 ? '端满了' : '收托盘';
    },
    canUse: (s) => !!tgt && (!s.held || holding(s, 'stack')) && J.stack() < 4,
    onUse: (p) => {
      const ref = tgt;
      if (!ref) return;
      p.busy({
        name: 'collect',
        dur: 0.6,
        pose: 'pickup',
        face: ref.pos.clone(),
        mid: () => {
          if (J.collect(ref) && !p.held()) p.give(stack);
          if (J.stack() >= 4) p.toast('端满了：送回回收台');
        },
      });
    },
  });
  const ret = J.trayReturnAt();
  play.add({
    id: 'tray-return',
    at: () => up(ret, 1.0),
    radius: 1.5,
    stand: () => [ret.x, ret.z],
    accepts: (it) => it.id === 'stack',
    putLabel: () => `放回回收台 ${J.stack()} 只`,
    onPutDown: (it, p) => {
      const n = J.returnStack();
      it.stow(away);
      p.toast(`收回 ${n} 只托盘`);
    },
  });

  // ── 补货：手推车 → 补货堆装货 → 车后面卸货 ──
  const supply = J.supplyAt();
  play.add({
    id: 'supply',
    at: () => up(supply, 0.8),
    radius: 1.6,
    stand: () => [supply.x, supply.z],
    label: (s) => (holding(s, 'truck') ? (J.truckLoad() >= 2 ? '装满了' : '装货') : ''),
    canUse: (s) => holding(s, 'truck') && J.truckLoad() < 2,
    onUse: (p) =>
      p.busy({
        name: 'load',
        dur: 1.2,
        pose: 'pickup',
        mid: () => {
          J.setTruckLoad(2);
          p.toast('装了两箱 · 推到缺货的车后面');
        },
      }),
  });
  for (const id of STOCKED as StallId[]) {
    const back = J.backOf(id);
    play.add({
      id: `restock-${id}`,
      at: () => up(back, 1.0),
      radius: 1.5,
      stand: () => [back.x, back.z],
      label: (s) => (holding(s, 'truck') && J.truckLoad() > 0 && J.stock(id) < 0.85 ? `给${STALL_ZH[id]}补货` : ''),
      canUse: (s) => holding(s, 'truck') && J.truckLoad() > 0 && J.stock(id) < 0.85,
      onUse: (p) =>
        p.busy({
          name: 'restock',
          dur: 1.4,
          pose: 'pickup',
          mid: () => {
            J.restock(id);
            J.setTruckLoad(J.truckLoad() - 1);
            p.toast(`${STALL_ZH[id]}补满了`);
          },
        }),
    });
  }

  // ── 帮忙出餐：塔可车窗口后面（车地板 0.85 上）按住 ──
  const helper = J.helperAt();
  play.add({
    id: 'help',
    at: () => up(helper, 1.0),
    radius: 0.9,
    priority: 3,
    noMark: false,
    label: (s) => (s.y > 0.5 ? (J.tacoQueue() > 0 ? '出餐' : '没人排队') : ''),
    canUse: (s) => s.y > 0.5 && J.tacoQueue() > 0 && !s.held,
    pose: 'feed',
    onUse: () => J.setHelping(true),
    onHold: () => {
      J.setHelping(true);
      return J.tacoQueue() > 0;
    },
    onRelease: () => J.setHelping(false),
  });

  // ── 顶栏 + 提示 ──
  let statT = 0;
  let wasRush = false;
  const warned = { bins: false, dirty: false, stock: false };
  const low = () => (STOCKED as StallId[]).filter((id) => J.stock(id) < 0.3).map((id) => STALL_ZH[id]);
  return {
    /** 每步（play.update + life.post 之后） */
    update(dt: number) {
      pickTarget();
      // 托盘都送回去了 → 把手收起来
      if (stack.where === 'held' && J.stack() === 0) {
        play.take();
        stack.stow(away);
      }
      // 不在车里了 → 不算帮忙
      if (play.state().y < 0.5) J.setHelping(false);
      statT -= dt;
      if (statT > 0) return;
      statT = 0.25;
      const st = life.state;
      play.stat('mood', '满意', `${Math.round(st.mood)}%`);
      play.stat('sold', '卖出', st.sold);
      play.stat('dirty', '脏托盘', st.dirty);
      play.stat('bins', '垃圾桶', `${Math.round(Math.min(1, Math.max(...st.bins)) * 100)}%`);
      const l = low();
      play.stat('stock', '缺货', l.length ? l.join('、') : null);
      play.stat('stack', '手上', J.stack() ? `${J.stack()} 只托盘` : null);
      if (st.rush && !wasRush) play.toast('午饭高峰 · 塔可车要排长队了', 2.6);
      if (st.rush && st.tacoQueue >= 5 && !st.helping && !warned.stock) {
        warned.stock = true;
        play.toast('塔可车人手不够：从车后门上去，站到窗口后面按住"出餐"', 3.2);
      }
      wasRush = st.rush;
      if (!st.rush) warned.stock = false;
      if (Math.max(...st.bins) >= 1 && !warned.bins) {
        warned.bins = true;
        play.toast('回收站满了 · 去换垃圾袋', 2.6);
      } else if (Math.max(...st.bins) < 0.8) warned.bins = false;
      if (st.dirty >= 4 && !warned.dirty) {
        warned.dirty = true;
        play.toast('桌上的脏托盘多了 · 去收一下', 2.6);
      } else if (st.dirty < 2) warned.dirty = false;
    },
    items: { bag, stack, truck } as Record<string, Item | null>,
  };
}
