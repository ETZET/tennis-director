// #9 陶罐（clubdesk.md）：大陶罐，窄底、鼓肚、短颈、卷边口，颈上一道浅箍；罐口里一层土。
// 龙舌兰是复用的资产，单独放在罐口（layout.ts SLOTS 的 agave-pot：y 0.85，s 0.55）→ 这里不带植物。
// 本地原点 = 罐底中心；0.75 × 0.85 × 0.75 米。
// 罐身用球面法线（球心在鼓肚）：亮顶、中腰、暗底三档分开，加陶土斑；口沿和箍用真法线，上沿出一条凸边亮线。
// 罐子本身不投影（太阳在后面，自投影会把朝镜头的半边全压暗），接收别的影子（门柱、蒲葵）；地上的影子由背后一张看不见的剪影卡投。
import type * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { cyl, DT, lathe, noCast, Parts, shadowCard } from './props/kit';

const SEG = 14;
// 罐身剖面 [半径, 高]：窄底 → 鼓肚（y 0.4，半径 0.37）→ 收颈
const BODY: [number, number][] = [
  [0, 0],
  [0.19, 0],
  [0.23, 0.045],
  [0.31, 0.18],
  [0.36, 0.31],
  [0.37, 0.4],
  [0.35, 0.5],
  [0.3, 0.6],
  [0.27, 0.68],
];
// 卷边口：颈 → 往外翻 → 圆唇 → 口里往下到土面
const RIM: [number, number][] = [
  [0.27, 0.7],
  [0.3, 0.73],
  [0.34, 0.765],
  [0.355, 0.81],
  [0.34, 0.85],
  [0.3, 0.855],
  [0.27, 0.83],
  [0.265, 0.75],
];

export function build(ctx: AssetCtx): THREE.Object3D {
  // 罐身：陶土的深浅斑（paint，跟着罐子走），投影里换暗档那三色，斑还在（陶罐常在门柱的影子里）
  const body = ctx.mat('pot', {
    sphereNormals: [0, 0.4, 0],
    lightUp: 0.5,
    bands: [-0.2, 0.4],
    elem: { kind: 'paint', space: 'local', size: [5, 4], density: [0, 0.03], patch: 1 },
  });
  const rim = ctx.mat('pot', { convex: 0.8 });
  const soil = ctx.mat('sandDrift');
  const p = new Parts();
  p.add(body, lathe(BODY, SEG));
  p.add(rim, lathe(RIM, SEG));
  // 颈上的浅箍：比颈粗一圈的矮环（1 纹素高），上沿出凸边亮线
  p.add(rim, cyl(0.335, DT, SEG, 0, 0.6 - DT / 2, 0, 'y', 0.31));
  // 土面（略低于口沿）
  p.add(soil, cyl(0.27, 0.02, SEG, 0, 0.75, 0));
  const root = p.build();
  ctx.mats.prepare(root);
  noCast(root);
  root.add(shadowCard([...BODY, ...RIM.slice(0, 5)], -0.25));
  return root;
}
