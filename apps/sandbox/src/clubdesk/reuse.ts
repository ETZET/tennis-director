// 复用的资产：clubfront 那份（= desert3d-v2 的植物、人、长椅、遮阳帆，直接 import 那边的 build）+ desert3d-v2 的工具架（总监以后拿扫帚、捡球器、吹叶机）。
// 这些文件归 desert3d-v2 管：要改样子就复制到 src/clubdesk/assets/ 再改（同名的本地资产优先），不要改那边的。
import { REUSED as CLUBFRONT_REUSED } from '../clubfront/reuse';
import { build as toolRack } from '../desert3d-v2/assets/tool-rack';
import type { AssetBuild } from './world';

export const REUSED: Record<string, AssetBuild> = {
  ...(CLUBFRONT_REUSED as unknown as Record<string, AssetBuild>),
  'tool-rack': toolRack as unknown as AssetBuild,
};
