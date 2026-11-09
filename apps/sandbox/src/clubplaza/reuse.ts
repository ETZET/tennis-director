// 复用的资产（原样 import，不复制）：clubdesk 的那份（= clubfront 的植物、人、长椅、遮阳帆 + desert3d-v2 的工具架）
// + clubdesk 已经画好的陶罐（花盆）和大门（横屏右下角）。围网在 terrain.ts 里用 clubdesk 的 buildFences。
// 人（player / coach / director / kid）从 clubsite/people 拿：同样的人 + 新姿势（sit、skim、pour…）、手里挂工具；
// kid = 单画比例的孩子（代替 player × 0.62）。people-sheet = 姿势一览（画廊 ?asset=people-sheet）。
// 这些文件归各自的场景管：要改样子就复制到 src/clubplaza/assets/ 再改（同名的本地资产优先），不要改那边的。
import { build as eastGate } from '../clubdesk/assets/east-gate';
import { build as pot } from '../clubdesk/assets/pot';
import { REUSED as DESK_REUSED } from '../clubdesk/reuse';
import * as people from '../clubsite/people';
import { build as peopleSheet } from '../clubsite/people/sheet';
import type { AssetBuild } from './world';

export const REUSED: Record<string, AssetBuild> = {
  ...(DESK_REUSED as unknown as Record<string, AssetBuild>),
  pot: pot as unknown as AssetBuild,
  'east-gate': eastGate as unknown as AssetBuild,
  player: ((ctx) => people.player(ctx)) as typeof people.player as unknown as AssetBuild,
  coach: ((ctx) => people.coach(ctx)) as typeof people.coach as unknown as AssetBuild,
  director: people.director as unknown as AssetBuild,
  kid: people.kid as unknown as AssetBuild,
  'people-sheet': peopleSheet as unknown as AssetBuild,
};
