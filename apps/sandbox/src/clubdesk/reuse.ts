// 复用的资产：clubsite/reuse.ts 那份（植物、人、长椅、遮阳帆，直接 import 那边的 build）+ clubsite/assets 的工具架（总监以后拿扫帚、捡球器、吹叶机）。
// 要改这个场景里的样子就复制到 src/clubdesk/assets/ 再改（同名的本地资产优先），不要改 clubsite 的。

import { build as toolRack } from '../clubsite/assets/tool-rack';
import { REUSED as SITE_REUSED } from '../clubsite/reuse';
import type { AssetBuild } from './ctx';

export const REUSED: Record<string, AssetBuild> = {
  ...(SITE_REUSED as unknown as Record<string, AssetBuild>),
  'tool-rack': toolRack as unknown as AssetBuild,
};
