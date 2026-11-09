// 各场景共用的现成资产表（原来在 clubfront/reuse.ts）：植物（clubsite/nature）、人（clubsite/people/rig）、长椅、遮阳帆（clubsite/assets）。
// 这些资产按底表（render/palette-base.ts）建；场景的调色板都是它的超集，所以能直接拿场景的 ctx 建。
// 场景的 reuse.ts 从这里展开再加自己的；要改某个场景里的样子就复制到 src/<场景>/assets/ 再改（同名的本地资产优先）。

import { build as bench } from './assets/bench';
import { build as shadeSail } from './assets/shade-sail';
import { build as agave } from './nature/agave';
import { build as barrelCactus } from './nature/barrel-cactus';
import { build as brittlebush } from './nature/brittlebush';
import { build as cholla } from './nature/cholla';
import { build as creosote } from './nature/creosote';
import { build as fanPalm } from './nature/fan-palm';
import { build as ocotillo } from './nature/ocotillo';
import { build as paloVerde } from './nature/palo-verde';
import { build as rocks } from './nature/rocks';
import { build as smokeTree } from './nature/smoke-tree';
import { build as coach } from './people/rig/coach';
import { build as director } from './people/rig/director';
import { build as player } from './people/rig/player';
import type { AssetBuild } from './render/ctx';

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
