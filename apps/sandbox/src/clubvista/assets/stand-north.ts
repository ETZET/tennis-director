// 北看台的一半（中间是球员通道 tunnel）：立面朝镜头 —— 竖屏上沿一道一道的暗带 + 一排排人头，这张图的招牌轮廓。
// 9.4 米长、6 级（每级 0.9 深、0.45 高，顶 2.7），第一级前面一道 1 米的广告板矮墙。做法和观众见 stands/kit.ts。
// 本地原点 = 看台前沿正中的地面，人朝 +z。userData.setFill(0..1) 空场 / 坐满。v0 西半（走道偏东）/ v1 东半。
import type { AssetCtx } from '../ctx';
import { buildStand } from './stands/kit';

export function build(ctx: AssetCtx) {
  return buildStand(ctx, {
    name: 'stand-north',
    L: 9.4,
    n: 6,
    facing: true,
    aisles: [ctx.variant % 2 ? -1.6 : 1.6],
    wall: 1,
    seed: `north${ctx.variant}`,
  });
}
