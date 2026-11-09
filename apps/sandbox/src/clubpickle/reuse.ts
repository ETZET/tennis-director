// 复用的资产（原样 import，不复制）：
// - clubdesk 的 REUSED（= clubsite/reuse.ts 的植物、人、长椅、遮阳帆 + 工具架）；
// - clubdesk 自己画好的资产（凉棚、柜台、后柜、毛巾车、水站、黑板、大门、陶罐、围网）—— 横屏右边露出前台，水站还放一个在场边；
// - clubsite/assets 的捡球篮（ball-hopper：总监捡完球倒进去）；
// - 人（player / coach / director / kid）从 clubsite/people 拿：同样的人 + 新姿势（sit、crank、dink…）、匹克球拍、手里挂工具。
//   这里 setProp('racket') 自动换成匹克球拍（paddle，颜色按变体）。people-sheet = 姿势一览（画廊 ?asset=people-sheet）。
// 这些文件归别的场景管：要改样子就复制到 src/clubpickle/assets/ 再改（同名的本地资产优先），不要改那边的。
import { REUSED as DESK_REUSED } from '../clubdesk/reuse';
import { build as ballHopper } from '../clubsite/assets/ball-hopper';
import * as people from '../clubsite/people';
import { build as peopleSheet } from '../clubsite/people/sheet';
import type { AssetBuild } from './ctx';

const DESK_MODS = import.meta.glob<{ build: AssetBuild }>('../clubdesk/assets/*.ts', { eager: true });
const DESK_OWN: Record<string, AssetBuild> = {};
for (const [path, mod] of Object.entries(DESK_MODS)) {
  const id = path.replace('../clubdesk/assets/', '').replace(/\.ts$/, '');
  if (typeof mod.build === 'function') DESK_OWN[id] = mod.build;
}

export const REUSED: Record<string, AssetBuild> = {
  ...(DESK_REUSED as unknown as Record<string, AssetBuild>),
  ...DESK_OWN,
  'ball-hopper': ballHopper as unknown as AssetBuild,
  player: ((ctx) => people.player(ctx, { racketIsPaddle: true })) as typeof people.player as unknown as AssetBuild,
  coach: ((ctx) => people.coach(ctx, { racketIsPaddle: true })) as typeof people.coach as unknown as AssetBuild,
  director: people.director as unknown as AssetBuild,
  kid: people.kid as unknown as AssetBuild,
  'people-sheet': peopleSheet as unknown as AssetBuild,
};
