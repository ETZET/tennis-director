// 整座俱乐部的微缩地图（一座浮空岛）：只定"什么在哪、多大"，不画细节。单位米，y 朝上，+x 画面右，+z 朝镜头（画面下方 = 地图的前面）。
// 球场按真尺寸：双打 23.77 × 10.97，单打宽 8.23，发球线离网 6.40；一片场连缓冲区 36.6 × 18.3（连在一起的场共用缓冲区）。
//
//   z −176 ┌──────────── 岛后沿 ────────────┐
//          │  草地台 (+2.4)：草地场 ×4（一排）    │  ← 最里面：草地
//   z −128 │▓▓▓▓▓▓▓▓▓ 草地台挡土墙 ▓▓ 台阶 ▓▓▓▓▓▓▓│
//          │ 硬地场 ×6     ┃中┃     红土场 ×6     │  ← 球场台 (+1.2)：左硬地、右红土，各 2 列 × 3 排
//          │ （2 × 3）     ┃央┃     （2 × 3）     │
//          │               ┃步┃                   │
//          │               ┃道┃                   │
//   z −12  │▓▓▓▓▓▓▓▓▓ 球场台挡土墙 ▓▓ 台阶 ▓▓▓▓▓▓▓│
//          │ 遮阳观赛坡   棕榈喷泉广场   练习墙 · 儿童小场 │  ← 中间：访客也能用的地方
//          │ 露台咖啡吧                               │
//   z +22  │ 商店（球拍专卖店）  穿线店 ┃  球员休息室    │  ← 前台后面：公共区
//          │              露天前台                   │
//   z +56  │▓▓▓▓▓▓▓▓▓ 前墙（女儿墙）▓ 大门 ▓▓▓▓▓▓▓▓▓│
//          │ 入口花园      到达广场        停车场      │  ← 最前面：到达
//   z +90  └──────────── 岛前沿 ────────────┘
export type V2 = [number, number];

/** 层高（米） */
export const H = {
  arrival: -1.2,
  club: 0,
  courts: 1.2,
  grass: 2.4,
  skirt: -4.4,
  bottom: -16,
};

/** 一片球场：双打宽、长，单打宽，发球线离网；连缓冲区的一格 */
export const COURT = { dw: 10.97, len: 23.77, sw: 8.23, svc: 6.4, cellW: 18.3, cellL: 36.6, netH: 1.07 };

/** 矩形 */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 浮空岛（岛顶 = 到达区），粗点，Catmull-Rom 平滑 */
export const ISLAND: V2[] = [
  [-46, -177],
  [0, -179],
  [46, -177],
  [49, -120],
  [48, -40],
  [49.5, 30],
  [48, 88],
  [20, 91],
  [-20, 90],
  [-48, 88],
  [-49.5, 30],
  [-48, -40],
  [-49, -120],
];

/** 三层台面（矩形，四角圆一点） */
export const TERRACES = {
  club: { x0: -45, x1: 45, z0: -12, z1: 56, h: H.club },
  courts: { x0: -45, x1: 45, z0: -128, z1: -12, h: H.courts },
  grass: { x0: -45, x1: 45, z0: -174, z1: -128, h: H.grass },
} as const;

/** 球场块：每块是 cols × rows 格（格子 18.3 × 36.6），场地长轴沿 z */
export interface CourtBlock {
  id: string;
  label: string;
  kind: 'hard' | 'clay' | 'grass';
  x0: number;
  z0: number;
  cols: number;
  rows: number;
  y: number;
}
export const BLOCKS: CourtBlock[] = [
  { id: 'hard', label: '硬地场 ×6', kind: 'hard', x0: -40.6, z0: -126, cols: 2, rows: 3, y: H.courts },
  { id: 'clay', label: '红土场 ×6', kind: 'clay', x0: 4.0, z0: -126, cols: 2, rows: 3, y: H.courts },
  { id: 'grass', label: '草地场 ×4', kind: 'grass', x0: -36.6, z0: -167.6, cols: 4, rows: 1, y: H.grass },
];
export const blockRect = (b: CourtBlock): Rect => ({
  x0: b.x0,
  x1: b.x0 + b.cols * COURT.cellW,
  z0: b.z0,
  z1: b.z0 + b.rows * COURT.cellL,
});

/** 前墙（俱乐部台面南沿的女儿墙）：大门豁口 x −2.6…2.6 */
export const FRONT_WALL = { z: 56, h: 0.6, gap: [-2.6, 2.6] as V2 };
/** 大门：两根柱 + 横梁 + 招牌 */
export const GATE = { x: 0, z: 55.6, span: 5.6, h: 4.2 };

/** 台阶（中轴上，每次升一层）：x0..x1，顶在 z0，往 +z 下到 to */
export const STAIRS = [
  { x0: -3, x1: 3, z0: 56, steps: 4, run: 0.4, from: H.club, to: H.arrival },
  { x0: -3, x1: 3, z0: -12, steps: 4, run: 0.4, from: H.courts, to: H.club },
  { x0: -3, x1: 3, z0: -128, steps: 4, run: 0.4, from: H.grass, to: H.courts },
];

/** 步道（矩形，石板）：中轴从到达广场一直到草地；球场台前一条横的；球场块之间的中央步道 */
export const WALKS: (Rect & { y: number })[] = [
  { x0: -3, x1: 3, z0: 51.5, z1: 56, y: H.club },
  { x0: -3, x1: 3, z0: 15, z1: 45, y: H.club },
  { x0: -3, x1: 3, z0: -12, z1: -7, y: H.club },
  { x0: -44, x1: 44, z0: 18.5, z1: 22, y: H.club },
  { x0: -44, x1: 44, z0: -16, z1: -12, y: H.courts },
  { x0: -4, x1: 4, z0: -128, z1: -16, y: H.courts },
  { x0: -44, x1: 44, z0: -128, z1: -126, y: H.courts },
  { x0: -3, x1: 3, z0: -130, z1: -128, y: H.grass },
];

/** 到达广场（落客区，石板）和停车场（沥青）、进岛的车道 */
export const DROPOFF: Rect = { x0: -11, x1: 11, z0: 58, z1: 69 };
export const LOT: Rect = { x0: 13, x1: 45, z0: 59, z1: 86 };
export const ROAD: Rect = { x0: 11, x1: 50, z0: 70, z1: 75 };

/** 建筑：盒子 + 一种功能一个颜色的平屋顶（略出檐） */
export interface Building extends Rect {
  id: string;
  label: string;
  h: number;
  roof: 'counter' | 'roofString' | 'roofLounge' | 'fabricStripe';
}
export const BUILDINGS: Building[] = [
  { id: 'shop', label: '商店（球拍专卖店）', x0: -40, x1: -20, z0: 27, z1: 39, h: 5, roof: 'counter' },
  { id: 'stringing', label: '穿线店', x0: -16, x1: -6, z0: 28, z1: 38, h: 4, roof: 'roofString' },
  { id: 'lounge', label: '球员休息室（更衣、理疗）', x0: 6, x1: 40, z0: 25, z1: 39, h: 6, roof: 'roofLounge' },
  { id: 'cafe', label: '露台咖啡吧', x0: -42, x1: -28, z0: 3, z1: 13, h: 4.2, roof: 'fabricStripe' },
];

/** 露天前台（凉棚 + 柜台），在大门里面、中轴上 */
export const DESK = { x: 0, z: 48.2, w: 8.4, d: 4.2, h: 3.5 };

/** 公共区的陶砖铺地（建筑前后、前台四周） */
export const TILES: Rect[] = [
  { x0: -44, x1: 44, z0: 22, z1: 44 },
  { x0: -12, x1: 12, z0: 44, z1: 55.4 },
];

/** 中间：棕榈喷泉广场（陶砖圆 + 水池 + 一圈棕榈）、咖啡吧露台、遮阳观赛坡、练习墙和儿童小场 */
export const FOUNTAIN = { x: 0, z: 4, r: 11, water: 4.5, palms: 8.6 };
export const CAFE_TERRACE: Rect = { x0: -28, x1: -15, z0: 1, z1: 15 };
export const VIEW_LAWN: Rect = { x0: -44, x1: -14, z0: -11.5, z1: -1 };
export const PRACTICE: Rect = { x0: 15, x1: 44, z0: -11, z1: 16 };
/** 练习墙（朝南，挨着球场台挡土墙）和墙前的硬地 */
export const HIT_WALL = { x0: 19, x1: 33, z: -10, h: 3.4 };
export const HIT_PAD: Rect = { x0: 17, x1: 35, z0: -10, z1: 1 };
/** 儿童小场（红球场 11 × 5.5，场地 13 × 8） */
export const MINI_COURTS: Rect[] = [
  { x0: 18, x1: 26, z0: 3, z1: 16 },
  { x0: 28.5, x1: 36.5, z0: 3, z1: 16 },
];

/** 地标（复用 desert3d-v2 的植物，只为认路）：asset、x、z、y、s */
export const LANDMARKS: { asset: string; x: number; z: number; y: number; s?: number; v?: number }[] = [
  // 喷泉一圈棕榈（6 棵）
  ...[0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    return {
      asset: 'fan-palm',
      x: FOUNTAIN.x + Math.cos(a) * FOUNTAIN.palms,
      z: FOUNTAIN.z + Math.sin(a) * FOUNTAIN.palms,
      y: H.club,
      v: i % 3,
      s: 0.8,
    };
  }),
  // 入口花园
  { asset: 'fan-palm', x: -30, z: 66, y: H.arrival, v: 1 },
  { asset: 'fan-palm', x: -20, z: 78, y: H.arrival, v: 0 },
  { asset: 'palo-verde', x: -38, z: 80, y: H.arrival, v: 1 },
  { asset: 'creosote', x: -26, z: 74, y: H.arrival },
  { asset: 'agave', x: -16, z: 66, y: H.arrival },
  { asset: 'rocks', x: -36, z: 70, y: H.arrival, v: 2 },
  // 大门两边、前墙里面
  { asset: 'fan-palm', x: -9, z: 52, y: H.club, v: 2, s: 0.9 },
  { asset: 'fan-palm', x: 9, z: 52, y: H.club, v: 0, s: 0.9 },
  // 遮阳观赛坡的两张遮阳帆
  { asset: 'shade-sail', x: -35, z: -6, y: H.club, s: 1.4 },
  { asset: 'shade-sail', x: -23, z: -6, y: H.club, s: 1.4 },
  // 球场台、草地台边上几棵树
  { asset: 'smoke-tree', x: 43, z: -70, y: H.courts },
  { asset: 'smoke-tree', x: -43, z: -100, y: H.courts },
  { asset: 'palo-verde', x: 41.5, z: -150, y: H.grass, v: 0 },
  { asset: 'palo-verde', x: -41.5, z: -140, y: H.grass, v: 1 },
];

/** 人（比例尺）：总监在前台后面，两个会员在柜台前 */
export const PEOPLE: { asset: string; x: number; z: number; rotY: number; v?: number }[] = [
  { asset: 'director', x: 0.4, z: 49.7, rotY: 0 },
  { asset: 'player', x: -0.6, z: 51.6, rotY: Math.PI, v: 0 },
  { asset: 'player', x: 1.6, z: 52.8, rotY: Math.PI, v: 1 },
];

/** 中文标签：文字、位置（x, y, z） */
export const LABELS: { text: string; x: number; y: number; z: number; big?: boolean }[] = [
  { text: '停车场', x: 29, y: 1, z: 72 },
  { text: '到达广场（落客区）', x: 0, y: 0, z: 64 },
  { text: '入口花园', x: -30, y: 2, z: 76 },
  { text: '大门', x: 9.5, y: 0.6, z: 58.5 },
  { text: '露天前台', x: 0, y: 9, z: 48.2, big: true },
  { text: '商店（球拍专卖店）', x: -30, y: 6, z: 33 },
  { text: '穿线店', x: -11, y: 5, z: 33 },
  { text: '球员休息室（更衣、理疗）', x: 23, y: 7, z: 32 },
  { text: '露台咖啡吧', x: -28, y: 5, z: 8 },
  { text: '棕榈喷泉广场', x: 0, y: 2, z: 4 },
  { text: '遮阳观赛坡', x: -29, y: 4.5, z: -5 },
  { text: '练习墙 · 儿童小场', x: 29.5, y: 4, z: 2 },
  { text: '硬地场 ×6', x: -22.3, y: 3, z: -71, big: true },
  { text: '红土场 ×6', x: 22.3, y: 3, z: -71, big: true },
  { text: '草地场 ×4', x: 0, y: 4, z: -149, big: true },
];

/** 屏幕范围（俯角 45°）：横向 x ±XSPAN，竖向 v = 0.707·(y − z) 在 [VMIN, VMAX]（自动取景用） */
export const FRAME = { xspan: 50, vmin: Math.SQRT1_2 * (H.skirt - 91), vmax: Math.SQRT1_2 * (H.grass + 3 + 179) };
