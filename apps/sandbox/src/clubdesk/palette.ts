// clubdesk 的调色板 = clubmap2 的整张表（= desert3d-v2 + clubfront 的前台材质 + 地图要的红土、草地、匹克球、灰泥……）
// + 这个场景新加的三种材质（DESK）。前台的主角色（帆布、柜台、木构、陶砖、土坯、招牌、挡风布、水桶、陶罐）原样沿用 clubfront 的手挑色，
// 它们都在 clubsite/render/palettes 的 GROUP 表里（club / terracotta / wall / dry），午后配色按组调。
// 新加的三种 2026-11-08 归进了 clubsite/render/palettes/index.ts 的 GROUP：granite → ground（步道一家）、slate → club（黑板留青蓝）、
// brass → accent（午后没有 accent 覆盖 = 全局调色）。底色按"调完以后对"挑（见每条的说明）。
// 规则同 clubsite/render/palette.ts：每档 [本色, 高一级, 低一级]，高/低一级差 6～12，缝 −15…−38、亮边 +15…+33（都 < 60，不出强边缘）；
// 大面积亮面的亮档低一级 ≥ 170，暗档高一级 ≤ 120；暗档换冷色相，不是亮档乘系数。L = 0.2126R + 0.7152G + 0.0722B。

import { EL as MAP_EL, PAL as MAP_PAL, SKY as MAP_SKY } from '../clubmap2/palette';
import type { Swatch } from '../clubsite/render/palette';
import type { Elem, Tones } from '../clubsite/render/toon';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones?: Tones): Swatch => ({ ramp, edge, convex, tones });
/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级] */
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

/** 这个场景新加的材质（clubmap2 的表里没有的） */
const DESK = {
  /**
   * 碎花岗岩（长廊、去草坪的小路；地图上 PATHS 是"碎花岗岩"）：比陶砖铺地冷、比沙灰一点的粉米色（L 208，色相 ~30°，S 0.23）。
   * 和三种地面分得开：陶砖铺地（橙红 L 177）、石板（奶油 L 222，更黄）、沙（金杏）。暗档冷紫 L 109（高一级 117，不跨 120）。
   * 归 'ground' 组（午后：亮档往 68° 染 30%、彩度 ×0.85 → #ecd6c0）：和沙（#edbd83）分得开 —— 更粉、更灰，不撞色。
   * 第二轮（2026-11-08）：只把暗档原值彩度 × 1.55（原 #7c6688；午后暗档封顶 OKLCH C 0.06，原值不够的调完发灰），亮/中档不动。
   */
  granite: s(
    [0xe6cdb2, 0xc8a49a, 0x856297],
    0.1,
    0.05,
    tn(
      [0xe6cdb2, 0xeed6bc, 0xdcc2a8], // L 208 / 217 / 198
      [0xc8a49a, 0xd0aea2, 0xbc988e], // L 171 / 180 / 159
      [0x856297, 0x8d6a9f, 0x78588d], // L 109 / 117 / 99
      [0xccb098, 0xa48280, 0x644682], // 缝 −28 / −34 / −29
      [0xf6e2c8, 0xdcbcae, 0xa279b8], // 亮边 +20 / +23 / +25
    ),
  ),
  /**
   * 黑板（今日场地板、柜台侧面的价目牌）：深青灰（色相 ~170°，暖色世界里一块冷的暗面），朝镜头落中/暗档 L 84 / 54。
   * 粉笔字用 signPaint（暗档也亮，L 150）。归 'club' 组：午后调完 #5c8278 / #485c60 / #2c374b（只吃全局的话亮档发灰绿 #677f73、暗档变褐 #3e3335）。
   */
  slate: s(
    [0x4e7a72, 0x3a5a62, 0x26384e],
    0.5,
    0.3,
    tn(
      [0x4e7a72, 0x56847a, 0x46706a], // L 112 / 122 / 103
      [0x3a5a62, 0x42646a, 0x34525a], // L 84 / 93 / 76
      [0x26384e, 0x2c4056, 0x223246], // L 54 / 61 / 48
      [0x3c625c, 0x2c4850, 0x1a283c], // 缝 −22 / −17 / −15
      [0x6e9a8c, 0x56787c, 0x3a4e66], // 亮边 +31 / +29 / +22（黑板框的上沿）
    ),
  ),
  /**
   * 黄铜（柜台上的服务铃、门柱内侧的门牌、毛巾车的把手）：小面积的暖亮点。暗档玫瑰褐 L 84（和陶砖暗档同一家）。
   * 放在沙上要拉开亮度：亮档 L 202 比沙亮 ~15，主要靠暗档和描边出轮廓 —— 只放在深色底（柜台面、黑板、门柱暗面）前面。
   */
  brass: s(
    [0xf4c860, 0xc48c44, 0x6e4c58],
    0.6,
    0.6,
    tn(
      [0xf4c860, 0xf8d470, 0xecbc56], // L 202 / 212 / 191
      [0xc48c44, 0xcc9850, 0xb8803e], // L 147 / 158 / 135
      [0x6e4c58, 0x785662, 0x64444e], // L 84 / 94 / 76
      [0xd8a84c, 0x9a6a3e, 0x4e3646], // 缝 −30 / −34 / −24
      [0xfce48c, 0xdaa860, 0x926a72], // 亮边 +25 / +27 / +31
    ),
  ),
} as const satisfies Record<string, Swatch>;

/** 整张表：clubmap2（含 clubfront、desert3d-v2）+ DESK。同名的以 DESK 为准（现在没有同名的） */
export const PAL = { ...MAP_PAL, ...DESK } as const;
export type Pal = typeof PAL;
export const SKY = MAP_SKY;

/** 元素预设：clubmap2 的（= clubfront：sand / strata / path / water / foam / tile / flagstone / adobe）+ 碎花岗岩 */
export const EL = {
  ...MAP_EL,
  /** 碎花岗岩：比土路细的颗粒团（7×4 纹素）+ 很少的碎石，几乎没有龟裂；脚印只在长廊中段那几块斑 */
  granite: {
    kind: 'pebbles',
    size: [7, 4],
    seam: 0.5,
    density: [0.01, 0.1],
    patch: 3,
    pebbles: 0.06,
    accent: [0xb49a94, 0x8e7680, 0x5c4c72],
  },
} as const satisfies Record<string, Elem>;
