// clubpool 的调色板 = clubplaza 的整张表（= clubdesk + 喷泉池水、塔拉韦拉蓝釉砖）+ 这个场景新加的三种（POOL）。
// 泳池小景的颜色几乎都是现成的：池畔（flagstone，"冷台面"那种浅奶油石板）、池沿压顶（concrete 浅奶油）、水线一圈花砖（talavera）、
// 抬高的池畔平台侧面（stucco 白灰泥，和会所一家）、帐篷（canvas / canvasStripe）、草坪（lawn）、人、蒲葵。
// 新加的只有主角的冷色（池水）和两块提议的暖色（躺椅垫、火烈鸟浮床）。
//
// 池水为什么不直接用 fountainWater：泳池是白灰泥池底 + 浅水 → 比喷泉的孔雀蓝更亮、更"青"（棕榈泉度假泳池那种青绿玻璃色）；
// 一大块（14 × 10 米）朝天，几乎全落亮档 → 亮档是画面里的主角色，中档给池壁投影和深水端，暗档只在池壁脚下。
// 午后配色（golden）会把暗档往玫瑰褐拉、亮档乘暖阳（G ×0.93、B ×0.86）→ 池水变褐水 / 薄荷绿。两步挡住（同 clubplaza）：
//   1. PROXY 借 club 组过调色（暗档往 285° 蓝紫走，不往玫瑰褐走）；
//   2. main.ts 的 SUN_SKIP 把亮档先除掉太阳色的 0.75 份（水面亮的地方是反射的天光，不该被太阳染暖）。
// 规则同 clubdesk/palette.ts：每档 [本色, 高一级, 低一级]，高/低一级差 6～12，缝 −15…−38、亮边 +15…+33（都 < 60，不出强边缘）；
// 暗档换冷色相。L = 0.2126R + 0.7152G + 0.0722B。

import { EL as PLAZA_EL, PAL as PLAZA_PAL, PROXY as PLAZA_PROXY, SKY as PLAZA_SKY } from '../clubplaza/palette';
import type { Swatch } from '../clubsite/render/palette';
import type { Tones } from '../clubsite/render/toon';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones?: Tones): Swatch => ({ ramp, edge, convex, tones });
/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级] */
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

/** 这个场景新加的材质 */
const POOL = {
  /**
   * 泳池水（主角）：亮档青玻璃色 L 189、中档天青 L 144、暗档钴蓝 L 91。比喷泉水（L 183 / 140 / 75）亮一点、更偏天青（白池底）；
   * 原值故意偏蓝（色相 ~194°）：午后的 club 组调色会往绿转约 10°，画面上落在 ~183° 的青（第一版原值 183° → 画面 #7ae4da，174°，发薄荷）。
   * 亮边（+25 左右）给资产阶段的水面闪光、池底的光网（焦散）用；缝给池底泳道线 / 池底砖缝（透过水看得到）用。
   */
  poolWater: s(
    [0x46dcfa, 0x22b0e6, 0x2a66b6],
    0.05,
    0,
    tn(
      [0x46dcfa, 0x56e2fc, 0x3cd2f2], // L 189 / 197 / 181
      [0x22b0e6, 0x2eb8ea, 0x1aa2da], // L 144 / 151 / 134
      [0x2a66b6, 0x3270be, 0x245caa], // L 91 / 99 / 83
      [0x34c2ea, 0x1690cc, 0x1e4a9a], // 缝 −20 / −26 / −20
      [0x96f2fe, 0x60d0f0, 0x4686cc], // 亮边 +31 / +31 / +31
    ),
  ),
  /**
   * 躺椅垫（提议的主色）：橘子橙。池水是青，暖色的垫子一排排在池南边，是画面里第二块饱和的颜色（青 ↔ 橙对着）。
   * 垫子朝天 → 几乎全亮档；资产阶段加一条奶白滚边 / 条纹（clothWhite）。
   */
  accCushion: s([0xffa04a, 0xea6a38, 0x8e3a4c], 0.4, 0.3),
  /** 火烈鸟浮床（池里的一块粉，派对气氛 + 风把它吹到一边的小故事）：粉 L 170 / 120 / 78 */
  accFlamingo: s([0xff8ebc, 0xe25c96, 0x86426e], 0.4, 0.3),
} as const satisfies Record<string, Swatch>;

/** 整张表：clubplaza（含 clubdesk、clubmap2、clubfront、desert3d-v2）+ POOL */
export const PAL = { ...PLAZA_PAL, ...POOL } as const;
export type Pal = typeof PAL;
export const SKY = PLAZA_SKY;
export const EL = PLAZA_EL;

/**
 * 新加的材质借哪个材质名过配色方案的 grade（main.ts 的 palOpts 用）：池水借 club 组（暗档往蓝紫走），暖色借 accent 组。
 * clubplaza 的池水、花砖照旧。建议核心代理把它们归进 GROUP 以后删这里。
 */
export const PROXY: Partial<Record<keyof Pal, keyof Pal>> = {
  ...(PLAZA_PROXY as Partial<Record<keyof Pal, keyof Pal>>),
  poolWater: 'jug',
  accCushion: 'toolOrange',
  accFlamingo: 'flowerRed',
};

/** 亮档要除掉多少太阳色（main.ts 的 unSun；1 = 一点不染）：水面亮处是天光 */
export const SUN_SKIP: Partial<Record<keyof Pal, number>> = { fountainWater: 0.75, poolWater: 0.75 };

/** 主色的 key（占位用） */
export type Accent = keyof typeof POOL | 'clothRed' | 'canvasStripe' | 'flowerYellow';
