// 复用的资产（原样 import，不复制；要改样子就复制到 src/clubgolf/assets/ 再改，同名的本地资产优先）：
// - clubsite/reuse.ts 那份：植物（蒲葵、palo verde、灌木、龙舌兰、仙人球、ocotillo、红岩）、长椅；
// - 人（player / director）从 clubsite/people 拿：同样的人 + 新姿势（sit…）、手里挂工具（hold，白模里挂一根占位的球杆）。
// 这些 build 的 AssetCtx 和这里同形状、调色板是这里的子集，所以能直接拿这里的 ctx 建。
import * as people from '../clubsite/people';
import { REUSED as SITE_REUSED } from '../clubsite/reuse';
import type { AssetBuild } from './ctx';

export const REUSED: Record<string, AssetBuild> = {
  ...(SITE_REUSED as unknown as Record<string, AssetBuild>),
  player: ((ctx) => people.player(ctx)) as typeof people.player as unknown as AssetBuild,
  director: people.director as unknown as AssetBuild,
};
