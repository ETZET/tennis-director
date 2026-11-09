// clubpark 的玩法接线：总监（clubsite/play）在大门外的落客区、两片停车场里走；life.ts 的车、人当会动的挡路圆。
// 总监能干的活（互动点，都便宜、都改 life 的状态，NPC 跟着反应）：
//   park-keys     落客点：会员拿着钥匙等代客（代客去停别的车了）→ 拿/放键"接钥匙"：会员先进门，钥匙到总监手里
//   park-booth    岗亭窗口：拿着钥匙 → "挂钥匙"：钥匙挂上钥匙板，代客回来摘下钥匙去把车停了；
//                 空手、代客台前有人等取车 → "摘钥匙"（他的车钥匙）
//   park-pickup   等取车的会员：拿着他的钥匙 → "递钥匙"：会员自己走去停车场开车走，代客省一趟
//   park-trolley  球包车：拿/放键"推球包车"（推着走：车跟在总监身前，life 摆位置）；门童装满 4 个包以后就没地方放了
//   park-gate     大门口：推着车走到门洞前 → "送进门"：球包送进去（setBags(0)），车留在门口，门童以后就去那儿放包
// 取舍：总监在落客点接钥匙，会员不用干等；可是钥匙得送回岗亭，车在落客点多停一会儿，后面来的车要排队。
// 递钥匙让会员自己去取车：代客能腾出手接下一辆，可是总监离开了大门口（门童装满推车、落客的人没人接）。
// 玩法模式比只看模式多一辆落客、一个取车（layout.ts GATE_TIMING.rush）：代客一个人忙不过来。
import * as THREE from 'three';
import type { Play, Shape } from '../clubsite/play';
import type { RegionJobs, RegionNav, RegionStart } from '../clubsite/region';
import { GATE } from '../clubsite/world';
import { makeKeys } from './assets/staff/uniform';
import type { AssetCtx } from './ctx';
import { BLOCKED, GATE_POSTS, SLOTS, SPOTS, WALKABLE, WALL_OUT } from './layout';
import type { ParkLife } from './life';

export interface ParkPlayEnv {
  /** 区域的根（独立页面 = scene） */
  scene: THREE.Object3D;
  ctx: AssetCtx;
  life: ParkLife | undefined;
}

/** 挡路的植物（树干半径） */
const PLANT_R: Record<string, number> = { 'fan-palm': 0.45, agave: 0.5, brittlebush: 0.4, 'barrel-cactus': 0.35 };

/** 独立页面的开局（main.ts 的 mountPlay） */
export const PARK_START: RegionStart = {
  start: SPOTS.director,
  yaw: 0,
  camera: { lead: { portrait: 1.6, landscape: 0.6 }, view: { x0: 52, x1: 108, z0: -32, z1: 32 } },
  hint: '拖动走路 · 点地面走过去',
};

/** 导航：落客区、两片停车场、门洞 */
export function parkNav(): RegionNav {
  const blocked: Shape[] = [
    ...BLOCKED,
    // 代客台、立牌、长椅
    { x: SPOTS.podium[0], z: SPOTS.podium[1], r: 0.45 },
    { x: 64.3, z: -3.75, r: 0.32 },
    { x0: 62.0, x1: 63.8, z0: 8.3, z1: 8.9 },
    // 门柱（1.7 见方）
    ...GATE_POSTS.map((z) => ({ x0: GATE.x - 0.85, x1: GATE.x + 0.85, z0: z - 0.85, z1: z + 0.85 })),
  ];
  for (const s of SLOTS) {
    const r = PLANT_R[s.asset];
    if (r && Math.abs((s.y ?? 0) - 0.15) < 0.1) blocked.push({ x: s.x, z: s.z, r: r * (s.s ?? 1) });
  }
  return {
    bounds: { x0: 57.5, x1: 92, z0: -27, z1: 27 },
    walkable: [
      ...WALKABLE,
      // 门洞（走进去一点 = 门里，clubdesk 的地方）
      { x0: 57.6, x1: WALL_OUT + 0.4, z0: GATE.z0 + 0.1, z1: GATE.z1 - 0.1 },
    ],
    blocked,
  };
}

/** 总监的活登记到 play（钥匙、岗亭、取车、球包车、大门）；返回每步的 step（推车放下、顶栏） */
export function attachParkJobs(play: Play, env: ParkPlayEnv): RegionJobs {
  const { scene, ctx, life } = env;
  const slot = (id: string) => scene.getObjectByName(`slot:${id}`) ?? null;
  if (!life) return { step: () => {} };
  const H = life.hooks;

  // 车、人、推车：会动的挡路圆
  play.addBlocker(() => life.obstacles());

  // ── 钥匙（拿在右手：代客那串钥匙的样子） ──
  let keyN = 0;
  const keysObj = () => {
    const k = makeKeys(
      ctx.mat('signPaint', { edge: 0.4, convex: 0.3, noShadowReceive: true }),
      ctx.mat('steel', { edge: 0.4, noShadowReceive: true }),
    );
    k.traverse((c) => {
      c.castShadow = false;
    });
    ctx.mats.prepare(k);
    return k;
  };
  const tmp = new THREE.Vector3();
  const keysAt = new THREE.Vector3();
  play.add({
    id: 'park-keys',
    at: () => {
      const w = H.keysWaiting();
      return w ? keysAt.set(w.x, 1.0, w.z) : keysAt.set(0, -50, 0);
    },
    radius: 1.5,
    priority: 2,
    pickLabel: '接钥匙',
    canPickUp: (s) => !!H.keysWaiting() && !s.held,
    onPickUp: (p) => {
      if (!H.takeKeys()) return;
      const it = p.addItem({ id: `valet-keys-${keyN++}`, name: '钥匙', obj: keysObj(), droppable: false, radius: 0.6 });
      p.give(it);
      p.toast('接过钥匙：挂到岗亭，代客回来去停车');
    },
    pickBusy: { pose: 'pickup', dur: 0.4 },
  });
  const booth = slot('valet-booth');
  const boothAt = new THREE.Vector3();
  if (booth) {
    const [bx, bz] = H.boothWindow();
    boothAt.set(bx, 1.2, bz - 0.5);
  }
  play.add({
    id: 'park-booth',
    at: () => boothAt,
    radius: 1.3,
    stand: () => H.boothWindow(),
    pickLabel: '摘钥匙',
    canPickUp: (s) => !s.held && !!H.pickupWaiting(),
    onPickUp: (p) => {
      if (!H.takePickupKeys()) return;
      p.give(p.addItem({ id: `pickup-keys-${keyN++}`, name: '钥匙', obj: keysObj(), droppable: false, radius: 0.6 }));
      p.toast('摘下钥匙：递给代客台前等车的会员');
    },
    accepts: (item) => item.id.startsWith('valet-keys') || item.id.startsWith('pickup-keys'),
    putLabel: (item) => (item.id.startsWith('valet-keys') ? '挂钥匙' : '挂回去'),
    pickBusy: { pose: 'pickup', dur: 0.5 },
    onPutDown: (item, p) => {
      item.remove();
      if (item.id.startsWith('valet-keys')) {
        H.hangKeys();
        p.toast('钥匙挂上了');
      } else H.returnPickupKeys();
    },
  });
  const pkAt = new THREE.Vector3();
  play.add({
    id: 'park-pickup',
    at: () => {
      const m = H.pickupMember();
      return m ? pkAt.set(m.position.x, 1.0, m.position.z) : pkAt.set(0, -50, 0);
    },
    radius: 1.4,
    priority: 2,
    accepts: (item) => item.id.startsWith('pickup-keys'),
    putLabel: '递钥匙',
    pickBusy: { pose: 'pickup', dur: 0.4 },
    onPutDown: (item, p) => {
      item.remove();
      if (H.givePickupKeys()) p.toast('会员自己去取车了');
    },
  });

  // ── 球包车：推着走（手里一个看不见的"推车"东西 → 推的姿势；车本身由 life 摆在总监身前） ──
  const trolley = H.trolley;
  if (trolley) {
    const tAt = new THREE.Vector3();
    let pushN = 0;
    play.add({
      id: 'park-trolley',
      at: () => {
        if (H.trolleyCarried()) return tAt.set(0, -50, 0);
        // 车心（把手那头常常贴着墙、岗亭，站不过去：哪边够得着都行）
        return tAt.set(trolley.position.x, 0.9, trolley.position.z);
      },
      radius: 1.6,
      priority: 1,
      pickLabel: () => `推球包车 ${H.trolleyBags()}/4`,
      canPickUp: (s) => !s.held && !H.trolleyCarried(),
      pickBusy: null,
      onPickUp: (p) => {
        const it = p.addItem({
          id: `trolley-push-${pushN++}`,
          name: '球包车',
          obj: new THREE.Group(),
          carryPose: 'push',
          carrySpeed: 1.9,
          radius: 0.1,
        });
        p.give(it);
        H.setTrolleyCarried(true);
      },
    });
    play.add({
      id: 'park-gate',
      at: () => tmp.set(GATE.x + 0.6, 0.8, 0.4),
      radius: 2.4,
      priority: 3,
      accepts: (item) => item.id.startsWith('trolley-push'),
      putLabel: () => (H.trolleyBags() ? '送进门' : '放下推车'),
      pickBusy: null,
      onPutDown: (item, p) => {
        item.remove();
        H.setTrolleyCarried(false);
        const n = H.deliverBags();
        if (n) p.toast(`${n} 个球包送进去了`);
      },
    });
  }

  // 拿着推车随手放下（不在门口）：推车就停在那里
  let lastHeld = '';
  let statT = 0;
  const stats = () => {
    const st = life.stats();
    play.stat('valet', '代客', st.valet);
    play.stat('wait', '等钥匙', st.wait > 0.5 ? `${st.wait.toFixed(0)} 秒` : '—');
    play.stat('bags', '球包', `${st.bags}/4`);
    play.stat('served', '已停', st.served);
  };
  stats();
  // 每步（play.update 之后）
  const step = (dt: number) => {
    const h = play.held()?.id ?? '';
    if (lastHeld.startsWith('trolley-push') && !h.startsWith('trolley-push')) {
      // 推车被放下了（随手放下 / 门口）：随手放下的那个"推车"东西删掉
      const it = play.item(lastHeld);
      if (it && it.where !== 'gone') it.remove();
      H.setTrolleyCarried(false);
    }
    lastHeld = h;
    statT -= dt;
    if (statT <= 0) {
      statT = 0.25;
      stats();
    }
  };
  return { step };
}
