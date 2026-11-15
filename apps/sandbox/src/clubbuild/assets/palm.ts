// 棕榈树（1×1 格，3 × 3 米）：复用 clubsite/nature 的加州蒲葵（fan-palm），种在一个圆的白灰泥花坛里。
// - 蒲葵原样 8.5 米高、冠宽 4.7 米：按包围盒缩到冠不出占地（离树干 ≤ 1.65 米，≈ 0.6 倍 → 5 米上下），变体 = 蒲葵的三种（高矮、歪向）。
// - 花坛（画的）：⌀ 1.7、高 0.42 的圆白灰泥矮墙（朝镜头的半圈落暗档，是一条干净的暗带）+ 陶砖压顶的亮唇 +
//   碎花岗岩的土面（granite，和步道一家）+ 一两块小红石（复用 rocks，缩小）。
// 本地原点 = 占地中心（= 树干落地点），+z 朝镜头。
import * as THREE from 'three';
import { build as fanPalm } from '../../clubsite/nature/fan-palm';
import { build as rocks } from '../../clubsite/nature/rocks';
import { topGeo, wallGeo } from '../../clubsite/render/geo';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { Bucket, circle, finish, place, reuse } from './gnd-kit';

/** 花坛半径、墙高、压顶 */
const R = 0.85;
const H = 0.42;
const LIP = 0.09;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'palm';
  const own = new THREE.Group();
  root.add(own);
  const B = new Bucket();
  const out = circle(0, 0, R, 20);
  const inn = circle(0, 0, R - 0.14, 20);
  // 矮墙（白灰泥，立面不接投影：阴影毛边落在竖面上是麻点）+ 压顶（陶砖：顶面一圈亮、外沿一条唇）
  B.add('stucco', wallGeo(out, H, 0, true), {
    recv: false,
    extra: { elem: { kind: 'paint', size: [10, 5], seed: 31 } },
  });
  B.add('cap', topGeo(out, H + LIP, [inn]));
  B.add(
    'cap',
    wallGeo(
      out.map(([x, z]) => [x * 1.04, z * 1.04]),
      H + LIP,
      H,
      true,
    ),
    { recv: false },
  );
  B.add('cap', wallGeo(inn, H + LIP, H - 0.04, false), { recv: false });
  // 土面：碎花岗岩，比压顶低一点
  B.add('granite', topGeo(inn, H - 0.04), { cast: false, extra: { elem: { ...EL.granite, seed: 7 } } });
  B.build(ctx, own, 'palm:');
  finish(ctx, own);

  // 蒲葵：缩到冠不出占地
  const palm = reuse(fanPalm, ctx);
  const bb = new THREE.Box3().setFromObject(palm);
  const reach = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z);
  const s = Math.min(1, 1.65 / reach);
  place(root, palm, 0, 0, 0, s, H - 0.05);
  // 土面上一两块小红石（偏到镜头那边，挡一点树干脚）
  const rk = reuse(rocks, ctx, 2 + (ctx.variant % 2));
  const rnd = ctx.rng(`palm:rocks:${ctx.variant}`);
  place(root, rk, 0.25 + rnd() * 0.15, 0.32, rnd() * Math.PI * 2, 0.3, H - 0.06);
  return root;
}
