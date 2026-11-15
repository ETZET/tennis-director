// 棕榈树（1×1 格，3 × 3 米）：开罗式椰子树（flora-kit 的 palmTree：7 片放射的羽叶 + 椰子），种在一个圆的白灰泥花坛里。
// - 美术 r1：原来复用的加州蒲葵缩到 0.6 倍，俯视是一团圆冠、像阔叶树；换成叶片放射的棕榈（冠宽 ≈ 3.2 米），一眼是棕榈。
//   变体 = 高矮、往哪边弯、叶片多少。
// - 花坛（画的）：⌀ 1.7、高 0.42 的圆白灰泥矮墙（朝镜头的半圈落暗档，是一条干净的暗带）+ 陶砖压顶的亮唇 +
//   碎花岗岩的土面（granite，和步道一家）+ 一两块小红石（复用 rocks，缩小）。
// 本地原点 = 占地中心（= 树干落地点），+z 朝镜头。
import * as THREE from 'three';
import { build as rocks } from '../../clubsite/nature/rocks';
import { topGeo, wallGeo } from '../../clubsite/render/geo';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { palmTree } from './flora-kit';
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
  B.add('granite', topGeo(inn, H - 0.04), { cast: false, extra: { elem: { ...EL.granite, seed: 7, size: [4.5, 3] } } }); // 美术 r2：碎石 × 0.6
  B.build(ctx, own, 'palm:');
  finish(ctx, own);

  // 椰子树：冠伸出去 ≤ 1.6 米（不出占地），变体换高矮和弯向
  const v = ((ctx.variant % 3) + 3) % 3;
  const lean: [number, number][] = [
    [0.35, 0.15],
    [-0.4, 0.1],
    [0.1, -0.35],
  ];
  const palm = palmTree(ctx, { h: [4.6, 5.2, 4.2][v], reach: 1.5, n: [7, 8, 7][v], lean: lean[v], seed: 'palm' });
  place(root, palm, 0, 0, 0, 1, H - 0.05);
  // 土面上一两块小红石（偏到镜头那边，挡一点树干脚）
  const rk = reuse(rocks, ctx, 2 + (ctx.variant % 2));
  const rnd = ctx.rng(`palm:rocks:${ctx.variant}`);
  place(root, rk, 0.25 + rnd() * 0.15, 0.32, rnd() * Math.PI * 2, 0.3, H - 0.06);
  return root;
}
