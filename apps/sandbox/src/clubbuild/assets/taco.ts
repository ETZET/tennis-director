// taco（塔可餐车）：2 × 3 格 = 6 × 9 米，门格 (1, 2) = 最前排东边那格。
// 复用：clubfood 的 truck-taco（日落橙方头高厢车，5.8 × 2.4，原样，靠后停、服务窗朝镜头）、picnic-table ×2（A 字野餐桌）、
// patio-umbrella v1（芥末黄，撑开，伞杆穿后一张桌子的桌心）、festoon ×3（串灯）、
// clubsite 的 barrel-cactus。
// 新画：车前一块红砂碎石的院子（yardGranite，同 clubfood 院子的铺地）+ 一圈木边条（timber）；院子前面两根挂串灯的木杆（timber，柱脚陶砖墩）。
// 串灯：车顶两个前角各拉一条到对角的木杆（院子上空一个 X）+ 两杆之间一条，夜里亮（userData.night，daylight 管）。
// 门格那一块（东前）空着走人；两张桌子在西边一列。
import * as THREE from 'three';
import { build as festoon } from '../../clubfood/assets/festoon';
import { build as umbrella } from '../../clubfood/assets/patio-umbrella';
import { build as picnic } from '../../clubfood/assets/picnic-table';
import { build as truck } from '../../clubfood/assets/truck-taco';
import { build as cactus } from '../../clubsite/nature/barrel-cactus';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { Bins, bboxOf, bx, FACE, flat, put } from './bld-kit';

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'taco';
  const B = new Bins(ctx);

  // ── 餐车：靠后停，车尾贴北沿 ──
  const t = put(ctx, root, truck, 0, 0, 0, 0, 1, 0);
  const tb = bboxOf(t);
  t.position.set(-(tb.min.x + tb.max.x) / 2, 0, -4.45 - tb.min.z);
  const front = t.position.z + 1.2; // 车身前沿（车厢深 ±1.2）
  const roofY = 3.2;

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
    B.add('timber', bx(0.2, PY, 0.2, x, 0, z), { lightUp: 0.4, convex: 0.4 }, 'post');
    B.add('timber', bx(0.34, 0.08, 0.34, x, PY, z), { lightUp: 0.4, convex: 0.4 }, 'post');
    B.add('cap', bx(0.36, 0.22, 0.36, x, 0, z), { ...FACE, convex: 0.4 }, 'foot', false);
  }
  B.build(root, 'taco:yard');

  // ── 两张野餐桌（西边一列），后一张撑芥末黄的伞 ──
  put(ctx, root, picnic, -1.35, 0.012, 0.35, 0, 1, 0);
  const u = put(ctx, root, umbrella, -1.35, 0.012, 0.35, 0, 0.95, 1);
  (u.userData.setOpen as ((k: number) => void) | undefined)?.(1);
  put(ctx, root, picnic, -1.35, 0.012, 2.75, 0, 1, 0);

  // ── 串灯：车顶两个前角 → 对角的木杆（院子上空一个 X）+ 两杆之间 ──
  const ends: [THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(-2.6, roofY, front), new THREE.Vector3(posts[1][0], PY, posts[1][1])],
    [new THREE.Vector3(posts[0][0], PY, posts[0][1]), new THREE.Vector3(posts[1][0], PY, posts[1][1])],
    [new THREE.Vector3(posts[0][0], PY, posts[0][1]), new THREE.Vector3(2.6, roofY - 0.4, front)],
  ];
  const lits: ((k: number) => void)[] = [];
  ends.forEach(([a, b], i) => {
    const f = put(ctx, root, festoon, a.x, a.y, a.z, 0, 1, i);
    (f.userData.setEnds as (a: THREE.Vector3, b: THREE.Vector3) => void)(a, b);
    lits.push(f.userData.setLit as (k: number) => void);
  });
  const setLit = (k: number) => {
    for (const l of lits) l(k);
  };
  root.userData.setLit = setLit;
  // 夜里亮（clubsite/daylight 找 userData.night）：灯光圈落在院子中间
  const mid = new THREE.Vector3(0, 0, 2);
  root.userData.night = {
    setOn: (on: boolean) => setLit(on ? 1 : 0),
    pool: (): [number, number, number, number] => {
      const p = root.localToWorld(mid.clone());
      return [p.x, p.z, 4, 3];
    },
  };

  // ── 院子东北角一棵桶仙人掌 ──
  put(ctx, root, cactus, 2.3, 0.012, Z0 + 0.6, 0.3, 0.7, 1);

  return root;
}
