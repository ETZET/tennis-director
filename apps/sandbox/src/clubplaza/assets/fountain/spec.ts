// 喷泉的细部尺寸（本地坐标：原点 = 喷泉中心、广场顶面 y 0；+z 朝镜头（南），+x 朝东；米）。
// 大尺寸照 layout.ts 的 FOUNTAIN_SPEC（池壁外 4.6、水面 r 4.0、池壁高 0.6、水面 0.42、两层碗、顶 3.6），这里只补细部。
// palm-fountain 和 fountain-spray 共用：帘子挂在碗沿上、四股小水柱落在水面的涟漪上，两边的数要对得上。
import { FOUNTAIN_SPEC as F } from '../../layout';

export { F };

/** 池壁：外立面 = 下面一截土坯（plinth）+ 上面一圈塔拉韦拉花砖带；顶上压顶（cap 色，伸出 0.08） */
export const WALL = {
  rOut: F.basinR,
  rIn: F.waterR,
  /** 压顶：宽 0.7（里沿压过池壁 0.0、外沿伸出 0.08），厚 0.08 */
  capIn: F.waterR - 0.04,
  capOut: F.basinR + 0.08,
  capTop: F.wallH,
  capBot: F.wallH - 0.08,
  /** 花砖带：压顶下面 0.36（竖屏 1× 下 ≈ 6 行：一行压顶下的阴影线 + 4 行方砖 + 一行奶白压边）；下面 0.16 是土坯 */
  tileTop: F.wallH - 0.08,
  tileBot: F.wallH - 0.08 - 0.36,
  /** 池壁里面露出水面的一截（朝南的那半在后面，朝镜头） */
  innerBot: F.waterY - 0.02,
} as const;

/** 下碗：剖面 (r, y)，从柱子接口往外、往上到碗沿，再往里到水面 */
export const BOWL1 = {
  rim: F.bowl1.r,
  lipBot: F.bowl1.y + 0.18,
  lipTop: F.bowl1.y + F.bowl1.t,
  lipIn: F.bowl1.r - 0.17,
  waterY: F.bowl1.y + F.bowl1.t - 0.07,
  waterR: F.bowl1.r - 0.19,
} as const;

export const BOWL2 = {
  rim: F.bowl2.r,
  lipBot: F.bowl2.y + 0.1,
  lipTop: F.bowl2.y + F.bowl2.t,
  lipIn: F.bowl2.r - 0.12,
  waterY: F.bowl2.y + F.bowl2.t - 0.05,
  waterR: F.bowl2.r - 0.14,
} as const;

/** 溢流帘：从碗沿顶上翻出来、贴着碗沿外立面（花砖圈只在帘缝里、关水时露出来），一直落到下面那层的水面 */
export const CURTAINS = [
  { id: 1, rTop: BOWL1.rim + 0.03, rBot: BOWL1.rim + 0.09, yTop: BOWL1.lipTop - 0.01, yBot: F.waterY },
  { id: 2, rTop: BOWL2.rim + 0.03, rBot: BOWL2.rim + 0.06, yTop: BOWL2.lipTop - 0.01, yBot: BOWL1.waterY },
] as const;

/** 顶上往上冒的水柱 */
export const CROWN = { y0: F.finialTop - 0.02, y1: F.finialTop + 0.7, r: 0.07 } as const;

/**
 * 池壁里面四股往里的弧形小水柱（45° 方向）：出水口在压顶里沿（r 3.92、y 0.6），弧顶比出水口高 0.75，落在水面 r 2.35。
 * 角度：0 = 东、90 = 南（朝镜头）。
 */
export const JETS = {
  angles: [45, 135, 225, 315],
  r0: WALL.capIn - 0.04,
  y0: F.wallH + 0.02,
  r1: 2.35,
  peak: 0.75,
  /** 每股几颗水珠、走一趟几秒 */
  drops: 8,
  period: 0.9,
} as const;

/** 落点（水面上，本地 xz） */
export const LANDINGS: [number, number][] = JETS.angles.map((d) => {
  const a = (d * Math.PI) / 180;
  return [Math.cos(a) * JETS.r1, Math.sin(a) * JETS.r1];
});
