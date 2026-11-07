// 场景布局：直接在参考截图（1280×720，每纹素 2 像素）上描点，再按相机换算成世界坐标。
// 相机：正交、俯角 45°、yaw 0（看向 -z = 北），每纹素 1/16 米；参考图中心 (640, 360) 对着世界原点、高度 0。
// 单位：米，y 朝上。地面 0；池塘水面 -2；北边和房子那块高台 +1.6。

export const MPT = 1 / 16;
export const PITCH = 45;
const P = (PITCH * Math.PI) / 180;

export const H = {
  water: -2.0,
  floor: -2.7,
  base: 0,
  up: 1.6,
};

export type V2 = [number, number];

/** 参考图像素 (X, Y) 在高度 h 上 → 世界 (x, z) */
export function ref(X: number, Y: number, h = 0): V2 {
  const x = ((X - 640) * MPT) / 2;
  const z = (((Y - 360) * MPT) / 2 + h * Math.cos(P)) / Math.sin(P);
  return [x, z];
}

export const refPoly = (pts: V2[], h = 0): V2[] => pts.map(([X, Y]) => ref(X, Y, h));

/** 池塘岸线（地面高度上描的岸顶） */
export const POND: V2[] = refPoly([
  [335, 295],
  [380, 240],
  [420, 215],
  [520, 197],
  [640, 193],
  [760, 200],
  [860, 222],
  [960, 242],
  [1060, 272],
  [1130, 315],
  [1180, 370],
  [1215, 430],
  [1228, 490],
  [1215, 535],
  [1150, 585],
  [1050, 606],
  [950, 625],
  [860, 630],
  [790, 626],
  [740, 622],
  [640, 600],
  [560, 590],
  [450, 575],
  [380, 545],
  [330, 512],
  [298, 478],
  [290, 445],
  [292, 400],
  [305, 340],
]);

/** 高台：在参考图上描的墙顶边（屏幕坐标），h 是台面高度。超出画面的点随便往外放。
 * 参考图北边是三级：池边一条平地（0）、中间一级矮台（0.8，墙约 18 像素高）、最北一级和房子那块高台（1.6）。 */
const PLATS_SCR: { pts: V2[]; h: number }[] = [
  {
    h: H.up,
    pts: [
      [-200, -200],
      [1500, -200],
      [1500, 5],
      [1185, 15],
      [1000, 35],
      [865, 52],
      [760, 82],
      [700, 70],
      [650, 55],
      [625, 25],
      [560, 42],
      [505, 48],
      [470, 80],
      [445, 108],
      [442, 150],
      [420, 155],
      [400, 160],
      [388, 200],
      [362, 232],
      [325, 262],
      [292, 276],
      [240, 268],
      [200, 262],
      [150, 256],
      [100, 250],
      [40, 244],
      [-200, 244],
    ],
  },
  {
    h: 0.8,
    pts: [
      [690, -100],
      [1500, -100],
      [1500, 20],
      [1290, 20],
      [1180, 30],
      [1120, 60],
      [1075, 95],
      [1030, 100],
      [995, 115],
      [960, 140],
      [930, 160],
      [860, 166],
      [800, 165],
      [750, 148],
      [738, 110],
      [712, 82],
    ],
  },
  // 西南角的小土台
  {
    h: 0.9,
    pts: [
      [-200, 300],
      [40, 285],
      [85, 282],
      [112, 300],
      [108, 330],
      [60, 336],
      [-200, 340],
    ],
  },
];
export const PLATEAUS: { pts: V2[]; h: number }[] = PLATS_SCR.map((p) => ({ h: p.h, pts: refPoly(p.pts, p.h) }));

function inPoly(x: number, y: number, pts: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** 参考图上一个点（落在某个台面上）所在的地面高度：取包含它的最高台面 */
export function groundAt(X: number, Y: number): number {
  let h = 0;
  for (const p of PLATS_SCR) if (p.h > h && inPoly(X, Y, p.pts)) h = p.h;
  return h;
}
/** 参考图上的点 → 世界 (x, z) + 地面高度 */
const onGround = (X: number, Y: number) => {
  const h = groundAt(X, Y);
  return { at: ref(X, Y, h), h };
};

/** 石板路（中心线 + 宽度，米），h 是所在地面 */
export const PATHS: { line: V2[]; w: number; h: number }[] = [
  {
    h: 0,
    w: 2.7,
    line: refPoly([
      [190, 304],
      [168, 345],
      [152, 395],
      [158, 440],
      [178, 482],
      [196, 522],
      [222, 566],
      [262, 604],
      [320, 636],
      [400, 662],
      [480, 690],
      [560, 730],
      [600, 780],
    ]),
  },
  // 东边树下的一片
  {
    h: 0,
    w: 2.0,
    line: refPoly([
      [1130, 190],
      [1160, 230],
      [1185, 270],
      [1210, 320],
      [1250, 340],
      [1300, 345],
    ]),
  },
];

/** 石板小块（地面上的几片） */
export const SLABS: { at: V2; r: number; h: number }[] = [
  { at: ref(70, 620), r: 1.0, h: 0 },
  { at: ref(860, 668), r: 0.9, h: 0 },
  { at: ref(1220, 690), r: 1.3, h: 0 },
  { at: ref(1270, 400), r: 1.0, h: 0 },
  { at: ref(655, 148), r: 1.5, h: 0 },
  { at: ref(196, 243, H.up), r: 1.05, h: H.up },
  { ...onGround(800, 92), r: 1.0 },
];

/** 楼梯：从房子高台下到地面 */
export const STAIRS = { top: ref(192, 250, H.up), bottom: ref(192, 325, 0), w: 2.0, steps: 9 };

export const DOCK = {
  /** 主栈桥：从岸上（南）伸到水上（北）；参考图里斜约 13° */
  from: ref(624, 745, 0),
  to: ref(692, 540, 0),
  w: 3.3,
  /** 侧边小平台：栈桥中段往西 */
  side: { from: ref(648, 585, 0), to: ref(540, 575, 0), w: 1.9 },
  y: 0.08,
  /** 这条 z 往南栈桥下面是草地（木板缝里透绿） */
  shoreZ: ref(640, 604, 0)[1],
};

export const FISHER = ref(685, 567, 0);
export const CRATE = ref(578, 582, 0);
/** 栈桥东沿的小孩（参考图里那个蓝色圆身子） */
export const BUCKET = ref(716, 603, 0);
export const JUNCTION_STUB = ref(622, 600, 0);
export const LAMP_POST = ref(737, 582, 0);
const rodTip = ref(758, 482, 2.7);
export const ROD_TIP: [number, number, number] = [rodTip[0], 2.7, rodTip[1]];
const bob = ref(797, 495, H.water);
export const BOBBER: [number, number, number] = [bob[0], H.water + 0.05, bob[1]];
export const ROCK = ref(978, 570, H.water);

export const LILIES: { at: V2; r: number; flower?: boolean }[] = [
  { at: ref(615, 307, H.water), r: 0.52 },
  { at: ref(775, 333, H.water), r: 0.45 },
  { at: ref(870, 322, H.water), r: 0.6 },
  { at: ref(405, 352, H.water), r: 0.95, flower: true },
  { at: ref(420, 432, H.water), r: 0.7 },
  { at: ref(988, 442, H.water), r: 0.8, flower: true },
  { at: ref(1013, 490, H.water), r: 0.55, flower: true },
  { at: ref(1047, 393, H.water), r: 0.7, flower: true },
  { at: ref(1033, 603, H.water), r: 0.55, flower: true },
  { at: ref(424, 503, H.water), r: 0.62 },
];

/** 芦苇丛：中心 + 半径 + 根数 */
export const REEDS: { at: V2; r: number; n: number }[] = [
  { at: ref(685, 250, H.water), r: 1.0, n: 9 },
  { at: ref(612, 245, H.water), r: 0.3, n: 2 },
  { at: ref(395, 548, H.water), r: 0.7, n: 6 },
  { at: ref(430, 545, H.water), r: 0.3, n: 2 },
  { at: ref(1110, 570, H.water), r: 0.8, n: 6 },
  { at: ref(310, 432, H.water), r: 0.6, n: 5 },
  { at: ref(1090, 395, H.water), r: 0.5, n: 3 },
  { at: ref(385, 300, H.water), r: 0.3, n: 2 },
  { at: ref(905, 618, H.water), r: 0.9, n: 5 },
  { at: ref(1120, 415, H.water), r: 0.2, n: 1 },
];

/** 树：根部在参考图上的位置（高度自动取所在台面）、树冠半径、树干高 */
export const TREES: { at: V2; h: number; r: number; trunk: number }[] = (
  [
    [455, 22, 2.2, 1.6],
    [730, 50, 2.0, 1.8],
    [907, 97, 2.1, 1.8],
    [1110, 145, 2.2, 1.8],
    [1210, 97, 2.0, 1.7],
    [985, 180, 1.6, 1.3],
    [1155, 275, 2.3, 2.0],
    [262, 660, 2.2, 1.6],
    [8, 322, 2.0, 1.6],
    [570, 97, 2.0, 1.8],
    [1265, 230, 2.0, 1.8],
    [640, -20, 2.2, 1.8],
    [820, 10, 2.1, 1.8],
    [1020, 20, 2.2, 1.8],
    [1270, 40, 2.0, 1.8],
    [500, -30, 2.0, 1.6],
  ] as const
).map(([X, Y, r, trunk]) => ({ ...onGround(X, Y), r, trunk }));

export const BUSHES: { at: V2; h: number; r: number }[] = (
  [
    [40, 412, 1.0],
    [55, 515, 0.9],
    [148, 556, 1.05],
    [160, 628, 1.0],
    [395, 612, 0.95],
    [470, 138, 0.9],
    [990, 230, 0.8],
    [800, 128, 1.0],
    [1040, 218, 1.1],
    [1185, 368, 1.0],
    [1225, 350, 0.9],
    [1258, 468, 1.0],
    [1258, 610, 1.0],
    [305, 690, 1.0],
    [1070, 705, 0.9],
    [1000, 92, 1.1],
    [690, 108, 1.0],
    [92, 300, 0.8],
  ] as const
).map(([X, Y, r]) => ({ ...onGround(X, Y), r }));

/** 小石头（岸边、草地上） */
export const PEBBLES: { at: V2; h: number; r: number }[] = [
  ...[
    [470, 205],
    [575, 182],
    [630, 180],
    [700, 183],
    [760, 188],
    [925, 216],
    [955, 214],
    [1050, 260],
    [1090, 255],
    [300, 345],
    [285, 515],
    [440, 568],
    [870, 640],
    [1170, 600],
    [1250, 520],
    [935, 640],
    [1215, 225],
  ].map(([X, Y]) => ({ at: ref(X, Y), h: 0, r: 0.25 + ((X * 7 + Y) % 5) * 0.04 })),
];

export const HOUSE = { at: ref(224, 147, H.up), h: H.up, yaw: -0.27, scale: 1.15 };

/** 云影（手摆的软边椭圆，x, z, rx, rz；会按 uTime 慢慢往东飘，这里写的是 t = 20 秒时的位置） */
const cloudAt = (X: number, Y: number, h: number, rx: number, rz: number): [number, number, number, number] => {
  const [x, z] = ref(X, Y, h);
  return [x - 1.0, z - 0.4, rx, rz];
};
export const CLOUDS: [number, number, number, number][] = [
  cloudAt(300, 440, 0, 5.6, 5.4),
  cloudAt(250, 92, 4.6, 1.3, 2.2),
];

/** 水面上的云倒影（x, z, rx, rz；t = 20 秒时的位置，会慢慢往东飘） */
export const reflAt = (X: number, Y: number, rx: number, rz: number): [number, number, number, number] => {
  const [x, z] = ref(X, Y, H.water);
  return [x - 0.4, z, rx, rz];
};
export const CLOUD_REFL: [number, number, number, number][] = [reflAt(352, 412, 2.4, 2.3), reflAt(470, 528, 4.8, 1.7)];

/** 冬天池塘中间不结冰的一片（椭圆 x, z, rx, rz，米），照参考图描的 */
const ow = ref(700, 492, H.water);
export const OPEN_WATER: [number, number, number, number] = [ow[0], ow[1], 9.6, 6.2];
