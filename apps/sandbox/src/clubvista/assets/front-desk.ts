// front-desk：露天前台 = clubdesk 画好的凉棚 + L 形柜台 + 后柜（只读 import，不复制），按 clubdesk/layout.ts 里的相对位置拼成一件。
// 本地原点 = 凉棚地盘中心（clubdesk 的 DESK.x、CANOPY 的 z 中点 = 世界 54.4, 5.7），+z 朝镜头。
// 柜台转角在 (+1.9, +3.7)，后柜在 (−1.6, −0.4)（clubdesk SLOTS 的 desk-counter 56.3, 9.4、back-cabinet 52.8, 5.3）。
import * as THREE from 'three';
import { build as backCabinet } from '../../clubdesk/assets/back-cabinet';
import { build as canopy } from '../../clubdesk/assets/desk-canopy';
import { build as counter } from '../../clubdesk/assets/desk-counter';
import type { AssetCtx as DeskCtx } from '../../clubdesk/ctx';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const c = ctx as unknown as DeskCtx;
  const g = new THREE.Group();
  g.name = 'front-desk';
  g.add(canopy(c));
  const k = counter(c);
  k.position.set(1.9, 0, 3.7);
  g.add(k);
  const b = backCabinet(c);
  b.position.set(-1.6, 0, -0.4);
  g.add(b);
  return g;
}
