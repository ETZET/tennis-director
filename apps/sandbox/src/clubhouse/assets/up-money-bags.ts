// 钱袋（#78，活的信号：各收银台收上来的钱袋堆在总监桌上，等着拎进保险柜；slot 放在桌面 y +0.76）：0.52 × 0.33 × 0.34 米（≈ 5.8 × 3.7 × 3.8 设计纹素）。
// 三只帆布口袋：前面两只并排（袋身 2.6 纹素宽）、后面中间一只高的搭在它们上面。每只 = 麦色帆布的鼓袋身 + 扎口的一圈黄铜色绳
// + 上面一撮散开的袋口；袋身正面一块 1.2 纹素宽的金色标记（钱的记号，没有字）。
// 正面落亮档（帆布在中档发灰）。三角形 144（3 ×（袋身 12 + 绳 12 + 袋口 12 + 标记 12））。没有 userData。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

export function build(ctx: AssetCtx): THREE.Object3D {
  const T = ctx.texel;
  const g = new THREE.Group();
  g.name = 'up-money-bags';
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    new THREE.BoxGeometry(w * T, h * T, d * T).translate(x * T, (y + h / 2) * T, z * T);
  const sack: THREE.BufferGeometry[] = [];
  const tie: THREE.BufferGeometry[] = [];
  const mark: THREE.BufferGeometry[] = [];
  // [x, z, 袋身高]
  const bags: [number, number, number][] = [
    [0.2, -0.7, 2.6],
    [-1.55, 0.5, 1.7],
    [1.55, 0.6, 1.7],
  ];
  for (const [x, z, h] of bags) {
    sack.push(box(2.7, h, 2.4, x, 0, z));
    tie.push(box(1.4, 0.45, 1.4, x, h, z));
    sack.push(box(2, 0.6, 1.8, x, h + 0.45, z));
    mark.push(box(1.2, h - 0.4, 0.2, x, 0.2, z + 1.2));
  }
  const opts = { lightUp: 0.55, noShadowReceive: true, tones: undefined };
  g.add(
    new THREE.Mesh(
      mergeGeometries(sack),
      ctx.mat('canvas', {
        ...opts,
        ramp: [0xf6dc98, 0xd8ac78, 0x8e6c8c],
        bands: [-0.45, -0.1],
        edge: 0.5,
        convex: 0.5,
      }),
    ),
  );
  const gold = ctx.mat('brass', {
    ...opts,
    ramp: [0xf6b83c, 0xd08a30, 0x7a4a52],
    lightUp: 0.9,
    bands: [-0.45, 0.2],
    edge: 0.3,
    convex: 0.3,
  });
  g.add(new THREE.Mesh(mergeGeometries([...tie, ...mark]), gold));
  ctx.mats.prepare(g);
  return g;
}
