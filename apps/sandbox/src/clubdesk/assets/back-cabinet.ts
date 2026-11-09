// #3 back-cabinet · 凉棚下西边一排的后柜（卷毛巾的格子）。规格见 docs/lab/2026-11-07-3d-pixel/clubdesk.md「#3」。
// 本地原点 = 柜子脚印中心（世界 52.8, 5.3），0.5 × 1.5 × 4.6 米，开口朝东（朝柜台里面的总监）。
// yaw 0 下几乎全被帆布挡住：只有南头那一面（0.5 × 1.5，朝镜头 = 暗档）和顶上 0.2 米露出来，西柱还挡掉一半 →
// 只做剪影：木柜身（横板）+ 顶板 + 缩进的深色踢脚；朝东的开口里三层隔板 + 一排卷毛巾的端头（白 / 蓝），转镜头时读得出是毛巾柜。
// 全部合并成 4 个网格，三角形 < 300。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { boxR, type G, meshOf } from './desk/kit';

const W = 0.5;
const D = 4.6;
const H = 1.5;
const KICK = 0.1;
const TOP_T = 0.06;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'back-cabinet';
  const x0 = -W / 2;
  const x1 = W / 2;
  const z0 = -D / 2;
  const z1 = D / 2;

  // 柜身：背板 + 两头侧板 + 底板（开口朝东），横板缝
  const carcass: G[] = [
    boxR(x0, x0 + 0.06, KICK, H - TOP_T, z0, z1),
    boxR(x0, x1, KICK, H - TOP_T, z0, z0 + 0.06),
    boxR(x0, x1, KICK, H - TOP_T, z1 - 0.06, z1),
    boxR(x0, x1, KICK, KICK + 0.05, z0, z1),
  ];
  // 中间两道竖隔板（把 4.6 米分成三段）
  for (const z of [-D / 6, D / 6]) carcass.push(boxR(x0, x1 - 0.02, KICK, H - TOP_T, z - 0.03, z + 0.03));
  root.add(
    meshOf(carcass, ctx.mat('timber', { elem: { kind: 'planks', p: [0, 1, 0, 0.3], seam: 1, hi: 0.5 } }), 'carcass'),
  );
  // 两层隔板 + 顶板（顶板四边伸出 0.03）
  const shelves: G[] = [boxR(x0 - 0.03, x1 + 0.03, H - TOP_T, H, z0 - 0.03, z1 + 0.03)];
  for (const y of [0.55, 1.0]) shelves.push(boxR(x0 + 0.06, x1 - 0.02, y - 0.03, y, z0 + 0.06, z1 - 0.06));
  root.add(meshOf(shelves, ctx.mat('timber'), 'shelves'));
  // 踢脚（缩进 0.04）
  root.add(meshOf([boxR(x0 + 0.04, x1 - 0.04, 0, KICK, z0 + 0.04, z1 - 0.04)], ctx.mat('ironwork'), 'kick'));

  // 卷毛巾：每层一排端头朝东（0.3 米见方的胖块，白 / 蓝交替），只在转镜头时看得见
  const white: G[] = [];
  const blue: G[] = [];
  const rows = [KICK + 0.05, 0.55, 1.0];
  let k = 0;
  for (const y of rows) {
    for (let z = z0 + 0.25; z < z1 - 0.2; z += 0.36) {
      if (Math.abs(z + D / 6) < 0.2 || Math.abs(z - D / 6) < 0.2) continue;
      (k++ % 3 === 1 ? blue : white).push(boxR(x0 + 0.08, x1 - 0.04, y, y + 0.28, z - 0.15, z + 0.15));
    }
  }
  root.add(meshOf(white, ctx.mat('clothWhite'), 'rolls-white'));
  root.add(meshOf(blue, ctx.mat('canvasStripe'), 'rolls-blue'));

  ctx.mats.prepare(root);
  return root;
}
