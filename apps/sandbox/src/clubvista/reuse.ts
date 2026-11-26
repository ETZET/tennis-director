// 复用的资产（原样 import，只读，不复制）：clubsite 的植物、人、长椅（clubsite/reuse.ts）+ 球车；
// 前台的水站、陶罐、毛巾车（clubdesk）；会员场的发球机（clubcourts）；网（clubsite）、裁判椅和球员席（clubstadium）；
// 野餐伞、野餐桌、咖啡车（clubfood）。这个场景的调色板是它们的超集（palette.ts），能直接拿这里的 ctx 建。
// 要改样子就复制到 src/clubvista/assets/ 再改（同名的本地资产优先），不要改那边的。
import { build as ballMachine } from '../clubcourts/assets/ball-machine';
import { build as pot } from '../clubdesk/assets/pot';
import { build as towelCart } from '../clubdesk/assets/towel-cart';
import { build as waterStation } from '../clubdesk/assets/water-station';
import { build as patioUmbrella } from '../clubfood/assets/patio-umbrella';
import { build as picnicTable } from '../clubfood/assets/picnic-table';
import { build as truckCoffee } from '../clubfood/assets/truck-coffee';
import { build as ballCart } from '../clubsite/assets/ball-cart';
import { build as courtNet } from '../clubsite/assets/court-net';
import { buildPickle as sideUmbrella } from '../clubsite/assets/umbrella';
import * as people from '../clubsite/people';
import { REUSED as SITE_REUSED } from '../clubsite/reuse';
import { build as playerBench } from '../clubstadium/assets/player-bench';
import { build as umpireChair } from '../clubstadium/assets/umpire-chair-cc';
import type { AssetBuild } from './ctx';

const as = (b: unknown) => b as AssetBuild;

export const REUSED: Record<string, AssetBuild> = {
  ...(SITE_REUSED as unknown as Record<string, AssetBuild>),
  'ball-cart': as(ballCart),
  'ball-machine': as(ballMachine),
  pot: as(pot),
  'towel-cart': as(towelCart),
  'water-station': as(waterStation),
  player: as(people.player),
  coach: as(people.coach),
  director: as(people.director),
  // 球场：网（网沿本地 z，南北向的场要转 90°）、裁判椅、球员席（clubstadium）
  net: as(courtNet),
  'umpire-chair': as(umpireChair),
  'player-bench': as(playerBench),
  // 泳池：焦点那把粉伞 = 餐车院子的野餐伞 v0；另一把 = 场边的奶白 / 俱乐部蓝伞
  'umbrella-hot': ((ctx) => patioUmbrella({ ...ctx, variant: 0 } as never)) as AssetBuild,
  umbrella: as(sideUmbrella),
  // 咖啡台地：野餐桌（变体 2 = 收起的薄荷伞那套的桌）、咖啡车当咖啡亭
  'cafe-table': as(picnicTable),
  kiosk: as(truckCoffee),
};
