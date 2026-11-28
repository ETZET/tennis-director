// tease-green：出口外露出的果岭一角（第四轮「让布局说话」）：一块 3.2 × 2.4 米的圆角果岭（puttGreen，边上一圈 puttFringe）
// + 正中插一面小旗（golf-pin 的同款：白杆、红旗）。整座俱乐部只有果岭是"短草圆块 + 小旗"，露一角就认得出。
import * as THREE from 'three';
import type { AssetCtx } from '../ctx';
import { build as pin } from './golf-pin';

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'tease-green';
  const shape = (rx: number, rz: number) => {
    const sh = new THREE.Shape();
    sh.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
    const geo = new THREE.ShapeGeometry(sh, 20);
    geo.rotateX(-Math.PI / 2);
    return geo;
  };
  const fringe = new THREE.Mesh(shape(1.9, 1.45).translate(0, 0.02, 0), ctx.mat('puttFringe', { convex: 0 }));
  fringe.receiveShadow = true;
  g.add(fringe);
  const green = new THREE.Mesh(shape(1.6, 1.2).translate(0, 0.04, 0), ctx.mat('puttGreen', { convex: 0 }));
  green.receiveShadow = true;
  g.add(green);
  const f = pin(ctx);
  f.position.set(0.2, 0.04, -0.1);
  g.add(f);
  return g;
}
