// clubdesk 的玩法接线（试点）：导航数据（能走 / 挡路 / 台阶，照 layout.ts 的 WALKABLE 说明）+ 几个样板互动点。
// 真正的活（排队、签到、递毛巾给会员、换水桶、扫沙）由 life.ts 通过同一个 play 登记（同 id 再 add = 替换样板）：
//   desk-serve     柜台转角：动作键"签到"（样板：按铃 + 会员头上冒对勾 + 计数）
//   towel-cart     毛巾车东头：拿/放键"拿毛巾"（车上少一卷，手里多一卷毛巾）
//   desk-handover  柜台台面：拿着毛巾时"递毛巾"（样板：放回台面那叠）
// 毛巾随手放在地上 → "拿起 毛巾"。
import * as THREE from 'three';
import { GATE } from '../clubmap2/layout';
import { footprint, type Hud, mountPlay, type Play, type Rect, rampFromStairs, type Shape } from '../clubsite/play';
import { CANOPY, COUNTER, GATE_SPEC, HEAD_LINE_Z, PICKLE, SLOTS, SPOTS, STAIRS, WALL } from './layout';
import type { AssetCtx } from './world';

/** 墙里面的脸（东墙中心 x 60、厚 0.7） */
const WALL_IN = GATE.x - WALL.t / 2;
/** 导航网格范围：东边步道（x 33.6）→ 门外 4 米；广场（池边）→ 草坪南半 */
export const NAV_BOUNDS: Rect = { x0: 33.6, x1: 64, z0: -21, z1: 36 };

/** 挡路的植物（按资产 id 的树干/株半径，乘 slot 的缩放） */
const PLANT_R: Record<string, number> = {
  'fan-palm': 0.45,
  'palo-verde': 0.45,
  'smoke-tree': 0.5,
  creosote: 0.6,
  brittlebush: 0.45,
  agave: 0.6,
};
/** 按包围盒挡路的家具（slot id） */
const BOXED = ['back-cabinet', 'towel-cart', 'water-station', 'tool-rack', 'checkin-board', 'bench-prom', 'bench-lawn'];

export interface DeskPlayEnv {
  scene: THREE.Scene;
  // biome-ignore lint/suspicious/noExplicitAny: 场景自己那份 PixelPipeline（结构同 clubsite/play 的 PipeLike）
  pipe: any;
  canvas: HTMLCanvasElement;
  groundAt(x: number, z: number): number;
  ctx: AssetCtx;
}

export function setupDeskPlay(env: DeskPlayEnv): Play & { hud: Hud } {
  const { scene, ctx } = env;
  const slot = (id: string) => scene.getObjectByName(`slot:${id}`) ?? null;

  // ── 挡路的 ──
  const blocked: Shape[] = [
    // 匹克球围场（西门进，那是 clubpickle 的事）
    { x0: PICKLE.x0, x1: PICKLE.x1, z0: PICKLE.z0, z1: PICKLE.z1 },
    // 喷泉池（广场上，画外）
    { x: 44, z: -24, r: 4.6 },
    // 凉棚下帽子会被帆布挡住的那块（HEAD_LINE_Z 以北）：不让进
    { x0: CANOPY.x0, x1: CANOPY.x1, z0: CANOPY.z0, z1: HEAD_LINE_Z },
    // 柜台两段、凉棚南边西柱
    COUNTER.east,
    COUNTER.south,
    { x: 52.6, z: 9.0, r: 0.2 },
    // 门柱
    ...GATE_SPEC.pierZ.map(
      (z): Rect => ({
        x0: GATE.x - GATE_SPEC.pier / 2,
        x1: GATE.x + GATE_SPEC.pier / 2,
        z0: z - GATE_SPEC.pier / 2,
        z1: z + GATE_SPEC.pier / 2,
      }),
    ),
  ];
  for (const id of BOXED) {
    const o = slot(id);
    const r = o && footprint(o, 0.04);
    if (r) blocked.push(r);
  }
  for (const s of SLOTS) {
    const r = PLANT_R[s.asset];
    if (r && (s.y ?? 0) < 0.5) blocked.push({ x: s.x, z: s.z, r: r * (s.s ?? 1) });
  }
  // 陶罐（上面种着龙舌兰）
  blocked.push({ x: 58.4, z: -7.3, r: 0.45 });

  const play = mountPlay({
    scene,
    pipe: env.pipe,
    canvas: env.canvas,
    director: slot('director') as THREE.Object3D,
    start: SPOTS.deskStand,
    yaw: 1.25,
    nav: {
      groundAt: env.groundAt,
      bounds: NAV_BOUNDS,
      walkable: [
        // 墙里（广场、草坪的高差由 groundAt 给，崖壁 > 0.3 米挡住，走台阶）
        { x0: NAV_BOUNDS.x0, x1: WALL_IN, z0: NAV_BOUNDS.z0, z1: NAV_BOUNDS.z1 },
        // 门洞 → 门外几米（gateOut 那边是 clubpark）
        { x0: WALL_IN - 0.5, x1: NAV_BOUNDS.x1, z0: GATE.z0 + 0.05, z1: GATE.z1 - 0.05 },
      ],
      blocked,
      ramps: STAIRS.map(rampFromStairs),
    },
    camera: { lead: { portrait: 1.6, landscape: 0.6 } },
    hint: '拖动走路 · 点地面走过去',
  });

  // 站着的人当挡路圆（life 接管这些人以后照样跟着他们走：按世界位置算）
  for (const s of SLOTS) {
    if (s.asset !== 'player') continue;
    const o = slot(s.id);
    if (o) play.blockPerson(o, 0.28);
  }

  addDemos(play, scene, ctx);
  return play;
}

/** 卷起来的毛巾（白 + 两道俱乐部蓝），0.32 米长，握在中间 */
export function buildTowel(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'towel';
  const white = ctx.mat('clothWhite');
  const blue = ctx.mat('canvasStripe', { noShadowReceive: false, lightUp: 0.25, bands: [0.05, 0.5] });
  const R = 0.075;
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.32, 8).rotateZ(Math.PI / 2), white);
  g.add(roll);
  for (const x of [-0.09, 0.09]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.05, 8).rotateZ(Math.PI / 2), blue);
    band.position.x = x;
    g.add(band);
  }
  // 地上时躺着（中心离地 R）；拿在手里时握点 = 中心
  for (const c of g.children) c.position.y = R;
  g.userData.grip = { at: [0, R, 0], axis: [0, -1, 0], up: [0, 0, 1] };
  ctx.mats.prepare(g);
  g.traverse((c) => {
    c.castShadow = false;
  });
  return g;
}

/** 样板互动点（life.ts 用同 id 替换） */
function addDemos(play: Play, scene: THREE.Scene, ctx: AssetCtx) {
  const counter = scene.getObjectByName('slot:desk-counter');
  const cart = scene.getObjectByName('slot:towel-cart');
  const member = scene.getObjectByName('slot:member-serve');
  const local = (o: THREE.Object3D | undefined | null, p: readonly number[]) =>
    o ? o.localToWorld(new THREE.Vector3(p[0], p[1], p[2])) : new THREE.Vector3(p[0], p[1], p[2]);
  const cspots = counter?.userData.spots as { handover: number[]; bell: number[] } | undefined;
  const handover = local(counter, cspots?.handover ?? [0, 1.3, -0.6]);
  const bell = local(counter, cspots?.bell ?? [0, 1.2, -0.3]);
  const stock = () => (cart?.userData.stock as number | undefined) ?? 9;

  let served = 0;
  const queueN = SLOTS.filter((s) => s.id.startsWith('member-q')).length;
  const stats = () => {
    play.stat('queue', '队伍', `${queueN} 人`);
    play.stat('towels', '毛巾', stock());
    play.stat('served', '已签到', served);
  };
  stats();

  // 签到：站在柜台里面（柜台东段以西）才行
  play.add({
    id: 'desk-serve',
    at: () => bell,
    radius: 1.0,
    stand: () => SPOTS.deskStand,
    label: '签到',
    canUse: (s) => s.x < COUNTER.east.x0 && !s.held,
    onUse: (p) => {
      p.busy({
        name: 'serve',
        dur: 1.2,
        pose: 'idle',
        face: member?.position ?? bell,
        mid: () => {
          counter?.userData.ding?.();
          if (member) p.say(member, '✓ 签到', 1.6);
          served++;
          stats();
          p.toast(`签到 ✓ 今天第 ${served} 位`);
        },
      });
    },
  });

  // 毛巾车：拿一卷
  let towelN = 0;
  play.add({
    id: 'towel-cart',
    at: () => local(cart, [0.45, 0.95, 0]),
    radius: 1.1,
    stand: () => SPOTS.towels,
    pickLabel: '拿毛巾',
    canPickUp: () => stock() > 0,
    onPickUp: (p) => {
      cart?.userData.setStock?.(stock() - 1);
      const it = p.addItem({ id: `towel-${towelN++}`, name: '毛巾', obj: buildTowel(ctx), radius: 0.9 });
      p.give(it);
      stats();
    },
    // 拿着毛巾走近车：放回去
    accepts: (item) => item.id.startsWith('towel-') && stock() < 9,
    putLabel: '放回车上',
    onPutDown: (item) => {
      item.remove();
      cart?.userData.setStock?.(stock() + 1);
      stats();
    },
  });

  // 柜台台面：递毛巾（样板：放到台面那叠上）
  play.add({
    id: 'desk-handover',
    at: () => handover,
    radius: 1.0,
    stand: () => SPOTS.deskStand,
    priority: 1,
    accepts: (item, s) => item.id.startsWith('towel-') && s.x < COUNTER.east.x0,
    putLabel: '递毛巾',
    pickBusy: { pose: 'pickup', dur: 0.5 },
    onPutDown: (item, p) => {
      item.remove();
      const n = (counter?.userData.towels?.() as number | undefined) ?? 0;
      counter?.userData.setTowels?.(n + 1);
      if (member) p.say(member, '谢谢！', 1.6);
    },
  });
}
