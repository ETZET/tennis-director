// 球场街复用的资产（原样 import，只读）：红土场的拖垫、水管卷盘、扫线刷（clubclay）；匹克球场的网、拍架、翻牌记分牌、器材箱
// （clubsite 的共用实现，clubpickle 用的那几件）；红土场的蓝牌记分牌、工具架、捡球篮、裁判椅（clubsite）。
// id 加 street: 前缀；共用 reuse.ts 里有的（植物、人、长椅、球网、伞、球拍包、水站）直接用原 id。
import { build as dragMat } from '../clubclay/assets/drag-mat';
import { build as hoseReel } from '../clubclay/assets/hose-reel';
import { build as lineBrush } from '../clubclay/assets/line-brush';
import { build as ballHopper } from '../clubsite/assets/ball-hopper';
import { build as gearBox } from '../clubsite/assets/gear-box';
import { build as paddleRack } from '../clubsite/assets/paddle-rack';
import { build as pickleNet } from '../clubsite/assets/pickle-net';
import { buildClay as clayBoard, buildPickle as flipBoard } from '../clubsite/assets/scoreboard';
import { build as toolRack } from '../clubsite/assets/tool-rack';
import { build as umpireChair } from '../clubsite/assets/umpire-chair';
import type { AssetBuild } from './ctx';

const as = (b: unknown) => b as AssetBuild;

export const REUSED: Record<string, AssetBuild> = {
  'street:drag-mat': as(dragMat),
  'street:hose-reel': as(hoseReel),
  'street:line-brush': as(lineBrush),
  'street:ball-hopper': as(ballHopper),
  'street:gear-box': as(gearBox),
  'street:paddle-rack': as(paddleRack),
  'street:pickle-net': as(pickleNet),
  'street:clay-board': as(clayBoard),
  'street:flip-board': as(flipBoard),
  'street:tool-rack': as(toolRack),
  'street:umpire-chair': as(umpireChair),
};
