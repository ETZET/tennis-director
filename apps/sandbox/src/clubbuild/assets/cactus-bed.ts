// 仙人掌花坛（2×1 格，6 × 3 米）：抬高的土坯花坛 + 复用的沙漠植物。
// - 花坛（画的，照 clubpark/terrain.ts 的花坛做法）：5.6 × 2.6 米、0.5 米高的土坯矮墙（adobe 岩层元素；朝镜头的南墙是暗带，
//   矮墙 < 9 行 = 实心一条）+ 陶砖压顶的亮唇（cap）+ 碎花岗岩的土面（granite，和地块的沙分开），四角圆一点。
// - 植物（复用 clubsite/nature）：一棵墨西哥刺木（ocotillo，竖的剪影，放在后排偏一边）、一两丛龙舌兰（agave）、
//   两三个桶仙人掌（barrel-cactus，大小不一成组）、一块红石（rocks）、可能一丛脆灌木（brittlebush）。
//   高的放后排（北），矮的放前排（南）：从镜头看不挡。变体（ctx.variant）换左右、换组合。
// 本地原点 = 占地中心，+z 朝镜头。
import * as THREE from 'three';
import { build as agave } from '../../clubsite/nature/agave';
import { build as barrel } from '../../clubsite/nature/barrel-cactus';
import { build as brittlebush } from '../../clubsite/nature/brittlebush';
import { build as ocotillo } from '../../clubsite/nature/ocotillo';
import { build as rocks } from '../../clubsite/nature/rocks';
import { topGeo, wallGeo } from '../../clubsite/render/geo';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { Bucket, finish, place, reuse, roundRect } from './gnd-kit';

const HX = 2.8;
const HZ = 1.3;
const H = 0.5;
const LIP = 0.1;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'cactus-bed';
  const own = new THREE.Group();
  root.add(own);
  const B = new Bucket();
  const out = roundRect(-HX, -HZ, HX, HZ, 0.35, 3);
  const lipOut = roundRect(-HX - 0.04, -HZ - 0.04, HX + 0.04, HZ + 0.04, 0.39, 3);
  const inn = roundRect(-HX + 0.18, -HZ + 0.18, HX - 0.18, HZ - 0.18, 0.2, 3);
  // 土坯墙：露出高度写进 aElem（矮墙规则：实心一条 + 亮唇）
  B.add(
    'adobe',
    wallGeo(out, H, 0, true, 0, () => H),
    {
      recv: false,
      keep: ['uv', 'aElem'],
      extra: { elem: { ...EL.adobe, seed: 5 } },
    },
  );
  B.add('cap', topGeo(lipOut, H + LIP, [inn]));
  B.add('cap', wallGeo(lipOut, H + LIP, H, true), { recv: false });
  B.add('granite', topGeo(inn, H + 0.04), { cast: false, extra: { elem: { ...EL.granite, seed: 13 } } });
  B.build(ctx, own, 'cactus-bed:');
  finish(ctx, own);

  // ── 植物：后排高、前排矮；flip 换左右 ──
  const v = ctx.variant;
  const flip = v % 2 === 1 ? -1 : 1;
  const rnd = ctx.rng(`cactus-bed:${v}`);
  const y = H + 0.04;
  const put = (b: unknown, vv: number, x: number, z: number, s: number) =>
    place(root, reuse(b, ctx, vv), x * flip, z, rnd() * Math.PI * 2, s, y);
  // 后排：墨西哥刺木（偏一边）+ 另一头一丛龙舌兰
  put(ocotillo, v, -1.55, -0.45, 0.65);
  put(agave, v, 1.45, -0.3, 0.8);
  // 中间：一块红石 + 桶仙人掌一组（一大两小）
  put(rocks, v + 1, -0.25, -0.35, 0.42);
  put(barrel, v, 0.15, 0.25, 0.95);
  put(barrel, v + 1, 0.62, 0.45, 0.7);
  if (v % 3 !== 2) put(barrel, v + 2, -0.2, 0.62, 0.55);
  // 前排：一丛小龙舌兰或者脆灌木（变体换）
  if (v % 3 === 1) put(brittlebush, v, -1.15, 0.55, 0.75);
  else put(agave, v + 1, -1.2, 0.5, 0.55);
  put(barrel, v + 3, 2.05, 0.5, 0.6);
  return root;
}
