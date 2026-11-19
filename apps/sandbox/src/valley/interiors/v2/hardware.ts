// 五金大超市 · 第二版店内（?inv=2，参考 Sneaky Sasquatch 的店内和仓库：镜头近、人大、东西少而大、每件下面挂价签、柜台后面有人）。
// 店里零字（2026-11-19）：分区靠货本身 + 海军蓝图标牌（球场、喷头、滚筒刷、木板、锤子、叉车）；收货区 = 门前一片黄黑斜纹 + 卷帘门；
//   叉车位 = 一个空的黄框、叉车停在里面；收银 = 柜台 + 收银机 + 收银员 + 立杆上只亮 "1" 的通道灯（不写 PAY HERE / CHECKOUT）。
// 设计稿 H1～H6（平板推车、开叉车取上层托盘、装车、倒车进卸货台、对号买喷头、调划线漆）。资产在 assets/in2/hardware.ts（in2-hw-*）。
//
// 局部坐标：x 0…36（西 → 东）、z 0…22（北 → 南），南墙正中是门（x 18）。镜头俯 45°、朝北，zoom 0.45（≈ 0.02 米/纹素，竖屏一屏横着 ≈ 8 米）。
// 构图（一进门往北看）：正中一条 4 米宽的叉车主过道（两边安全黄线），一直通到北墙正中的球场用品高货架（上层托盘 = H2 要叉车取的红土沙）；
//   北墙西边收货门 + 门前黄黑斜纹的装卸区（H3 / H4），东边漆架 + 调漆台（店员在台后，H6）；货架前的东西向横过道 ≥ 8 米宽，叉车在这里掉头、开去收货门。
//   中间一排（z 10）：西喷头零件墙（H5）、工具洞洞板、东悬臂长料架（H1）。
//   南边（门两边）：西边收银（收银员在台后、台前一道停止线），东边三辆平板推车（H1）；门口两个促销堆头；东南角两件红土场用品。
// 叉车过道：主过道 4 米、横过道 ≥ 8 米、到收货门那段 ≥ 3.6 米（硬要求 ≥ 3.2）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CastLook } from '../../../clubsite/cast/types';
import { player } from '../../../clubsite/people';
import { createDresser } from '../../../clubsite/people/dress';
import type { BaseCtx } from '../../../clubsite/render/ctx';
import {
  cachedCtx,
  HW_RACK,
  type HwItem,
  hwBay,
  hwCheckout,
  hwDockDoor,
  hwFlatbed,
  hwFloor,
  hwForklift,
  hwHatch,
  hwLumberRack,
  hwPaintCounter,
  hwPaintWall,
  hwPalletRack,
  hwPartsWall,
  hwPromo,
  hwRentSign,
  hwShaker,
  hwStriper,
  hwToolWall,
  hwWall,
} from '../../assets/in2/hardware';
import type { AssetCtx } from '../../ctx';
import { type InteriorCtx, type InteriorDef, WALL_H } from '../index';
import { talkBubble } from './kit';

const W = 36;
const D = 22;

/** 各区的位置（局部米；资产的原点见 assets/in2/hardware.ts 各函数的注释） */
const DOCK = { x: 5, z: 0 };
const RACK = { x: 18, z: HW_RACK.d + 0.02 };
const FORK = { x: 23.2, z: 5.0 };
/** 叉车位：一个空的黄框，叉车整个停在里面（框里不写字） */
const FORK_BOX = { x: 22.85, z: 5.0, w: 4.5, d: 2.1 };
const RENT = { x: 25.6, z: 7.8 };
const PAINT_WALL = { x: 30.8, z: 0.72 };
const PAINT = { x: 31, z: 4.1 };
const SHAKER = { x: 35.0, z: 3.4 };
const STRIPER = { x: 34.4, z: 5.7 };
const PARTS = { x: 4.6, z: 10.4 };
const TOOLS = { x: 12.1, z: 10.6 };
const LUMBER = { x: 28.5, z: 10.0 };
const CHECKOUT = { x: 13.2, z: 17.2 };
const FLATBEDS = [21.6, 22.8, 24.0];
const FLATBED_Z = 17.4;
/** 主过道（叉车）：x 16…20（4 米） */
const AISLE = { x: 18, half: 2.0 };

/** 互动锚点（下一关接）：局部坐标、朝向 rot（绕 y：0 = 面朝南 +z，π = 面朝北，π/2 = 面朝东）、卡号、说明；有的带高度 y */
export const SPOTS: Record<string, { x: number; z: number; rot: number; y?: number; card: string; note: string }> = {
  entry: {
    x: 18,
    z: 20,
    rot: Math.PI,
    card: '-',
    note: '进门站的地方（门里 2 米，正对主过道和北墙的球场用品高货架）',
  },
  'h1-flatbed': { x: FLATBEDS[1], z: FLATBED_Z + 1.6, rot: Math.PI, card: 'H1', note: '拿平板推车（三辆，把手朝北）' },
  'h1-lumber-west': { x: 25.2, z: 12.4, rot: Math.PI, card: 'H1', note: '长料架西半：木方、镀锌管、白 PVC 管' },
  'h1-lumber-east': { x: 31.8, z: 12.4, rot: Math.PI, card: 'H1', note: '长料架东半：网柱一对、围网立柱' },
  'h2-rent': {
    x: RENT.x,
    z: RENT.z + 0.9,
    rot: Math.PI,
    card: 'H2',
    note: '找叉车员登记、付租金（叉车图标牌 + 价签 + 叉车员头顶"…"）',
  },
  'h2-forklift': { x: FORK.x, z: FORK.z, rot: -Math.PI / 2, card: 'H2', note: '叉车（停在黄框车位里，货叉朝西）' },
  'h2-rack-clay': {
    x: RACK.x - 1.5 * HW_RACK.bay,
    z: RACK.z - HW_RACK.d / 2,
    y: HW_RACK.beam + 0.03,
    rot: 0,
    card: 'H2',
    note: '上层托盘：红土补土沙整托（高货架西跨，两托并排；货叉从南边进）',
  },
  'h2-rack-approach': {
    x: RACK.x - 1.5 * HW_RACK.bay,
    z: 4.4,
    rot: Math.PI,
    card: 'H2',
    note: '叉车对准那托沙的位置（横过道里，面朝北）',
  },
  'h3-loading-zone': {
    x: DOCK.x,
    z: 4.0,
    rot: Math.PI,
    card: 'H3',
    note: '装车：收货门前的黄黑斜纹区（货车车斗在门外，叉车 / 推车从这里进车斗）',
  },
  'h4-dock-door': { x: DOCK.x, z: 0.5, rot: 0, card: 'H4', note: '收货门（墙外是卸货台；货车倒到门口的防撞块）' },
  'h5-parts-wall': {
    x: PARTS.x,
    z: PARTS.z + 1.3,
    rot: Math.PI,
    card: 'H5',
    note: '喷头零件墙：2 × 4 格，每格一个零件 + 价签（拿坏喷头往格子上贴）',
  },
  'h6-paint-counter': {
    x: PAINT.x,
    z: PAINT.z + 0.9,
    rot: Math.PI,
    card: 'H6',
    note: '调漆台（店员在台后、头顶"…"）：选颜色、选桶数',
  },
  'h6-tinter': { x: PAINT.x - 1.6, z: PAINT.z + 0.9, rot: Math.PI, card: 'H6', note: '调色机（台上，一圈色浆罐）' },
  'h6-shaker': { x: SHAKER.x, z: SHAKER.z + 1.2, rot: Math.PI, card: 'H6', note: '摇漆机（把桶放进去，按住摇）' },
  'h6-paint-wall': {
    x: PAINT_WALL.x,
    z: PAINT_WALL.z + 0.4,
    rot: Math.PI,
    card: 'H6',
    note: '台后的漆架：四色划线漆（店员拿）',
  },
  tools: {
    x: TOOLS.x,
    z: TOOLS.z + 2.2,
    rot: Math.PI,
    card: '-',
    note: '工具洞洞板（拖网刷、刮水滚筒、铁锹、耙子、独轮车）',
  },
  'court-supply': {
    x: RACK.x,
    z: 3.4,
    rot: Math.PI,
    card: 'H2',
    note: '球场用品高货架下层（顾客自己拿：补土沙袋、球网、挡风网）',
  },
  checkout: {
    x: CHECKOUT.x + 0.4,
    z: CHECKOUT.z + 1.2,
    rot: Math.PI,
    card: '-',
    note: '收银（收银员在台后、头顶"…"；台前停止线、立杆上的 1 号通道灯）',
  },
  exit: { x: 18, z: D + 1.2, rot: 0, card: '-', note: '出门（门外地垫）' },
};

/** 每件挂了价签的可买的东西（局部坐标，y = 价签底边高）。build 时按资产的 userData.items 填 */
export const ITEMS: { id: string; name: string; price: number; x: number; z: number; y: number }[] = [];

/** 店里的人：位置（局部）、朝向（0 = 朝南）、长相 */
const NPCS: { id: string; at: [number, number]; face: number; look: CastLook }[] = [
  {
    // 收银员：海军蓝工作服 + 芥末黄滚边（店服）
    id: 'cashier',
    at: [CHECKOUT.x + 1.4, CHECKOUT.z - 1.25],
    face: 0,
    look: {
      body: 'adult',
      skin: 'tan',
      hair: 'black',
      hairStyle: 'ponytail',
      shirt: 'navy',
      trim: 'yellow',
      bottom: 'charcoal',
      bottomKind: 'pants',
      shoes: 'black',
    },
  },
  {
    // 调漆的店员：店服 + 棒球帽（帽子芥末黄）
    id: 'paint-clerk',
    at: [PAINT.x, 2.35],
    face: 0,
    look: {
      body: 'adult',
      height: 1.04,
      stout: 1.12,
      skin: 'light',
      hair: 'brown',
      hairStyle: 'short',
      hat: { kind: 'cap', color: 'yellow' },
      shirt: 'navy',
      trim: 'yellow',
      bottom: 'khaki',
      bottomKind: 'pants',
      shoes: 'brown',
      facial: 'beard',
    },
  },
  {
    // 叉车员：橙色反光背心（一眼和店员分开）、灰裤
    id: 'forklift-op',
    at: [RENT.x + 0.9, RENT.z - 1.1],
    face: 0,
    look: {
      body: 'adult',
      skin: 'deep',
      hair: 'black',
      hairStyle: 'buzz',
      shirt: 'orange',
      bottom: 'gray',
      bottomKind: 'pants',
      shoes: 'black',
    },
  },
];

function build(c: InteriorCtx) {
  ITEMS.length = 0;
  const a = cachedCtx(c.actx);
  const objs: THREE.Object3D[] = [];
  /** 摆一件：位置、转角；挂在它身上的价签换算成 ITEMS（前缀避免重名） */
  const put = (o: THREE.Object3D, x: number, z: number, rot = 0, prefix = '', y = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = rot;
    o.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    for (const it of (o.userData.items as HwItem[] | undefined) ?? []) {
      v.set(it.x, it.y, it.z).applyMatrix4(o.matrixWorld);
      ITEMS.push({ id: prefix + it.id, name: it.name, price: it.price, x: v.x, y: v.y, z: v.z });
    }
    objs.push(o);
    return o;
  };
  const block = (x0: number, z0: number, x1: number, z1: number) => c.block({ x0, x1, z0, z1 });

  // ── 地、北墙 ──
  put(
    hwFloor(a, W, D, {
      lanes: [
        {
          pts: [
            [AISLE.x, D - 2.4],
            [AISLE.x, 2.0],
          ],
          half: AISLE.half,
        },
      ],
      // 收银台前的停止线（排队站在线后）
      lines: [[CHECKOUT.x - 2.4, CHECKOUT.z + 2.4, CHECKOUT.x + 2.4, CHECKOUT.z + 2.5]],
    }),
    0,
    0,
  );
  put(hwWall(a, W, WALL_H, [[DOCK.x - 2.2, DOCK.x + 2.2]]), 0, 0);
  // 地上（盖在环氧地上：y 0.035）：收货门前一片黄黑斜纹（装卸区）、叉车的空黄框车位；都不写字
  put(hwHatch(a, 6.4, 4.8), DOCK.x, 4.0, 0, '', 0.035);
  put(hwBay(a, FORK_BOX.w, FORK_BOX.d), FORK_BOX.x, FORK_BOX.z, 0, '', 0.035);

  // ── 北墙西：收货门（H3 / H4） ──
  put(hwDockDoor(a), DOCK.x, DOCK.z);
  block(DOCK.x - 2.75, 0, DOCK.x - 2.3, 0.6);
  block(DOCK.x + 2.3, 0, DOCK.x + 2.75, 0.6);

  // ── 北墙正中：球场用品高货架（H2，顶梁挂球场图标牌）；叉车 + 租车牌（叉车图标、叉车员） ──
  put(hwPalletRack(a), RACK.x, RACK.z, 0, 'court-');
  block(RACK.x - 6.7, 0, RACK.x + 6.7, RACK.z + 0.15);
  put(hwForklift(a), FORK.x, FORK.z, Math.PI / 2);
  block(FORK.x - 2.1, FORK.z - 0.65, FORK.x + 1.45, FORK.z + 0.65);
  put(hwRentSign(a), RENT.x, RENT.z);
  block(RENT.x - 0.3, RENT.z - 0.25, RENT.x + 0.3, RENT.z + 0.25);

  // ── 北墙东：漆架（滚筒刷图标牌）+ 调漆台（H6）+ 摇漆机 + 划线车 ──
  put(hwPaintWall(a), PAINT_WALL.x, PAINT_WALL.z, 0, 'paintwall-');
  put(hwPaintCounter(a), PAINT.x, PAINT.z, 0, 'paint-');
  // 台后是店员的地方：整块挡住（顾客从台前买）
  block(PAINT.x - 3.05, 0, PAINT.x + 3.05, PAINT.z);
  block(PAINT_WALL.x - 4.7, 0, PAINT.x - 3.05, PAINT_WALL.z);
  block(PAINT.x + 3.05, 0, W, PAINT_WALL.z);
  put(hwShaker(a), SHAKER.x, SHAKER.z);
  block(SHAKER.x - 0.5, SHAKER.z - 0.45, SHAKER.x + 0.5, SHAKER.z + 0.45);
  put(hwStriper(a), STRIPER.x, STRIPER.z, 0, 'paint-');
  block(STRIPER.x - 0.4, STRIPER.z - 0.6, STRIPER.x + 0.4, STRIPER.z + 0.6);

  // ── 中间一排：喷头零件墙（H5，喷头图标）、工具洞洞板（锤子图标）、长料架（H1，木方图标） ──
  put(hwPartsWall(a), PARTS.x, PARTS.z, 0, 'irrigation-');
  block(PARTS.x - 4, PARTS.z - 0.45, PARTS.x + 4, PARTS.z + 0.05);
  put(hwToolWall(a), TOOLS.x, TOOLS.z, 0, 'tools-');
  block(TOOLS.x - 2.4, TOOLS.z - 0.6, TOOLS.x + 2.4, TOOLS.z + 0.05);
  block(TOOLS.x + 0.2, TOOLS.z + 0.25, TOOLS.x + 1.0, TOOLS.z + 1.65);
  put(hwLumberRack(a), LUMBER.x, LUMBER.z, 0, 'lumber-');
  block(LUMBER.x - 6.95, LUMBER.z - 0.3, LUMBER.x + 6.95, LUMBER.z + 1.3);

  // ── 门两边：收银（西）、平板推车（东）、促销堆头；东南角红土场用品、西南一托水管 ──
  put(hwCheckout(a), CHECKOUT.x, CHECKOUT.z, 0, 'checkout-');
  block(CHECKOUT.x - 3.6, CHECKOUT.z - 0.85, CHECKOUT.x + 2.65, CHECKOUT.z + 0.05);
  // 收银员站的地方（台后）：挡住，顾客从台前付钱
  block(CHECKOUT.x - 2.6, CHECKOUT.z - 2.0, CHECKOUT.x + 2.65, CHECKOUT.z - 0.85);
  for (const x of FLATBEDS) {
    put(hwFlatbed(a), x, FLATBED_Z);
    block(x - 0.42, FLATBED_Z - 0.95, x + 0.42, FLATBED_Z + 0.95);
  }
  for (const [x, z, v] of [
    [14.9, 13.4, 0],
    [21.1, 13.4, 1],
    [5.2, 14.4, 4],
    [31.2, 15.4, 2],
    [33.8, 15.4, 3],
  ] as const) {
    put(hwPromo({ ...a, variant: v }, v), x, z, 0, `promo${v}-`);
    block(x - 0.65, z - 0.6, x + 0.65, z + 0.6);
  }

  // ── 合并：整屋按材质合成一种材质一个网格（不投影；店里没有投影） ──
  mergeRoom(c, objs);

  // ── 人（柜台后面站着，头顶"…"） ──
  const dresser = createDresser({ mats: c.actx.mats as Parameters<typeof createDresser>[0]['mats'], scheme: null });
  for (const n of NPCS) {
    const o = player({ ...c.actx, variant: 0 } as unknown as BaseCtx);
    dresser.dress(o, n.look);
    const ud = o.userData;
    ud.setProp?.(null);
    ud.pose?.('idle', 0);
    o.position.set(n.at[0], 0, n.at[1]);
    o.rotation.y = n.face;
    o.traverse((m) => {
      m.userData.noCast = true;
    });
    c.asset(o);
    const b = talkBubble(a);
    b.position.set(n.at[0], 2.05, n.at[1]);
    b.traverse((m) => {
      m.userData.noCast = true;
    });
    c.asset(b);
    c.block({ x: n.at[0], z: n.at[1], r: 0.35 });
  }
}

/** 整屋的静物按材质合并（局部坐标）：只留各几何都有的属性（position / normal，kit 的贴图字要 uv 时它自己的材质组里都有 uv） */
function mergeRoom(c: InteriorCtx, objs: THREE.Object3D[]) {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const obj of objs) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      by.set(mat, [...(by.get(mat) ?? []), g]);
    });
  }
  const room = new THREE.Group();
  room.name = 'valley:interior:hardware';
  for (const [mat, geos] of by) {
    const names = Object.keys(geos[0].attributes).filter((n) => geos.every((g) => g.attributes[n]));
    for (const g of geos) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
    for (const g of geos) {
      g.morphAttributes = {};
      g.clearGroups();
    }
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.userData.noCast = true;
    room.add(mesh);
  }
  c.asset(room);
}

export const INTERIOR_HARDWARE: InteriorDef = {
  id: 'hardware',
  name: '五金大超市',
  w: W,
  d: D,
  floor: 'roofMetal',
  wall: 'slate',
  poi: 'p_hardware',
  zoom: 0.45,
  build,
};

/** 测试 / 调试：资产上下文的材质缓存版（kit 和资产共用） */
export const hwCtx = (ctx: AssetCtx) => cachedCtx(ctx);
