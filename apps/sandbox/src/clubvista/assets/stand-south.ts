// 南看台（近处，背对镜头）：2 级、7.4 米长；场景里转 180°（人朝北看场）。镜头看到的是踏面、观众的后脑勺和一道白灰泥后墙
// （朝镜头的暗带，画面下沿的框）。南边正中两段之间留进场口。本地原点 = 看台前沿正中的地面，人朝 +z。
import type { AssetCtx } from '../ctx';
import { buildStand } from './stands/kit';

export function build(ctx: AssetCtx) {
  return buildStand(ctx, {
    name: 'stand-south',
    L: 7.4,
    n: 2,
    backFacing: true,
    seed: `south${ctx.variant}`,
  });
}
