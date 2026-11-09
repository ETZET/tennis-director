// clubplaza 的玩法接线：导航（广场顶面减池子和道具脚印、两段台阶下到绿带和长廊、西边去看台的台阶）+ 总监的活（互动点、手里的工具）。
// 活本身（叶子跟着网圈走、扫成堆、浇水的水滴、倒桶）在 life.ts 的 job 里；这里只管"什么时候能干、按哪个键、站哪"。
//
// 工具都在保洁车上（东边那棵蒲葵的荫里）；空手在车旁按拿/放键 = 拿眼下最用得着的那件：
//   捞网（靠在车把上）  走近按 拿/放键"拿捞网" → 在池边按住动作键"捞叶子"（skim，一片 ≈ 6 秒，网兜装 3 片）
//   扫帚（插在桶后）    "拿扫帚" → 站在地上的枯叶旁按住"扫落叶"（≈ 3 秒一片）
//   浇水壶（挂在桶前）  "拿水壶" → 台阶顶的花盆旁按"浇花"（2.4 秒；土面变深，慢慢干）
//   回到车旁：拿/放键"放回车上"；动作键"倒进桶"（网兜 / 扫起来的叶子倒进落叶桶，12 片满）
//   桶快满了：空手在车旁按"推车"→ 推下东台阶到长廊东头"倒掉落叶"→ 拿/放键"放下车"（停在哪就在哪）
// 放着不管：叶子越积越多 → 长椅上的人皱眉走掉、鸟不回来（life.ts）。总监在这里干活的时候，前台那边就没人（clubdesk 的取舍）。
import * as THREE from 'three';
import { STAIRS } from '../clubdesk/layout';
import { footprint, type Item, type Play, type Rect, rampFromStairs, type Shape } from '../clubsite/play';
import type { RegionNav, RegionStart } from '../clubsite/region';
import { FOUNTAIN, FOUNTAIN_SPEC, PLAZA, SLOTS, SPOTS, STADIUM_LINK } from './layout';
import type { LeafRef, PlazaLife } from './life';

/** 导航网格：广场 + 西边去看台的小路 + 台阶下的绿带和长廊 */
export const NAV_BOUNDS: Rect = { x0: 21, x1: 59.5, z0: -36.2, z1: -4.6 };

/** 挡路的植物（树干 / 株半径，乘 slot 的缩放；只算地面上的，花盆里的龙舌兰另算） */
const PLANT_R: Record<string, number> = {
  'fan-palm': 0.45,
  'palo-verde': 0.45,
  'smoke-tree': 0.5,
  creosote: 0.6,
  brittlebush: 0.45,
  agave: 0.55,
};
/** 按包围盒挡路的东西（slot id） */
const BOXED = ['bench-w', 'bench-n', 'bench-prom', 'bench-link', 'drinks-cart', 'drink-fountain'];

/** 独立页面的开局（main.ts 的 mountPlay） */
export const PLAZA_START: RegionStart = {
  start: [SPOTS.leafCart[0] - 0.4, SPOTS.leafCart[1] - 0.6],
  yaw: -Math.PI / 2,
  // 横屏的取景范围就是白模的横屏（左边看台、右边东墙和大门）：横屏下相机不左右跑，竖屏跟着总监
  camera: { lead: { portrait: 1.4, landscape: 0.5 }, view: { x0: 15.2, x1: 72.8, z0: -58, z1: 12 } },
  hint: '拖动走路 · 点地面走过去',
};

/** 第一步：导航（life 建好之前；独立页面先 mountPlay，life 的气泡要用 play.say）。scene = 区域的根 */
export function plazaNav(scene: THREE.Object3D): RegionNav {
  const slot = (id: string) => scene.getObjectByName(`slot:${id}`) ?? null;
  const blocked: Shape[] = [
    // 喷泉池（池壁外沿）
    { x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN_SPEC.basinR + 0.05 },
  ];
  for (const id of BOXED) {
    const o = slot(id);
    const r = o && footprint(o, 0.06);
    if (r) blocked.push(r);
  }
  for (const s of SLOTS) {
    const r = PLANT_R[s.asset];
    if (r && s.y === undefined) blocked.push({ x: s.x, z: s.z, r: r * (s.s ?? 1) });
  }
  // 四个花盆（陶罐 + 龙舌兰）
  for (const s of SLOTS) if (s.asset === 'pot') blocked.push({ x: s.x, z: s.z, r: 0.42 });

  const st = STADIUM_LINK.stairs;
  return {
    bounds: NAV_BOUNDS,
    walkable: [
      // 广场顶面（北沿、东沿是 1.2 米的落差：高差挡住）
      { x0: PLAZA.x0, x1: PLAZA.x1, z0: PLAZA.z0, z1: PLAZA.z1 },
      // 两段台阶 + 绿带 + 长廊（往南出画 = clubdesk）
      { x0: 30, x1: NAV_BOUNDS.x1, z0: PLAZA.z1, z1: NAV_BOUNDS.z1 },
      // 西沿的台阶 + 去看台的小路（横屏左边）
      { x0: STADIUM_LINK.path.x0, x1: PLAZA.x0, z0: STADIUM_LINK.path.z0, z1: STADIUM_LINK.path.z1 },
      { x0: st.x0, x1: st.x1, z0: st.z0, z1: st.z1 },
    ],
    blocked,
    ramps: [
      ...STAIRS.slice(0, 2).map(rampFromStairs),
      { x0: st.x0, x1: st.x1, z0: st.z0, z1: st.z1, from: 0, to: 1.2, axis: 'x' },
    ],
  };
}

/** 第二步：总监的活（互动点 + 工具），life 建好之后 */
export function registerPlazaJobs(play: Play, life: PlazaLife) {
  const L = life.play;
  const cart = L.cart;
  const wp = (o: THREE.Object3D, dy = 0) => o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0));
  const heldId = () => play.held()?.id ?? '';

  // 会员、孩子、家长、摊主当挡路圆；保洁车（没在推的时候）也是
  play.addBlocker(() => life.people());
  play.addBlocker(() => (heldId() === 'cart-push' ? null : { x: cart.position.x, z: cart.position.z, r: 0.62 }));

  // ── 工具：车上的三件（拿起 = 从车上；放回 = 车旁的拿/放键）──
  const net = play.addItem({ id: 'net', name: '捞网', obj: L.net, grip: L.net.userData.grip, droppable: false });
  const broom = play.addItem({
    id: 'broom',
    name: '扫帚',
    obj: L.tools.broom,
    grip: L.tools.broom.userData.grip,
    droppable: false,
  });
  const can = play.addItem({
    id: 'can',
    name: '浇水壶',
    obj: L.tools.can,
    grip: L.tools.can.userData.grip,
    droppable: false,
  });
  // 推车：手里"拿着"一个看不见的推把（push 姿势、走慢一点）；车本身由 life.post 摆到总监身前
  const handle = new THREE.Group();
  handle.name = 'cart-handle';
  const push = play.addItem({
    id: 'cart-push',
    name: '保洁车',
    obj: handle,
    grip: { at: [0, 0, 0], axis: [0, 0, 1], up: [0, 1, 0] },
    carryPose: 'push',
    carrySpeed: 1.9,
  });
  push.stow(cart);
  const tools: Record<string, Item> = { net, broom, can };
  const onCart = (it: Item) => it.where === 'away';

  /** 空手在车旁：拿眼下最用得着的那件（水里有叶子 → 捞网；地上有 → 扫帚；有干的花盆 → 浇水壶） */
  const needed = (): Item | null => {
    const want: Item[] = [];
    if (L.leaves('water').length) want.push(net);
    if (L.leaves('tile').length) want.push(broom);
    if (L.pots().some((p) => p.wet < 0.4)) want.push(can);
    want.push(net, broom, can);
    return want.find(onCart) ?? null;
  };
  // 车旁：放回工具（拿/放键）、倒进桶 / 推车（动作键）
  play.add({
    id: 'leaf-cart',
    at: () => wp(cart, 1.0),
    radius: 1.7,
    priority: 1,
    pickLabel: () => {
      const it = needed();
      return it ? `拿${it.id === 'can' ? '水壶' : it.spec.name}` : '';
    },
    canPickUp: (s) => !s.held && !!needed(),
    onPickUp: (p) => {
      const it = needed();
      if (it) p.give(it);
    },
    stand: () => [
      cart.position.x - Math.sin(cart.rotation.y) * 0.95,
      cart.position.z - Math.cos(cart.rotation.y) * 0.95,
    ],
    label: (s) => {
      if (L.load() > 0) return L.cartFill() >= 1 ? '' : `倒进桶 ${L.load()} 片`;
      if (!s.held && L.cartFill() >= 0.5) return '推车';
      return '';
    },
    canUse: (s) => (L.load() > 0 ? L.cartFill() < 1 : !s.held && L.cartFill() >= 0.5),
    onUse: (p) => {
      if (L.load() > 0) {
        p.busy({
          name: 'dump',
          dur: 1.6,
          pose: 'dump',
          face: cart.position.clone(),
          mid: () => {
            const n = L.dumpLoad();
            p.toast(`倒进桶 ${n} 片 · 桶 ${Math.round(L.cartFill() * 12)}/12`);
          },
        });
        return;
      }
      p.give(push);
      L.grabCart();
      p.toast('推下东台阶，到长廊东头倒掉');
    },
    accepts: (it) => it.id in tools,
    putLabel: '放回车上',
    onPutDown: (it) => {
      if (it.id === 'net') {
        it.stow(play.scene);
        L.stowNet();
      } else {
        it.stow(cart);
        L.stowOnCart(it.id as 'broom' | 'can');
      }
    },
  });
  // 长廊东头的垃圾点：推着车按"倒掉落叶"
  const DUMP = L.dumpPoint();
  play.add({
    id: 'dump',
    at: () => DUMP.clone().setY(0.6),
    radius: 2.2,
    label: (s) => (s.held?.id === 'cart-push' && L.cartFill() > 0 ? '倒掉落叶' : ''),
    canUse: (s) => s.held?.id === 'cart-push' && L.cartFill() > 0,
    onUse: (p) =>
      p.busy({
        name: 'empty',
        dur: 2.2,
        pose: 'dump',
        tick: (k) => L.emptyCart(k),
        end: () => {
          L.emptyCart(1);
          p.toast('桶倒空了 · 推回去，按"放下车"');
        },
      }),
  });

  // ── 捞叶子：离总监最近的那片水里的叶子（捞的时候锁住）──
  let skim: { leaf: LeafRef; job: ReturnType<typeof L.startSkim> } | null = null;
  const skimTarget = (): LeafRef | null => {
    if (skim) return skim.leaf;
    const s = play.state();
    return L.nearestLeaf('water', new THREE.Vector3(s.x, 0, s.z), 9);
  };
  play.add({
    id: 'skim',
    at: () => {
      const l = skimTarget();
      return l ? l.pos.clone() : new THREE.Vector3(1e4, 0, 1e4);
    },
    radius: 3.3,
    priority: 2,
    stand: () => {
      const l = skimTarget();
      if (!l) return null;
      const p = L.rimSpot(l);
      return [p.x, p.z];
    },
    label: (s) => (s.held?.id === 'net' ? (L.load() >= 3 ? '网兜满了' : '捞叶子') : ''),
    canUse: (s) => s.held?.id === 'net' && !!skimTarget() && (!!skim || L.load() < 3),
    pose: 'skim',
    onUse: () => {
      const l = skimTarget();
      if (l) skim = { leaf: l, job: L.startSkim(l) };
    },
    onHold: (dt) => {
      if (!skim) return false;
      if (skim.job.tick(dt)) {
        skim = null;
        return false;
      }
      return true;
    },
    onRelease: (p) => {
      if (skim) {
        skim.job.cancel();
        skim = null;
        return;
      }
      if (L.load() >= 3) p.toast('网兜满了：回保洁车"倒进桶"');
    },
  });

  // ── 扫落叶：离总监最近的地上的叶子 ──
  let sweep: { leaf: LeafRef; job: ReturnType<typeof L.startSweep> } | null = null;
  const sweepTarget = (): LeafRef | null => {
    if (sweep) return sweep.leaf;
    const s = play.state();
    return L.nearestLeaf('tile', new THREE.Vector3(s.x, 0, s.z), 9);
  };
  play.add({
    id: 'sweep',
    at: () => {
      const l = sweepTarget();
      return l ? l.pos.clone() : new THREE.Vector3(1e4, 0, 1e4);
    },
    radius: 1.5,
    priority: 2,
    label: (s) => (s.held?.id === 'broom' ? '扫落叶' : ''),
    canUse: (s) => s.held?.id === 'broom' && !!sweepTarget(),
    pose: 'sweep',
    onUse: () => {
      const l = sweepTarget();
      if (l) sweep = { leaf: l, job: L.startSweep(l) };
    },
    onHold: (dt) => {
      if (!sweep) return false;
      if (sweep.job.tick(dt)) {
        sweep = null;
        return false;
      }
      return true;
    },
    onRelease: () => {
      sweep?.job.cancel();
      sweep = null;
    },
  });

  // ── 浇花：四个花盆 ──
  for (const pot of L.pots()) {
    play.add({
      id: `pot-${pot.id}`,
      at: () => pot.pos.clone().setY(pot.pos.y + 0.9),
      radius: 1.3,
      label: (s) => (s.held?.id === 'can' ? '浇花' : ''),
      canUse: (s) => s.held?.id === 'can' && (L.pots()[pot.id]?.wet ?? 1) < 0.7,
      onUse: (p) => {
        const job = L.startPour(pot.id);
        let k0 = 0;
        p.busy({
          name: 'pour',
          dur: 2.4,
          pose: 'pour',
          loop: true,
          face: pot.pos.clone(),
          tick: (k) => {
            job.tick((k - k0) * 2.4);
            k0 = k;
          },
          end: () => {
            job.tick(1);
            p.toast('浇好了');
          },
        });
      },
    });
  }

  // ── 顶栏 + 提示 ──
  let statT = 0;
  let warned = false;
  return {
    /** 每步（play.update 之后） */
    update(dt: number) {
      // 车放下了（拿/放键"放下 保洁车"）→ 推把挂回车上，车停在原地
      if (push.where !== 'held' && push.where !== 'away') {
        push.stow(cart);
        L.dropCart();
      }
      statT -= dt;
      if (statT > 0) return;
      statT = 0.25;
      const st = life.state;
      const clean = Math.round(Math.max(0, Math.min(100, 100 - st.dirt * 14)));
      play.stat('plaza', '广场', `${clean}%`);
      play.stat('bin', '桶', `${st.cart}/12`);
      play.stat('bench', '长椅', `${st.seated} 人`);
      play.stat('load', '网兜', st.load > 0 ? `${st.load} 片` : null);
      if (st.dirt >= 3 && !warned) {
        warned = true;
        play.toast('池子里叶子多了 · 去保洁车拿捞网', 2.6);
      } else if (st.dirt < 2) warned = false;
    },
  };
}
