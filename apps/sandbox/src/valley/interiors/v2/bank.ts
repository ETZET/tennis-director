// 沙漠银行的店内（第二版风格：参考 Sneaky Sasquatch，镜头近、人大、东西少而大；2026-11-18）。这个文件归沙漠银行的店内代理。
// 局部坐标 x 0…14（西 → 东）、z 0…12（北 → 南），南墙正中是门（x 5.5…8.5）；框架（interiors/index.ts）画地板底、墙、门。
// 资产在 assets/in2/bank.ts（批 B2）；共用件 ./kit（价签、"…"气泡、大字条、地面字框）。
//
// 2026-11-18 第二轮（用户："让布局和画面自己说话，不靠字"）：店里**零字**，布局照参考图讲道理 ——
// 一条横贯整间的柜台把屋子分成"员工那边（北）/ 客人这边（南）"，正对门口。
// - 柜员：柜台西半是两个敞开的窗口（铜框磨砂玻璃隔断、电脑背对镜头、铜托盘），两位柜员站在后面、头顶"…"；
//   后墙正中一块墨绿拱顶牌子 + 铜色柱廊图标（一眼"银行"），旁边一只大铜钟。窗口前两道铜柱绒绳夹出一条排队道。
// - 金库：柜台东半只有台面，不挡后墙的大圆门（Ø 2.5 亮钢门半开，门里一墙铜色保险格 + 门口一车钱袋和金条）；
//   柜台东头一扇铜色矮门 = 员工才进得去。
// - 贷款经理：客人这边东侧，墨绿地毯上单独一张大木桌（绿玻璃台灯、合同、名牌只是一块深色铜边小牌），经理坐着、头顶"…"，
//   对面两把驼色皮扶手椅；桌边立牌挂三档价签（只有数字）+ 一摞 / 两摞 / 三摞金币的图标。
// - 西侧靠墙一条候客长椅（坐着一个人）、填单台；门两边大盆栽。地是安静的冷灰石板，颜色在柜台、墙、金库、桌椅上。
// 配色：assets/in2/bank.ts 头注。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CastLook } from '../../../clubsite/cast/types';
import { player } from '../../../clubsite/people';
import { createDresser } from '../../../clubsite/people/dress';
import type { BaseCtx } from '../../../clubsite/render/ctx';
import type { ToonOpts } from '../../../clubsite/render/toon';
import { ASSETS as V2 } from '../../assets/in2/bank';
import type { AssetCtx } from '../../ctx';
import type { PalKey } from '../../palette';
import type { InteriorCtx, InteriorDef } from '../index';
import { priceTag, talkBubble } from './kit';

const W = 14;
const D = 12;

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

/** 柜台（横贯整间：中心 x 7，台面 z 2.5…3.4）、两个窗口的 x、金库门洞中心 x、经理桌（中心） */
const COUNTER_Z = 2.95;
const WIN = [2.4, 5.0] as const;
const VAULT_X = 9.8;
const DESK: [number, number] = [10.8, 6.6];
/** 排队道：两道绒绳（x 2.9、4.5），从 z 7.0 往北到 4.6 */
const LANE: [number, number] = [2.9, 4.5];

const PLACES: Place[] = [
  // ── 地、北墙的皮、后墙的银行标志 ──
  { id: 'in2-bank-floor', x: W / 2, z: 0 },
  { id: 'in2-bank-north-wall', x: W / 2, z: 0 },
  { id: 'in2-bank-emblem', x: 3.7, z: 0, y: 2.0 },
  // ── 横贯的柜台（柜员站在后面 z 1.9；东头矮门 x 12…13）──
  { id: 'in2-bank-counter', x: W / 2, z: COUNTER_Z },
  // ── 后墙东半：金库（门半开，门扇占到 x 10.0…11.7、z 0…2.3）──
  { id: 'in2-bank-vault', x: VAULT_X, z: 0 },
  // ── 窗口前的排队道：两道铜柱绒绳（三根柱，往北排）──
  { id: 'in2-bank-stanchion', x: LANE[0], z: 7.0, v: 1, rot: Math.PI / 2 },
  { id: 'in2-bank-stanchion', x: LANE[1], z: 7.0, v: 1, rot: Math.PI / 2 },
  // ── 东侧：贷款经理单独一张大木桌（经理坐北朝南）+ 两把客人扶手椅（朝北）+ 贷款三档立牌 ──
  { id: 'in2-bank-desk', x: DESK[0], z: DESK[1], block: [2.8, 1.15] },
  { id: 'in2-bank-chair', x: DESK[0], z: DESK[1] - 1.0, v: 0, block: [0.7, 0.7] },
  { id: 'in2-bank-chair', x: DESK[0] - 0.7, z: DESK[1] + 1.2, v: 1, rot: Math.PI, block: [0.66, 0.62] },
  { id: 'in2-bank-chair', x: DESK[0] + 0.7, z: DESK[1] + 1.2, v: 1, rot: Math.PI, block: [0.66, 0.62] },
  { id: 'in2-bank-loan-sign', x: 13.1, z: 6.3, block: [1.3, 0.5] },
  // ── 西侧：靠墙的候客长椅（面朝东）、填单台 ──
  { id: 'in2-bank-bench', x: 0.6, z: 7.6, rot: Math.PI / 2, block: [2.0, 0.6] },
  { id: 'in2-bank-slip-desk', x: 1.6, z: 10.4, block: [1.7, 0.8] },
  // ── 门两边的大盆栽、东南角一盆 ──
  { id: 'in2-bank-plant', x: 4.6, z: 11.2, block: [0.65, 0.65] },
  { id: 'in2-bank-plant', x: 9.4, z: 11.2, block: [0.65, 0.65] },
  { id: 'in2-bank-plant', x: 13.3, z: 11.2, block: [0.65, 0.65] },
];

/**
 * 互动锚点（局部坐标；下一关接玩法）：at = 人站 / 坐的地方，face = 朝向（弧度，0 = 朝南 / 朝镜头，π = 朝北），
 * who = 谁在这儿（npc / director / prop），note = 说明
 */
export const SPOTS = {
  door: { at: [W / 2, D - 1.2], face: Math.PI, who: 'director', note: '门里（进门站的地方）；出门在门外地垫上' },
  teller1: { at: [WIN[0], 1.9], face: 0, who: 'npc', note: '1 号窗口的柜员（柜台后面站着，头顶"…"）' },
  teller2: { at: [WIN[1], 1.9], face: 0, who: 'npc', note: '2 号窗口的柜员（头顶"…"）' },
  deposit: {
    at: [WIN[0], 3.9],
    face: Math.PI,
    who: 'director',
    note: '1 号窗口前：存当天的营业款（外面还有夜间存款口、drive-up 两条路）',
  },
  statement: { at: [WIN[1], 3.9], face: Math.PI, who: 'director', note: '2 号窗口前：查账、看这周要还的利息' },
  queue: { at: [3.7, 6.2], face: Math.PI, who: 'director', note: '两道绒绳夹出的排队道（排到头就是两个窗口）' },
  manager: { at: [DESK[0], DESK[1] - 1.0], face: 0, who: 'npc', note: '贷款经理坐在大木桌后（北边），头顶"…"' },
  loanDesk: {
    at: [DESK[0], DESK[1] + 2.0],
    face: Math.PI,
    who: 'director',
    note: '经理桌前（两把客人椅后面）：谈贷款 —— 现在拿钱，以后每周还利息',
  },
  loanSeat: { at: [DESK[0] + 0.7, DESK[1] + 1.2], face: Math.PI, who: 'director', note: '谈贷款时总监坐的客人椅' },
  loanTiers: { at: [13.1, 7.0], face: Math.PI, who: 'director', note: '贷款三档立牌前（ITEMS，价签只有数字）' },
  vault: {
    at: [VAULT_X, 3.9],
    face: Math.PI,
    who: 'director',
    note: '柜台东半前，隔着台面看金库（门半开；员工那边，以后：经理从矮门带进去看俱乐部的地契）',
  },
  slipDesk: { at: [1.6, 11.2], face: Math.PI, who: 'director', note: '填单台（存款单）' },
} as const;

/** 能"买"的：贷款三档（局部坐标，y = 价签中心高）。数越大利息越重（谈贷款的取舍） */
export const ITEMS = [
  { id: 'loan-small', name: '小额贷款 · 补设施', price: 5000, x: 13.17, z: 6.56, y: 1.38 },
  { id: 'loan-mid', name: '扩场贷款 · 两片新场', price: 20000, x: 13.17, z: 6.56, y: 0.96 },
  { id: 'loan-big', name: '大额贷款 · 盖酒店', price: 50000, x: 13.17, z: 6.56, y: 0.54 },
] as const;

/** 店里的人：位置（局部）、朝向、座面高（null = 站着）、头顶有没有"…"、长相 */
const NPCS: { at: [number, number]; face: number; seat: number | null; talk: boolean; look: CastLook }[] = [
  {
    // 1 号柜员：深棕发髻、白衬衫、深绿裙
    at: [WIN[0], 1.9],
    face: 0,
    seat: null,
    talk: true,
    look: {
      body: 'adult',
      height: 0.96,
      skin: 'brown',
      hair: 'black',
      hairStyle: 'bun',
      shirt: 'white',
      bottom: 'navy',
      bottomKind: 'skirt',
      shoes: 'black',
    },
  },
  {
    // 2 号柜员：金色短发、天蓝衬衫、炭灰裤
    at: [WIN[1], 1.9],
    face: 0,
    seat: null,
    talk: true,
    look: {
      body: 'adult',
      skin: 'light',
      hair: 'blonde',
      hairStyle: 'short',
      shirt: 'sky',
      longSleeves: true,
      bottom: 'charcoal',
      bottomKind: 'pants',
      shoes: 'brown',
    },
  },
  {
    // 贷款经理：灰发、眼镜、白衬衫长袖、炭灰裤（坐着）
    at: [DESK[0], DESK[1] - 1.0],
    face: 0,
    seat: 0.52,
    talk: true,
    look: {
      body: 'adult',
      height: 1.02,
      stout: 1.1,
      skin: 'tan',
      hair: 'gray',
      hairStyle: 'short',
      shirt: 'white',
      longSleeves: true,
      bottom: 'charcoal',
      bottomKind: 'pants',
      shoes: 'black',
      eyes: 'glasses',
    },
  },
  {
    // 2 号窗口前办事的客人（背对镜头）
    at: [WIN[1] + 0.1, 3.95],
    face: Math.PI,
    seat: null,
    talk: false,
    look: {
      body: 'adult',
      skin: 'tan',
      hair: 'brown',
      hairStyle: 'ponytail',
      shirt: 'coral',
      bottom: 'khaki',
      bottomKind: 'pants',
      shoes: 'white',
    },
  },
  {
    // 排队道里等着的人（背对镜头）
    at: [3.7, 5.7],
    face: Math.PI,
    seat: null,
    talk: false,
    look: {
      body: 'adult',
      height: 1.02,
      skin: 'brown',
      hair: 'black',
      hairStyle: 'short',
      shirt: 'sky',
      bottom: 'charcoal',
      bottomKind: 'pants',
      shoes: 'black',
    },
  },
  {
    // 长椅上等着的人
    at: [0.65, 8.0],
    face: Math.PI / 2,
    seat: 0.48,
    talk: false,
    look: {
      body: 'adult',
      skin: 'light',
      hair: 'brown',
      hairStyle: 'curly',
      shirt: 'yellow',
      bottom: 'blue',
      bottomKind: 'pants',
      shoes: 'brown',
    },
  },
];

export const INTERIOR_BANK: InteriorDef = {
  id: 'bank',
  name: '沙漠银行',
  w: W,
  d: D,
  floor: 'terrazzo',
  wall: 'desertStone',
  poi: 'p_bank',
  zoom: 0.45,
  talk: [
    {
      x: WIN[0],
      z: 3.9,
      r: 1.3,
      label: '存营业款',
      line: '柜员：今天的营业款？我点一下……好了，这是收据。晚上来就丢门口的夜间存款口。',
    },
    {
      x: WIN[1] - 0.3,
      z: 4.0,
      r: 1.3,
      label: '查账',
      line: '柜员：俱乐部账上的钱、这周要还的利息，都在这张单子上。',
    },
    {
      x: DESK[0],
      z: DESK[1] + 2.0,
      r: 1.5,
      label: '谈贷款',
      line: '经理：想扩场？五千、两万、五万三档，钱今天就到账；以后每周还利息，借得越多越重。',
    },
    {
      x: VAULT_X,
      z: 3.9,
      r: 1.5,
      label: '看金库',
      line: '金库的门开着，可那是员工那边 —— 没有经理陪着进不去。俱乐部的地契也锁在里面。',
    },
  ],
  build(c) {
    const actx = sharedMats(c.actx);
    const objs: THREE.Object3D[] = [];
    for (const p of PLACES) {
      const f = V2[p.id];
      if (!f) throw new Error(`interiors/v2/bank：没有资产 ${p.id}`);
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
    // 挡路：横贯的柜台（矮门关着，员工那边整条不让进）；排队道的两道绳
    c.block({ x0: 0, x1: W, z0: COUNTER_Z - 0.5, z1: COUNTER_Z + 0.5 });
    for (const lx of LANE) c.block({ x0: lx - 0.15, x1: lx + 0.15, z0: 4.45, z1: 7.15 });

    // ── 共用件（kit）：价签（只有数字）、对话气泡。店里零字 ──
    const put = (o: THREE.Object3D, x: number, y: number, z: number) => {
      o.position.set(x, y, z);
      c.asset(o);
    };
    for (const it of ITEMS) put(priceTag(c.actx, it.price, { size: 'sm' }), it.x, it.y - 0.155, it.z);
    for (const n of NPCS) if (n.talk) put(talkBubble(c.actx), n.at[0], n.seat === null ? 2.05 : 1.8, n.at[1]);

    // ── 人（静的：定格的坐姿 / 站姿）。骨骼人不合并，单独放 ──
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

/** 整间屋的资产按材质合并（局部坐标），一个组交给 c.asset。店里没有日夜（INDOOR_LOOK） */
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
  room.name = 'valley:interior:bank:v2';
  for (const [mat, geos] of by) {
    const g = mergeGeometries(geos);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.userData.noCast = true;
    room.add(mesh);
  }
  c.asset(room);
}
