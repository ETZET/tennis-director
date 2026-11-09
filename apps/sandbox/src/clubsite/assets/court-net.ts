// court-net：整洁的俱乐部网球网（clubclay #2；会员场、青训场和以后的网球场共用）。
// 网柱 1.07、中间 0.914、柱心距 12.8（双打边线外 0.914）。网沿本地 z（南北走），原点 = 网正中的地面。
// yaw 0 下网面侧对镜头：屏幕上 = 2 纹素的白网带顶面 + 网身往东露出的一纹素暗靛 + 中心带（白线中段变宽的一小截）
//   + 两根 3 纹素的绿漆网柱（柱帽宽一纹素、亮一行）+ 往西南落的投影。不画网格；网面朝镜头时（转了 yaw 的场景）
//   网身每 4 纹素一条稍亮的竖线暗示网眼。南柱朝镜头那面有一个小绞盘。
// userData：同 pickle-net（setTension / tension / setCrank / crankGrip）；网球网松起来幅度小一半。
// 画廊：?asset=court-net，`&tension=0` 看松的样子。
import type * as THREE from 'three';
import type { NetCtx } from './nets/kit';
import { buildNet } from './nets/net';

export function build(ctx: NetCtx): THREE.Object3D {
  const t = Number(ctx.params?.get('tension') ?? 1);
  return buildNet(
    ctx,
    {
      span: 12.8,
      postW: 0.27,
      postH: 1.07,
      midH: 0.914,
      tapeW: 0.18,
      tapeH: 0.12,
      bottom: 0.04,
      lean: 0.14,
      slack: { sag: 0.35, bulge: 0.3, slide: 0, drop: 0.02 },
      strapW: 0.09,
      winch: { y: 0.62, w: 0.22 },
      cap: 0.09,
      meshHint: true,
      segs: 20,
    },
    Number.isFinite(t) ? t : 1,
  );
}
