// pickle-net：匹克球网（clubpickle #1）。网柱 0.914（36 英寸）、中间 0.86（34 英寸）、柱在边线外 0.3（柱心距 6.7）。
// 网沿本地 z（南北走），原点 = 网正中的地面；南柱朝镜头那面有绞盘（总监摇的就是它）。
// 变体：v0 绷紧（2 号场），v1 松（1 号场停用：网身往东鼓、网带垂、北头从柱顶滑下来、中心带脱扣拖在地上）。
// userData（stage 3）：
//   setTension(0..1)  0 = 松，1 = 绷紧（总监摇绞盘时从 v1 插到 v0；只改顶点，可每帧调）
//   tension           现在的值
//   setCrank(rad)     摇把转角（绕 z，0 = 朝东）；crankGrip(out?) → 握点的世界坐标（人物的手贴这里）
// 画廊：?asset=pickle-net&v=1，`&tension=0.5` 看中间态。
import type * as THREE from 'three';
import type { NetCtx } from './nets/kit';
import { buildNet } from './nets/net';

export function build(ctx: NetCtx): THREE.Object3D {
  const slack = ctx.variant === 1;
  const t = Number(ctx.params?.get('tension') ?? (slack ? 0 : 1));
  return buildNet(
    ctx,
    {
      span: 6.1 + 0.3 * 2,
      postW: 0.27,
      postH: 0.914,
      midH: 0.86,
      tapeW: 0.18,
      tapeH: 0.1,
      bottom: 0.1,
      lean: 0.14,
      slack: { sag: 0.3, bulge: 0.34, slide: 0.36, drop: 0.12 },
      strapW: 0.09,
      winch: { y: 0.5, w: 0.27 },
      cap: 0,
      meshHint: false,
      segs: 14,
    },
    Number.isFinite(t) ? t : 1,
  );
}
