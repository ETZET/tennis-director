// 复用的资产（原样 import，不复制；要改样子就复制到 src/clubclay/assets/ 再改，同名的本地资产优先）：
// - clubsite/reuse.ts 那份（植物、人、总监、教练、长椅、遮阳帆）
// - clubsite/assets 的裁判椅、捡球篮、工具架
// - clubdesk 已经画好的自助水站（场边的饮水点，同一个东西）
// - 人（player / coach / director / kid）从 clubsite/people 拿：同样的人 + 新姿势（sit、drag、water…）、手里挂工具。
//   裁判坐裁判椅：setSeat(1.77, 1.54) + pose('sit')。people-sheet = 姿势一览（画廊 ?asset=people-sheet）。
// 这些 build 的 AssetCtx 和这里同形状、调色板是这里的子集，所以能直接拿这里的 ctx 建。
import { build as waterStation } from '../clubdesk/assets/water-station';
import { build as ballHopper } from '../clubsite/assets/ball-hopper';
import { build as toolRack } from '../clubsite/assets/tool-rack';
import { build as umpireChair } from '../clubsite/assets/umpire-chair';
import * as people from '../clubsite/people';
import { build as peopleSheet } from '../clubsite/people/sheet';
import { REUSED as SITE_REUSED } from '../clubsite/reuse';
import type { AssetBuild } from './ctx';

export const REUSED: Record<string, AssetBuild> = {
  ...(SITE_REUSED as unknown as Record<string, AssetBuild>),
  'umpire-chair': umpireChair as unknown as AssetBuild,
  'ball-hopper': ballHopper as unknown as AssetBuild,
  'tool-rack': toolRack as unknown as AssetBuild,
  'water-station': waterStation as unknown as AssetBuild,
  player: ((ctx) => people.player(ctx)) as typeof people.player as unknown as AssetBuild,
  coach: ((ctx) => people.coach(ctx)) as typeof people.coach as unknown as AssetBuild,
  director: people.director as unknown as AssetBuild,
  kid: people.kid as unknown as AssetBuild,
  'people-sheet': peopleSheet as unknown as AssetBuild,
};
