// 白模的调试层：站位（洋红小圆盘）、路线（每 0.9 米一个小点）、总监能走的范围（洋红细框的四角）。
// 只在标签开着时画（?labels=0 的截图里没有）。stage 3 的演出、操控照 layout.ts 的 SPOTS / ROUTES / WALKABLE 做。
import * as THREE from 'three';
import { smoothLine } from '../clubfront/terrain';
import { ROUTES, SPOTS, type V2 } from './layout';
import type { AssetCtx } from './world';

export function buildNav(ctx: AssetCtx, groundAt: (x: number, z: number) => number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'nav';
  const m = ctx.mat('navMark', { noShadowReceive: true });
  const disc = new THREE.CircleGeometry(0.32, 16).rotateX(-Math.PI / 2);
  const dot = new THREE.CircleGeometry(0.09, 6).rotateX(-Math.PI / 2);
  for (const [x, z] of Object.values(SPOTS)) {
    const o = new THREE.Mesh(disc, m);
    o.position.set(x, groundAt(x, z) + 0.05, z);
    g.add(o);
  }
  for (const r of ROUTES) {
    const line: V2[] = smoothLine(r.pts, 0.9);
    for (const [x, z] of line) {
      const o = new THREE.Mesh(dot, m);
      o.position.set(x, Math.max(0, groundAt(x, z)) + 0.04, z);
      g.add(o);
    }
  }
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}
