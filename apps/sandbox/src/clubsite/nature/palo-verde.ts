// 假紫荆（palo verde）：绿树皮的短干，离地不高就分成 3～4 根胖枝，托着 5 团扁的黄绿叶团，团与团之间留空露枝。
// v1 开花：每团朝上的叶簇换成亮黄（成簇在冠顶，不撒点）。
// 材质规范 v2：冠 = 叶团（leaves，池塘树的做法：档位交界按 2.4 纹素的叶团切开，15% 的团有亮顶）；
// 枝 = 绿树皮（stones 的小块深浅 + 少量上沿亮边，不画缝）；花帽也是叶团（2.1 纹素）。颜色在这里手挑（PALETTE-SUGGEST）。
import * as THREE from 'three';
import type { BaseCtx as AssetCtx } from '../render/ctx';
import { knot, limb, mass, merge, tn, type V3 } from './palo-verde/tree';

// PALETTE-SUGGEST yellowGreen.tones（冠）：中档本色从 #8ebc48（L 170，正压在中/亮分界上）降到 #84b044（L 159）
const LEAF_TONES = tn(
  [0xcce050, 0xd8ea60, 0xbcd44c],
  [0x84b044, 0x8ebb4a, 0x74a24c],
  [0x3a7c62, 0x42866a, 0x346c66],
  [0xa8c444, 0x5e8e48, 0x28565c],
  [0xe4f27a, 0xa0c858, 0x468868],
);
// PALETTE-SUGGEST barkGreen（新条目）：假紫荆的绿树皮，比冠暗一档、偏橄榄；暗档青
const BARK_RAMP: [number, number, number] = [0xa8c45c, 0x6e9a58, 0x2e5e5e];
const BARK_TONES = tn(
  [0xa8c45c, 0xb2cc64, 0x9cba58],
  [0x6e9a58, 0x78a45c, 0x648e58],
  [0x2e5e5e, 0x366864, 0x2a5460],
  [0x90b058, 0x58805a, 0x244a58],
  [0xc4dc74, 0x86b064, 0x40766a],
);
// PALETTE-SUGGEST flowerYellow.tones：花帽（亮黄 → 橙黄 → 暗档紫红）
const BLOOM_TONES = tn(
  [0xffd23c, 0xffdc58, 0xf4c434],
  [0xe49c34, 0xeca840, 0xd89238],
  [0x8a5466, 0x945e70, 0x7e4a62],
  [0xe8b030, 0xc07c3a, 0x6a4060],
  [0xfff09a, 0xf4bc54, 0x9e6676],
);

export function build(ctx: AssetCtx): THREE.Object3D {
  const v = ctx.variant % 2;
  const rnd = ctx.rng(`palo-verde:${v}`);
  const g = new THREE.Group();
  const H = 5;
  const sway = { sway: 0.07, swayH: H };

  // 叶团：中心（x, y, z）、半径（扁）
  const masses: { c: V3; r: V3 }[] =
    v === 0
      ? [
          { c: [-1.75, 2.85, 0.4], r: [0.95, 0.55, 0.85] },
          { c: [1.75, 3.05, -0.1], r: [1.0, 0.58, 0.9] },
          { c: [0.05, 4.2, -0.4], r: [1.1, 0.6, 0.95] },
          { c: [0.55, 2.7, 1.45], r: [0.8, 0.5, 0.7] },
          { c: [-0.7, 3.5, -1.55], r: [0.85, 0.52, 0.75] },
        ]
      : [
          { c: [-1.85, 3.15, -0.1], r: [1.0, 0.58, 0.85] },
          { c: [1.55, 2.8, 0.6], r: [0.95, 0.55, 0.85] },
          { c: [-0.2, 4.2, 0.05], r: [1.1, 0.6, 0.95] },
          { c: [1.7, 3.95, -1.2], r: [0.8, 0.5, 0.7] },
          { c: [-0.65, 2.65, 1.5], r: [0.75, 0.48, 0.65] },
        ];
  // 冠宽对齐规格（5.5 米）
  for (const m of masses) m.c[0] *= 0.9;

  // —— 枝干 ——
  const split: V3 = v === 0 ? [0.12, 0.95, 0.05] : [-0.1, 0.85, 0.1];
  const bark: THREE.BufferGeometry[] = [];
  bark.push(limb([0, 0, 0], split, 0.26, 0.22, 7));
  bark.push(knot(split, 0.23));
  // 根部两个小脚
  bark.push(limb([0, 0.05, 0], [-0.45, 0.0, 0.2], 0.16, 0.12, 5));
  bark.push(limb([0, 0.05, 0], [0.4, 0.0, -0.15], 0.15, 0.12, 5));
  // 主枝：到每团底下；第三团（冠顶）从另一根枝的中段分出去，像真的分叉
  const elbow: V3[] = [];
  for (let i = 0; i < masses.length; i++) {
    const m = masses[i];
    const end: V3 = [m.c[0] * 0.8, m.c[1] - m.r[1] * 0.45, m.c[2] * 0.8];
    if (i === 2 || i === 4) {
      // 从前一根枝的肘部分出
      const from = elbow[i === 2 ? 0 : 1];
      bark.push(limb(from, end, 0.17, 0.15, 6));
      continue;
    }
    const mid: V3 = [
      split[0] + (end[0] - split[0]) * 0.5 + (rnd() - 0.5) * 0.3,
      split[1] + (end[1] - split[1]) * 0.42,
      split[2] + (end[2] - split[2]) * 0.5 + (rnd() - 0.5) * 0.3,
    ];
    elbow.push(mid);
    bark.push(limb(split, mid, 0.22, 0.19, 6));
    bark.push(knot(mid, 0.19));
    bark.push(limb(mid, end, 0.19, 0.16, 6));
  }
  const barkMat = ctx.mat('yellowGreen', {
    ...sway,
    ramp: BARK_RAMP,
    noise: 0,
    bands: [-0.55, 0.6],
    lightUp: 0.3,
    edge: 0.3,
    convex: 0.1,
    noShadowReceive: true,
    // 树皮：屏幕上 5×3 纹素的小块深浅（不画缝，枝只有 4～6 纹素粗），三成的块上沿亮一纹素
    elem: { kind: 'stones', size: [5, 3], seam: 0, hi: 0.3, seed: 4 },
    tones: BARK_TONES,
  });
  g.add(new THREE.Mesh(merge(bark), barkMat));

  // —— 叶团 ——
  const leaves: THREE.BufferGeometry[] = [];
  const bloom: THREE.BufferGeometry[] = [];
  for (const m of masses) {
    const { geo, tops } = mass(rnd, { c: m.c, r: m.r, clumps: 6, clumpR: 0.55, minY: -0.4 });
    leaves.push(...geo);
    if (v === 1) {
      // 花：冠顶 3～4 个扁的小帽子（≥ 4 纹素），压在朝上的叶簇上，成簇
      let n = 0;
      for (const t of tops) {
        if (t.up < 0.2 || n >= 4) continue;
        t.g.computeBoundingSphere();
        const c = t.g.boundingSphere!.center;
        const cap = mass(rnd, {
          c: [c.x, c.y + 0.22, c.z + 0.05],
          r: [0.36, 0.2, 0.32],
          clumps: 2,
          clumpR: 0.22,
          minY: 0,
          core: false,
          detail: 0,
        });
        bloom.push(...cap.geo);
        n++;
      }
    }
  }
  const leafMat = ctx.mat('yellowGreen', {
    ...sway,
    noise: 0.36,
    edge: 0.25,
    bands: [0.02, 0.5],
    elem: { kind: 'leaves', size: [2.4, 2.4], hi: 0.15 },
    tones: LEAF_TONES,
    // 团内少换色（全换 = 满冠碎点），纹理主要在档位交界
    toneW: [0.22, 0.2],
  });
  g.add(new THREE.Mesh(merge(leaves), leafMat));
  if (bloom.length) {
    const fl = ctx.mat('flowerYellow', {
      ...sway,
      lightUp: 0.6,
      noise: 0.15,
      bands: [-0.6, 0.25],
      edge: 0.25,
      noShadowReceive: true,
      elem: { kind: 'leaves', size: [2.1, 2.1], hi: 0.15, seed: 2 },
      tones: BLOOM_TONES,
    });
    g.add(new THREE.Mesh(merge(bloom), fl));
  }
  ctx.mats.prepare(g);
  return g;
}
