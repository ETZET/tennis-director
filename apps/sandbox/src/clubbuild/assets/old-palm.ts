// old-palm（老棕榈，地形，1 × 1 格 = 3 × 3 米）：开局就长在地上的一棵老加州蒲葵 —— 比种的棕榈（palm，5 米、花坛里）高一大截，
// 树干粗、冠下挂一圈枯叶裙（开罗距离下"老树"的记号），树脚一圈没修过的枯草、两块石头、一片踩实的土。
// 冠是 flora-kit 的放射叶（9 片、垂得更厉害），伸出去 ≤ 1.7 米（不出占地）。带 shade 标签：挨着的球场成"场边树荫"。
// 本地原点 = 占地中心 = 树脚，+z 朝镜头。
import * as THREE from 'three';
import { build as rocks } from '../../clubsite/nature/rocks';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { palmTree } from './flora-kit';
import { Bucket, circle, finish, place, reuse } from './gnd-kit';

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'old-palm';
  const v = ((ctx.variant % 3) + 3) % 3;
  const rnd = ctx.rng(`old-palm:${v}`);

  // 树脚：一片踩实的土（不规则圆）+ 枯草团
  const own = new THREE.Group();
  root.add(own);
  const B = new Bucket();
  const dirt = circle(0, 0.1, 1.35, 14).map(([x, z], i): [number, number] => {
    const k = 0.85 + ((i * 37) % 11) / 40;
    return [x * k, z * k];
  });
  B.add(
    'sandPatch',
    new THREE.ShapeGeometry(new THREE.Shape(dirt.map(([x, z]) => new THREE.Vector2(x, -z))))
      .rotateX(-Math.PI / 2)
      .translate(0, 0.015, 0),
    {
      cast: false,
      extra: { elem: { ...EL.sand, seed: 33, pebbles: 0.12 }, edge: 0.05, convex: 0 },
    },
  );
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rnd() * 0.8;
    const r = 0.9 + rnd() * 0.3;
    const s = 0.24 + rnd() * 0.08;
    const g = new THREE.IcosahedronGeometry(s, 1)
      .scale(1.3, 0.75, 1)
      .translate(Math.cos(a) * r, s * 0.3, Math.sin(a) * r);
    B.add('dryGrass', g, {
      cast: false,
      extra: {
        lightUp: 0.3,
        bands: [0, 0.55],
        noise: 0.35,
        edge: 0.4,
        convex: 0.1,
        noShadowReceive: true,
        sphereNormals: [Math.cos(a) * r, 0, Math.sin(a) * r],
      },
      tag: `tuft${i}`,
    });
  }
  B.build(ctx, own, 'old-palm:');
  finish(ctx, own);

  // 老蒲葵：9 米、粗干、枯叶裙、9 片垂得厉害的叶
  const lean: [number, number][] = [
    [0.15, 0.08],
    [-0.15, 0.05],
    [0.05, -0.15],
  ];
  const palm = palmTree(ctx, {
    h: [8.6, 9.2, 8.0][v],
    reach: 1.6,
    n: 9,
    droop: 1.7,
    width: 0.62,
    lean: lean[v],
    skirt: true,
    nuts: false,
    r0: 0.34,
    seed: 'old',
  });
  root.add(palm);
  // 脚边一块石头
  const rk = reuse(rocks, ctx, 1 + (v % 2));
  place(root, rk, 0.75, 0.55, rnd() * Math.PI * 2, 0.45, 0);
  rk.traverse((c) => {
    c.castShadow = false;
  });
  return root;
}
