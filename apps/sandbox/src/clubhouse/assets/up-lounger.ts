// up-lounger：露台的躺椅（#93，×2）。0.7 × 0.42 × 1.9 米（8 × 5 × 21 设计纹素；0.42 是床面，靠背头抬到 0.78）。长轴 z，头在北（−z）：
// 抬起来的靠背正面朝镜头。
// 白漆木架：两条 1 纹素的边梁（床面下）+ 四条腿；俱乐部蓝的垫子（床面一块 + 靠背一块，斜 35°），垫子比木架窄 1 纹素 → 两边露出白边；
// 脚头横着一卷珊瑚红 / 奶油的毛巾（3 纹素粗的六棱柱），靠背顶上一只奶油色的小枕头。
// 垫子顶面在亮档（L ≈ 150 的蓝），朝镜头的垫子前沿、木架侧面落中档。都不接投影（小件）。
// 材质：clothWhite（木架，换成暖白三档）、clothBlue（垫子）、flowerRed（毛巾，珊瑚）、canvas（枕头）。三角形 ≈ 190。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

type G = THREE.BufferGeometry;
const box = (w: number, h: number, d: number, x: number, y: number, z: number): G =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const W = 0.7;
  const D = 1.9;
  const BED = 0.3; // 木架顶
  const PAD = 0.12; // 垫子厚 → 床面 0.42
  const HINGE = -D / 2 + 0.72; // 靠背的折点（往北是靠背）
  const TILT = (35 * Math.PI) / 180;
  const BL = 0.78; // 靠背长（斜着量）

  const frame: G[] = [];
  const pad: G[] = [];
  // 边梁、腿、头尾横梁
  for (const s of [-1, 1]) {
    frame.push(box(T, T, D, s * (W / 2 - T / 2), BED - T, 0));
    for (const z of [-D / 2 + 0.2, D / 2 - 0.2]) frame.push(box(T, BED - T, T, s * (W / 2 - T / 2), 0, z));
  }
  frame.push(box(W, T, T, 0, BED - T, D / 2 - T / 2));
  // 床面的板（垫子下，露出两边各 1 纹素、脚头 1 纹素）
  frame.push(box(W, 0.03, D - (HINGE + D / 2), 0, BED - 0.03, (HINGE + D / 2) / 2));
  // 靠背板（斜）：绕折点抬起
  const tilt = (g: G) => g.rotateX(TILT).translate(0, BED, HINGE);
  frame.push(tilt(box(W, 0.04, BL, 0, -0.04, -BL / 2)));
  // 靠背的撑杆
  frame.push(box(T, BL * Math.sin(TILT) - 0.05, T, 0, BED - T, HINGE - BL * Math.cos(TILT) + T));

  // 垫子：床面一块 + 靠背一块
  const PW = W - 2 * T;
  const flatLen = D / 2 - HINGE - T;
  pad.push(box(PW, PAD, flatLen, 0, BED, HINGE + flatLen / 2));
  pad.push(tilt(box(PW, PAD, BL - 0.04, 0, 0, -(BL - 0.04) / 2)));

  // 枕头：靠背顶上
  const pillow = tilt(box(PW - T, 0.07, 0.24, 0, PAD, -BL + 0.2));
  // 毛巾卷：脚头横着一卷（六棱柱，轴 x）
  const towel = new THREE.CylinderGeometry(0.13, 0.13, PW, 6, 1)
    .rotateZ(Math.PI / 2)
    .translate(0, BED + PAD + 0.11, D / 2 - 0.38);
  const stripeG = new THREE.CylinderGeometry(0.135, 0.135, 1.5 * T, 6, 1, true)
    .rotateZ(Math.PI / 2)
    .translate(0, BED + PAD + 0.11, D / 2 - 0.38);

  const root = new THREE.Group();
  root.name = 'up-lounger';
  const face = { lightUp: 0.55, bands: [-0.45, 0.35] as [number, number], noShadowReceive: true, convex: 0.3 };
  const add = (g: G | null, m: THREE.Material) => {
    if (g) root.add(new THREE.Mesh(g, m));
  };
  // 白漆木：暖白 → 桃 → 灰紫（L 226 / 178 / 122；和蓝垫子亮档 150 差 < 60 靠中档那一面挨着）
  add(
    mergeGeometries(frame),
    ctx.mat('clothWhite', { ...face, ramp: [0xf2dcc0, 0xd2a8a0, 0x8a6e9c], tones: undefined, edge: 0.4 }),
  );
  add(
    mergeGeometries(pad),
    ctx.mat('clothBlue', { ...face, ramp: [0x3e9af0, 0x3274d0, 0x34489a], tones: undefined, edge: 0.5 }),
  );
  add(pillow, ctx.mat('canvas', { ...face, elem: undefined, edge: 0.4 }));
  add(towel, ctx.mat('flowerRed', { ...face, ramp: [0xf4684c, 0xc8444e, 0x7a2e5e], tones: undefined, edge: 0.4 }));
  add(stripeG, ctx.mat('canvas', { ...face, elem: undefined, edge: 0 }));
  ctx.mats.prepare(root);
  return root;
}
