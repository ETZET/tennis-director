// 市政厅的店内（第二版风格：参考 Sneaky Sasquatch 的办事处，镜头近、人大、东西少而大；2026-11-18）。这个文件归市政厅的店内代理。
// 局部坐标 x 0…16（西 → 东）、z 0…12（北 → 南），南墙正中是门（x 6.5…9.5）；框架（interiors/index.ts）画地板底、墙、门。
// 共用件：./kit（价签 priceTag、"…"气泡 talkBubble）；资产在 assets/in2/cityhall.ts。
// **店里零字**（2026-11-18 第二轮，用户："让布局和画面自己说话，不靠字"）：只有数字（叫号屏、取号机、价签）、图标（窗口牌、城徽）。
//
// 平时 = 办事大厅（进门第一眼，北墙整面）：三个窗口一字排开，每个窗口后面站一个办事员（头顶"…"），柜台正面挂价签；
// 窗口办什么看台面上的东西 + 墙上的图标牌：西 = 办赛许可（彩色表格、红柄印章、网球奖杯 / 奖杯图标）、
// 中 = 扩建审批（三卷蓝图、房子模型 / 房子图标）、东 = 书记处（文件柜、档案盒、信封 / 信封图标）。
// 中间窗口上方一块红字叫号屏（只有号 07），窗口前两排铜柱红绳 = 排队道；门东边取号机（白牌上一个大红向下箭头指着出票口、顶上红字屏）；
// 东边两排芥末黄等候椅（坐着两个人）；西边一块大公告栏（彩色告示）。地是安静的灰石。
// ?event=hearing = 听证会那天：窗口卷帘拉下来；北边高一级的委员台（三位委员、主席面前一把法槌、台前城徽）+ 两面旗；
// 正中一个讲台面朝委员；下面三排椅子全朝着讲台和委员台坐满街坊（背对镜头）；公告栏多一张大红通知（无字）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CastLook } from '../../../clubsite/cast/types';
import { player } from '../../../clubsite/people';
import { createDresser } from '../../../clubsite/people/dress';
import type { BaseCtx } from '../../../clubsite/render/ctx';
import type { ToonOpts } from '../../../clubsite/render/toon';
import { ASSETS as IN2 } from '../../assets/in2/cityhall';
import type { AssetCtx } from '../../ctx';
import type { PalKey } from '../../palette';
import type { InteriorCtx, InteriorDef } from '../index';
import { priceTag, talkBubble } from './kit';

const W = 16;
const D = 12;
/** 听证会那天（?event=hearing） */
const HEARING = typeof location !== 'undefined' && new URLSearchParams(location.search).get('event') === 'hearing';

/** 三个窗口的中心 x（北墙脚 z 0；柜台前沿 z 2.2） */
const WIN = [3.6, 8, 12.4];

/** 摆一件：资产 id、局部坐标、绕 y 转（0 = 正面朝南）、变体、挡路 [宽 x, 深 z]、离地高 */
interface Place {
  id: string;
  x: number;
  z: number;
  rot?: number;
  v?: number;
  block?: [number, number];
  /** 挡路框的中心（不给 = 摆放点） */
  bz?: number;
  y?: number;
}

const PLACES: Place[] = [
  { id: 'in2-cityhall-floor', x: W / 2, z: 0 },
  { id: 'in2-cityhall-north-wall', x: W / 2, z: 0 },
  // 三个窗口（隔板 + 柜台，挡路到柜台前沿 z 2.2）
  ...WIN.map(
    (x, i) => ({ id: 'in2-cityhall-window', x, z: 0, v: HEARING ? 10 + i : i, block: [3.4, 2.2], bz: 1.1 }) as Place,
  ),
  // 取号机（门东边）
  { id: 'in2-cityhall-ticket', x: 10.9, z: 9.6, block: [0.7, 0.5] },
  // 公告栏（西边，朝南）
  { id: 'in2-cityhall-notice', x: 2.6, z: 6.4, v: HEARING ? 1 : 0, block: [3.4, 0.4] },
  // 盆栽：西北角、东北角、门两边
  { id: 'in2-cityhall-plant', x: 0.8, z: 0.8, block: [0.7, 0.7] },
  { id: 'in2-cityhall-plant', x: 15.2, z: 0.8, block: [0.7, 0.7] },
  { id: 'in2-cityhall-plant', x: 5.6, z: 11.2, block: [0.7, 0.7] },
];
const PLACES_DAY: Place[] = [
  // 叫号屏（中间窗口的图标牌再往上，只有号）
  { id: 'in2-cityhall-serving', x: 8, z: 0, y: 3.55 },
  // 中间窗口前一条铜柱红绳的排队道（两排，沿南北）：排队 = 隔离柱 + 柜台前留的空地
  { id: 'in2-cityhall-stanchions', x: 6.95, z: 3.75, rot: Math.PI / 2, block: [0.25, 2.2] },
  { id: 'in2-cityhall-stanchions', x: 9.05, z: 3.75, rot: Math.PI / 2, block: [0.25, 2.2] },
  // 等候椅：东边两排（面朝北看叫号屏）
  { id: 'in2-cityhall-chairs', x: 13.4, z: 6.2, rot: Math.PI, v: 4, block: [2.8, 0.6] },
  { id: 'in2-cityhall-chairs', x: 13.4, z: 7.8, rot: Math.PI, v: 4, block: [2.8, 0.6] },
  { id: 'in2-cityhall-chairs', x: 13.4, z: 9.4, rot: Math.PI, v: 4, block: [2.8, 0.6] },
];
const PLACES_HEARING: Place[] = [
  // 委员长桌（正面 z 4.0）+ 两面旗 + 讲台（面朝北）
  { id: 'in2-cityhall-dais', x: 8, z: 4.0, block: [7.2, 2.2], bz: 3.1 },
  { id: 'in2-cityhall-flag', x: 3.9, z: 2.6, v: 0, block: [0.5, 0.5] },
  { id: 'in2-cityhall-flag', x: 12.1, z: 2.6, v: 1, block: [0.5, 0.5] },
  { id: 'in2-cityhall-podium', x: 8, z: 5.4, rot: Math.PI, block: [0.9, 0.6] },
  // 三排椅子（中间留 2.4 米的过道对着门）
  ...[7.0, 8.2, 9.4].flatMap((z) => [
    { id: 'in2-cityhall-chairs', x: 4.9, z, rot: Math.PI, v: 5, block: [3.4, 0.6] } as Place,
    { id: 'in2-cityhall-chairs', x: 11.1, z, rot: Math.PI, v: 5, block: [3.4, 0.6] } as Place,
  ]),
];

/** 互动锚点（局部坐标）：at = 人站 / 坐的地方，face = 朝向（0 = 朝南，π = 朝北），who，note */
export const SPOTS = {
  door: { at: [W / 2, D - 1.2], face: Math.PI, who: 'director', note: '门里（进门站的地方）；出门在门外地垫上' },
  ticket: { at: [10.9, 10.4], face: Math.PI, who: 'director', note: '取号机前：按一下拿号（排队花总监的时间）' },
  permitWindow: {
    at: [WIN[0], 2.9],
    face: Math.PI,
    who: 'director',
    note: '1 号窗口 PERMITS：申请办赛许可（$50，批下来附条件）',
  },
  buildingWindow: {
    at: [WIN[1], 2.9],
    face: Math.PI,
    who: 'director',
    note: '2 号窗口 BUILDING：扩建审批（$500；以后盖酒店也过这关）',
  },
  clerkWindow: {
    at: [WIN[2], 2.9],
    face: Math.PI,
    who: 'director',
    note: '3 号窗口 CLERK：夜灯投诉的答复、听证会报名（表格 $5）',
  },
  clerk1: { at: [WIN[0], 0.9], face: 0, who: 'npc', note: '1 号窗口的办事员（站着，头顶"…"）' },
  clerk2: { at: [WIN[1], 0.9], face: 0, who: 'npc', note: '2 号窗口的办事员' },
  clerk3: { at: [WIN[2], 0.9], face: 0, who: 'npc', note: '3 号窗口的书记员' },
  board: {
    at: [2.6, 7.3],
    face: Math.PI,
    who: 'director',
    note: '公告栏前：听证会通知、批文的附带条件、居民投诉信 —— 事件卡从这儿来',
  },
  waiting: { at: [13.4, 6.2], face: Math.PI, who: 'director', note: '等候椅（叫到号之前坐着；时间在走）' },
  podium: { at: [8, 5.95], face: Math.PI, who: 'director', note: '听证会：上讲台答辩（面朝委员）' },
  dais: { at: [8, 2.4], face: 0, who: 'npc', note: '听证会：三位委员坐在长桌后（中间是主席，头顶"…"）' },
  audience: { at: [4.9, 8.2], face: Math.PI, who: 'npc', note: '听证会：街坊坐满三排（投诉的邻居、支持的会员）' },
} as const;

/** 挂了价签的（局部坐标，y = 价签底边高）：三个窗口的表格费 / 许可费 */
export const ITEMS = [
  { id: 'event-permit', name: '办赛许可', price: 50, x: WIN[0], z: 2.22, y: 0.4 },
  { id: 'expansion-review', name: '扩建审批', price: 500, x: WIN[1], z: 2.22, y: 0.4 },
  { id: 'clerk-form', name: '投诉答复 / 听证报名表', price: 5, x: WIN[2], z: 2.22, y: 0.4 },
] as const;

const look = (o: Partial<CastLook>): CastLook => ({
  body: 'adult',
  skin: 'light',
  hair: 'brown',
  hairStyle: 'short',
  shirt: 'white',
  bottom: 'charcoal',
  bottomKind: 'pants',
  shoes: 'black',
  ...o,
});
/** 店里的人：位置、朝向、座面高（null = 站着）、头顶有没有"…"、长相 */
type Npc = { at: [number, number]; face: number; seat: number | null; talk: boolean; look: CastLook };
const CLERKS: Npc[] = [
  {
    at: [WIN[0], 0.95],
    face: 0,
    seat: null,
    talk: true,
    look: look({
      skin: 'tan',
      hair: 'black',
      hairStyle: 'bun',
      shirt: 'teal',
      bottom: 'navy',
      bottomKind: 'skirt',
      eyes: 'glasses',
    }),
  },
  {
    at: [WIN[1], 0.95],
    face: 0,
    seat: null,
    talk: true,
    look: look({
      hair: 'gray',
      hairStyle: 'bald',
      shirt: 'sky',
      longSleeves: true,
      stout: 1.15,
      facial: 'mustache',
      eyes: 'glasses',
    }),
  },
  {
    at: [WIN[2], 0.95],
    face: 0,
    seat: null,
    talk: true,
    look: look({ skin: 'brown', hair: 'black', hairStyle: 'curly', shirt: 'lavender', bottom: 'khaki' }),
  },
];
const PEOPLE_DAY: Npc[] = [
  // 1 号窗口前办事的人（背对镜头）
  {
    at: [WIN[0] - 0.2, 2.75],
    face: Math.PI,
    seat: null,
    talk: false,
    look: look({
      skin: 'light',
      hair: 'blonde',
      hairStyle: 'ponytail',
      shirt: 'coral',
      bottom: 'blue',
      shoes: 'white',
    }),
  },
  // 等候椅上两个人（面朝北 → 背对镜头）
  {
    at: [12.41, 6.2],
    face: Math.PI,
    seat: 0.48,
    talk: false,
    look: look({ skin: 'olive', hair: 'darkBrown', shirt: 'green', bottom: 'khaki' }),
  },
  {
    at: [14.39, 7.8],
    face: Math.PI,
    seat: 0.48,
    talk: false,
    look: look({ skin: 'pale', hair: 'white', hairStyle: 'bob', shirt: 'pink', bottom: 'gray', bottomKind: 'skirt' }),
  },
  // 第三排一个带着孩子的（大人 + 孩子并排）
  {
    at: [13.07, 9.4],
    face: Math.PI,
    seat: 0.48,
    talk: false,
    look: look({ skin: 'tan', hair: 'auburn', hairStyle: 'long', shirt: 'teal', bottom: 'blue', bottomKind: 'skirt' }),
  },
  // 公告栏前看告示的
  {
    at: [3.3, 7.4],
    face: Math.PI - 0.3,
    seat: null,
    talk: false,
    look: look({
      skin: 'deep',
      hair: 'black',
      hairStyle: 'buzz',
      shirt: 'orange',
      bottom: 'navy',
      hat: { kind: 'cap', color: 'navy' },
    }),
  },
];
const SHIRTS = [
  'red',
  'teal',
  'yellow',
  'blue',
  'purple',
  'white',
  'green',
  'coral',
  'sky',
  'orange',
  'lime',
  'pink',
] as const;
const SKINS = ['pale', 'light', 'tan', 'olive', 'brown', 'deep'] as const;
const HAIRS = ['black', 'darkBrown', 'brown', 'auburn', 'blonde', 'gray', 'white'] as const;
const STYLES = ['short', 'ponytail', 'bun', 'bob', 'curly', 'buzz', 'long'] as const;

export const INTERIOR_CITYHALL: InteriorDef = {
  id: 'cityhall',
  name: '市政厅',
  w: W,
  d: D,
  floor: 'tile',
  wall: 'civicSand',
  poi: 'p_cityhall',
  zoom: 0.45,
  talk: HEARING
    ? [
        { x: 8, z: 6.0, r: 1.4, label: '上台答辩', line: '（站上讲台）主席：俱乐部的夜灯被投诉了，你有三分钟。' },
        { x: 8, z: 4.6, r: 1.6, label: '和主席说', line: '主席：听证会散了再来 3 号窗口拿决定书 —— 批了也有条件。' },
        { x: 2.6, z: 7.3, r: 1.6, label: '看告示', line: '今晚 7 点公开听证：网球俱乐部夜间照明扰民投诉。' },
      ]
    : [
        { x: 10.9, z: 10.4, r: 1.4, label: '取号', line: '（取了一张号）07 号 —— 前面还有三个人。' },
        {
          x: WIN[0],
          z: 2.9,
          r: 1.5,
          label: '办赛许可',
          line: '办事员：办一场比赛，表格费 $50。批下来要附条件：22 点前关灯。',
        },
        {
          x: WIN[1],
          z: 2.9,
          r: 1.5,
          label: '扩建审批',
          line: '办事员：扩建要审图，$500，等两周。以后盖酒店也是这个窗口。',
        },
        {
          x: WIN[2],
          z: 2.9,
          r: 1.5,
          label: '书记处',
          line: '书记员：有邻居投诉你们的夜灯。要申辩就报名下周的听证会。',
        },
        { x: 2.6, z: 7.3, r: 1.6, label: '看告示', line: '公告：夜间照明须于 22:00 前关闭。新球场开工须先领许可。' },
      ],
  build(c) {
    const actx = sharedMats(c.actx);
    const objs: THREE.Object3D[] = [];
    for (const p of [...PLACES, ...(HEARING ? PLACES_HEARING : PLACES_DAY)]) {
      const f = IN2[p.id];
      if (!f) throw new Error(`interiors/v2/cityhall：没有资产 ${p.id}`);
      const rot = p.rot ?? 0;
      const obj = f({ ...actx, variant: p.v ?? 0 });
      obj.position.set(p.x, p.y ?? 0, p.z);
      obj.rotation.y = rot;
      objs.push(obj);
      if (p.block) {
        const [sw, sd] = p.block;
        const bz = p.bz ?? p.z;
        c.block({ x0: p.x - sw / 2, x1: p.x + sw / 2, z0: bz - sd / 2, z1: bz + sd / 2 });
      }
    }

    // ── 共用件（kit）：价签（只有金币 + 数字）、对话气泡。店里零字（2026-11-18 第二轮：用户"让布局和画面自己说话"）──
    const kit: THREE.Object3D[] = [];
    const put = (o: THREE.Object3D, x: number, y: number, z: number) => {
      o.position.set(x, y, z);
      kit.push(o);
    };
    if (!HEARING) for (const it of ITEMS) put(priceTag(c.actx, it.price), it.x, it.y, it.z);

    // ── 人：骨骼人摆好定格姿势，连同家具一起按材质烘成静态网格（一屏绘制少）──
    const dresser = createDresser({ mats: c.actx.mats as Parameters<typeof createDresser>[0]['mats'], scheme: null });
    const bubbles: [number, number, number][] = [];
    const add = (n: Npc) => {
      const o = player({ ...c.actx, variant: 0 } as unknown as BaseCtx);
      dresser.dress(o, n.look);
      const ud = o.userData;
      ud.setProp?.(null);
      if (n.seat === null) {
        ud.setSeat?.(null);
        ud.pose?.('idle', 0.3);
      } else {
        ud.setSeat?.(n.seat);
        ud.pose?.('sit', 0.25);
      }
      o.position.set(n.at[0], 0, n.at[1]);
      o.rotation.y = n.face;
      objs.push(o);
      if (n.talk) bubbles.push([n.at[0], n.seat === null ? 2.05 : 1.95, n.at[1]]);
    };
    if (!HEARING) for (const n of [...CLERKS, ...PEOPLE_DAY]) add(n);
    else {
      // 委员三位（坐在长桌后，主席在中间有"…"）；讲台空着（总监上去答辩）；三排椅子坐满（随机空几个位子）
      const rnd = c.rng('hearing');
      for (const [i, x] of [5.8, 8, 10.2].entries())
        add({
          at: [x, 2.45],
          face: 0,
          seat: 0.68,
          talk: i === 1,
          look: look({
            skin: SKINS[i * 2],
            hair: HAIRS[i + 4],
            hairStyle: i === 1 ? 'bald' : 'short',
            shirt: 'navy',
            longSleeves: true,
            eyes: i === 1 ? 'glasses' : undefined,
          }),
        });
      for (const z of [7.0, 8.2, 9.4])
        for (const x0 of [4.9, 11.1])
          for (let i = 0; i < 5; i++) {
            if (rnd() < 0.18) continue;
            const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length) % a.length];
            add({
              at: [x0 + (i - 2) * 0.66, z],
              face: Math.PI,
              seat: 0.48,
              talk: false,
              look: look({
                skin: pick(SKINS),
                hair: pick(HAIRS),
                hairStyle: pick(STYLES),
                shirt: pick(SHIRTS),
                bottom: pick(['navy', 'khaki', 'blue', 'charcoal', 'gray'] as const),
                hat: rnd() < 0.2 ? { kind: 'straw', color: 'tan' } : undefined,
              }),
            });
          }
    }
    for (const [x, y, z] of bubbles) put(talkBubble(c.actx), x, y, z);
    bake(c, objs);
    for (const o of kit) c.asset(o);
  },
};

/** 资产上下文的材质按（键, 参数）缓存：同样的材质只建一份（整间屋才能按材质合并成几十个网格） */
function sharedMats(base: AssetCtx): AssetCtx {
  const cache = new Map<string, ReturnType<AssetCtx['mat']>>();
  return {
    ...base,
    mat(key: PalKey, extra?: ToonOpts) {
      const k = `${key}|${JSON.stringify(extra ?? null)}`;
      let m = cache.get(k);
      if (!m) {
        m = base.mat(key, extra);
        cache.set(k, m);
      }
      return m;
    },
  };
}

/**
 * 整间屋（家具 + 摆好姿势的人）按材质烘成静态网格（局部坐标），一个组交给 c.asset。
 * 看不见的部件（收起来的球拍）不要；店里没有投影。
 */
function bake(c: InteriorCtx, objs: THREE.Object3D[]) {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
  for (const obj of objs) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material) || !shown(m)) return;
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
      g.morphAttributes = {};
      by.set(m.material, [...(by.get(m.material) ?? []), g.index ? g.toNonIndexed() : g]);
    });
  }
  const room = new THREE.Group();
  room.name = 'valley:interior:cityhall';
  for (const [mat, geos] of by) {
    const g = mergeGeometries(geos);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = false;
    mesh.userData.noCast = true;
    room.add(mesh);
  }
  c.asset(room);
}
