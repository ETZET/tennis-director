// 第二版报社（?inv=2）：一个小办事处（参考 Sneaky Sasquatch 的办事处 / 银行 / 办公室：镜头近、人大、东西少而大）。
// 局部坐标 x 0…14（西 → 东）、z 0…12（北 → 南），南墙正中是门（x 5.5…8.5）；框架（interiors/index.ts）画地板底、墙、门。
//
// 进门第一眼（北墙整面看得见）：正中是总编的大桌，总编坐在桌后、头顶"…"（P1 登广告、P2 接受采访），身后墙上是报头大字
// THE DESERT SUN；北墙西段三张镶框的旧头版，上面一条 ARCHIVE（P3，中间最大的是 1960 年那期）。
// 西边：CLASSIFIEDS 分类广告板 + 写字台，三种登法的样张各挂一个价签（ITEMS）。东边：两张记者桌（一个记者坐着，P2 叫过来的就是他）。
// 门边：东边前台（接待员站在台后、头顶"…"，台上收银机），地上 WAIT HERE 框；西边一排等候椅 + 小茶几。
// 一条牛血红长地毯从门口直通总编桌（过道 ≥ 3 米宽）。配色照上一轮"深沉的老编辑部"（assets/in2/paper.ts 头注）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CastLook } from '../../../clubsite/cast/types';
import { player } from '../../../clubsite/people';
import { createDresser } from '../../../clubsite/people/dress';
import type { BaseCtx } from '../../../clubsite/render/ctx';
import type { ToonOpts } from '../../../clubsite/render/toon';
import { paperSignMats, ASSETS as V2 } from '../../assets/in2/paper';
import { ASSETS as V1 } from '../../assets/paper';
import type { AssetCtx } from '../../ctx';
import type { PalKey } from '../../palette';
import type { InteriorCtx, InteriorDef } from '../index';
import { fascia, floorLabel, priceTag, talkBubble } from './kit';

const W = 14;
const D = 12;

/** 摆一件：资产 id（in2- 新画的，in- 借第一版的）、局部坐标、绕 y 转（0 = 正面朝南）、变体、挡路的尺寸 [宽 x, 深 z]（不给 = 不挡）、离地高 */
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
  // ── 地板、北墙的皮 ──
  { id: 'in2-paper-floor', x: W / 2, z: 0 },
  { id: 'in2-paper-north-wall', x: W / 2, z: 0 },
  // ── 北墙西段：三张旧头版（P3）──
  { id: 'in2-paper-archive', x: 2.45, z: 0, y: 1.45 },
  // ── 正中：总编的大桌 + 高背皮椅（总编坐着）+ 南边一把访客椅（P2 采访时坐）──
  { id: 'in2-paper-editor-desk', x: 7, z: 2.4, block: [2.8, 1.2] },
  { id: 'in-paper-chair', x: 7, z: 1.25, v: 1, block: [0.8, 0.7] },
  { id: 'in-paper-chair', x: 5.2, z: 3.75, v: 2, rot: Math.PI - 0.45, block: [0.6, 0.6] },
  { id: 'in-paper-coat-rack', x: 9.4, z: 0.6, block: [0.5, 0.5] },
  // ── 东北角：书架、盆栽 ──
  { id: 'in-paper-bookshelf', x: 11.9, z: 0.32, block: [3.6, 0.6] },
  { id: 'in-paper-plant', x: 13.35, z: 1.5, v: 0, block: [0.7, 0.7] },
  // ── 西边：分类广告板 + 写字台（P1 自己挑登法）──
  { id: 'in2-paper-ad-board', x: 2.2, z: 5.0, block: [3.3, 1.1] },
  // ── 东边：两张记者桌（记者坐北朝南）──
  { id: 'in2-paper-reporter-desk', x: 10.7, z: 5.3, v: 0, block: [1.8, 0.95] },
  { id: 'in2-paper-reporter-desk', x: 12.75, z: 5.3, v: 1, block: [1.8, 0.95] },
  { id: 'in-paper-chair', x: 10.55, z: 4.45, v: 0, block: [0.6, 0.6] },
  { id: 'in-paper-chair', x: 12.6, z: 4.4, v: 0, rot: 0.35, block: [0.6, 0.6] },
  { id: 'in-paper-water-cooler', x: 13.4, z: 7.4, block: [0.5, 0.5] },
  // ── 门边东：前台（接待员站在台后）──
  { id: 'in2-paper-reception', x: 10.3, z: 9.4, block: [3.3, 0.9] },
  { id: 'in-paper-plant', x: 13.35, z: 11.3, v: 1, block: [0.7, 0.7] },
  // ── 门边西：等候椅（朝南）+ 小茶几 + 落地灯 + 盆栽 ──
  { id: 'in-paper-chair', x: 0.95, z: 9.35, v: 2, block: [0.6, 0.6] },
  { id: 'in-paper-chair', x: 1.75, z: 9.35, v: 2, block: [0.6, 0.6] },
  { id: 'in-paper-chair', x: 2.55, z: 9.35, v: 2, block: [0.6, 0.6] },
  { id: 'in2-paper-side-table', x: 3.45, z: 9.35, block: [0.62, 0.52] },
  { id: 'in-paper-floor-lamp', x: 4.25, z: 9.1, block: [0.45, 0.45] },
  { id: 'in-paper-plant', x: 0.7, z: 11.3, v: 0, block: [0.7, 0.7] },
];

/**
 * 互动锚点（局部坐标；下一关接玩法）：at = 人站 / 坐的地方，face = 朝向（弧度，0 = 朝南 / 朝镜头，π = 朝北），
 * card = 设计稿的卡号，who = 谁在这儿（npc / director / prop），note = 说明
 */
export const SPOTS = {
  door: {
    at: [W / 2, D - 1.2],
    face: Math.PI,
    card: '-',
    who: 'director',
    note: '门里（进门站的地方）；出门在门外地垫上',
  },
  receptionist: {
    at: [10.3, 8.55],
    face: 0,
    card: '-',
    who: 'npc',
    note: '接待员站在前台后面（北边），脸朝南，头顶"…"',
  },
  frontDesk: {
    at: [10.3, 10.55],
    face: Math.PI,
    card: '-',
    who: 'director',
    note: '总监在前台前问路（WAIT HERE 框里）',
  },
  editor: { at: [7, 1.3], face: 0, card: 'P1 P2', who: 'npc', note: '总编坐在大桌后的高背皮椅上，脸朝南，头顶"…"' },
  editorDesk: {
    at: [7, 3.6],
    face: Math.PI,
    card: 'P1 P2',
    who: 'director',
    note: '总监站在总编桌前（南边），朝北：点总编',
  },
  adProof: {
    at: [6.82, 2.6],
    face: 0,
    card: 'P1',
    who: 'prop',
    note: '桌上的样张（总编当场用红笔圈广告的位置），离地 0.79',
  },
  adBoard: {
    at: [2.2, 6.65],
    face: Math.PI,
    card: 'P1',
    who: 'director',
    note: '分类广告写字台前：三种登法的样张 + 价签（ITEMS）',
  },
  interviewSeat: {
    at: [5.2, 3.75],
    face: Math.PI - 0.45,
    card: 'P2',
    who: 'director',
    note: '采访时总监坐的访客椅（总编桌西南角）',
  },
  reporter: {
    at: [8.75, 3.4],
    face: -Math.PI * 0.6,
    card: 'P2',
    who: 'npc',
    note: '记者被叫过来以后站的地方（总编桌东南角，朝西看总监）',
  },
  reporterDesk: {
    at: [10.55, 4.45],
    face: 0,
    card: 'P2',
    who: 'npc',
    note: '记者平时坐的桌子（总编叫他，他从这儿起身）',
  },
  oldPaper1960: {
    at: [2.45, 2.4],
    face: 0,
    card: 'P3',
    who: 'prop',
    note: '北墙中间最大的那张（1960，俱乐部开张）；框的中心离地 2.4',
  },
  oldPaperView: { at: [2.45, 1.3], face: Math.PI, card: 'P3', who: 'director', note: '总监站在旧报前（南边）朝北看' },
} as const;

/** 能买的（挂了价签的）：三种登法（局部坐标，y = 价签中心高）。价钱：越大、越靠前越贵（P1 的取舍） */
export const ITEMS = [
  { id: 'ad-classified', name: '分类广告 · 一小块', price: 40, x: 1.18, z: 5.06, y: 1.09 },
  { id: 'ad-sports', name: '体育版 · 半版', price: 180, x: 2.22, z: 5.06, y: 1.09 },
  { id: 'ad-front', name: '头版 · 下面一条', price: 350, x: 3.25, z: 5.06, y: 1.09 },
] as const;

/** 店里的人：位置（局部）、朝向、座面高（null = 站着）、头顶有没有"…"、长相（照第一版） */
const NPCS: { at: [number, number]; face: number; seat: number | null; talk: boolean; look: CastLook }[] = [
  {
    // 总编：发福、灰白短发、眼镜、小胡子；白衬衫长袖、炭灰裤子
    at: [7, 1.3],
    face: 0,
    seat: 0.52,
    talk: true,
    look: {
      body: 'adult',
      height: 1.04,
      stout: 1.2,
      skin: 'light',
      hair: 'gray',
      hairStyle: 'short',
      shirt: 'white',
      longSleeves: true,
      bottom: 'charcoal',
      bottomKind: 'pants',
      shoes: 'black',
      eyes: 'glasses',
      facial: 'mustache',
    },
  },
  {
    // 接待员：棕色发髻、珊瑚色上衣、海军蓝裙子（站在前台后面）
    at: [10.3, 8.55],
    face: 0,
    seat: null,
    talk: true,
    look: {
      body: 'adult',
      height: 0.96,
      skin: 'tan',
      hair: 'brown',
      hairStyle: 'bun',
      shirt: 'coral',
      bottom: 'navy',
      bottomKind: 'skirt',
      shoes: 'brown',
    },
  },
  {
    // 记者（P2 来采访的那个）：坐在自己桌后、脸朝镜头，天蓝衬衫、卡其裤
    at: [10.55, 4.5],
    face: 0,
    seat: 0.52,
    talk: false,
    look: {
      body: 'adult',
      skin: 'brown',
      hair: 'black',
      hairStyle: 'curly',
      shirt: 'sky',
      longSleeves: true,
      bottom: 'khaki',
      bottomKind: 'pants',
      shoes: 'brown',
    },
  },
  {
    // 等着登广告的客人：坐在等候椅上
    at: [1.75, 9.4],
    face: 0,
    seat: 0.48,
    talk: false,
    look: {
      body: 'adult',
      skin: 'light',
      hair: 'blonde',
      hairStyle: 'ponytail',
      shirt: 'yellow',
      bottom: 'blue',
      bottomKind: 'pants',
      shoes: 'white',
    },
  },
];

export const INTERIOR_PAPER: InteriorDef = {
  id: 'paper',
  name: '《沙漠太阳报》编辑部',
  w: W,
  d: D,
  floor: 'tile',
  // 框架的墙（墙顶一圈、南矮墙）：深青灰的 slate
  wall: 'slate',
  poi: 'p_paper',
  zoom: 0.45,
  build(c) {
    const actx = sharedMats(c.actx);
    const objs: THREE.Object3D[] = [];
    for (const p of PLACES) {
      const f = V2[p.id] ?? V1[p.id];
      if (!f) throw new Error(`interiors/v2/paper：没有资产 ${p.id}`);
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
    mergeRoom(c, objs);

    // ── 共用件（kit）：大字条、价签、地上的字框、对话气泡 ──
    const sm = paperSignMats(c.actx);
    const put = (o: THREE.Object3D, x: number, y: number, z: number) => {
      o.position.set(x, y, z);
      c.asset(o);
    };
    // 报头（太阳在它左边，北墙的皮里画了）、ARCHIVE（三张旧报上面，和报头一排）、CLASSIFIEDS（广告板顶上）
    put(fascia(c.actx, 'THE DESERT SUN', { w: 4.9, h: 0.72, bg: sm.navy, ink: sm.brass }), 7.85, 3.38, 0.09);
    put(fascia(c.actx, 'ARCHIVE', { w: 2.6, h: 0.5, bg: sm.walnut, ink: sm.cream }), 2.45, 3.62, 0.09);
    put(fascia(c.actx, 'CLASSIFIEDS', { w: 3.2, h: 0.5, bg: sm.navy, ink: sm.cream }), 2.2, 2.53, 5.06);
    // 总编桌正面的铜牌、前台正面的字
    put(fascia(c.actx, 'EDITOR', { w: 1.0, h: 0.3, bg: sm.walnut, ink: sm.brass }), 7, 0.36, 2.88);
    put(fascia(c.actx, 'FRONT DESK', { w: 2.0, h: 0.36, bg: sm.navy, ink: sm.brass }), 10.3, 0.52, 9.83);
    // 地上：前台前排队的框
    put(floorLabel(c.actx, 'WAIT HERE', { w: 1.8, d: 1.0, ink: sm.brass }), 10.3, 0.06, 10.75);
    // 三种登法的价签（样张正下方，板面前）
    for (const it of ITEMS) put(priceTag(c.actx, it.price), it.x, it.y - 0.21, it.z);
    // 能说话的人头顶的"…"（kit 约定站着 2.05、坐着 1.6；总编高、坐在高背椅上，1.6 会埋进头发 → 1.95）
    for (const n of NPCS) if (n.talk) put(talkBubble(c.actx), n.at[0], n.seat === null ? 2.05 : 1.95, n.at[1]);

    // ── 人（静的：定格的坐姿 / 站姿；会走、会说话是下一关）。骨骼人不合并，单独放 ──
    const dresser = createDresser({ mats: c.actx.mats as Parameters<typeof createDresser>[0]['mats'], scheme: null });
    for (const n of NPCS) {
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
      c.asset(o);
    }
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

/** 整间屋的资产按材质合并（局部坐标），一个组交给 c.asset。店里没有日夜（INDOOR_LOOK），第一版资产的夜灯不接 */
function mergeRoom(c: InteriorCtx, objs: THREE.Object3D[]) {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const obj of objs) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
      by.set(mat, [...(by.get(mat) ?? []), g.index ? g.toNonIndexed() : g]);
    });
  }
  const room = new THREE.Group();
  room.name = 'valley:interior:paper:v2';
  for (const [mat, geos] of by) {
    const g = mergeGeometries(geos);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.userData.noCast = true;
    room.add(mesh);
  }
  c.asset(room);
}
