// 复用的资产（原样 import，不复制）：clubdesk 的那份（= clubfront 的植物、人、长椅、遮阳帆 + desert3d-v2 的工具架）
// + desert3d-v2 的裁判椅（中心球场北边网柱旁）。围网在 terrain.ts 里用 clubdesk 的 buildFences。
// 这些文件归各自的场景管：要改样子就复制到 src/clubstadium/assets/ 再改（同名的本地资产优先），不要改那边的。
// 共享资产（src/clubsite/assets/<id>.ts，court-umbrella、court-net、drink-fountain …）由资产代理画好以后，
// 在 src/clubstadium/assets/<本场景的占位 id>.ts 里一行 re-export，占位自动换掉（见 clubstadium.md「共享资产」）。
import { REUSED as DESK_REUSED } from '../clubdesk/reuse';
import * as people from '../clubsite/people';
import { build as peopleSheet } from '../clubsite/people/sheet';
import { build as umpireChair } from '../desert3d-v2/assets/umpire-chair';
import type { AssetBuild } from './world';

export const REUSED: Record<string, AssetBuild> = {
  ...(DESK_REUSED as unknown as Record<string, AssetBuild>),
  'umpire-chair': umpireChair as unknown as AssetBuild,
  // 人从 clubsite/people 拿（人物代理）：球员、教练、总监、孩子 + 球童（统一的一套：白帽、俱乐部蓝 Polo、白短裤；
  // 少年比例，不要再缩放 —— SLOTS 的 s 0.74 改成 1）、裁判（v0 白衬衫深色裤 / v1 深色外套白帽，默认 sit）。
  // 姿势：球童 bkCrouch / bkStand / bkRoll / bkUmbrella，裁判 sit / call，观众 sit / clap；见 clubsite/people/index.ts。
  player: ((ctx) => people.player(ctx)) as typeof people.player as unknown as AssetBuild,
  coach: ((ctx) => people.coach(ctx)) as typeof people.coach as unknown as AssetBuild,
  director: people.director as unknown as AssetBuild,
  kid: people.kid as unknown as AssetBuild,
  'ball-kid': people.ballKid as unknown as AssetBuild,
  umpire: people.umpire as unknown as AssetBuild,
  'people-sheet': peopleSheet as unknown as AssetBuild,
};
