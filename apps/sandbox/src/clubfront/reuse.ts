// 从 desert3d-v2 复用的资产：直接 import 那边的 build（不复制）。同一个世界：植物、人、长椅、遮阳帆原样用。
// 能直接拿过来，是因为 clubfront 的 AssetCtx 和 desert3d-v2 的同形状，调色板是 desert3d-v2 那张表的超集（palette.ts）。
// 这些文件归 desert3d-v2 管：要改样子就复制到 src/clubfront/assets/ 再改（同名的本地资产优先），不要改那边的。
import { build as agave } from '../desert3d-v2/assets/agave';
import { build as barrelCactus } from '../desert3d-v2/assets/barrel-cactus';
import { build as bench } from '../desert3d-v2/assets/bench';
import { build as brittlebush } from '../desert3d-v2/assets/brittlebush';
import { build as cholla } from '../desert3d-v2/assets/cholla';
import { build as coach } from '../desert3d-v2/assets/coach';
import { build as creosote } from '../desert3d-v2/assets/creosote';
import { build as director } from '../desert3d-v2/assets/director';
import { build as fanPalm } from '../desert3d-v2/assets/fan-palm';
import { build as ocotillo } from '../desert3d-v2/assets/ocotillo';
import { build as paloVerde } from '../desert3d-v2/assets/palo-verde';
import { build as player } from '../desert3d-v2/assets/player';
import { build as rocks } from '../desert3d-v2/assets/rocks';
import { build as shadeSail } from '../desert3d-v2/assets/shade-sail';
import { build as smokeTree } from '../desert3d-v2/assets/smoke-tree';
import type { AssetBuild } from './world';

export const REUSED: Record<string, AssetBuild> = {
  'fan-palm': fanPalm,
  'palo-verde': paloVerde,
  'smoke-tree': smokeTree,
  creosote,
  brittlebush,
  agave,
  'barrel-cactus': barrelCactus,
  cholla,
  ocotillo,
  rocks,
  bench,
  'shade-sail': shadeSail,
  player,
  director,
  coach,
};
