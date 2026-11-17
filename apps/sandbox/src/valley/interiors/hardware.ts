// 五金大超市（设计稿 H1～H6）：南北向高货架 6 排（过道 6 米、叉车能掉头；下层顾客拿、上层托盘），A 灌溉水管 / B 紧固件 / C 工具 / D 油漆 / E 建材沙；喷头对号墙（H5）、调漆台（H6）、长料架、西北叉车充电位（H2）、北墙收货门（→ 卸货台 H3/H4）、东墙门（→ 园艺院子）、南边 4 道收银、服务台、门内平板推车（H1）。
// 局部坐标：x 0…80（西 → 东）、z 0…50（北 → 南），南墙正中是门；框架（interiors/index.ts）画地板、墙、门。只改这个文件（和 assets/hardware.ts 里 in- 开头的室内资产）。
//
// 构图（镜头俯 45°、朝北；手机竖屏一屏 ≈ 17.5 米宽）：进门第一眼 = 正前方 D 排（x 40）的端架和两边的促销堆头，左手收银 4 道、右手服务台和平板推车；
// 往北走进过道：货架顶上一排托盘（芥末黄横梁两条线）、两边一条底层货；北墙（主墙面）从西到东：叉车充电位 → 收货门 → PAINT 调漆台。
// 东边一片长料架（横放的网柱、长管）、东墙玻璃门出去是园艺院子；西边喷头零件墙。叉车走的路是地上的芥末黄虚线：充电位 → A 过道 → 南边主通道 → 东边 → 收货门。
// 下一关（互动）接 SPOTS：名字 → 局部坐标 + 朝向（rot：绕 y 的角，0 = 面朝南 +z，π = 面朝北，π/2 = 面朝东；同 three 的 rotation.y），有的带高度 y。
import { makeAsset } from '../assets';
import {
  IN_RACK,
  type InCat,
  type InFloorMarks,
  type InPlace,
  type InRackSpec,
  inFloor,
  inMany,
  inRacks,
  inWallBand,
} from '../assets/hardware';
import type { InteriorCtx, InteriorDef } from './index';

const W = 80;
const D = 50;

/**
 * 货架（2026-11-16 加密：大卖场是塞满的，地只在过道里露出来）：7 排背靠背托盘架，中心 x、宽 3 米 + 底层货往过道多伸 0.4 米；
 * 底层货往过道伸 0.6 米（地上一托一托的货）；叉车走的 A 过道净宽 6 米（第 1、2 排之间），别的顾客过道净宽 3.2 米。第 1 排 z 11.25…30.5（北头让出叉车道），别的 z 5.75…30.5。
 */
export const RACK_X = [11.4, 21.6, 29.0, 36.4, 43.8, 51.2, 58.6] as const;
const RACK_Z0S = [11.25, 5.75, 5.75, 5.75, 5.75, 5.75, 5.75] as const;
export const RACK_BAY = 2.75;
export const RACK_Z1 = 30.5;
const bays = (i: number) => Math.round((RACK_Z1 - RACK_Z0S[i]) / RACK_BAY);
/** 每排两面的货：过道 A（0）在第 1、2 排之间 …… F 在第 6、7 排之间（木料，货同建材）；第 1 排西面、第 7 排东面跟着隔壁过道 */
const RACK_CATS: [InCat, InCat][] = [
  [0, 0],
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 4],
  [4, 4],
];
/** 过道中心 x（A～F）；A 是叉车过道（宽），别的窄 */
export const AISLE_X = RACK_X.slice(0, 6).map((x, i) => (x + RACK_X[i + 1]) / 2);
/** 上层的红土补土沙（H2 叉车要取的那托）：第 2 排西面（A 过道 = 叉车过道）第 4 跨第 1 托 */
const CLAY_RACK = 1;
const CLAY_SLOT: [number, number, number] = [-1, 4, 0];
const RACK_HALF = IN_RACK.w / 2 + IN_RACK.reach;

/** 叉车的路（地上的芥末黄虚线）：充电位 → A 过道 → 南边主通道 → 东边 → 收货门 */
export const FORK_ROUTE: [number, number][] = [
  [3.5, 6.8],
  [3.5, 7.4],
  [AISLE_X[0], 7.4],
  [AISLE_X[0], 33.6],
  [63, 33.6],
  [63, 3.2],
];

/** 收货门、调漆台、长料架、叉车位、零件墙、收银、服务台的位置（局部米） */
const DOCK_X = 63;
const PAINT = { x: 72.5, z: 2.6 };
const CHIPS = { x: 72.5, z: 10.5 };
const LONG = [
  { x: 72.5, z: 14, v: 0 },
  { x: 72.5, z: 22.5, v: 1 },
];
const BAY = { x: 3.5, z: 6.2 };
const FORKLIFT = { x: 3.5, z: 3.7 };
const PARTS = { x: 4.6, z: 14 };
const LANES = [11, 15.5, 20, 24.5, 29, 33.5];
const LANE_Z = 42;
const SERVICE = { x: 53, z: 40.5 };
const GARDEN_Z = 36;
const FLATBEDS = [43.6, 44.6, 45.6];
const FLATBED_Z = 46.4;

/** 互动锚点（下一关接）：局部坐标、朝向 rot（0 = 面朝南，π = 面朝北，π/2 = 面朝东），y = 高度（上层托盘） */
export const SPOTS: Record<string, { x: number; z: number; rot: number; y?: number; note: string }> = {
  entry: { x: 40, z: 47.5, rot: Math.PI, note: '进门站的地方（南门里 2.5 米）' },
  'cart-return': { x: 34.5, z: 45.4, rot: Math.PI, note: '购物车栏' },
  'h1-flatbed': { x: FLATBEDS[1], z: FLATBED_Z - 1.4, rot: 0, note: 'H1 拿平板推车（三辆，把手朝北）' },
  'h1-long-posts': { x: 69.5, z: 16.4, rot: Math.PI, note: 'H1 长料架 1：网柱、镀锌管（悬臂朝南）' },
  'h1-long-pipes': { x: 75.5, z: 24.9, rot: Math.PI, note: 'H1 长料架 2：长 PVC 管、木方' },
  'h2-forklift-desk': { x: 6.8, z: 6.1, rot: Math.PI, note: 'H2 找叉车员登记（RENT 台）' },
  'h2-forklift': { x: FORKLIFT.x, z: FORKLIFT.z, rot: 0, note: 'H2 叉车（货叉朝南）' },
  'h2-charger': { x: BAY.x, z: 0.8, rot: Math.PI, note: 'H2 充电柜（叉车还回来停这儿）' },
  'h2-rack-clay': {
    x: RACK_X[CLAY_RACK] - (0.2 + IN_RACK.w / 2) / 2,
    z: RACK_Z0S[CLAY_RACK] + CLAY_SLOT[1] * RACK_BAY + 0.72 + CLAY_SLOT[2] * 1.31,
    y: IN_RACK.beams[1] + 0.14,
    rot: -Math.PI / 2,
    note: 'H2 上层托盘：红土补土沙（第 2 排西面、A 过道 = 叉车过道；货叉从西边进）',
  },
  'h2-rack-clay-approach': {
    x: AISLE_X[0] - 0.6,
    z: RACK_Z0S[CLAY_RACK] + CLAY_SLOT[1] * RACK_BAY + 0.72,
    rot: Math.PI / 2,
    note: 'H2 叉车对准那托沙的位置（A 过道里，面朝东）',
  },
  'h3-staging': { x: DOCK_X, z: 6, rot: Math.PI, note: 'H3 装车前的备货区（黄框里）' },
  'h3-dock-plate': { x: DOCK_X, z: 1.3, rot: Math.PI, note: 'H3 卸货板（叉车从这儿开上车斗）' },
  'h4-dock-door': { x: DOCK_X, z: 0, rot: 0, note: 'H4 收货门（墙外是卸货台，货车倒到门口的缓冲块）' },
  'h5-parts-wall': { x: PARTS.x - 1, z: PARTS.z + 1.1, rot: Math.PI, note: 'H5 喷头零件墙（6 排小格）' },
  'h5-compare': { x: PARTS.x + 1.6, z: PARTS.z + 1.6, rot: Math.PI, note: 'H5 比对台（拿着坏喷头往格子上一贴）' },
  'h6-paint-counter': { x: PAINT.x, z: PAINT.z + 1.2, rot: Math.PI, note: 'H6 调漆台（店员在柜台后面）' },
  'h6-shaker': { x: PAINT.x - 0.9, z: PAINT.z + 1.1, rot: Math.PI, note: 'H6 摇漆机（两台，按住摇）' },
  'h6-tinter': { x: PAINT.x - 4.6, z: PAINT.z + 1.1, rot: Math.PI, note: 'H6 调色机（选颜色）' },
  'h6-chips': { x: CHIPS.x, z: CHIPS.z + 0.9, rot: Math.PI, note: 'H6 色卡墙' },
  'checkout-1': { x: LANES[0] - 0.95, z: LANE_Z + 1.6, rot: Math.PI / 2, note: '1 号收银（站在台子西边的道上）' },
  'checkout-2': { x: LANES[1] - 0.95, z: LANE_Z + 1.6, rot: Math.PI / 2, note: '2 号收银' },
  'checkout-3': { x: LANES[2] - 0.95, z: LANE_Z + 1.6, rot: Math.PI / 2, note: '3 号收银' },
  'checkout-4': { x: LANES[3] - 0.95, z: LANE_Z + 1.6, rot: Math.PI / 2, note: '4 号收银' },
  'checkout-5': { x: LANES[4] - 0.95, z: LANE_Z + 1.6, rot: Math.PI / 2, note: '5 号收银' },
  'checkout-6': { x: LANES[5] - 0.95, z: LANE_Z + 1.6, rot: Math.PI / 2, note: '6 号收银' },
  'service-desk': { x: SERVICE.x, z: SERVICE.z + 1.1, rot: Math.PI, note: '服务台 · 配钥匙' },
  'garden-door': { x: W - 1.6, z: GARDEN_Z, rot: Math.PI / 2, note: '东门 → 园艺院子' },
  'aisle-A': { x: AISLE_X[0], z: RACK_Z1 + 1.5, rot: Math.PI, note: 'A 灌溉水管 过道口' },
  'aisle-B': { x: AISLE_X[1], z: RACK_Z1 + 1.5, rot: Math.PI, note: 'B 紧固件 过道口' },
  'aisle-C': { x: AISLE_X[2], z: RACK_Z1 + 1.5, rot: Math.PI, note: 'C 工具 过道口' },
  'aisle-D': { x: AISLE_X[3], z: RACK_Z1 + 1.5, rot: Math.PI, note: 'D 油漆 过道口' },
  'aisle-E': { x: AISLE_X[4], z: RACK_Z1 + 1.5, rot: Math.PI, note: 'E 建材·沙 过道口' },
  'aisle-F': { x: AISLE_X[5], z: RACK_Z1 + 1.5, rot: Math.PI, note: 'F 木料 过道口' },
  'garden-zone': { x: 72.5, z: 33, rot: Math.PI / 2, note: '园艺区（绿垫子上的盆栽、土）' },
};

/** 地上的漆 */
function floorMarks(): InFloorMarks {
  const lines: [number, number, number, number][] = [];
  // 货架两边的黄线（底层货外沿再外 0.15 米）
  // （货架两边原来各一条黄线：深色地上全是强边缘、整屏偏黄，去掉 —— 黄线只留叉车道和"保持畅通"）
  // 收货门前的备货框
  const box = (x0: number, z0: number, x1: number, z1: number) => {
    lines.push([x0, z0, x1, z0 + 0.1], [x0, z1 - 0.1, x1, z1], [x0, z0, x0 + 0.1, z1], [x1 - 0.1, z0, x1, z1]);
  };
  box(DOCK_X - 3.4, 3.4, DOCK_X + 3.4, 8.2);
  // 收货门前的"保持畅通"斑马：卸货板南边到备货框之间，0.35 米宽的黄条每 0.9 米一条
  for (let x = DOCK_X - 3.1; x < DOCK_X + 3.2; x += 0.9) lines.push([x, 2.6, x + 0.35, 3.3]);
  // 调漆柜台前、长料架前的"保持畅通"条（顾客站的地方）
  for (let x = PAINT.x - 5.8; x < PAINT.x + 5.9; x += 1.8) lines.push([x, PAINT.z + 0.75, x + 0.3, PAINT.z + 1.15]);
  // 门口的地垫边
  box(38, 46.6, 42, 49.95);
  // 收银道的停止线
  for (const x of LANES) lines.push([x - 1.45, LANE_Z - 2.9, x - 0.5, LANE_Z - 2.8]);
  return {
    lines,
    navy: [[38.1, 46.7, 41.9, 49.85]],
    // 叉车道两边的实线（1.3 米外，安全黄）：叉车走的那条路一眼看得出来
    lanes: [{ pts: FORK_ROUTE.slice(2), half: 1.3 }],
    hazard: [[0.6, 0.3, 6.4, 7.0]],
    garden: [[66, 26.5, W, D]],
    paintBand: [[64.6, 12.3, W - 0.4, 12.9]],
    oil: [
      [DOCK_X - 1.2, 4.2, 0.35],
      [DOCK_X + 1.6, 9.5, 0.25],
      [2.4, 6.4, 0.3],
      [AISLE_X[0] + 0.8, 24, 0.22],
    ],
    tyres: [FORK_ROUTE.slice(2)],
  };
}

/** 灯光圈（夜里）：过道和几个区各一盏，离镜头最近的 12 盏亮 */
function pools(): [number, number][] {
  const xs = [5, ...AISLE_X.filter((_, i) => i % 2 === 0), 63, 73];
  const zs = [4, 13, 22, 31, 40, 47];
  return xs.flatMap((x) => zs.map((z) => [x, z] as [number, number]));
}

function build(c: InteriorCtx) {
  const a = c.actx;
  const put = (id: string, x: number, z: number, rot = 0, v = 0) => {
    const { obj } = makeAsset(id, { ...a, variant: v });
    obj.position.set(x, 0, z);
    obj.rotation.y = rot;
    c.asset(obj);
    return obj;
  };
  const block = (x0: number, z0: number, x1: number, z1: number) => c.block({ x0, x1, z0, z1 });

  // ── 地、北墙的装饰 ──
  c.asset(inFloor(a, W, D, floorMarks(), pools()));
  {
    const band = inWallBand(a, W, [
      [-W / 2 + 0.4, -W / 2 + 7.6],
      [DOCK_X - W / 2 - 3.4, DOCK_X - W / 2 + 3.4],
      [PAINT.x - W / 2 - 6.2, PAINT.x - W / 2 + 6.2],
    ]);
    band.position.set(W / 2, 0, 0);
    c.asset(band);
  }

  // ── 货架（6 排合成一份）──
  const specs: InRackSpec[] = RACK_X.map((cx, i) => ({
    cx,
    z0: RACK_Z0S[i],
    bays: bays(i),
    bay: RACK_BAY,
    west: RACK_CATS[i][0],
    east: RACK_CATS[i][1],
    clay: i === CLAY_RACK ? [CLAY_SLOT] : [],
  }));
  c.asset(inRacks(a, specs));

  // 店里不动的东西：全部合成一份（一种材质一个网格）
  const fixed: InPlace[] = [];
  const add = (id: string, x: number, z: number, rot = 0, v = 0) => fixed.push({ id, x, z, rot, v });
  // 端架、促销堆头、长料架：不投影（天窗顶光；傍晚太阳低时它们在地上拉出长条抖动影子，强边缘超标）
  const flat: InPlace[] = [];
  const addFlat = (id: string, x: number, z: number, v = 0) => flat.push({ id, x, z, v });

  // ── 端架 + 过道牌 ──
  const ENDCAP_CAT = [0, 1, 2, 3, 4, 2, 3];
  RACK_X.forEach((x, i) => {
    block(x - RACK_HALF, RACK_Z0S[i] - 0.1, x + RACK_HALF, RACK_Z1);
    addFlat('in-hw-endcap', x, RACK_Z1 + 0.5, ENDCAP_CAT[i]);
    block(x - 1.5, RACK_Z1, x + 1.5, RACK_Z1 + 1.05);
  });
  // 过道牌：A（叉车过道）宽 6 米，别的 3.6 米（variant 十位 1 = 窄）
  AISLE_X.forEach((x, i) => {
    add('in-hw-aisle-sign', x, RACK_Z1 - 0.4, 0, i + (i === 0 ? 0 : 10));
  });
  // 主通道南边一排落地堆头（每排货架正前方三托，过道口空着）：漆桶、灌溉管、芥末黄沙袋、园艺、木方……
  const STACKS = [
    [3, 5, 0],
    [5, 0, 7],
    [1, 3, 2],
    [3, 5, 3],
    [7, 4, 5],
    [0, 3, 6],
    [5, 7, 3],
  ];
  RACK_X.forEach((x, i) => {
    STACKS[i].forEach((v, j) => {
      const sx = x + (j - 1) * 1.25;
      addFlat('in-hw-power-pallet', sx, 36.1, v);
      block(sx - 0.55, 35.5, sx + 0.55, 36.7);
    });
  });
  // 部门吊牌（两根细柱顶着一块牌）
  for (const [x, z, v] of [
    [72.5, 25.6, 0],
    [72.5, 12.0, 1],
    [4.6, 11.4, 2],
    [22.25, 38.6, 3],
  ] as const) {
    add('in-hw-dept-sign', x, z, 0, v);
    c.block({ x: x - 1.5, z, r: 0.15 });
    c.block({ x: x + 1.5, z, r: 0.15 });
  }

  // ── 西北：叉车充电位 + 登记台（H2）；叉车单独一份（下一关要开） ──
  add('in-hw-forklift-bay', BAY.x, BAY.z);
  block(BAY.x - 1.5, 0, BAY.x + 1.5, 0.45);
  block(BAY.x + 2.55, BAY.z - 1.6, BAY.x + 4.05, BAY.z - 0.8);
  c.asset(inMany(a, [{ id: 'in-hw-forklift', x: FORKLIFT.x, z: FORKLIFT.z }], 'in-hw-forklift'));
  block(FORKLIFT.x - 0.62, FORKLIFT.z - 1.35, FORKLIFT.x + 0.62, FORKLIFT.z + 2.0);

  // ── 北墙：收货门（H3 / H4）+ 备货区的几托货（门外那批的货板资产） ──
  add('in-hw-dock-door', DOCK_X, 0);
  addFlat('in-hw-power-pallet', DOCK_X - 2.2, 5.2, 4);
  block(DOCK_X - 2.8, 4.7, DOCK_X - 1.6, 5.7);
  addFlat('in-hw-power-pallet', DOCK_X + 2.2, 6.6, 3);
  block(DOCK_X + 1.6, 6.1, DOCK_X + 2.8, 7.1);
  put('pallet-stack', DOCK_X - 5.2, 1.4);
  block(DOCK_X - 5.8, 0.9, DOCK_X - 4.6, 1.9);

  // ── 东北：调漆台（H6）+ 色卡墙 ──
  add('in-hw-paint-counter', PAINT.x, PAINT.z);
  block(PAINT.x - 6.05, PAINT.z - 0.5, PAINT.x + 6.05, PAINT.z + 0.5);
  block(PAINT.x - 6, 0, PAINT.x + 6, 0.65);
  add('in-hw-paint-chips', CHIPS.x, CHIPS.z);
  block(CHIPS.x - 2.2, CHIPS.z - 0.35, CHIPS.x + 2.2, CHIPS.z + 0.35);

  // ── 东：长料架（H1）──
  for (const l of LONG) {
    addFlat('in-hw-long-rack', l.x, l.z, l.v);
    block(l.x - 6.1, l.z - 0.2, l.x + 6.1, l.z + 1.65);
  }

  // ── 园艺区（东门两边，绿垫子）：几托土和小盆栽、几床盆栽仙人掌（门外那批的资产）──
  for (const [x, z] of [
    [67.6, 28.2],
    [69, 28.2],
    [70.4, 28.2],
    [74.6, 28.2],
    [76, 28.2],
    [77.4, 28.2],
    [67.6, 30.4],
    [69, 30.4],
    [76, 30.4],
    [77.4, 30.4],
  ] as const) {
    addFlat('in-hw-power-pallet', x, z, 7);
    block(x - 0.55, z - 0.6, x + 0.55, z + 0.6);
  }
  for (const [x, z, v] of [
    [69, 42, 0],
    [75, 42, 1],
    [69, 45.5, 2],
    [75, 45.5, 0],
  ] as const) {
    put('nursery-cacti', x, z, 0, v);
    block(x - 2, z - 0.6, x + 2, z + 0.6);
  }
  // 前区西边（收银西头）：两排堆头
  for (const [x, z, v] of [
    [3, 38, 3],
    [4.4, 38, 4],
    [5.8, 38, 3],
    [3, 41.5, 6],
    [4.4, 41.5, 6],
    [5.8, 41.5, 5],
  ] as const) {
    addFlat('in-hw-power-pallet', x, z, v);
    block(x - 0.55, z - 0.6, x + 0.55, z + 0.6);
  }

  // ── 东墙门 → 园艺院子 ──
  add('in-hw-garden-door', W, GARDEN_Z);
  for (const s of [-1, 1]) c.block({ x: W - 0.6, z: GARDEN_Z + s * 3.7, r: 0.4 });

  // ── 西：喷头零件墙（H5）+ 三托促销 ──
  add('in-hw-parts-wall', PARTS.x, PARTS.z);
  block(PARTS.x - 3.5, PARTS.z - 0.3, PARTS.x + 3.5, PARTS.z + 0.3);
  block(PARTS.x + 0.8, PARTS.z + 0.65, PARTS.x + 2.4, PARTS.z + 1.25);
  // 西边第二面零件墙（接头、阀门）+ 几托灌溉货
  add('in-hw-parts-wall', PARTS.x, 21, 0, 1);
  block(PARTS.x - 3.5, 20.7, PARTS.x + 3.5, 21.3);
  for (const [x, z, v] of [
    [2.4, 25, 5],
    [3.8, 25, 0],
    [5.2, 25, 5],
    [6.6, 25, 7],
    [2.4, 28.6, 0],
    [3.8, 28.6, 5],
    [6.6, 28.6, 0],
  ] as const) {
    addFlat('in-hw-power-pallet', x, z, v);
    block(x - 0.55, z - 0.6, x + 0.55, z + 0.6);
  }

  // ── 南：收银 4 道、服务台、门口的促销堆头 ──
  LANES.forEach((x, i) => {
    add('in-hw-checkout', x, LANE_Z, 0, i);
    block(x - 0.48, LANE_Z - 2.6, x + 0.48, LANE_Z + 2.85);
  });
  add('in-hw-service-desk', SERVICE.x, SERVICE.z);
  block(SERVICE.x - 5.05, SERVICE.z - 0.5, SERVICE.x + 5.05, SERVICE.z + 0.5);
  block(SERVICE.x - 5, SERVICE.z - 1.95, SERVICE.x + 5, SERVICE.z - 1.25);
  // 进门正前方：两组端架岛（朝南）+ 门两边的堆头
  for (const [x, v] of [
    [37.4, 3],
    [42.6, 0],
  ] as const) {
    addFlat('in-hw-endcap', x, 39.4, v);
    block(x - 1.5, 38.9, x + 1.5, 39.95);
  }
  for (const [x, z, v] of [
    [37.2, 42.4, 5],
    [42.8, 42.4, 3],
    [61, 38.5, 3],
    [62.4, 38.5, 5],
    [61, 40.6, 4],
    [62.4, 40.6, 0],
    [61, 44.5, 6],
    [62.4, 44.5, 6],
  ] as const) {
    addFlat('in-hw-power-pallet', x, z, v);
    block(x - 0.55, z - 0.6, x + 0.55, z + 0.6);
  }
  c.asset(inMany(a, fixed, 'in-hw-hardware-fixed'));
  const low = inMany(a, flat, 'in-hw-hardware-displays');
  low.traverse((o) => {
    o.userData.noCast = true;
  });
  c.asset(low);

  // ── 门口：平板推车（H1，一份；下一关要推）、购物车栏 ──
  c.asset(
    inMany(
      a,
      FLATBEDS.map((x) => ({ id: 'in-hw-flatbed', x, z: FLATBED_Z })),
      'in-hw-flatbeds',
    ),
  );
  for (const x of FLATBEDS) block(x - 0.4, FLATBED_Z - 0.85, x + 0.4, FLATBED_Z + 0.85);
  put('cart-corral', 34.5, 46.6, Math.PI);
  block(32.9, 45.9, 36.1, 47.3);
}

export const INTERIOR_HARDWARE: InteriorDef = {
  id: 'hardware',
  name: '五金大超市',
  w: W,
  d: D,
  floor: 'concrete',
  wall: 'roofMetal',
  poi: 'p_hardware',
  build,
};
