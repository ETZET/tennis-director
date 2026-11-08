// desert3d-v2 的构图（手摆，不是程序撒点）。单位米，y 朝上；相机 yaw 0：+x 画面右，+z 朝镜头（画面下方）。
// 屏幕竖直坐标 v = y·cos45° − z·sin45°（每纹素 MPT 米）。
//
//   z −30 ┌──────────────────────────── 岛后沿 ───────────────────────────┐
//         │  台地 MESA (+4)  ▓▓ 崖壁暗带 ▓▓              北台 NORTH (+2)   │  ← 蒲葵林、烟树：画面上方的框
//   z −17 │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 北台崖壁（暗带，投影落到球场北端） ▓▓▓▓▓▓▓ │  ← 遮阳帆 + 长椅俯看球场
//         │ 西台 WEST(+1)┃                                   ┃            │
//         │ 假紫荆      ┃        球场台地 COURT (0)          ┃  东侧低地   │
//         │             ┃   ┌───── 硬地铺面（英雄）─────┐    ┃   (−2)      │
//         │ ▓▓▓▓▓▓▓▓▓▓▓ ┃   │        球网 / 裁判椅      │    ┃            │
//         │   (西台南沿) ┃   └──────────────────────────┘    ┃            │
//   z +16 │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 球场台地南崖（暗带）▓▓▓▓ 台阶 ▓▓▓▓▓▓▓▓▓▓▓▓▓ │
//         │  低地 LOW (−2)：绿洲池 + 蒲葵（左下框）   步道弯向右下 → 岛东沿 │
//   z +27 └──────────────────────────── 岛前沿（岛底在下）──────────────────┘
//
// 原则：一个主角（球场），大块安静的亮沙，三条暗带（台地/台阶的崖壁）把画面分层，步道把视线从右下引到球场，
// 两团高的框（左上蒲葵、左下绿洲）+ 一团中等（西台假紫荆），其余地方空着。
export type V2 = [number, number];

/** 最终缩放：米/纹素（每纹素 2 CSS 像素）。人 1.8 米 ≈ 14 纹素宽的 Q 版人物 ≈ 20 纹素高（含夸张的头） */
export const MPT = 0.09;
export const PITCH = 45;

/** 各层高度 */
export const H = {
  low: -1.6,
  court: 0,
  west: 1.0,
  north: 1.6,
  mesa: 3.4,
  water: -2.3,
  /** 浮空岛：崖壁下到这里，再往下是收拢的岛底 */
  skirt: -4.2,
  bottom: -12,
};

/** 球场（标准尺寸）；铺面比标准缓冲区窄一点（荒废的社区球场） */
export const COURT = {
  hw: 10.97 / 2,
  hl: 23.77 / 2,
  shw: 8.23 / 2,
  service: 6.4,
  padHw: 7.0,
  padHl: 14.2,
  netH: 0.914,
  postH: 1.07,
};

/** 台地轮廓（粗点，terrain 用 Catmull-Rom 平滑）。顺序：顺着轮廓走一圈即可（方向无所谓） */
export const ISLAND: V2[] = [
  [-27, -29],
  [-10, -30.5],
  [8, -30],
  [27, -28.5],
  [28.5, -12],
  [27.5, 6],
  [28.5, 20],
  [26, 27],
  [12, 27.5],
  [0, 26.5],
  [-12, 27.5],
  [-26.5, 26],
  [-28.5, 10],
  [-27.5, -10],
];

/** 球场台地（y 0）：北边伸到北台下面（被盖住），南沿是画面中下部的暗带，东南角圆 */
export const COURT_TERRACE: V2[] = [
  [-20, -24],
  [12.5, -24],
  [12.5, -6],
  [11.5, 6],
  [11.8, 12.5],
  [10, 15.6],
  [5.6, 15.9],
  [3.4, 15.7],
  [-2, 16.4],
  [-8, 15.6],
  [-13, 16.2],
  [-17, 15],
  [-20, 8],
];

/** 北台（y +2）：南沿在 z ≈ −16.6 附近起伏，崖壁朝镜头 */
export const NORTH_TERRACE: V2[] = [
  [-26, -28],
  [26, -27.5],
  [26.5, -14],
  [21, -13.2],
  [16, -15.4],
  [11, -16.4],
  [5, -16.9],
  [-1, -16.5],
  [-6, -17.2],
  [-10, -16.4],
  [-14, -14.6],
  [-26, -14.8],
];

/** 台地（y +4）：西北角，南沿鼓出来 */
export const MESA: V2[] = [
  [-25.5, -27.5],
  [-4, -27.5],
  [-2.5, -24.5],
  [-5, -21.2],
  [-10, -20.4],
  [-16, -21.4],
  [-21, -19.6],
  [-25.5, -21],
];

/** 西台（y +1）：东沿贴着竖屏左边（x ≈ −8.4），南沿退两步 → 两条短暗带 */
export const WEST_TERRACE: V2[] = [
  [-27, -16],
  [-11, -16],
  [-8.4, -13.5],
  [-8.3, -5],
  [-9.0, -2.6],
  [-11.6, -1.8],
  [-12.2, 3],
  [-14, 7.4],
  [-19, 8.4],
  [-27, 7],
];

/** 东台（y +1）：东侧低地上的一块岩台，南沿朝镜头 → 横屏右边的框（竖屏看不到） */
export const EAST_TERRACE: V2[] = [
  [15.5, -12.5],
  [26.5, -13.5],
  [27, 9],
  [22, 11.2],
  [18.6, 9.4],
  [15.8, 4],
  [14.6, -4],
];

/** 绿洲池（低地上挖的洞，岸顶 y −2） */
export const POOL: V2[] = [
  [-8.6, 19.6],
  [-6, 18.7],
  [-2.6, 19.0],
  [-0.6, 20.4],
  [-1.2, 22.4],
  [-4.2, 23.3],
  [-7.6, 22.9],
  [-9.4, 21.4],
];

/** 台阶：从球场台地南沿下到低地（朝镜头），每级 rise × run */
export const STAIRS = {
  x0: 3.6,
  x1: 5.6,
  /** 顶部（台地南沿）z */
  z0: 15.7,
  steps: 6,
  run: 0.42,
  from: H.court,
  to: H.low,
};

/** 步道中线（每段在一层上）。宽度米 */
export const PATHS: { level: number; w: number; pts: V2[] }[] = [
  // 低地：台阶脚下 → 弯向右下 → 岛东沿（人从这里来）
  {
    level: H.low,
    w: 1.9,
    pts: [
      [4.6, 18.0],
      [5.4, 20.4],
      [8.2, 22.4],
      [12.6, 22.8],
      [17.5, 21.4],
      [22.5, 21.8],
      [27.5, 23.4],
    ],
  },
  // 球场台地：台阶顶 → 铺面东南角的门
  {
    level: H.court,
    w: 1.7,
    pts: [
      [4.6, 16.0],
      [4.7, 15.0],
      [5.0, 13.6],
    ],
  },
];

/** 资产位置（占位或资产）。id 唯一；asset = assets/<asset>.ts；rotY 弧度；s 缩放；y 不填 = 所在层的地面 */
export interface Slot {
  id: string;
  asset: string;
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  s?: number;
  variant?: number;
}

const L = H.low;
const N = H.north;
const W = H.west;
const M = H.mesa;

export const SLOTS: Slot[] = [
  // 主角
  { id: 'court', asset: 'court', x: 0, z: 0, y: 0 },
  { id: 'net', asset: 'net', x: 0, z: 0, y: 0.03 },
  { id: 'umpire', asset: 'umpire-chair', x: 7.0, z: 0.6, y: 0, rotY: -Math.PI / 2 },
  { id: 'hopper', asset: 'ball-hopper', x: -5.9, z: -12.6, y: 0 },
  { id: 'bench-court', asset: 'bench', x: 9.3, z: 5.2, y: 0, rotY: -Math.PI / 2 },
  // 工具架（玩法：吹叶机、捡球器、扫帚住在这里）：球场台地东南角、通往台阶的步道旁，开口朝西南
  { id: 'tool-rack', asset: 'tool-rack', x: 9.4, z: 12.6, y: 0, rotY: -Math.PI / 4 },
  // 左上框：北台上的蒲葵林（3 棵，高低错开，叶冠伸进竖屏）+ 台地上的烟树
  { id: 'palm-n1', asset: 'fan-palm', x: -7.4, z: -18.8, y: N, variant: 0, s: 1.1 },
  { id: 'palm-n2', asset: 'fan-palm', x: -5.0, z: -20.6, y: N, variant: 1 },
  { id: 'palm-n3', asset: 'fan-palm', x: -9.6, z: -22.4, y: M, variant: 2, s: 0.9 },
  { id: 'smoke-n', asset: 'smoke-tree', x: -14.5, z: -23.5, y: M },
  // 北台：遮阳帆 + 长椅（看台），右侧烟树，东北一堆大石
  { id: 'sail', asset: 'shade-sail', x: 4.2, z: -19.4, y: N },
  { id: 'bench-n', asset: 'bench', x: 4.2, z: -18.0, y: N },
  { id: 'smoke-ne', asset: 'smoke-tree', x: 13.5, z: -19.8, y: N },
  { id: 'rocks-ne', asset: 'rocks', x: 19.5, z: -18.2, y: N, variant: 0 },
  { id: 'creosote-n', asset: 'creosote', x: 9.5, z: -20.2, y: N, variant: 0 },
  // 左上框（竖屏看得见）：西台角上一棵高蒲葵 + 脚下一丛石炭酸灌木、脆灌木
  { id: 'palm-w0', asset: 'fan-palm', x: -9.4, z: -12.2, y: W, variant: 0, s: 1.15 },
  { id: 'creosote-w0', asset: 'creosote', x: -13.6, z: -10.6, y: W, variant: 0 },
  { id: 'brittle-w0', asset: 'brittlebush', x: -9.6, z: -14.6, y: W, variant: 1 },
  // 右上框：球场台地东北角一棵烟树 + 一丛灌木
  { id: 'smoke-c', asset: 'smoke-tree', x: 9.3, z: -12.4, y: 0 },
  { id: 'creosote-c', asset: 'creosote', x: 10.6, z: -14.6, y: 0, variant: 1 },
  // 西台：两棵假紫荆（中等的框，伸进竖屏左沿）+ 一丛脆灌木
  { id: 'paloverde-w1', asset: 'palo-verde', x: -16.8, z: -7.2, y: W, variant: 0 },
  { id: 'paloverde-w2', asset: 'palo-verde', x: -15.5, z: 2.0, y: W, variant: 1 },
  { id: 'brittle-w', asset: 'brittlebush', x: -10.2, z: -3.8, y: W, variant: 0 },
  { id: 'agave-w', asset: 'agave', x: -12.4, z: -6.4, y: W },
  { id: 'palm-w2', asset: 'fan-palm', x: -22.5, z: -9.5, y: W, variant: 2, s: 1.05 },
  { id: 'smoke-w', asset: 'smoke-tree', x: -24.0, z: -5.5, y: W },
  { id: 'creosote-w2', asset: 'creosote', x: -20.4, z: 3.6, y: W, variant: 1 },
  { id: 'cholla-w', asset: 'cholla', x: -16.8, z: -12.4, y: W },
  // 东台：烟树 + 墨西哥刺木 + 石堆（横屏右侧的框）
  { id: 'smoke-e', asset: 'smoke-tree', x: 21.5, z: 2.5, y: H.west },
  { id: 'ocotillo-e', asset: 'ocotillo', x: 17.8, z: 6.0, y: H.west },
  { id: 'rocks-e', asset: 'rocks', x: 24.5, z: 7.5, y: H.west, variant: 2 },
  { id: 'creosote-e', asset: 'creosote', x: 19.0, z: -6.5, y: H.west, variant: 1 },
  { id: 'paloverde-e', asset: 'palo-verde', x: 23.8, z: -8.0, y: H.west, variant: 0 },
  { id: 'brittle-e', asset: 'brittlebush', x: 17.6, z: 0.5, y: H.west, variant: 0 },
  { id: 'barrel-e', asset: 'barrel-cactus', x: 22.6, z: 8.0, y: H.west },
  // 球场台地：东侧空沙上一块石头、一个风滚草（构图的"静"区，别再加）
  { id: 'rock-e', asset: 'rocks', x: 9.8, z: -9.5, y: 0, variant: 1 },
  { id: 'tumble', asset: 'tumbleweed', x: -7.7, z: 9.5, y: 0 },
  // 左下框：绿洲池边的蒲葵（2 棵）+ 池边石 + 仙人掌
  { id: 'palm-s1', asset: 'fan-palm', x: -10.2, z: 19.0, y: L, variant: 1, s: 1.15 },
  { id: 'palm-s2', asset: 'fan-palm', x: -0.4, z: 23.6, y: L, variant: 2, s: 0.85 },
  { id: 'rocks-pool', asset: 'rocks', x: -1.4, z: 19.2, y: L, variant: 2 },
  { id: 'barrel-s', asset: 'barrel-cactus', x: -12.6, z: 22.6, y: L },
  { id: 'barrel-s2', asset: 'barrel-cactus', x: -11.6, z: 23.6, y: L, s: 0.75 },
  { id: 'brittle-pool', asset: 'brittlebush', x: -6.4, z: 17.9, y: L, variant: 0 },
  { id: 'agave-pool', asset: 'agave', x: -10.6, z: 24.8, y: L },
  { id: 'creosote-pool', asset: 'creosote', x: -14.0, z: 19.4, y: L, variant: 0 },
  { id: 'paloverde-sw', asset: 'palo-verde', x: -18.5, z: 22.0, y: L, variant: 1 },
  { id: 'palm-s3', asset: 'fan-palm', x: -14.6, z: 24.4, y: L, variant: 0, s: 0.95 },
  // 球场台地东南：台阶顶旁一丛
  { id: 'brittle-c', asset: 'brittlebush', x: 8.4, z: 14.9, y: 0, variant: 1 },
  // 步道两边：成团的灌木和花（只在步道转弯处），右下角的仙人掌
  { id: 'creosote-s1', asset: 'creosote', x: 7.6, z: 19.4, y: L, variant: 1 },
  { id: 'brittle-s1', asset: 'brittlebush', x: 2.4, z: 18.6, y: L, variant: 1 },
  { id: 'brittle-s2', asset: 'brittlebush', x: 10.8, z: 24.8, y: L, variant: 0 },
  { id: 'ocotillo-s', asset: 'ocotillo', x: 14.6, z: 18.6, y: L },
  { id: 'cholla-s', asset: 'cholla', x: 19.6, z: 25.0, y: L },
  { id: 'agave-s', asset: 'agave', x: 15.8, z: 25.4, y: L },
];
