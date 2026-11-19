// 餐馆的店内（第二版风格；2026-11-18 第二轮：用户"让布局和画面自己说话，不靠字"）。这个文件归餐馆的店内代理。
// 局部坐标 x 0…10.4（西 → 东）、z 0…10.5（北 → 南），南墙正中是门（x 3.7…6.7）；框架（interiors/index.ts）画地板底、墙、门。
// 共用件：./kit（价签 priceTag、"…"气泡 talkBubble）；资产在 assets/in2/diner.ts。**店里没有一个字**（只有价签的数字、钟面）。
//
// 布局（照 Sneaky Sasquatch 的餐馆，参考图只看）：
// - 北墙 = 开放的后厨（员工那边）：一排不锈钢台 —— 咖啡机两壶咖啡、煎板上三块肉饼、炸锅两篮薯条、冰箱；煎板上方抽油烟罩，
//   厨师背对我们在煎板前；墙上菜单板（图标 + 看不清的线 + 价签数字）、霓虹咖啡杯、钟。地是深一点的灰方砖。
// - 一条横贯的吧台把员工 / 客人两边分开：青色前脸、奶白台面，台上番茄酱 / 芥末、派罩、收银机、两个出菜铃、客人的咖啡和汉堡；
//   服务员在台后收银机旁（"…" = 点单）；台前一排 7 张红面吧台凳，坐着 3 个客人。
// - 客人那边：米白 / 浅灰大格的地，东西两墙各两个红卡座；门口到吧台中间一大片空地（走到每张桌子前）。
// - **找人**：4 个能聊的人都坐在卡座北长椅上、脸朝门口，头顶"…"；是谁看手边的东西 ——
//   西一 场地工：工作帽 + 卡其工装，卡座边靠着一把场地耙，桌上一卷白的场地线；
//   西二 妈妈：桌上一筒网球，长椅上一个小号紫色球拍包（她知道公园里那个孩子）；
//   东一 教练：白 Polo + 遮阳帽 + 脖子上的哨子，桌上一块画着半块球场的夹板；
//   东二 记者：渔夫帽 + 眼镜，桌上相机 + 摊开的笔记本 + 铅笔。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CastLook } from '../../../clubsite/cast/types';
import { coach, player } from '../../../clubsite/people';
import { createDresser } from '../../../clubsite/people/dress';
import type { BaseCtx } from '../../../clubsite/render/ctx';
import type { ToonOpts } from '../../../clubsite/render/toon';
import { MENU_ITEMS, ROOM, ASSETS as V2 } from '../../assets/in2/diner';
import type { AssetCtx } from '../../ctx';
import type { PalKey } from '../../palette';
import type { InteriorCtx, InteriorDef } from '../index';
import { priceTag, talkBubble } from './kit';

const W = ROOM.W;
const D = ROOM.D;
/** 菜单板（北墙西段，咖啡机上方）：中心 x、板底高 */
const MENU_X = 1.6;
const MENU_Y = 2.55;
/** 吧台凳的 x（7 张）、z */
const STOOL_X = [1.9, 2.95, 4.0, 5.05, 6.1, 7.15, 8.2];
const STOOL_Z = ROOM.CZ + 0.5;
/** 卡座：桌子中心（西墙两个、东墙两个） */
const BOOTH_Z = [5.6, 7.95];
const BOOTH_XW = 0.72;
const BOOTH_XE = W - 0.72;
/** 北长椅上的人（脸朝南） */
const SEAT_N = (z: number) => z - 0.68;
/** 和卡座的人说话时总监站的 x（过道里、桌子那头）；收银机前点单的地方（两张凳子中间） */
const TALK_XW = 2.1;
const TALK_XE = W - 2.1;
const ORDER_AT: [number, number] = [6.62, STOOL_Z + 0.4];

/** 摆一件：资产 id、局部坐标、绕 y 转（0 = 正面朝南）、变体、挡路的尺寸 [宽 x, 深 z]（不给 = 不挡）、离地高 */
interface Place {
  id: string;
  x: number;
  z: number;
  rot?: number;
  v?: number;
  block?: [number, number];
  y?: number;
}

const PLACES: Place[] = [
  { id: 'in2-diner-floor', x: W / 2, z: 0 },
  { id: 'in2-diner-back', x: W / 2, z: 0 },
  { id: 'in2-diner-menu', x: MENU_X, z: 0.05, y: MENU_Y },
  { id: 'in2-diner-neon', x: 7.05, z: 0.05, y: 2.55 },
  { id: 'in2-diner-clock', x: 9.55, z: 0.04, y: 3.3 },
  { id: 'in2-diner-counter', x: (ROOM.CX0 + ROOM.CX1) / 2, z: ROOM.CZ },
  ...STOOL_X.map((x) => ({ id: 'in2-diner-stool', x, z: STOOL_Z })),
  { id: 'in2-diner-jukebox', x: 9.75, z: 3.3 },
  // 卡座：西墙的贴墙那头本来就在 −x；东墙转 π。变体 = 谁坐这儿（0 场地工、1 妈妈、2 教练、3 记者）
  { id: 'in2-diner-booth', x: BOOTH_XW, z: BOOTH_Z[0], v: 0, block: [1.5, 2.2] },
  { id: 'in2-diner-booth', x: BOOTH_XW, z: BOOTH_Z[1], v: 1, block: [1.5, 2.2] },
  { id: 'in2-diner-booth', x: BOOTH_XE, z: BOOTH_Z[0], v: 2, rot: Math.PI, block: [1.5, 2.2] },
  { id: 'in2-diner-booth', x: BOOTH_XE, z: BOOTH_Z[1], v: 3, rot: Math.PI, block: [1.5, 2.2] },
  // 场地工的耙：靠在西一卡座北靠背的过道那头
  { id: 'in2-diner-rake', x: 1.62, z: BOOTH_Z[0] - 0.95, block: [0.3, 0.3] },
  { id: 'in2-diner-plant', x: 3.3, z: 10.0, block: [0.6, 0.6] },
  { id: 'in2-diner-plant', x: 7.1, z: 10.0, block: [0.6, 0.6] },
];

/** 带价签的东西：菜单板上的四样（局部坐标，y = 价签中心高）。走过去点 = 买 */
const TAG_DX = 0.95;
export const ITEMS = MENU_ITEMS.map((it) => ({
  id: it.id,
  name: it.name,
  price: it.price,
  x: MENU_X + it.dx + TAG_DX,
  z: 0.12,
  y: MENU_Y + it.dy - 0.03 + 0.155,
}));

/** 店里的人：位置（局部）、朝向（0 = 脸朝南）、座面高（null = 站着）、能不能聊、长相；kind coach = 带哨子的教练骨骼 */
interface Npc {
  id: string;
  at: [number, number];
  face: number;
  seat: [number, number] | null;
  talk: boolean;
  kind?: 'coach';
  look: CastLook;
}
const NPCS: Npc[] = [
  {
    // 厨师：白衣白帽、小胡子，背对我们站在煎板前
    id: 'cook',
    at: [4.4, 1.15],
    face: Math.PI,
    seat: null,
    talk: false,
    look: {
      body: 'adult',
      stout: 1.15,
      skin: 'olive',
      hair: 'black',
      hairStyle: 'short',
      hat: { kind: 'cap', color: 'white' },
      shirt: 'white',
      bottom: 'charcoal',
      bottomKind: 'pants',
      shoes: 'black',
    },
  },
  {
    // 服务员（吧台后、收银机旁）：珊瑚色制服 + 白领、发髻 —— "…" = 点单
    id: 'waitress',
    at: [7.3, 2.45],
    face: 0,
    seat: null,
    talk: true,
    look: {
      body: 'adult',
      skin: 'light',
      hair: 'red',
      hairStyle: 'bun',
      shirt: 'coral',
      trim: 'white',
      bottom: 'coral',
      bottomKind: 'skirt',
      shoes: 'white',
    },
  },
  {
    // 退休的场地工（西一北长椅）：绿色工作帽、卡其长袖工装、海军蓝工装裤、灰发小胡子
    id: 'groundsman',
    at: [BOOTH_XW + 0.05, SEAT_N(BOOTH_Z[0])],
    face: 0,
    seat: [0.46, 0],
    talk: true,
    look: {
      body: 'adult',
      stout: 1.15,
      skin: 'tan',
      hair: 'gray',
      hairStyle: 'short',
      hat: { kind: 'cap', color: 'green' },
      shirt: 'khaki',
      longSleeves: true,
      bottom: 'navy',
      bottomKind: 'pants',
      shoes: 'brown',
      facial: 'mustache',
    },
  },
  {
    // 场地工的老伙计（西一南长椅，背朝镜头）
    id: 'buddy',
    at: [BOOTH_XW + 0.05, BOOTH_Z[0] + 0.68],
    face: Math.PI,
    seat: [0.46, 0],
    talk: false,
    look: {
      body: 'adult',
      skin: 'light',
      hair: 'white',
      hairStyle: 'bald',
      shirt: 'sky',
      bottom: 'navy',
      bottomKind: 'pants',
      shoes: 'black',
    },
  },
  {
    // 妈妈（西二北长椅）：知道公园里那个对墙打球的孩子
    id: 'mom',
    at: [BOOTH_XW + 0.1, SEAT_N(BOOTH_Z[1])],
    face: 0,
    seat: [0.46, 0],
    talk: true,
    look: {
      body: 'adult',
      skin: 'brown',
      hair: 'black',
      hairStyle: 'long',
      shirt: 'yellow',
      bottom: 'blue',
      bottomKind: 'pants',
      shoes: 'white',
    },
  },
  {
    // 失业的教练（东一北长椅）：白 Polo 海军蓝滚边、遮阳帽、墨镜，脖子上挂着哨子（教练骨骼的哨子留着）
    id: 'coach',
    at: [BOOTH_XE - 0.05, SEAT_N(BOOTH_Z[0])],
    face: 0,
    seat: [0.46, 0],
    talk: true,
    kind: 'coach',
    look: {
      body: 'adult',
      skin: 'light',
      hair: 'blonde',
      hairStyle: 'short',
      hat: { kind: 'visor', color: 'navy' },
      shirt: 'white',
      trim: 'navy',
      bottom: 'navy',
      bottomKind: 'shorts',
      shoes: 'white',
      eyes: 'shades',
      keep: ['whistle'],
    },
  },
  {
    // 报社的记者（东二北长椅）：渔夫帽、眼镜、天蓝长袖衬衫
    id: 'reporter',
    at: [BOOTH_XE - 0.05, SEAT_N(BOOTH_Z[1])],
    face: 0,
    seat: [0.46, 0],
    talk: true,
    look: {
      body: 'adult',
      skin: 'light',
      hair: 'brown',
      hairStyle: 'short',
      hat: { kind: 'bucket', color: 'tan' },
      shirt: 'sky',
      longSleeves: true,
      bottom: 'khaki',
      bottomKind: 'pants',
      shoes: 'brown',
      eyes: 'glasses',
    },
  },
  {
    id: 'stool2',
    at: [STOOL_X[1], STOOL_Z],
    face: Math.PI,
    seat: [0.78, 0.3],
    talk: false,
    look: {
      body: 'adult',
      skin: 'deep',
      hair: 'black',
      hairStyle: 'curly',
      shirt: 'purple',
      bottom: 'charcoal',
      bottomKind: 'pants',
      shoes: 'black',
    },
  },
  {
    id: 'stool4',
    at: [STOOL_X[3], STOOL_Z],
    face: Math.PI,
    seat: [0.78, 0.3],
    talk: false,
    look: {
      body: 'adult',
      skin: 'tan',
      hair: 'darkBrown',
      hairStyle: 'ponytail',
      shirt: 'lavender',
      bottom: 'blue',
      bottomKind: 'pants',
      shoes: 'white',
    },
  },
  {
    id: 'stool6',
    at: [STOOL_X[5], STOOL_Z],
    face: Math.PI,
    seat: [0.78, 0.3],
    talk: false,
    look: {
      body: 'adult',
      stout: 1.2,
      skin: 'pale',
      hair: 'auburn',
      hairStyle: 'buzz',
      hat: { kind: 'cap', color: 'red' },
      shirt: 'charcoal',
      bottom: 'blue',
      bottomKind: 'pants',
      shoes: 'brown',
    },
  },
];

/** 能聊的（talk）：站的地方是过道里、那张桌子前面（局部坐标） */
const TALK: NonNullable<InteriorDef['talk']> = [
  {
    x: TALK_XW,
    z: BOOTH_Z[0] - 0.2,
    r: 1.2,
    label: '聊聊',
    line: '红土场我扫了三十年，退休了手还痒。听说你们俱乐部缺人？',
  },
  {
    x: TALK_XW,
    z: BOOTH_Z[1] - 0.2,
    r: 1.2,
    label: '聊聊',
    line: '东边日出公园，每天傍晚有个孩子对着墙打球，打得可好了，就是没人教。',
  },
  {
    x: TALK_XE,
    z: BOOTH_Z[0] - 0.2,
    r: 1.2,
    label: '聊聊',
    line: '老球拍俱乐部关门以后我就闲着。十年的学员，一个都没忘。你那儿要是缺教练……',
  },
  {
    x: TALK_XE,
    z: BOOTH_Z[1] - 0.2,
    r: 1.2,
    label: '聊聊',
    line: '《沙漠太阳报》体育版。俱乐部有新闻，来这儿找我，我天天在这儿吃早饭。',
  },
  {
    x: ORDER_AT[0],
    z: ORDER_AT[1],
    r: 0.9,
    label: '点单',
    line: '咖啡一块随便续，派三块，汉堡四块，奶昔两块。要点什么？',
  },
];

/**
 * 互动锚点（局部坐标）：at = 人站 / 坐的地方，face = 朝向（0 = 朝南），who = npc / director / prop，note = 说明
 */
export const SPOTS = {
  door: { at: [W / 2, D - 1.2], face: Math.PI, who: 'director', note: '门里（进门站的地方）；出门在门外地垫上' },
  menu: {
    at: [MENU_X + 0.6, STOOL_Z + 0.5],
    face: Math.PI,
    who: 'director',
    note: '吧台西头前面看北墙的菜单板：四样各一个价签（只有数字），点 = 买',
  },
  order: {
    at: ORDER_AT,
    face: Math.PI,
    who: 'director',
    note: '收银机前两张凳子中间（点单 / 结账），服务员在台后，头顶"…"',
  },
  kitchen: { at: [4.4, 1.15], face: Math.PI, who: 'npc', note: '后厨：厨师在煎板前（肉饼、薯条、咖啡都在北墙一排）' },
  groundsman: {
    at: [TALK_XW, BOOTH_Z[0] - 0.2],
    face: -Math.PI / 2,
    who: 'director',
    note: '西一卡座前：退休的场地工（工作帽、耙子、一卷场地线）→ 招场地工',
  },
  mom: {
    at: [TALK_XW, BOOTH_Z[1] - 0.2],
    face: -Math.PI / 2,
    who: 'director',
    note: '西二卡座前：妈妈（球拍包、一筒球）说公园里那个孩子 → 天才少年的线索',
  },
  coach: {
    at: [TALK_XE, BOOTH_Z[0] - 0.2],
    face: Math.PI / 2,
    who: 'director',
    note: '东一卡座前：失业的教练（哨子、夹板）→ 招教练',
  },
  reporter: {
    at: [TALK_XE, BOOTH_Z[1] - 0.2],
    face: Math.PI / 2,
    who: 'director',
    note: '东二卡座前：报社的记者（相机、笔记本）→ 上报',
  },
  jukebox: { at: [9.75, 4.4], face: Math.PI, who: 'director', note: '点唱机（以后：投一枚硬币换一首歌）' },
} as const;

export const INTERIOR_DINER: InteriorDef = {
  id: 'diner',
  name: '餐馆',
  w: W,
  d: D,
  floor: 'terrazzo',
  // 框架的墙（东西两墙、南矮墙的顶）：深海军蓝，压住，不和红卡座抢
  wall: 'signBoard',
  poi: 'p_diner',
  zoom: 0.5,
  talk: TALK,
  build(c) {
    const actx = sharedMats(c.actx);
    const objs: THREE.Object3D[] = [];
    for (const p of PLACES) {
      const f = V2[p.id];
      if (!f) throw new Error(`interiors/v2/diner：没有资产 ${p.id}`);
      const rot = p.rot ?? 0;
      const obj = f({ ...actx, variant: p.v ?? 0 });
      obj.position.set(p.x, p.y ?? 0, p.z);
      obj.rotation.y = rot;
      objs.push(obj);
      if (p.block) {
        const [sw, sd] = p.block;
        const swap = Math.abs(Math.sin(rot)) > 0.7;
        const hw = (swap ? sd : sw) / 2;
        const hd = (swap ? sw : sd) / 2;
        c.block({ x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd });
      }
    }
    mergeRoom(c, objs, 'valley:interior:diner:v2');
    // 挡路：后厨 + 吧台后面（员工那边，总监不进去）+ 吧台、吧台凳
    c.block({ x0: 0, x1: W, z0: 0, z1: ROOM.CZ });
    for (const x of STOOL_X) c.block({ x, z: STOOL_Z, r: 0.26 });

    // ── 共用件（kit）：价签（只有数字）、对话气泡 ──
    const put = (o: THREE.Object3D, x: number, y: number, z: number) => {
      o.position.set(x, y, z);
      c.asset(o);
    };
    for (const it of ITEMS) put(priceTag(c.actx, it.price, { size: 'sm' }), it.x, it.y - 0.155, it.z);
    // 能说话的人头顶的"…"（站着 2.05；卡座坐着也 2.05：帽子高，1.85 会盖住帽子）
    for (const n of NPCS) {
      if (!n.talk) continue;
      const y = n.seat === null ? 2.05 : n.seat[0] > 0.6 ? 2.25 : 2.05;
      put(talkBubble(c.actx), n.at[0], y, n.at[1]);
    }

    // ── 人（画面上的人：骨骼人定格一个姿势，再按材质烘成几块静态网格）──
    const dresser = createDresser({ mats: c.actx.mats as Parameters<typeof createDresser>[0]['mats'], scheme: null });
    const crowd: THREE.Object3D[] = [];
    for (const n of NPCS) {
      const make = n.kind === 'coach' ? coach : player;
      const o = make({ ...c.actx, variant: 0 } as unknown as BaseCtx);
      dresser.dress(o, n.look);
      const ud = o.userData;
      ud.setProp?.(null);
      if (n.seat === null) {
        ud.setSeat?.(null);
        ud.pose?.('idle', 0.3);
      } else {
        ud.setSeat?.(n.seat[0], n.seat[1]);
        ud.pose?.('sit', 0.25);
      }
      o.position.set(n.at[0], 0, n.at[1]);
      o.rotation.y = n.face;
      crowd.push(o);
    }
    const baked = bake(crowd, 'valley:interior:diner:people');
    if (baked) c.asset(baked);
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

/** 只留 position + normal、非索引（合并要求属性一致） */
function flatAttrs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal') ng.deleteAttribute(a);
  if (!ng.attributes.normal) ng.computeVertexNormals();
  return ng;
}

/** 整间屋的资产按材质合并（局部坐标），一个组交给 c.asset。店里没有日夜，不接夜灯 */
function mergeRoom(c: InteriorCtx, objs: THREE.Object3D[], name: string) {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const obj of objs) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      by.set(mat, [...(by.get(mat) ?? []), flatAttrs(m.geometry.clone().applyMatrix4(m.matrixWorld))]);
    });
  }
  const room = new THREE.Group();
  room.name = name;
  for (const [mat, geos] of by) {
    const g = mergeGeometries(geos);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.userData.noCast = true;
    room.add(mesh);
  }
  c.asset(room);
}

/** 摆好姿势的骨骼人 → 按（材质, 投不投影）合并的静态网格（局部坐标）。看不见的部件（收起来的道具）不要 */
function bake(list: THREE.Object3D[], name: string): THREE.Group | null {
  if (!list.length) return null;
  const by = new Map<string, { m: THREE.Material; cast: boolean; gs: THREE.BufferGeometry[] }>();
  const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
  for (const p of list) {
    p.updateMatrixWorld(true);
    p.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material) || !shown(m)) return;
      const k = `${m.material.uuid}:${m.castShadow}`;
      const e = by.get(k) ?? { m: m.material, cast: m.castShadow, gs: [] };
      e.gs.push(flatAttrs(m.geometry.clone().applyMatrix4(m.matrixWorld)));
      by.set(k, e);
    });
  }
  const out = new THREE.Group();
  out.name = name;
  for (const { m, cast, gs } of by.values()) {
    const g = mergeGeometries(gs);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast;
    if (!cast) mesh.userData.noCast = true;
    out.add(mesh);
  }
  return out;
}
