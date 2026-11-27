// 会所大堂（lobby）复用的会所一层资产（clubhouse/assets，只读 import，不复制）：接待台背后的会徽、休息区的壁炉 / 沙发 / 地毯 / 茶几 / 奖杯柜、
// 商店街的球拍墙 / 鞋墙 / 衣架 / 展示桌 / 收银台 / 穿线机 / 橱窗、咖啡角的吧台 / 糕点柜 / 吧凳、公告板、球赛电视。
// 调色板是 clubhouse 的超集（palette.ts 并了 HOUSE_PAL），颜色一个不差。要改样子就复制到 assets/lobby-*.ts 再改。
import { build as barStool } from '../clubhouse/assets/bar-stool';
import { build as clothesRack } from '../clubhouse/assets/clothes-rack';
import { build as clubSign } from '../clubhouse/assets/club-sign';
import { build as coffeeTable } from '../clubhouse/assets/coffee-table';
import { build as fireplace } from '../clubhouse/assets/fireplace';
import { build as noticeBoard } from '../clubhouse/assets/notice-board';
import { build as racketWall } from '../clubhouse/assets/racket-wall';
import { build as rug } from '../clubhouse/assets/rug';
import { build as shopCafeCounter } from '../clubhouse/assets/shop-cafe-counter';
import { build as shopCounter } from '../clubhouse/assets/shop-counter';
import { build as shopDisplayTable } from '../clubhouse/assets/shop-display-table';
import { build as shopMerchShelves } from '../clubhouse/assets/shop-merch-shelves';
import { build as shopPastryCase } from '../clubhouse/assets/shop-pastry-case';
import { build as shopShoeWall } from '../clubhouse/assets/shop-shoe-wall';
import { build as shopSign } from '../clubhouse/assets/shop-sign';
import { build as sofa } from '../clubhouse/assets/sofa';
import { build as stringingMachine } from '../clubhouse/assets/stringing-machine';
import { build as trophyCase } from '../clubhouse/assets/trophy-case';
import { build as matchTv } from '../clubhouse/assets/up-match-tv';
import { build as windowDisplay } from '../clubhouse/assets/window-display';
import type { AssetBuild } from './ctx';

const as = (b: unknown) => b as AssetBuild;

export const REUSED: Record<string, AssetBuild> = {
  'lobby:bar-stool': as(barStool),
  'lobby:clothes-rack': as(clothesRack),
  'lobby:club-sign': as(clubSign),
  'lobby:coffee-table': as(coffeeTable),
  'lobby:fireplace': as(fireplace),
  'lobby:notice-board': as(noticeBoard),
  'lobby:racket-wall': as(racketWall),
  'lobby:rug': as(rug),
  'lobby:cafe-counter': as(shopCafeCounter),
  'lobby:counter': as(shopCounter),
  'lobby:display-table': as(shopDisplayTable),
  'lobby:merch-shelves': as(shopMerchShelves),
  'lobby:pastry-case': as(shopPastryCase),
  'lobby:shoe-wall': as(shopShoeWall),
  'lobby:shop-sign': as(shopSign),
  'lobby:sofa': as(sofa),
  'lobby:stringing-machine': as(stringingMachine),
  'lobby:trophy-case': as(trophyCase),
  'lobby:match-tv': as(matchTv),
  'lobby:window-display': as(windowDisplay),
};
