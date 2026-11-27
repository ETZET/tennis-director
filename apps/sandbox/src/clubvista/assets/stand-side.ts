// 东 / 西两边的看台（顺着边线）：3 级、33 米长，场景里转 ±90°（人朝场地）。yaw 0 下立面侧对镜头，看到的是踏面：
// 一条条竖着的座椅带 + 人头，两条走道把它切成三段。第一级前面一道 1 米的广告板矮墙（侧对镜头，只露顶上的压顶）。
// 本地原点 = 看台前沿正中的地面，人朝 +z。v0 / v1 只换观众的坐法。userData.setFill(0..1)。
import type { AssetCtx } from '../ctx';
import { buildStand } from './stands/kit';

export function build(ctx: AssetCtx) {
  return buildStand(ctx, {
    name: 'stand-side',
    L: 33,
    n: 3,
    aisles: [-8.2, 8.2],
    wall: 1,
    awning: 1,
    dense: true,
    fill0: 0.28,
    seed: `side${ctx.variant}`,
  });
}
