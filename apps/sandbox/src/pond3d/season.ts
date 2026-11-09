// 季节调色板：每种材质三档（暗、中、亮），是从参考截图上取的色。暗档的色相往青/靛偏，不是亮档变暗。
// 换季 = 换调色板（+ 冬天按法线盖雪、水面结冰；秋天树换成红/橙几套色阶）。
import type { Tones } from './ramp';

export type Ramp = [number, number, number];
export type Season = 'summer' | 'spring' | 'autumn' | 'winter';

export interface Palette {
  grass: Ramp;
  /** 草地细节：[暗档草叶, 亮档草叶, 亮档斑块] */
  grassAlt: Ramp;
  cliff: Ramp;
  /** [墙中间的苔藓带, 高墙的长苔藓缕, 阴影里的草沿] */
  cliffAlt: Ramp;
  /** 墙顶（参考图逐行取色）：[草沿亮边（比亮草还亮）, 草沿下 1 行深绿线, 1～2 行短须] */
  cliffLip: Ramp;
  /** 元素调色板（材质规范：3 档 × 3 色 + 缝 + 亮边，参考图取众数）；不给就从 ramp 自动推 */
  cliffTones?: Tones;
  pathTones?: Tones;
  stairTones?: Tones;
  wallTones?: Tones;
  lilyTones?: Tones;
  /** 门前石板（参考图偏墙的灰紫，不是路的蓝） */
  landingTones?: Tones;
  path: Ramp;
  /** [暗档石缝, 亮档石缝, 石块上沿亮边] */
  pathAlt: Ramp;
  /** 路北沿的一纹素描边（三档同色） */
  pathRim: Ramp;
  trees: Ramp[];
  /** 灌木色阶（layout 里每丛灌木的 v 选一套，超出就取模） */
  bush: Ramp[];
  /** 每套灌木的底沿暗边 */
  bushRim: number[];
  /** 每套灌木的档位阈值（顶色越亮的那套，参考图里亮顶占得越多）；不给 = [0.55, 0.8] */
  bushBands?: [number, number][];
  trunk: Ramp;
  wood: Ramp;
  woodAlt: Ramp;
  roof: Ramp;
  roofAlt: Ramp;
  houseWall: Ramp;
  houseWallAlt: Ramp;
  rock: Ramp;
  moss: Ramp;
  /** 石头苔藓帽：[-, 下沿和往下滴的深绿, 帽里的暗斑] */
  mossEdge: Ramp;
  lily: Ramp;
  reed: Ramp;
  reedHead: Ramp;
  water: {
    deep: number;
    base: number;
    cloud: number;
    cloud2: number;
    shallow: number;
    foam: number;
    refl: number;
    fish: number;
    /** 大朵云的倒影（很淡的灰紫） */
    cloudBig?: number;
    cloudBig2?: number;
  };
  /** 冬天：雪 */
  snow: Ramp;
  lilyKeep?: number[];
  /** 冬天：结冰（水面） */
  ice: boolean;
  /** 秋天/冬天有些树光秃秃 */
  bareTrees: number;
  /** 云影强度（冬天阴天没有） */
  cloudShadow?: number;
  /** 亮草地上草叶短划的密度（默认 0.012，秋天很密） */
  grassK?: number;
  /** 地上有没有小花、落叶 */
  flowers?: boolean;
  leaves?: boolean;
  /** 水面云倒影的位置（参考图像素 X, Y, rx, rz 米）；不填用夏天的 */
  cloudRefl?: [number, number, number, number][];
}

const summer: Palette = {
  grass: [0x3f8a77, 0x5fae66, 0x87cf61],
  grassAlt: [0x5ca878, 0x6fbb58, 0x93d65c],
  cliff: [0x424780, 0x4b5590, 0x5a64a0],
  cliffAlt: [0x5f9a96, 0x3f8b75, 0x5fa865],
  cliffLip: [0xa1e87a, 0x2a6840, 0x377a64],
  cliffTones: {
    bands: [
      [0x42457c, 0x4a4d8a, 0x3a3c75],
      [0x4b5590, 0x535c98, 0x434b86],
      [0x5a64a0, 0x646eaa, 0x515a96],
    ],
    seam: [0x2a2c62, 0x30336a, 0x363a72],
    hi: [0x4a4e8c, 0x5a60a0, 0x6a72ae],
  },
  pathTones: {
    bands: [
      [0x444889, 0x4a4e95, 0x3e4282],
      [0x5c62a0, 0x666cab, 0x555b94],
      [0x7b83b9, 0x8c93cb, 0x737aae],
    ],
    seam: [0x2d326b, 0x434880, 0x535a8b],
    hi: [0x5358a0, 0x777dba, 0x9ca2d8],
  },
  stairTones: {
    bands: [
      [0x4c518a, 0x6469a3, 0x41467d],
      [0x565b94, 0x6469a3, 0x4c518a],
      [0x6469a3, 0x7a7fb4, 0x52578f],
    ],
    seam: [0x363a70, 0x3a3f75, 0x3e4379],
    hi: [0xb0b5de, 0xb6bbe2, 0xbec3e8],
  },
  wallTones: {
    bands: [
      [0x6b648e, 0x756c98, 0x5f5786],
      [0x7a72a2, 0x847cac, 0x6e6696],
      [0x8c86b8, 0x968fc2, 0x7f78aa],
    ],
    seam: [0x453c64, 0x504872, 0x5c5482],
    hi: [0x7f78aa, 0x8c86b8, 0xa29cc8],
  },
  landingTones: {
    bands: [
      [0x5e5a8a, 0x6e6a9a, 0x4f4a7a],
      [0x645f92, 0x736c9c, 0x585484],
      [0x736c9c, 0x8079a8, 0x645f92],
    ],
    seam: [0x38345a, 0x433e68, 0x4b4675],
    hi: [0x736c9c, 0x8079a8, 0x9089b8],
  },
  lilyTones: {
    bands: [
      [0x3d7263, 0x467d68, 0x356658],
      [0x6cba52, 0x76c25a, 0x62ab4b],
      [0x8dda74, 0x98e080, 0x80cc68],
    ],
    seam: [0x2f5848, 0x2f5848, 0x3d7263],
    hi: [0x5a9070, 0x93d495, 0xa8e890],
  },
  path: [0x4b5085, 0x6e74b0, 0x838ac0],
  pathAlt: [0x2e326b, 0x555b89, 0x949ad2],
  pathRim: [0x3e7262, 0x3e7262, 0x3e7262],
  trees: [
    [0x3f7a6a, 0x7cb460, 0xb4e16c],
    [0x417569, 0x76ab6c, 0x9ad56c],
  ],
  // 参考图逐丛取色：顶 #84c663 / #9ad569 / #b4e16c 三种，中档 #6aa36a / #8bb666，下三分之一 #46766a / #507d64，底沿 #2d5d62
  bush: [
    [0x46766a, 0x6aa36a, 0x84c663],
    [0x4a7a68, 0x78ae66, 0x9ad569],
    [0x507d64, 0x8bb666, 0xb4e16c],
  ],
  bushRim: [0x305f62, 0x34625e, 0x3e6c60],
  bushBands: [
    [0.52, 0.8],
    [0.5, 0.76],
    [0.4, 0.68],
  ],
  trunk: [0x3a3046, 0x493e51, 0x5e4a5a],
  wood: [0x7d6872, 0xa8784e, 0xc38a54],
  /** [板缝, 侧面亮, 侧面暗] */
  woodAlt: [0x4a3438, 0x8a5a40, 0x6a4838],
  roof: [0xa87754, 0xd4a45c, 0xe8c36a],
  roofAlt: [0x6e4a3c, 0x895949, 0xa8784e],
  houseWall: [0x6a6290, 0x7a72a2, 0x8c86b8],
  /** [石缝, 深石块, 浅石块] */
  houseWallAlt: [0x51497a, 0x5f5786, 0x7c74a6],
  rock: [0x515691, 0x8a90bc, 0xb7bed8],
  // 参考图石头上的苔藓：亮 #82c26c、中 #6aa868、暗 #3e8a6c；下沿/滴 #3b8d65
  moss: [0x3e8a6c, 0x6aa866, 0x84c664],
  mossEdge: [0x3b8a66, 0x3b8a66, 0x5c9c62],
  lily: [0x3d7263, 0x6cba52, 0x8dda74],
  reed: [0x2f5848, 0x3d6a52, 0x4f8058],
  reedHead: [0x4a3034, 0x6a4038, 0x8a5a44],
  water: {
    deep: 0x5a6ec0,
    base: 0x5e74c6,
    cloud: 0x7898ca,
    cloud2: 0x6985c6,
    shallow: 0x84aac6,
    foam: 0xf6f8ff,
    refl: 0x4a5aa8,
    fish: 0xa4b0c4,
    cloudBig: 0xa3b4cb,
  },
  snow: [0xb0bdf1, 0xc9d2f2, 0xe2e8f2],
  ice: false,
  bareTrees: 0,
};

const autumn: Palette = {
  ...summer,
  // 阴影是青色（参考图 #3c7667，和夏天同一个色相），不是暗橄榄
  grass: [0x3d7768, 0x9a9a48, 0xc3ab44],
  /** [阴影里的草叶, 亮档草叶（橄榄绿短划）, -] */
  grassAlt: [0x4c8270, 0x9e9a4a, 0xb8aa4c],
  cliffAlt: [0x6a7a5a, 0x5a6a48, 0x64817a],
  cliffLip: [0xc6a94a, 0x4a614f, 0x5b795f],
  pathRim: [0x5a6a48, 0x5a6a48, 0x5a6a48],
  trees: [
    [0x6a2a34, 0x923a27, 0xc0502a],
    [0x7a3a2a, 0xc8662a, 0xf0a040],
    [0x3c6a60, 0x6a9a5a, 0xa8c860],
  ],
  // 参考图：橄榄色，顶 #737008、中 #635e26，下半截大片 #53502e，底沿 #47422a
  bush: [
    [0x53502e, 0x645f24, 0x737008],
    [0x524f30, 0x6a6428, 0x84802a],
  ],
  bushRim: [0x46412a, 0x46412a],
  lily: [0x6b5435, 0x966e0c, 0xb8902a],
  lilyTones: undefined,
  /** 秋天只剩几片睡莲（LILIES 的下标） */
  lilyKeep: [3, 7, 8, 9],
  reed: [0x4a4a30, 0x6a6038, 0x7a7040],
  moss: [0x3c7a66, 0x5a9a5a, 0x7ab85a],
  mossEdge: [0x3a6e58, 0x3a6e58, 0x50885a],
  water: {
    ...summer.water,
    deep: 0x5a66a2,
    base: 0x5e6aa3,
    cloud: 0x6f81a9,
    cloud2: 0x6977a6,
    shallow: 0x7082a9,
    refl: 0x4a4a7a,
  },
  grassK: 0.3,
  flowers: false,
  leaves: true,
  cloudRefl: [],
};

const winter: Palette = {
  ...summer,
  grass: [0xb0bdf1, 0xc9d2f2, 0xe0e6f1],
  grassAlt: [0xa2aee6, 0xd2d9ee, 0xe6ebf5],
  cliffAlt: [0x33356c, 0xd8def0, 0xe8ecf6],
  cliffLip: [0xf4f6fa, 0x7a7884, 0x6e6c78],
  path: [0xaab6ea, 0xc4cdf0, 0xdce3f0],
  pathAlt: [0xa2aee6, 0xc0c9ec, 0xd4dbee],
  pathRim: [0x98a6e0, 0x98a6e0, 0x98a6e0],
  pathTones: undefined,
  stairTones: undefined,
  landingTones: undefined,
  trees: [[0x5a2a34, 0x7a3a34, 0x9a4a3a]],
  bush: [[0x4a2e36, 0x6a3e38, 0x8a5244]],
  bushRim: [0x3a2430],
  lily: [0x9aa8de, 0xb8c4ec, 0xd8e0f4],
  reed: [0x3a2a34, 0x4a3438, 0x5a4040],
  moss: [0xb0bdf1, 0xc9d2f2, 0xe2e8f2],
  water: {
    ...summer.water,
    deep: 0x4f66b8,
    base: 0x5770c2,
    cloud: 0x5f78c4,
    cloud2: 0x5b74c3,
    shallow: 0x6680c6,
    cloudBig: 0x969fc8,
  },
  ice: true,
  bareTrees: 0.7,
  flowers: false,
  cloudShadow: 0,
  cloudRefl: [[905, 515, 3.4, 1.7]],
};

const spring: Palette = {
  ...summer,
  // 春天整张图还要过一遍调色（× (0.9, 0.92, 0.98)、饱和度 0.85），这里是反算回去的值：调完是参考图的 #a4bc64 / #4d796d
  grass: [0x508670, 0x7fae64, 0xb5d059],
  grassAlt: [0x5c9478, 0x9cc45c, 0xbcd862],
  cliffLip: [0xcfe47a, 0x3a6a48, 0x45806a],
  water: {
    ...summer.water,
    deep: 0x5a5a9e,
    base: 0x6464a8,
    cloud: 0x7474b0,
    cloud2: 0x6c6cac,
    shallow: 0x6a6cac,
    refl: 0x585a98,
  },
  lily: [0x3a7050, 0x5aa058, 0x78b860],
  lilyTones: undefined,
  lilyKeep: [3, 7, 8, 9],
  cloudRefl: [],
};

export const PALETTES: Record<Season, Palette> = { summer, spring, autumn, winter };
