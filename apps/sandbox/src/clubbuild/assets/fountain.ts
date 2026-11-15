// 喷泉（3×3 格，9 × 9 米）：复用 clubplaza 的两层碗西班牙喷泉（palm-fountain：土坯 + 塔拉韦拉蓝花砖的池壁、浅石的碗、
// 自己的水面 shader —— 池底砖缝、帘脚落水圈、小水柱的涟漪、闪光；fountain-spray：溢流帘、顶上水柱、四股小水柱的水珠），
// 两件同一个原点、一起缩到 0.74 倍（池外径 9.36 → 6.9 米），放在一小块陶砖广场上。
// - 广场（画的）：8.8 × 8.8 米的萨尔蒂略陶砖（tile，陶砖元素），四边一圈陶砖压边（cap，高一点 → 一条亮唇）。
// - 四角各一只陶罐 + 龙舌兰（clubdesk 的 pot + clubsite 的 agave，同 clubdesk 的 agave-pot）。
// - 池水、花砖借组调色（gnd-kit 的 proxyCtx：clubplaza 自己的 PROXY + SUN_SKIP 在这里没有，不补的话午后配色把水染成薄荷绿）。
// 会动：水面 shader 跟着 uTime 走；水珠在 fountain-spray 的 userData.update(dt, t) 里摆（main 要像画廊一样 traverse 收 update）。
// userData：setFlow(0..1)（水量：帘子、水珠、涟漪一起变）、setLeaves(n)（水面上的落叶，≥ 3 变暗）—— 两件共用一份（fountain/link.ts）。
// 本地原点 = 占地中心，+z 朝镜头。
import * as THREE from 'three';
import { build as pot } from '../../clubdesk/assets/pot';
import { build as fountainSpray } from '../../clubplaza/assets/fountain-spray';
import { build as palmFountain } from '../../clubplaza/assets/palm-fountain';
import { build as agave } from '../../clubsite/nature/agave';
import { box, quad } from '../../clubsite/render/geo';
import type { AssetCtx } from '../ctx';
import { EL } from '../palette';
import { Bucket, finish, place, proxyCtx, reuse } from './gnd-kit';

const HS = 4.4;
const PAD = 0.05;
const RIM = 0.22;
/** 喷泉缩放（池外径 9.36 米 → 6.9 米） */
const S = 0.74;

export function build(ctx: AssetCtx): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'fountain';
  const own = new THREE.Group();
  root.add(own);
  const B = new Bucket();
  B.add('tile', quad({ x0: -HS + RIM, x1: HS - RIM, z0: -HS + RIM, z1: HS - RIM }, PAD), {
    cast: false,
    extra: { elem: { ...EL.tile, seed: 29, size: [5.4, 3.6] } }, // 美术 r2：陶砖 × 0.6
  });
  const r = (w: number, d: number, x: number, z: number) => B.add('cap', box(w, PAD + 0.05, d, x, 0, z));
  r(HS * 2, RIM, 0, -HS + RIM / 2);
  r(HS * 2, RIM, 0, HS - RIM / 2);
  r(RIM, HS * 2 - 2 * RIM, -HS + RIM / 2, 0);
  r(RIM, HS * 2 - 2 * RIM, HS - RIM / 2, 0);
  B.build(ctx, own, 'fountain:');
  finish(ctx, own);

  // 喷泉本体 + 水（同一个原点、同一个缩放）
  const pctx = proxyCtx(ctx);
  const basin = place(root, reuse(palmFountain, pctx, 0), 0, 0, 0, S, PAD);
  place(root, reuse(fountainSpray, pctx, 0), 0, 0, 0, S, PAD);
  root.userData.setFlow = basin.userData.setFlow;
  root.userData.setLeaves = basin.userData.setLeaves;

  // 四角的陶罐 + 龙舌兰
  const c = HS - 0.75;
  for (const [x, z] of [
    [-c, -c],
    [c, -c],
    [-c, c],
    [c, c],
  ] as const) {
    place(root, reuse(pot, ctx, 0), x, z, 0, 0.9, PAD);
    place(root, reuse(agave, ctx, x * z > 0 ? 0 : 1), x, z, x + z, 0.5, PAD + 0.85 * 0.9);
  }
  return root;
}
