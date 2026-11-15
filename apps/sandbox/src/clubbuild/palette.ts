// clubbuild 的调色板 = 几个做好的俱乐部场景的表合在一起（只读 import），让复用的现成素材都能用这里的 ctx 建。
// 新材质不在这个文件里加：每组素材一个自己的文件（palette-<组>.ts，export const EXTRA = {...} satisfies Record<string, Swatch>），
// 在下面 spread 进来 —— 几个子代理同时改不会撞。新材质的挑色规则照 clubsite/render/palette.ts 文件头。

import { PAL as CLAY_PAL } from '../clubclay/palette';
import { PAL as COURTS_PAL } from '../clubcourts/palette';
import { PAL as FOOD_PAL } from '../clubfood/palette';
import { PAL as HOUSE_PAL } from '../clubhouse/palette';
import { PAL as PICKLE_PAL } from '../clubpickle/palette';
import { EL as PLAZA_EL, PAL as PLAZA_PAL, SKY as PLAZA_SKY } from '../clubplaza/palette';
import { PAL as POOL_PAL } from '../clubpool/palette';
import { PAL as STADIUM_PAL } from '../clubstadium/palette';
import { EXTRA as BUILDINGS_EXTRA } from './palette-buildings';
import { EXTRA as COURTS_EXTRA } from './palette-courts';
import { EXTRA as GROUNDS_EXTRA } from './palette-grounds';
import { EXTRA as UI_EXTRA } from './palette-ui';

export const PAL = {
  ...PLAZA_PAL,
  ...CLAY_PAL,
  ...COURTS_PAL,
  ...PICKLE_PAL,
  ...STADIUM_PAL,
  ...FOOD_PAL,
  ...POOL_PAL,
  ...HOUSE_PAL,
  ...UI_EXTRA,
  ...COURTS_EXTRA,
  ...BUILDINGS_EXTRA,
  ...GROUNDS_EXTRA,
} as const;
export type Pal = typeof PAL;
export const SKY = PLAZA_SKY;
export const EL = PLAZA_EL;
