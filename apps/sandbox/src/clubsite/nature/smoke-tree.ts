// 烟树（smoke tree）：银蓝灰的一团"烟"——5 团圆的叶团挤成一朵云，几乎看不出叶子；底下露一点浅灰的枝。
// 剪影比假紫荆圆、比蒲葵矮。
// 材质规范 v2：冠 = 叶团（leaves，格子 2.8 纹素更蓬，亮顶只给 10% 的团）；枝 = 浅灰树皮（stones 小块深浅）。颜色在这里手挑。
import * as THREE from 'three';
import type { BaseCtx as AssetCtx } from '../render/ctx';
import { knot, limb, mass, merge, tn, type V3 } from './palo-verde/tree';

// PALETTE-REQUEST branchPale：烟树的浅灰枝（palette 的 branch 是深棕紫，太重）
const BRANCH_PALE: [number, number, number] = [0xd4ccd4, 0xa49cb4, 0x55507e];
// PALETTE-SUGGEST branchPale.tones
const BRANCH_TONES = tn(
  [0xd4ccd4, 0xdcd6dc, 0xc8c0cc],
  [0xa49cb4, 0xaea6bc, 0x9890ac],
  [0x55507e, 0x5e5a88, 0x4c4876],
  [0xbcb2c4, 0x8a82a0, 0x433e6c],
  [0xe8e2e8, 0xbeb6cc, 0x6c6898],
);
// PALETTE-SUGGEST silverBlue.tones（烟树冠）：亮档银灰青、中档灰蓝、暗档靛（冷）；高/低一级 ±9～13，亮边 +22～25
const SMOKE_TONES = tn(
  [0xb2ccd2, 0xc0d8dc, 0xa4c0cc],
  [0x7c9ec0, 0x88a8c8, 0x7290b6],
  [0x4c5a92, 0x56649a, 0x46508a],
  [0x94b0c4, 0x6886ac, 0x3c4880],
  [0xcce2e6, 0x98b8d0, 0x62729e],
);

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 3;
  const rnd = ctx.rng(`smoke-tree:${v}`);
  const g = new THREE.Group();
  const H = 3.6;
  const sway = { sway: 0.05, swayH: H };

  // 叶团：一朵云（中间高、两边低，前面一团压低一点）
  const flip = v === 1 ? -1 : 1;
  const masses: { c: V3; r: V3 }[] = [
    { c: [0.0, 2.75, -0.15], r: [0.95, 0.8, 0.9] },
    { c: [-0.9 * flip, 2.2, 0.15], r: [0.75, 0.65, 0.72] },
    { c: [0.95 * flip, 2.3, -0.1], r: [0.72, 0.65, 0.72] },
    { c: [0.3 * flip, 2.1, 0.8], r: [0.65, 0.55, 0.6] },
    { c: [-0.3 * flip, 2.45, -0.9], r: [0.72, 0.6, 0.68] },
  ];
  for (const m of masses) m.c[0] *= 0.88;
  if (v === 2) {
    // 第三个变体：更矮更宽
    for (const m of masses) {
      m.c[0] *= 1.12;
      m.c[1] -= 0.25;
    }
  }

  // —— 枝：短干，0.5 米就分成三四根，伸到各团的下面 ——
  const split: V3 = [0.05 * flip, 0.7, 0.05];
  const bark: THREE.BufferGeometry[] = [];
  bark.push(limb([0, 0, 0], split, 0.2, 0.17, 6));
  bark.push(knot(split, 0.18));
  bark.push(limb([0, 0.04, 0], [0.35, 0.0, 0.18], 0.13, 0.1, 5));
  for (let i = 0; i < 4; i++) {
    const m = masses[i === 0 ? 0 : i];
    const end: V3 = [m.c[0] * 0.7, m.c[1] - m.r[1] * 0.55, m.c[2] * 0.7];
    bark.push(limb(split, end, 0.16, 0.13, 6));
  }
  const barkMat = ctx.mats.toon(0xffffff, {
    ramp: BRANCH_PALE,
    ...sway,
    edge: 0.3,
    convex: 0.1,
    bands: [-0.5, 0.6],
    lightUp: 0.3,
    noShadowReceive: true,
    elem: { kind: 'stones', size: [5, 3], seam: 0, hi: 0.3, seed: 5 },
    tones: BRANCH_TONES,
  });
  g.add(new THREE.Mesh(merge(bark), barkMat));

  // —— 叶团：小而多的簇 → 云一样的鼓包边 ——
  const leaves: THREE.BufferGeometry[] = [];
  for (const m of masses)
    leaves.push(...mass(rnd, { c: m.c, r: m.r, clumps: 6, clumpR: 0.45, minY: -0.5, wSub: 0.32 }).geo);
  g.add(
    new THREE.Mesh(
      merge(leaves),
      ctx.mat('silverBlue', {
        ...sway,
        noise: 0.4,
        edge: 0.25,
        bands: [-0.08, 0.48],
        elem: { kind: 'leaves', size: [2.8, 2.8], hi: 0.1, seed: 3 },
        tones: SMOKE_TONES,
        toneW: [0.3, 0.3],
      }),
    ),
  );
  ctx.mats.prepare(g);
  return g;
}
