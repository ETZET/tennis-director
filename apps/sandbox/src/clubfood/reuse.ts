// 复用的资产（原样 import，不复制）：clubplaza 的那份（= clubdesk 的植物、人、长椅、陶罐、大门 + clubsite/people 的人和新姿势）
// + clubplaza 画好的饮料车（这里当"鲜果水"小推车：洛神花红 / 柠檬水黄，有摊主）、大尾拟八哥（偷薯条、站在垃圾桶盖上）
// + clubdesk 画好的自助水站。
// 这些文件归各自的场景管：要改样子就复制到 src/clubfood/assets/ 再改（同名的本地资产优先），不要改那边的。
import { build as waterStation } from '../clubdesk/assets/water-station';
import { build as drinksCart } from '../clubplaza/assets/drinks-cart';
import { build as grackle } from '../clubplaza/assets/grackle';
import { build as grackles } from '../clubplaza/assets/grackles';
import { REUSED as PLAZA_REUSED } from '../clubplaza/reuse';
import type { AssetBuild } from './ctx';

export const REUSED: Record<string, AssetBuild> = {
  ...(PLAZA_REUSED as unknown as Record<string, AssetBuild>),
  'drinks-cart': drinksCart as unknown as AssetBuild,
  grackle: grackle as unknown as AssetBuild,
  grackles: grackles as unknown as AssetBuild,
  'water-station': waterStation as unknown as AssetBuild,
};
