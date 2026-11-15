// taco（塔可餐车）：2 × 3 格 = 6 × 9 米，门格 (1, 2) = 最前排东边那格。
// 复用：clubfood 的 truck-taco（日落橙方头高厢车，5.8 × 2.4，原样，靠后停、服务窗朝镜头）、picnic-table ×2（A 字野餐桌）、
// patio-umbrella v1（芥末黄，撑开，伞杆穿后一张桌子的桌心）、clubsite 的 barrel-cactus。
// 新画：车前一块红砂碎石的院子（yardGranite，同 clubfood 院子的铺地）+ 一圈木边条（timber）；院子前面两根木杆（timber，柱脚陶砖墩）；
// 车顶一块图标招牌（红底黄塔可，bld-kit 的 iconSign）。
// 美术 r1：串灯去掉（1 纹素的线在 0.149 米/纹素下是院子上空一个噪点 X），只留木杆 + 夜里院子中间的光圈（userData.night）。
// 门格那一块（东前）空着走人；两张桌子在西边一列。
import * as THREE from 'three';
import { build as umbrella } from '../../clubfood/assets/patio-umbrella';
import { build as picnic } from '../../clubfood/assets/picnic-table';
import { build as truck } from '../../clubfood/assets/truck-taco';
import { build as cactus } from '../../clubsite/nature/barrel-cactus';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { Bins, bboxOf, bx, FACE, flat, iconSign, put } from './bld-kit';

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'taco';
  const B = new Bins(ctx);

  // ── 餐车：靠后停，车尾贴北沿 ──
  const t = put(ctx, root, truck, 0, 0, 0, 0, 1, 0);
  const tb = bboxOf(t);
  t.position.set(-(tb.min.x + tb.max.x) / 2, 0, -4.45 - tb.min.z);
  const front = t.position.z + 1.2; // 车身前沿（车厢深 ±1.2）
  const tb2 = bboxOf(t);
  const sign = iconSign(ctx, 'taco');
  sign.position.set(0.4, tb2.max.y - 0.05, (tb2.min.z + tb2.max.z) / 2 + 0.3);
  root.add(sign);

  // ── 车前的碎石院子 + 木边条 ──
  const X = 2.85;
  const Z0 = front - 0.3;
  const Z1 = 4.35;
  B.add(
    'yardGranite',
    flat(-X, X, Z0, Z1, 0.012),
    { elem: { ...EL.granite, seed: 3 }, edge: 0.1, convex: 0 },
    '',
    false,
  );
  const rim = { ...FACE, convex: 0.3 };
  B.add('timber', bx(2 * X + 0.16, 0.1, 0.16, 0, 0, Z1 + 0.08), rim, 'rim', false);
  B.add('timber', bx(0.16, 0.1, Z1 - Z0, -X - 0.08, 0, (Z0 + Z1) / 2), rim, 'rim', false);
  B.add('timber', bx(0.16, 0.1, Z1 - Z0, X + 0.08, 0, (Z0 + Z1) / 2), rim, 'rim', false);

  // ── 两根挂串灯的木杆（前沿两角）+ 陶砖墩 ──
  const PY = 2.85;
  const posts: [number, number][] = [
    [-2.62, 4.1],
    [2.62, 4.1],
  ];
  for (const [x, z] of posts) {
    B.add('timber', bx(0.3, PY, 0.3, x, 0, z), { lightUp: 0.4, convex: 0.4 }, 'post');
    B.add('timber', bx(0.34, 0.08, 0.34, x, PY, z), { lightUp: 0.4, convex: 0.4 }, 'post');
    B.add('cap', bx(0.36, 0.22, 0.36, x, 0, z), { ...FACE, convex: 0.4 }, 'foot', false);
  }
  B.build(root, 'taco:yard');

  // ── 两张野餐桌（西边一列），后一张撑芥末黄的伞 ──
  put(ctx, root, picnic, -1.35, 0.012, 0.35, 0, 1, 0);
  const u = put(ctx, root, umbrella, -1.35, 0.012, 0.35, 0, 0.95, 1);
  (u.userData.setOpen as ((k: number) => void) | undefined)?.(1);
  put(ctx, root, picnic, -1.35, 0.012, 2.75, 0, 1, 0);

  // 夜里院子中间一圈暖光（串灯去掉了，光圈留着）
  // 夜里亮（clubsite/daylight 找 userData.night）：灯光圈落在院子中间
  const mid = new THREE.Vector3(0, 0, 2);
  root.userData.night = {
    setOn: (_on: boolean) => {},
    pool: (): [number, number, number, number] => {
      const p = root.localToWorld(mid.clone());
      return [p.x, p.z, 4, 3];
    },
  };

  // ── 院子东北角一棵桶仙人掌 ──
  put(ctx, root, cactus, 2.3, 0.012, Z0 + 0.6, 0.3, 0.7, 1);

  return root;
}
