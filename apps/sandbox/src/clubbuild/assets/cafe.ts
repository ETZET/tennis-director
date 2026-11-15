// cafe（咖啡车）：2 × 2 格 = 6 × 6 米，门格 (1, 1) = 前排东边那格。
// 复用：clubfood 的 truck-coffee（薄荷色圆头面包车，4.4 × 2.2，原样，靠后停、服务窗朝镜头；车顶自带一只大咖啡杯 = 开罗式的图标，美术 r1 不再加牌子）、clubhouse 的 cafe-table（钴蓝釉砖小圆桌 + 两把铁椅）、
// clubfood 的 patio-umbrella（撑开的薄荷伞 v2，伞杆穿桌心）、clubhouse 的 shop-sign v2（焦糖色的咖啡立牌）、clubdesk 的 pot + clubsite 的 agave（陶罐龙舌兰）。
// 新画：车前一块陶砖小露台（tile + 会所露台砖的元素，前沿一条陶砖压边）—— 车停在沙地上，客人站在砖上点单。
// 门格那一块（东前）空着走人；桌子在西前。
import type * as THREE from 'three';
import { Group } from 'three';
import { build as pot } from '../../clubdesk/assets/pot';
import { build as umbrella } from '../../clubfood/assets/patio-umbrella';
import { build as truck } from '../../clubfood/assets/truck-coffee';
import { build as cafeTable } from '../../clubhouse/assets/cafe-table';
import { build as shopSign } from '../../clubhouse/assets/shop-sign';
import { EL } from '../../clubhouse/palette';
import { build as agave } from '../../clubsite/nature/agave';
import type { AssetCtx } from '../ctx';
import { Bins, bboxOf, bx, flat, put } from './bld-kit';

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new Group();
  root.name = 'cafe';
  const B = new Bins(ctx);

  // ── 陶砖小露台（车前 z −0.5…2.85）+ 前沿、两头一条陶砖压边 ──
  const Z0 = -0.5;
  const E = 2.85;
  B.add('tile', flat(-E, E, Z0, E, 0.012), { elem: { ...EL.terrace, seed: 31 }, edge: 0.1, convex: 0 }, '', false);
  B.add('cap', bx(2 * E, 0.08, 0.18, 0, 0, E - 0.09), { convex: 0.3 }, '', false);
  B.add('cap', bx(0.18, 0.08, E - Z0, -E + 0.09, 0, (Z0 + E) / 2), { convex: 0.3 }, '', false);
  B.add('cap', bx(0.18, 0.08, E - Z0, E - 0.09, 0, (Z0 + E) / 2), { convex: 0.3 }, '', false);
  B.build(root, 'cafe:floor');

  // ── 咖啡车：靠后停，车尾贴北沿 ──
  const t = put(ctx, root, truck, 0, 0, 0, 0, 1, 0);
  const tb = bboxOf(t);
  t.position.set(-(tb.min.x + tb.max.x) / 2 + 0.05, 0, -2.88 - tb.min.z);

  // ── 西前：小圆桌 + 撑开的薄荷伞 ──
  put(ctx, root, cafeTable, -1.55, 0.012, 1.55, 0, 1, 0);
  const u = put(ctx, root, umbrella, -1.55, 0.012, 1.55, 0, 0.82, 2);
  (u.userData.setOpen as ((k: number) => void) | undefined)?.(1);

  // ── 门格边上：咖啡立牌、陶罐龙舌兰 ──
  put(ctx, root, shopSign, 0.35, 0.012, 2.35, -0.25, 1, 2);
  put(ctx, root, pot, 2.45, 0.012, 0.0, 0, 0.9, 0);
  put(ctx, root, agave, 2.45, 0.012 + 0.85 * 0.9, 0.0, 0.6, 0.5, 1);

  return root;
}
