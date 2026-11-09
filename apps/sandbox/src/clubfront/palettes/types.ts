// 配色方案的形状。一个方案 = 全局按档调色（grade）+ 按材质组 / 单个材质的覆盖 + 天空、太阳色、轮廓压暗色。
// 方案不改 palette.ts 的原值：main.ts 在建材质的时候把调色板的颜色过一遍 gradeOpts（见 index.ts）。
import type { Pal } from '../palette';
import type { Grade, PartialGrade } from './grade';

/** 材质分组（index.ts 的 GROUP 表把每个调色板名字归到一组；没归的只吃全局 grade） */
export type Group =
  | 'ground' // 沙、步道、台阶、石板路
  | 'rock' // 崖壁、岛底、石头
  | 'wall' // 土坯灰泥墙、水泥
  | 'terracotta' // 陶砖铺地、墙顶压顶、陶罐
  | 'plants' // 绿的植物
  | 'dry' // 枯叶裙、树干、枝、干草、木头
  | 'court' // 球场漆面、白线、网
  | 'club' // 俱乐部的东西：柜台、帆布、招牌、挡风布、铁件
  | 'people' // 皮肤、头发、衣服、草帽
  | 'accent' // 花、球、工具橙、锈、漆金属
  | 'water';

export interface Scheme {
  /** URL 里的 ?pal= */
  id: string;
  /** 切换器上显示的名字（中文，短） */
  name: string;
  /** 一句话说意图 */
  hint: string;
  grade: Grade;
  groups?: Partial<Record<Group, PartialGrade>>;
  /** 单个材质：覆盖调法，或者 'keep' = 原样（调试色、占位、主角色） */
  keys?: Partial<Record<keyof Pal, PartialGrade | 'keep'>>;
  /** 天空上下两色（main.ts 量化成 4 条色带） */
  sky: { top: number; horizon: number };
  /** 太阳色：shader 里亮档乘 mix(1, 太阳色 / 最大分量, 0.35) */
  sun: number;
  /** 侧边/下沿轮廓压暗时乘的颜色（pipeline 默认 0.5, 0.55, 0.78 = 偏靛） */
  edgeTint: [number, number, number];
  /** 描边强度（不填 = main.ts 默认） */
  edges?: { depthStrength?: number; normalStrength?: number; topStrength?: number };
}
