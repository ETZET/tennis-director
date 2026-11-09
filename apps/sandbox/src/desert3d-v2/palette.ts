// desert3d-v2 唯一的调色板。每种材质手挑三档 [亮, 中, 暗] + 描边参数。
// 规则（docs/lab/2026-11-07-3d-pixel/lessons.md + 沙漠场景失败复盘）：
// - 暗档换色相，不是亮档变暗：暖色的影子往紫/靛走，绿色的影子往青走；暗档饱和度不掉（≥ 0.35）。
// - 明度两极：大块亮面（沙、台地顶、球场）都在亮档，亮度 170～200；朝镜头的崖壁和投影都在暗档，亮度 60～110。
//   中档只出现在侧面和圆东西的腰上，面积小 → 画面亮度直方图是两个峰。
// - 饱和度：大面积颜色的 HSV 饱和度 0.4～0.6（参考图平均 0.47）；只有白线、白布、天空亮部低于 0.2。
// - 颜色管理关了：这里写的就是屏幕上的颜色。
// - 不在这张表里的颜色不要用；新材质先加到这里（和 ASSETS.md 的规格一起改）。
import type { Elem, Tones, ToonOpts } from './toon';

export type Ramp = [number, number, number];

export interface Swatch {
  ramp: Ramp;
  /** 深度轮廓强度（> 0.2 上沿提亮） */
  edge: number;
  /** 法线凸边高光 */
  convex: number;
  /** 其他默认材质参数（植物的 lightUp/noise/bands 等） */
  opts?: ToonOpts;
  /** 材质规范 v2 的元素调色板（只在材质带 elem 时起作用；不给就从 ramp 自动推） */
  tones?: Tones;
}

const s = (ramp: Ramp, edge: number, convex: number, opts?: ToonOpts, tones?: Tones): Swatch => ({
  ramp,
  edge,
  convex,
  opts,
  tones,
});
/**
 * 元素调色板（材质规范 v2）：亮、中、暗三档各 [本色, 高一级, 低一级]，再给三档的缝色、亮边色。
 * 本色就是 ramp；高/低一级只差 6～12 个亮度（元素之间看得出、远看不花）；缝、亮边差 15～25。暗档往冷色相走。
 */
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });
/** 水面的亮边色（北岸天光带）：泡沫虚线的空隙也用它（白泡沫和底色水差 80 个亮度，空隙用它只差 45，强边缘少一半） */
export const WATER_HI: Ramp = [0x8edcd6, 0x6cbcc8, 0x4a7cac];

/** 树冠、灌木团：球面法线、光往上偏、档位噪声（竖向叶子笔触） */
const FOLIAGE: ToonOpts = { lightUp: 0.4, noise: 0.35, bands: [0.02, 0.5] };
/** 圆而实心的东西（石头、仙人掌、人）：光略往上偏，朝镜头一面不至于全黑 */
const ROUND: ToonOpts = { lightUp: 0.25, bands: [0.05, 0.5] };

export const PAL = {
  // ── 地面 ────────────────────────────────────────────
  /** 亮沙：画面里最大的一块颜色（金杏色）。影子是紫，不是棕 */
  sand: s(
    [0xeab46c, 0xcc8a62, 0x976690],
    0.05,
    0,
    undefined,
    tn(
      [0xeab46c, 0xf4c27e, 0xe0a664],
      [0xcc8a62, 0xd49470, 0xc07e5c],
      [0x976690, 0xa06e98, 0x8a5a8e],
      [0xd49a62, 0xae6c5a, 0x704878],
      [0xf8cc8c, 0xdea27a, 0xb8849e],
    ),
  ),
  /** 台地顶的沙（略偏玫瑰，和下层分得开） */
  sandHigh: s(
    [0xf0be78, 0xd49268, 0x9c6a94],
    0.05,
    0,
    undefined,
    tn(
      [0xf0be78, 0xf8cc8c, 0xe6ae6c],
      [0xd49268, 0xdc9e74, 0xc8865e],
      [0x9c6a94, 0xa4729c, 0x8e5e90],
      [0xdaa06a, 0xb47460, 0x744a7c],
      [0xfcd498, 0xe4aa80, 0xbc88a2],
    ),
  ),
  /** 深沙 / 风吹来的积沙（球场上的沙堆、沙脊的背风面） */
  sandDrift: s(
    [0xe0a05c, 0xc07a58, 0x7c5690],
    0.1,
    0,
    undefined,
    tn(
      [0xe0a05c, 0xe6aa68, 0xd6965a],
      [0xc07a58, 0xc88664, 0xb47054],
      [0x7c5690, 0x86609a, 0x724e86],
      [0xc4845a, 0x9c5e58, 0x644478],
      [0xf0bc7c, 0xd8986c, 0x946ca4],
    ),
  ),
  /** 地上深一点的沙斑（压实的土）：和亮沙只差一点 */
  sandPatch: s(
    [0xe2a864, 0xc8865e, 0x936290],
    0.05,
    0,
    undefined,
    tn(
      [0xe2a864, 0xe8b270, 0xd89c5e],
      [0xc8865e, 0xd0926a, 0xbc7a58],
      [0x936290, 0x9c6a98, 0x84568a],
      [0xcc925c, 0xa86a58, 0x6c4676],
      [0xf0c084, 0xd89e78, 0xb08098],
    ),
  ),
  /** 踩实的步道（钙质硬土：比沙浅、比沙冷，一眼看出是路，引导视线） */
  path: s(
    [0xf6e0b4, 0xd8aa8e, 0x8e6c9c],
    0.15,
    0.1,
    undefined,
    tn(
      [0xf6e0b4, 0xfae6c0, 0xeed4a6],
      [0xd8aa8e, 0xe0b69a, 0xcc9c84],
      [0x8e6c9c, 0x906e9e, 0x826092],
      [0xd6b48e, 0xb08078, 0x6e5084],
      [0xfff2d4, 0xe8c4a8, 0xa486b0],
    ),
  ),
  /** 台阶（比步道亮一点、凸边白线清楚） */
  stair: s(
    [0xfae8c4, 0xdcae96, 0x6a5294],
    0.5,
    1.0,
    undefined,
    tn(
      [0xe8d0a8, 0xf2dcb4, 0xdcc29a],
      [0xdcae96, 0xe4bca4, 0xd0a08a],
      [0x6a5294, 0x765ea0, 0x5e4888],
      [0xceb498, 0xb48882, 0x4a3878],
      [0xfffcf2, 0xecccb8, 0x8a74b0],
    ),
  ),
  // ── 崖壁、岩石 ──────────────────────────────────────
  /**
   * 朝镜头的崖壁永远落暗档（太阳在画面后方）：暗档是靛紫，这是画面的"框"。
   * 石块要一块块读得出来（池塘池壁的做法）：暗档高一级 +16、低一级 −10，缝 −26（比低一级还深一截，不和暗块糊在一起），
   * 亮边（缝下那行）+29；缝 L 48 和淌沙暗色 L 105 只差 57，不出强边缘。
   */
  cliff: s(
    [0xd8845e, 0xb05c66, 0x5a3f86],
    0.3,
    0.2,
    undefined,
    tn(
      [0xd8845e, 0xe09468, 0xcc7658],
      [0xb05c66, 0xc06e70, 0x9c4e5e],
      [0x5a3f86, 0x6a4e9e, 0x4c3678],
      [0xa85a56, 0x80405a, 0x382862],
      [0xeca878, 0xcc7e76, 0x7a5ca2],
    ),
  ),
  /** 崖壁顶上一圈亮边（沙壳），一纹素高。暗档 L 100：墙顶那行暗线（崖壁缝色 L 48）在墙沿下台阶处和它横着挨着，差要 < 60 */
  cliffLip: s([0xf6cc8c, 0xd89070, 0x7c589a], 0.3, 0.6),
  /** 岛底（浮空岛下半截，比崖壁更深更冷） */
  underside: s([0x9a5a7a, 0x6e4682, 0x3e3070], 0.3, 0.1),
  /** 红岩石块 */
  rock: s([0xd88e68, 0xa85e6a, 0x4e3c80], 0.8, 1.0, ROUND),
  /** 灰紫石（少量点缀） */
  rockCool: s([0xc0a8c4, 0x8a78aa, 0x4a4280], 0.8, 1.0, ROUND),
  // ── 球场 ────────────────────────────────────────────
  /** 内场：褪了色但仍然鲜的青蓝 */
  court: s(
    [0x4aa6c0, 0x3a82a8, 0x2e4c86],
    0.05,
    0,
    undefined,
    tn(
      [0x4aa6c0, 0x50acc6, 0x44a0b8],
      [0x3a82a8, 0x3e88ae, 0x367ca0],
      [0x2e4c86, 0x32528c, 0x2a4680],
      [0x3e94ae, 0x30708f, 0x263f74],
      [0x5cb6cc, 0x4a92b6, 0x3a5c96],
    ),
  ),
  /** 内场晒白的大块：平涂、硬边（比内场亮 28），里面偏一边一块更白的 courtBleachCore（再亮 13）—— 一共两色 */
  courtBleach: s([0x7cbccc, 0x5c98b4, 0x3e5a8c], 0.05, 0),
  courtBleachCore: s([0x8ec8d4, 0x6aa4bc, 0x466494], 0.05, 0),
  /** 外场绿 */
  surround: s(
    [0x5cae78, 0x3f8a72, 0x2e5a74],
    0.05,
    0,
    undefined,
    tn(
      [0x5cae78, 0x62b47e, 0x56a672],
      [0x3f8a72, 0x44907a, 0x3a846c],
      [0x2e5a74, 0x32607a, 0x2a546e],
      [0x4c9868, 0x347862, 0x264c64],
      [0x6cbc86, 0x4c9a80, 0x386880],
    ),
  ),
  /** 白线（奶油色，清楚） */
  line: s([0xf6ead0, 0xd0bcc4, 0x7e6ea0], 0.05, 0),
  /** 剥落露出的沥青（深石板青，不是紫灰：在青蓝场地上读成"磨穿了"） */
  asphalt: s([0x7e98a6, 0x5e7890, 0x3a4a6a], 0.1, 0),
  /** 裂缝：场地漆色深一档（内场 / 外场），缝下沿用 courtBleach / surroundLight 做亮边 */
  courtCrack: s([0x2e7096, 0x2a5a88, 0x23406e], 0.05, 0),
  surroundCrack: s([0x3a7e68, 0x2f6262, 0x24445a], 0.05, 0),
  surroundLight: s([0x84c88c, 0x5ea07e, 0x3a6a78], 0.05, 0),
  /** 球网：网身深靛（读成一条粗暗带），网带白 */
  net: s([0x4c4672, 0x3a3660, 0x262444], 0.4, 0),
  netTape: s([0xf4eee0, 0xc8bcd0, 0x7a6e9c], 0.6, 0.4),
  /** 水泥（路缘、矮墙）：暖白，暗档紫 */
  concrete: s([0xe8c69e, 0xc89a8e, 0x6e5a92], 0.4, 0.8),
  // ── 道具 ────────────────────────────────────────────
  wood: s([0xd8945a, 0xae6a52, 0x5e426e], 0.6, 0.6),
  woodWeathered: s([0xd8b088, 0xa88074, 0x5c4c78], 0.6, 0.6),
  /** 漆过的金属（青绿，网柱、裁判椅、球车） */
  metal: s([0x5cb0a0, 0x3e8488, 0x2c4a6e], 0.6, 0.6),
  rust: s([0xd8703e, 0xa84c44, 0x5a3456], 0.6, 0.6),
  /** 工具橙（吹叶机）：比 fabricStripe 更亮更黄，在沙上、球场上都跳出来（原来是 coach.ts 里的局部色） */
  toolOrange: s([0xff9a30, 0xd8603a, 0x7a3456], 0.45, 0.5),
  /** 遮阳帆：奶油 */
  fabric: s([0xf6dcae, 0xdc9e8c, 0x8a6498], 0.4, 0.2, { noShadowReceive: true }),
  /** 条纹布（遮阳帆、毛巾）：珊瑚橙 */
  fabricStripe: s([0xf07c4c, 0xc0545a, 0x6a3a74], 0.4, 0.2, { noShadowReceive: true }),
  /** 水（小绿洲池）：底色三档；倒影/泡沫由水面资产自己画 */
  water: s(
    [0x4cc0cc, 0x3a94b4, 0x2e5c92],
    0.05,
    0,
    undefined,
    tn(
      [0x4cc0cc, 0x5ccad2, 0x42b4c8],
      [0x3a94b4, 0x449eba, 0x348aac],
      [0x2e5c92, 0x36669a, 0x2a568a],
      [0x3aa4c0, 0x2e7ea2, 0x264e80],
      WATER_HI,
    ),
  ),
  foam: s([0xf4fbf4, 0xc8e4ec, 0x8aa8cc], 0.05, 0),
  // ── 植物 ────────────────────────────────────────────
  /** 蒲葵叶（亮黄绿 → 青暗） */
  palm: s([0xb4d04a, 0x6ea046, 0x2c6a62], 0.4, 0.2, FOLIAGE),
  /** 蒲葵的枯叶裙、树干 */
  palmSkirt: s([0xd8a060, 0xa8705c, 0x5a4470], 0.4, 0.3, FOLIAGE),
  palmTrunk: s([0xc89468, 0x9a6a60, 0x544274], 0.5, 0.4),
  /** 鼠尾草绿（石炭酸灌木、荷荷巴） */
  sage: s([0xa8c470, 0x6e9a6a, 0x346468], 0.4, 0.2, FOLIAGE),
  /** 橄榄绿（牧豆树） */
  olive: s([0x9cb440, 0x648a3e, 0x2c5c58], 0.4, 0.2, FOLIAGE),
  /** 黄绿（假紫荆 palo verde 的枝和冠） */
  yellowGreen: s([0xcce050, 0x8ebc48, 0x3a7c62], 0.4, 0.2, FOLIAGE),
  /** 银蓝（烟树、龙舌兰） */
  silverBlue: s([0xaccad0, 0x7a9cbc, 0x4a5890], 0.4, 0.3, FOLIAGE),
  /** 仙人掌（桶形、仙人球、仙人掌片）：更饱和的蓝绿 */
  cactus: s([0x8cc068, 0x4e9470, 0x2c5a6e], 0.6, 0.6, ROUND),
  /** 枝干（深棕紫） */
  branch: s([0xa8745a, 0x7a5462, 0x433a66], 0.5, 0.3),
  /** 地上的干草团：比沙更浅更黄（不然金色的东西在沙上就没了），暗档紫 */
  dryTuft: s([0xf8e494, 0xc8945a, 0x6a5488], 0.4, 0.2, FOLIAGE),
  /** 干草、枯枝、风滚草 */
  dryGrass: s([0xf6dc84, 0xc48c58, 0x6a5488], 0.4, 0.2),
  // ── 花 ──────────────────────────────────────────────
  flowerYellow: s([0xffd23c, 0xe49c34, 0x8a5466], 0.3, 0.2),
  flowerRed: s([0xf4583c, 0xbc3a48, 0x6a2a5a], 0.3, 0.2),
  flowerPurple: s([0xc47ade, 0x8c58b4, 0x4a3a86], 0.3, 0.2),
  // ── 人 ──────────────────────────────────────────────
  skinLight: s([0xf6c69c, 0xda8e80, 0x8a5a7c], 0.7, 0.4, ROUND),
  skinTan: s([0xdc9a66, 0xb2685a, 0x6a426c], 0.7, 0.4, ROUND),
  skinDark: s([0x9e6242, 0x74423a, 0x422a4e], 0.7, 0.4, ROUND),
  hair: s([0x5a3a3a, 0x40283a, 0x261a30], 0.7, 0.4, ROUND),
  clothWhite: s([0xf4f0e8, 0xc6bcd4, 0x7a6ea0], 0.7, 0.4, ROUND),
  clothRed: s([0xe85a48, 0xb43c4c, 0x62285a], 0.7, 0.4, ROUND),
  clothBlue: s([0x4a82dc, 0x3a5cac, 0x2a3274], 0.7, 0.4, ROUND),
  /** 教练的 Polo：深紫（比 flowerPurple 深、偏蓝，和紫红的沙影、靛紫崖壁分得开） */
  clothPurple: s([0x9a5ae0, 0x6c40b0, 0x3a2a7a], 0.7, 0.4, ROUND),
  clothTeal: s([0x3cb4a4, 0x2a8890, 0x24506e], 0.7, 0.4, ROUND),
  /** 总监的草帽 */
  straw: s([0xf6d47a, 0xd4a062, 0x8a6a74], 0.7, 0.6, ROUND),
  /** 网球（荧光黄绿，最亮的点） */
  ball: s([0xe8ff50, 0xb8d044, 0x6a8a5a], 0.6, 0.4),
  // ── 占位（明显是占位：冷灰，不在成品里出现） ─────────
  placeholder: s([0xc4c4cc, 0x9494a4, 0x5c5c74], 0.6, 0.6),
} as const satisfies Record<string, Swatch>;

export type Pal = typeof PAL;

/** 天空：浮空岛四周。上浅下深的晴空蓝（参考图没有天，这里取干净、饱和的蓝，不抢球场） */
export const SKY = { top: 0x5fb0e8, horizon: 0xa8dcf0, cloud: 0xf4f8fc, cloudShade: 0xc4d4f0 };

/**
 * 材质规范 v2 的元素预设（地形在用；资产可以直接拿或者展开改：ctx.mat('sand', { elem: { ...EL.sand, seed: 3 } })）。
 * 只放"大面积表面"的；各 kind 的参数含义见 ASSETS.md「材质规范 v2」。
 */
export const EL = {
  /** 沙地：大块安静的本色 + 低频深/浅沙斑（深斑上沿是丘顶亮边）+ 按 3.5 米斑块疏密的沙纹（1.5% → 42% 的段）+ 零星碎石 */
  sand: {
    kind: 'ripples',
    size: [13, 4],
    density: [0.015, 0.42],
    patch: 3.5,
    mottle: 0.45,
    pebbles: 0.065,
    accent: [0xc07a68, 0x9a5e66, 0x6e4a84],
  },
  /**
   * 崖壁：沉积岩层（一层 4～6 行，石块 10～18 纹素宽、每块自己一个深浅、竖缝八成；缝下那行七成五是这块石头的上一级）；
   * 露出 < 9 行 = 矮墙（实心一条），≥ 18 行才淌沙（暗档淌沙 #8a5c88：和缝差 < 60）
   */
  strata: {
    kind: 'strata',
    space: 'wall',
    size: [13, 5],
    hi: 0.75,
    q: [9, 18, 0, 0],
    attr: true,
    accent: [0xe8b070, 0xc88866, 0x8a5c88],
  },
  /** 踩实的步道：有机形状的土团 + 少数地方的龟裂 + 脚印 + 嵌着的碎石 */
  path: {
    kind: 'pebbles',
    size: [10, 6],
    seam: 0.6,
    density: [0.02, 0.16],
    patch: 2.5,
    pebbles: 0.09,
    accent: [0xd0a898, 0xa07a80, 0x6a5088],
  },
  /** 水面（几何体要带 aElem = [到北岸, 到岸] 的距离，见 terrain.ts waterGeo） */
  water: { kind: 'water', attr: true },
  /** 泡沫圈：虚线，空隙是水面的亮边色 */
  foam: { kind: 'dash', size: [6, 2], accent: WATER_HI },
} as const satisfies Record<string, Elem>;
