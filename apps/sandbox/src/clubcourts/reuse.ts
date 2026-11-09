// 复用的资产（原样 import，不复制；要改样子就复制到 src/clubcourts/assets/ 再改，同名的本地资产优先）：
// - clubsite/reuse.ts 那份（植物、人、总监、教练、长椅、遮阳帆）
// - clubsite/assets 的球车（教练喂球）、捡球篮、地上的工具（捡球器躺着）、工具架
// - clubdesk 已经画好的自助水站（场边的饮水点，同一个东西）
// - 人（球员、教练、总监、孩子、球童、裁判）从 clubsite/people 拿：多了 sit / clap / sip 等姿势、孩子的比例（不是把大人缩小）；
//   总监刮水 = setProp(<刮水板>) + pose('squeegee')，推划线车 / 卷盘车 = 推车握点（cart）+ push
// 这些 build 的 AssetCtx 和这里同形状、调色板是这里的子集，所以能直接拿这里的 ctx 建。
import { build as waterStation } from '../clubdesk/assets/water-station';
import { build as ballCart } from '../clubsite/assets/ball-cart';
import { build as ballHopper } from '../clubsite/assets/ball-hopper';
import { build as tool } from '../clubsite/assets/tool';
import { build as toolRack } from '../clubsite/assets/tool-rack';
import * as people from '../clubsite/people';
import { build as peopleSheet } from '../clubsite/people/sheet';
import { REUSED as SITE_REUSED } from '../clubsite/reuse';
import type { AssetBuild } from './ctx';

export const REUSED: Record<string, AssetBuild> = {
  ...(SITE_REUSED as unknown as Record<string, AssetBuild>),
  'ball-cart': ballCart as unknown as AssetBuild,
  'ball-hopper': ballHopper as unknown as AssetBuild,
  tool: tool as unknown as AssetBuild,
  'tool-rack': toolRack as unknown as AssetBuild,
  'water-station': waterStation as unknown as AssetBuild,
  player: ((ctx) => people.player(ctx)) as typeof people.player as unknown as AssetBuild,
  coach: ((ctx) => people.coach(ctx)) as typeof people.coach as unknown as AssetBuild,
  director: people.director as unknown as AssetBuild,
  kid: people.kid as unknown as AssetBuild,
  'ball-kid': people.ballKid as unknown as AssetBuild,
  umpire: people.umpire as unknown as AssetBuild,
  'people-sheet': peopleSheet as unknown as AssetBuild,
};
