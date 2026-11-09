// 道具的木头、漆面的元素材质（材质规范 v2，phase B）：长椅、工具架、裁判椅、遮阳帆、捡球篮、球车共用。
// 颜色在这里手挑（PALETTE-SUGGEST：建议搬进 palette.ts 的 tones），每档 [本色, 高一级, 低一级]，高/低一级 ±9～11，
// 缝 −20～30（往冷紫走），亮条 +19～22；暗档往靛紫走、暗档的高一级不跨 120。
// - 木板 `planks`：每块板一个深浅（本档三色里挑）、板与板之间 1 行冷暗缝、缝后一行顺着板的亮条（断续）。
//   板条的方向、宽度、和几何体对齐由各资产给（boards()）。
// - 立柱、梁这类整根木料 `grain`：屏幕空间的竖长条（2 × 7 纹素的 Voronoi），三档里挑色、不画缝 → 顺着木纹的深浅道道。
// - 漆面 `paint`：有机形状的轻微深浅（差 6～9 个亮度）+ 很少的擦痕；金属基本保持干净。
import type { Elem, Tones } from '../../render/toon';

type R3 = [number, number, number];
const tn = (lit: R3, mid: R3, dark: R3, seam: R3, hi: R3): Tones => ({ bands: [lit, mid, dark], seam, hi });

/** PALETTE-SUGGEST woodWeathered.tones：晒白的灰褐木（亮 L182、中 L136、暗 L83）；缝 −22 / −18 / −20（中档的缝挨着亮面的亮条时差 < 80） */
export const WEATHERED_TONES = tn(
  [0xd8b088, 0xe2bc94, 0xd0a680],
  [0xa88074, 0xb28a7c, 0x9c766e],
  [0x5c4c78, 0x66568a, 0x54446e],
  [0xbc9a84, 0x8e6e7a, 0x443a62],
  [0xe4c098, 0xbc9684, 0x726094],
);
/** PALETTE-SUGGEST wood.tones：上过油的橙褐木（亮 L159、中 L119、暗 L75） */
export const WOOD_TONES = tn(
  [0xd8945a, 0xe09e64, 0xcc8a56],
  [0xae6a52, 0xb8745a, 0xa2604e],
  [0x5e426e, 0x684a78, 0x543a66],
  [0xbc7a54, 0x8a5250, 0x463460],
  [0xe8aa6c, 0xc27e5e, 0x76548a],
);
/** PALETTE-SUGGEST metal.tones：青绿漆（亮 L157、中 L117、暗 L70），深浅只差 6～8，擦痕 −16 */
export const METAL_TONES = tn(
  [0x5cb0a0, 0x64b8a6, 0x56a698],
  [0x3e8488, 0x448c8e, 0x3a7c82],
  [0x2c4a6e, 0x325276, 0x284466],
  [0x4c9a90, 0x347078, 0x243e62],
  [0x78c4b2, 0x50989a, 0x3a5c82],
);
/** PALETTE-SUGGEST fabric.tones：奶油帆布（亮 L222，高/低一级 +7 / −8）；深浅块是晒褪/积灰的斑，擦痕当作织纹（−12） */
export const FABRIC_TONES = tn(
  [0xf6dcae, 0xfae4b8, 0xf0d4a6],
  [0xdc9e8c, 0xe2a894, 0xd49888],
  [0x8a6498, 0x926ca0, 0x825c90],
  [0xe6c89e, 0xc88c80, 0x7c588c],
  [0xfcecc8, 0xe8b29c, 0x9a74a8],
);
/** PALETTE-SUGGEST fabricStripe.tones：珊瑚条纹（亮 L145） */
export const STRIPE_TONES = tn(
  [0xf07c4c, 0xf68856, 0xe8764a],
  [0xc0545a, 0xc85e60, 0xb44c54],
  [0x6a3a74, 0x72427c, 0x62346c],
  [0xd86844, 0xa84650, 0x5c3068],
  [0xfa9a66, 0xd06a66, 0x7c4a86],
);

/**
 * 木板：沿本地轴 axis（单位向量）每 width 米一块板。sk = 物件缩放：缝和亮条宽 1 / sk 纹素（竖直面、地面纵深上
 * 一纹素只有 0.707 屏幕行，给 0.75～0.8 让它稳稳落一行）。板的边界在 axis·p = k·width 上 —— 要和几何体的板对齐，
 * 把几何体平移到对齐的位置、再把网格挪回去（vElemL 是几何体自己的坐标）。streak: false = 不画缝后的亮条（大面上亮条 + 缝每 4 纹素一对 = 条纹）。
 * 每块板的深浅是 eh(板号, seed) 挑的：要相邻的板不同色，换 seed 试（tones 的 toneW 也会变）。
 */
export function boards(
  axis: [number, number, number],
  width: number,
  o: { seam?: number; sk?: number; seed?: number; streak?: boolean } = {},
): Elem {
  return {
    kind: 'planks',
    space: 'local',
    p: [axis[0], axis[1], axis[2], width],
    q: [o.sk ?? 1, 0, 0, 0],
    seam: o.seam ?? 1,
    hi: o.streak === false ? 0 : 1,
    seed: o.seed ?? 0,
  };
}

/** 整根木料的木纹：屏幕上 2 × 7 纹素的竖长条，三档里挑色，不画缝 */
export function grain(seed = 0): Elem {
  return { kind: 'stones', size: [2, 7], seam: 0, hi: 0, seed };
}

/** 漆面（金属、帆布）：size 纹素的有机深浅块 + 擦痕（density） */
export function paint(size: [number, number], density: [number, number], seed = 0): Elem {
  return { kind: 'paint', size, density, patch: 2.5, seed };
}
