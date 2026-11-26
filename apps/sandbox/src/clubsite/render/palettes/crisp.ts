// 8 清透（2026-11-25，照《垂钓手记》溪流视频；六轮评判、数字和定下来的决定见 docs/lab/2026-11-07-3d-pixel/redo-color.md）：
// 受光暖、背光冷，整屏分成冷暖两组；一屏只有一个高饱和的暖色（总监的草帽）。
// - 受光的地：每种地三档同一个色相（hueK 1，不混出泥色），最大的受光地面本色亮度定死在 L 185～195（参考亮草 #96d057 ≈ 187）。
//   铺地 = 浅石色（最淡）、沙 = 浅杏（最饱和）、陶砖 = 陶色（最深），靠明度和彩度分开。
// - 影子（暗档）：低彩度的冷色，分材质 —— 铺地 ≈ #6a6a80、沙 ≈ #67647c（略偏红）、陶砖 ≈ #6c5870、草 ≈ #3c8b75（饱和青绿）、
//   沥青 ≈ #33354d。彩度高了是薰衣草紫，比不换还吵；低到 C 0.037 以下画面上就成了灰。
// - 中档（云影、侧面、阴天整屏）：跟着材质亮档的色相走、往冷挪一点 —— 固定的冷色会让阴天整屏成薰衣草色。
// - 一族绿：亮 ≈ #aade60、中 ≈ #8cc453、影 ≈ #388d74；球场外圈也用这族的黄绿，球场区不再整屏一片蓝。
// - 沥青：暗而静的中性底（≈ #5d5b62），和影子差 ≈ 40。
// - 车漆、条纹、球、花、工具、暖色衣服都收彩度；时间系统的乘子在白天傍晚只留一部分彩度（dayTint，傍晚影子不再是饱和紫）。
// - 皮肤的影子不跟着变冷（会像生病），只往冷挪一点。
import type { BandGrade, PartialGrade } from './grade';
import type { Scheme } from './types';

/** 地面、墙、木头这些"人造 / 土"的影子：冷灰紫（C 0.042～0.048：再低量图就成了灰） */
const COOL_DARK: BandGrade = { hue: 286, hueK: 1, c: 1, cMin: 0.044, cMax: 0.05, lAdd: 6 };
/**
 * 中档（云影、侧面；阴天整屏都落在中档）：跟着这个材质亮档的色相走、往冷挪一点、留彩度 ——
 * 不是一个固定的淡紫（第 3 轮试过：阴天整屏成了薰衣草色，傍晚发紫发脏），也不往灰里拉。
 */
const COOL_MID: BandGrade = { follow: 1, shift: 0, hue: 255, hueK: 0.25, c: 0.85 };
/** 沙上的影子：略偏红的冷灰紫（≈ #67647c），和铺地上的分得开、看得出下面是沙 */
const SAND_DARK: BandGrade = { hue: 292, hueK: 1, c: 1, cMin: 0.042, cMax: 0.046, lAdd: -8 };

/** 亮面一种色相：hue 定死（hueK 1），彩度夹在一个窄带里，亮度 L' = L × lMul + lAdd */
const lit1 = (hue: number, cMin: number, cMax: number, lMul = 1, lAdd = 0): BandGrade => ({
  hue,
  hueK: 1,
  c: 1,
  cMin,
  cMax,
  lMul,
  lAdd,
});

/**
 * 铺地、步道、碎花岗岩、石板：浅石色。**亮度定死**：最大的受光地面本色 L 185～195（参考亮草 #96d057 ≈ 187、车站铺地 #c3bb9e ≈ 187；
 * 第 4 轮 ≈ 178 被说成油灰、第 5 轮 ≈ 222 被说成粉彩吃掉草帽，以后评判再说太亮太暗、数在区间里就不改），三档同色相。
 * 暖材质色相收在一条窄带里，用明度、彩度分开：铺地最淡、沙最饱和、陶砖最深。
 */
const PAVING: PartialGrade = {
  lit: lit1(82, 0.063, 0.067, 0.93),
  mid: COOL_MID,
  dark: { ...COOL_DARK, cMin: 0.04, cMax: 0.044 },
};
/**
 * 陶砖（到达小院、落客区、墙边步道、喷泉一圈）：一个明确的身份 —— 干净的陶色，比沙深一档（≈ #c47a52～#c98a6a，L ≈ 150）；
 * 留白代理把大门口的大块铺地合进了 tile，所以彩度收一档、靠明度和沙分开。影子偏紫红的灰（≈ #6c5870）。
 */
const TILE: PartialGrade = {
  lit: lit1(50, 0.09, 0.096, 0.82),
  mid: COOL_MID,
  dark: { hue: 318, hueK: 1, c: 1, cMin: 0.048, cMax: 0.052 },
};
/** 草坪、果岭：饱和暖黄绿，影子青绿 */
const lawn = (lAdd: number, dAdd: number): PartialGrade => ({
  lit: { hue: 128, hueK: 1, c: 1, cMin: 0.15, cMax: 0.17, lAdd },
  mid: { hue: 135, hueK: 1, c: 1, cMin: 0.13, cMax: 0.15, lAdd },
  dark: { hue: 172, hueK: 1, c: 1, cMin: 0.085, cMax: 0.095, lAdd: dAdd },
});
/** 球场外圈：暖一点的黄绿（≈ #8cc453，参考草的中档），球场区不再整屏一片蓝；影子是草影的青绿 */
const APRON: PartialGrade = {
  lit: { hue: 130, hueK: 1, c: 1, cMin: 0.14, cMax: 0.155, lAdd: 22 },
  mid: { hue: 135, hueK: 1, c: 1, cMin: 0.12, cMax: 0.14, lAdd: 18 },
  dark: { hue: 172, hueK: 1, c: 1, cMin: 0.08, cMax: 0.09, lAdd: 10 },
};
/** 红土：亮面收一点彩度、略提亮（≈ #bf735a），影子和别的地一族的冷灰紫（≈ #5e5468；第 3 轮的品红影太吵） */
const CLAY: PartialGrade = {
  lit: { c: 0.8, lAdd: 6 },
  mid: { c: 0.8 },
  dark: { hue: 300, hueK: 1, c: 1, cMin: 0.042, cMax: 0.05 },
};
/** 布的中档（斜着的帆、伞的背光面）：还是同一个奶油色相、彩度不掉到灰（第 4 轮：匹克球场的帆发灰 #b7a894） */
const CLOTH_MID: BandGrade = { hue: 72, hueK: 1, c: 1, cMin: 0.045, cMax: 0.05 };
/** 不当焦点的彩色东西（车漆、条纹）：收彩度 */
const quiet = (c: number, lMul = 1): PartialGrade => ({ lit: { c, lMul }, mid: { c } });

export const scheme: Scheme = {
  id: 'crisp',
  name: '清透',
  hint: '亮而单一的地、冷灰紫影、青绿草影、一个焦点',
  grade: {
    lit: { hue: 80, hueK: 0.1, c: 1.1, lAdd: 2 },
    mid: COOL_MID,
    dark: COOL_DARK,
  },
  groups: {
    /** 沙：浅杏，唯一饱和的暖色大面；本色 L ≈ 191（定死的区间里），≈ #ecb87d */
    ground: { lit: lit1(68, 0.114, 0.12, 1, -5), mid: COOL_MID, dark: SAND_DARK },
    terracotta: TILE,
    /** 墙、花池沿：混凝土米灰（≈ #d6cec0），不再是一圈和沙同色的橙边 */
    wall: { lit: lit1(85, 0.016, 0.02, 0.97), mid: COOL_MID },
    rock: { lit: { c: 0.55 }, mid: COOL_MID, dark: { hue: 278, hueK: 1, c: 1, cMin: 0.045, cMax: 0.052 } },
    /** 一族绿（参考：亮 #aade60、中 #8cc453、草上的影 #388d74） */
    plants: {
      lit: { hue: 126, hueK: 1, c: 1, cMin: 0.15, cMax: 0.165, lAdd: -2 },
      mid: { hue: 130, hueK: 1, c: 1, cMin: 0.14, cMax: 0.155, lAdd: 26 },
      dark: { hue: 172, hueK: 1, c: 1, cMin: 0.08, cMax: 0.09, lAdd: 18 },
    },
    /** 树干、木头、干叶：受光面暖灰褐（参考 #b59f86），侧面也是暖的，影子冷 */
    dry: { lit: { hue: 70, hueK: 0.6, c: 0.85, lAdd: 10 }, mid: { hue: 62, hueK: 0.5, c: 0.7 } },
    /** 硬地：球场是最大的安静面 —— 干净的蓝（≈ #50a3c0），和草影的青绿拉开色相；场上的影子不要饱和宝蓝 */
    court: {
      lit: { hue: 232, hueK: 0.55, c: 0.8 },
      mid: { hue: 225, hueK: 0.3, c: 0.75 },
      dark: { hue: 270, hueK: 0.5, c: 1, cMin: 0.045, cMax: 0.065 },
    },
    club: {
      lit: { c: 0.9 },
      mid: { hue: 270, hueK: 0.5, c: 0.8 },
      dark: { hue: 270, hueK: 0.5, c: 1, cMin: 0.045, cMax: 0.075 },
    },
    water: { lit: { c: 1 }, mid: { c: 1 }, dark: { hue: 250, hueK: 0.3, c: 1 } },
    people: {
      lit: { c: 0.9 },
      mid: { follow: 0.6, shift: -10, c: 0.8 },
      dark: { follow: 0.5, shift: -15, hue: 290, hueK: 0.3, c: 0.8, cMax: 0.07 },
    },
    accent: { lit: { c: 0.75 }, mid: { hue: 282, hueK: 0.4, c: 0.7 } },
  },
  keys: {
    // ── 地 ──
    /** 步道（长廊、小路）：比铺地暗一档、暖一点（≈ #d0aa7c，L ≈ 175），和铺地、浅沙拉开（第 1 轮评判：亮度差不到 5） */
    path: { lit: lit1(66, 0.075, 0.08, 0.78), mid: COOL_MID, dark: { ...COOL_DARK, cMin: 0.04, cMax: 0.044 } },
    flagstone: PAVING,
    stair: PAVING,
    granite: { lit: lit1(66, 0.075, 0.08, 0.8), mid: COOL_MID, dark: { ...COOL_DARK, cMin: 0.04, cMax: 0.044 } },
    paver: PAVING,
    yardGranite: PAVING,
    stallGravel: PAVING,
    aisle: PAVING,
    tile: TILE,
    stucco: { lit: lit1(85, 0.016, 0.02, 0.97), mid: COOL_MID },
    /** 墙顶压顶（俯视是一条贯穿画面的线）：土坯褐，低彩（≈ #a89078），不和草帽抢 */
    cap: { lit: lit1(66, 0.036, 0.04, 0.82), mid: COOL_MID },
    /** 会所的瓦顶：陶红，比铺地的陶砖略红略亮 */
    roofTile: { ...TILE, lit: lit1(45, 0.085, 0.09, 0.9) },
    /**
     * 沥青：暗而静的中性底（≈ #5d5b62，三档同色相，斑块不再跳成冷蓝灰）；影子冷而深（≈ #33354d），和亮面差 ≈ 40 ——
     * 第 4 轮 #585b64 影子只差 14；第 5 轮 #7e7370 是粉褐的脏中灰。
     */
    lotAsphalt: {
      lit: { hue: 300, hueK: 1, c: 1, cMin: 0.01, cMax: 0.012, lMul: 0.68 },
      mid: { hue: 295, hueK: 1, c: 1, cMin: 0.012, cMax: 0.016, lMul: 0.75 },
      dark: { hue: 280, hueK: 1, c: 1, cMin: 0.042, cMax: 0.046, lMul: 0.72 },
    },
    asphalt: {
      lit: { hue: 300, hueK: 1, c: 1, cMin: 0.01, cMax: 0.012, lMul: 0.72 },
      dark: { hue: 280, hueK: 1, c: 1, cMin: 0.042, cMax: 0.046, lMul: 0.76 },
    },
    // ── 草、植物 ──
    /** 草坪亮档 ≈ #aade60（L ≈ 202，锁定的一族绿）：原来 lAdd 28 到了 L 216，比草帽亮 */
    lawn: lawn(14, 34),
    lawnStripe: lawn(6, 30),
    green: lawn(0, 20),
    /** 龙舌兰、烟树这种银绿的：同一族绿里偏蓝、彩度低一点（≈ #93cfa0），不是荧光薄荷也不是结霜的白 */
    silverBlue: {
      lit: { hue: 150, hueK: 1, c: 1, cMin: 0.085, cMax: 0.095, lMul: 0.92 },
      mid: { hue: 136, hueK: 1, c: 1, cMin: 0.08, cMax: 0.09, lMul: 0.95 },
    },
    /** 鼠尾草、灌木：一族绿（≈ #9fcf6a） */
    sage: {
      lit: { hue: 128, hueK: 1, c: 1, cMin: 0.12, cMax: 0.13 },
      mid: { hue: 132, hueK: 1, c: 1, cMin: 0.11, cMax: 0.12 },
    },
    /** 挡风网：暗而低彩的墨青绿框（≈ #2e4f4d）—— 作框的东西不能比被框的球场还鲜（第 3 轮蓝青、第 4 轮饱和墨绿都不对） */
    windscreen: {
      lit: { hue: 185, hueK: 1, c: 1, cMin: 0.045, cMax: 0.05, lMul: 0.8 },
      mid: { hue: 188, hueK: 1, c: 1, cMin: 0.04, cMax: 0.045, lMul: 0.85 },
      dark: { hue: 190, hueK: 1, c: 1, cMin: 0.032, cMax: 0.036, lAdd: 10 },
    },
    // ── 球场 ──
    surround: APRON,
    surroundLight: APRON,
    surroundCrack: APRON,
    surroundWet: APRON,
    pickle: { lit: { hue: 232, hueK: 0.55, c: 0.75 }, mid: { c: 0.75 } },
    kitchen: { lit: { c: 0.75 }, mid: { c: 0.8 } },
    courtShow: { lit: { hue: 232, hueK: 0.55, c: 0.8 }, mid: { c: 0.75 } },
    courtWet: { lit: { hue: 232, hueK: 0.55, c: 0.8 }, mid: { c: 0.75 } },
    clay: CLAY,
    clayBrushed: CLAY,
    clayDust: CLAY,
    clayWet: CLAY,
    // ── 焦点：总监的草帽（一屏里最鲜艳的暖色）──
    straw: { lit: { hue: 88, hueK: 0.6, c: 1, cMin: 0.15, lAdd: -4 }, mid: { hue: 88, hueK: 0.6, c: 1.1, cMin: 0.12 } },
    // ── 不当焦点的彩色东西 ──
    carGold: { lit: { hue: 85, hueK: 0.6, c: 0.3, lAdd: 10 }, mid: { c: 0.5 } },
    /** 奶白车漆：压一档（≈ #b9b2a6 方向，原来 L 227 比草帽亮） */
    carCream: { lit: { c: 0.5, lMul: 0.74 } },
    /** 红车 → 灰蓝（≈ #8197b0；第 3 轮的灰玫瑰读成了泥色），不和草帽抢 */
    carRed: {
      lit: { hue: 255, hueK: 1, c: 1, cMin: 0.045, cMax: 0.05, lMul: 1.25 },
      mid: { hue: 260, hueK: 1, c: 0.6 },
    },
    carNavy: quiet(0.6),
    carMint: quiet(0.55),
    /** 帆布（前台凉棚、遮阳帆）：压一档（原来 L 226 是整屏最亮的一大块，就在草帽旁边） */
    canvas: { lit: lit1(74, 0.05, 0.055, 0.77), mid: CLOTH_MID },
    /** 条纹 / 车棚的蓝：浅灰蓝（≈ #a9b6bf），和奶油的明度差缩小 */
    canvasStripe: { lit: { c: 0.35, lMul: 0.9, lAdd: 6 }, mid: { c: 0.45 } },
    /** 条纹布：和素布同一个奶油色相、只靠明度差（条纹几乎读不出来；伞、帆不再是一屏最吵的东西） */
    fabricStripe: { lit: lit1(74, 0.05, 0.055, 0.8), mid: CLOTH_MID },
    /** 布（遮阳帆、伞）：压一档（L 203 → ≈ 180），不和草帽比亮 */
    fabric: { lit: lit1(74, 0.05, 0.055, 0.8), mid: CLOTH_MID },
    /** 网球（场上的球、门柱顶的网球雕塑）：压一档亮度（≈ #c9cd94，L ≈ 200），不比草帽亮（门柱顶两个球原来 L 236，整屏最亮） */
    ball: { lit: { c: 0.5, lMul: 0.86 }, mid: { c: 0.55, lMul: 0.92 } },
    /** 地上的黄花 → 沙马鞭草的淡紫（≈ #b8a2c8）：黄的、高彩的只留总监的草帽一顶 */
    flowerYellow: {
      lit: { hue: 310, hueK: 1, c: 1, cMin: 0.07, cMax: 0.08, lMul: 0.86 },
      mid: { hue: 305, hueK: 1, c: 1, cMin: 0.06, cMax: 0.07 },
    },
    /** NPC 的草帽：本色草编（≈ #c8b48a），不当总监的替身 */
    strawNpc: { lit: lit1(82, 0.05, 0.055, 0.88), mid: { hue: 78, hueK: 1, c: 1, cMin: 0.04, cMax: 0.045 } },
    flowerRed: quiet(0.6),
    toolOrange: quiet(0.5, 0.85),
    /** 银车、白车：压暗成灰蓝（L ≈ 165），不是全屏最亮的大块 */
    carSilver: {
      lit: { hue: 250, hueK: 1, c: 1, cMin: 0.025, cMax: 0.03, lMul: 0.76 },
      mid: { hue: 255, hueK: 1, c: 0.6 },
    },
    /** 水花、涟漪圈：淡青（≈ #8fd3cf 方向），不是纯白 —— 喷泉边的白圈曾是广场最亮的像素 */
    foam: { lit: { hue: 195, hueK: 0.8, c: 1, cMin: 0.06, cMax: 0.07, lMul: 0.84 } },
    /** 暖色衣服（和白衣服借一个名字）收一点 */
    clothWhite: quiet(0.75),
    clothRed: quiet(0.75),
  },
  /** 时间系统的乘子在白天、傍晚只留一部分彩度（傍晚影子不再是饱和紫；夜里照旧） */
  dayTint: { mid: 0.6, dark: 0.45 },
  sky: { top: 0x58a8e6, horizon: 0xbfe2f2 },
  sun: 0xfff2e0,
  edgeTint: [0.52, 0.55, 0.72],
};
