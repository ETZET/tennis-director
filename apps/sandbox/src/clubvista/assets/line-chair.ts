// 司线员的椅子：一把白漆钢架的矮靠背椅（座 0.46 高）+ 俱乐部蓝的座垫和靠背板。司线员（umpire 人物 sit）坐上去。
// 0.5 × 0.95 × 0.5 米。本地原点 = 落地中心，人朝 +z。小件：不接投影，朝镜头的面 lightUp 落中档。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetCtx } from '../ctx';

const bx = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const FACE = { lightUp: 0.55, bands: [-0.45, 0.3] as [number, number], noShadowReceive: true };

export function build(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'line-chair';
  const white = ctx.mat('clothWhite', { ...FACE, edge: 0.4, convex: 0.4 });
  const blue = ctx.mat('counter', { ...FACE, edge: 0.4, convex: 0.4 });
  const legs: THREE.BufferGeometry[] = [];
  for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) legs.push(bx(0.06, 0.44, 0.06, x, 0.22, z));
  legs.push(bx(0.06, 0.5, 0.06, -0.2, 0.69, -0.2), bx(0.06, 0.5, 0.06, 0.2, 0.69, -0.2));
  const frame = new THREE.Mesh(mergeGeometries(legs.map((x) => x.toNonIndexed())), white);
  frame.castShadow = true;
  const pad = new THREE.Mesh(
    mergeGeometries(
      [bx(0.48, 0.06, 0.46, 0, 0.46, 0), bx(0.46, 0.3, 0.05, 0, 0.78, -0.21)].map((x) => x.toNonIndexed()),
    ),
    blue,
  );
  pad.castShadow = true;
  g.add(frame, pad);
  g.userData.seat = { at: [0, 0.49, 0], foot: [0, 0, 0.3] };
  return g;
}
