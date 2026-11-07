// 季节调色板：每种材质三档（暗、中、亮），是从参考截图上取的色。暗档的色相往青/靛偏，不是亮档变暗。
// 换季 = 换调色板（+ 冬天按法线盖雪、水面结冰；秋天树换成红/橙几套色阶）。
export type Ramp = [number, number, number];
export type Season = 'summer' | 'spring' | 'autumn' | 'winter';

export interface Palette {
  grass: Ramp;
  /** 草地细节：[暗档草叶, 亮档草叶, 亮档斑块] */
  grassAlt: Ramp;
  cliff: Ramp;
  /** [石缝, 草边暗, 草边亮] */
  cliffAlt: Ramp;
  path: Ramp;
  /** [暗档石缝, 亮档石缝, 石块上沿亮边] */
  pathAlt: Ramp;
  /** 路北沿的一纹素描边（三档同色） */
  pathRim: Ramp;
  trees: Ramp[];
  bush: Ramp[];
  trunk: Ramp;
  wood: Ramp;
  woodAlt: Ramp;
  roof: Ramp;
  roofAlt: Ramp;
  houseWall: Ramp;
  houseWallAlt: Ramp;
  rock: Ramp;
  moss: Ramp;
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
  grass: [0x3e8778, 0x5fae66, 0x87cf61],
  grassAlt: [0x4e9a7c, 0x6fbb58, 0x93d65c],
  cliff: [0x424780, 0x4b5590, 0x5a64a0],
  cliffAlt: [0x33356c, 0x3f8b75, 0x5aa86a],
  path: [0x4b5085, 0x6e74b0, 0x838ac0],
  pathAlt: [0x2e326b, 0x555b89, 0x949ad2],
  pathRim: [0x3e7262, 0x3e7262, 0x3e7262],
  trees: [
    [0x3f7a6a, 0x7cb460, 0xb4e16c],
    [0x417569, 0x76ab6c, 0x9ad56c],
  ],
  bush: [
    [0x4b7d6a, 0x78ae68, 0xb2e264],
    [0x457a64, 0x6aa863, 0x9ad569],
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
  moss: [0x3c8b76, 0x5fae66, 0x8fd064],
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
  grass: [0x54512e, 0x9a9a48, 0xc3ab44],
  /** [阴影里的草叶, 亮档草叶（橄榄绿短划）, -] */
  grassAlt: [0x667a52, 0x9e9a4a, 0xb8aa4c],
  cliffAlt: [0x33356c, 0x5a6a48, 0x8a8a44],
  pathRim: [0x5a6a48, 0x5a6a48, 0x5a6a48],
  trees: [
    [0x6a2a34, 0x923a27, 0xc0502a],
    [0x7a3a2a, 0xc8662a, 0xf0a040],
    [0x3c6a60, 0x6a9a5a, 0xa8c860],
  ],
  bush: [
    [0x45503a, 0x66743a, 0x86924a],
    [0x4a4a38, 0x6a6a3a, 0x8a8a48],
  ],
  lily: [0x6b5435, 0x966e0c, 0xb8902a],
  /** 秋天只剩几片睡莲（LILIES 的下标） */
  lilyKeep: [3, 7, 8, 9],
  reed: [0x4a4a30, 0x6a6038, 0x7a7040],
  moss: [0x3c7a66, 0x5a9a5a, 0x7ab85a],
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
  path: [0xaab6ea, 0xc4cdf0, 0xdce3f0],
  pathAlt: [0xa2aee6, 0xc0c9ec, 0xd4dbee],
  pathRim: [0x98a6e0, 0x98a6e0, 0x98a6e0],
  trees: [[0x5a2a34, 0x7a3a34, 0x9a4a3a]],
  bush: [[0x4a2e36, 0x6a3e38, 0x8a5244]],
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
  lilyKeep: [3, 7, 8, 9],
  cloudRefl: [],
};

export const PALETTES: Record<Season, Palette> = { summer, spring, autumn, winter };
