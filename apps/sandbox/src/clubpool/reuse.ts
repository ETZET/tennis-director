// 复用的资产（原样 import，不复制）：clubplaza 的那份（= clubdesk 的植物、人、长椅、陶罐 + clubsite/people 的人和新姿势 kid / director）
// + 共用的场边遮阳伞（clubsite/assets/umbrella.ts 的 clay 款：胖木杆、蓝白帆布；池南边躺椅之间三把）
// + clubdesk 画好的毛巾车（这里当"干净毛巾"架）+ clubplaza 画好的捞网、落叶、大尾拟八哥（池沿喝水的那只）。
// 这些文件归各自的场景管：要改样子就复制到 src/clubpool/assets/ 再改（同名的本地资产优先），不要改那边的。
import { build as towelCart } from '../clubdesk/assets/towel-cart';
import { build as grackle } from '../clubplaza/assets/grackle';
import { build as palmLitter } from '../clubplaza/assets/palm-litter';
import { build as skimNet } from '../clubplaza/assets/skim-net';
import { REUSED as PLAZA_REUSED } from '../clubplaza/reuse';
import { buildClay as courtUmbrella } from '../clubsite/assets/umbrella';
import type { AssetBuild } from './ctx';

export const REUSED: Record<string, AssetBuild> = {
  ...(PLAZA_REUSED as unknown as Record<string, AssetBuild>),
  'court-umbrella': courtUmbrella as unknown as AssetBuild,
  'towel-cart': towelCart as unknown as AssetBuild,
  'skim-net': skimNet as unknown as AssetBuild,
  'palm-litter': palmLitter as unknown as AssetBuild,
  grackle: grackle as unknown as AssetBuild,
};
