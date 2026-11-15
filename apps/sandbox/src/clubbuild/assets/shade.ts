// 遮阳休息区（2×2 格，6 × 6 米）：一块石板小场 + 复用的遮阳帆、长椅、自助水站。
// - 场面（画的）：5.6 × 5.6 米的石板（flagstone，石板元素），四边一圈 2 纹素的浅水泥路缘（concrete，比石板高一点 → 一条亮边）。
// - 遮阳帆：clubcourts 的 court-sail（俱乐部新装的、绷紧的那块：四根绿漆钢杆、奶白底蓝宽条、往南斜），4.2 × 2.4 米，正好罩住长椅。
//   变体：v 偶数条纹竖、奇数横（court-sail 自己的两种）。
// - 帆下：clubsite 的长椅（面朝镜头）；东边一台 clubdesk 的自助水站（木柜 + 大水桶，龙头朝镜头）。
// 本地原点 = 占地中心，+z 朝镜头。
import * as THREE from 'three';
import { build as courtSail } from '../../clubcourts/assets/court-sail';
import { build as waterStation } from '../../clubdesk/assets/water-station';
import { build as bench } from '../../clubsite/assets/bench';
import { box, quad } from '../../clubsite/render/geo';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { Bucket, finish, place, reuse } from './gnd-kit';

const HS = 2.8;
const PAD = 0.06;
const KERB = 0.18;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'shade';
  const own = new THREE.Group();
  root.add(own);
  const B = new Bucket();
  // 石板场面 + 四边路缘
  B.add('flagstone', quad({ x0: -HS + KERB, x1: HS - KERB, z0: -HS + KERB, z1: HS - KERB }, PAD), {
    cast: false,
    extra: { elem: { ...EL.flagstone, seed: 17 } },
  });
  const k = (w: number, d: number, x: number, z: number) => B.add('concrete', box(w, PAD + 0.04, d, x, 0, z));
  k(HS * 2, KERB, 0, -HS + KERB / 2);
  k(HS * 2, KERB, 0, HS - KERB / 2);
  k(KERB, HS * 2 - 2 * KERB, -HS + KERB / 2, 0);
  k(KERB, HS * 2 - 2 * KERB, HS - KERB / 2, 0);
  B.build(ctx, own, 'shade:');
  finish(ctx, own);

  // 遮阳帆（杆在 x ±2.05、z ±1.2）
  place(root, reuse(courtSail, ctx, ctx.variant % 2), 0, -0.2, 0, 1, PAD);
  // 帆下的长椅（面朝镜头），东边的水站
  place(root, reuse(bench, ctx, ctx.variant), -0.55, -0.55, 0, 1, PAD);
  place(root, reuse(waterStation, ctx, 0), 1.35, -0.45, 0, 1, PAD);
  return root;
}
