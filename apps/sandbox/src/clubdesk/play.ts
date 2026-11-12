// clubdesk 的玩法接线（试点）：导航数据（能走 / 挡路 / 台阶，照 layout.ts 的 WALKABLE 说明）+ 几个样板互动点。
// 真正的活（排队、签到、递毛巾给会员、换水桶、扫沙）由 life.ts 通过同一个 play 登记（同 id 再 add = 替换样板）：
//   desk-serve     柜台转角：动作键"签到"（样板：按铃 + 会员头上冒对勾 + 计数）
//   towel-cart     毛巾车东头：拿/放键"拿毛巾"（车上少一卷，手里多一卷毛巾）
//   desk-handover  柜台台面：拿着毛巾时"递毛巾"（样板：放回台面那叠）
// 毛巾随手放在地上 → "拿起 毛巾"。
import * as THREE from 'three';
import { BERMS, WALKABLE as PARK_WALKABLE, STRIPS, WALL_OUT } from '../clubpark/layout';
import { footprint, type Play, type Rect, rampFromStairs, type Shape, stairCheeks } from '../clubsite/play';
import type { RegionJobs, RegionNav, RegionStart } from '../clubsite/region';
import {
  COURTS,
  fencePieces,
  GATE,
  GROUNDS,
  LOT_N,
  PATHS,
  PICKLE_DOORS,
  PICKLE_FENCE_H,
  PLAZA,
} from '../clubsite/world';
import type { AssetCtx } from './ctx';
import { CANOPY, CLIP, COUNTER, GATE_SPEC, HEAD_LINE_Z, PICKLE, SLOTS, SPOTS, STAIRS, WALL } from './layout';

/** 墙里面的脸（东墙中心 x 60、厚 0.7） */
const WALL_IN = GATE.x - WALL.t / 2;
/** 东边那条南北步道的西沿（x 33.6）：以东是这个场景的墙里，以西只有画出来的两条步道 */
const EAST_PATH_X0 = 33.6;
/**
 * 导航网格范围：西到这个场景画到的地方（CLIP.x0：长廊、草坪边那条小路一直画到那里），东到门外两片停车场的东沿；
 * 北到广场的北沿（喷泉铺地整个在里面；再往北的沙地这个场景没画北墙，clubwalk 里也不归这里），南到南围墙里面（东步道一直画到 z 51）。
 */
export const NAV_BOUNDS: Rect = { x0: CLIP.x0, x1: LOT_N.x1, z0: PLAZA.z0, z1: GROUNDS.z1 - 0.5 };
/** 东步道以西：地图的步道（PATHS）裁到 CLIP.x0…EAST_PATH_X0（长廊、两排球场之间那条），两边的球场不进 */
const WEST_PATHS: Rect[] = PATHS.map((p) => ({
  ...p,
  x0: Math.max(p.x0, CLIP.x0),
  x1: Math.min(p.x1, EAST_PATH_X0),
})).filter((p) => p.x1 - p.x0 > 0.05);

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

/**
 * 东墙里面那一面的壁柱（1.1 见方，中心在墙中线 x 60，比墙面多凸出 0.2）：同 terrain.ts 建东墙的算法
 * （大门两边各一段，每段 floor(长/12) 等分，离画的范围两头 0.6 米以内不放）
 */
function wallPiers(): Rect[] {
  const z0 = Math.max(CLIP.z0, GROUNDS.z0);
  const z1 = CLIP.z1 + 0.6;
  const out: Rect[] = [];
  for (const [a, b] of [
    [GROUNDS.z0, GATE.z0 - 0.8],
    [GATE.z1 + 0.8, GROUNDS.z1],
  ]) {
    const n = Math.floor((b - a) / 12);
    for (let i = 1; i < n; i++) {
      const pz = a + ((b - a) * i) / n;
      if (pz < z0 + 0.6 || pz > z1 - 0.6) continue;
      out.push({
        x0: GATE.x - WALL.pier / 2,
        x1: GATE.x + WALL.pier / 2,
        z0: pz - WALL.pier / 2,
        z1: pz + WALL.pier / 2,
      });
    }
  }
  return out;
}

/** 遮阳帆（clubsite/assets/shade-sail.ts:30、36）四根杆的脚（资产局部坐标，y 0）、杆的方截面边长 */
const SAIL_FEET: [number, number][] = [
  [-2.1, -1.5],
  [2.05, -1.55],
  [2.1, 1.45],
  [-2.05, 1.5],
];
const SAIL_POST = 0.36;

/**
 * 匹克球围场：四边围网按 PICKLE_DOORS 留口（西门 z 4.5…7.5、东围网北头的员工小门 z −2.0…−0.8；同 terrain.ts 的 fenceRect），
 * 两张网（terrain.ts 的 paintCourt：x = 场中心，长 6.1 + 0.6）；胶囊半径同 clubpickle 的 NAV（围网 0.14、网 0.18）。
 * 南边 z > PICKLE.z1 − 围网高 不让进：45° 俯视，人站在那里脚被 2.2 米的南围网挡住（同 clubpickle 的 SOUTH_HIDE_Z0）。
 */
function pickleShapes(): Shape[] {
  const out: Shape[] = [];
  const { x0, x1, z0, z1 } = PICKLE;
  const sides: { side: 'n' | 's' | 'w' | 'e'; alongX: boolean; at: number; a0: number; a1: number }[] = [
    { side: 'n', alongX: true, at: z0, a0: x0, a1: x1 },
    { side: 's', alongX: true, at: z1, a0: x0, a1: x1 },
    { side: 'w', alongX: false, at: x0, a0: z0, a1: z1 },
    { side: 'e', alongX: false, at: x1, a0: z0, a1: z1 },
  ];
  for (const f of sides) {
    const doors = PICKLE_DOORS.filter((d) => d.side === f.side);
    for (const [p, q] of fencePieces(f.a0, f.a1, doors))
      out.push(f.alongX ? { a: [p, f.at], b: [q, f.at], r: 0.14 } : { a: [f.at, p], b: [f.at, q], r: 0.14 });
  }
  for (const c of COURTS) if (c.kind === 'pickle') out.push({ a: [c.x, c.z - 3.35], b: [c.x, c.z + 3.35], r: 0.18 });
  out.push({ x0, x1, z0: z1 - PICKLE_FENCE_H, z1 });
  return out;
}

export interface DeskPlayEnv {
  /** 区域的根（独立页面 = scene）：按 slot:<id> 找摆件 */
  scene: THREE.Object3D;
  ctx: AssetCtx;
}

/** 独立页面的开局（main.ts 的 mountPlay） */
export const DESK_START: RegionStart = {
  start: SPOTS.deskStand,
  yaw: 1.25,
  camera: { lead: { portrait: 1.6, landscape: 0.6 } },
  hint: '拖动走路 · 点地面走过去',
};

/** 导航：能走 / 挡路（按摆好的家具量）/ 台阶；场景建好以后调 */
export function deskNav(scene: THREE.Object3D): RegionNav {
  const slot = (id: string) => scene.getObjectByName(`slot:${id}`) ?? null;

  // ── 挡路的 ──
  const blocked: Shape[] = [
    // 匹克球围场：围网留门、两张网（总监从前院走东北员工小门进场，从南北步道走西门）
    ...pickleShapes(),
    // 喷泉池（广场上，画外）
    { x: 44, z: -24, r: 4.6 },
    // 凉棚下帽子会被帆布挡住的那块（HEAD_LINE_Z 以北）：不让进
    { x0: CANOPY.x0, x1: CANOPY.x1, z0: CANOPY.z0, z1: HEAD_LINE_Z },
    // 柜台两段、凉棚南边西柱
    COUNTER.east,
    COUNTER.south,
    { x: 52.6, z: 9.0, r: 0.2 },
    // 东墙的壁柱
    ...wallPiers(),
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
  // 草坪遮阳帆的四根杆（帆在头顶上不挡）：杆脚 = clubsite/assets/shade-sail.ts 的 feet，杆粗 0.36，按 slot 的变换换到世界
  const sail = slot('sail-lawn');
  if (sail) {
    sail.updateMatrixWorld(true);
    const r = (SAIL_POST / 2) * Math.SQRT2 * sail.scale.x;
    for (const [fx, fz] of SAIL_FEET) {
      const w = sail.localToWorld(new THREE.Vector3(fx, 0, fz));
      blocked.push({ x: w.x, z: w.z, r });
    }
  }
  // 门外：clubpark 的花坛、种植带（同 clubpark/layout.ts 的 BLOCKED；岗亭不在这个场景里，不挡）
  for (const b of [...BERMS, ...STRIPS]) blocked.push(b.r);
  // 台阶两侧的挡路条（同 clubplaza 的 PLAZA-7）：台阶两侧的地面 = 台阶低的那头（广场两段是地面 0，下草坪那段是草坪 −0.5）
  const ramps = STAIRS.map(rampFromStairs);
  for (const r of ramps) blocked.push(...stairCheeks(r, Math.min(r.from, r.to)));
  return {
    bounds: NAV_BOUNDS,
    walkable: [
      // 墙里（广场、草坪的高差由 groundAt 给，崖壁 > 0.3 米挡住，走台阶）
      { x0: EAST_PATH_X0, x1: WALL_IN, z0: NAV_BOUNDS.z0, z1: NAV_BOUNDS.z1 },
      // 广场一直到西沿挡土墙（x 32）
      { x0: PLAZA.x0, x1: PLAZA.x1, z0: PLAZA.z0, z1: PLAZA.z1 },
      // 往西出画的两条步道
      ...WEST_PATHS,
      // 门洞（接上 clubpark 的落客区）
      { x0: WALL_IN - 0.5, x1: WALL_OUT + 0.4, z0: GATE.z0 + 0.05, z1: GATE.z1 - 0.05 },
      // 门外：同 clubpark 的 WALKABLE（落客区、车道西段、墙边步道、两片停车场的通道、进出口）
      ...PARK_WALKABLE,
    ],
    blocked,
    ramps,
  };
}

/** 总监的活登记到 play：站着的人挡路、样板互动点（life.attachPlay 用同 id 替换） */
export function attachDeskJobs(play: Play, env: DeskPlayEnv): RegionJobs {
  const { scene, ctx } = env;
  const slot = (id: string) => scene.getObjectByName(`slot:${id}`) ?? null;
  // 站着的人当挡路圆（life 接管这些人以后照样跟着他们走：按世界位置算）
  for (const s of SLOTS) {
    if (s.asset !== 'player') continue;
    const o = slot(s.id);
    if (o) play.blockPerson(o, 0.28);
  }

  addDemos(play, scene, ctx);
  return { step: () => {} };
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
function addDemos(play: Play, scene: THREE.Object3D, ctx: AssetCtx) {
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
